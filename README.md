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
