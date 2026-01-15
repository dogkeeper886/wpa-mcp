import { readFile, writeFile, readdir, mkdir, rm, access, constants, copyFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

const CREDENTIALS_DIR = join(homedir(), '.config', 'wpa-mcp', 'credentials');

export interface CredentialMetadata {
  id: string;
  identity: string;
  description?: string;
  created_at: string;
  updated_at: string;
  has_ca_cert: boolean;
  has_key_password: boolean;
}

export interface CredentialPaths {
  clientCert: string;
  privateKey: string;
  caCert?: string;
}

export interface StoredCredential {
  metadata: CredentialMetadata;
  paths: CredentialPaths;
}

export interface CertInfo {
  subject?: string;
  issuer?: string;
  not_before?: string;
  not_after?: string;
}

/**
 * Validates credential ID format.
 * Allowed: alphanumeric, dash, underscore. Length 1-64.
 */
function validateId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error('Credential ID is required');
  }
  if (id.length > 64) {
    throw new Error('Credential ID must be 64 characters or less');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Invalid credential ID: must contain only alphanumeric, dash, or underscore');
  }
}

/**
 * Checks if a file exists and is readable.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a certificate file using openssl.
 */
async function validateCertFile(path: string, label: string): Promise<void> {
  if (!await fileExists(path)) {
    throw new Error(`${label} file not found: ${path}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('openssl', ['x509', '-in', path, '-noout']);
    let stderr = '';

    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`Invalid certificate file: ${path}`, { stderr });
        reject(new Error(`Invalid certificate file (${label}): ${path}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to validate ${label}: ${err.message}`));
    });
  });
}

/**
 * Validates a private key file using openssl.
 */
async function validateKeyFile(path: string): Promise<void> {
  if (!await fileExists(path)) {
    throw new Error(`Private key file not found: ${path}`);
  }

  return new Promise((resolve, reject) => {
    // Try RSA first, then EC
    const proc = spawn('openssl', ['pkey', '-in', path, '-noout']);
    let stderr = '';

    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`Invalid private key file: ${path}`, { stderr });
        reject(new Error(`Invalid private key file: ${path}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to validate private key: ${err.message}`));
    });
  });
}

/**
 * Extract CN (Common Name) from certificate.
 */
async function extractCN(certPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('openssl', ['x509', '-in', certPath, '-noout', '-subject', '-nameopt', 'RFC2253']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to extract CN from certificate: ${stderr}`));
        return;
      }

      const match = stdout.match(/CN=([^,\n]+)/);
      if (match) {
        resolve(match[1].trim());
      } else {
        reject(new Error('Certificate does not contain a CN (Common Name)'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run openssl: ${err.message}`));
    });
  });
}

/**
 * Generate credential ID from certificate SHA256 fingerprint.
 */
async function generateIdFromCert(certPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('openssl', ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to get certificate fingerprint: ${stderr}`));
        return;
      }

      const match = stdout.match(/=([A-F0-9:]+)/i);
      if (match) {
        const id = match[1].replace(/:/g, '').substring(0, 16).toLowerCase();
        resolve(id);
      } else {
        reject(new Error('Failed to parse certificate fingerprint'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run openssl: ${err.message}`));
    });
  });
}

/**
 * Parse certificate info using openssl.
 */
async function parseCertInfo(certPath: string): Promise<CertInfo> {
  return new Promise((resolve) => {
    const proc = spawn('openssl', ['x509', '-in', certPath, '-noout', '-subject', '-issuer', '-dates']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({});
        return;
      }

      const info: CertInfo = {};
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('subject=')) {
          info.subject = line.substring(8).trim();
        } else if (line.startsWith('issuer=')) {
          info.issuer = line.substring(7).trim();
        } else if (line.startsWith('notBefore=')) {
          info.not_before = line.substring(10).trim();
        } else if (line.startsWith('notAfter=')) {
          info.not_after = line.substring(9).trim();
        }
      }
      resolve(info);
    });

    proc.on('error', () => {
      resolve({});
    });
  });
}

export class CredentialStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || CREDENTIALS_DIR;
  }

  /**
   * Get the directory path for a credential.
   */
  private credentialDir(id: string): string {
    return join(this.baseDir, id);
  }

  /**
   * Ensure base directory exists.
   */
  private async ensureBaseDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true, mode: 0o700 });
  }

  /**
   * Check if a credential exists.
   */
  async exists(id: string): Promise<boolean> {
    validateId(id);
    try {
      await access(join(this.credentialDir(id), 'meta.json'), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store a credential by copying from file paths.
   * Files are validated with openssl before copying.
   */
  async store(
    id: string,
    identity: string,
    clientCertPath: string,
    privateKeyPath: string,
    caCertPath?: string,
    privateKeyPassword?: string,
    description?: string
  ): Promise<{ created: boolean; path: string }> {
    validateId(id);

    if (!identity || typeof identity !== 'string') {
      throw new Error('Identity is required');
    }

    // Validate source files exist and are valid
    console.log('Validating certificate files', { id, clientCertPath, privateKeyPath, caCertPath });
    await validateCertFile(clientCertPath, 'client_cert');
    await validateKeyFile(privateKeyPath);
    if (caCertPath) {
      await validateCertFile(caCertPath, 'ca_cert');
    }

    await this.ensureBaseDir();

    const credDir = this.credentialDir(id);
    const existed = await this.exists(id);

    // Create credential directory
    await mkdir(credDir, { recursive: true, mode: 0o700 });

    // Copy certificate files to credential store
    const destClientCert = join(credDir, 'client.crt');
    const destPrivateKey = join(credDir, 'client.key');
    const destCaCert = join(credDir, 'ca.crt');

    console.log('Copying certificate files to credential store', { credDir });
    await copyFile(clientCertPath, destClientCert);
    await copyFile(privateKeyPath, destPrivateKey);

    // Set secure permissions
    await writeFile(destClientCert, await readFile(destClientCert), { mode: 0o600 });
    await writeFile(destPrivateKey, await readFile(destPrivateKey), { mode: 0o600 });

    if (caCertPath) {
      await copyFile(caCertPath, destCaCert);
      await writeFile(destCaCert, await readFile(destCaCert), { mode: 0o600 });
    }

    // Write metadata
    const now = new Date().toISOString();
    const metadata: CredentialMetadata = {
      id,
      identity,
      description,
      created_at: existed ? (await this.getMetadata(id))?.created_at || now : now,
      updated_at: now,
      has_ca_cert: !!caCertPath,
      has_key_password: !!privateKeyPassword,
    };

    const metaPath = join(credDir, 'meta.json');
    await writeFile(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });

    // If password provided, store it securely
    if (privateKeyPassword) {
      const passwordFilePath = join(credDir, '.key_password');
      await writeFile(passwordFilePath, privateKeyPassword, { mode: 0o600 });
    }

    console.log('Credential stored successfully', { id, created: !existed });
    return { created: !existed, path: credDir };
  }

  /**
   * Store a credential with auto-generated ID and identity.
   * ID is derived from certificate fingerprint, identity from certificate CN.
   */
  async storeFromPaths(
    clientCertPath: string,
    privateKeyPath: string,
    caCertPath?: string,
    privateKeyPassword?: string,
    description?: string
  ): Promise<{ id: string; identity: string; created: boolean; path: string }> {
    // Validate files first
    console.log('Validating certificate files', { clientCertPath, privateKeyPath, caCertPath });
    await validateCertFile(clientCertPath, 'client_cert');
    await validateKeyFile(privateKeyPath);
    if (caCertPath) {
      await validateCertFile(caCertPath, 'ca_cert');
    }

    // Extract ID and identity from certificate
    const id = await generateIdFromCert(clientCertPath);
    const identity = await extractCN(clientCertPath);

    console.log('Auto-generated credential info', { id, identity });

    // Use existing store method
    const result = await this.store(
      id,
      identity,
      clientCertPath,
      privateKeyPath,
      caCertPath,
      privateKeyPassword,
      description
    );

    return { id, identity, created: result.created, path: result.path };
  }

  /**
   * Get credential metadata only.
   */
  private async getMetadata(id: string): Promise<CredentialMetadata | null> {
    try {
      const metaPath = join(this.credentialDir(id), 'meta.json');
      const content = await readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get a stored credential.
   */
  async get(id: string): Promise<StoredCredential | null> {
    validateId(id);

    const credDir = this.credentialDir(id);
    const metaPath = join(credDir, 'meta.json');

    try {
      const metaContent = await readFile(metaPath, 'utf-8');
      const metadata: CredentialMetadata = JSON.parse(metaContent);

      const clientCertPath = join(credDir, 'client.crt');
      const privateKeyPath = join(credDir, 'client.key');
      const caCertPath = join(credDir, 'ca.crt');

      const paths: CredentialPaths = {
        clientCert: clientCertPath,
        privateKey: privateKeyPath,
      };

      if (metadata.has_ca_cert) {
        paths.caCert = caCertPath;
      }

      return { metadata, paths };
    } catch {
      return null;
    }
  }

  /**
   * Get the private key password if stored.
   */
  async getKeyPassword(id: string): Promise<string | undefined> {
    validateId(id);
    try {
      const passwordPath = join(this.credentialDir(id), '.key_password');
      return await readFile(passwordPath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  /**
   * Get certificate info for a credential.
   */
  async getCertInfo(id: string): Promise<CertInfo> {
    validateId(id);
    const credDir = this.credentialDir(id);
    const clientCertPath = join(credDir, 'client.crt');
    return parseCertInfo(clientCertPath);
  }

  /**
   * Read PEM content for a credential.
   */
  async getPemContent(id: string): Promise<{
    client_cert_pem: string;
    private_key_pem: string;
    ca_cert_pem?: string;
  } | null> {
    validateId(id);

    const cred = await this.get(id);
    if (!cred) {
      return null;
    }

    try {
      const clientCertPem = await readFile(cred.paths.clientCert, 'utf-8');
      const privateKeyPem = await readFile(cred.paths.privateKey, 'utf-8');
      let caCertPem: string | undefined;

      if (cred.paths.caCert) {
        caCertPem = await readFile(cred.paths.caCert, 'utf-8');
      }

      return { client_cert_pem: clientCertPem, private_key_pem: privateKeyPem, ca_cert_pem: caCertPem };
    } catch {
      return null;
    }
  }

  /**
   * List all stored credentials.
   */
  async list(): Promise<CredentialMetadata[]> {
    try {
      await this.ensureBaseDir();
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      const credentials: CredentialMetadata[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadata = await this.getMetadata(entry.name);
          if (metadata) {
            credentials.push(metadata);
          }
        }
      }

      // Sort by updated_at descending
      credentials.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

      return credentials;
    } catch {
      return [];
    }
  }

  /**
   * Delete a credential.
   */
  async delete(id: string): Promise<boolean> {
    validateId(id);

    const credDir = this.credentialDir(id);

    try {
      await rm(credDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
}

// Default singleton instance
export const credentialStore = new CredentialStore();
