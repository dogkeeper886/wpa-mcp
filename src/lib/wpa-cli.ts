import { exec } from "child_process";
import { promisify } from "util";
import type {
  Network,
  SavedNetwork,
  ConnectionStatus,
  MacAddressConfig,
} from "../types.js";
import { macModeToWpaValue, preassocModeToWpaValue } from "./mac-utils.js";

const execAsync = promisify(exec);

export class WpaCli {
  constructor(private iface: string = "wlan0") {}

  private async run(command: string): Promise<string> {
    const { stdout } = await execAsync(`wpa_cli -i ${this.iface} ${command}`);
    return stdout.trim();
  }

  async scan(timeoutMs: number = 10000): Promise<Network[]> {
    // Check current state - if already scanning, just wait for results
    const currentStatus = await this.status();
    const isScanning = currentStatus.wpaState === "SCANNING";

    if (!isScanning) {
      // Initiate scan
      const scanResult = await this.run("scan");
      if (!scanResult.includes("OK")) {
        throw new Error(`Scan failed: ${scanResult}`);
      }

      // Brief delay for state transition
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Poll for scan results instead of fixed wait
    const { found, output } = await this.waitForScanResults(timeoutMs);

    if (!found) {
      // Return empty array if no results found (not an error, just no networks)
      return [];
    }

    // Parse results
    const lines = output.split("\n").slice(1); // Skip header

    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split("\t");
        return {
          bssid: parts[0] || "",
          frequency: parseInt(parts[1] || "0", 10),
          signal: parseInt(parts[2] || "0", 10),
          flags: parts[3] || "",
          ssid: parts[4] || "",
        };
      });
  }

  /**
   * Scan for networks with retry logic.
   * Useful when wpa_supplicant is in INACTIVE state where first scan may not execute.
   *
   * @param timeoutMs - Timeout per scan attempt (default: 10000ms)
   * @param maxRetries - Number of retry attempts if first scan returns empty (default: 2)
   * @param retryDelayMs - Delay between retries (default: 1000ms)
   * @returns Array of discovered networks
   */
  async scanWithRetry(
    timeoutMs: number = 10000,
    maxRetries: number = 2,
    retryDelayMs: number = 1000,
  ): Promise<Network[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const networks = await this.scan(timeoutMs);

        // If we got results, return them
        if (networks.length > 0) {
          return networks;
        }

        // Empty results - retry if we have attempts left
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next attempt
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    // If we had an error on the last attempt, throw it
    if (lastError) {
      throw lastError;
    }

    // All attempts returned empty results
    return [];
  }

  async connect(
    ssid: string,
    psk?: string,
    macConfig?: MacAddressConfig,
  ): Promise<void> {
    // Add new network
    const networkIdStr = await this.run("add_network");
    const networkId = parseInt(networkIdStr, 10);

    if (isNaN(networkId)) {
      throw new Error(`Failed to add network: ${networkIdStr}`);
    }

    try {
      // Set SSID
      const ssidResult = await this.run(
        `set_network ${networkId} ssid '"${ssid}"'`,
      );
      if (!ssidResult.includes("OK")) {
        throw new Error(`Failed to set SSID: ${ssidResult}`);
      }

      if (psk) {
        // WPA/WPA2 network with password
        const pskResult = await this.run(
          `set_network ${networkId} psk '"${psk}"'`,
        );
        if (!pskResult.includes("OK")) {
          throw new Error(`Failed to set PSK: ${pskResult}`);
        }
      } else {
        // Open network
        const keyMgmtResult = await this.run(
          `set_network ${networkId} key_mgmt NONE`,
        );
        if (!keyMgmtResult.includes("OK")) {
          throw new Error(`Failed to set key_mgmt: ${keyMgmtResult}`);
        }
      }

      // Apply MAC address configuration if provided
      if (macConfig) {
        await this.applyMacConfig(networkId, macConfig);
      }

      // Enable network
      const enableResult = await this.run(`enable_network ${networkId}`);
      if (!enableResult.includes("OK")) {
        throw new Error(`Failed to enable network: ${enableResult}`);
      }

      // Select this network
      const selectResult = await this.run(`select_network ${networkId}`);
      if (!selectResult.includes("OK")) {
        throw new Error(`Failed to select network: ${selectResult}`);
      }

      // Save config
      await this.run("save_config");
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
    eapMethod: string = "PEAP",
    phase2: string = "MSCHAPV2",
    macConfig?: MacAddressConfig,
  ): Promise<void> {
    // Add new network
    const networkIdStr = await this.run("add_network");
    const networkId = parseInt(networkIdStr, 10);

    if (isNaN(networkId)) {
      throw new Error(`Failed to add network: ${networkIdStr}`);
    }

    try {
      // Set SSID
      const ssidResult = await this.run(
        `set_network ${networkId} ssid '"${ssid}"'`,
      );
      if (!ssidResult.includes("OK")) {
        throw new Error(`Failed to set SSID: ${ssidResult}`);
      }

      // Set key management to WPA-EAP
      const keyMgmtResult = await this.run(
        `set_network ${networkId} key_mgmt WPA-EAP`,
      );
      if (!keyMgmtResult.includes("OK")) {
        throw new Error(`Failed to set key_mgmt: ${keyMgmtResult}`);
      }

      // Set EAP method
      const eapResult = await this.run(
        `set_network ${networkId} eap ${eapMethod}`,
      );
      if (!eapResult.includes("OK")) {
        throw new Error(`Failed to set EAP method: ${eapResult}`);
      }

      // Set identity (username)
      const identityResult = await this.run(
        `set_network ${networkId} identity '"${identity}"'`,
      );
      if (!identityResult.includes("OK")) {
        throw new Error(`Failed to set identity: ${identityResult}`);
      }

      // Set password
      const passwordResult = await this.run(
        `set_network ${networkId} password '"${password}"'`,
      );
      if (!passwordResult.includes("OK")) {
        throw new Error(`Failed to set password: ${passwordResult}`);
      }

      // Set phase2 authentication (for PEAP/TTLS)
      if (eapMethod === "PEAP" || eapMethod === "TTLS") {
        const phase2Result = await this.run(
          `set_network ${networkId} phase2 '"auth=${phase2}"'`,
        );
        if (!phase2Result.includes("OK")) {
          throw new Error(`Failed to set phase2: ${phase2Result}`);
        }
      }

      // Apply MAC address configuration if provided
      if (macConfig) {
        await this.applyMacConfig(networkId, macConfig);
      }

      // Enable network
      const enableResult = await this.run(`enable_network ${networkId}`);
      if (!enableResult.includes("OK")) {
        throw new Error(`Failed to enable network: ${enableResult}`);
      }

      // Select this network
      const selectResult = await this.run(`select_network ${networkId}`);
      if (!selectResult.includes("OK")) {
        throw new Error(`Failed to select network: ${selectResult}`);
      }

      // Save config
      await this.run("save_config");
    } catch (error) {
      // Clean up on failure
      await this.run(`remove_network ${networkId}`).catch(() => {});
      throw error;
    }
  }

  private async applyMacConfig(
    networkId: number,
    config: MacAddressConfig,
  ): Promise<void> {
    // Set mac_addr parameter
    const macValue = macModeToWpaValue(config.mode, config.address);
    const macResult = await this.run(
      `set_network ${networkId} mac_addr ${macValue}`,
    );
    if (!macResult.includes("OK")) {
      throw new Error(`Failed to set mac_addr: ${macResult}`);
    }

    // Set preassoc_mac_addr if specified
    if (config.preassocMode) {
      const preassocValue = preassocModeToWpaValue(config.preassocMode);
      const preassocResult = await this.run(
        `set_network ${networkId} preassoc_mac_addr ${preassocValue}`,
      );
      if (!preassocResult.includes("OK")) {
        throw new Error(`Failed to set preassoc_mac_addr: ${preassocResult}`);
      }
    }

    // Set rand_addr_lifetime if specified (only relevant for random modes)
    if (
      config.randAddrLifetime !== undefined &&
      (config.mode === "random" || config.mode === "persistent-random")
    ) {
      const lifetimeResult = await this.run(
        `set_network ${networkId} rand_addr_lifetime ${config.randAddrLifetime}`,
      );
      if (!lifetimeResult.includes("OK")) {
        throw new Error(`Failed to set rand_addr_lifetime: ${lifetimeResult}`);
      }
    }
  }

  async disconnect(): Promise<void> {
    const result = await this.run("disconnect");
    if (!result.includes("OK")) {
      throw new Error(`Disconnect failed: ${result}`);
    }
  }

  async reconnect(): Promise<void> {
    const result = await this.run("reconnect");
    if (!result.includes("OK")) {
      throw new Error(`Reconnect failed: ${result}`);
    }
  }

  async status(): Promise<ConnectionStatus> {
    const output = await this.run("status");
    const lines = output.split("\n");
    const status: ConnectionStatus = {
      wpaState: "UNKNOWN",
    };

    for (const line of lines) {
      const [key, value] = line.split("=");
      if (!key || !value) continue;

      switch (key) {
        case "wpa_state":
          status.wpaState = value;
          break;
        case "ssid":
          status.ssid = value;
          break;
        case "bssid":
          status.bssid = value;
          break;
        case "ip_address":
          status.ipAddress = value;
          break;
        case "freq":
          status.frequency = parseInt(value, 10);
          break;
        case "key_mgmt":
          status.keyManagement = value;
          break;
        case "address":
          status.address = value;
          break;
      }
    }

    return status;
  }

  async waitForState(
    targetState: string,
    timeoutMs: number = 15000,
    pollIntervalMs: number = 500,
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
    return {
      reached: finalStatus.wpaState === targetState,
      status: finalStatus,
    };
  }

  /**
   * Wait for scan results to become available.
   * Polls scan_results until non-empty or timeout.
   *
   * @param timeoutMs - Maximum time to wait (default: 10000ms)
   * @param pollIntervalMs - Time between polls (default: 500ms)
   * @returns Object with found flag and raw scan_results output
   */
  async waitForScanResults(
    timeoutMs: number = 10000,
    pollIntervalMs: number = 500,
  ): Promise<{ found: boolean; output: string }> {
    const maxAttempts = Math.ceil(timeoutMs / pollIntervalMs);

    for (let i = 0; i < maxAttempts; i++) {
      const output = await this.run("scan_results");
      const lines = output.split("\n").slice(1); // Skip header
      const hasResults = lines.some((line) => line.trim().length > 0);

      if (hasResults) {
        return { found: true, output };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Final check
    const output = await this.run("scan_results");
    const lines = output.split("\n").slice(1);
    const hasResults = lines.some((line) => line.trim().length > 0);

    return { found: hasResults, output };
  }

  async listNetworks(): Promise<SavedNetwork[]> {
    const output = await this.run("list_networks");
    const lines = output.split("\n").slice(1); // Skip header

    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split("\t");
        return {
          networkId: parseInt(parts[0] || "0", 10),
          ssid: parts[1] || "",
          bssid: parts[2] || "any",
          flags: parts[3] || "",
        };
      });
  }

  async removeNetwork(networkId: number): Promise<void> {
    const result = await this.run(`remove_network ${networkId}`);
    if (!result.includes("OK")) {
      throw new Error(`Failed to remove network: ${result}`);
    }
    await this.run("save_config");
  }

  async getInterface(): Promise<string> {
    return this.iface;
  }

  async statusVerbose(): Promise<Record<string, string>> {
    const output = await this.run("status verbose");
    const result: Record<string, string> = {};

    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.substring(0, idx);
        const value = line.substring(idx + 1);
        result[key] = value;
      }
    }

    return result;
  }

  async getMib(): Promise<Record<string, string>> {
    const output = await this.run("mib");
    const result: Record<string, string> = {};

    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.substring(0, idx);
        const value = line.substring(idx + 1);
        result[key] = value;
      }
    }

    return result;
  }

  async connectTls(
    ssid: string,
    identity: string,
    clientCertPath: string,
    privateKeyPath: string,
    caCertPath?: string,
    privateKeyPassword?: string,
    macConfig?: MacAddressConfig,
  ): Promise<void> {
    const networkIdStr = await this.run("add_network");
    const networkId = parseInt(networkIdStr, 10);

    if (isNaN(networkId)) {
      throw new Error(`Failed to add network: ${networkIdStr}`);
    }

    try {
      // Set SSID
      const ssidResult = await this.run(
        `set_network ${networkId} ssid '"${ssid}"'`,
      );
      if (!ssidResult.includes("OK")) {
        throw new Error(`Failed to set SSID: ${ssidResult}`);
      }

      // Set key management to WPA-EAP
      const keyMgmtResult = await this.run(
        `set_network ${networkId} key_mgmt WPA-EAP`,
      );
      if (!keyMgmtResult.includes("OK")) {
        throw new Error(`Failed to set key_mgmt: ${keyMgmtResult}`);
      }

      // Set EAP method to TLS
      const eapResult = await this.run(`set_network ${networkId} eap TLS`);
      if (!eapResult.includes("OK")) {
        throw new Error(`Failed to set EAP method: ${eapResult}`);
      }

      // Set identity
      const identityResult = await this.run(
        `set_network ${networkId} identity '"${identity}"'`,
      );
      if (!identityResult.includes("OK")) {
        throw new Error(`Failed to set identity: ${identityResult}`);
      }

      // Set client certificate
      const clientCertResult = await this.run(
        `set_network ${networkId} client_cert '"${clientCertPath}"'`,
      );
      if (!clientCertResult.includes("OK")) {
        throw new Error(`Failed to set client_cert: ${clientCertResult}`);
      }

      // Set private key
      const privateKeyResult = await this.run(
        `set_network ${networkId} private_key '"${privateKeyPath}"'`,
      );
      if (!privateKeyResult.includes("OK")) {
        throw new Error(`Failed to set private_key: ${privateKeyResult}`);
      }

      // Set CA certificate (optional - if not provided, server cert is not validated)
      if (caCertPath) {
        const caCertResult = await this.run(
          `set_network ${networkId} ca_cert '"${caCertPath}"'`,
        );
        if (!caCertResult.includes("OK")) {
          throw new Error(`Failed to set ca_cert: ${caCertResult}`);
        }
      }

      // Set private key password if provided
      if (privateKeyPassword) {
        const passwordResult = await this.run(
          `set_network ${networkId} private_key_passwd '"${privateKeyPassword}"'`,
        );
        if (!passwordResult.includes("OK")) {
          throw new Error(
            `Failed to set private_key_passwd: ${passwordResult}`,
          );
        }
      }

      // Apply MAC address configuration if provided
      if (macConfig) {
        await this.applyMacConfig(networkId, macConfig);
      }

      // Enable network
      const enableResult = await this.run(`enable_network ${networkId}`);
      if (!enableResult.includes("OK")) {
        throw new Error(`Failed to enable network: ${enableResult}`);
      }

      // Select this network
      const selectResult = await this.run(`select_network ${networkId}`);
      if (!selectResult.includes("OK")) {
        throw new Error(`Failed to select network: ${selectResult}`);
      }

      // Save config
      await this.run("save_config");
    } catch (error) {
      // Clean up on failure
      await this.run(`remove_network ${networkId}`).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`EAP-TLS connection to ${ssid} failed: ${message}`);
    }
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
      eapState: status["EAP state"] || "UNKNOWN",
      decision: status["decision"] || "UNKNOWN",
      paeState: status["Supplicant PAE state"] || "UNKNOWN",
      portStatus:
        status["suppPortStatus"] ||
        mib["dot1xSuppSuppControlledPortStatus"] ||
        "UNKNOWN",
      methodState: status["methodState"] || "UNKNOWN",
      eapolFramesRx: parseInt(mib["dot1xSuppEapolFramesRx"] || "0", 10),
      eapolFramesTx: parseInt(mib["dot1xSuppEapolFramesTx"] || "0", 10),
      reqIdFramesRx: parseInt(mib["dot1xSuppEapolReqIdFramesRx"] || "0", 10),
      handshakeFailures: parseInt(
        mib["dot11RSNA4WayHandshakeFailures"] || "0",
        10,
      ),
    };
  }

  // ========================================
  // Hotspot 2.0 (HS20) Methods
  // ========================================

  /**
   * Add a new credential for HS20/Passpoint.
   * Returns the credential ID assigned by wpa_supplicant.
   */
  async addCred(): Promise<number> {
    const result = await this.run("add_cred");
    const credId = parseInt(result, 10);

    if (isNaN(credId)) {
      throw new Error(`Failed to add credential: ${result}`);
    }

    return credId;
  }

  /**
   * Set a credential parameter.
   * @param credId - Credential ID from addCred()
   * @param param - Parameter name (e.g., 'realm', 'domain', 'eap')
   * @param value - Parameter value
   */
  async setCred(credId: number, param: string, value: string): Promise<void> {
    const result = await this.run(`set_cred ${credId} ${param} ${value}`);
    if (!result.includes("OK")) {
      throw new Error(`Failed to set credential ${param}: ${result}`);
    }
  }

  /**
   * Remove a credential.
   * @param credId - Credential ID to remove
   */
  async removeCred(credId: number): Promise<void> {
    const result = await this.run(`remove_cred ${credId}`);
    if (!result.includes("OK")) {
      throw new Error(`Failed to remove credential: ${result}`);
    }
  }

  /**
   * Trigger interworking (ANQP) network selection.
   * @param auto - If true, automatically connect to matching network
   */
  async interworkingSelect(auto: boolean = true): Promise<void> {
    const command = auto ? "interworking_select auto" : "interworking_select";
    const result = await this.run(command);
    if (!result.includes("OK")) {
      throw new Error(`Interworking select failed: ${result}`);
    }
  }

  /**
   * Connect to a Hotspot 2.0 (Passpoint) network using EAP-TLS credentials.
   * Uses ANQP to discover and connect to matching networks.
   *
   * @param realm - Home realm for NAI matching (e.g., "corp.example.com")
   * @param domain - Home domain for domain list matching (e.g., "example.com")
   * @param identity - User identity (e.g., "user@example.com")
   * @param clientCertPath - Path to client certificate file
   * @param privateKeyPath - Path to private key file
   * @param caCertPath - Path to CA certificate file (optional)
   * @param privateKeyPassword - Password for encrypted private key (optional)
   * @param priority - Selection priority when multiple networks match (optional)
   */
  async connectHs20(
    realm: string,
    domain: string,
    identity: string,
    clientCertPath: string,
    privateKeyPath: string,
    caCertPath?: string,
    privateKeyPassword?: string,
    priority?: number,
  ): Promise<void> {
    const credId = await this.addCred();

    try {
      // Set realm (quoted string - use single quotes to pass double quotes through shell)
      await this.setCred(credId, "realm", `'"${realm}"'`);

      // Set domain (quoted string)
      await this.setCred(credId, "domain", `'"${domain}"'`);

      // Set EAP method to TLS
      await this.setCred(credId, "eap", "TLS");

      // Set identity (quoted string)
      await this.setCred(credId, "username", `'"${identity}"'`);

      // Set client certificate (quoted path)
      await this.setCred(credId, "client_cert", `'"${clientCertPath}"'`);

      // Set private key (quoted path)
      await this.setCred(credId, "private_key", `'"${privateKeyPath}"'`);

      // Set CA certificate if provided (quoted path)
      if (caCertPath) {
        await this.setCred(credId, "ca_cert", `'"${caCertPath}"'`);
      }

      // Set private key password if provided (quoted string)
      if (privateKeyPassword) {
        await this.setCred(
          credId,
          "private_key_passwd",
          `'"${privateKeyPassword}"'`,
        );
      }

      // Set priority if provided
      if (priority !== undefined) {
        await this.setCred(credId, "priority", String(priority));
      }

      // Trigger ANQP discovery and auto-connect
      await this.interworkingSelect(true);
    } catch (error) {
      // Clean up on failure (same pattern as connectTls)
      await this.removeCred(credId).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`HS20 connection failed: ${message}`);
    }
  }
}
