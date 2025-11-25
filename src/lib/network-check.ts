import { exec } from 'child_process';
import { promisify } from 'util';
import * as dns from 'dns';
import * as https from 'https';
import type { PingResult, DnsResult } from '../types.js';

const execAsync = promisify(exec);
const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolve);

export async function ping(
  host: string,
  count: number = 1
): Promise<PingResult> {
  try {
    const { stdout } = await execAsync(`ping -c ${count} -W 5 ${host}`, {
      timeout: (count + 1) * 5000,
    });

    // Parse ping time from output
    const timeMatch = stdout.match(/time=(\d+\.?\d*)/);
    const time = timeMatch ? parseFloat(timeMatch[1]) : undefined;

    return {
      host,
      alive: true,
      time,
      output: stdout.trim(),
    };
  } catch (error) {
    const errorOutput =
      error instanceof Error
        ? (error as Error & { stderr?: string }).stderr || error.message
        : String(error);

    return {
      host,
      alive: false,
      output: errorOutput,
    };
  }
}

export async function dnsLookupHost(hostname: string): Promise<DnsResult> {
  try {
    // Try to resolve all addresses
    const addresses = await dnsResolve(hostname);

    return {
      hostname,
      addresses: Array.isArray(addresses) ? addresses : [addresses],
    };
  } catch {
    // Fall back to single lookup
    try {
      const result = await dnsLookup(hostname);
      return {
        hostname,
        addresses: [result.address],
      };
    } catch (error) {
      throw new Error(
        `DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export async function checkInternet(): Promise<{
  online: boolean;
  latency?: number;
  error?: string;
}> {
  const testUrls = [
    'https://www.google.com/generate_204',
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://connectivitycheck.gstatic.com/generate_204',
  ];

  for (const url of testUrls) {
    try {
      const startTime = Date.now();
      const result = await httpGet(url, 5000);
      const latency = Date.now() - startTime;

      if (result.statusCode && result.statusCode >= 200 && result.statusCode < 400) {
        return { online: true, latency };
      }
    } catch {
      // Try next URL
      continue;
    }
  }

  return { online: false, error: 'All connectivity checks failed' };
}

export async function checkCaptivePortal(): Promise<{
  detected: boolean;
  redirectUrl?: string;
  error?: string;
}> {
  // Use Google's captive portal check
  const checkUrl = 'http://connectivitycheck.gstatic.com/generate_204';

  try {
    const result = await httpGet(checkUrl, 5000, false); // Don't follow redirects

    if (result.statusCode === 204) {
      // No captive portal
      return { detected: false };
    } else if (result.statusCode === 302 || result.statusCode === 301) {
      // Redirect indicates captive portal
      return {
        detected: true,
        redirectUrl: result.headers?.location,
      };
    } else if (result.statusCode === 200) {
      // 200 with content could also indicate captive portal
      // (portal page being served instead of 204)
      return {
        detected: true,
        redirectUrl: checkUrl,
      };
    }

    return { detected: false };
  } catch (error) {
    return {
      detected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Helper function for HTTP GET requests
function httpGet(
  url: string,
  timeout: number,
  followRedirects: boolean = true
): Promise<{
  statusCode?: number;
  headers?: { location?: string };
  body?: string;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'wpa-mcp/1.0',
      },
    };

    const req = httpModule.request(options, (res: {
      statusCode?: number;
      headers: { location?: string };
      on: (event: string, callback: (chunk: unknown) => void) => void;
    }) => {
      if (
        followRedirects &&
        res.statusCode &&
        (res.statusCode === 301 || res.statusCode === 302) &&
        res.headers.location
      ) {
        // Follow redirect
        httpGet(res.headers.location, timeout, followRedirects)
          .then(resolve)
          .catch(reject);
        return;
      }

      let body = '';
      res.on('data', (chunk: unknown) => {
        body += String(chunk);
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}
