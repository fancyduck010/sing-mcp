// The original song from 网易云音乐: by name (first search hit), by link (music.163.com, 163cn.tv short links, the
// text the app's 「分享」 gives) or by song id. Free songs come through the public link; members' songs only with your
// own login (MUSIC_U cookie). Lyrics come with their timing, credit lines removed. Personal listening only.
const HEADERS = { Referer: 'https://music.163.com/', 'User-Agent': 'Mozilla/5.0' };
const get = (url, opts = {}) => fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000), ...opts });

/** A song id from whatever was pasted: a link, a short link (followed), the share text, or a bare id; else null. */
export async function idFrom(text) {
  const s = String(text || '').trim();
  const direct = /music\.163\.com\/.*?song.*?[?&#/]id=(\d+)/.exec(s) || /music\.163\.com\/song\/(\d+)/.exec(s) || /^(\d{5,})$/.exec(s);
  if (direct) return direct[1];
  const short = /https?:\/\/(?:163cn\.tv|y\.music\.163\.com|music\.163\.com)\/[^\s，。]+/.exec(s);
  if (!short) return null;
  const res = await fetch(short[0], { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const where = `${res?.url || ''} ${res ? await res.text().catch(() => '') : ''}`;
  return (/song.*?[?&#/]id=(\d+)/.exec(where) || /\/song\/(\d+)/.exec(where) || [])[1] || null;
}

/** { id, title, artists, seconds } for a name, a link or an id. */
export async function find(text) {
  const s = String(text || '').trim();
  if (!s) throw new Error('要写歌名，或者网易云链接');
  const id = /https?:\/\/|^\d{5,}$/.test(s) ? await idFrom(s) : null;
  if (/https?:\/\//.test(s) && !id) throw new Error('这个链接里找不到网易云的歌');
  const hit = id
    ? (await (await get(`https://music.163.com/api/song/detail/?ids=[${id}]`)).json()).songs?.[0]
    : (await (await get(`https://music.163.com/api/search/get?s=${encodeURIComponent(s)}&type=1&limit=5`)).json()).result?.songs?.[0];
  if (!hit) throw new Error('网易云上没有找到这首歌');
  return { id: hit.id, title: hit.name, artists: (hit.artists || hit.ar || []).map(a => a.name).join('/'), seconds: Math.round((hit.duration || hit.dt || 0) / 1000) };
}

/** The song's audio bytes. `musicU` = your own 网易云 login cookie, needed for members' songs. */
export async function download(id, musicU = '') {
  const vip = musicU && await get(`https://music.163.com/api/song/enhance/player/url?ids=[${id}]&br=320000`, { headers: { ...HEADERS, Cookie: `MUSIC_U=${musicU}; os=pc` } })
    .then(r => r.json()).then(d => d.data?.[0]).catch(() => null);
  if (vip?.freeTrialInfo) throw new Error('只拿到试听片段：这首要会员，config 里的 MUSIC_U 过期了或不是会员');
  const res = await get(vip?.url || `https://music.163.com/song/media/outer/url?id=${id}.mp3`, { signal: AbortSignal.timeout(120_000) });
  const audio = Buffer.from(await res.arrayBuffer()), type = res.headers.get('content-type') || '';
  if (!res.ok || audio.length < 50_000 || /html|json|text/i.test(type)) throw new Error(musicU ? '这首下载不到' : '这首下载不到（可能要会员：在 config 里填自己的 MUSIC_U），或者直接给一个 mp3');
  return audio;
}

// credit lines: a short name followed by a colon (作词 : x / Talkbox : x / 和声编写：x), a 「歌名 - 歌手」 line at 0:00, by / 版权
const CREDIT = /^[^:：，。,.!?！？]{1,16}\s*[:：]|^.{0,16}\s+by\s|版权|未经.{0,6}授权|^纯音乐/i;

/** Timed lyric lines [{ at, text }] (seconds; `offset` = seconds cut from the start). Empty when the song has none. */
export async function lyrics(id, offset = 0) {
  const d = await (await get(`https://music.163.com/api/song/lyric?id=${id}&lv=1`)).json().catch(() => ({}));
  return parseLrc(d.lrc?.lyric || '', offset);
}

export function parseLrc(lrc, offset = 0) {
  const out = [];
  for (const raw of String(lrc).replace(/\r/g, '').split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/^(?:\[[^\]]*\])+\s*/, '').trim();
    if (!stamps.length || !text || CREDIT.test(text)) continue;
    const first = Number(stamps[0][1]) * 60 + Number(stamps[0][2]);
    if (/ - /.test(text) && first < 1) continue;
    for (const m of stamps) {
      const at = Number(m[1]) * 60 + Number(m[2]) - offset;
      if (at >= 0) out.push({ at: Math.round(at * 100) / 100, text });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
