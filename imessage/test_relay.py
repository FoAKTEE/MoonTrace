"""Relay test on a synthetic chat.db and a local mock server; never touches the real Messages database.
Run: python3 imessage/test_relay.py"""
import json, os, sqlite3, subprocess, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from relay import decode_attributed_body  # noqa: E402


def typedstream(text):
    data = text.encode()
    size = bytes([len(data)]) if len(data) < 0x80 else b'\x81' + len(data).to_bytes(2, 'little')
    return (b'\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92'
            b'\x84\x84\x84\x08NSString\x01\x94\x84\x01+' + size + data + b'\x86\x84\x02iI\x01\x05\x92\x84\x84\x84\x0cNSDictionary\x00')


assert decode_attributed_body(typedstream('3号踩6保8')) == '3号踩6保8'
long = '9号归票6，' * 40
assert decode_attributed_body(typedstream(long)) == long
assert decode_attributed_body(None) == '' and decode_attributed_body(b'garbage') == ''

received = []


class Mock(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        received.append({'path': self.path, 'auth': self.headers['Authorization'], **body})
        out = json.dumps({'reply': '🌙 已记 ' + body['text']}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


server = HTTPServer(('127.0.0.1', 0), Mock)
threading.Thread(target=server.serve_forever, daemon=True).start()

with tempfile.TemporaryDirectory() as tmp:
    db = Path(tmp) / 'chat.db'
    c = sqlite3.connect(db)
    c.executescript('''
      CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT, chat_identifier TEXT, display_name TEXT);
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB, handle_id INTEGER,
                            is_from_me INTEGER, associated_message_type INTEGER DEFAULT 0, item_type INTEGER DEFAULT 0);
      CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
      INSERT INTO chat VALUES (1, 'iMessage;+;chat111', 'chat111', '狼人杀记录'), (2, 'iMessage;-;+15550000000', '+15550000000', NULL);
    ''')

    def add(rowid, chat, text=None, blob=None, assoc=0):
        c.execute('INSERT INTO message (ROWID, guid, text, attributedBody, is_from_me, associated_message_type) VALUES (?,?,?,?,1,?)',
                  (rowid, f'G{rowid}', text, blob, assoc))
        c.execute('INSERT INTO chat_message_join VALUES (?,?)', (chat, rowid))
        c.commit()

    add(1, 1, '开局前的旧消息')
    env = {**os.environ, 'MOONTRACE_TOKEN': 'tok', 'MOONTRACE_RELAY_STATE': str(Path(tmp) / 'state.json')}
    cmd = [sys.executable, '-I', str(HERE / 'relay.py'), '--db', str(db), '--endpoint', f'http://127.0.0.1:{server.server_port}',
           '--room', 'room-abc1', '--chat', '狼人杀记录', '--once', '--no-reply']
    run = lambda *extra: subprocess.run(cmd + list(extra), env=env, capture_output=True, text=True, timeout=30)

    r = run()
    assert r.returncode == 0, r.stderr
    assert received == [], 'first run starts from now and skips history'

    add(2, 1, '3号踩6保8')
    add(3, 1, None, typedstream('9号归票6'))           # text only in attributedBody
    add(4, 2, '别的聊天里的消息')                         # other chat
    add(5, 1, '🌙 已记 3号 疑6 保8')                      # our own reply
    add(6, 1, 'Loved “3号踩6保8”', assoc=2000)          # tapback reaction
    add(7, 1, '3号踩6保8')                               # self-chat echo of message 2
    r = run()
    assert r.returncode == 0, r.stderr
    assert [m['text'] for m in received] == ['3号踩6保8', '9号归票6'], received
    assert received[0]['clientId'] == 'imsg-G2' and received[0]['auth'] == 'Bearer tok'
    assert received[0]['path'] == '/api/rooms/room-abc1/messages'

    r = run()
    assert len(received) == 2, 'progress is saved between runs'

    add(8, 1, '记 撤销')
    add(9, 1, '闲聊不转发')
    r = run('--prefix', '记')
    assert [m['text'] for m in received[2:]] == ['撤销'], received

    listing = subprocess.run([sys.executable, '-I', str(HERE / 'relay.py'), '--db', str(db), '--list-chats'], env=env, capture_output=True, text=True)
    assert '狼人杀记录\tchat111\tiMessage;+;chat111' in listing.stdout, listing.stdout

server.shutdown()
print('relay ok')
