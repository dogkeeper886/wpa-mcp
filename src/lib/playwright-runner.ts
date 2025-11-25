import { chromium, Page, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { ScriptInfo, ScriptVariables } from '../types.js';

// Script directory - can be overridden via env var
const SCRIPTS_DIR =
  process.env.WPA_MCP_SCRIPTS_DIR ||
  path.join(os.homedir(), '.config', 'wpa-mcp', 'scripts');

export async function ensureScriptsDir(): Promise<void> {
  await fs.mkdir(SCRIPTS_DIR, { recursive: true });
}

export async function listScripts(): Promise<ScriptInfo[]> {
  await ensureScriptsDir();

  try {
    const files = await fs.readdir(SCRIPTS_DIR);
    const scripts: ScriptInfo[] = [];

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        scripts.push({
          name: file.replace(/\.(js|mjs)$/, ''),
          path: path.join(SCRIPTS_DIR, file),
        });
      }
    }

    return scripts;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function runScript(
  scriptName: string,
  variables: ScriptVariables = {},
  options: {
    headless?: boolean;
    timeout?: number;
  } = {}
): Promise<{ success: boolean; output?: string; error?: string }> {
  const { headless = false, timeout = 60000 } = options;

  // Find script file
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.js`);
  const scriptPathMjs = path.join(SCRIPTS_DIR, `${scriptName}.mjs`);

  let actualPath: string;
  try {
    await fs.access(scriptPath);
    actualPath = scriptPath;
  } catch {
    try {
      await fs.access(scriptPathMjs);
      actualPath = scriptPathMjs;
    } catch {
      throw new Error(
        `Script not found: ${scriptName}. Looked in ${SCRIPTS_DIR}`
      );
    }
  }

  let browser: Browser | null = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Set default timeout
    page.setDefaultTimeout(timeout);

    // Import and run the script
    const scriptUrl = `file://${actualPath}`;
    const scriptModule = await import(scriptUrl);

    if (typeof scriptModule.default !== 'function') {
      throw new Error(
        `Script ${scriptName} must export a default async function`
      );
    }

    // Run the script with page and variables
    const result = await scriptModule.default(page, variables);

    await browser.close();
    browser = null;

    return {
      success: true,
      output: result ? String(result) : 'Script completed successfully',
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getScriptsDirectory(): string {
  return SCRIPTS_DIR;
}
