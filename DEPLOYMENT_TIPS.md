# Deployment Tips (simont-1/iptv fork)

Personal reference from the Sep 2026 session that set up GitHub Pages playlists,
custom Chinese channels (cn-1), and the CNN stream. Updated Oct 18 2026: playlists
fully regenerated from upstream master (English/Chinese filtered, 0 language leaks),
CNN points at the CNN FAST GB CloudFront feed, cn-2 (16 CCTV HD channels) captured
as a custom source, and all pushes go over SSH (the https token in the main repo's
remote expired). Read this before touching `gh-pages` or running `playlist:generate`.

## The one rule that matters

`index.m3u` (the main playlist players load) must be assembled as:

```
index.country.m3u (with the CNN entry appended at EOF)
  + custom/cn-1.m3u entries (minus the #EXTM3U header)
  + custom/cn-2.m3u entries (minus the #EXTM3U header)
```

`playlist:generate` does NOT do this for you (it also drops the feedless CNN entry).
If you deploy the raw generated `index.m3u`, the whole China group disappears from
players. As of Oct 18 2026 the deployed China group has 204 entries:
140 database + 48 cn-1 + 16 cn-2 (was 200 in the Sept deploy). This exact mistake
broke CCTV-5 once — symptom: `grep -c 'group-title="China"' index.m3u` returns 0.

## File roles and group-title conventions

| File | Grouped by | Example group-title |
|---|---|---|
| `index.m3u` (this fork) | Country (index.country + customs) | `China`, `United States` |
| `index.country.m3u` | Country (generated + CNN at EOF) | `China`, `United States` |
| `index.m3u` (upstream default) | Category — DO NOT deploy this variant | `Movies`, `News` |
| `countries/us.m3u` | Category (generated + CNN at EOF) | `News`, `Religious` |
| `countries/cn.m3u` | Database Chinese channels only | `China` |
| `countries/cn-1.m3u` | Manual file, 48 custom channels | `China` |

The cn-2 block lives ONLY in `index.m3u`: 16 `#EXTINF:0 group-title="China",CCTV-x高清`
entries pointing at `http://63.141.230.178:82/gslb/zbdq5.m3u8?id=cctvXXhd`, right
after the cn-1 block, under the marker `# Custom Chinese HD channels (cn-2)`.

CNN entries live in three places with different group-titles:

- `index.country.m3u` → `tvg-id="CNN.us" group-title="United States",CNN` (appended at EOF)
- `index.m3u` → inherited from the copy above (verify after rebuild)
- `countries/us.m3u` → `tvg-id="CNN.us" group-title="News",CNN` (appended at EOF)
- Stream URL: `https://d2sybdl23b9psq.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-bocx3i7bjz0dg/CNNFAST_GB.m3u8`
  (CNN FAST GB feed; replaced Oct 2026. Old URL:
  `turnerlive.warnermediacdn.com/hls/live/586495/cnngo/cnn_slate/VIDEO_3_1464000.m3u8`)
- Why appended manually: the generator only keeps streams with a valid `channel@feed`
  id, and `CNN.us` has no feed → `playlist:generate` drops it. Upstream also carries
  the same URL as `CNNInternational.us@NorthAmerica`, so a duplicate-URL warning is
  expected (both appear in `index.m3u`).
- Persistence: also appended to `streams/us.m3u` on `master` as
  `#EXTINF:-1 tvg-id="CNN.us",CNN` (source format: tvg-id only, no logo/group-title)

## Why cn-1 / cn-2 live in `custom/`, not `streams/`

- `playlist:format` ("removing wrong id") strips tvg-ids not in the channel
  database → would mangle the custom entries.
- `playlist:generate` files unknown ids under "Undefined", never under "China",
  and never outputs `countries/cn-1.m3u`.
- So `custom/*.m3u` on `master` are the sources of truth, kept OUTSIDE the
  pipeline on purpose. `validate`/`lint`/`format`/`generate` all ignore them.
- `custom/cn-1.m3u` is byte-identical to deployed `countries/cn-1.m3u`
  (LF endings, 98 lines, 48 `#EXTINF` entries) — keep it that way.
