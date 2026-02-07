#!/usr/bin/env node
/**
 * import-certs.mjs -- Auto-import certificates into credential store
 *
 * Scans /app/certs/ for client certificate + private key pairs and
 * imports them into the wpa-mcp credential store. Idempotent: skips
 * certs that are already imported.
 *
 * Naming convention:
 *   <identity>_crt.pem  -- client certificate
 *   <identity>_prv.pem  -- matching private key
 *   radius.*_crt.pem | ca*.pem  -- CA certificate (optional, shared)
 *
 * Run: node /app/scripts/import-certs.mjs [CERTS_DIR]
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CredentialStore } from '../dist/lib/credential-store.js';

const CERTS_DIR = process.argv[2] || '/app/certs';

async function findCaCert(dir, files) {
  // Look for CA cert: radius.*_crt.pem or ca*.pem
  const caCert = files.find(f =>
    (f.startsWith('radius.') && f.endsWith('_crt.pem')) ||
    (f.startsWith('ca') && f.endsWith('.pem'))
  );
  return caCert ? join(dir, caCert) : undefined;
}

async function findCertPairs(dir, files) {
  // Find *_crt.pem files that are NOT CA certs
  const clientCerts = files.filter(f =>
    f.endsWith('_crt.pem') &&
    !f.startsWith('radius.') &&
    !f.startsWith('ca')
  );

  const pairs = [];
  for (const certFile of clientCerts) {
    // Derive private key filename: replace _crt.pem with _prv.pem
    const keyFile = certFile.replace('_crt.pem', '_prv.pem');
    if (files.includes(keyFile)) {
      pairs.push({
        clientCert: join(dir, certFile),
        privateKey: join(dir, keyFile),
      });
    } else {
      console.warn(`import-certs: no matching key for ${certFile} (expected ${keyFile}), skipping`);
    }
  }

  return pairs;
}

async function main() {
  if (!existsSync(CERTS_DIR)) {
    console.log(`import-certs: ${CERTS_DIR} not found, nothing to import`);
    return;
  }

  const files = readdirSync(CERTS_DIR).filter(f => f.endsWith('.pem'));
  if (files.length === 0) {
    console.log(`import-certs: no .pem files in ${CERTS_DIR}, nothing to import`);
    return;
  }

  console.log(`import-certs: found ${files.length} PEM file(s) in ${CERTS_DIR}`);

  const store = new CredentialStore();
  const caCertPath = await findCaCert(CERTS_DIR, files);
  const pairs = await findCertPairs(CERTS_DIR, files);

  if (pairs.length === 0) {
    console.log('import-certs: no certificate/key pairs found');
    return;
  }

  if (caCertPath) {
    console.log(`import-certs: using CA cert: ${caCertPath}`);
  }

  let imported = 0;
  let skipped = 0;

  for (const pair of pairs) {
    try {
      const result = await store.storeFromPaths(
        pair.clientCert,
        pair.privateKey,
        caCertPath
      );

      if (result.created) {
        console.log(`import-certs: imported ${result.identity} (id: ${result.id})`);
        imported++;
      } else {
        console.log(`import-certs: already exists ${result.identity} (id: ${result.id}), updated`);
        skipped++;
      }
    } catch (err) {
      console.error(`import-certs: failed to import ${pair.clientCert}: ${err.message}`);
    }
  }

  console.log(`import-certs: done (imported: ${imported}, skipped: ${skipped})`);
}

main().catch(err => {
  console.error(`import-certs: fatal error: ${err.message}`);
  process.exit(1);
});
