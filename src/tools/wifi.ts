import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WpaCli } from '../lib/wpa-cli.js';

const DEFAULT_INTERFACE = process.env.WIFI_INTERFACE || 'wlan0';

export function registerWifiTools(server: McpServer): void {
  // wifi_scan - Scan for available networks
  server.tool(
    'wifi_scan',
    'Scan for available WiFi networks',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
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
    'Connect to a WiFi network',
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
    },
    async ({ ssid, password, interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        await wpa.connect(ssid, password);

        // Wait a bit and check status
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await wpa.status();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Connecting to ${ssid}`,
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
    'Disconnect from the current WiFi network',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        await wpa.disconnect();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Disconnected from WiFi',
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
    'Get current WiFi connection status',
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
    'List saved WiFi networks',
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
    'Remove/forget a saved WiFi network',
    {
      network_id: z.number().describe('Network ID to remove (from list_networks)'),
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ network_id, interface: iface }) => {
      try {
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
    'Reconnect to the current WiFi network',
    {
      interface: z
        .string()
        .optional()
        .describe('WiFi interface name (default: wlan0)'),
    },
    async ({ interface: iface }) => {
      try {
        const wpa = new WpaCli(iface || DEFAULT_INTERFACE);
        await wpa.reconnect();

        // Wait and check status
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = await wpa.status();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Reconnecting to WiFi',
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
}
