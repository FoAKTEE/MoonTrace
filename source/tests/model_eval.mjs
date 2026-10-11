// Compares the current inference with the v3.0 independent-evidence model on simulated games and on
// recorded real games. Not pass/fail: a reference to watch whenever the model changes.
// Usage: node tests/model_eval.mjs [games per scenario, default 400]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), src = join(here, '../src');
const code = readFileSync(join(src, 'core.js'), 'utf8') + '\n' + readFileSync(join(src, 'roles-core.js'), 'utf8')
  + '\nreturn {infer,newState,sanitizeState,cardinalityMarginals,TYPES};\n})()';
const M = new Function(`const api = ${code}; return api;`)();

// v3.0 model, kept verbatim for comparison: speaker-independent λ, per-pair clip ±1.2, then cardinality DP.
const OLD = { suspect: Math.log(1.8), trust: -Math.log(1.8), vote: Math.log(1.35), checkW: Math.log(3), checkG: -Math.log(3) };
function legacy(s) {
  const latest = new Map();
  for (const e of s.events) if (e.round <= s.round) for (const r of e.relations) if (OLD[r.type]) latest.set(`${r.from}:${r.to}:${e.round}`, { ...r, round: e.round });
  const raw = new Map();
  for (const r of latest.values()) {
    const src = s.players[r.from - 1], muted = s.muteKnownWolves && src.fixed === 'wolf';
    const v = OLD[r.type] * r.strength * (muted ? 0 : src.weight) * Math.pow(s.decay, Math.max(0, s.round - r.round));
    raw.set(`${r.from}:${r.to}`, (raw.get(`${r.from}:${r.to}`) || 0) + v);
  }
  const scores = Array(s.n).fill(0);
  for (const [k, v] of raw) scores[+k.split(':')[1] - 1] += Math.max(-1.2, Math.min(1.2, v)) * s.sensitivity;
  const unknown = s.players.filter((p) => p.fixed === 'unknown'), K = s.wolves - s.players.filter((p) => p.fixed === 'wolf').length;
  const ps = s.players.map((p) => (p.fixed === 'wolf' ? 1 : 0)), u = M.cardinalityMarginals(unknown.map((p) => scores[p.id - 1]), K);
  unknown.forEach((p, i) => (ps[p.id - 1] = u[i]));
  return ps;
}

/** Scored on players still alive: the live question is who among them is a wolf. */
function metrics(ps, wolves, good, alive = () => true) {
  wolves = new Set([...wolves].filter(alive)); good = new Set([...good].filter(alive));
  const pairs = [...wolves].flatMap((w) => [...good].map((g) => [w, g]));
  const auc = pairs.reduce((a, [w, g]) => a + (ps[w - 1] > ps[g - 1] ? 1 : ps[w - 1] === ps[g - 1] ? 0.5 : 0), 0) / pairs.length;
  const ids = [...wolves, ...good], top = [...ids].sort((a, b) => ps[b - 1] - ps[a - 1]).slice(0, wolves.size);
  const p = (i) => Math.min(1 - 1e-6, Math.max(1e-6, ps[i - 1]));
  return {
    auc, hits: top.filter((i) => wolves.has(i)).length / wolves.size,
    gap: [...wolves].reduce((a, i) => a + ps[i - 1], 0) / wolves.size - [...good].reduce((a, i) => a + ps[i - 1], 0) / good.size,
    brier: ids.reduce((a, i) => a + (ps[i - 1] - (wolves.has(i) ? 1 : 0)) ** 2, 0) / ids.length,
    logloss: -ids.reduce((a, i) => a + (wolves.has(i) ? Math.log(p(i)) : Math.log(1 - p(i))), 0) / ids.length,
  };
}

