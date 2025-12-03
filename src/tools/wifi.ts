import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WpaCli } from '../lib/wpa-cli.js';
import { WpaDaemon, LogFilter } from '../lib/wpa-daemon.js';
import { DhcpManager } from '../lib/dhcp-manager.js';
import type { MacAddressConfig, MacAddressMode, PreassocMacMode } from '../types.js';

const DEFAULT_INTERFACE = process.env.WIFI_INTERFACE || 'wlan0';

export function registerWifiTools(
  server: McpServer,
  daemon?: WpaDaemon,
  dhcpManager?: DhcpManager
): void {
  // wifi_scan - Scan for available networks
  server.tool(
    'wifi_scan',
    'Scan for available WiFi networks. Returns list of nearby networks with SSID, BSSID, signal strength, and security type (WPA-PSK, WPA-EAP, etc.).',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const networks = await wpa.scan();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  networks: networks,
                  count: networks.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_connect - Connect to a network
  server.tool(
    'wifi_connect',
    'Connect to a WPA-PSK or open WiFi network. Supports MAC address randomization for privacy. For WPA2-Enterprise/802.1X networks (like corporate WiFi requiring username/password), use wifi_connect_eap instead. Returns connection status after 5 second wait.',
    {
      ssid: z.string().describe('Network SSID to connect to'),
      password: z
        .string()
        .optional()
        .describe('Network password (omit for open networks)'),
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
      mac_mode: z
        .enum(['device', 'random', 'persistent-random', 'specific'])
        .optional()
        .describe(
          'MAC address mode: device (real MAC), random (new each connection), ' +
          'persistent-random (same random across reboots), specific (custom MAC)'
        ),
      mac_address: z
        .string()
        .optional()
        .describe(
          'Specific MAC address to use (required when mac_mode is "specific"). ' +
          'Format: aa:bb:cc:dd:ee:ff'
        ),
      preassoc_mac_mode: z
        .enum(['disabled', 'random', 'persistent-random'])
        .optional()
        .describe(
          'MAC randomization during scanning: disabled (real MAC), random, ' +
          'or persistent-random'
        ),
      rand_addr_lifetime: z
        .number()
        .optional()
        .describe(
          'Seconds before rotating random MAC address (default: 60). ' +
          'Only applies when mac_mode is random or persistent-random.'
        ),
    },
    async ({ ssid, password, interface: iface, mac_mode, mac_address, preassoc_mac_mode, rand_addr_lifetime }) => {
      try {
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
        const { reached, status } = await wpa.waitForState('COMPLETED', 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Connected to ${ssid}`,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? 'obtained' : 'timeout',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? `Connected to ${ssid}`
                    : `Connecting to ${ssid} (connection timeout)`,
                  status: status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_connect_eap - Connect to a WPA2-Enterprise (802.1X) network
  server.tool(
    'wifi_connect_eap',
    'Connect to a WPA2-Enterprise (802.1X) WiFi network using EAP authentication. Supports MAC address randomization for privacy. Used for corporate/enterprise networks requiring username and password (not just a shared password). Common EAP methods: PEAP (most common, tunneled authentication), TTLS (similar to PEAP), TLS (certificate-based). If connection fails, use wifi_get_debug_logs with filter="eap" to diagnose.',
    {
      ssid: z.string().describe('Network SSID to connect to'),
      identity: z.string().describe('Username/identity for EAP authentication'),
      password: z.string().describe('Password for EAP authentication'),
      eap_method: z
        .string()
        .optional()
        .describe('EAP method: PEAP, TTLS, TLS (default: PEAP)'),
      phase2: z
        .string()
        .optional()
        .describe('Phase2 authentication: MSCHAPV2, PAP, GTC (default: MSCHAPV2)'),
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
      mac_mode: z
        .enum(['device', 'random', 'persistent-random', 'specific'])
        .optional()
        .describe(
          'MAC address mode: device (real MAC), random (new each connection), ' +
          'persistent-random (same random across reboots), specific (custom MAC)'
        ),
      mac_address: z
        .string()
        .optional()
        .describe(
          'Specific MAC address to use (required when mac_mode is "specific"). ' +
          'Format: aa:bb:cc:dd:ee:ff'
        ),
      preassoc_mac_mode: z
        .enum(['disabled', 'random', 'persistent-random'])
        .optional()
        .describe(
          'MAC randomization during scanning: disabled (real MAC), random, ' +
          'or persistent-random'
        ),
      rand_addr_lifetime: z
        .number()
        .optional()
        .describe(
          'Seconds before rotating random MAC address (default: 60). ' +
          'Only applies when mac_mode is random or persistent-random.'
        ),
    },
    async ({ ssid, identity, password, eap_method, phase2, interface: iface, mac_mode, mac_address, preassoc_mac_mode, rand_addr_lifetime }) => {
      try {
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
          eap_method || 'PEAP',
          phase2 || 'MSCHAPV2',
          macConfig
        );

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState('COMPLETED', 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Connected to ${ssid} using EAP-${eap_method || 'PEAP'}`,
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? 'obtained' : 'timeout',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? `Connected to ${ssid} using EAP-${eap_method || 'PEAP'}`
                    : `Connecting to ${ssid} (connection timeout)`,
                  status: status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_disconnect - Disconnect from current network
  server.tool(
    'wifi_disconnect',
    'Disconnect from the current WiFi network. Use before connecting to a different network or to troubleshoot connection issues.',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Disconnected from WiFi',
                dhcpReleased: true,
                ipFlushed: true,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_status - Get current connection status
  server.tool(
    'wifi_status',
    'Get current WiFi connection status. Returns: wpa_state (COMPLETED=connected, DISCONNECTED, SCANNING, etc.), ssid (network name), bssid (access point MAC), ip_address, key_mgmt (security type), and for EAP networks: eap_state, EAP_method, identity.',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const status = await wpa.status();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  status: status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_list_networks - List saved networks
  server.tool(
    'wifi_list_networks',
    'List saved/configured WiFi networks in wpa_supplicant. Returns network_id (used for wifi_forget), ssid, bssid, and flags (CURRENT=connected, DISABLED, TEMP-DISABLED=authentication failed).',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const networks = await wpa.listNetworks();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  savedNetworks: networks,
                  count: networks.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_forget - Remove a saved network
  server.tool(
    'wifi_forget',
    'Remove/forget a saved WiFi network from wpa_supplicant configuration. Use wifi_list_networks first to get the network_id. Useful for removing networks with wrong credentials before re-adding.',
    {
      network_id: z.number().describe('Network ID to remove (from list_networks)'),
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ network_id, interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        await wpa.removeNetwork(network_id);

        return {
          content: [
            {
              type: 'text',
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
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_reconnect - Reconnect to the current network
  server.tool(
    'wifi_reconnect',
    'Reconnect to the current or most recently used WiFi network. Useful after temporary disconnection or to retry authentication. Different from wifi_connect - does not require SSID/password as it uses saved configuration.',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        daemon?.markCommandStart();
        const targetIface = iface || DEFAULT_INTERFACE;
        const wpa = new WpaCli(targetIface);
        await wpa.reconnect();

        // Poll for connection completion (15 seconds)
        const { reached, status } = await wpa.waitForState('COMPLETED', 15000);

        if (reached && dhcpManager) {
          // Connection successful, get IP address via DHCP
          await dhcpManager.start(targetIface);
          const ipAddress = await dhcpManager.waitForIp(10000);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: 'Reconnected to WiFi',
                    status: { ...status, ipAddress },
                    dhcp: ipAddress ? 'obtained' : 'timeout',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: reached,
                  message: reached
                    ? 'Reconnected to WiFi'
                    : 'Reconnecting to WiFi (connection timeout)',
                  status: status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_eap_diagnostics - Get EAP/802.1X diagnostic information
  server.tool(
    'wifi_eap_diagnostics',
    'Get detailed EAP/802.1X authentication diagnostics from wpa_supplicant. Returns: eap_state (IDLE, IDENTITY, METHOD, SUCCESS, FAILURE), selectedMethod, methodState, decision (FAIL, COND_SUCC, UNCOND_SUCC), reqMethod. Use when wifi_connect_eap fails - eap_state=IDLE with decision=FAIL indicates server rejected credentials.',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        const diagnostics = await wpa.getEapDiagnostics();
        const status = await wpa.status();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  interface: iface || DEFAULT_INTERFACE,
                  wpaState: status.wpaState,
                  ssid: status.ssid,
                  diagnostics: diagnostics,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // wifi_get_debug_logs - Get wpa_supplicant debug logs (only if daemon is managed)
  if (daemon) {
    server.tool(
      'wifi_get_debug_logs',
      'Get wpa_supplicant debug logs for troubleshooting. Use filter parameter to focus on specific log types: "eap" for 802.1X/EAP authentication issues (identity rejection, credential failures, certificate problems), "state" for connection flow (shows state transitions like SCANNING->AUTHENTICATING->ASSOCIATED), "scan" for network discovery issues, "error" for failures and timeouts.',
      {
        filter: z
          .enum(['all', 'eap', 'state', 'scan', 'error'])
          .optional()
          .describe(
            'Log filter: all (default), eap (802.1X/EAP authentication - use for credential/identity issues), state (connection state transitions - use to see connection flow), scan (network discovery), error (failures and timeouts)'
          ),
        lines: z
          .number()
          .optional()
          .describe(
            'Number of recent lines to return when since_last_command is false (default: 100)'
          ),
        since_last_command: z
          .boolean()
          .optional()
          .describe(
            'Only return logs since last WiFi command (default: true). Set to false to get historical logs.'
          ),
      },
      async ({ filter, lines, since_last_command }) => {
        try {
          const filterType: LogFilter = filter || 'all';
          const logs = await daemon.getFilteredLogs(
            filterType,
            since_last_command !== false,
            lines || 100
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    logFile: daemon.getLogFile(),
                    filter: filterType,
                    lineCount: logs.length,
                    logs: logs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
