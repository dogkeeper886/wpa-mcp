import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { MacAddressMode } from '../types.js';

const execAsync = promisify(exec);

export class DhcpManager {
  private process: ChildProcess | null = null;
  private iface: string | null = null;

  async start(iface: string, macMode?: MacAddressMode): Promise<void> {
    // Kill any existing dhclient first
    await this.stop();

    this.iface = iface;
    console.log(`Starting dhclient for ${iface}...`);

    // Build dhclient arguments
    // -d = don't daemonize (foreground)
    // -v = verbose
    const args = ['dhclient', '-d', '-v'];

    // Use no lease file for random MAC modes (fresh DHCP discovery)
    // This prevents dhclient from requesting the same IP it had before
    // when the MAC address has changed
    if (macMode === 'random' || macMode === 'persistent-random') {
      args.push('-lf', '/dev/null');
      console.log(`Using fresh DHCP discovery (MAC mode: ${macMode})`);
    }

    args.push(iface);

    // Run dhclient in foreground mode for process management
    this.process = spawn('sudo', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.on('exit', (code, signal) => {
      console.log(`dhclient exited: code=${code}, signal=${signal}`);
      this.process = null;
    });

    this.process.on('error', (error) => {
      console.error('dhclient error:', error);
    });

    // Log output for debugging
    this.process.stdout?.on('data', (data) => {
      console.log(`dhclient: ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.log(`dhclient: ${data.toString().trim()}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.iface) return;

    console.log(`Stopping dhclient for ${this.iface}...`);

    // Kill managed process if we have one
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    // Release DHCP lease
    try {
      await execAsync(`sudo dhclient -r ${this.iface}`);
    } catch {
      // May fail if not running
    }

    // Kill any other dhclient for this interface (belt and suspenders)
    try {
      await execAsync(`sudo pkill -f "dhclient.*${this.iface}"`);
    } catch {
      // May not be running
    }

    // Flush IP addresses
    await this.flushIp();
  }

  async flushIp(): Promise<void> {
    if (!this.iface) return;

    try {
      await execAsync(`sudo ip addr flush dev ${this.iface}`);
      console.log(`Flushed IP addresses from ${this.iface}`);
    } catch (error) {
      console.error(`Failed to flush IP:`, error);
    }
  }

  async waitForIp(timeoutMs: number = 10000): Promise<string | null> {
    const pollInterval = 500;
    const maxAttempts = Math.ceil(timeoutMs / pollInterval);

    for (let i = 0; i < maxAttempts; i++) {
      const ip = await this.getCurrentIp();
      if (ip) return ip;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return null;
  }

  private async getCurrentIp(): Promise<string | null> {
    if (!this.iface) return null;

    try {
      const { stdout } = await execAsync(
        `ip -4 addr show ${this.iface} | grep -oP 'inet \\K[\\d.]+'`
      );
      const ip = stdout.trim();
      return ip || null;
    } catch {
      return null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  getInterface(): string | null {
    return this.iface;
  }
}
