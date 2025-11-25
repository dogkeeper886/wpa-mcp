# wpa-mcp Deployment Makefile
# Usage: REMOTE_HOST=user@host make deploy

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

REMOTE_HOST ?= user@remote-host
REMOTE_DIR ?= ~/wpa-mcp

.PHONY: deploy install build start stop restart logs status clean help

help:
	@echo "wpa-mcp Makefile targets:"
	@echo "  deploy      - Rsync source to remote"
	@echo "  install     - npm install on remote"
	@echo "  build       - npm run build on remote"
	@echo "  setup       - deploy + install + build (first time)"
	@echo "  start       - Start server on remote"
	@echo "  stop        - Stop server on remote"
	@echo "  restart     - Restart remote server"
	@echo "  logs        - Tail remote logs"
	@echo "  status      - Check if server is running"
	@echo "  clean       - Remove dist/ on remote"
	@echo ""
	@echo "Configuration:"
	@echo "  REMOTE_HOST=$(REMOTE_HOST)"
	@echo "  REMOTE_DIR=$(REMOTE_DIR)"
	@echo ""
	@echo "Examples:"
	@echo "  make setup           # First time setup"
	@echo "  make deploy restart  # Dev cycle"

deploy:
	@echo "Deploying to $(REMOTE_HOST):$(REMOTE_DIR)..."
	ssh $(REMOTE_HOST) 'mkdir -p $(REMOTE_DIR)'
	rsync -avz --delete \
		--exclude 'node_modules' \
		--exclude 'dist' \
		--exclude '.env' \
		--exclude '.git' \
		--exclude 'wpa-mcp.log' \
		--exclude 'wpa-mcp.pid' \
		./ \
		$(REMOTE_HOST):$(REMOTE_DIR)/
	@echo "Deploy complete."

install:
	@echo "Installing dependencies on remote..."
	ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && npm install'

build:
	@echo "Building on remote..."
	ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && npm run build'

setup: deploy install build
	@echo "Setup complete. Run 'make start' to start the server."

start:
	@echo "Starting server on remote..."
	ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && nohup node dist/index.js > wpa-mcp.log 2>&1 & echo $$! > wpa-mcp.pid'
	@echo "Server started. Use 'make logs' to view output."

stop:
	@echo "Stopping server on remote..."
	ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && if [ -f wpa-mcp.pid ]; then kill $$(cat wpa-mcp.pid) 2>/dev/null || true; rm -f wpa-mcp.pid; fi'
	ssh $(REMOTE_HOST) 'pkill -f "node.*wpa-mcp.*dist/index.js" 2>/dev/null || true'
	@echo "Server stopped."

restart: stop start

logs:
	ssh $(REMOTE_HOST) 'tail -f $(REMOTE_DIR)/wpa-mcp.log'

status:
	@ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && if [ -f wpa-mcp.pid ] && kill -0 $$(cat wpa-mcp.pid) 2>/dev/null; then echo "Server is running (PID: $$(cat wpa-mcp.pid))"; else echo "Server is not running"; fi'

clean:
	ssh $(REMOTE_HOST) 'cd $(REMOTE_DIR) && rm -rf dist/'
