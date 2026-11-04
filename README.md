# Padel Liga

PWA do grania w padla (Americano) ze znajomymi: prowadzenie wieczoru, ranking sezonu, historia.
Plan prac: [PLAN.md](PLAN.md). Wzór wyglądu i logiki: [prototype-reference.html](prototype-reference.html).

Stack: React + Vite + TypeScript · Cloudflare Pages + Pages Functions (`functions/api/*`) · D1 (SQLite).

## Lokalnie

```bash
npm install
cp .dev.vars.example .dev.vars   # e-mail „zalogowanego” użytkownika w dev
npm run migrate                   # migracje do lokalnej bazy D1 (.wrangler/)
npm run dev                       # http://localhost:5173
```

`npm run dev` uruchamia dwa procesy:

- `web` — Vite na :5173 (HMR), przekierowuje `/api/*` dalej,
- `api` — `wrangler pages dev` na :8788 (Pages Functions + lokalna D1).

`npm run preview` buduje frontend i serwuje całość z wranglera na :8788 — tak jak na produkcji.

| Skrypt                        | Co robi                                         |
| ----------------------------- | ----------------------------------------------- |
| `dev`                         | frontend + Functions + D1 lokalnie              |
| `build`                       | sprawdzenie typów + build do `dist/`            |
| `migrate` / `migrate:remote`  | migracje D1 lokalnie / na Cloudflare            |
| `deploy`                      | build + `wrangler pages deploy` (ręczny deploy) |
| `lint`, `format`, `typecheck` | ESLint, Prettier, TypeScript                    |

## Struktura

```
src/            frontend React (pages/, components/, api.ts)
functions/api/  Pages Functions — jedyna droga do bazy
shared/         czysta logika (losowanie, ranking) — bez zależności od Cloudflare
migrations/     SQL dla D1
```
