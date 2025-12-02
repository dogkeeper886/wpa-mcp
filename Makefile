# wpa-mcp Makefile
# Local process management for wpa-mcp server

.PHONY: start stop restart logs status clean help

help:
	@echo "wpa-mcp Makefile targets:"
	@echo "  start     - Start server in background"
	@echo "  stop      - Stop server"
	@echo "  restart   - Restart server"
	@echo "  logs      - Tail log file"
	@echo "  status    - Check if server is running"
	@echo "  clean     - Remove dist/"
	@echo ""
	@echo "For build/install, use npm directly:"
	@echo "  npm install      - Install dependencies"
	@echo "  npm run build    - Compile TypeScript"
	@echo "  npm run start    - Run in foreground"

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
