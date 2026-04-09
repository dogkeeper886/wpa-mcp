/**
 * Project configuration for the test framework.
 * 
 * Customize this file for your project's needs.
 */

/**
 * Available test suites - extend this array for your project.
 * Examples: ['build', 'integration', 'e2e'] or ['build', 'runtime', 'inference', 'models']
 */
export const SUITES: string[] = ['build', 'integration'];
export type Suite = string;

/**
 * Project configuration.
 */
export const CONFIG = {
  // Project identification
  projectName: 'wpa-mcp',
  
  // Session file prefix for log collection
  sessionPrefix: 'test-session',
  
  // Default timeouts (in milliseconds)
  defaultTimeout: 60000,
  defaultStepTimeout: 30000,
  
  // LLM Judge defaults
  llm: {
    defaultUrl: process.env.LLM_JUDGE_URL || 'http://localhost:11434',
    defaultModel: process.env.LLM_JUDGE_MODEL || 'llama3:8b',
    timeout: 300000,
    stdoutLimit: 1000,
    stderrLimit: 500,
    logsLimit: 3000,
  },
  
  // Log collection settings
  logs: {
    cleanupAge: 24 * 60 * 60 * 1000, // 24 hours
    maxBuffer: 50 * 1024 * 1024, // 50MB
  },

  // MCP client settings (for projects using mcp-client.ts)
  mcp: {
    serverCommand: 'node dist/mcpServer.js', // Override via MCP_SERVER_COMMAND env var
  },
};

/**
 * Error patterns to detect in logs.
 * The Simple Judge will fail tests if any of these patterns are found.
 * 
 * Customize for your project's specific error indicators.
 */
export const ERROR_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bpanic\b/i,
  /segmentation fault/i,
  /out of memory/i,
  /OOM/,
];

/**
 * Patterns that indicate a test should NOT be failed.
 * Use these to exclude false positives from ERROR_PATTERNS.
 */
export const ERROR_EXCLUSIONS: RegExp[] = [
  /error.*handled/i,
  /expected.*error/i,
  /error.*pattern/i,       // Tool descriptions mentioning error patterns
  /"description":/i,       // JSON tool descriptions contain "error" in help text
  /error_type/i,           // Metric labels in descriptions
  /error.*code/i,          // JSON-RPC error code references
];
