# Padel Liga — plan developmentu

Dokument startowy dla Claude Code. Opisuje, co budujemy, jakie decyzje są już podjęte i w jakiej kolejności realizujemy pracę.
Wzór interfejsu i działającej logiki: plik `prototype-reference.html` (jeden plik HTML + JS, dane w localStorage). Traktuj go jako specyfikację zachowania i wyglądu, nie jako kod do skopiowania 1:1.

---

## 1. Cel

Aplikacja webowa (PWA, mobile-first) do grania w padla ze znajomymi:

- **Panel gry (Americano)** — prowadzenie wieczoru na korcie z telefonu: wybór obecnych graczy, losowanie par na każdą rundę, wpisywanie wyników, tabela wieczoru na żywo.
- **Ranking sezonu** — podium + tabela (punkty, średnia na mecz, liczba meczów, % wygranych), profil gracza.
- **Historia** — lista wieczorów z wynikami wszystkich rund.

Język interfejsu: **polski**. Grupa docelowa: kilkanaście osób, 1–2 korty, 4–10 graczy na wieczór.

---

## 2. Stack

| Warstwa | Technologia |
| --- | --- |
| Frontend | React + Vite + TypeScript, PWA (manifest, ikona, „Dodaj do ekranu głównego”) |
| Hosting | Cloudflare Workers ze statycznymi plikami (Worker `rlp`, deploy z GitHuba, gałąź `main`) |
| Backend | Ten sam Worker obsługuje `/api/*` (`worker/`, router na URLPattern) |
| Baza | Cloudflare D1 (SQLite), migracje przez `wrangler d1 migrations` |
| Dostęp | Teraz: wspólny kod grupy do zapisów (oglądać może każdy). Z własną domeną: Cloudflare Access (One-time PIN) |
| Testy | Vitest (logika losowania i liczenia rankingu) |

Bez Supabase i bez zewnętrznego CMS. Klucze do bazy nigdy nie trafiają do przeglądarki — frontend rozmawia tylko z `/api/*`.
Aktualizacja „na żywo”: ekran gry odpytuje `GET /api/sessions/live` co ~5 s (polling), bez WebSocketów.

Architektura:

```
Telefon (PWA) --HTTPS--> Cloudflare Access (PIN e-mail, lista dozwolonych)
                              |--> Worker: statyczny frontend React (assets)
                              |--> Worker: /api/* --> D1
```

---

## 3. Zasady gry i logika (najważniejsza część)

### 3.1 Americano — punktacja
- Mecz 2 na 2, gra się do stałej **łącznej** liczby punktów: 16 / 21 / 24 / 32 (wybierane przy starcie, domyślnie 24).
- Wynik zawsze sumuje się do `target_points` (np. 14:10 przy 24). W UI wpisuje się wynik przyciskami +/− po jednej stronie, druga uzupełnia się automatycznie. Pierwsze kliknięcie startuje od `floor(target/2)`.
- Każdy gracz dostaje tyle punktów, ile zdobyła jego para w danym meczu. Wygrana = więcej punktów niż rywale, remis możliwy przy parzystym `target`.

### 3.2 Korty i pauzy
- `courts` = 1 lub 2; 2 korty dostępne od 8 graczy. Efektywnie: `courts = min(wybrane, floor(N/4))`.
- W każdej rundzie gra `4 × courts` osób, reszta pauzuje.

### 3.3 Algorytm losowania rundy (przenieść z prototypu: funkcja `makeRound`)
Wejście: lista graczy wieczoru, wszystkie dotychczasowe rundy, liczba kortów.
1. Policz dla każdego: `sat` (ile razy pauzował), `played` (ile meczów), liczniki partnerstw `partner[x|y]` i rywalizacji `opp[x|y]`.
2. **Kto pauzuje:** sortuj rosnąco po `sat + (0.6 jeśli pauzował w poprzedniej rundzie)`, potem malejąco po `played`, potem losowo. Pierwszych `N − 4×courts` pauzuje.
3. **Pary i mecze:** dla grających przejrzyj wszystkie podziały na pary (dla 8 osób: 105) i wszystkie zestawienia par w mecze (dla 4 par: 3). Koszt = `Σ partner² × 100 + Σ opp² × 10 + random()`. Wybierz najtańszy.
4. Wynik: `{ number, sitting[], matches[{ court, a:[p1,p2], b:[p3,p4] }] }`.

