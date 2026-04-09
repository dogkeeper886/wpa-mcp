#!/usr/bin/env npx tsx
/**
 * MCP client CLI for integration testing via Streamable HTTP transport.
 *
 * Commands:
 *   list-tools                    List all registered tools
 *   call-tool <name> [json_args]  Call a tool and print result
 *
 * Environment:
 *   MCP_SERVER_URL  Server URL (default: http://localhost:3002/mcp)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:3002/mcp';
const [command, ...rest] = process.argv.slice(2);

if (!command) {
  console.error('Usage: mcp-client.ts <list-tools|call-tool> [args...]');
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
const client = new Client({ name: 'test-client', version: '1.0.0' });

try {
  await client.connect(transport);

  switch (command) {
    case 'list-tools': {
      const result = await client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema
      );
      // Output tool names as JSON array for easy pattern matching
      const toolNames = result.tools.map(t => t.name);
      console.log(JSON.stringify({ tools: toolNames }, null, 2));
      break;
    }

    case 'call-tool': {
      const [toolName, argsJson] = rest;
      if (!toolName) {
        console.error('Usage: mcp-client.ts call-tool <tool_name> [json_args]');
        process.exit(1);
      }
      const args = argsJson ? JSON.parse(argsJson) : {};
      const result = await client.request(
        { method: 'tools/call', params: { name: toolName, arguments: args } },
        CallToolResultSchema
      );
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
} finally {
  await transport.close();
}
