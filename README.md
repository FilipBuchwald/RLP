# Padel Liga

PWA do grania w padla (Americano) ze znajomymi: prowadzenie wieczoru, ranking sezonu, historia.
Plan prac: [PLAN.md](PLAN.md). Wzór wyglądu i logiki: [prototype-reference.html](prototype-reference.html).

Stack: React + Vite + TypeScript · Cloudflare Workers (statyczny frontend + `/api/*`) · D1 (SQLite).

## Lokalnie

```bash
npm install
cp .dev.vars.example .dev.vars   # e-mail „zalogowanego” użytkownika w dev
npm run migrate                   # migracje do lokalnej bazy D1 (.wrangler/)
npm run dev                       # http://localhost:5173
```

`npm run dev` to jeden proces: Vite z HMR + `@cloudflare/vite-plugin`, który uruchamia
Workera (`worker/index.ts`) i lokalną D1 w prawdziwym runtime Workers.

| Skrypt                        | Co robi                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `dev`                         | frontend + Worker + D1 lokalnie                                           |
| `build`                       | sprawdzenie typów + build (`dist/client` – frontend, `dist/rlp` – Worker) |
| `preview`                     | build + podgląd produkcyjnej wersji lokalnie                              |
| `migrate` / `migrate:remote`  | migracje D1 lokalnie / na Cloudflare                                      |
| `deploy`                      | build + `wrangler deploy` (ręcznie; normalnie deploy robi push na `main`) |
| `lint`, `format`, `typecheck` | ESLint, Prettier, TypeScript                                              |

## Wdrożenie

Worker `rlp` w Cloudflare jest podłączony do repo na GitHubie (Workers Builds):
każdy push na `main` → `npm run build` → `npx wrangler deploy`.
Nazwa w `wrangler.toml` musi zgadzać się z nazwą Workera w panelu.

Zmiany schematu bazy: dodaj plik w `migrations/` i uruchom `npm run migrate:remote`.

## Struktura

```
src/        frontend React (pages/, components/, api.ts)
worker/     Worker: router + endpointy /api/* — jedyna droga do bazy
shared/     czysta logika (losowanie, ranking) — bez zależności od Cloudflare
migrations/ SQL dla D1
```
