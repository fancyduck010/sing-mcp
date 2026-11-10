// One cover, start to finish: the original (网易云 or a local file) → at most five minutes → m4a → 声线 sings it in
// your AI's voice → an mp3 in outDir, plus the lyrics with their timing (the voice change keeps the original's
// timing, so the original's lyric times still fit).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as netease from './netease.js';
import { client } from './shengxian.js';

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 180_000, maxBuffer: 8 << 20 },
  (err, out, stderr) => (err ? reject(new Error(String(stderr || err.message).slice(-300))) : resolve(String(out)))));
const ffmpeg = args => run(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', ...args]);
const duration = async file => Number((await run(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim());
const safe = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

/** { song } = name / link / id, or { file } = a local audio file. Returns { file, title, seconds, lines }. */
export async function cover(config, { song, file, title } = {}) {
  const sx = client(config.shengxian);
  const dir = mkdtempSync(join(tmpdir(), 'sing-'));
  try {
    let source, name, lines = [];
    if (file) {
      if (!existsSync(file)) throw new Error(`找不到文件 ${file}`);
      source = file; name = title || basename(file).replace(/\.\w+$/, '');
    } else {
      const hit = await netease.find(song);
      source = join(dir, 'original.mp3');
      writeFileSync(source, await netease.download(hit.id, config.netease?.musicU));
      name = `${hit.title}${hit.artists ? ` - ${hit.artists}` : ''}`;
      lines = await netease.lyrics(hit.id).catch(() => []);
    }
    const total = await duration(source);
    // long songs: skip a long intro and keep five minutes
    const skip = total > 330 ? 30 : 0;
    if (skip) lines = lines.map(l => ({ ...l, at: Math.round((l.at - skip) * 100) / 100 })).filter(l => l.at >= 0);
    lines = lines.filter(l => l.at < 300);
    const m4a = join(dir, 'source.m4a');
    await ffmpeg([...(skip ? ['-ss', String(skip)] : []), '-i', source, '-t', '300', '-c:a', 'aac', '-b:a', '192k', m4a]);
    const seconds = Math.min(300, total - skip);
    const sung = await sx.cover(readFileSync(m4a), seconds, name.split(' - ')[0], config.shengxian.voice);
    mkdirSync(config.outDir, { recursive: true });
    const out = join(config.outDir, `${safe(name)}-${Date.now().toString(36)}.mp3`);
    const raw = join(dir, 'sung.bin');
    writeFileSync(raw, sung);
    await ffmpeg(['-i', raw, '-c:a', 'libmp3lame', '-b:a', '192k', out]);
    return { file: out, title: name, seconds: Math.round(await duration(out)), lines };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
