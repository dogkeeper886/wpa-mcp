# Stage 1: Build TypeScript
FROM node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies — only production deps carry to runtime
RUN npm prune --omit=dev

# Stage 2: Runtime
FROM node:22-slim

# System dependencies for WiFi control
RUN apt-get update && apt-get install -y --no-install-recommends \
    wpasupplicant \
    isc-dhcp-client \
    iproute2 \
    iputils-ping \
    dnsutils \
    openssl \
    procps \
    sudo \
  && rm -rf /var/lib/apt/lists/*

# Allow node user to run only the specific privileged commands needed
# for WiFi control, DHCP, and network configuration
RUN printf 'node ALL=(ALL) NOPASSWD: \\\n\
  /usr/sbin/wpa_supplicant, \\\n\
  /usr/sbin/wpa_cli, \\\n\
  /usr/sbin/dhclient, \\\n\
  /usr/sbin/ip, \\\n\
  /usr/bin/pkill, \\\n\
  /usr/bin/pgrep, \\\n\
  /usr/bin/mv, \\\n\
  /usr/bin/chmod, \\\n\
  /usr/bin/cat, \\\n\
  /usr/bin/kill\n' \
  > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

# Create wpa_supplicant config directory
# GROUP=node allows the node user to access the control socket without sudo
RUN mkdir -p /etc/wpa_supplicant && \
    printf 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=node\nupdate_config=1\ncountry=US\n' \
    > /etc/wpa_supplicant/wpa_supplicant.conf && \
    chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf

# Create wpa_supplicant runtime directory
RUN mkdir -p /var/run/wpa_supplicant

WORKDIR /app

# Copy built application and production dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy entrypoint and cert import scripts
COPY docker/entrypoint.sh ./scripts/docker-entrypoint.sh
COPY docker/import-certs.mjs ./scripts/import-certs.mjs
RUN chmod +x ./scripts/docker-entrypoint.sh

# Copy certificate files for auto-import at startup
# Owned by node so credential store can read them without permission issues
COPY --chown=node:node certs/ /app/certs/

# Default environment
ENV WIFI_INTERFACE=wlan0
ENV WPA_CONFIG_PATH=/etc/wpa_supplicant/wpa_supplicant.conf
ENV WPA_DEBUG_LEVEL=2
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check using Node's built-in fetch (no curl needed)
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

USER node

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
