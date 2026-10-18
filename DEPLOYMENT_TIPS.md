# Deployment Tips (simont-1/iptv fork)

Personal reference from the Sep 2026 session that set up GitHub Pages playlists,
custom Chinese channels (cn-1), and the CNN stream. Updated Oct 2026: CNN now
points at the CNN FAST GB CloudFront feed, and pushes go over SSH (the https
token in the main repo's remote expired). Read this before touching `gh-pages`
or running `playlist:generate`.

## The one rule that matters

`index.m3u` (the main playlist players load) must be rebuilt as:

```
index.country.m3u + custom/cn-1.m3u entries (minus the #EXTM3U header) + CNN entry
```

`playlist:generate` does NOT do this for you. If you deploy the raw generated
`index.m3u`, the whole China group disappears from players (as of Oct 2026:
200 entries = 136 database + 48 custom cn-1 + 16 `CCTV-x高清` after the cn-1
block). This exact mistake broke CCTV-5 once — symptom:
`grep -c 'group-title="China"' index.m3u` returns 0.

## File roles and group-title conventions

| File | Grouped by | Example group-title |
|---|---|---|
| `index.m3u` (this fork) | Country (copy of index.country + customs) | `China`, `United States` |
| `index.country.m3u` | Country (generated) | `China`, `United States` |
| `index.m3u` (upstream default) | Category — DO NOT deploy this variant | `Movies`, `News` |
| `countries/us.m3u` | Category | `News`, `Religious` |
| `countries/cn.m3u` | Database Chinese channels only | `China` |
| `countries/cn-1.m3u` | Manual file, 48 custom channels | `China` |

CNN entries live in three places with different group-titles:

- `index.country.m3u` → `tvg-id="CNN.us" group-title="United States",CNN`
- `index.m3u` → inherited from the copy above (verify after rebuild)
- `countries/us.m3u` → `tvg-id="CNN.us" group-title="News",CNN`
- Stream URL: `https://d2sybdl23b9psq.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-bocx3i7bjz0dg/CNNFAST_GB.m3u8`
  (CNN FAST GB feed; replaced Oct 2026. Old URL:
  `turnerlive.warnermediacdn.com/hls/live/586495/cnngo/cnn_slate/VIDEO_3_1464000.m3u8`)
- Persistence: also appended to `streams/us.m3u` on `master` as
  `#EXTINF:-1 tvg-id="CNN.us",CNN` (source format: tvg-id only, no logo/group-title)

## Why cn-1 lives in `custom/`, not `streams/`

- `playlist:format` ("removing wrong id") strips tvg-ids not in the channel
  database → would mangle the 48 custom entries.
- `playlist:generate` files unknown ids under "Undefined", never under "China",
  and never outputs a `countries/cn-1.m3u`.
- So `custom/cn-1.m3u` on `master` is the source of truth, kept OUTSIDE the
  pipeline on purpose. `validate`/`lint`/`format`/`generate` all ignore it.
- `custom/cn-1.m3u` is byte-identical to deployed `countries/cn-1.m3u`
  (LF endings, 98 lines, 48 `#EXTINF` entries) — keep it that way.

## Deploying to `gh-pages` (safe method)

Never commit generated files to `master`. Deploy via a throwaway clone so the
working tree is untouched:

```sh
rm -rf /tmp/ghpages-deploy
git clone -q --branch gh-pages --depth 1 https://github.com/simont-1/iptv.git /tmp/ghpages-deploy
cd /tmp/ghpages-deploy
# ... make edits (rebuild index.m3u, append cn-1, add streams) ...
git add index.m3u index.country.m3u countries/us.m3u
git -c user.name="simont-1" -c user.email="simont@example.com" commit -m "Describe change"
# push over SSH (the https token in the main repo's remote expired; SSH key works):
git push git@github.com:simont-1/iptv.git gh-pages:gh-pages   # explicit refspec; plain `git push` may say "up-to-date"
```

The `gh-pages` branch must contain playlist files at ROOT
(`index.m3u`, `countries/`, …), never inside a `.gh-pages/` subfolder.

## Verify after every deploy (from main repo)

```sh
git fetch -q origin gh-pages
git show origin/gh-pages:index.m3u | grep -c 'group-title="China"'   # expect 200
git show origin/gh-pages:index.m3u | grep -c 'd2sybdl23b9psq'         # expect 1 (CNN FAST GB)
git show origin/gh-pages:index.m3u | grep -c "CCTV-5"                 # expect 10
git show origin/gh-pages:countries/us.m3u | grep -c 'd2sybdl23b9psq' # expect 1 (CNN in US playlist)
git show origin/gh-pages:index.country.m3u | grep -c 'group-title="United States"'
git show origin/gh-pages:countries/cn-1.m3u | grep -c "#EXTINF"      # expect 48
git ls-tree --name-only origin/gh-pages | grep "^\.gh-pages" || echo "no nesting - good"
```

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
5. Line endings are mixed historically (`index.m3u` LF, `countries/*.m3u` CRLF) —
   when appending cn-1 lines into a CRLF file, convert with `sed 's/$/\r/'`.
6. `git checkout origin/gh-pages -- <paths>` into `master` drags generated files
   into the wrong branch — prefer the `/tmp` clone method above.
