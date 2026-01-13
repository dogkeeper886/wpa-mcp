#!/bin/bash
# Generate wifi_connect_tls tool call JSON from certificate files
# Usage: ./scripts/gen-tls-call.sh <ssid> <identity> <client.crt> <client.key> <ca.crt> [output.json]

set -e

SSID="$1"
IDENTITY="$2"
CLIENT_CERT="$3"
PRIVATE_KEY="$4"
CA_CERT="$5"
OUTPUT="${6:-/tmp/tls-call.json}"

if [[ -z "$SSID" || -z "$IDENTITY" || -z "$CLIENT_CERT" || -z "$PRIVATE_KEY" || -z "$CA_CERT" ]]; then
  echo "Usage: $0 <ssid> <identity> <client.crt> <client.key> <ca.crt> [output.json]"
  echo ""
  echo "Example:"
  echo "  $0 'SecureWiFi' 'device.example.com' client.crt client.key ca.crt"
  exit 1
fi

# Check files exist
for f in "$CLIENT_CERT" "$PRIVATE_KEY" "$CA_CERT"; do
  if [[ ! -f "$f" ]]; then
    echo "Error: File not found: $f"
    exit 1
  fi
done

# Check jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required. Install with: apt install jq"
  exit 1
fi

# Read and escape PEM content for JSON
read_pem() {
  jq -Rs . < "$1"
}

cat > "$OUTPUT" << EOF
{
  "ssid": "$SSID",
  "identity": "$IDENTITY",
  "client_cert_pem": $(read_pem "$CLIENT_CERT"),
  "private_key_pem": $(read_pem "$PRIVATE_KEY"),
  "ca_cert_pem": $(read_pem "$CA_CERT")
}
EOF

echo "Generated: $OUTPUT"
echo ""
echo "Tell AI: Call wifi_connect_tls with params from $OUTPUT"
