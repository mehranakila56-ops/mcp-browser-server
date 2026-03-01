# mcp-browser-server

> Give your AI assistant a real browser. Navigate, click, fill forms, and take screenshots via any MCP client.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants like Claude full browser control. Connect to local or cloud browsers (AnchorBrowser, Browserbase) and automate web interactions directly from your AI workflows.

## What it does

Instead of telling your AI agent how to scrape a website, you give it a real browser. The AI can:

- Navigate to any URL
- Click buttons and links  
- Fill out and submit forms
- Take screenshots
- Read page content and extract data
- Handle authentication (SSO, multi-step logins)

## MCP Tools Provided

| Tool | Description |
|------|-------------|
| `browser_navigate` | Go to a URL |
| `browser_click` | Click an element by selector or description |
| `browser_type` | Type text into an input field |
| `browser_screenshot` | Take a screenshot of the current page |
| `browser_get_content` | Get page HTML or extracted text |
| `browser_evaluate` | Run JavaScript in the browser |
| `browser_wait` | Wait for an element or condition |
| `browser_scroll` | Scroll the page |

## Installation

```bash
npm install -g mcp-browser-server
```

Or clone and run locally:

```bash
git clone https://github.com/mehranakila56-ops/mcp-browser-server.git
cd mcp-browser-server
npm install
```

## Configuration

### With Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["mcp-browser-server"],
      "env": {
        "BROWSER_PROVIDER": "local",
        "HEADLESS": "true"
      }
    }
  }
}
```

### With Cloud Browser (AnchorBrowser)

For stealth mode, CAPTCHA solving, and residential proxies:

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["mcp-browser-server"],
      "env": {
        "BROWSER_PROVIDER": "anchorbrowser",
        "ANCHOR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_PROVIDER` | `local` | `local`, `anchorbrowser`, `browserbase` |
| `HEADLESS` | `true` | Run browser in headless mode (local only) |
| `ANCHOR_API_KEY` | — | AnchorBrowser API key |
| `BROWSERBASE_API_KEY` | — | Browserbase API key |
| `SESSION_TIMEOUT_MS` | `300000` | Browser session timeout (5 min) |
| `SCREENSHOT_FORMAT` | `png` | Screenshot format: `png` or `jpeg` |

## Usage Examples

Once configured with Claude, you can say:

> "Go to github.com/trending and show me the top 5 repos today"

> "Log into our staging environment at staging.example.com and check if the signup form works"

> "Take a screenshot of https://example.com and describe what you see"

> "Fill out the contact form at example.com/contact with my info: name=Jane, email=jane@example.com, message='Hello'"

## Architecture

```
Claude / AI Assistant
       ↓ MCP protocol
mcp-browser-server
       ↓ WebSocket / CDP
Browser (local Chromium or cloud)
       ↓
Target Website
```

## Why Cloud Browsers?

Local browsers get blocked by CAPTCHAs and bot detection. Cloud browsers like [AnchorBrowser](https://anchorbrowser.io) provide:

- ✅ Human fingerprinting (passes Cloudflare, DataDome)
- ✅ Residential proxy rotation
- ✅ CAPTCHA auto-solving
- ✅ Persistent sessions across runs
- ✅ No local Chrome installation needed

## Development

```bash
npm install
npm run dev   # Starts MCP server with hot reload

# Run against a specific provider
BROWSER_PROVIDER=local npm run dev
```

## Contributing

PRs welcome! Please open an issue first for significant changes.

## License

MIT

---

Related: [awesome-ai-browser-agents](https://github.com/mehranakila56-ops/awesome-ai-browser-agents) — curated list of browser automation tools for AI agents
