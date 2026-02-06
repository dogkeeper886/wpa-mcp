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

# Allow node user to run privileged commands without password
RUN echo 'node ALL=(ALL) NOPASSWD: /usr/sbin/wpa_supplicant, /sbin/wpa_cli, /sbin/dhclient, /sbin/ip, /usr/bin/pkill, /usr/bin/pgrep, /usr/bin/killall, /bin/kill, /usr/bin/systemctl, /usr/bin/resolvectl, /bin/cat' \
  > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

# Create wpa_supplicant config directory
RUN mkdir -p /etc/wpa_supplicant && \
    printf 'ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\ncountry=US\n' \
    > /etc/wpa_supplicant/wpa_supplicant.conf && \
    chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf

# Create wpa_supplicant runtime directory
RUN mkdir -p /var/run/wpa_supplicant

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Default environment
ENV WIFI_INTERFACE=wlan0
ENV WPA_CONFIG_PATH=/etc/wpa_supplicant/wpa_supplicant.conf
ENV WPA_DEBUG_LEVEL=2
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
