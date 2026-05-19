import "dotenv/config";
import crypto from "node:crypto";
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import express, { Request, Response } from "express";
import {
  createProxyMiddleware,
  fixRequestBody,
  responseInterceptor,
} from "http-proxy-middleware";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerWifiTools } from "./tools/wifi.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerConnectivityTools } from "./tools/connectivity.js";
import { registerCredentialTools } from "./tools/credentials.js";
import { WpaDaemon } from "./lib/wpa-daemon.js";
import { DhcpManager } from "./lib/dhcp-manager.js";
import { WpaConfig } from "./lib/wpa-config.js";

// Intent description surfaced on the proxied Playwright MCP's `initialize`
// response so agents can tell *this* browser apart from the stock Microsoft
// Playwright MCP. Shows up in Claude Code's tool metadata as server-level
// instructions — making it clear when to pick this server over a generic one.
const WPA_PLAYWRIGHT_INSTRUCTIONS = [
  "Browser running inside the wpa-mcp container's network namespace.",
  "",
  "Use this MCP for any web task AFTER wpa-mcp has joined a Wi-Fi network",
  "via `wifi_connect` (or any of the WPA tools) — captive portals, portal",
  "redirects, and web apps only reachable on that WLAN.",
  "",
  "Do NOT use this MCP for general browsing on the host's main internet;",
  "use the stock `playwright` MCP (if registered separately) for that.",
].join("\n");

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
  version: "2.0.0",
});

// Register all tools
registerWifiTools(mcpServer, wpaDaemon, dhcpManager, wpaConfig);
registerBrowserTools(mcpServer);
registerConnectivityTools(mcpServer);
registerCredentialTools(mcpServer);

// Structured one-line JSON logger. Keeps a single shape across req / res /
// error so log lines for the same call can be joined on req_id when triaging
// "agent stuck in X" or captive-portal sessions.
const logEvent = (
  level: "info" | "warn" | "error",
  msg: string,
  ctx: Record<string, unknown>,
): void => {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  });
  if (level === "error") console.error(line);
  else console.log(line);
};

// Per-request scratch slots stashed on the express req object. Symbols
// avoid colliding with any field http-proxy-middleware or express attach.
const REQ_ID = Symbol("wpaReqId");
const REQ_START_MS = Symbol("wpaStartMs");

type AnnotatedReq = IncomingMessage & {
  body?: unknown;
  [REQ_ID]?: string;
  [REQ_START_MS]?: number;
};

// Pull `method` and (for tools/call) `params.name` out of a JSON-RPC body.
// Without `tool_name`, every browser_*/wifi_* call shows up as a generic
// "tools/call" line and a stuck agent is indistinguishable from a working one.
const extractJsonrpcInfo = (
  body: unknown,
): { method?: string; toolName?: string } => {
  if (!body || typeof body !== "object") return {};
  const methodVal = (body as { method?: unknown }).method;
  const method = typeof methodVal === "string" ? methodVal : undefined;
  let toolName: string | undefined;
  if (method === "tools/call") {
    const params = (body as { params?: unknown }).params;
    if (params && typeof params === "object") {
      const nameVal = (params as { name?: unknown }).name;
      if (typeof nameVal === "string") toolName = nameVal;
    }
  }
  return { method, toolName };
};

// Express middleware: tag every /mcp request with a req_id, log entry on
// arrival and exit on response finish. Same shape as the /playwright-mcp
// proxy logs so a single `grep req_id=...` joins both endpoints.
const logMcpMiddleware = (
  req: Request,
  res: Response,
  next: () => void,
): void => {
  const annotated = req as unknown as AnnotatedReq;
  const reqId = crypto.randomBytes(4).toString("hex");
  annotated[REQ_ID] = reqId;
  annotated[REQ_START_MS] = Date.now();

  const { method: jsonrpcMethod, toolName } = extractJsonrpcInfo(req.body);

  logEvent("info", "wpa-mcp req", {
    req_id: reqId,
    http_method: req.method,
    jsonrpc_method: jsonrpcMethod,
    tool_name: toolName,
  });

  res.on("finish", () => {
    logEvent("info", "wpa-mcp res", {
      req_id: reqId,
      status: res.statusCode,
      elapsed_ms: Date.now() - (annotated[REQ_START_MS] ?? Date.now()),
    });
  });

  next();
};

app.use("/mcp", logMcpMiddleware);

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
    const reqId = (req as unknown as AnnotatedReq)[REQ_ID];
    logEvent("error", "wpa-mcp handler error", {
      req_id: reqId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// GET and DELETE not supported in stateless mode — return 405 so clients
// (e.g. Cursor) know SSE streaming is unavailable instead of getting 404.
app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode" },
    id: null,
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode" },
    id: null,
  });
});

const logProxyReq = (
  proxyReq: ClientRequest,
  req: IncomingMessage,
  _res: ServerResponse,
): void => {
  const annotated = req as AnnotatedReq;
  const reqId = crypto.randomBytes(4).toString("hex");
  annotated[REQ_ID] = reqId;
  annotated[REQ_START_MS] = Date.now();

  const { method: jsonrpcMethod, toolName } = extractJsonrpcInfo(annotated.body);

  logEvent("info", "playwright-mcp proxy req", {
    req_id: reqId,
    http_method: req.method,
    jsonrpc_method: jsonrpcMethod,
    tool_name: toolName,
  });

  // Echo the id upstream so the subprocess logs (once we wire DEBUG=pw:*)
  // can be correlated with proxy lines.
  proxyReq.setHeader("x-wpa-req-id", reqId);

  // Preserve existing body-forwarding behaviour for POSTs.
  fixRequestBody(proxyReq, req as Request);
};

