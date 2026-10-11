// End-to-end check without a real API key: a mock Anthropic endpoint, `wrangler dev`, then the
// same requests the web app and the iMessage relay make. Run: npm run test:e2e
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'e2e-token', PORT = 8799, BASE = `http://127.0.0.1:${PORT}`;
const calls = [];
const CANNED = [
  [/我怀疑6号/, { events: [{ speaker: 4, text: '', claim: '', relations: [
    { from: 4, to: 6, type: 'suspect', hedged: false, label: '怀疑' },
    { from: 4, to: 8, type: 'trust', hedged: true, label: '像好人' }] }], warnings: [] }],
  [/3号踩6保8/, { events: [
    { speaker: 3, text: '3号踩6保8', claim: '', relations: [{ from: 3, to: 6, type: 'suspect', hedged: false, label: '踩' }, { from: 3, to: 8, type: 'trust', hedged: false, label: '保' }] },
    { speaker: 9, text: '9号归票6', claim: '', relations: [{ from: 9, to: 6, type: 'vote', hedged: false, label: '归票' }] }], warnings: [] }],
  [/今天天气不错/, { events: [], warnings: [] }],
];

const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    calls.push({ headers: req.headers, body: parsed });
    const prompt = parsed.messages[0].content;
    const out = CANNED.find(([re]) => re.test(prompt))?.[1] ?? { events: [], warnings: ['mock: no canned answer'] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: parsed.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));

const state = mkdtempSync(join(tmpdir(), 'moontrace-e2e-'));
const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', state, '--show-interactive-dev-session=false',
  '--var', `MOONTRACE_TOKEN:${TOKEN}`, '--var', 'ANTHROPIC_API_KEY:mock', '--var', `ANTHROPIC_BASE_URL:http://127.0.0.1:${mock.address().port}`],
  { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
dev.stdout.on('data', (d) => (log += d));
dev.stderr.on('data', (d) => (log += d));

const api = async (path, body, token = TOKEN) => {
  const res = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
};

try {
  for (let i = 0; ; i++) {
    try { await fetch(BASE + '/api/health'); break; } catch { if (i > 120) throw new Error('wrangler dev did not start:\n' + log); await new Promise((r) => setTimeout(r, 500)); }
  }
  assert.equal((await api('/api/health', null, 'wrong')).status, 401, 'wrong token rejected');
  const health = await api('/api/health');
  assert.equal(health.data.ai, true);
  assert.equal(health.headers.get('access-control-allow-origin'), '*');

  const speech = await api('/api/parse', { mode: 'speech', text: '我怀疑6号，8号像好人。', speaker: 4, n: 12, claims: {} });
  assert.equal(speech.status, 200);
  assert.deepEqual(speech.data.events[0].relations.map((r) => [r.from, r.to, r.type, r.hedged]), [[4, 6, 'suspect', false], [4, 8, 'trust', true]]);
  const first = calls.at(-1);
  assert.equal(first.body.model, 'claude-opus-5-5');
  assert.equal(first.body.fallbacks, 'default');
  assert.match(first.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(first.body.output_config.format.type, 'json_schema');
  assert.equal(first.body.output_config.effort, 'low');
  assert.equal((await api('/api/parse', { mode: 'speech', text: 'x', speaker: 40, n: 12 })).status, 400, 'speaker range checked');

  const room = '/api/rooms/e2e-room-1';
  assert.deepEqual((await api(room + '/sync', { after: 0, n: 12, claims: { 5: '预言家（自称）' } })).data, { entries: [], last: 0 });
  const msg = await api(room + '/messages', { text: '3号踩6保8，9号归票6', clientId: 'imsg-1' });
  assert.equal(msg.data.seq, 1);
  assert.equal(msg.data.reply, '🌙 已记 3号 疑6 保8；9号 投6');
  assert.match(calls.at(-1).body.messages[0].content, /模式：notes\n玩家人数 n：12/, 'room meta from sync reaches the prompt');
  assert.match(calls.at(-1).body.messages[0].content, /5号=预言家（自称）/);

  const before = calls.length;
  const again = await api(room + '/messages', { text: '3号踩6保8，9号归票6', clientId: 'imsg-1' });
  assert.equal(again.data.duplicate, true);
  assert.equal(calls.length, before, 'duplicate delivery does not call the model again');

  assert.equal((await api(room + '/messages', { text: '今天天气不错', clientId: 'imsg-2' })).data.reply, '🌙 没有识别出表态，未记入。');
  assert.equal((await api(room + '/messages', { text: '撤销', clientId: 'imsg-3' })).data.reply, '🌙 已撤回：3号 疑6 保8；9号 投6');
  assert.equal((await api(room + '/messages', { text: '撤销', clientId: 'imsg-3' })).data.duplicate, true, 'retried undo is not applied twice');
  assert.equal((await api(room + '/messages', { text: '撤销', clientId: 'imsg-4' })).data.reply, '🌙 没有可以撤回的记录。');
  assert.match((await api(room + '/messages', { text: '链接' })).data.reply, /#room=e2e-room-1$/);

  const sync = await api(room + '/sync', { after: 0 });
  assert.deepEqual(sync.data.entries.map((e) => [e.seq, e.kind, e.target ?? null]), [[1, 'event', null], [2, 'retract', 1]]);
  assert.equal(sync.data.entries[0].events.length, 2);
  assert.deepEqual((await api(room + '/sync', { after: 2 })).data.entries, []);
  assert.equal((await api('/api/rooms/bad!/sync', {})).status, 404);

  const page = await fetch(BASE + '/');
  assert.match(await page.text(), /月隐/, 'web app served from the same address');
  console.log(`e2e ok (${calls.length} mock model calls)`);
} finally {
  dev.kill();
  mock.close();
  rmSync(state, { recursive: true, force: true });
}
