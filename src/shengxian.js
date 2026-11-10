// 声线 (荔枝's AI voice app): its 「唱歌变声」 turns an uploaded song into a cloned voice, keeping the original's
// timing and phrasing. There is no public API — these are the app's own requests, as seen in a Stream capture of
// your own phone, sent with your own login (the request headers). They can stop working whenever the app changes,
// and using them is against the app's terms: your account, your risk. Personal use only, at a normal pace.
import { createHash, createHmac, randomUUID } from 'node:crypto';

const API = 'https://httpproxy101.lzpiqiu.com';
const UPLOAD = 'https://upload.lzpiqiu.com';
const COST = 30;   // points per song, whatever its length (as of 2026-11)

export class LoginError extends Error {}

export function client(sx) {
  const base = sx?.headers || {};
  if (!base.accessToken) throw new LoginError('还没有声线的登录信息：先按教程抓包，运行 npm run config');
  const headers = () => ({ ...base, 'Content-Type': 'application/x-www-form-urlencoded',
    'Trace-ID': randomUUID().replace(/-/g, '').toUpperCase(), uniqueId: randomUUID().toUpperCase() });

  async function call(service, request) {
    const res = await fetch(`${API}/${service}`, { method: 'POST', headers: headers(), body: JSON.stringify(request), signal: AbortSignal.timeout(30_000) });
    // ids here are longer than JavaScript numbers can hold exactly: read every long number as a string
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"')); } catch {}
    if (data.code !== 0) {
      const why = data.msg || data.message || data.code || res.status;
      if (res.status === 401 || res.status === 403 || /登录|token|过期|鉴权|auth|session/i.test(String(why))) throw new LoginError(`声线的登录过期了（${why}），重新抓一次包`);
      throw new Error(`声线拒绝了：${why}`);
    }
    return data.data;
  }

  async function upload(audio) {
    const now = new Date(), day = now.toISOString().slice(0, 10).replace(/-/g, '/');
    const resource = `/msking/${day}/${randomUUID().toUpperCase()}.m4a`;
    const sts = await fetch(`${UPLOAD}/?action=sts.getSessionToken&format=json&customFileName=true`, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { appId: base.appID, deviceId: base.deviceID, hostApp: '', 'x-flow-source': 'ITNet-Upload', 'User-Agent': base['User-Agent'], 'Content-Type': 'application/x-www-form-urlencoded' },
      body: JSON.stringify({ accessModifier: 'public', resource: [resource] }),
    }).then(r => r.json());
    const c = sts.credentials, target = sts.fileNames?.[0]?.target;
    if (!c?.accessKeyId || !target) throw new Error('声线不给上传（登录可能过期了）');
    // an ordinary S3 upload signed with the short-lived key it just gave us (AWS Signature V4)
    const region = sts.region || 'cn', host = new URL(sts.host || UPLOAD).host;
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), date = stamp.slice(0, 8);
    const signed = { 'content-length': String(audio.length), 'content-type': 'application/octet-stream', host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': stamp, 'x-amz-security-token': c.sessionToken };
    const names = Object.keys(signed).sort();
    const canonical = ['PUT', encodeURI(target), '', ...names.map(n => `${n}:${signed[n]}`), '', names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
    const scope = `${date}/${region}/s3/aws4_request`;
    const sha = v => createHash('sha256').update(v).digest('hex');
    const hmac = (k, v, enc) => createHmac('sha256', k).update(v).digest(enc);
    const key = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), region), 's3'), 'aws4_request');
    const sig = hmac(key, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonical)}`, 'hex');
    const res = await fetch(`https://${host}${encodeURI(target)}`, {
      method: 'PUT', body: audio, signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': signed['content-type'], 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': stamp, 'x-amz-security-token': c.sessionToken,
        Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`, 'x-flow-source': 'ITNet-Upload', 'User-Agent': base['User-Agent'] },
    });
    if (!res.ok) throw new Error(`声线上传失败：${res.status}`);
    return target;
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  return {
    async points() {
      const d = await call('fm.lizhi.msking.vip.idl.points.service.UserPointsIdlService/getUserPointsBalance', {});
      return Number(d.totalPoints) || 0;
    },
    /** Your cloned voices: [{ name, characterId, timbreId }]. */
    async voices() {
      const d = await call('fm.lizhi.msking.content.idl.character.service.UserCharacterIdlService/getUserTimbreCharactersV2', { request: {} });
      return (d.characters || []).map(c => ({ name: c.name, characterId: String(c.characterId), timbreId: String(c.defaultTimbre?.timbreId || ''), cloned: c.sourceType === 'CLONE' }));
    },
    /** The song (m4a bytes) sung in `voice`; resolves to the finished mp3 bytes. Usually a minute or two. */
    async cover(audio, seconds, name, voice) {
      if (!voice?.characterId || !voice?.timbreId) throw new Error('还没选音色：在 config 里填 shengxian.voice（npm run config 会列出来）');
      const plan = await call('fm.lizhi.msking.vip.idl.points.service.UserPointsIdlService/getPointsExpendPlan', { request: { requiredPoints: COST } });
      if (!plan.enough) throw new Error(`声线积分不够了（剩 ${plan.currentPoints}，一首要 ${COST}）`);
      const audioUrl = await upload(audio);
      const started = Date.now() - 5000;
      await call('fm.lizhi.msking.content.idl.music.service.SongFactoryIdlService/submitTaskV2', { request: {
        aiTag: false, audioDuration: Math.max(1, Math.round(seconds)), sourceType: 2, audioUrl, characterType: 'USER', confirmedDuplicate: false,
        subtitleStyle: 'keep_original', format: 0, taskType: 0, name: String(name || '翻唱').slice(0, 40), materialEntryType: 2,
        timbreId: voice.timbreId, characterId: voice.characterId, videoAspectRation: 'keep_original',
      } });
      for (let i = 0; i < 90; i++) {
        await wait(i < 3 ? 5000 : 8000);
        const list = await call('fm.lizhi.msking.content.idl.synthesis.service.SynthesisVoiceIdlService/listSynthesisWork', { request: { performanceId: '' } }).catch(() => null);
        const work = list?.works?.find(w => w.createTime >= started);
        if (!work) continue;
        if (work.failReason) throw new Error(`声线没做成：${work.failReason}`);
        if (work.mediaUrl && Number(work.status) === 0) {
          for (let k = 0; ; k++) {
            try {
              const res = await fetch(work.mediaUrl, { signal: AbortSignal.timeout(120_000) });
              if (!res.ok) throw new Error(`成品下载失败：${res.status}`);
              return Buffer.from(await res.arrayBuffer());
            } catch (err) { if (k >= 2) throw err; await wait(3000); }
          }
        }
      }
      throw new Error('声线太久没做完，过一会儿在 App 的作品里看看');
    },
  };
}