// ---- Simulator: a behaviour model deliberately looser than the inference model (herding, noisy reads, bussing).
function simulate(rand, c) {
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const n = c.n, ids = Array.from({ length: n }, (_, i) => i + 1), x = Array(n + 1).fill(0);
  const shuffled = [...ids].sort(() => rand() - 0.5), wolves = new Set(shuffled.slice(0, c.K));
  wolves.forEach((w) => (x[w] = 1));
  const goods = ids.filter((i) => !x[i]), seer = c.seer === false ? 0 : pick(goods), fake = rand() < c.fakeSeer ? pick([...wolves]) : 0;
  const belief = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (!i || !j || i === j ? -9 : c.skill * x[j] + gauss())));
  const s = M.newState(n, c.K), alive = Array(n + 1).fill(true), heat = Array(n + 1).fill(0), checked = new Set();
  s.round = c.rounds; let t = 0;
  if (seer) s.players[seer - 1].claimedRole = 'seer';
  if (fake) s.players[fake - 1].claimedRole = 'seer';
  const kill = (id, why) => { alive[id] = false; s.players[id - 1].alive = false; s.players[id - 1].deathReason = c.unmarked ? 'unknown' : why; };
  for (let r = 1; r <= c.rounds; r++) {
    let report = null;
    if (seer && alive[seer]) { const opts = ids.filter((j) => j !== seer && alive[j] && !checked.has(j)); if (opts.length) { const j = pick(opts); checked.add(j); report = j; } }
    const prey = goods.filter((j) => alive[j]);
    if (prey.length) kill(seer && alive[seer] && rand() < 0.4 && r > 1 ? seer : pick(prey), 'attack');
    const speakers = ids.filter((i) => alive[i]);
    for (const i of speakers) {
      const rels = [], add = (to, type, firm = rand() < 0.6) => { if (to && to !== i) rels.push({ from: i, to, type, strength: firm ? 0.85 : 0.65 }); };
      const others2 = ids.filter((j) => j !== i && alive[j]);
      if (i === seer && report) add(report, x[report] ? 'checkW' : 'checkG', true);
      if (i === fake) { if (rand() < 0.7) add(seer && alive[seer] && rand() < 0.5 ? seer : pick(goods.filter((j) => alive[j] && j !== i) || [0]), 'checkW', true); else add(pick([...wolves].filter((j) => j !== i)), 'checkG', true); }
      if (!x[i]) {
        const rank = [...others2].sort((a, b) => belief[i][b] + c.herd * heat[b] - (belief[i][a] + c.herd * heat[a]));
        add(rank[0], 'suspect'); if (rand() < 0.5) add(rank[1], 'suspect'); if (rand() < 0.6) add(rank.at(-1), 'trust');
      } else {
        const mates = others2.filter((j) => x[j]), villagers = others2.filter((j) => !x[j]);
        add(rand() < c.bus && mates.length ? pick(mates) : pick(villagers), 'suspect');
        if (rand() < 0.6) add(rand() < c.defend && mates.length ? pick(mates) : pick(villagers), 'trust');
      }
      for (const rel of rels) if (rel.type === 'suspect') heat[rel.to]++;
      if (c.noise) for (const rel of rels) if (rand() < c.noise) rel.type = { suspect: 'trust', trust: 'suspect', checkW: 'checkG', checkG: 'checkW' }[rel.type] || rel.type;
      s.events.push({ id: 'e' + t, speaker: i, text: '', round: r, phase: 'day', relations: rels.map((rel, k) => ({ id: `e${t}r${k}`, label: '', ...rel })), createdAt: t++ });
    }
    const tally = new Map(), bloc = [...goods].filter((j) => alive[j]).sort((a, b) => heat[b] - heat[a])[0];
    for (const i of speakers) {
      if (!alive[i]) continue;
      const target = !x[i] ? [...speakers].filter((j) => j !== i && alive[j]).sort((a, b) => belief[i][b] + c.herd * heat[b] - (belief[i][a] + c.herd * heat[a]))[0] : rand() < 0.75 ? bloc : pick(goods.filter((j) => alive[j]));
      if (!target || target === i) continue;
      tally.set(target, (tally.get(target) || 0) + 1);
      s.events.push({ id: 'e' + t, speaker: i, text: '', round: r, phase: 'day', relations: [{ id: `v${t}`, from: i, to: target, type: 'vote', label: '', strength: 0.85 }], createdAt: t++ });
    }
    const out = [...tally].sort((a, b) => b[1] - a[1])[0];
    if (out) kill(out[0], 'vote');
  }
  return { s, wolves, good: new Set(goods), alive: (id) => alive[id] };
}

