#!/usr/bin/env node
// sing-mcp as a web address — for phone apps such as Aru that connect to MCP over the internet (streamable HTTP).
//   npm run serve
// Settings in config.json → "serve": { "port": 8790, "key": "a long random password", "publicUrl": "https://your.domain/sing" }
//   - the app sends the key in a header:  Authorization: Bearer <key>   (or  X-Sing-Key: <key>)
//   - the MCP address is  <publicUrl>/mcp
//   - finished songs are served at  <publicUrl>/files/<random name>.mp3 — no key needed, the random name is the lock
// Put it behind HTTPS (a reverse proxy such as Caddy or Nginx, or a tunnel) before giving the address to a phone.
import { createServer as httpServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { load } from './config.js';
import { createServer } from './tools.js';

const cfg = load();
const opts = cfg.serve || {};
const port = Number(process.env.PORT || opts.port || 8790);
const key = String(process.env.SING_KEY || opts.key || '');
const publicUrl = String(process.env.PUBLIC_URL || opts.publicUrl || `http://localhost:${port}`).replace(/\/+$/, '');
if (key.length < 16) { console.error('先在 config.json 的 serve.key 里设一个至少 16 位的随机密码（npm run config 会帮你生成）。'); process.exit(1); }

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function authorized(req) {
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-sing-key'] || '');
  return !!h && same(h, key);
}
const linkFor = file => `${publicUrl}/files/${encodeURIComponent(basename(file))}`;
const readBody = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 1 << 20) reject(new Error('too big')); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : undefined); } catch (err) { reject(err); } });
  req.on('error', reject);
});

httpServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname.replace(/^\/+/, '/');
  try {
    // the finished songs (a random name each; anyone with the link can listen, so share links only with your person)
    if (req.method === 'GET' && path.startsWith('/files/')) {
      const name = decodeURIComponent(path.slice(7));
      const file = join(load().outDir, basename(name));
      if (!/\.mp3$/i.test(name) || !existsSync(file)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': statSync(file).size, 'Cache-Control': 'private, max-age=86400' });
      createReadStream(file).pipe(res);
      return;
    }
    if (path === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('sing-mcp 在运行。MCP 地址是 /mcp'); return; }
    if (path !== '/mcp') { res.writeHead(404).end(); return; }
    if (!authorized(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: '密码不对' })); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    // stateless: a fresh server for each request, nothing kept between them
    const server = createServer({ linkFor });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, await readBody(req));
  } catch (err) {
    console.error('[sing-mcp]', err.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }));
  }
}).listen(port, () => console.log(`sing-mcp 在 ${port} 端口运行。Aru 里填的地址：${publicUrl}/mcp`));
