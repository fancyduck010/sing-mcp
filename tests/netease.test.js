import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idFrom, parseLrc } from '../src/netease.js';

test('song ids from links, share text and bare ids', async () => {
  assert.equal(await idFrom('https://music.163.com/song?id=3458413815&userid=1'), '3458413815');
  assert.equal(await idFrom('https://music.163.com/#/song?id=29393038'), '29393038');
  assert.equal(await idFrom('分享霍尊的单曲《不死鸟》: https://y.music.163.com/m/song?id=1394167216&uct2=x (来自@网易云音乐)'), '1394167216');
  assert.equal(await idFrom('29393038'), '29393038');
  assert.equal(await idFrom('不死鸟 霍尊'), null);
});

test('credit lines are dropped, timing kept, offset applied', () => {
  const lrc = '[00:00.00] 填词 : 甘世佳/霍尊\n[00:00.10] 钢琴 : 霍尊\n[00:00.20] Talkbox : 正雨\n[00:00.30]不死鸟 - 霍尊\n[00:12.81]和声编写：霍尊\n[00:19.79]浴火 就像永远乐此不疲\n[00:54.88]Don\'t let me know wo yeah';
  assert.deepEqual(parseLrc(lrc).map(l => l.text), ['浴火 就像永远乐此不疲', "Don't let me know wo yeah"]);
  assert.deepEqual(parseLrc('[00:40.00]第一句', 30), [{ at: 10, text: '第一句' }]);
});
