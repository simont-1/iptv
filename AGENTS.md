# AGENTS.md - iptv-org/iptv (simont-1 fork)

This file provides compact guidance for OpenCode agents working in this repo. Every line below answers: "Would an agent likely miss this without help?"

This is a personal fork (`simont-1/iptv`) of `iptv-org/iptv`: upstream `master` plus a handful of fork-only commits (AGENTS.md, DEPLOYMENT_TIPS.md, `custom/cn-1.m3u`, `playlist:filter-language`, a custom CNN entry, docs). `DEPLOYMENT_TIPS.md` is the canonical fork deploy guide — read it before any deploy or sync work.

## Commands

| Command | Description |
|---|---|
| `npm run lint` | Run ESLint on `scripts/` and `tests/` (`npx eslint "scripts/**/*.{ts,js}" "tests/**/*.{ts,js}"`) |
| `npm run test` | Run vitest tests (`npx vitest run --no-file-parallelism`; no config file, discovers `tests/**/*.test.ts`) |
| `npm run playlist:format` | Format internal playlists (streams/), optionally a specific path |
| `npm run playlist:lint` | Lint playlists with m3u-linter |
| `npm run playlist:validate` | Validate playlists for common errors |
| `npm run playlist:update` | Process GitHub issues to update playlists |
| `npm run playlist:generate` | Generate public playlist files & indexes |
| `npm run playlist:export` | Export .api/streams.json |
| `npm run playlist:test` | Test stream links; pass `-- --fix` to remove broken streams |
| `npm run playlist:edit` | Quick streams mapping utility |
| `npm run readme:update` | Update README.md / PLAYLISTS.md |
| `npm run api:load` | Load API data (run on `postinstall`) |
| `npm run playlist:filter-language` | Keep only English (eng) / Chinese (zho) streams. DESTRUCTIVE: saves over `streams/*.m3u` in place — run it on a copy, never on the master working tree, and never commit its output |
| `npm run issue:validate` | Validate an issue body against requirements |
| `npm run report:create` | Create a report on current issues |
| `npm run act:check` | Run the check workflow locally |
| `npm run act:format` | Run the format workflow locally |
| `npm run act:update` | Run the update workflow locally |

## Fork workflow (read first)

- `origin` = `https://github.com/simont-1/iptv.git` (this fork). The PAT embedded in its URL is EXPIRED (GitHub API returns 401), so HTTPS pushes fail — always push over SSH: `git push git@github.com:simont-1/iptv.git <ref>` (the `~/.ssh/id_ed25519` key authenticates as `simont-1`). Fetches from `origin` still work (public repo). Consider switching `origin` to its SSH URL.
- `upstream` = `https://github.com/iptv-org/iptv.git` (fetch anonymously; never push).
- Sync master with upstream:

  ```sh
  git fetch upstream
  git branch backup/master-$(date +%Y%m%d)     # safety net; delete with git branch -D when happy
  git rebase upstream/master                    # replays the fork-only commits
  git fetch origin && git push --force-with-lease=refs/heads/master:$(git rev-parse origin/master) git@github.com:simont-1/iptv.git master
  ```

- Expect a rebase conflict on `streams/us.m3u` every sync: the fork appends a custom `CNN.us` entry at the very end of the file and upstream rewrites the file constantly. Resolve by keeping upstream's file (e.g. `git show upstream/master:streams/us.m3u > streams/us.m3u` while mid-rebase) and re-appending these two CRLF lines: `#EXTINF:-1 tvg-id="CNN.us",CNN` + `https://d2sybdl23b9psq.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-bocx3i7bjz0dg/CNNFAST_GB.m3u8`, then `git add streams/us.m3u && git rebase --continue`.
- Run `npm install` after every sync (upstream dependency changes; e.g. the Jest→Vitest switch in Oct 2026).
- The sync force-push rewrites the fork commits — any other clone of the fork must recover with `git fetch && git reset --hard origin/master`.

## Order matters

- No `typecheck` script exists in package.json. The actual CI `check` workflow runs `playlist:lint` then `playlist:validate`.
- The `format` workflow runs `api:load -> playlist:format -> playlist:lint -> playlist:validate`.
- `update` workflow runs `playlist:update -> playlist:lint -> playlist:validate -> playlist:generate -> playlist:export -> readme:update`, then deploys `.gh-pages/` to `gh-pages` branch via `github-pages-deploy-action`.
- These workflows describe UPSTREAM CI. The fork's gh-pages deploy is MANUAL and follows `DEPLOYMENT_TIPS.md` — `playlist:generate` output is never deployed as-is (the China group, cn-1 entries, and CNN entry must be assembled).

## Key directories

- `scripts/commands/` - CLI command modules (api/, issue/, playlist/, readme/, report/)
- `scripts/core/` - core utilities (playlistParser, streamTester, markdown, etc.)
- `scripts/generators/` - playlist generation logic (indexes by country, language, category)
- `scripts/tables/` - table rendering for CLI output
- `scripts/models/` - data models (stream, playlist, issue, discussion)
- `scripts/` also contains api.ts, constants.ts, utils.ts
- `streams/` - internal playlist files (.m3u), one per country/region
- `custom/` - fork-only assets kept OUTSIDE the pipeline (currently `cn-1.m3u`, the source of truth for the 48 custom Chinese channels; see Playlist structure)
- `tests/` - vitest test suites (commands/playlist/, commands/issue/, commands/readme/, commands/report/)
- `tests/__data__/` - test fixtures: `input/` (data, streams) and `expected/` (output)
- `.github/workflows/` - CI: check, format, update, validate_issue, validate_label
- `.readme/` - template.md and preview.png for README generation
- `PLAYLISTS.md` - auto-generated list of available public playlists
- `DEPLOYMENT_TIPS.md` - fork deploy runbook (gh-pages recipe, cn-1 + CNN append rules, verify commands)

