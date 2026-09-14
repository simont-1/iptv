# AGENTS.md - iptv-org/iptv

This file provides compact guidance for OpenCode agents working in this repo. Every line below answers: "Would an agent likely miss this without help?"

## Commands

| Command | Description |
|---|---|
| `npm run lint` | Run ESLint on `scripts/` and `tests/` (`npx eslint "scripts/**/*.{ts,js}" "tests/**/*.{ts,js}"`) |
| `npm run test` | Run jest tests (`--runInBand`, uses `@swc/jest` transform) |
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
| `npm run playlist:filter-language` | Filter streams to keep only English (eng) and Chinese (zho) language streams |
| `npm run issue:validate` | Validate an issue body against requirements |
| `npm run report:create` | Create a report on current issues |
| `npm run act:check` | Run the check workflow locally |
| `npm run act:format` | Run the format workflow locally |
| `npm run act:update` | Run the update workflow locally |

## Order matters

- No `typecheck` script exists in package.json. The actual CI `check` workflow runs `playlist:lint` then `playlist:validate`.
- The `format` workflow runs `api:load -> playlist:format -> playlist:lint -> playlist:validate`.
- `update` workflow runs `playlist:update -> playlist:lint -> playlist:validate -> playlist:generate -> playlist:export -> readme:update`, then deploys `.gh-pages/` to `gh-pages` branch via `github-pages-deploy-action`.
- The `gh-pages` branch must have playlist files at the ROOT, not inside `.gh-pages/`. When pushing manually, create a separate git repo inside `.gh-pages/`.

## Key directories

- `scripts/commands/` - CLI command modules (api/, issue/, playlist/, readme/, report/)
- `scripts/core/` - core utilities (playlistParser, streamTester, markdown, etc.)
- `scripts/generators/` - playlist generation logic (indexes by country, language, category)
- `scripts/tables/` - table rendering for CLI output
- `scripts/models/` - data models (stream, playlist, issue, discussion)
- `scripts/` also contains api.ts, constants.ts, utils.ts
- `streams/` - internal playlist files (.m3u), one per country/region
- `tests/` - jest test suites (commands/playlist/, commands/issue/, commands/readme/, commands/report/)
- `tests/__data__/` - test fixtures: `input/` (data, streams) and `expected/` (output)
- `.github/workflows/` - CI: check, format, update, validate_issue, validate_label
- `.readme/` - template.md and preview.png for README generation
- `PLAYLISTS.md` - auto-generated list of available public playlists

## Testing quirks

- Tests use `cross-env` to set `DATA_DIR`, `STREAMS_DIR`, `ROOT_DIR`, `PUBLIC_DIR`, `LOGS_DIR`.
- Test data lives in `tests/__data__/input/` and expected outputs in `tests/__data__/expected/`.
- Jest uses `@swc/jest` for transformation (not ts-jest), testRegex `tests/(.*?/)?.*test.ts$`.
- `jest-expect-message` is loaded via `setupFilesAfterEnv`.
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
- `countries/cn-1.m3u` - custom Chinese channels (manually maintained, not from database)
- After `playlist:generate`, copy `index.country.m3u` to `index.m3u`, then append `countries/cn-1.m3u` entries to `index.m3u`. cn-1 entries must have `tvg-id="NAME@CN" tvg-logo="URL" group-title="China"` in `#EXTINF` lines (same format as database entries) so the player groups them under "China".

## Deployment notes

- `/.gh-pages/` and `/.api/` are in `.gitignore` — **cannot** be committed directly from the main repo.
- `playlist:generate` regenerates ALL `.m3u` files from the database, overwriting any manual additions.
- The `gh-pages` branch must have files at the ROOT (e.g., `index.m3u`), NOT inside a `.gh-pages/` subfolder. Pushing manually requires creating a separate git repo inside `.gh-pages/`:
  ```sh
  cd .gh-pages && git init && git add -A && git commit -m "Deploy" && git branch -M gh-pages && git push -f origin gh-pages
  ```
- Pushing `gh-pages` branch requires a GitHub Personal Access Token (password auth is disabled): `git push https://<TOKEN>@github.com/<user>/iptv.git gh-pages --force`.
- GitHub Pages must be enabled in repo Settings > Pages (source: `gh-pages` branch). It can take several minutes to activate.
- `https://raw.githubusercontent.com/<user>/iptv/gh-pages/index.m3u` works immediately without GitHub Pages config.