Losowanie wykonuje **serwer** (endpoint tworzący rundę), żeby dwa telefony nie wylosowały różnych par.

### 3.4 Równa liczba meczów — dwa tryby (wybór obowiązkowy przy starcie)
Wzór: wszyscy mają równo meczów co `step = N / gcd(N, 4 × courts)` rund.
Przykłady (1 kort): 4 os. → co 1 rundę, 5 → co 5, 6 → co 3, 7 → co 7, 8 → co 2 (na 2 kortach co 1).

**Tryb „Plan rund” (`mode = 'plan'`)**
- Przy starcie aplikacja podpowiada liczby rund będące wielokrotnością `step` (do 5 opcji, max 30 rund, tylko takie, gdzie każdy zagra ≥ 2 mecze). Przy każdej: liczba meczów na osobę i szacowany czas (≈ 13 min na rundę przy 24 pkt; 9 / 12 / 13 / 17 min dla 16 / 21 / 24 / 32).
- Start jest zablokowany, dopóki nie wybrano liczby rund.
- W trakcie: „Runda X / N” + pasek postępu. W ostatniej rundzie zamiast „Następna runda” jest „Zakończ wieczór i zapisz”.
- Zakończenie wcześniej → ten sam mechanizm przycinania co niżej.

**Tryb „Bez limitu” (`mode = 'open'`)**
- W trakcie widać komunikat: „Równo meczów będzie po rundzie X (jeszcze Y)” albo „Teraz wszyscy mają równo — możecie kończyć”.
- „Zakończ wieczór”: jeśli liczba meczów jest nierówna → okno z listą (kto ma ile meczów, nadmiar na czerwono) i dwie opcje:
  - **„Przytnij do X meczów i zapisz”** (X = minimum),
  - **„Gramy dalej — równo po rundzie Y”**.

### 3.5 Przycinanie (`sessions.cap`)
- Każdemu graczowi liczą się tylko jego **pierwsze `cap` meczów** w kolejności rund. Pozostałe mecze zostają w bazie i w historii, ale nie wchodzą do punktacji.
- W historii odcięty mecz jest przekreślony przy nazwisku gracza, któremu go nie policzono; wieczór ma etykietę „przycięte do X meczów na osobę”.
- Ranking sezonu i profile liczą już po przycięciu. Nie przechowujemy listy odciętych meczów — liczymy ją z `cap` (patrz `excluded()` w prototypie).
- Niedokończona runda (bez kompletu wyników) przy zakończeniu jest odrzucana.

### 3.6 Gracze, użytkownicy, goście
- **Gracz** = wpis w tabeli `players` (imię, kolor). Nie ma konta ani e-maila.
- **Użytkownik** = osoba z dostępem przez Cloudflare Access; prowadzi wieczór i wpisuje wyniki. Na liście: właściciel + 3–4 stałych bywalców.
- Każdy użytkownik może **dodać nowego gracza w aplikacji** (przy tworzeniu wieczoru, pole „Dodaj nowego gracza”). W panelu Cloudflare nic się wtedy nie zmienia.
- Flaga **gość** (`is_guest`): gość liczy się normalnie w tabeli wieczoru; w rankingu sezonu jest pokazany w osobnej sekcji pod tabelą. Zmiana gość → stały gracz włącza jego dotychczasowe wyniki do rankingu.

### 3.7 Ranking i statystyki
- Ranking sezonu liczony z meczów (nie zapisywany): punkty, mecze, średnia (pkt/mecz), W–R–P, % wygranych, liczba wieczorów.
- Przełącznik sortowania: Suma / Średnia (domyślnie Suma).
- Profil gracza: miejsce, punkty, średnia, % wygranych, forma (ostatnie 8 meczów W/R/P), bilans, najlepszy i najsłabszy partner (min. 2 wspólne mecze, po średniej punktów).

