#!/usr/bin/env python3
"""Assemble the final (unsigned) APK: take aapt2's linked base, add classes.dex,
store resources.arsc uncompressed and 4-byte align every stored entry (what
zipalign would do). Usage: pack.py base.apk classes.dex out.apk"""
import struct, sys, zipfile

base, dex, out = sys.argv[1:4]
STORED_EXT = ('.png', '.arsc', '.webp', '.jpg', '.ttf', '.otf')

entries = []
with zipfile.ZipFile(base) as z:
    for info in z.infolist():
        entries.append((info.filename, z.read(info), info.compress_type))
with open(dex, 'rb') as f:
    entries.append(('classes.dex', f.read(), zipfile.ZIP_DEFLATED))

# AndroidManifest and resources first, dex next, then assets/res (reader convenience, not required)
order = {'AndroidManifest.xml': 0, 'resources.arsc': 1, 'classes.dex': 2}
entries.sort(key=lambda e: (order.get(e[0], 3), e[0]))

with zipfile.ZipFile(out, 'w') as zout:
    for name, data, ctype in entries:
        if name == 'resources.arsc' or name.endswith(STORED_EXT):
            ctype = zipfile.ZIP_STORED
        zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        zi.compress_type = ctype
        zi.create_system = 0
        if ctype == zipfile.ZIP_STORED:
            # local header = 30 bytes + name + extra; pad the extra field so data starts on a 4-byte boundary
            offset = zout.fp.tell()
            pad = (-(offset + 30 + len(name.encode('utf-8')))) % 4
            if pad:
                # valid extra-field record: id 0xD935 (Android alignment), length pad bytes of zeros, total pad+4 bytes
                pad_total = pad + 4 if pad else 0
                pad = (-(offset + 30 + len(name.encode('utf-8')) + pad_total)) % 4  # should be 0 now
                assert pad == 0
                zi.extra = struct.pack('<HH', 0xD935, pad_total - 4) + b'\0' * (pad_total - 4)
        zout.writestr(zi, data)

# verify alignment of stored entries
with zipfile.ZipFile(out) as z:
    for info in z.infolist():
        if info.compress_type == zipfile.ZIP_STORED:
            data_start = info.header_offset + 30 + len(info.filename.encode('utf-8')) + len(info.extra)
            assert data_start % 4 == 0, (info.filename, data_start)
print('packed', out, 'entries:', len(entries))