- `custom/cn-2.m3u`: 34 lines (LF), 16 `#EXTINF` entries; appended to `index.m3u`
  only during assembly, never deployed as its own file.
- Both custom files are LF; normalize to CRLF while appending (see the recipe).

## Regenerating the filtered playlists (English + Chinese)

Deployed playlists contain only English/Chinese streams (feed languages `eng`/`zho`
from the API data). Run from the master repo root; NEVER filter `streams/` in place:

```sh
R=$(pwd)                               # master checkout (this repo)
T=/tmp/iptv-regenerate
rm -rf $T && mkdir -p $T/logs
cp -R streams $T/streams-filtered
npm run api:load                       # refresh temp/data first (channels/feeds/guides)

# 1) keep only eng/zho streams — in the COPY
STREAMS_DIR=$T/streams-filtered npm run playlist:filter-language

# 2) purge files the stock filter left untouched: it only rewrites files that keep
#    >=1 stream, and the untouched ones (zero eng/zho) would leak other languages
#    into generation. (Log: "kept N streams" should equal the copy's EXTINF total.)
python3 - <<'EOF'
import json, re, os, glob
T = '/tmp/iptv-regenerate/streams-filtered'   # keep in sync with $T above
feeds = json.load(open('temp/data/feeds.json'))
lang_by_feed = {f"{f['channel']}@{f['id']}": set(f.get('languages') or []) for f in feeds}
for path in sorted(glob.glob('streams/*.m3u')):
    good = 0
    for line in open(path, encoding='utf-8', errors='replace'):
        m = re.match(r'#EXTINF:.*tvg-id="([^"@]+@[^"]+)"', line)
        if m and lang_by_feed.get(m.group(1), set()) & {'eng', 'zho'}:
            good += 1
    if good == 0:
        os.remove(f"{T}/{os.path.basename(path)}")
EOF

# 3) generate the public tree from the filtered copies
STREAMS_DIR=$T/streams-filtered PUBLIC_DIR=$T/gh-pages-new LOGS_DIR=$T/logs \
  npx tsx scripts/commands/playlist/generate.ts

# 4) assemble the fork customs (CRLF everywhere)
cd $T/gh-pages-new
CNN=https://d2sybdl23b9psq.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-bocx3i7bjz0dg/CNNFAST_GB.m3u8
printf '#EXTINF:-1 tvg-id="CNN.us" group-title="United States",CNN\r\n%s\r\n' "$CNN" >> index.country.m3u
printf '#EXTINF:-1 tvg-id="CNN.us" group-title="News",CNN\r\n%s\r\n' "$CNN" >> countries/us.m3u
cat index.country.m3u > index.m3u
tail -n +2 "$R"/custom/cn-1.m3u | perl -pe 's/\r?$/\r/' >> index.m3u
tail -n +2 "$R"/custom/cn-2.m3u | perl -pe 's/\r?$/\r/' >> index.m3u
cp "$R"/custom/cn-1.m3u countries/cn-1.m3u
```

Expected log line from step 1 (Oct 18 2026 run): `found 18110 streams`, `kept 4792`.
After step 2 the copy has exactly `kept` EXTINF entries (4,792) across the files
that Generation reads.

## Deploying to `gh-pages` (safe method)

Never commit generated files to `master`. Deploy via a throwaway clone so the
working tree is untouched:

```sh
rm -rf /tmp/ghpages-deploy
git clone -q --branch gh-pages --depth 1 https://github.com/simont-1/iptv.git /tmp/ghpages-deploy
cd /tmp/ghpages-deploy
rsync -a --delete --exclude='.git' /tmp/iptv-regenerate/gh-pages-new/ ./   # full refresh
git add -A
git -c user.name="simont-1" -c user.email="simont-1@users.noreply.github.com" commit -m "Describe change"
# push over SSH (the https token in the main repo's remote expired; SSH key works):
git push git@github.com:simont-1/iptv.git gh-pages:gh-pages   # explicit refspec; plain `git push` may say "up-to-date"
```

`rsync --delete` also removes stale files (old city/source files) — intended for
full regenerations. For a small edit instead, copy the changed files over and list
them explicitly in `git add` (e.g. `index.m3u index.country.m3u countries/us.m3u`).

