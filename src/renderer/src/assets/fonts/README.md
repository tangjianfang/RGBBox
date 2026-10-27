# Bundled UI fonts (R321)

The renderer ships its own fonts so the UI looks the same on every machine —
no dependence on what the host OS has installed. Registered in
`src/renderer/src/styles/fonts.css` under their real family names.

| File(s) | Family | Source (npm, via registry.npmmirror.com) | Modified? |
|---|---|---|---|
| `Inter-latin-wght.woff2`, `Inter-latin-ext-wght.woff2` | Inter Variable (wght 100–900) | `@fontsource-variable/inter@5.3.0` → `files/inter-{latin,latin-ext}-wght-normal.woff2` | no |
| `CascadiaMono-latin-{400,700}.woff2` | Cascadia Mono | `@fontsource/cascadia-mono@5.3.0` → `files/cascadia-mono-latin-{400,700}-normal.woff2` | no |
| `NotoSansSC-{400,600,700}.woff2` | Noto Sans SC | `@expo-google-fonts/noto-sans-sc@0.4.4` → `{400Regular,600SemiBold,700Bold}/NotoSansSC_*.ttf` | **glyph subset** (see below) |

All three are SIL OFL 1.1 — see `LICENSE-*.txt` here and `NOTICE.md` at the repo root.

## Noto Sans SC subset — how to regenerate

Charset = every CJK char appearing in `src/renderer` + `src/shared` sources
**plus** GB2312 level-1 (3755 common hanzi, headroom for dynamic text such as AI
replies) **plus** the CJK / fullwidth punctuation blocks. Characters outside the
subset still render — they fall through the font stack to the system CJK font.

```bash
# 1. charset (python ≥3.9, no deps)
python -I scripts/fonts/charset.py . src/renderer/src/assets/fonts/NotoSansSC.charset.txt

# 2. subset each weight (pip install fonttools brotli, in a throw-away venv)
python -I -m fontTools.subset NotoSansSC_400Regular.ttf \
  --text-file=src/renderer/src/assets/fonts/NotoSansSC.charset.txt --flavor=woff2 --layout-features='kern,locl' \
  --no-hinting --name-IDs='*' --notdef-outline \
  --output-file=NotoSansSC-400.woff2
# repeat for 600SemiBold → NotoSansSC-600.woff2, 700Bold → NotoSansSC-700.woff2
```

`NotoSansSC.charset.txt` is the exact list the committed subset was built from;
`tests/renderer/bundledFonts.test.ts` fails when a UI translation uses a hanzi
that is not in it (re-run the two steps above, then commit the new woff2 files
and the updated list).

Last generated 2026-10-27: 3965 chars, ~545–558 KB per weight. Re-run when a
release adds many new CJK strings and the zh UI starts showing system-font
glyphs (the runtime probe `scripts/verify-r321-fonts.mjs` reports which font
each sampled node used).
