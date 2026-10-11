// One Durable Object per iMessage room: an append-only log the web app replays by sequence number.
// Undo is a new "retract" entry, so devices that already applied an event can remove it too.
import { DurableObject } from 'cloudflare:workers';

const MAX_SEQ = 5000;
const key = (seq) => 'e:' + String(seq).padStart(10, '0');

export class Room extends DurableObject {
  async meta() {
    return (await this.ctx.storage.get('meta')) || {};
  }

  async sync(after, meta) {
    if (meta && JSON.stringify(meta) !== JSON.stringify(await this.ctx.storage.get('meta'))) await this.ctx.storage.put('meta', meta);
    const rows = await this.ctx.storage.list({ prefix: 'e:', start: key(after + 1), limit: 200 });
    return { entries: [...rows.values()], last: (await this.ctx.storage.get('seq')) || 0 };
  }

  async seen(clientId) {
    return clientId ? (await this.ctx.storage.get('c:' + clientId)) || 0 : 0;
  }

  async append(entry) {
    if (entry.clientId) {
      const prev = await this.ctx.storage.get('c:' + entry.clientId);
      if (prev) return { seq: prev, duplicate: true };
    }
    const seq = ((await this.ctx.storage.get('seq')) || 0) + 1;
    if (seq > MAX_SEQ) return { full: true };
    await this.ctx.storage.put({ seq, [key(seq)]: { ...entry, seq }, ...(entry.clientId ? { ['c:' + entry.clientId]: seq } : {}) });
    return { seq };
  }

  /** Retracts the newest event that is not already retracted; returns it, or null. */
  async retractLast(clientId) {
    if (clientId && (await this.seen(clientId))) return { duplicate: true };
    const rows = await this.ctx.storage.list({ prefix: 'e:', reverse: true, limit: 200 });
    const retracted = new Set();
    for (const row of rows.values()) {
      if (row.kind === 'retract') retracted.add(row.target);
      else if (row.kind === 'event' && !retracted.has(row.seq)) {
        const { full } = await this.append({ kind: 'retract', target: row.seq, clientId, at: Date.now() });
        return full ? null : row;
      }
    }
    return null;
  }
}
