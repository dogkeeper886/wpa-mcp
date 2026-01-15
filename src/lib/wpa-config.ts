import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface Hs20CredentialOpts {
  realm: string;
  domain: string;
  identity: string;
  clientCertPath: string;
  privateKeyPath: string;
  caCertPath?: string;
  keyPassword?: string;
  priority?: number;
}

/**
 * Manages wpa_supplicant.conf for HS20/Passpoint configuration.
 * Handles atomic writes and credential lifecycle.
 */
export class WpaConfig {
  constructor(private configPath: string) {}

  /**
   * Read current config file content.
   * Uses sudo if direct read fails (for /etc/wpa_supplicant/).
   */
  async read(): Promise<string> {
    try {
      return await readFile(this.configPath, "utf-8");
    } catch {
      // Try with sudo for /etc paths
      try {
        const { stdout } = await execAsync(`sudo cat "${this.configPath}"`);
        return stdout;
      } catch {
        // Return minimal config if file doesn't exist
        console.log("Config file not found, using minimal config", {
          configPath: this.configPath,
        });
        return "ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\n";
      }
    }
  }

  /**
   * Write config file atomically using sudo.
   * Writes to /tmp first, then moves with sudo.
   */
  async write(content: string): Promise<void> {
    const tempPath = join(
      "/tmp",
      `.wpa_supplicant_${randomBytes(8).toString("hex")}.conf.tmp`
    );

    try {
      // Write to temp file in /tmp (user-writable)
      await writeFile(tempPath, content, { mode: 0o600 });

      // Move to config path with sudo
      await execAsync(`sudo mv "${tempPath}" "${this.configPath}"`);
      await execAsync(`sudo chmod 600 "${this.configPath}"`);

      console.log("Config file updated", { configPath: this.configPath });
    } catch (error) {
      // Clean up temp file on error
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Ensure HS20 settings are enabled in config.
   * Adds interworking=1, auto_interworking=1, hs20=1 if not present.
   */
  async ensureHs20Enabled(): Promise<void> {
    let content = await this.read();
    let modified = false;

    // Check and add each setting
    const settings = [
      { key: "interworking", value: "1" },
      { key: "auto_interworking", value: "1" },
      { key: "hs20", value: "1" },
    ];

    for (const { key, value } of settings) {
      const regex = new RegExp(`^${key}=`, "m");
      if (!regex.test(content)) {
        // Add after ctrl_interface line or at end of global section
        const ctrlMatch = content.match(/^ctrl_interface=.+$/m);
        if (ctrlMatch) {
          const insertPos = ctrlMatch.index! + ctrlMatch[0].length;
          content =
            content.slice(0, insertPos) +
            `\n${key}=${value}` +
            content.slice(insertPos);
        } else {
          content = `${key}=${value}\n` + content;
        }
        modified = true;
        console.log("Added HS20 setting", { key, value });
      }
    }

    if (modified) {
      await this.write(content);
    }
  }

  /**
   * Add an HS20 credential block to config.
   */
  async addHs20Credential(opts: Hs20CredentialOpts): Promise<void> {
    let content = await this.read();

    // Build credential block
    const credLines = [
      "cred={",
      `    realm="${opts.realm}"`,
      `    domain="${opts.domain}"`,
      `    eap=TLS`,
      `    username="${opts.identity}"`,
      `    client_cert="${opts.clientCertPath}"`,
      `    private_key="${opts.privateKeyPath}"`,
    ];

    if (opts.caCertPath) {
      credLines.push(`    ca_cert="${opts.caCertPath}"`);
    }

    if (opts.keyPassword) {
      credLines.push(`    private_key_passwd="${opts.keyPassword}"`);
    }

    if (opts.priority !== undefined) {
      credLines.push(`    priority=${opts.priority}`);
    }

    credLines.push("}");

    const credBlock = credLines.join("\n");

    // Append credential block
    content = content.trimEnd() + "\n\n" + credBlock + "\n";

    await this.write(content);
    console.log("Added HS20 credential", {
      realm: opts.realm,
      domain: opts.domain,
    });
  }

  /**
   * Remove a specific HS20 credential by realm and domain.
   */
  async removeHs20Credential(realm: string, domain: string): Promise<boolean> {
    const content = await this.read();

    // Match cred block containing both realm and domain
    // This regex finds cred={...} blocks
    const credBlockRegex = /cred=\{[^}]+\}/gs;
    let modified = false;

    const newContent = content.replace(credBlockRegex, (match) => {
      const hasRealm = match.includes(`realm="${realm}"`);
      const hasDomain = match.includes(`domain="${domain}"`);

      if (hasRealm && hasDomain) {
        modified = true;
        console.log("Removed HS20 credential", { realm, domain });
        return ""; // Remove this block
      }
      return match; // Keep other blocks
    });

    if (modified) {
      // Clean up extra blank lines
      const cleanedContent = newContent.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
      await this.write(cleanedContent);
    }

    return modified;
  }

  /**
   * Remove all HS20 credentials from config.
   */
  async clearHs20Credentials(): Promise<boolean> {
    const content = await this.read();

    // Remove all cred={...} blocks
    const credBlockRegex = /\n*cred=\{[^}]+\}/gs;
    const newContent = content.replace(credBlockRegex, "");

    if (newContent !== content) {
      const cleanedContent = newContent.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
      await this.write(cleanedContent);
      console.log("Cleared all HS20 credentials");
      return true;
    }

    return false;
  }

  /**
   * Disable auto_interworking (set to 0).
   */
  async disableAutoInterworking(): Promise<boolean> {
    let content = await this.read();

    const regex = /^auto_interworking=1$/m;
    if (regex.test(content)) {
      content = content.replace(regex, "auto_interworking=0");
      await this.write(content);
      console.log("Disabled auto_interworking");
      return true;
    }

    return false;
  }

  /**
   * Check if any HS20 credentials are configured.
   */
  async isHs20Active(): Promise<boolean> {
    const content = await this.read();
    return /cred=\{/s.test(content);
  }

  /**
   * Get current HS20 configuration state.
   */
  async getState(): Promise<{
    interworking: boolean;
    autoInterworking: boolean;
    hs20: boolean;
    credentialCount: number;
  }> {
    const content = await this.read();

    return {
      interworking: /^interworking=1$/m.test(content),
      autoInterworking: /^auto_interworking=1$/m.test(content),
      hs20: /^hs20=1$/m.test(content),
      credentialCount: (content.match(/cred=\{/g) || []).length,
    };
  }
}