## Testing quirks

- Tests use `cross-env` to set `DATA_DIR`, `STREAMS_DIR`, `ROOT_DIR`, `PUBLIC_DIR`, `LOGS_DIR`.
- Test data lives in `tests/__data__/input/` and expected outputs in `tests/__data__/expected/`.
- Vitest has no config file; default discovery finds `tests/**/*.test.ts`. `expect(value, 'message')` is built in (the old jest-expect-message package is gone).
- `playlist:test` can remove broken streams with `-- --fix` (e.g., `npm run playlist:test streams/fr.m3u -- --fix`).
- `playlist:validate` exits with code 1 on errors, 0 on warnings-only.
- Some tests require network (they fetch real GitHub issues); set `TESTING=true` or use `tests/__data__/input/issues.js` for offline mode.
- `playlist:format` tests copy from `tests/__data__/input/playlist_format` to `tests/__data__/output/streams`.

## Data & environment

- `DATA_DIR` defaults to `./temp/data` - contains fetched API data (channels, guides, etc.)
- `STREAMS_DIR` defaults to `./streams` - internal playlist files
- `postinstall` runs `api:load` to fetch initial API data
- `TESTING` env var: when `true`, uses fixture data instead of network requests
- `cross-env` is used to override defaults in tests and CI
- `.readme/template.md` is used to generate README content

## Style & conventions

- ESLint: `@stylistic/eslint-plugin` with `quotes: ['error', 'single']`, `semi: ['error', 'never']`, `indent: [2, { SwitchCase: 1 }]`
- ESLint also enforces `@stylistic/linebreak-style: ['error', 'windows']` (CRLF line endings)
- Prettier: `singleQuote: true`, `semi: false`, `printWidth: 100`
- TypeScript: `strict: true`, `target: es2022`, `module: nodeNext`
- All playlist scripts (`format`, `validate`, `update`, `generate`, `export`) load API data via `loadData()` first.
- `playlist:format` normalizes URLs, removes duplicates, adds missing feed/quality, sorts by title then geo-blocked status then not-247 then resolution then URL.
- `playlist:validate` reports: missing channel ID, unknown channel, missing feed, duplicate URLs, invalid URLs, blocklist DMCA/NSFW.
- `m3u-linter` config is in `m3u-linter.json`; it checks streams/*.m3u for formatting rules.
- Playlist files must use `.m3u` extension, begin with `#EXTM3U`, use CRLF line endings, and UTF-8 without BOM.

## Workflow details

- `check` (CI): runs on PR, checks changed files in `streams/` with `playlist:lint` and `playlist:validate`.
- `format` (CI): auto-formats `streams/`, commits changes back if any files changed.
- `update` (CI): daily cron, runs full pipeline, deploys to GitHub Pages (.gh-pages) and iptv-org/api repo.
- `validate_issue` / `validate_label`: automated issue/label checking via GitHub Actions.

## Playlist structure

- `index.m3u` - main playlist, country-grouped by default (`group-title="CountryName"`). After `generate`, copy `index.country.m3u` to `index.m3u`.
- `index.country.m3u` - channels grouped by country (language-filtered: English/Chinese only)
- `index.category.m3u` - channels grouped by category
- `index.language.m3u` - channels grouped by language
- `countries/cn.m3u` - database Chinese channels
- `countries/cn-1.m3u` - custom Chinese channels (manually maintained, not from database; source of truth is `custom/cn-1.m3u` on `master`)
- `custom/cn-1.m3u` - persistent source for cn-1. Kept OUTSIDE `streams/` on purpose: `playlist:format` strips tvg-ids that are not in the channel database, and `playlist:generate` would file these streams under "Undefined" instead of "China", so they must never go through the pipeline.
- After `playlist:generate`, copy `index.country.m3u` to `index.m3u`, then append `custom/cn-1.m3u` entries (minus its `#EXTM3U` header) to both `index.m3u` and `countries/cn-1.m3u` in the deployment. cn-1 entries must have `tvg-id="NAME@CN" tvg-logo="URL" group-title="China"` in `#EXTINF` lines (same format as database entries) so the player groups them under "China".
- `streams/us.m3u` ends with the fork-only `CNN.us` entry (CNN FAST GB CloudFront URL). Upstream carries the same URL as `CNNInternational.us@NorthAmerica`, so a duplicate-URL warning is expected. Re-append the entry after every upstream sync (see Fork workflow).

## Deployment notes

Read `DEPLOYMENT_TIPS.md` first — it is the complete fork deploy runbook.

- `/.gh-pages/` and `/.api/` are in `.gitignore` — **cannot** be committed directly from the main repo.
- `playlist:generate` regenerates ALL `.m3u` files from the database, overwriting any manual additions.
- The `gh-pages` branch must have files at the ROOT (e.g., `index.m3u`), NOT inside a `.gh-pages/` subfolder.
- Deploy via a throwaway clone of the `gh-pages` branch (recipe in `DEPLOYMENT_TIPS.md`); push over SSH: `git push git@github.com:simont-1/iptv.git gh-pages:gh-pages`. The HTTPS token in `origin` is expired. Never commit generated playlists to `master`.
- GitHub Pages must be enabled in repo Settings > Pages (source: `gh-pages` branch). It can take several minutes to activate.
- `https://raw.githubusercontent.com/<user>/iptv/gh-pages/index.m3u` works immediately without GitHub Pages config.
