# docker/Makefile -- Docker lifecycle management for wpa-mcp
#
# Usage:
#   make build       # Build Docker image
#   sudo make start  # Start container with WiFi phy moved into netns
#   make stop        # Stop container
#   make logs        # Follow container logs
#   make status      # Check container status
#   make help        # Show available targets

.PHONY: build start stop restart logs status shell clean help

# Load .env from project root if it exists
-include ../.env

# Configuration (can be overridden in .env or command line)
WIFI_INTERFACE ?= wlan0
WPA_MCP_IMAGE ?= wpa-mcp:latest
PORT ?= 3000
WPA_DEBUG_LEVEL ?= 2
CONTAINER_NAME := wpa-mcp

# Project root (parent of docker/)
PROJECT_ROOT := $(shell cd .. && pwd)

help:
	@echo "wpa-mcp Docker Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  build    - Build Docker image"
	@echo "  start    - Start container (requires sudo)"
	@echo "  stop     - Stop and remove container"
	@echo "  restart  - Stop then start"
	@echo "  logs     - Follow container logs"
	@echo "  status   - Check container status and health"
	@echo "  shell    - Open bash in running container"
	@echo "  clean    - Remove Docker image"
	@echo "  help     - Show this help"
	@echo ""
	@echo "Current configuration (from .env or defaults):"
	@echo "  WIFI_INTERFACE:   $(WIFI_INTERFACE)"
	@echo "  WPA_MCP_IMAGE:    $(WPA_MCP_IMAGE)"
	@echo "  PORT:             $(PORT)"
	@echo "  WPA_DEBUG_LEVEL:  $(WPA_DEBUG_LEVEL)"

build:
	@echo "Building Docker image '$(WPA_MCP_IMAGE)'..."
	docker build -t $(WPA_MCP_IMAGE) -f Dockerfile $(PROJECT_ROOT)
	@echo "Build complete: $(WPA_MCP_IMAGE)"

start:
	@if [ "$$(id -u)" -ne 0 ]; then \
		echo "Error: must run as root (need iw phy set netns)"; \
		echo "Usage: sudo make start"; \
		exit 1; \
	fi
	@echo "Starting wpa-mcp container..."
	./run.sh $(WIFI_INTERFACE)

stop:
	@echo "Stopping container '$(CONTAINER_NAME)'..."
	@docker rm -f $(CONTAINER_NAME) 2>/dev/null || echo "Container not running"
	@echo "Stopped. WiFi interface should return to host."

restart: stop
	@sleep 2
	$(MAKE) start

logs:
	@docker logs -f $(CONTAINER_NAME)

status:
	@echo "Container status:"
	@docker ps --filter "name=$(CONTAINER_NAME)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  Not running"
	@echo ""
	@if docker ps -q --filter "name=$(CONTAINER_NAME)" | grep -q .; then \
		echo "Health check:"; \
		curl -sf "http://localhost:$(PORT)/health" && echo "" || echo "  Health check failed"; \
		echo ""; \
		echo "Container network:"; \
		docker exec $(CONTAINER_NAME) ip addr show $(WIFI_INTERFACE) 2>/dev/null || echo "  Interface not found"; \
	fi

shell:
	@docker exec -it $(CONTAINER_NAME) bash

clean:
	@echo "Removing Docker image '$(WPA_MCP_IMAGE)'..."
	@docker rmi $(WPA_MCP_IMAGE) 2>/dev/null || echo "Image not found"
	@echo "Done."
