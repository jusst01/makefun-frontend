# make.fun frontend — a fast, live-data web client for make.fun

[![make.fun bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/jusst01/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/jusst01/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

A fully working custom frontend for [make.fun](https://make.fun): the live bounty board, each bounty's page and leaderboard, and public account profiles — plain static files, no build step, reading make.fun's public API.

Entry for the [Build the best make.fun frontend](https://make.fun/bounty/makefun-frontend-01) bounty.

## Run it

```
node serve.ts
```

then open http://localhost:8080.

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

copies `app/` and `screenshots/` to `out/` and writes `out/dossier.json`.
