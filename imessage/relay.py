#!/usr/bin/env python3
"""月隐 iMessage relay (macOS only, Python 3.9+, standard library only).

Watches one Messages chat, forwards each new message to your Moontrace server, and
replies in the chat with what was recorded. The server parses the text; the web
app pulls the result from the room and computes probabilities locally.

Needs Full Disk Access for the terminal app (to read ~/Library/Messages/chat.db)
and, for replies, permission to control Messages. See README.md next to this file.
"""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DB = Path.home() / 'Library/Messages/chat.db'
STATE = Path(os.environ.get('MOONTRACE_RELAY_STATE') or Path.home() / '.moontrace-relay.json')
MARK = '🌙'  # replies start with this, so the relay never reads its own messages back
ECHO_WINDOW = 15  # seconds; self-chats can store the same message twice


def decode_attributed_body(blob):
    """Plain text from message.attributedBody (an NSAttributedString typedstream).

    Recent macOS often leaves message.text empty and stores the text only here."""
    if not blob:
        return ''
    blob = bytes(blob)
    start = blob.find(b'NSString')
    if start < 0:
        return ''
    plus = blob.find(b'+', start + len(b'NSString'), start + len(b'NSString') + 12)
    if plus < 0:
        return ''
    i = plus + 1
    size = blob[i]
    i += 1
    if size == 0x81:
        size = int.from_bytes(blob[i:i + 2], 'little')
        i += 2
    elif size == 0x82:
        size = int.from_bytes(blob[i:i + 4], 'little')
        i += 4
    return blob[i:i + size].decode('utf-8', errors='replace')


def message_text(text, attributed):
    return (text or decode_attributed_body(attributed) or '').replace('￼', '').strip()


def connect(path):
    try:
        return sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=5)
    except sqlite3.Error as e:
        sys.exit(f'无法打开 {path}：{e}\n请在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」里允许你的终端。')


def recent_chats(conn, limit=20):
    return conn.execute(
        '''SELECT c.ROWID, c.guid, c.chat_identifier, IFNULL(c.display_name, ''), MAX(m.ROWID)
           FROM chat c JOIN chat_message_join j ON j.chat_id = c.ROWID JOIN message m ON m.ROWID = j.message_id
           GROUP BY c.ROWID ORDER BY MAX(m.ROWID) DESC LIMIT ?''', (limit,)).fetchall()


def find_chat(conn, wanted):
    rows = conn.execute(
        'SELECT ROWID, guid, chat_identifier, IFNULL(display_name, "") FROM chat '
        'WHERE display_name = ? OR chat_identifier = ? OR guid = ?', (wanted, wanted, wanted)).fetchall()
    if not rows:
        sys.exit(f'找不到聊天「{wanted}」。先运行 --list-chats 查看可用的名称。')
    if len(rows) > 1:
        sys.exit(f'有 {len(rows)} 个聊天叫「{wanted}」，请改用 --list-chats 里的 guid。')
    return rows[0]


def new_messages(conn, chat_rowid, after):
    """Ordinary messages (no reactions, no system rows) in one chat with ROWID > after."""
    return conn.execute(
        '''SELECT m.ROWID, m.guid, m.text, m.attributedBody
           FROM message m JOIN chat_message_join j ON j.message_id = m.ROWID
           WHERE j.chat_id = ? AND m.ROWID > ?
             AND IFNULL(m.associated_message_type, 0) = 0 AND IFNULL(m.item_type, 0) = 0
           ORDER BY m.ROWID''', (chat_rowid, after)).fetchall()


def latest_rowid(conn):
    return conn.execute('SELECT IFNULL(MAX(ROWID), 0) FROM message').fetchone()[0]


def post(endpoint, token, path, body, timeout=180):
    req = urllib.request.Request(
        endpoint.rstrip('/') + path, data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read().decode()).get('error')
        except Exception:
            message = None
        raise RuntimeError(message or f'服务器返回 {e.code}') from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise RuntimeError(f'无法连接服务器：{getattr(e, "reason", e)}') from None


def send_reply(chat_guid, text):
    # Text and chat id travel as argv, so nothing in the message is interpreted as AppleScript.
    subprocess.run(
        ['osascript', '-e', 'on run argv', '-e',
         'tell application "Messages" to send (item 1 of argv) to chat id (item 2 of argv)', '-e', 'end run',
         text, chat_guid],
        check=True, capture_output=True, timeout=20)


