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

# Microsoft Playwright MCP server (runs alongside wpa-mcp, shares network
# namespace). Installed globally so the `playwright-mcp` binary is on PATH
# without a network fetch at container start (the entrypoint deletes the
# default route to make WiFi the sole default).
#
# Pinned to an exact version for reproducible builds; bump deliberately.
RUN npm install -g @playwright/mcp@0.0.70

# Pre-install Chromium + its system libs at build time. Two reasons:
# 1. At runtime the container has no default route, so any on-demand
#    Playwright download (~170 MiB) would hang indefinitely.
# 2. Chromium in Debian 12 needs ~25 shared libs (libnss3, libgbm1,
#    libatk*, libcairo2, libpango-1.0-0, libasound2, etc.). `playwright
#    install-deps` resolves the exact set via apt.
#
# PLAYWRIGHT_BROWSERS_PATH pins the cache to a predictable shared path so
# the root install (here) and the node-user runtime (playwright-mcp)
# read from the same location.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright \
 && node /usr/local/lib/node_modules/@playwright/mcp/node_modules/playwright-core/cli.js install-deps chromium \
 && node /usr/local/lib/node_modules/@playwright/mcp/node_modules/playwright-core/cli.js install chromium \
 && chown -R node:node /ms-playwright \
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

# Pre-create credential store dir with node ownership so a mounted
# named volume inherits correct perms (Docker copies image ownership
# into a fresh volume on first mount).
RUN mkdir -p /home/node/.config/wpa-mcp/credentials && \
    chown -R node:node /home/node/.config

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
