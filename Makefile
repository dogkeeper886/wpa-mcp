# wpa-mcp Makefile
# Local process management for wpa-mcp server

.PHONY: start stop restart logs status clean help upload-certs docker-build test-integration nm-unmanage nm-restore

# Load .env if exists
-include .env

# Default values (can be overridden in .env or command line)
CERT_REMOTE_DIR ?= /tmp/certs

help:
	@echo "wpa-mcp Makefile targets:"
	@echo "  start        - Start server in background"
	@echo "  stop         - Stop server"
	@echo "  restart      - Restart server"
	@echo "  logs         - Tail log file"
	@echo "  status       - Check if server is running"
	@echo "  clean        - Remove dist/"
	@echo "  upload-certs      - Upload EAP-TLS certificates to remote host"
	@echo "  docker-build      - Build Docker image"
	@echo "  test-integration  - Run Docker netns integration test (requires sudo + WiFi)"
	@echo "  nm-unmanage       - Persistently unmanage WiFi interface from NetworkManager"
	@echo "  nm-restore        - Restore NetworkManager management of WiFi interface"
	@echo ""
	@echo "For build/install, use npm directly:"
	@echo "  npm install      - Install dependencies"
	@echo "  npm run build    - Compile TypeScript"
	@echo "  npm run start    - Run in foreground"
	@echo ""
	@echo "Certificate upload (configure in .env or pass as args):"
	@echo "  make upload-certs CERT_REMOTE_HOST=user@host \\"
	@echo "       CERT_CLIENT=./client.crt CERT_KEY=./client.key CERT_CA=./ca.crt"

start:
	@echo "Starting server..."
	@nohup node dist/index.js > wpa-mcp.log 2>&1 & echo $$! > wpa-mcp.pid
	@echo "Server started (PID: $$(cat wpa-mcp.pid)). Use 'make logs' to view output."

stop:
	@echo "Stopping server..."
	@if [ -f wpa-mcp.pid ]; then kill $$(cat wpa-mcp.pid) 2>/dev/null || true; rm -f wpa-mcp.pid; fi
	@pkill -f "node.*dist/index.js" 2>/dev/null || true
	@echo "Server stopped."

restart: stop start

logs:
	@tail -f wpa-mcp.log

status:
	@if [ -f wpa-mcp.pid ] && kill -0 $$(cat wpa-mcp.pid) 2>/dev/null; then \
		echo "Server is running (PID: $$(cat wpa-mcp.pid))"; \
	else \
		echo "Server is not running"; \
	fi

clean:
	@rm -rf dist/
	@echo "Cleaned dist/"

# Upload EAP-TLS certificates to remote host
# Usage: make upload-certs CERT_REMOTE_HOST=user@host CERT_CLIENT=./client.crt CERT_KEY=./client.key
# Optional: CERT_CA=./ca.crt CERT_REMOTE_DIR=/tmp/certs
upload-certs:
	@if [ -z "$(CERT_REMOTE_HOST)" ]; then \
		echo "Error: CERT_REMOTE_HOST not set"; \
		echo "Usage: make upload-certs CERT_REMOTE_HOST=user@host CERT_CLIENT=./client.crt CERT_KEY=./client.key"; \
		exit 1; \
	fi
	@if [ -z "$(CERT_CLIENT)" ] || [ -z "$(CERT_KEY)" ]; then \
		echo "Error: CERT_CLIENT and CERT_KEY are required"; \
		exit 1; \
	fi
	@if [ ! -f "$(CERT_CLIENT)" ]; then \
		echo "Error: Client certificate not found: $(CERT_CLIENT)"; \
		exit 1; \
	fi
	@if [ ! -f "$(CERT_KEY)" ]; then \
		echo "Error: Private key not found: $(CERT_KEY)"; \
		exit 1; \
	fi
	@echo "Creating remote directory $(CERT_REMOTE_DIR)..."
	@ssh $(CERT_REMOTE_HOST) "mkdir -p $(CERT_REMOTE_DIR) && chmod 700 $(CERT_REMOTE_DIR)"
	@echo "Uploading certificates to $(CERT_REMOTE_HOST):$(CERT_REMOTE_DIR)/"
	@scp $(CERT_CLIENT) $(CERT_REMOTE_HOST):$(CERT_REMOTE_DIR)/client.crt
	@scp $(CERT_KEY) $(CERT_REMOTE_HOST):$(CERT_REMOTE_DIR)/client.key
	@if [ -n "$(CERT_CA)" ] && [ -f "$(CERT_CA)" ]; then \
		scp $(CERT_CA) $(CERT_REMOTE_HOST):$(CERT_REMOTE_DIR)/ca.crt; \
		echo "Uploaded: client.crt, client.key, ca.crt"; \
	else \
		echo "Uploaded: client.crt, client.key (no CA cert)"; \
	fi
	@ssh $(CERT_REMOTE_HOST) "chmod 600 $(CERT_REMOTE_DIR)/*.crt $(CERT_REMOTE_DIR)/*.key 2>/dev/null || true"
	@echo ""
	@echo "Certificates uploaded. Use credential_store with paths:"
	@echo "  client_cert_path: $(CERT_REMOTE_DIR)/client.crt"
	@echo "  private_key_path: $(CERT_REMOTE_DIR)/client.key"
	@if [ -n "$(CERT_CA)" ] && [ -f "$(CERT_CA)" ]; then \
		echo "  ca_cert_path: $(CERT_REMOTE_DIR)/ca.crt"; \
	fi

