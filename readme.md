# Claudio

Claudio is a lightweight proxy server with a web UI for monitoring HTTP/HTTPS requests from Claude Code and other applications.

## Quick Start

```bash
# Install dependencies
npm install

# Build and start the server
npm start
```

The server will start on `http://localhost:9090` with the web dashboard.

## Usage

Run Claude Code (or any CLI) through the proxy:

```bash
HTTP_PROXY=http://localhost:9090 \
HTTPS_PROXY=http://localhost:9090 \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
claude "your prompt"
```

## Development

```bash
# Run frontend dev server (hot reload)
npm run dev

# Run just the proxy server (requires built frontend)
npm run server
```

## Features

- Real-time request monitoring via WebSocket
- HTTP and HTTPS proxy support
- Clean, minimalistic dashboard
- Request statistics and uptime tracking