function rng(seed) { return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32); }
const mean = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const fmt = (rows) => `AUC ${mean(rows, 'auc').toFixed(3)}  命中 ${(mean(rows, 'hits') * 100).toFixed(1)}%  狼−好 ${(mean(rows, 'gap') * 100).toFixed(1)}pt  Brier ${mean(rows, 'brier').toFixed(3)}  LogLoss ${mean(rows, 'logloss').toFixed(3)}`;

const N = Number(process.argv[2]) || 400;
const base = { n: 12, K: 4, rounds: 3, skill: 1, herd: 0.3, bus: 0.15, defend: 0.45, fakeSeer: 0.6, noise: 0 };
const scenarios = [
  ['12人4狼 · 基准', base],
  ['16人5狼 · 基准', { ...base, n: 16, K: 5 }],
  ['狼更会伪装（多卖队友、少保队友、必悍跳）', { ...base, bus: 0.35, defend: 0.15, fakeSeer: 0.95 }],
  ['好人判断力弱', { ...base, skill: 0.5 }],
  ['好人跟风严重', { ...base, herd: 1 }],
  ['识别错误 15%', { ...base, noise: 0.15 }],
  ['无人跳预言家', { ...base, seer: false, fakeSeer: 0 }],
  ['只看第 1 轮', { ...base, rounds: 1 }],
  ['没标死因', { ...base, unmarked: true }],
  ['没标死因 · 只看第 1 轮', { ...base, unmarked: true, rounds: 1 }],
];
console.log(`模拟对局，每种情形 ${N} 局，只统计仍存活的玩家（旧 = v3.0 独立证据模型，新 = 当前模型）\n`);
for (const [name, c] of scenarios) {
  const rand = rng(20261010), oldRows = [], newRows = [];
  for (let g = 0; g < N; g++) {
    const { s, wolves, good, alive } = simulate(rand, c);
    oldRows.push(metrics(legacy(s), wolves, good, alive));
    newRows.push(metrics(M.infer(s).ps, wolves, good, alive));
  }
  console.log(`${name}\n  旧  ${fmt(oldRows)}\n  新  ${fmt(newRows)}`);
}

for (const file of ['real-game-2.json']) {
  let game;
  try { game = JSON.parse(readFileSync(join(here, '../../examples', file), 'utf8')); } catch { continue; }
  const s = M.sanitizeState(game), wolves = new Set(game.truth.wolves), good = new Set(game.truth.good), gone = game.truth.goneFrom || {};
  console.log(`\n真实对局 ${file}（真实狼 ${[...wolves].join('、')}；第 6 狼未标注；每轮只统计当时仍存活的玩家）`);
  for (let r = 1; r <= s.round; r++) {
    const x = JSON.parse(JSON.stringify(s)); x.round = r;
    const alive = (id) => !(gone[id] <= r), o = metrics(legacy(x), wolves, good, alive), nw = metrics(M.infer(x).ps, wolves, good, alive), ps = M.infer(x).ps;
    console.log(`  第 ${r} 轮  旧 AUC ${o.auc.toFixed(2)} 命中 ${(o.hits * 100).toFixed(0)}% 狼−好 ${(o.gap * 100).toFixed(1)}pt ｜ 新 AUC ${nw.auc.toFixed(2)} 命中 ${(nw.hits * 100).toFixed(0)}% 狼−好 ${(nw.gap * 100).toFixed(1)}pt`);
    if (r === s.round) console.log('   新排名 ' + [...Array(s.n).keys()].map((i) => i + 1).sort((a, b) => ps[b - 1] - ps[a - 1]).map((i) => `${i}${wolves.has(i) ? '狼' : good.has(i) ? '好' : '?'}:${(ps[i - 1] * 100).toFixed(0)}%`).join(' '));
  }
}
