#!/usr/bin/env python3
"""Update this unchanged native wrapper from a previously signed Moontrace APK.

No Android SDK is needed when ONLY the web assets and version change.
Requires Python 3.9+ and cryptography. Never use this instead of build.sh after
editing Java/resources/permissions. The certificate is kept identical.

Implementation references:
https://source.android.com/docs/security/features/apksigning/v2
https://android.googlesource.com/platform/frameworks/base/+/master/libs/androidfw/include/androidfw/ResourceTypes.h

Usage: python update_web_apk.py previous.apk --out ../moontrace-v3.apk
Only APK signature scheme v2 is emitted (minimum Android SDK is 24).
"""
import argparse,hashlib,io,json,struct,zipfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12
ROOT=Path(__file__).resolve().parent
MAGIC=b'APK Sig Block 42';V2=0x7109871a;ALG=0x0103
u16=lambda b,o:struct.unpack_from('<H',b,o)[0]
u32=lambda b,o:struct.unpack_from('<I',b,o)[0]
u64=lambda b,o:struct.unpack_from('<Q',b,o)[0]
P32=lambda v:struct.pack('<I',v)
P64=lambda v:struct.pack('<Q',v)
def lp(data):return P32(len(data))+data
def take_lp(data,offset=0):
 n=u32(data,offset);start=offset+4;end=start+n
 if end>len(data):raise ValueError('Bad length prefix')
 return data[start:end],end
def end_record(blob):
 end=blob.rfind(b'PK\x05\x06')
 if end<0 or end+22+u16(blob,end+20)!=len(blob):raise ValueError('Invalid ZIP EOCD')
 cd=u32(blob,end+16);size=u32(blob,end+12)
 if cd+size!=end:raise ValueError('Noncontiguous central directory')
 return end,cd

def manifest_version(data,version_code=None,version_name=None):
 """Decode just the string pool and manifest attributes; no ad-hoc byte scan."""
 b=bytearray(data);strings=[];positions=[];offset=8;values={}
 if u16(b,0)!=3:raise ValueError('Expected binary Android XML')
 while offset<len(b):
  kind,head,size=u16(b,offset),u16(b,offset+2),u32(b,offset+4)
  if size<head or offset+size>len(b):raise ValueError('Invalid XML chunk')
  if kind==1:
   count=u32(b,offset+8);utf8=bool(u32(b,offset+16)&0x100);base=offset+u32(b,offset+20)
   def length8(pos):
    v=b[pos];return (((v&0x7f)<<8)|b[pos+1],pos+2) if v&0x80 else (v,pos+1)
   for i in range(count):
    pos=base+u32(b,offset+head+4*i)
    if utf8:
     _,pos=length8(pos);length,pos=length8(pos);raw=bytes(b[pos:pos+length]);encoding='utf-8'
    else:
     length=u16(b,pos);pos+=2
     if length&0x8000:length=((length&0x7fff)<<16)|u16(b,pos);pos+=2
     length*=2;raw=bytes(b[pos:pos+length]);encoding='utf-16le'
    strings.append(raw.decode(encoding));positions.append((pos,length,encoding))
  elif kind==0x102:
   ext=offset+head;tag=strings[u32(b,ext+4)]
   if tag=='manifest':
    attr_start=u16(b,ext+8);attr_size=u16(b,ext+10);count=u16(b,ext+12)
    for i in range(count):
     at=ext+attr_start+i*attr_size;name=strings[u32(b,at+4)];raw=u32(b,at+8);dtype=b[at+15];val=u32(b,at+16)
     if name=='versionCode':
      values[name]=val
      if version_code is not None:struct.pack_into('<I',b,at+16,version_code);values[name]=version_code
     if name=='versionName':
      idx=val if dtype==3 else raw;values[name]=strings[idx]
      if version_name is not None:
       pos,length,encoding=positions[idx];new=version_name.encode(encoding)
       if len(new)!=length:raise ValueError('This no-SDK updater requires same-length version name; use build.sh otherwise.')
       b[pos:pos+length]=new;values[name]=version_name
  offset+=size
 if set(values)!={'versionCode','versionName'}:raise ValueError('Version attributes missing')
 return bytes(b),values

def contents_digest(sections):
 chunks=[]
 for section in sections:
  for offset in range(0,len(section),1024*1024):
   chunk=section[offset:offset+1024*1024];chunks.append(hashlib.sha256(b'\xa5'+P32(len(chunk))+chunk).digest())
 return hashlib.sha256(b'\x5a'+P32(len(chunks))+b''.join(chunks)).digest()

