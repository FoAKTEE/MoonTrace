// Moontrace companion server: holds the Anthropic API key, parses text into relations,
// and relays iMessage notes to the web app through per-room logs. Static files come from ../pwa.
import { Room } from './room.js';
import { DEFAULT_MODEL, HELP, MAX_TEXT, ParseError, formatReply, formatSummary, parseText } from './parse.js';

export { Room };

const ROOM_RE = /^[A-Za-z0-9_-]{6,32}$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
}

function sameSecret(given, expected) {
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 60000) throw new ParseError(413, '请求过大。');
  try {
    const body = JSON.parse(text || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {}
  throw new ParseError(400, '请求不是有效的 JSON。');
}

function cleanText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new ParseError(400, '内容为空。');
  if (value.length > MAX_TEXT) throw new ParseError(413, `文字过长（上限 ${MAX_TEXT} 字），请分段发送。`);
  return value.trim();
}

function cleanN(value) {
  if (!Number.isInteger(value) || value < 5 || value > 30) throw new ParseError(400, '玩家人数须为 5–30。');
  return value;
}

function cleanClaims(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [k, name] of Object.entries(value).slice(0, 30)) {
    const seat = Number(k);
    if (Number.isInteger(seat) && seat >= 1 && seat <= 30 && typeof name === 'string' && name.trim()) out[seat] = name.trim().slice(0, 20);
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.MOONTRACE_TOKEN) return json({ error: '服务器还没设置 MOONTRACE_TOKEN。' }, 503);
    const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!sameSecret(given, env.MOONTRACE_TOKEN)) return json({ error: '访问口令不正确。' }, 401);
    try {
      return await route(request, env, url);
    } catch (e) {
      if (e instanceof ParseError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: '服务器内部错误。' }, 500);
    }
  },
};

async function route(request, env, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), model: env.MODEL || DEFAULT_MODEL });
  }
  if (request.method !== 'POST') return json({ error: '不支持的请求。' }, 405);

  if (url.pathname === '/api/parse') {
    const body = await readJson(request);
    const mode = body.mode === 'notes' ? 'notes' : 'speech', n = cleanN(body.n);
    const speaker = mode === 'speech' ? body.speaker : 0;
    if (mode === 'speech' && (!Number.isInteger(speaker) || speaker < 1 || speaker > n)) throw new ParseError(400, '发言者编号无效。');
    return json(await parseText(env, { mode, text: cleanText(body.text), n, speaker, claims: cleanClaims(body.claims) }));
  }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(messages|sync)$/);
  if (!match || !ROOM_RE.test(match[1])) return json({ error: '找不到这个地址或房间号无效。' }, 404);
  const room = env.ROOM.get(env.ROOM.idFromName(match[1]));
  const body = await readJson(request);
  if (match[2] === 'sync') {
    const after = Number.isInteger(body.after) && body.after >= 0 ? body.after : 0;
    const meta = body.n === undefined ? null : { n: cleanN(body.n), claims: cleanClaims(body.claims) };
    return json(await room.sync(after, meta));
  }
  return json(await handleMessage(room, match[1], body, url, env));
}

/** One incoming chat message: a command, or notes to parse and append to the room log. */
async function handleMessage(room, roomId, body, url, env) {
  const text = cleanText(body.text);
  const clientId = typeof body.clientId === 'string' && /^[\w:.-]{1,100}$/.test(body.clientId) ? body.clientId : '';
  const command = text.replace(/[\s。.!！]+$/u, '');
  if (/^(撤销|撤回|undo)$/i.test(command)) {
    const undone = await room.retractLast(clientId);
    if (undone?.duplicate) return { duplicate: true, reply: '' };
    return { reply: undone ? `🌙 已撤回：${undone.summary || undone.text.slice(0, 40)}` : '🌙 没有可以撤回的记录。' };
  }
  if (/^(帮助|help|[?？])$/i.test(command)) return { reply: HELP };
  if (/^(链接|网址|link)$/i.test(command)) return { reply: `🌙 打开网页并加入房间：${url.origin}/#room=${roomId}` };
  if (clientId && (await room.seen(clientId))) return { duplicate: true, reply: '' };

  const meta = await room.meta();
  const result = await parseText(env, { mode: 'notes', text, n: meta.n || 30, nKnown: Boolean(meta.n), claims: meta.claims || {} });
  if (!result.events.length) return { ...result, reply: formatReply(result) };
  const { seq, duplicate, full } = await room.append({ kind: 'event', text, events: result.events, warnings: result.warnings, summary: formatSummary(result.events), clientId, at: Date.now() });
  if (full) throw new ParseError(507, '这个房间的记录已满，请在网页里新建房间。');
  return { seq, ...result, duplicate: Boolean(duplicate), reply: duplicate ? '' : formatReply(result) };
}