The `gh-pages` branch must contain playlist files at ROOT
(`index.m3u`, `countries/`, …), never inside a `.gh-pages/` subfolder.

## Verify after every deploy (players' view, via raw)

```sh
curl -sf https://raw.githubusercontent.com/simont-1/iptv/gh-pages/index.m3u -o /tmp/i.m3u
grep -c '#EXTINF' /tmp/i.m3u                    # 3720 as of Oct 18 2026
grep -c 'group-title="China"' /tmp/i.m3u        # 204 (140 db + 48 cn-1 + 16 cn-2)
grep -c 'd2sybdl23b9psq' /tmp/i.m3u             # 2 (custom CNN.us + upstream CNNInternational.us@NorthAmerica)
grep -c 'CCTV-5' /tmp/i.m3u                     # 10
grep -c 'Custom Chinese HD' /tmp/i.m3u          # 1 (cn-2 marker)
file /tmp/i.m3u                                 # should end "... with CRLF line terminators"
curl -sf https://raw.githubusercontent.com/simont-1/iptv/gh-pages/countries/us.m3u | grep -c 'd2sybdl23b9psq'   # 1 (only the custom entry)
curl -sf https://raw.githubusercontent.com/simont-1/iptv/gh-pages/countries/cn-1.m3u -o /tmp/c.m3u && cmp /tmp/c.m3u custom/cn-1.m3u   # byte-identical
git fetch -q origin gh-pages && git ls-tree --name-only origin/gh-pages | grep '^\.gh-pages' || echo "no nesting - good"
```

Note: raw.githubusercontent can serve a stale copy for a few minutes after a push —
if counts look off, wait and retry (the git ref itself updates immediately).

## Pitfalls hit (don't repeat)

1. Committing to the wrong branch — always check `git rev-parse --abbrev-ref HEAD`
   before committing; generated files committed to `master` pollute it
   (`origin/master` must stay free of `index.m3u`/`countries/` at root).
2. Stale `origin/gh-pages` view — run `git fetch` before comparing; a push from
   another clone won't show until fetched.
3. Nested `.gh-pages/` folder on the branch — happens when the deploy repo's
   working tree accidentally includes a `.gh-pages/` subdir. Check with ls-tree.
4. Push auth: the https token in the main repo's remote expired (GitHub API
   returns 401 as of Oct 2026) and can't be used from a non-interactive shell
   anyway (git still prompts for the password). Push over SSH instead —
   `git push git@github.com:simont-1/iptv.git gh-pages:gh-pages` (the
   `id_ed25519` key authenticates as simont-1). Consider switching the main
   repo's `origin` remote to SSH.
5. Line endings: the deploy tree is CRLF (generator default). NEVER use Python
   `read_text()`/`write_text()` for assembly — default text mode silently converts
   CRLF→LF (universal newlines), leaving mixed endings. Work in bytes, or use
   `perl -pe 's/\r?$/\r/'` when appending LF custom files into CRLF playlists.
   `countries/cn-1.m3u` is the one intentional LF file (byte copy of the custom
   source).
6. The stock `playlist:filter-language` only rewrites files that keep >=1 stream;
   files with zero eng/zho streams stay untouched and leak other languages into
   `playlist:generate` (the Sept deploy had 1 leak this way; the Oct 18 run purged
   files in step 2 and got 0 leaks — verify with the feeds.json analysis if unsure).
7. `git checkout origin/gh-pages -- <paths>` into `master` drags generated files
   into the wrong branch — prefer the `/tmp` clone method above.

## Current deployment state (Oct 18 2026)

- `gh-pages` tip: `78f0aa2` (regeneration `f1e4873` + CRLF normalization/marker)
- `index.m3u`: 3,720 entries, China 204, CRLF, 0 non-eng/zho leaks
- `index.country.m3u`: 3,656 entries (3,655 filtered + CNN); `countries/cn.m3u`
  regenerated fresh
- Generated from 4,792 filtered streams (of 18,110); tree refresh vs Sept deploy:
  814 modified, 13 added, 9 removed (upstream city/raw/source drift)
- CNN URL present twice in `index.m3u` (own `CNN.us` + upstream
  `CNNInternational.us@NorthAmerica`, same CloudFront URL — expected)