---

## 4. Model danych (D1 / SQLite)

```sql
CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  is_guest    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  date           TEXT NOT NULL,            -- YYYY-MM-DD
  season         INTEGER NOT NULL,         -- np. 2026
  target_points  INTEGER NOT NULL,         -- 16/21/24/32
  courts         INTEGER NOT NULL,         -- 1/2
  mode           TEXT NOT NULL CHECK (mode IN ('plan','open')),
  planned_rounds INTEGER,                  -- tylko dla 'plan'
  cap            INTEGER,                  -- przycięcie, NULL = brak
  status         TEXT NOT NULL CHECK (status IN ('live','done')),
  created_by     TEXT,                     -- e-mail z nagłówka Cloudflare Access
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session_players (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY (session_id, player_id)
);

CREATE TABLE rounds (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  sitting     TEXT NOT NULL DEFAULT '[]',  -- JSON: lista player_id
  UNIQUE (session_id, number)
);

CREATE TABLE matches (
  id        TEXT PRIMARY KEY,
  round_id  TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  court     INTEGER NOT NULL,
  a1 TEXT NOT NULL, a2 TEXT NOT NULL,
  b1 TEXT NOT NULL, b2 TEXT NOT NULL,
  score_a   INTEGER,                       -- NULL = brak wyniku
  score_b   INTEGER
);
```

Zasada: w danym momencie może być maksymalnie jeden wieczór ze `status = 'live'`.

---

## 5. API (Worker, `/api/*`)

| Metoda | Ścieżka | Opis |
| --- | --- | --- |
| GET | `/api/players` | Lista graczy |
| POST | `/api/players` | Dodaj gracza `{ name, isGuest? }`, kolor przydzielany automatycznie |
| PATCH | `/api/players/:id` | Zmiana `{ name?, color?, isGuest? }` (np. gość → stały) |
| POST | `/api/sessions` | Nowy wieczór `{ playerIds, targetPoints, courts, mode, plannedRounds? }` → tworzy i losuje 1. rundę |
| GET | `/api/sessions/live` | Bieżący wieczór z rundami i meczami (polling) |
| PUT | `/api/matches/:id` | Zapis wyniku `{ scoreA }` → serwer ustawia `scoreB = target − scoreA` |
| POST | `/api/sessions/:id/rounds` | Losuj następną rundę; błąd, jeśli bieżąca nie ma kompletu wyników lub plan się skończył |
| POST | `/api/sessions/:id/finish` | Zakończ `{ cap? }`; zwraca 409 z licznikami meczów, jeśli nierówno i brak `cap`; 204, gdy nie rozegrano żadnej rundy (wieczór znika) |
| DELETE | `/api/sessions/:id` | Odrzuć wieczór bez zapisu (tylko `live`) |
| GET | `/api/ranking?season=2026&sort=points\|avg` | Ranking (stali + osobno goście) |
| GET | `/api/sessions?season=2026` | Historia zakończonych wieczorów |
| GET | `/api/players/:id/stats?season=2026` | Profil gracza |

JSON w API używa camelCase (kształty: `shared/dto.ts`); w bazie kolumny zostają snake_case.

Bezpieczeństwo: wszystkie zapisy (POST/PUT/PATCH/DELETE) wymagają nagłówka `Cf-Access-Authenticated-User-Email` (ustawia go Cloudflare Access); brak → 401. Lokalnie w dev — zmienna `DEV_USER_EMAIL`.

Logikę (losowanie, tabela, przycinanie, `step`) trzymaj w osobnym module `shared/` bez zależności od Cloudflare, żeby testować ją Vitestem i używać w API.

---

## 6. Struktura projektu (propozycja)

```
padel-liga/
  src/                 # frontend React
    pages/             # Ranking, Game, History
    components/        # PlayerSheet, MatchCard, Podium, ...
    api.ts             # klient /api
  worker/              # Worker: router + endpointy /api/*
  shared/              # czysta logika: americano.ts, stats.ts (+ testy)
  migrations/          # SQL dla D1
  public/              # manifest.webmanifest, ikony
  wrangler.toml
  PLAN.md
  prototype-reference.html
```

