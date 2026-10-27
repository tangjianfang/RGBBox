"""Collect the CJK character set the renderer can show: every CJK char in renderer/shared
sources + GB2312 level-1 (3755 common hanzi) + CJK/fullwidth punctuation blocks.
Usage: python -I charset.py <repo> <out.txt>"""
import sys, pathlib

repo = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])

def is_cjk(cp: int) -> bool:
    return (
        0x2E80 <= cp <= 0x2FDF or 0x3000 <= cp <= 0x303F or 0x3400 <= cp <= 0x4DBF
        or 0x4E00 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF or 0xFE30 <= cp <= 0xFE4F
        or 0xFF00 <= cp <= 0xFFEF
    )

chars = set()
scanned = 0
for root in (repo / "src" / "renderer", repo / "src" / "shared"):
    for p in root.rglob("*"):
        if p.suffix in {".ts", ".tsx", ".css", ".html", ".js", ".json"} and p.is_file() and "assets/fonts" not in p.as_posix():
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            scanned += 1
            chars.update(c for c in text if is_cjk(ord(c)))
src_count = len(chars)

# GB2312 level-1: rows 16-55 (lead byte 0xB0-0xD7), trail 0xA1-0xFE
gb = set()
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            gb.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
chars |= gb

# CJK / fullwidth punctuation blocks wholesale (small, cheap, avoids half-covered punctuation)
for cp in list(range(0x3000, 0x3040)) + list(range(0xFF01, 0xFF5F)):
    chars.add(chr(cp))

out.write_text("".join(sorted(chars)), encoding="utf-8")
print(f"scanned {scanned} files; source CJK chars={src_count}; gb2312 L1={len(gb)}; total={len(chars)}")
