import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerWifiTools } from './tools/wifi.js';
import { registerBrowserTools } from './tools/browser.js';
import { registerConnectivityTools } from './tools/connectivity.js';

const app = express();
app.use(express.json());

// Create MCP server
const mcpServer = new McpServer({
  name: 'wpa-mcp',
  version: '1.0.0',
});

// Register all tools
registerWifiTools(mcpServer);
registerBrowserTools(mcpServer);
registerConnectivityTools(mcpServer);

// MCP endpoint using Streamable HTTP Transport
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    res.on('close', () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'wpa-mcp', version: '1.0.0' });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(Number(PORT), HOST, () => {
  console.log(`wpa-mcp server listening on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
});
