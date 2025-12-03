import type { MacAddressMode, PreassocMacMode } from '../types.js';

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