const logProxyRes = (proxyRes: IncomingMessage, req: IncomingMessage): void => {
  const annotated = req as AnnotatedReq;
  const startMs = annotated[REQ_START_MS];
  logEvent("info", "playwright-mcp proxy res", {
    req_id: annotated[REQ_ID],
    status: proxyRes.statusCode,
    elapsed_ms: typeof startMs === "number" ? Date.now() - startMs : undefined,
  });
};

const logProxyError = (err: Error, req: IncomingMessage): void => {
  const annotated = req as AnnotatedReq;
  const startMs = annotated[REQ_START_MS];
  logEvent("error", "playwright-mcp proxy error", {
    req_id: annotated[REQ_ID],
    error: err.message,
    code: (err as NodeJS.ErrnoException).code,
    elapsed_ms: typeof startMs === "number" ? Date.now() - startMs : undefined,
  });
};

// Reverse proxy to the in-container Microsoft Playwright MCP server.
//
// Why: browsers launched by that server share this container's network
// namespace, so they reach captive portals on the WLAN that wifi_connect
// joined. The upstream is bound to 127.0.0.1:8931 (not exposed externally);
// this route is the only external entry point.
//
// Intent discovery: the `initialize` JSON-RPC response is intercepted and
// its `result.instructions` field is set to WPA_PLAYWRIGHT_INSTRUCTIONS so
// MCP clients (e.g. Claude Code) surface the "when to pick this server"
// guidance to the LLM automatically.
//
// Two-proxy shape — intentional. `selfHandleResponse: true` buffers the
// entire response, which is required to rewrite `initialize` but breaks
// long-lived SSE streams that MCP uses for tool-call progress and the
// GET /mcp notification channel. So we dispatch:
//   - POST whose body.method === "initialize"  → buffered (inject)
//   - everything else (POST tools/call, GET SSE, DELETE) → streamed
const playwrightMcpPort = process.env.PLAYWRIGHT_MCP_PORT || "8931";
// NB: `localhost` (not 127.0.0.1) so the forwarded Host header matches
// what Microsoft Playwright MCP binds to — it enforces a same-origin
// check on the Host header and rejects anything else.
const playwrightMcpTarget = `http://localhost:${playwrightMcpPort}`;

const initializeResponseInterceptor = responseInterceptor(
  async (responseBuffer, proxyRes, req, _res) => {
    logProxyRes(proxyRes as IncomingMessage, req as IncomingMessage);
    return await rewriteInitializeBody(responseBuffer, proxyRes);
  },
);

const playwrightInitializeProxy = createProxyMiddleware({
  target: playwrightMcpTarget,
  changeOrigin: true,
  pathRewrite: () => "/mcp",
  selfHandleResponse: true,
  on: {
    proxyReq: logProxyReq,
    proxyRes: initializeResponseInterceptor,
    error: logProxyError,
  },
});

const playwrightStreamingProxy = createProxyMiddleware({
  target: playwrightMcpTarget,
  changeOrigin: true,
  pathRewrite: () => "/mcp",
  // No selfHandleResponse — responses stream through naturally.
  on: {
    proxyReq: logProxyReq,
    proxyRes: logProxyRes,
    error: logProxyError,
  },
});

// Extracted from the inline interceptor so the proxy declaration above stays
// scannable. Same behaviour as before: rewrite the `initialize` JSON-RPC
// response (plain JSON or SSE-framed) to inject `result.instructions`.
async function rewriteInitializeBody(
  responseBuffer: Buffer,
  proxyRes: IncomingMessage,
): Promise<Buffer | string> {
  const contentType = String(proxyRes.headers["content-type"] || "");
  const body = responseBuffer.toString("utf8");

  // `serverInfo` in result marks an `initialize` JSON-RPC response.
  const injectIfInitialize = (jsonStr: string): string | null => {
    try {
      const obj = JSON.parse(jsonStr);
      if (obj?.result?.serverInfo) {
        obj.result.instructions = WPA_PLAYWRIGHT_INSTRUCTIONS;
        return JSON.stringify(obj);
      }
    } catch {
      /* not JSON — ignore */
    }
    return null;
  };

  // Case 1: plain JSON body (application/json).
  if (contentType.includes("application/json")) {
    const rewritten = injectIfInitialize(body);
    return rewritten ?? responseBuffer;
  }

  // Case 2: SSE body (text/event-stream) — MCP Streamable HTTP can
  // return results framed as "event: message\ndata: <json>\n\n".
  // Inspect every `data:` line; rewrite only the one whose JSON
  // matches the initialize marker. The `g` flag is required so
  // the callback sees each line even when the payload has multiple
  // events (heartbeats, batched notifications, etc.).
  if (contentType.includes("text/event-stream")) {
    const rewritten = body.replace(
      /^data: (.*)$/gm,
      (match, dataJson: string) => {
        const newJson = injectIfInitialize(dataJson);
        return newJson ? `data: ${newJson}` : match;
      },
    );
    return rewritten === body ? responseBuffer : rewritten;
  }

  return responseBuffer;
}

app.use("/playwright-mcp", (req, res, next) => {
  // Route to buffered-and-injected proxy only when the JSON-RPC method
  // is `initialize`. Everything else — tool calls, notification SSE,
  // session deletes — must stream without buffering.
  const isInitialize =
    req.method === "POST" &&
    typeof req.body === "object" &&
    req.body !== null &&
    (req.body as { method?: unknown }).method === "initialize";
  return isInitialize
    ? playwrightInitializeProxy(req, res, next)
    : playwrightStreamingProxy(req, res, next);
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "wpa-mcp", version: "2.0.0" });
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
