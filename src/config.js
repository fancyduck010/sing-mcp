// Settings live in one JSON file next to the project (never commit it — it holds your 声线 login):
// { "shengxian": { "headers": {...}, "voice": { "characterId": "...", "timbreId": "..." } },
//   "netease": { "musicU": "" }, "outDir": "./out" }
// tools/har-to-config.js writes it from a Stream capture. SING_MCP_CONFIG points elsewhere if you like.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = resolve(process.env.SING_MCP_CONFIG || `${ROOT}/config.json`);

export function load() {
  if (!existsSync(CONFIG_PATH)) return { shengxian: {}, netease: {}, outDir: `${ROOT}/out` };
  const c = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  c.shengxian ||= {}; c.netease ||= {};
  c.outDir = resolve(dirname(CONFIG_PATH), c.outDir || './out');
  return c;
}

export function save(c) {
  writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2), { mode: 0o600 });
}
