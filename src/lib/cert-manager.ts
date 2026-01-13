import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const TEMP_DIR = '/tmp/wpa-mcp-certs';

export interface CertFiles {
  clientCert: string;
  privateKey: string;
  caCert: string;
  cleanup: () => Promise<void>;
}

export async function writeTempCerts(
  clientCertPem: string,
  privateKeyPem: string,
  caCertPem: string
): Promise<CertFiles> {
  const id = randomBytes(8).toString('hex');

  await mkdir(TEMP_DIR, { recursive: true, mode: 0o700 });

  const clientCert = join(TEMP_DIR, `client-${id}.crt`);
  const privateKey = join(TEMP_DIR, `client-${id}.key`);
  const caCert = join(TEMP_DIR, `ca-${id}.crt`);

  await writeFile(clientCert, clientCertPem, { mode: 0o600 });
  await writeFile(privateKey, privateKeyPem, { mode: 0o600 });
  await writeFile(caCert, caCertPem, { mode: 0o600 });

  const cleanup = async () => {
    await unlink(clientCert).catch(() => {});
    await unlink(privateKey).catch(() => {});
    await unlink(caCert).catch(() => {});
  };

  return { clientCert, privateKey, caCert, cleanup };
}
