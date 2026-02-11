import type { MacAddressMode, PreassocMacMode } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

// MAC address validation regex (aa:bb:cc:dd:ee:ff format)
const MAC_REGEX = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

/**
 * Validates a MAC address string format
 */
export function isValidMacAddress(mac: string): boolean {
  return MAC_REGEX.test(mac);
}

/**
 * Normalizes MAC address to lowercase with colons
 */
export function normalizeMacAddress(mac: string): string {
  return mac.toLowerCase();
}

/**
 * Converts MacAddressMode to wpa_supplicant mac_addr value
 *
 * wpa_supplicant mac_addr values:
 * - 0: Use real device MAC
 * - 1: Random MAC for each connection
 * - 2: Persistent random MAC (same across reboots)
 * - <mac>: Specific MAC address
 */
export function macModeToWpaValue(
  mode: MacAddressMode,
  address?: string
): string {
  switch (mode) {
    case 'device':
      return '0';
    case 'random':
      return '1';
    case 'persistent-random':
      return '2';
    case 'specific':
      if (!address) {
        throw new Error('MAC address required when mode is "specific"');
      }
      if (!isValidMacAddress(address)) {
        throw new Error(`Invalid MAC address format: ${address}. Expected format: aa:bb:cc:dd:ee:ff`);
      }
      return normalizeMacAddress(address);
    default:
      return '0';
  }
}

/**
 * Converts PreassocMacMode to wpa_supplicant preassoc_mac_addr value
 *
 * wpa_supplicant preassoc_mac_addr values:
 * - 0: Disabled (use real MAC during scan)
 * - 1: Random MAC during scanning
 * - 2: Persistent random MAC during scanning
 */
export function preassocModeToWpaValue(mode: PreassocMacMode): string {
  switch (mode) {
    case 'disabled':
      return '0';
    case 'random':
      return '1';
    case 'persistent-random':
      return '2';
    default:
      return '0';
  }
}

/**
 * Result type for global MAC configuration values.
 * Used when writing MAC settings to wpa_supplicant.conf.
 */
export interface GlobalMacConfig {
  macAddr: string;           // 0=device, 1=random, 2=persistent, 3=specific
  macValue?: string;         // Only set when macAddr='3' (specific)
  preassocMacAddr?: string;  // 0=disabled, 1=random, 2=persistent
  randAddrLifetime?: number; // Seconds before MAC rotation
}

/**
 * Converts MacAddressMode to wpa_supplicant global config values.
 *
 * For global config, MAC settings use numeric values:
 * - mac_addr=0: Use real device MAC
 * - mac_addr=1: Random MAC for each connection
 * - mac_addr=2: Persistent random MAC (same across reboots)
 * - mac_addr=3: Specific MAC (requires mac_value=aa:bb:cc:dd:ee:ff)
 *
 * @param mode - MAC address mode
 * @param address - Specific MAC address (required when mode is 'specific')
 * @param preassocMode - MAC mode during scanning
 * @param randAddrLifetime - Seconds before rotating random MAC
 */
export function macModeToGlobalWpaValue(
  mode: MacAddressMode,
  address?: string,
  preassocMode?: PreassocMacMode,
  randAddrLifetime?: number
): GlobalMacConfig {
  const result: GlobalMacConfig = { macAddr: '0' };

  switch (mode) {
    case 'device':
      result.macAddr = '0';
      break;
    case 'random':
      result.macAddr = '1';
      break;
    case 'persistent-random':
      result.macAddr = '2';
      break;
    case 'specific':
      if (!address) {
        throw new Error('MAC address required when mode is "specific"');
      }
      if (!isValidMacAddress(address)) {
        throw new Error(`Invalid MAC address format: ${address}. Expected format: aa:bb:cc:dd:ee:ff`);
      }
      result.macAddr = '3';
      result.macValue = normalizeMacAddress(address);
      break;
  }

  if (preassocMode) {
    result.preassocMacAddr = preassocModeToWpaValue(preassocMode);
  }

  if (randAddrLifetime !== undefined) {
    result.randAddrLifetime = randAddrLifetime;
  }

  return result;
}

/**
 * Reads the current MAC address of a network interface from sysfs.
 */
export async function readInterfaceMac(iface: string): Promise<string> {
  const path = `/sys/class/net/${iface}/address`;
  const mac = (await readFile(path, 'utf-8')).trim().toLowerCase();
  if (!isValidMacAddress(mac)) {
    throw new Error(`Invalid MAC read from ${path}: ${mac}`);
  }
  return mac;
}

/**
 * Reads the permanent (hardware) MAC address of a network interface.
 * Parses `permaddr` from `ip link show <iface>`. Falls back to the
 * current interface MAC if permaddr is not available (e.g., virtual interfaces).
 */
export async function readPermanentMac(iface: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`ip link show ${iface}`);
    const match = stdout.match(/permaddr\s+([0-9a-fA-F:]{17})/);
    if (match) {
      const mac = match[1].toLowerCase();
      if (isValidMacAddress(mac)) {
        return mac;
      }
    }
  } catch {
    // permaddr not available, fall back to current MAC
  }
  return readInterfaceMac(iface);
}

/**
 * Sets the MAC address on a network interface using `ip link set`.
 * Brings the interface down, sets the address, then brings it back up.
 * On failure, ensures the interface is brought back up.
 */
export async function setInterfaceMac(iface: string, mac: string): Promise<void> {
  if (!isValidMacAddress(mac)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }

  try {
    await execAsync(`sudo ip link set ${iface} down`);
    await execAsync(`sudo ip link set ${iface} address ${mac}`);
    await execAsync(`sudo ip link set ${iface} up`);
    console.log(`Set ${iface} MAC to ${mac}`);
  } catch (error) {
    // Ensure interface is brought back up even if address change fails
    try {
      await execAsync(`sudo ip link set ${iface} up`);
    } catch {
      // Best effort to restore interface
    }
    throw new Error(`Failed to set MAC on ${iface}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
