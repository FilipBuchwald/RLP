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

| Skrypt                        | Co robi                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `dev`                         | frontend + Worker + D1 lokalnie                                                   |
| `build`                       | sprawdzenie typów + build (`dist/client` – frontend, `dist/rlp` – Worker)         |
| `preview`                     | build + podgląd produkcyjnej wersji lokalnie                                      |
| `migrate` / `migrate:remote`  | migracje D1 lokalnie / na Cloudflare                                              |
| `deploy`                      | build + `wrangler deploy` (ręcznie; normalnie deploy robi push na `main`)         |
| `seed`                        | czyści **lokalną** bazę i wgrywa dane demo (8 graczy + gość, 5 wieczorów)         |
| `smoke`                       | rozgrywa całe wieczory przez API na lokalnym `npm run dev` (potem `npm run seed`) |
| `test` / `test:watch`         | testy Vitest logiki z `shared/`                                                   |
| `lint`, `format`, `typecheck` | ESLint, Prettier, TypeScript                                                      |

## API

Endpointy: [PLAN.md, sekcja 5](PLAN.md). Kształty JSON-a: `shared/dto.ts`.
Wieczór i każda runda zapisują się atomowo (`DB.batch`).

Kto pisze do bazy: `worker/auth.ts` (po kolei):

- **Cloudflare Access** (gdy ustawione `ACCESS_*`): podpisany token JWT — podpis, wystawca, AUD, ważność.
- **Lokalnie:** `DEV_USER_EMAIL` z `.dev.vars` — działa wyłącznie na `localhost`.
- **Kod grupy** (sekret `EDIT_CODE`): odczyt dla wszystkich, zapisy z nagłówkiem `X-Edit-Code`.
- **Nic nie ustawione:** tylko odczyt, zapisy → 401.

Samemu nagłówkowi z e-mailem API nigdy nie ufa. `GET /api/me` mówi, czy dany telefon może zapisywać.

## Wdrożenie

Adres: https://rlp.fbuchwald-dev.workers.dev

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

## Dostęp

**Teraz: wspólny kod grupy.** Oglądać (Ranking, Historia, wieczór na żywo) może każdy, kto ma link.
Żeby zacząć wieczór, wpisywać wyniki albo dodawać graczy, telefon raz podaje kod grupy
(zakładka Gra → „Kod grupy”) i go zapamiętuje. Spacje i wielkość liter nie mają znaczenia.

- Ustawienie / zmiana kodu (min. 6 znaków, lepiej 8+):
  `printf '%s' 'NASZKOD' | npx wrangler secret put EDIT_CODE` — kod nie trafia do repo.
  Po zmianie kodu telefony ze starym kodem same go zapomną i poproszą o nowy.
- Ochrona przed zgadywaniem: po 10 błędnych próbach z jednego IP — 15 minut przerwy
  (tabela `code_attempts`, migracja `0002`).
- „Zapomnij kod na tym telefonie” — link na dole zakładki Gra.

**Później, z własną domeną: Cloudflare Access** (logowanie kodem z maila, lista osób).
Kod Workera to obsługuje — gdy w `wrangler.toml` są `ACCESS_TEAM_DOMAIN` i `ACCESS_AUD`, Access ma
pierwszeństwo przed kodem grupy. Na `workers.dev` Access chroni cały adres (także oglądanie),
dlatego na razie go nie używamy. Skrót konfiguracji (Zero Trust, nowy układ panelu):

1. Zespół (Zero Trust → Settings → Team domain), plan Free.
2. **Integrations → Identity providers → One-time PIN.**
3. **Access controls → Policies → Add a policy:** Allow, Include → **Emails** (nie „Email domain”!).
4. Aplikacja Access dla domeny / ścieżki, _Login methods_: tylko One-time PIN, Instant Auth.
5. W `wrangler.toml`: `ACCESS_TEAM_DOMAIN` i `ACCESS_AUD` (AUD aplikacji), push.

## Telefon: dodaj do ekranu głównego

- **iPhone (Safari):** Udostępnij → _Do ekranu początkowego_.
- **Android (Chrome):** menu ⋮ → _Zainstaluj aplikację_ / _Dodaj do ekranu głównego_.

Aplikacja otwiera się na pełnym ekranie na zakładce Gra. Ikony generuje `npx tsx scripts/icons.ts`.
