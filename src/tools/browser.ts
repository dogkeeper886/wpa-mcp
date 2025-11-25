import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import open from 'open';
import {
  listScripts,
  runScript,
  getScriptsDirectory,
  ensureScriptsDir,
} from '../lib/playwright-runner.js';

export function registerBrowserTools(server: McpServer): void {
  // browser_open - Open URL in default browser
  server.tool(
    'browser_open',
    'Open a URL in the default system browser',
    {
      url: z.string().url().describe('URL to open'),
    },
    async ({ url }) => {
      try {
        await open(url);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Opened ${url} in default browser`,
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

  // browser_run_script - Run a Playwright script
  server.tool(
    'browser_run_script',
    'Run a Playwright automation script with variables',
    {
      script_name: z
        .string()
        .describe('Name of the script (without .js extension)'),
      variables: z
        .record(z.string())
        .optional()
        .describe('Variables to pass to the script'),
      headless: z
        .boolean()
        .optional()
        .describe('Run browser in headless mode (default: false)'),
      timeout: z
        .number()
        .optional()
        .describe('Script timeout in milliseconds (default: 60000)'),
    },
    async ({ script_name, variables, headless, timeout }) => {
      try {
        const result = await runScript(script_name, variables || {}, {
          headless: headless ?? false,
          timeout: timeout ?? 60000,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: result.success,
                  scriptName: script_name,
                  variables: variables || {},
                  output: result.output,
                  error: result.error,
                },
                null,
                2
              ),
            },
          ],
          isError: !result.success,
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

  // browser_list_scripts - List available scripts
  server.tool(
    'browser_list_scripts',
    'List available Playwright automation scripts',
    {},
    async () => {
      try {
        await ensureScriptsDir();
        const scripts = await listScripts();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  scriptsDirectory: getScriptsDirectory(),
                  scripts: scripts,
                  count: scripts.length,
                  hint:
                    scripts.length === 0
                      ? `No scripts found. Create .js files in ${getScriptsDirectory()}`
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
}
