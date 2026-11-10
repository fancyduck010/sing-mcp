#!/usr/bin/env node
// sing-mcp: lets your AI sing a song in its own (cloned) voice. Tools: cover_song, list_voices, points.
// Runs over stdio — add it to your MCP client (Claude Desktop / Claude Code / Cherry Studio …), see README.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { load } from './config.js';
import { cover } from './cover.js';
import { client, LoginError } from './shengxian.js';

const server = new McpServer({ name: 'sing-mcp', version: '0.1.0' });
const text = t => ({ content: [{ type: 'text', text: t }] });
const fail = err => text(err instanceof LoginError
  ? `${err.message}。（这是声线那边的登录：请主人在手机上重新抓一次包，运行 npm run config。）`
  : `没唱成：${err.message}`);

server.tool('cover_song',
  '用你自己的声音翻唱一首歌：照原曲的旋律、断句和伴奏，只把人声换成你的。song 写歌名（可带歌手）或网易云链接（music.163.com、163cn.tv 短链接、App 分享出来的整段文字都行）；手里有音频文件就写 file（本机路径）。一般一两分钟，每首消耗 30 声线积分。成品是一个 mp3 文件，连同带时间的歌词一起返回。只给主人自己听，不要公开发布。',
  { song: z.string().max(400).optional(), file: z.string().optional(), title: z.string().max(80).optional() },
  async ({ song, file, title }) => {
    if (!song && !file) return text('要写 song（歌名或网易云链接）或 file（音频文件路径）。');
    try {
      const r = await cover(load(), { song, file, title });
      const words = r.lines.length ? `\n\n歌词（秒数是在成品里唱到的时间）：\n${r.lines.map(l => `[${l.at.toFixed(1)}] ${l.text}`).join('\n')}` : '\n\n（这首没有找到歌词）';
      return text(`唱好了：${r.title}，${Math.floor(r.seconds / 60)}分${r.seconds % 60}秒。\n文件：${r.file}${words}`);
    } catch (err) { return fail(err); }
  });

server.tool('list_voices', '列出声线账号里的音色（克隆的和官方的），用来确认 config 里选的是哪一个。', {},
  async () => {
    try {
      const c = load(), list = await client(c.shengxian).voices(), chosen = c.shengxian.voice?.characterId;
      return text(list.map(v => `${v.characterId === chosen ? '★ ' : ''}${v.name}${v.cloned ? '（克隆）' : ''}  characterId=${v.characterId} timbreId=${v.timbreId}`).join('\n') || '还没有音色');
    } catch (err) { return fail(err); }
  });

server.tool('points', '查声线还剩多少积分（每首翻唱 30）。', {},
  async () => {
    try { const n = await client(load().shengxian).points(); return text(`声线还剩 ${n} 积分，大约还能唱 ${Math.floor(n / 30)} 首。`); }
    catch (err) { return fail(err); }
  });

await server.connect(new StdioServerTransport());