def verify_v2(blob):
 end,cd=end_record(blob)
 if blob[cd-16:cd]!=MAGIC:raise ValueError('Missing APK signature block')
 size=u64(blob,cd-24);start=cd-size-8
 if start<0 or u64(blob,start)!=size:raise ValueError('APK signature block sizes disagree')
 offset=start+8;v2=None
 while offset<cd-24:
  n=u64(blob,offset);typ=u32(blob,offset+8)
  if typ==V2:v2=blob[offset+12:offset+8+n]
  offset+=8+n
 if offset!=cd-24 or v2 is None:raise ValueError('Malformed/missing v2 signer')
 signers,_=take_lp(v2);signer,signer_end=take_lp(signers)
 if signer_end!=len(signers):raise ValueError('Only single-signer APK supported')
 signed,at=take_lp(signer);signatures,at=take_lp(signer,at);pub,_=take_lp(signer,at)
 sig,_=take_lp(signatures);algorithm=u32(sig,0);signature,_=take_lp(sig,4)
 key=serialization.load_der_public_key(pub)
 if algorithm==0x0103:key.verify(signature,signed,padding.PKCS1v15(),hashes.SHA256())
 elif algorithm==0x0101:key.verify(signature,signed,padding.PSS(mgf=padding.MGF1(hashes.SHA256()),salt_length=32),hashes.SHA256())
 else:raise ValueError('Unsupported existing RSA algorithm')
 digests,at=take_lp(signed);certs,at=take_lp(signed,at);cert_der,_=take_lp(certs);digest_record,_=take_lp(digests)
 if u32(digest_record,0)!=algorithm:raise ValueError('Signature/digest algorithms disagree')
 digest,_=take_lp(digest_record,4);tail=bytearray(blob[end:]);struct.pack_into('<I',tail,16,start)
 if digest!=contents_digest([blob[:start],blob[cd:end],tail]):raise ValueError('APK content digest mismatch')
 cert=x509.load_der_x509_certificate(cert_der)
 if cert.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)!=pub:raise ValueError('Certificate/public key mismatch')
 return {'certificate_sha256':cert.fingerprint(hashes.SHA256()).hex(),'apk_v2_signature_valid':True,'content_digest_valid':True,'certificate_der':cert_der}

def sign_v2(unsigned,key,cert):
 end,cd=end_record(unsigned);digest=contents_digest([unsigned[:cd],unsigned[cd:end],unsigned[end:]])
 signed=lp(lp(P32(ALG)+lp(digest)))+lp(lp(cert.public_bytes(serialization.Encoding.DER)))+lp(b'')
 signature=key.sign(signed,padding.PKCS1v15(),hashes.SHA256())
 signer=lp(signed)+lp(lp(P32(ALG)+lp(signature)))+lp(key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo))
 value=lp(lp(signer));pair=P64(4+len(value))+P32(V2)+value
 size=len(pair)+24;block=P64(size)+pair+P64(size)+MAGIC
 tail=bytearray(unsigned[end:]);struct.pack_into('<I',tail,16,cd+len(block))
 return unsigned[:cd]+block+unsigned[cd:end]+tail

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('previous',type=Path);parser.add_argument('--out',type=Path,default=ROOT.parent/'moontrace-v3.apk')
 parser.add_argument('--html',type=Path,default=ROOT.parent/'web/index.html');parser.add_argument('--keystore',type=Path,default=ROOT/'moontrace-release.jks')
 parser.add_argument('--password',default='moontrace');parser.add_argument('--version-code',type=int,default=3);parser.add_argument('--version-name',default='3.0')
 args=parser.parse_args();old=args.previous.read_bytes();original=verify_v2(old)
 key,cert,_=pkcs12.load_key_and_certificates(args.keystore.read_bytes(),args.password.encode())
 if cert.fingerprint(hashes.SHA256()).hex()!=original['certificate_sha256']:raise ValueError('Keystore does not match original APK signer')
 data=io.BytesIO();changed=[]
 with zipfile.ZipFile(io.BytesIO(old)) as src,zipfile.ZipFile(data,'w') as dest:
  for info in src.infolist():
   if info.filename.upper().startswith('META-INF/'):continue
   content=src.read(info)
   if info.filename=='assets/www/index.html':content=args.html.read_bytes();changed.append(info.filename)
   elif info.filename=='AndroidManifest.xml':content,version=manifest_version(content,args.version_code,args.version_name);changed.append(info.filename)
   entry=zipfile.ZipInfo(info.filename,date_time=(2026,1,1,0,0,0));entry.compress_type=info.compress_type;entry.create_system=0
   if entry.compress_type==zipfile.ZIP_STORED:
    pad=(-(dest.fp.tell()+30+len(entry.filename.encode())))%4
    if pad:entry.extra=struct.pack('<HH',0xD935,pad)+b'\0'*pad
   dest.writestr(entry,content)
  if changed!=['AndroidManifest.xml','assets/www/index.html'] and set(changed)!={'AndroidManifest.xml','assets/www/index.html'}:raise ValueError('Required wrapper assets missing')
 signed=sign_v2(data.getvalue(),key,cert);verified=verify_v2(signed);del verified['certificate_der']
 with zipfile.ZipFile(io.BytesIO(signed)) as z:
  assert z.testzip() is None
  assert z.read('assets/www/index.html')==args.html.read_bytes()
  for info in z.infolist():
   if info.compress_type==zipfile.ZIP_STORED:assert (info.header_offset+30+len(info.filename.encode())+len(info.extra))%4==0
  for name in ['classes.dex','resources.arsc']:
   with zipfile.ZipFile(io.BytesIO(old)) as src:assert z.read(name)==src.read(name)
  _,actual=manifest_version(z.read('AndroidManifest.xml'));assert actual==version
 args.out.write_bytes(signed)
 report={**verified,**version,'native_dex_unchanged':True,'resources_unchanged':True,'web_asset_sha256':hashlib.sha256(args.html.read_bytes()).hexdigest(),'same_signer_as_input':True,'stored_entries_4_byte_aligned':True,'verification':'Independent parsing + cryptography; Android SDK apksigner/device install not available in this runtime.'}
 args.out.with_suffix('.verification.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report,indent=2));print('Wrote',args.out)
if __name__=='__main__':main()
