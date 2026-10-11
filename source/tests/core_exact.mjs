// Brute-force check of the joint inference: enumerate every wolf assignment from the documented energy
// and compare with infer(). Covers fixed players, muted known wolves, death causes and seer counter-claims.
// Usage: node tests/core_exact.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
const code = readFileSync(join(src, 'core.js'), 'utf8') + '\n' + readFileSync(join(src, 'roles-core.js'), 'utf8')
  + '\nreturn {infer,newState,assertCore,stancePairs,claimConflicts,DEATH_PRIOR,CLAIM_KAPPA};\n})()';
const M = new Function(`const api = ${code}; return api;`)();

let seed = 4242;
const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32), pick = (xs) => xs[Math.floor(rand() * xs.length)];
const TYPES = ['suspect', 'trust', 'vote', 'checkW', 'checkG', 'note'];

function brute(s) {
  const { pairs } = M.stancePairs(s), conflicts = M.claimConflicts(s), n = s.n, acc = Array(n).fill(0);
  const prior = s.players.map((p) => (!p.alive && M.DEATH_PRIOR[p.deathReason]) || 0);
  let Z = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const x = (i) => (mask >> (i - 1)) & 1;
    let count = 0, ok = true;
    for (const p of s.players) { count += x(p.id); if ((p.fixed === 'wolf' && !x(p.id)) || (p.fixed === 'good' && x(p.id))) ok = false; }
    if (!ok || count !== s.wolves) continue;
    let E = 0;
    for (const p of s.players) E += prior[p.id - 1] * x(p.id);
    for (const pr of pairs.values()) if (!pr.muted) E += x(pr.to) * (x(pr.from) ? pr.w : pr.g);
    for (const c of conflicts) { const good = c.members.filter((id) => !x(id)).length; if (good > c.cap) E -= M.CLAIM_KAPPA * (good - c.cap); }
    const w = Math.exp(E); Z += w;
    for (let i = 1; i <= n; i++) if (x(i)) acc[i - 1] += w;
  }
  return acc.map((v) => v / Z);
}

let cases = 0, maxErr = 0;
for (let run = 0; run < 300; run++) {
  const n = 6 + Math.floor(rand() * 6), wolves = 1 + Math.floor(rand() * (n / 2)), s = M.newState(n, wolves);
  s.round = 1 + Math.floor(rand() * 3); s.muteKnownWolves = rand() < 0.5; s.sensitivity = pick([0.65, 1, 1.35]); s.decay = pick([1, 0.9, 0.75]);
  const ids = s.players.map((p) => p.id).sort(() => rand() - 0.5);
  if (rand() < 0.5) s.players[ids[0] - 1].fixed = 'wolf';
  if (rand() < 0.5) s.players[ids[1] - 1].fixed = 'good';
  for (const id of ids.slice(2, 5)) if (rand() < 0.4) { s.players[id - 1].alive = false; s.players[id - 1].deathReason = pick(['attack', 'explode', 'explodeTake', 'poison', 'vote', 'unknown']); }
  for (const id of ids.slice(2, 2 + Math.floor(rand() * 4))) s.players[id - 1].claimedRole = pick(['seer', 'seer', 'witch', 'villager']);
  for (const p of s.players) p.weight = pick([0.3, 0.65, 1]);
  s.events = Array.from({ length: 6 + Math.floor(rand() * 18) }, (_, k) => {
    const from = 1 + Math.floor(rand() * n);
    return { id: 'e' + k, speaker: from, text: '', round: 1 + Math.floor(rand() * s.round), phase: 'day', createdAt: k,
      relations: Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, r) => ({ id: `e${k}r${r}`, from, to: pick(s.players.map((p) => p.id).filter((i) => i !== from)), type: pick(TYPES), label: '', strength: pick([0.65, 0.8, 0.85, 1]) })) };
  });
  try { M.assertCore(s); } catch { continue; }
  const got = M.infer(s), want = brute(s);
  assert.ok(got.exact);
  got.ps.forEach((v, i) => { maxErr = Math.max(maxErr, Math.abs(v - want[i])); assert.ok(Math.abs(v - want[i]) < 1e-9, `case ${run} player ${i + 1}: ${v} vs ${want[i]}`); });
  assert.ok(Math.abs(got.sum - wolves) < 1e-9);
  cases++;
}
assert.ok(cases > 200, `only ${cases} valid cases`);
console.log(`core exact ok: ${cases} random games match brute-force enumeration (max error ${maxErr.toExponential(1)})`);
