import { exec } from 'child_process';
import { promisify } from 'util';
import type { Network, SavedNetwork, ConnectionStatus } from '../types.js';

const execAsync = promisify(exec);

export class WpaCli {
  constructor(private iface: string = 'wlan0') {}

  private async run(command: string): Promise<string> {
    const { stdout } = await execAsync(`wpa_cli -i ${this.iface} ${command}`);
    return stdout.trim();
  }

  async scan(): Promise<Network[]> {
    // Initiate scan
    const scanResult = await this.run('scan');
    if (!scanResult.includes('OK')) {
      throw new Error(`Scan failed: ${scanResult}`);
    }

    // Wait for scan to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get results
    const output = await this.run('scan_results');
    const lines = output.split('\n').slice(1); // Skip header

    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split('\t');
        return {
          bssid: parts[0] || '',
          frequency: parseInt(parts[1] || '0', 10),
          signal: parseInt(parts[2] || '0', 10),
          flags: parts[3] || '',
          ssid: parts[4] || '',
        };
      });
  }

  async connect(ssid: string, psk?: string): Promise<void> {
    // Add new network
    const networkIdStr = await this.run('add_network');
    const networkId = parseInt(networkIdStr, 10);

    if (isNaN(networkId)) {
      throw new Error(`Failed to add network: ${networkIdStr}`);
    }

    try {
      // Set SSID
      const ssidResult = await this.run(
        `set_network ${networkId} ssid '"${ssid}"'`
      );
      if (!ssidResult.includes('OK')) {
        throw new Error(`Failed to set SSID: ${ssidResult}`);
      }

      if (psk) {
        // WPA/WPA2 network with password
        const pskResult = await this.run(
          `set_network ${networkId} psk '"${psk}"'`
        );
        if (!pskResult.includes('OK')) {
          throw new Error(`Failed to set PSK: ${pskResult}`);
        }
      } else {
        // Open network
        const keyMgmtResult = await this.run(
          `set_network ${networkId} key_mgmt NONE`
        );
        if (!keyMgmtResult.includes('OK')) {
          throw new Error(`Failed to set key_mgmt: ${keyMgmtResult}`);
        }
      }

      // Enable network
      const enableResult = await this.run(`enable_network ${networkId}`);
      if (!enableResult.includes('OK')) {
        throw new Error(`Failed to enable network: ${enableResult}`);
      }

      // Select this network
      const selectResult = await this.run(`select_network ${networkId}`);
      if (!selectResult.includes('OK')) {
        throw new Error(`Failed to select network: ${selectResult}`);
      }

      // Save config
      await this.run('save_config');
    } catch (error) {
      // Clean up on failure
      await this.run(`remove_network ${networkId}`).catch(() => {});
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const result = await this.run('disconnect');
    if (!result.includes('OK')) {
      throw new Error(`Disconnect failed: ${result}`);
    }
  }

  async reconnect(): Promise<void> {
    const result = await this.run('reconnect');
    if (!result.includes('OK')) {
      throw new Error(`Reconnect failed: ${result}`);
    }
  }

  async status(): Promise<ConnectionStatus> {
    const output = await this.run('status');
    const lines = output.split('\n');
    const status: ConnectionStatus = {
      wpaState: 'UNKNOWN',
    };

    for (const line of lines) {
      const [key, value] = line.split('=');
      if (!key || !value) continue;

      switch (key) {
        case 'wpa_state':
          status.wpaState = value;
          break;
        case 'ssid':
          status.ssid = value;
          break;
        case 'bssid':
          status.bssid = value;
          break;
        case 'ip_address':
          status.ipAddress = value;
          break;
        case 'freq':
          status.frequency = parseInt(value, 10);
          break;
        case 'key_mgmt':
          status.keyManagement = value;
          break;
      }
    }

    return status;
  }

  async listNetworks(): Promise<SavedNetwork[]> {
    const output = await this.run('list_networks');
    const lines = output.split('\n').slice(1); // Skip header

    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split('\t');
        return {
          networkId: parseInt(parts[0] || '0', 10),
          ssid: parts[1] || '',
          bssid: parts[2] || 'any',
          flags: parts[3] || '',
        };
      });
  }

  async removeNetwork(networkId: number): Promise<void> {
    const result = await this.run(`remove_network ${networkId}`);
    if (!result.includes('OK')) {
      throw new Error(`Failed to remove network: ${result}`);
    }
    await this.run('save_config');
  }

  async getInterface(): Promise<string> {
    return this.iface;
  }
}