def load_state():
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {}


def save_state(state):
    try:
        STATE.write_text(json.dumps(state))
    except OSError as e:
        print(f'无法保存进度：{e}', file=sys.stderr)


def options():
    ap = argparse.ArgumentParser(description='把一个 iMessage 聊天里的速记转发到月隐服务器。')
    ap.add_argument('--endpoint', default=os.environ.get('MOONTRACE_ENDPOINT'), help='服务器地址，如 https://moontrace.xxx.workers.dev')
    ap.add_argument('--room', default=os.environ.get('MOONTRACE_ROOM'), help='网页「AI 识别与 iMessage」里的房间号')
    ap.add_argument('--chat', default=os.environ.get('MOONTRACE_CHAT'), help='要监听的聊天：群名、对方号码/邮箱或 guid')
    ap.add_argument('--prefix', default='', help='只处理以此开头的消息，例如「记」；默认处理全部消息')
    ap.add_argument('--interval', type=float, default=2.0, help='轮询间隔秒数（默认 2）')
    ap.add_argument('--no-reply', action='store_true', help='不在聊天里回复识别结果')
    ap.add_argument('--list-chats', action='store_true', help='列出最近的聊天后退出')
    ap.add_argument('--once', action='store_true', help='处理一轮新消息后退出')
    ap.add_argument('--db', default=str(DB), help=argparse.SUPPRESS)
    return ap.parse_args()


def main():
    args = options()
    conn = connect(args.db)
    if args.list_chats:
        for _, guid, ident, name, _ in recent_chats(conn):
            print(f'{name or "（无群名）"}\t{ident}\t{guid}')
        return
    token = os.environ.get('MOONTRACE_TOKEN', '')
    missing = [flag for flag, value in (('--endpoint', args.endpoint), ('--room', args.room), ('--chat', args.chat), ('MOONTRACE_TOKEN', token)) if not value]
    if missing:
        sys.exit('缺少设置：' + '、'.join(missing) + '。访问口令请用环境变量 MOONTRACE_TOKEN 传入。')
    chat_rowid, chat_guid, ident, name = find_chat(conn, args.chat)
    path = f'/api/rooms/{urllib.parse.quote(args.room)}/messages'

    state = load_state()
    key = f'{chat_guid}|{args.room}'
    last = state.get(key)
    if not isinstance(last, int):
        last = latest_rowid(conn)  # first run: start from now, never replay old history
        state[key] = last
        save_state(state)
    print(f'正在监听「{name or ident}」→ 房间 {args.room}。按 Ctrl+C 停止。', flush=True)

    recent = []
    while True:
        try:
            rows = new_messages(conn, chat_rowid, last)
        except sqlite3.OperationalError as e:  # e.g. Messages briefly holding a lock
            print(f'读取聊天记录失败，稍后重试：{e}', file=sys.stderr, flush=True)
            rows = []
        for rowid, guid, text, attributed in rows:
            last = rowid
            body = message_text(text, attributed)
            if not body or body.startswith(MARK):
                continue
            if args.prefix:
                if not body.startswith(args.prefix):
                    continue
                body = body[len(args.prefix):].lstrip(' ：:，,')
                if not body:
                    continue
            now = time.time()
            recent = [(t, b) for t, b in recent if now - t < ECHO_WINDOW]
            if any(b == body for _, b in recent):
                continue
            recent.append((now, body))
            try:
                result = post(args.endpoint, token, path, {'text': body, 'clientId': f'imsg-{guid}'})
                reply = result.get('reply', '')
            except RuntimeError as e:
                reply = f'{MARK} 记录失败：{e}'
            print(f'[{time.strftime("%H:%M:%S")}] {body[:40]}\n  {reply or "（重复消息，已忽略）"}', flush=True)
            if reply and not args.no_reply:
                try:
                    send_reply(chat_guid, reply)
                except (subprocess.SubprocessError, OSError) as e:
                    print(f'  回复失败（可加 --no-reply）：{e}', file=sys.stderr, flush=True)
            state[key] = last
            save_state(state)
        if state[key] != last:
            state[key] = last
            save_state(state)
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已停止。')
