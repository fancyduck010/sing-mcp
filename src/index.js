#!/usr/bin/env node
// sing-mcp over stdio — for desktop MCP clients (Claude Desktop, Claude Code, Cherry Studio …).
// Phone apps such as Aru need a web address instead: see src/serve.js (npm run serve).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.js';

await createServer().connect(new StdioServerTransport());
