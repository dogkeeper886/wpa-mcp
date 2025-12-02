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

  async connectEap(
    ssid: string,
    identity: string,
    password: string,
    eapMethod: string = 'PEAP',
    phase2: string = 'MSCHAPV2'
  ): Promise<void> {
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

      // Set key management to WPA-EAP
      const keyMgmtResult = await this.run(
        `set_network ${networkId} key_mgmt WPA-EAP`
      );
      if (!keyMgmtResult.includes('OK')) {
        throw new Error(`Failed to set key_mgmt: ${keyMgmtResult}`);
      }

      // Set EAP method
      const eapResult = await this.run(
        `set_network ${networkId} eap ${eapMethod}`
      );
      if (!eapResult.includes('OK')) {
        throw new Error(`Failed to set EAP method: ${eapResult}`);
      }

      // Set identity (username)
      const identityResult = await this.run(
        `set_network ${networkId} identity '"${identity}"'`
      );
      if (!identityResult.includes('OK')) {
        throw new Error(`Failed to set identity: ${identityResult}`);
      }

      // Set password
      const passwordResult = await this.run(
        `set_network ${networkId} password '"${password}"'`
      );
      if (!passwordResult.includes('OK')) {
        throw new Error(`Failed to set password: ${passwordResult}`);
      }

      // Set phase2 authentication (for PEAP/TTLS)
      if (eapMethod === 'PEAP' || eapMethod === 'TTLS') {
        const phase2Result = await this.run(
          `set_network ${networkId} phase2 '"auth=${phase2}"'`
        );
        if (!phase2Result.includes('OK')) {
          throw new Error(`Failed to set phase2: ${phase2Result}`);
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

  async waitForState(
    targetState: string,
    timeoutMs: number = 15000,
    pollIntervalMs: number = 500
  ): Promise<{ reached: boolean; status: ConnectionStatus }> {
    const maxAttempts = Math.ceil(timeoutMs / pollIntervalMs);

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.status();
      if (status.wpaState === targetState) {
        return { reached: true, status };
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const finalStatus = await this.status();
    return { reached: finalStatus.wpaState === targetState, status: finalStatus };
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

  async statusVerbose(): Promise<Record<string, string>> {
    const output = await this.run('status verbose');
    const result: Record<string, string> = {};

    for (const line of output.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx);
        const value = line.substring(idx + 1);
        result[key] = value;
      }
    }

    return result;
  }

  async getMib(): Promise<Record<string, string>> {
    const output = await this.run('mib');
    const result: Record<string, string> = {};

    for (const line of output.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx);
        const value = line.substring(idx + 1);
        result[key] = value;
      }
    }

    return result;
  }

  async getEapDiagnostics(): Promise<{
    eapState: string;
    decision: string;
    paeState: string;
    portStatus: string;
    methodState: string;
    eapolFramesRx: number;
    eapolFramesTx: number;
    reqIdFramesRx: number;
    handshakeFailures: number;
  }> {
    const [status, mib] = await Promise.all([
      this.statusVerbose(),
      this.getMib(),
    ]);

    return {
      eapState: status['EAP state'] || 'UNKNOWN',
      decision: status['decision'] || 'UNKNOWN',
      paeState: status['Supplicant PAE state'] || 'UNKNOWN',
      portStatus: status['suppPortStatus'] || mib['dot1xSuppSuppControlledPortStatus'] || 'UNKNOWN',
      methodState: status['methodState'] || 'UNKNOWN',
      eapolFramesRx: parseInt(mib['dot1xSuppEapolFramesRx'] || '0', 10),
      eapolFramesTx: parseInt(mib['dot1xSuppEapolFramesTx'] || '0', 10),
      reqIdFramesRx: parseInt(mib['dot1xSuppEapolReqIdFramesRx'] || '0', 10),
      handshakeFailures: parseInt(mib['dot11RSNA4WayHandshakeFailures'] || '0', 10),
    };
  }
}
