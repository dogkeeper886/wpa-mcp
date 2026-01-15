import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WpaCli } from "../lib/wpa-cli.js";
import { WpaDaemon, LogFilter } from "../lib/wpa-daemon.js";
import { DhcpManager } from "../lib/dhcp-manager.js";
import { WpaConfig } from "../lib/wpa-config.js";
import { credentialStore } from "../lib/credential-store.js";
import type {
  MacAddressConfig,
  MacAddressMode,
  PreassocMacMode,
} from "../types.js";

const DEFAULT_INTERFACE = process.env.WIFI_INTERFACE || "wlan0";

export function registerWifiTools(
  server: McpServer,
  daemon?: WpaDaemon,
  dhcpManager?: DhcpManager,
  wpaConfig?: WpaConfig,
): void {
  // wifi_scan - Scan for available networks
  server.tool(
    "wifi_scan",
    "Scan for available WiFi networks. Returns list of nearby networks with SSID, BSSID, signal strength, and security type (WPA-PSK, WPA-EAP, etc.).",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
      timeout: z
        .number()
        .optional()
        .describe(
          "Scan timeout in milliseconds (default: 10000). Increase for slow environments.",
        ),
      retry: z
        .boolean()
        .optional()
        .describe(
          "Enable retry logic for robust scanning (default: false). " +
            "Useful when wpa_supplicant is in INACTIVE state where first scan may return empty.",
        ),
    },
    async ({ interface: iface, timeout, retry }) => {
      try {
        daemon?.markCommandStart();
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const scanTimeout = timeout || 10000;

        const networks = retry
          ? await wpa.scanWithRetry(scanTimeout)
          : await wpa.scan(scanTimeout);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  networks: networks,
                  count: networks.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_connect - Connect to a network
  server.tool(
    "wifi_connect",
    "Connect to a WPA-PSK or open WiFi network. Supports MAC address randomization for privacy. For WPA2-Enterprise/802.1X networks (like corporate WiFi requiring username/password), use wifi_connect_eap instead. Returns connection status after 5 second wait.",
    {
      ssid: z.string().describe("Network SSID to connect to"),
      password: z
        .string()
        .optional()
        .describe("Network password (omit for open networks)"),
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
      mac_mode: z
        .enum(["device", "random", "persistent-random", "specific"])
        .optional()
        .describe(
          "MAC address mode: device (real MAC), random (new each connection), " +
            "persistent-random (same random across reboots), specific (custom MAC)",
        ),
      mac_address: z
        .string()
        .optional()
        .describe(
          'Specific MAC address to use (required when mac_mode is "specific"). ' +
            "Format: aa:bb:cc:dd:ee:ff",
        ),
      preassoc_mac_mode: z
        .enum(["disabled", "random", "persistent-random"])
        .optional()
        .describe(
          "MAC randomization during scanning: disabled (real MAC), random, " +
            "or persistent-random",
        ),
      rand_addr_lifetime: z
        .number()
        .optional()
        .describe(
          "Seconds before rotating random MAC address (default: 60). " +
            "Only applies when mac_mode is random or persistent-random.",
        ),
    },
    async ({
      ssid,
      password,
      interface: iface,
      mac_mode,
      mac_address,
      preassoc_mac_mode,
      rand_addr_lifetime,
    }) => {
      try {
        // Clear HS20 config if active (switching from HS20 to direct connection)
        if (wpaConfig && (await wpaConfig.isHs20Active())) {
          await wpaConfig.clearHs20Credentials();
          if (daemon) {
            await daemon.restart();
          }
        }

        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);

        // Build MAC config if any MAC parameters provided
        let macConfig: MacAddressConfig | undefined;
        if (mac_mode) {
          macConfig = {
            mode: mac_mode as MacAddressMode,
            address: mac_address,
            preassocMode: preassoc_mac_mode as PreassocMacMode | undefined,
            randAddrLifetime: rand_addr_lifetime,
          };
        }

        await wpa.connect(ssid, password, macConfig);

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState("COMPLETED", 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface, macConfig?.mode);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Connected to ${ssid}`,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? "obtained" : "timeout",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? `Connected to ${ssid}`
                    : `Connecting to ${ssid} (connection timeout)`,
                  status: status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_connect_eap - Connect to a WPA2-Enterprise (802.1X) network
  server.tool(
    "wifi_connect_eap",
    'Connect to a WPA2-Enterprise (802.1X) WiFi network using EAP authentication. Supports MAC address randomization for privacy. Used for corporate/enterprise networks requiring username and password (not just a shared password). Common EAP methods: PEAP (most common, tunneled authentication), TTLS (similar to PEAP), TLS (certificate-based). If connection fails, use wifi_get_debug_logs with filter="eap" to diagnose.',
    {
      ssid: z.string().describe("Network SSID to connect to"),
      identity: z.string().describe("Username/identity for EAP authentication"),
      password: z.string().describe("Password for EAP authentication"),
      eap_method: z
        .string()
        .optional()
        .describe("EAP method: PEAP, TTLS, TLS (default: PEAP)"),
      phase2: z
        .string()
        .optional()
        .describe(
          "Phase2 authentication: MSCHAPV2, PAP, GTC (default: MSCHAPV2)",
        ),
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
      mac_mode: z
        .enum(["device", "random", "persistent-random", "specific"])
        .optional()
        .describe(
          "MAC address mode: device (real MAC), random (new each connection), " +
            "persistent-random (same random across reboots), specific (custom MAC)",
        ),
      mac_address: z
        .string()
        .optional()
        .describe(
          'Specific MAC address to use (required when mac_mode is "specific"). ' +
            "Format: aa:bb:cc:dd:ee:ff",
        ),
      preassoc_mac_mode: z
        .enum(["disabled", "random", "persistent-random"])
        .optional()
        .describe(
          "MAC randomization during scanning: disabled (real MAC), random, " +
            "or persistent-random",
        ),
      rand_addr_lifetime: z
        .number()
        .optional()
        .describe(
          "Seconds before rotating random MAC address (default: 60). " +
            "Only applies when mac_mode is random or persistent-random.",
        ),
    },
    async ({
      ssid,
      identity,
      password,
      eap_method,
      phase2,
      interface: iface,
      mac_mode,
      mac_address,
      preassoc_mac_mode,
      rand_addr_lifetime,
    }) => {
      try {
        // Clear HS20 config if active (switching from HS20 to direct connection)
        if (wpaConfig && (await wpaConfig.isHs20Active())) {
          await wpaConfig.clearHs20Credentials();
          if (daemon) {
            await daemon.restart();
          }
        }

        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);

        // Build MAC config if any MAC parameters provided
        let macConfig: MacAddressConfig | undefined;
        if (mac_mode) {
          macConfig = {
            mode: mac_mode as MacAddressMode,
            address: mac_address,
            preassocMode: preassoc_mac_mode as PreassocMacMode | undefined,
            randAddrLifetime: rand_addr_lifetime,
          };
        }

        await wpa.connectEap(
          ssid,
          identity,
          password,
          eap_method || "PEAP",
          phase2 || "MSCHAPV2",
          macConfig,
        );

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState("COMPLETED", 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface, macConfig?.mode);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Connected to ${ssid} using EAP-${eap_method || "PEAP"}`,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? "obtained" : "timeout",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? `Connected to ${ssid} using EAP-${eap_method || "PEAP"}`
                    : `Connecting to ${ssid} (connection timeout)`,
                  status: status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_disconnect - Disconnect from current network
  server.tool(
    "wifi_disconnect",
    "Disconnect from the current WiFi network. Use before connecting to a different network or to troubleshoot connection issues.",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);

        // Stop DHCP and flush IP first
        if (dhcpManager) {
          await dhcpManager.stop();
        }

        await wpa.disconnect();

        // Clear HS20 config if active
        let hs20Cleared = false;
        if (wpaConfig && (await wpaConfig.isHs20Active())) {
          await wpaConfig.clearHs20Credentials();
          hs20Cleared = true;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Disconnected from WiFi",
                dhcpReleased: true,
                ipFlushed: true,
                hs20Cleared,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_status - Get current connection status
  server.tool(
    "wifi_status",
    "Get current WiFi connection status. Returns: wpa_state (COMPLETED=connected, DISCONNECTED, SCANNING, etc.), ssid (network name), bssid (access point MAC), ip_address, key_mgmt (security type), and for EAP networks: eap_state, EAP_method, identity.",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const status = await wpa.status();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  status: status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_list_networks - List saved networks
  server.tool(
    "wifi_list_networks",
    "List saved/configured WiFi networks in wpa_supplicant. Returns network_id (used for wifi_forget), ssid, bssid, and flags (CURRENT=connected, DISABLED, TEMP-DISABLED=authentication failed).",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const networks = await wpa.listNetworks();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  savedNetworks: networks,
                  count: networks.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_forget - Remove a saved network
  server.tool(
    "wifi_forget",
    "Remove/forget a saved WiFi network from wpa_supplicant configuration. Use wifi_list_networks first to get the network_id. Useful for removing networks with wrong credentials before re-adding.",
    {
      network_id: z
        .number()
        .describe("Network ID to remove (from list_networks)"),
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ network_id, interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        await wpa.removeNetwork(network_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Network ${network_id} removed`,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_reconnect - Reconnect to the current network
  server.tool(
    "wifi_reconnect",
    "Reconnect to the current or most recently used WiFi network. Useful after temporary disconnection or to retry authentication. Different from wifi_connect - does not require SSID/password as it uses saved configuration.",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);
        await wpa.reconnect();

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState("COMPLETED", 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Reconnected to WiFi",
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? "obtained" : "timeout",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? "Reconnected to WiFi"
                    : "Reconnecting to WiFi (connection timeout)",
                  status: status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_connect_tls - Connect using EAP-TLS certificate authentication
  server.tool(
    "wifi_connect_tls",
    "Connect to a WPA2-Enterprise network using EAP-TLS certificate authentication. " +
      "Pass certificate contents as PEM strings. More secure than password-based methods - " +
      "no password transmitted. Requires client certificate, private key, and CA certificate.",
    {
      ssid: z.string().describe("Network SSID to connect to"),
      credential_id: z
        .string()
        .optional()
        .describe(
          "Reference to stored credential (from credential_store). " +
            "If provided, uses stored certs instead of path parameters.",
        ),
      identity: z
        .string()
        .optional()
        .describe(
          "Identity (typically CN from client certificate). Required if credential_id not provided.",
        ),
      client_cert_path: z
        .string()
        .optional()
        .describe(
          "Path to client certificate file. Required if credential_id not provided.",
        ),
      private_key_path: z
        .string()
        .optional()
        .describe(
          "Path to private key file. Required if credential_id not provided.",
        ),
      ca_cert_path: z
        .string()
        .optional()
        .describe(
          "Path to CA certificate for server validation. If omitted, server certificate is not verified (insecure, for testing only).",
        ),
      private_key_password: z
        .string()
        .optional()
        .describe("Passphrase for encrypted private key"),
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
      mac_mode: z
        .enum(["device", "random", "persistent-random", "specific"])
        .optional()
        .describe(
          "MAC address mode: device (real MAC), random (new each connection), " +
            "persistent-random (same random across reboots), specific (custom MAC)",
        ),
      mac_address: z
        .string()
        .optional()
        .describe(
          'Specific MAC address to use (required when mac_mode is "specific"). ' +
            "Format: aa:bb:cc:dd:ee:ff",
        ),
      preassoc_mac_mode: z
        .enum(["disabled", "random", "persistent-random"])
        .optional()
        .describe(
          "MAC randomization during scanning: disabled (real MAC), random, " +
            "or persistent-random",
        ),
      rand_addr_lifetime: z
        .number()
        .optional()
        .describe(
          "Seconds before rotating random MAC address (default: 60). " +
            "Only applies when mac_mode is random or persistent-random.",
        ),
    },
    async ({
      ssid,
      credential_id,
      identity,
      client_cert_path,
      private_key_path,
      ca_cert_path,
      private_key_password,
      interface: iface,
      mac_mode,
      mac_address,
      preassoc_mac_mode,
      rand_addr_lifetime,
    }) => {
      // Resolve certificate paths and identity
      let clientCertPath: string;
      let privateKeyPath: string;
      let caCertPath: string | undefined;
      let resolvedIdentity: string;
      let resolvedKeyPassword: string | undefined = private_key_password;

      try {
        // Clear HS20 config if active (switching from HS20 to direct connection)
        if (wpaConfig && (await wpaConfig.isHs20Active())) {
          await wpaConfig.clearHs20Credentials();
          if (daemon) {
            await daemon.restart();
          }
        }

        if (credential_id) {
          // Use stored credential
          const credential = await credentialStore.get(credential_id);
          if (!credential) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Credential '${credential_id}' not found. Use credential_list to see available credentials.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          clientCertPath = credential.paths.clientCert;
          privateKeyPath = credential.paths.privateKey;
          caCertPath = credential.paths.caCert;
          resolvedIdentity = credential.metadata.identity;

          // Get stored key password if not provided
          if (!resolvedKeyPassword && credential.metadata.has_key_password) {
            resolvedKeyPassword =
              await credentialStore.getKeyPassword(credential_id);
          }
        } else {
          // Use file path parameters - validate required fields
          if (!identity) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error:
                      "identity is required when credential_id is not provided",
                  }),
                },
              ],
              isError: true,
            };
          }
          if (!client_cert_path) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error:
                      "client_cert_path is required when credential_id is not provided",
                  }),
                },
              ],
              isError: true,
            };
          }
          if (!private_key_path) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error:
                      "private_key_path is required when credential_id is not provided",
                  }),
                },
              ],
              isError: true,
            };
          }

          // Use file paths directly
          clientCertPath = client_cert_path;
          privateKeyPath = private_key_path;
          caCertPath = ca_cert_path;
          resolvedIdentity = identity;
        }

        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);

        // Build MAC config if any MAC parameters provided
        let macConfig: MacAddressConfig | undefined;
        if (mac_mode) {
          macConfig = {
            mode: mac_mode as MacAddressMode,
            address: mac_address,
            preassocMode: preassoc_mac_mode as PreassocMacMode | undefined,
            randAddrLifetime: rand_addr_lifetime,
          };
        }

        await wpa.connectTls(
          ssid,
          resolvedIdentity,
          clientCertPath,
          privateKeyPath,
          caCertPath,
          resolvedKeyPassword,
          macConfig,
        );

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState("COMPLETED", 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface, macConfig?.mode);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Connected to ${ssid} using EAP-TLS`,
                    credential_id: credential_id || undefined,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? "obtained" : "timeout",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? `Connected to ${ssid} using EAP-TLS`
                    : `Connecting to ${ssid} (connection timeout)`,
                  credential_id: credential_id || undefined,
                  status: status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_hs20_connect - Connect to Hotspot 2.0 (Passpoint) network using EAP-TLS
  server.tool(
    "wifi_hs20_connect",
    "Connect to a Hotspot 2.0 (Passpoint) network using EAP-TLS certificate authentication. " +
      "HS20 uses ANQP to automatically discover and connect to compatible networks based on " +
      "realm and domain matching. Requires stored credential from credential_store. " +
      "If connection fails, use wifi_get_debug_logs with filter='eap' to diagnose.",
    {
      credential_id: z
        .string()
        .describe(
          "Reference to stored credential (from credential_store). " +
            "Contains client certificate, private key, and CA certificate for EAP-TLS.",
        ),
      realm: z
        .string()
        .describe(
          "Home realm for NAI matching (e.g., 'corp.example.com'). " +
            "Used to identify your home network provider.",
        ),
      domain: z
        .string()
        .describe(
          "Home domain for domain list matching (e.g., 'example.com'). " +
            "Used to verify the network is operated by your provider.",
        ),
      priority: z
        .number()
        .optional()
        .describe(
          "Selection priority when multiple HS20 networks match (default: 1). " +
            "Higher values are preferred.",
        ),
      timeout: z
        .number()
        .optional()
        .describe(
          "Connection timeout in seconds (default: 60). " +
            "ANQP discovery with many APs can take 20-30+ seconds. " +
            "Increase for environments with many HS20 networks.",
        ),
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ credential_id, realm, domain, priority, timeout, interface: iface }) => {
      try {
        // Require wpaConfig for config-based HS20
        if (!wpaConfig) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "WpaConfig not available. HS20 requires config-based connection.",
                }),
              },
            ],
            isError: true,
          };
        }

        // Load credential from store
        const credential = await credentialStore.get(credential_id);
        if (!credential) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: `Credential '${credential_id}' not found. Use credential_list to see available credentials.`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Get key password if stored
        let keyPassword: string | undefined;
        if (credential.metadata.has_key_password) {
          keyPassword = await credentialStore.getKeyPassword(credential_id);
        }

        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);

        // Config-based HS20 connection:
        // 1. Clear any existing HS20 credentials
        await wpaConfig.clearHs20Credentials();

        // 2. Add new credential to config
        await wpaConfig.addHs20Credential({
          realm,
          domain,
          identity: credential.metadata.identity,
          clientCertPath: credential.paths.clientCert,
          privateKeyPath: credential.paths.privateKey,
          caCertPath: credential.paths.caCert,
          keyPassword,
          priority,
        });

        // 3. Restart daemon to apply config (auto_interworking will trigger ANQP)
        if (daemon) {
          await daemon.restart();
        }

        // 4. Wait for auto-connection (default 60 seconds - ANQP discovery can take 20-30s)
        const timeoutMs = (timeout || 60) * 1000;
        let { reached, status } = await wpa.waitForState("COMPLETED", timeoutMs);

        // 5. Post-timeout status check - connection may have completed just after timeout
        if (!reached) {
          const finalStatus = await wpa.status();
          if (finalStatus.wpaState === "COMPLETED") {
            reached = true;
            status = finalStatus;
            console.log("HS20 connection completed after initial timeout", { status });
          }
        }

        // 6. Run DHCP if connected (even on late success)
        if (reached && dhcpManager) {
          await dhcpManager.start(targetIface);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Connected via HS20 (config-based)",
                    credential_id: credential_id,
                    realm: realm,
                    domain: domain,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? "obtained" : "timeout",
                    timeout_seconds: timeout || 60,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Connection failed - clean up credential from config
        if (!reached) {
          await wpaConfig.removeHs20Credential(realm, domain);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? "Connected via HS20 (config-based)"
                    : "HS20 connection timeout (no matching network found or ANQP failed)",
                  credential_id: credential_id,
                  realm: realm,
                  domain: domain,
                  status: status,
                  timeout_seconds: timeout || 60,
                  hint: !reached ? "Try increasing timeout parameter for environments with many APs" : undefined,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        // Clean up on error
        if (wpaConfig) {
          await wpaConfig.clearHs20Credentials().catch(() => {});
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_eap_diagnostics - Get EAP/802.1X diagnostic information
  server.tool(
    "wifi_eap_diagnostics",
    "Get detailed EAP/802.1X authentication diagnostics from wpa_supplicant. Returns: eap_state (IDLE, IDENTITY, METHOD, SUCCESS, FAILURE), selectedMethod, methodState, decision (FAIL, COND_SUCC, UNCOND_SUCC), reqMethod. Use when wifi_connect_eap fails - eap_state=IDLE with decision=FAIL indicates server rejected credentials.",
    {
      interface: z
        .string()
        .optional()
        .describe("WiFi interface name (default: wlan0)"),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const diagnostics = await wpa.getEapDiagnostics();
        const status = await wpa.status();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  wpaState: status.wpaState,
                  ssid: status.ssid,
                  diagnostics: diagnostics,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // wifi_get_debug_logs - Get wpa_supplicant debug logs (only if daemon is managed)
  if (daemon) {
    server.tool(
      "wifi_get_debug_logs",
      'Get wpa_supplicant debug logs for troubleshooting. Use filter parameter to focus on specific log types: "eap" for 802.1X/EAP authentication issues (identity rejection, credential failures, certificate problems), "state" for connection flow (shows state transitions like SCANNING->AUTHENTICATING->ASSOCIATED), "scan" for network discovery issues, "error" for failures and timeouts.',
      {
        filter: z
          .enum(["all", "eap", "state", "scan", "error"])
          .optional()
          .describe(
            "Log filter: all (default), eap (802.1X/EAP authentication - use for credential/identity issues), state (connection state transitions - use to see connection flow), scan (network discovery), error (failures and timeouts)",
          ),
        lines: z
          .number()
          .optional()
          .describe(
            "Number of recent lines to return when since_last_command is false (default: 100)",
          ),
        since_last_command: z
          .boolean()
          .optional()
          .describe(
            "Only return logs since last WiFi command (default: true). Set to false to get historical logs.",
          ),
      },
      async ({ filter, lines, since_last_command }) => {
        try {
          const filterType: LogFilter = filter || "all";
          const logs = await daemon.getFilteredLogs(
            filterType,
            since_last_command !== false,
            lines || 100,
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    logFile: daemon.getLogFile(),
                    filter: filterType,
                    lineCount: logs.length,
                    logs: logs,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
}
