#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_recovery_page(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "Smart Home v9.4 independent recovery plane. This page does not use the normal portal JavaScript.",
        "Smart Home independent recovery plane. This page does not depend on the normal portal JavaScript.",
        "version-neutral recovery subtitle",
    )

    helper = (
        "function recoverySha256HexArrayBuffer(buffer){"
        "var bytes=new Uint8Array(buffer),bitLen=bytes.length*8,total=((bytes.length+9+63)>>6)<<6,data=new Uint8Array(total);"
        "data.set(bytes);data[bytes.length]=0x80;var view=new DataView(data.buffer);"
        "view.setUint32(total-8,Math.floor(bitLen/4294967296),false);view.setUint32(total-4,bitLen>>>0,false);"
        "var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,"
        "0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,"
        "0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,"
        "0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,"
        "0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,"
        "0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,"
        "0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,"
        "0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],"
        "H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],W=new Uint32Array(64);"
        "function rotr(x,n){return (x>>>n)|(x<<(32-n))}"
        "for(var off=0;off<total;off+=64){var i;for(i=0;i<16;i++)W[i]=view.getUint32(off+i*4,false);"
        "for(i=16;i<64;i++){var q=W[i-15],r=W[i-2],s0=(rotr(q,7)^rotr(q,18)^(q>>>3))>>>0,s1=(rotr(r,17)^rotr(r,19)^(r>>>10))>>>0;"
        "W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0}"
        "var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];"
        "for(i=0;i<64;i++){var S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0,ch=((e&f)^((~e)&g))>>>0,t1=(h+S1+ch+K[i]+W[i])>>>0,"
        "S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0,maj=((a&b)^(a&c)^(b&c))>>>0,t2=(S0+maj)>>>0;"
        "h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}"
        "H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;"
        "H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0}"
        "return H.map(function(v){return v.toString(16).padStart(8,'0')}).join('')}"
    )

    text = replace_once(
        text,
        "async function uploadFw(){",
        helper + "async function uploadFw(){",
        "plain-HTTP recovery SHA helper",
    )

    old_hash = (
        "m.textContent='Hashing...';var buf=await f.arrayBuffer();"
        "var dig=await crypto.subtle.digest('SHA-256',buf),a=Array.from(new Uint8Array(dig)),"
        "hex=a.map(b=>b.toString(16).padStart(2,'0')).join(''),fd=new FormData();"
    )
    new_hash = (
        "m.textContent='Hashing...';var buf,hex;try{buf=await f.arrayBuffer();hex=recoverySha256HexArrayBuffer(buf)}"
        "catch(e){m.textContent='Hashing failed: '+(e&&e.message?e.message:e);return}var fd=new FormData();"
    )
    text = replace_once(text, old_hash, new_hash, "Safari-safe recovery hashing")

    if "crypto.subtle" in text[text.index("static void handleRecoveryPage()") : text.index("static void handleRecoveryStatus()")]:
        raise PatchError("recovery page still contains crypto.subtle")

    p.write_text(text, encoding="utf-8")


def patch_identity(repo: Path) -> None:
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(text, '#define SMART_HOME_VERSION "v9.7.1"\n', '#define SMART_HOME_VERSION "v9.7.2"\n', "version")
    text = replace_once(
        text,
        '#define SMART_HOME_PROFILE "interaction-layout-touch-reliability"\n',
        '#define SMART_HOME_PROFILE "interaction-layout-touch-recovery-reliability"\n',
        "profile",
    )
    text = replace_once(
        text,
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.7.1 Touch Reliability RC2"\n',
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.7.2 Recovery Safari RC1"\n',
        "build label",
    )
    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_recovery_page(repo)
    patch_identity(repo)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print("Smart Home v9.7.2 Recovery Safari patch ready. Use --apply.")
        return 0
    apply(repo)
    print("Smart Home v9.7.2 Recovery Safari applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
