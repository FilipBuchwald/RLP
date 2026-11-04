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

Kto pisze do bazy: `worker/auth.ts`.

- **Produkcja:** Worker weryfikuje podpisany token Cloudflare Access (`Cf-Access-Jwt-Assertion`:
  podpis, wystawca, AUD, ważność) i bierze z niego e-mail. Samemu nagłówkowi z e-mailem nie ufa.
- **Lokalnie:** e-mail z `DEV_USER_EMAIL` w `.dev.vars` — działa wyłącznie na `localhost`.
- **Brak konfiguracji Access:** odczyt działa, wszystkie zapisy → 401.

## Wdrożenie

Adres: https://rlp.fbuchwald-dev.workers.dev (za Cloudflare Access).

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

## Dostęp: Cloudflare Access (logowanie kodem z e-maila)

Darmowe do 50 osób. Kto jest na liście e-maili, loguje się jednorazowym kodem (One-time PIN);
reszta świata nie zobaczy nawet strony.

1. **Zero Trust** (dash.cloudflare.com → Zero Trust). Przy pierwszym wejściu wybierz nazwę zespołu
   (np. `padel` → domena `padel.cloudflareaccess.com`) i plan **Free**.
2. **Settings → Authentication → Login methods:** upewnij się, że jest **One-time PIN**.
3. **Workers & Pages → rlp → Settings → Domains & Routes:** przy `workers.dev` kliknij
   **Enable Cloudflare Access** (to samo przy _Preview URLs_, jeśli są włączone).
   Cloudflare utworzy aplikację Access i pokaże jej **AUD** (Application Audience Tag).
4. **Zero Trust → Access → Applications →** nowa aplikacja `rlp` **→ Policies:** polityka _Allow_,
   _Include → Emails:_ e-maile osób, które mają prowadzić wieczory (właściciel + 3–4 stałych bywalców).
   W **Settings** aplikacji ustaw _Session duration_ np. na 1 miesiąc, żeby nie logować się co tydzień.
5. W `wrangler.toml` (już ustawione dla `patient-fire-adf3`) wpisz:
   ```toml
   [vars]
   ACCESS_TEAM_DOMAIN = "padel.cloudflareaccess.com"
   ACCESS_AUD = "<AUD z kroku 3>"
   ```
   i wypchnij na `main`. Od tej chwili API przyjmuje zapisy tylko z ważnym tokenem Access.

Nowa osoba z dostępem = nowy e-mail w polityce z kroku 4 (w aplikacji nic się nie zmienia).
Nowy **gracz** (bez dostępu) = „Dodaj nowego gracza” w aplikacji.

## Telefon: dodaj do ekranu głównego

- **iPhone (Safari):** Udostępnij → _Do ekranu początkowego_.
- **Android (Chrome):** menu ⋮ → _Zainstaluj aplikację_ / _Dodaj do ekranu głównego_.

Aplikacja otwiera się na pełnym ekranie na zakładce Gra. Ikony generuje `npx tsx scripts/icons.ts`.
