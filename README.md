# makefun-frontend-01

A static frontend for [make.fun](https://make.fun), built with native ES modules and CSS.

[![make.fun](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/jusst01/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/jusst01/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

## Surfaces
- **Bounty Board (`#/`)**: Browse open competitions, search, and sort by various metrics.
- **Bounty Page (`#/bounty/<slug>`)**: Details of a specific competition.
- **Leaderboard (`#/bounty/<slug>/leaderboard`)**: Rankings for a competition.
- **Profile (`#/u/<handle>`)**: Public profile of an account.

## Development
To run locally:
1. `node serve.ts`
2. Open `http://localhost:8080` in your browser.

## Handover
To generate the submission:
`MAKEFUN_OUTPUT_DIR=out node main.ts`
This will generate `out/dossier.json`.

## v3

- First load: 2 files, 2,605 B gzipped (index.html 1,409 B + main.js 1,196 B), down from 3 files / 5,327 B. Critical CSS is inlined into index.html; the full stylesheet loads deferred, right after first paint.
- Data layer: browser-native ETag revalidation (cache: no-cache) with an in-memory cache and in-flight de-duplication; unchanged answers keep the already-parsed object.
- Board: master-detail on wide screens — the list stays mounted and selecting a bounty patches only the detail pane; per-minute refresh patches only changed rows.
- Leaderboard: real win rates with 90% intervals, W-D-L and prize-now per row.
- Bounty: rewards at the live pot (base / from-fees / prize-now) and an embedded top 10.
- Live updates: one shared 1-second timer drives every countdown; the header shows this view's API request count, cache hits and last-fetch time.
- Profiles: payouts section with amounts, paid timestamps and transaction links, plus wallet and GitHub links.
