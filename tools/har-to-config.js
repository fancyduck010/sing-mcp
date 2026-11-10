#!/usr/bin/env node
// Reads a Stream capture (.har) of the 声线 app on your own phone and writes config.json with just the login headers
// it needs, then lists your voices so you can pick one:
//   npm run config -- path/to/capture.har            → writes config.json, lists voices
//   npm run config -- path/to/capture.har 小机         → also chooses the voice named 小机
// The HAR holds your login: keep it (and config.json) to yourself, delete the HAR when done.
import { readFileSync } from 'node:fs';
import { CONFIG_PATH, load, save } from '../src/config.js';
import { client } from '../src/shengxian.js';

const [harPath, voiceName] = process.argv.slice(2);
if (!harPath) { console.log('用法：npm run config -- 抓包文件.har [音色名字]'); process.exit(1); }

const har = JSON.parse(readFileSync(harPath, 'utf8'));
const req = har.log.entries.map(e => e.request).find(r => r.url.includes('lzpiqiu.com/fm.lizhi.msking') && r.headers.some(h => h.name === 'accessToken' && h.value));
if (!req) { console.log('这个抓包里没有声线的请求：抓包时在声线 App 里点几下（打开作品列表或积分页）再导出。'); process.exit(1); }

// per-request ids and transport headers are made fresh each time; the rest identifies your app login
const DROP = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'trace-id', 'traceid', 'uniqueid', 'span-id', 'next-span-id', 'content-type']);
const headers = Object.fromEntries(req.headers.filter(h => !DROP.has(h.name.toLowerCase())).map(h => [h.name, h.value]));

const c = load();
c.shengxian = { ...c.shengxian, headers };
const voices = await client(c.shengxian).voices();
if (voiceName) {
  const v = voices.find(x => x.name === voiceName);
  if (!v) { console.log(`没找到叫「${voiceName}」的音色。`); }
  else c.shengxian.voice = { characterId: v.characterId, timbreId: v.timbreId };
}
save(c);
console.log(`写好了：${CONFIG_PATH}\n\n你的音色：`);
for (const v of voices) console.log(`  ${c.shengxian.voice?.characterId === v.characterId ? '★' : ' '} ${v.name}${v.cloned ? '（克隆）' : ''}`);
console.log(c.shengxian.voice ? '\n★ 是翻唱要用的音色。' : '\n还没选音色：再运行一次，在最后加上音色名字。');
console.log(`积分：${await client(c.shengxian).points()}`);
