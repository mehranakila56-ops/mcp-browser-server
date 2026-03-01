#!/usr/bin/env node
/**
 * mcp-browser-server
 * 
 * MCP server that gives AI assistants full browser control.
 * Implements the Model Context Protocol to expose browser actions as tools.
 */

'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

// Browser tools definition
const BROWSER_TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL. Returns the page title and current URL after navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (e.g. https://example.com)',
        },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          description: 'When to consider navigation complete (default: networkidle)',
          default: 'networkidle',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page. Returns a base64-encoded PNG image.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to screenshot a specific element',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture the full scrollable page (default: false)',
          default: false,
        },
      },
    },
  },
  {
    name: 'browser_click',
    description: 'Click on an element in the browser. Can target by CSS selector, text content, or ARIA label.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        text: {
          type: 'string',
          description: 'Click element containing this text (alternative to selector)',
        },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field or textarea.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'Text to type into the field',
        },
        clear: {
          type: 'boolean',
          description: 'Clear the field before typing (default: false)',
          default: false,
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_get_content',
    description: 'Get the text content or HTML of the current page or a specific element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to get content from (default: full page)',
        },
        format: {
          type: 'string',
          enum: ['text', 'html', 'markdown'],
          description: 'Output format (default: text)',
          default: 'text',
        },
        maxLength: {
          type: 'number',
          description: 'Truncate output to this many characters (default: 10000)',
          default: 10000,
        },
      },
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the browser and return the result. Useful for complex extractions.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute. Use return to get a value.',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_wait',
    description: 'Wait for an element to appear on the page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Max wait time in milliseconds (default: 30000)',
          default: 30000,
        },
        state: {
          type: 'string',
          enum: ['visible', 'hidden', 'attached', 'detached'],
          description: 'Element state to wait for (default: visible)',
          default: 'visible',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page or an element.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'top', 'bottom'],
          description: 'Scroll direction',
          default: 'down',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (for up/down)',
          default: 400,
        },
      },
    },
  },
];

class BrowserMCPServer {
  constructor() {
    this.server = new Server(
      { name: 'mcp-browser-server', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );
    this.browser = null;
    this.page = null;
    this._setupHandlers();
  }

  _setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: BROWSER_TOOLS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        await this._ensureBrowser();
        return await this._executeTool(name, args || {});
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Browser error: ${error.message}`);
      }
    });
  }

  async _ensureBrowser() {
    if (this.page && !this.page.isClosed()) return;

    const provider = process.env.BROWSER_PROVIDER || 'local';

    if (provider === 'anchorbrowser') {
      const wsUrl = await this._createAnchorSession();
      const puppeteer = require('puppeteer-core');
      this.browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
    } else if (provider === 'browserbase') {
      const wsUrl = await this._createBrowserbaseSession();
      const puppeteer = require('puppeteer-core');
      this.browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
    } else {
      // Local browser (requires Puppeteer or Chrome installed)
      const puppeteer = require('puppeteer-core');
      this.browser = await puppeteer.launch({
        headless: process.env.HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();
  }

  async _createAnchorSession() {
    const apiKey = process.env.ANCHOR_API_KEY;
    if (!apiKey) throw new Error('ANCHOR_API_KEY not set');

    const res = await fetch('https://api.anchorbrowser.io/v1/sessions', {
      method: 'POST',
      headers: { 'anchor-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: { screen: { width: 1920, height: 1080 } } }),
    });

    if (!res.ok) throw new Error(`AnchorBrowser error: ${res.status}`);
    const data = await res.json();
    return data.cdp_url;
  }

  async _createBrowserbaseSession() {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) throw new Error('BROWSERBASE_API_KEY not set');

    const res = await fetch('https://www.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: { 'x-bb-api-key': apiKey, 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`Browserbase error: ${res.status}`);
    const data = await res.json();
    return data.wsUrl;
  }

  async _executeTool(name, args) {
    const page = this.page;

    switch (name) {
      case 'browser_navigate': {
        const waitUntil = args.waitUntil || 'networkidle';
        await page.goto(args.url, { waitUntil, timeout: 30000 });
        const title = await page.title();
        const url = page.url();
        return {
          content: [{ type: 'text', text: `Navigated to: ${url}\nTitle: ${title}` }],
        };
      }

      case 'browser_screenshot': {
        const ssOptions = { encoding: 'base64' };
        if (args.fullPage) ssOptions.fullPage = true;
        let screenshot;
        if (args.selector) {
          const el = await page.$(args.selector);
          if (!el) throw new McpError(ErrorCode.InvalidParams, `Element not found: ${args.selector}`);
          screenshot = await el.screenshot({ encoding: 'base64' });
        } else {
          screenshot = await page.screenshot(ssOptions);
        }
        return {
          content: [{ type: 'image', data: screenshot, mimeType: 'image/png' }],
        };
      }

      case 'browser_click': {
        if (args.selector) {
          await page.click(args.selector);
        } else if (args.text) {
          await page.evaluate((text) => {
            const elements = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
            for (const el of elements) {
              if (el.textContent?.trim().includes(text)) {
                el.click();
                return;
              }
            }
            throw new Error(`No element with text: ${text}`);
          }, args.text);
        }
        return { content: [{ type: 'text', text: 'Clicked successfully' }] };
      }

      case 'browser_type': {
        if (args.clear) {
          await page.click(args.selector, { clickCount: 3 });
          await page.keyboard.press('Backspace');
        }
        await page.type(args.selector, args.text);
        return { content: [{ type: 'text', text: `Typed "${args.text}" into ${args.selector}` }] };
      }

      case 'browser_get_content': {
        const format = args.format || 'text';
        const maxLength = args.maxLength || 10000;
        let content;

        if (format === 'html') {
          content = args.selector
            ? await page.$eval(args.selector, el => el.outerHTML)
            : await page.content();
        } else {
          content = args.selector
            ? await page.$eval(args.selector, el => el.textContent || '')
            : await page.evaluate(() => document.body.innerText);
        }

        if (content.length > maxLength) {
          content = content.substring(0, maxLength) + '... [truncated]';
        }

        return { content: [{ type: 'text', text: content }] };
      }

      case 'browser_evaluate': {
        const result = await page.evaluate(args.script);
        const text = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        return { content: [{ type: 'text', text }] };
      }

      case 'browser_wait': {
        await page.waitForSelector(args.selector, {
          timeout: args.timeout || 30000,
          state: args.state || 'visible',
        });
        return { content: [{ type: 'text', text: `Element "${args.selector}" is now ${args.state || 'visible'}` }] };
      }

      case 'browser_scroll': {
        const direction = args.direction || 'down';
        const amount = args.amount || 400;
        if (direction === 'top') {
          await page.evaluate(() => window.scrollTo(0, 0));
        } else if (direction === 'bottom') {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } else {
          const y = direction === 'down' ? amount : -amount;
          await page.evaluate((y) => window.scrollBy(0, y), y);
        }
        return { content: [{ type: 'text', text: `Scrolled ${direction}` }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('mcp-browser-server running on stdio');
  }
}

const server = new BrowserMCPServer();
server.run().catch(console.error);