# Docker image build
# Usage: make docker-build [WPA_MCP_IMAGE=wpa-mcp:latest]
WPA_MCP_IMAGE ?= wpa-mcp:latest
docker-build:
	docker build -t $(WPA_MCP_IMAGE) .

# Integration test: Docker + netns WiFi isolation
# Requires: sudo, real WiFi interface, Docker
# Usage: sudo make test-integration TEST_SSID="MyNetwork" TEST_PSK="password" [WIFI_INTERFACE=wlan0]
test-integration:
	@if [ -z "$(TEST_SSID)" ]; then \
		echo "Error: TEST_SSID is required"; \
		echo "Usage: sudo make test-integration TEST_SSID=\"MyNetwork\" TEST_PSK=\"password\""; \
		exit 1; \
	fi
	WIFI_INTERFACE="$(WIFI_INTERFACE)" TEST_SSID="$(TEST_SSID)" TEST_PSK="$(TEST_PSK)" \
		WPA_MCP_IMAGE="wpa-mcp:test" \
		./tests/integration/test-docker-netns.sh

# NetworkManager: persistently unmanage WiFi interface
# Creates a drop-in config so NM ignores the interface across reboots.
# Usage: sudo make nm-unmanage WIFI_INTERFACE=wlp6s0
WIFI_INTERFACE ?= wlan0
NM_CONF_DIR := /etc/NetworkManager/conf.d
NM_CONF_FILE := $(NM_CONF_DIR)/99-unmanaged-$(WIFI_INTERFACE).conf

nm-unmanage:
	@if [ "$$(id -u)" -ne 0 ]; then \
		echo "Error: must run as root"; \
		echo "Usage: sudo make nm-unmanage WIFI_INTERFACE=$(WIFI_INTERFACE)"; \
		exit 1; \
	fi
	@if ! command -v nmcli >/dev/null 2>&1; then \
		echo "Error: NetworkManager (nmcli) not found"; \
		exit 1; \
	fi
	@mkdir -p $(NM_CONF_DIR)
	@printf '[keyfile]\nunmanaged-devices=interface-name:$(WIFI_INTERFACE)\n' \
		> $(NM_CONF_FILE)
	@echo "Created $(NM_CONF_FILE)"
	@systemctl restart NetworkManager
	@echo "NetworkManager restarted. $(WIFI_INTERFACE) is now persistently unmanaged."
	@echo "Verify: nmcli device status | grep $(WIFI_INTERFACE)"

# NetworkManager: restore management of WiFi interface
# Removes the drop-in config and restarts NM.
# Usage: sudo make nm-restore WIFI_INTERFACE=wlp6s0
nm-restore:
	@if [ "$$(id -u)" -ne 0 ]; then \
		echo "Error: must run as root"; \
		echo "Usage: sudo make nm-restore WIFI_INTERFACE=$(WIFI_INTERFACE)"; \
		exit 1; \
	fi
	@if [ ! -f "$(NM_CONF_FILE)" ]; then \
		echo "Nothing to restore: $(NM_CONF_FILE) does not exist"; \
		exit 0; \
	fi
	@rm -f $(NM_CONF_FILE)
	@echo "Removed $(NM_CONF_FILE)"
	@systemctl restart NetworkManager
	@echo "NetworkManager restarted. $(WIFI_INTERFACE) is managed again."
	@echo "Verify: nmcli device status | grep $(WIFI_INTERFACE)"
