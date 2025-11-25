import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

const execAsync = promisify(exec);

export class WpaDaemon {
  private logFile: string;
  private lastCommandTimestamp: number = 0;
  private process: ChildProcess | null = null;
  private logStream: fs.WriteStream | null = null;

  constructor(
    private iface: string,
    private configPath: string,
    private debugLevel: number = 2
  ) {
    this.logFile = `/tmp/wpa_supplicant_${iface}.log`;
  }

  async start(): Promise<void> {
    console.log(`Starting wpa_supplicant for ${this.iface}...`);

    // Stop systemd service if running
    try {
      await execAsync('sudo systemctl stop wpa_supplicant.service');
      console.log('Stopped systemd wpa_supplicant service');
    } catch {
      // Service may not exist or already stopped
    }

    // Kill any existing wpa_supplicant for this interface
    try {
      await execAsync(`sudo pkill -f "wpa_supplicant.*-i.*${this.iface}"`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // No existing process
    }

    // Bring interface up
    try {
      await execAsync(`sudo ip link set ${this.iface} up`);
    } catch (error) {
      console.error(`Failed to bring up interface ${this.iface}:`, error);
      throw error;
    }

    // Create log file stream (this will truncate any existing file)
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'w' });

    // Build debug flags based on level
    let debugFlags = '-d';
    for (let i = 1; i < this.debugLevel; i++) {
      debugFlags += 'd';
    }

    // Build args for wpa_supplicant (run in foreground, no -B flag)
    const args = [
      'wpa_supplicant',
      debugFlags,
      '-t', // timestamps
      '-i',
      this.iface,
      '-c',
      this.configPath,
    ];

    console.log(`Running: sudo ${args.join(' ')}`);

    // Spawn wpa_supplicant as a managed child process
    this.process = spawn('sudo', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Pipe stdout and stderr to log file
    if (this.process.stdout) {
      this.process.stdout.pipe(this.logStream);
    }
    if (this.process.stderr) {
      this.process.stderr.pipe(this.logStream);
    }

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(
        `wpa_supplicant exited with code ${code}, signal ${signal}`
      );
      this.process = null;
    });

    this.process.on('error', (error) => {
      console.error('wpa_supplicant process error:', error);
    });

    // Wait for daemon to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify it's running
    if (!(await this.isRunning())) {
      throw new Error('wpa_supplicant failed to start');
    }

    console.log(`wpa_supplicant started with debug level ${this.debugLevel}`);
    console.log(`Log file: ${this.logFile}`);

    this.lastCommandTimestamp = Date.now();
  }

  async stop(): Promise<void> {
    console.log(`Stopping wpa_supplicant for ${this.iface}...`);

    // Close log stream first
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }

    // Kill the managed process if we have one
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    // Also kill any other wpa_supplicant for this interface (belt and suspenders)
    try {
      await execAsync(`sudo pkill -f "wpa_supplicant.*-i.*${this.iface}"`);
      console.log('wpa_supplicant stopped');
    } catch {
      // May not be running
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  async isRunning(): Promise<boolean> {
    try {
      await execAsync(`pgrep -f "wpa_supplicant.*-i.*${this.iface}"`);
      return true;
    } catch {
      return false;
    }
  }

  markCommandStart(): void {
    this.lastCommandTimestamp = Date.now();
  }

  getLogFile(): string {
    return this.logFile;
  }

  async getLogsSinceLastCommand(): Promise<string[]> {
    try {
      const content = await fsPromises.readFile(this.logFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      // wpa_supplicant with -t flag adds timestamps like: 1732531234.123456: message
      // Filter lines with timestamp >= lastCommandTimestamp
      const lastCmdSeconds = this.lastCommandTimestamp / 1000;

      const relevantLines: string[] = [];
      for (const line of lines) {
        const match = line.match(/^(\d+\.\d+):/);
        if (match) {
          const lineTimestamp = parseFloat(match[1]);
          if (lineTimestamp >= lastCmdSeconds - 1) {
            // -1 second buffer
            relevantLines.push(line);
          }
        } else {
          // Lines without timestamp - include if we're already collecting
          if (relevantLines.length > 0) {
            relevantLines.push(line);
          }
        }
      }

      return relevantLines;
    } catch {
      return [];
    }
  }

  async getRecentLogs(lines: number = 100): Promise<string[]> {
    try {
      const content = await fsPromises.readFile(this.logFile, 'utf-8');
      const allLines = content.split('\n').filter((line) => line.trim());
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }

  async getFilteredLogs(
    filter: LogFilter,
    sinceLastCommand: boolean = true,
    lines: number = 100
  ): Promise<string[]> {
    const logs = sinceLastCommand
      ? await this.getLogsSinceLastCommand()
      : await this.getRecentLogs(lines);

    if (filter === 'all') return logs;

    const patterns: Record<string, RegExp> = {
      eap: /EAPOL:|EAP:|RX EAPOL|TX EAPOL|CTRL-EVENT-EAP/i,
      state: /State: \w+\s*->\s*\w+|CTRL-EVENT-(CONNECTED|DISCONNECTED)/i,
      scan: /scan|SCAN_|BSS:|Received scan results/i,
      error: /fail|error|TIMEOUT|reason=|TEMP-DISABLED/i,
    };

    const regex = patterns[filter];
    return regex ? logs.filter((line) => regex.test(line)) : logs;
  }

  getInterface(): string {
    return this.iface;
  }
}

export type LogFilter = 'all' | 'eap' | 'state' | 'scan' | 'error';
