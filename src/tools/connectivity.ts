import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ping,
  dnsLookupHost,
  checkInternet,
  checkCaptivePortal,
} from '../lib/network-check.js';

export function registerConnectivityTools(server: McpServer): void {
  // network_ping - Ping a host
  server.tool(
    'network_ping',
    'Ping a host to check connectivity',
    {
      host: z.string().describe('Hostname or IP address to ping'),
      count: z.number().optional().describe('Number of ping packets (default: 1)'),
    },
    async ({ host, count }) => {
      try {
        const result = await ping(host, count || 1);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  host: result.host,
                  alive: result.alive,
                  time: result.time ? `${result.time}ms` : undefined,
                  output: result.output,
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

  // network_check_internet - Check internet connectivity
  server.tool(
    'network_check_internet',
    'Check if the device has internet connectivity',
    {},
    async () => {
      try {
        const result = await checkInternet();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  online: result.online,
                  latency: result.latency ? `${result.latency}ms` : undefined,
                  error: result.error,
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

  // network_check_captive - Detect captive portal
  server.tool(
    'network_check_captive',
    'Detect if behind a captive portal (e.g., hotel/airport WiFi login page)',
    {},
    async () => {
      try {
        const result = await checkCaptivePortal();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  captivePortalDetected: result.detected,
                  redirectUrl: result.redirectUrl,
                  error: result.error,
                  hint: result.detected
                    ? 'Use browser_open or browser_run_script to handle the captive portal login'
                    : undefined,
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

  // network_dns_lookup - Perform DNS lookup
  server.tool(
    'network_dns_lookup',
    'Perform DNS lookup for a hostname',
    {
      hostname: z.string().describe('Hostname to look up'),
    },
    async ({ hostname }) => {
      try {
        const result = await dnsLookupHost(hostname);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  hostname: result.hostname,
                  addresses: result.addresses,
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