---

## 7. Wygląd

Odtwórz styl prototypu: ciemny granat (`#0b1120`), karty `#141c2e`, akcent limonkowy jak piłka (`#c8f53c`), fonty Barlow + Barlow Condensed (liczby, nagłówki). Dolny pasek zakładek: Ranking / Gra / Historia, kropka „na żywo” przy Gra podczas trwającego wieczoru. Profil gracza jako wysuwany od dołu panel. Duże przyciski +/− (min. 40 px) — obsługa jedną ręką na korcie.

---

## 8. Plan krok po kroku

Pracuj etapami; po każdym etapie zatrzymaj się, pokaż wynik i poczekaj na akceptację.

### Etap 1. Projekt i środowisko
- [ ] Repo `padel-liga`, React + Vite + TypeScript, ESLint/Prettier
- [ ] `wrangler.toml` z bazą D1, skrypty `dev` (Vite + `@cloudflare/vite-plugin`) i `migrate`
- [ ] Pusta strona z zakładkami
- **Gotowe, gdy:** lokalnie działa frontend + Worker + D1, a deploy na `*.workers.dev` się udaje

### Etap 2. Logika i baza
- [ ] `shared/americano.ts`: `makeRound`, `stepFor`, opcje planu rund; `shared/stats.ts`: tabela, przycinanie, profil
- [ ] Testy Vitest: równe pauzy; po `step` rundach wszyscy mają równo meczów (4–10 osób, 1–2 korty); brak powtórki partnera, gdy da się jej uniknąć; przycinanie liczy pierwsze `cap` meczów
- [ ] Migracja SQL z sekcji 4
- **Gotowe, gdy:** testy przechodzą

### Etap 3. API
- [ ] Endpointy z sekcji 5, walidacja wejścia, transakcje przy tworzeniu wieczoru/rundy
- [ ] Seed z danymi demo (jak w prototypie) do lokalnego testowania
- **Gotowe, gdy:** cały wieczór (oba tryby, z przycięciem) da się rozegrać samymi wywołaniami API

### Etap 4. Interfejs
- [ ] Ekrany z prototypu: Ranking (podium, tabela, Suma/Średnia), Gra (setup + tryby + runda + tabela wieczoru + poprzednie rundy + okno przycinania), Historia, profil gracza
- [ ] Dodawanie gracza z checkboxem „gość”; sekcja gości pod rankingiem
- [ ] Polling bieżącego wieczoru co 5 s
- **Gotowe, gdy:** dwa telefony widzą ten sam wieczór i te same wyniki

### Etap 5. Dostęp i wdrożenie
- [ ] Instrukcja konfiguracji Cloudflare Access (One-time PIN, polityka z listą e-maili) w `README.md`
- [ ] Sprawdzanie nagłówka Access w API
- [ ] Manifest PWA i ikony
- **Gotowe, gdy:** pierwszy prawdziwy wieczór rozegrany i zapisany

### Etap 6. Po pierwszych wieczorach
- [ ] Edycja wyniku w zapisanym wieczorze
- [ ] Cofnięcie ostatniej rundy w trakcie gry
- [ ] Eksport / kopia zapasowa bazy

### Później (nie teraz)
- Wariant Mexicano, własna domena, wykresy formy, porównanie dwóch graczy, archiwum sezonów

---

## 9. Otwarte kwestie (przyjęte domyślne — do potwierdzenia)

| Kwestia | Domyślnie |
| --- | --- |
| Ranking i historia publiczne czy za logowaniem? | Cała strona za Access; łatwo zmienić na ochronę tylko zapisów |
| Ranking sezonu: suma czy średnia? | Suma (wieczory są wyrównane), przełącznik na średnią |
| Domena | Na start `*.workers.dev` |
| Goście w rankingu sezonu | Osobna sekcja pod tabelą |
| Kto ma dostęp do prowadzenia wieczoru | Właściciel + 3–4 stałych bywalców |
