import "dotenv/config";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerWifiTools } from "./tools/wifi.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerConnectivityTools } from "./tools/connectivity.js";
import { registerCredentialTools } from "./tools/credentials.js";
import { WpaDaemon } from "./lib/wpa-daemon.js";
import { DhcpManager } from "./lib/dhcp-manager.js";
import { WpaConfig } from "./lib/wpa-config.js";

const app = express();
app.use(express.json());

// Config path used by both daemon and config manager
const wpaConfigPath =
  process.env.WPA_CONFIG_PATH || "/etc/wpa_supplicant/wpa_supplicant.conf";

// Create wpa_supplicant daemon manager
const wpaDaemon = new WpaDaemon(
  process.env.WIFI_INTERFACE || "wlan0",
  wpaConfigPath,
  parseInt(process.env.WPA_DEBUG_LEVEL || "2", 10),
);

// Create wpa_supplicant config manager (for HS20)
const wpaConfig = new WpaConfig(wpaConfigPath);

// Create DHCP manager
const dhcpManager = new DhcpManager();

// Create MCP server
const mcpServer = new McpServer({
  name: "wpa-mcp",
  version: "1.0.0",
});

// Register all tools
registerWifiTools(mcpServer, wpaDaemon, dhcpManager, wpaConfig);
registerBrowserTools(mcpServer);
registerConnectivityTools(mcpServer);
registerCredentialTools(mcpServer);

// MCP endpoint using Streamable HTTP Transport
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "wpa-mcp", version: "1.0.0" });
});

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await dhcpManager.stop();
  await wpaDaemon.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
const startServer = async () => {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  // Ensure HS20 settings in config before starting daemon
  try {
    await wpaConfig.ensureHs20Enabled();
  } catch (error) {
    console.error("Failed to enable HS20 in config:", error);
  }

  // Start wpa_supplicant daemon
  try {
    await wpaDaemon.start();
  } catch (error) {
    console.error("Failed to start wpa_supplicant:", error);
    console.error("Continuing without managed wpa_supplicant...");
  }

  app.listen(Number(PORT), HOST, () => {
    console.log(`wpa-mcp server listening on http://${HOST}:${PORT}`);
    console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
  });
};

startServer();
