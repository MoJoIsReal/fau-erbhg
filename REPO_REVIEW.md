# Repo-revisjon — QA (kodekvalitet), dataintegritet og UX

Dato: 2026-11-02 · Gren: `claude/eloquent-gauss-om08sh` (basert på `1b10c33`)
Fokus etter bestilling: **kodekvalitet/QA, dataintegritet og UX**. Sikkerhet er
bare berørt der den påvirker data eller brukeropplevelse; dette er ikke en full
sikkerhetsrevisjon.

Følgedokumenter: [`REVIEW_TASKS.md`](REVIEW_TASKS.md) (én oppgave per funn) og
[`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) (flytene UI → API → DB).
Når oppgavene er løst, skal varige regler foldes inn i `AGENTS.md`/`docs/` og
disse tre filene fjernes (jf. «Change discipline» i `AGENTS.md`).

---

## 1. Sammendrag

Kodebasen er moden og uvanlig godt sikret for et prosjekt av denne størrelsen.
Alle porter er grønne (`check`, 601/601 offline-tester, `build`, og 28/28
integrasjonstester mot ekte PostgreSQL). Kjernen i dataintegriteten holder:
påmelding er kappløpssikker (låsende CTE + unik indeks), fotoslot kan ikke
dobbeltbookes, avmelding frigjør plass i én setning, og nyhetsbrev-outboxen er
korrekt «minst én gang».

Svakhetene ligger **ved kantene av de gode mekanismene**:

1. **Stille datatap.** Excel-reimport av årskalenderen flater ut rik tekst
   (lenker, fet skrift, bilder) i beskrivelsen hver gang et *annet* felt i raden
   er endret, mens forhåndsvisningen bare viser det andre feltet (DB-001,
   bekreftet). Redigering av et arrangement (tid, type, potluck) avstemmes aldri
   mot eksisterende påmeldinger: et fotoarrangement flyttet til 11:00 beholder
   barn booket kl. 10:00 (DB-002).
2. **Personvern i data som aldri ryddes.** Bilder satt inn i redigeringsverktøyet
   blir offentlige Cloudinary-filer som aldri slettes og ikke kan slettes fra UI
   (DB-003).
3. **UX for styret: arbeid går tapt.** En utløpt sesjon (401) under redigering
   sender brukeren til forsiden og kaster utkastet (UX-001, bekreftet i
   nettleser). Lagre-knappen for innlegg har ingen dobbeltklikk-sperre, så to
   innlegg (og to nyhetsbrev) kan opprettes (UX-006).
4. **UX for foreldre: feil ser ut som «tomt».** Kalenderens listevisning viser
   «Ingenting igjen med disse filtrene» når `/api/events` feiler (UX-002);
   påmeldingsdialogen har hardkodet norsk i engelsk modus (UX-003); tomme
   skjemaer sendes til serveren og bruker opp kontaktskjemaets IP-kvote (UX-004).
5. **Kvalitetsporter med blindsoner.** i18n-ratchet fanger ikke hardkodede
   strenger; kildebaserte testvakter går stille grønt hvis en markørstreng
   forsvinner (TEST-002); testsuiten feiler utenfor UTC og avslører at
   påminnelses-e-post formaterer dato i serverens tidssone (TEST-001).

Ingen P0-funn. 41 funn totalt: 4 P1, 16 P2, 21 P3.

## 2. Arkitekturoversikt

React 19-SPA (Wouter, TanStack Query, RHF + zod) → `apiRequest`/queryFn i
`client/src/lib/queryClient.ts` → ni Vercel-handlere i `api/*.js` + én cron →
`withApiHandler` → `requireAuth/requireRole/requireCsrf` → `sanitize*` →
parametrisert Neon-SQL → én `map*(row)` per ressurs → camelCase-JSON.
Feil: `res.status(4xx).json({ error, code })` → `apiErrorText(error, t)` → toast.
Delt kjøretidskode i `shared/*.js` med `.d.ts`. Integrasjoner: Cloudinary,
Cloudflare R2 (privat mediedeling), Gmail SMTP, Turnstile, Sentry.
Dokumentasjonen i `docs/architecture.md` er oppdatert og stemmer i hovedsak med
koden; ingen `ARCHITECTURE_REVIEW.md` er derfor laget.

## 3. Dekning (tellinger fra repoet)

| Objekt | Antall | Gjennomgått |
|---|---|---|
| Route-handlere (`api/*.js`) + cron | 9 + 1 | alle |
| Handlinger/ressurser (multiplekset) | 42 | 41 har atferdstest; `media upload-abort` mangler |
| `api/_shared`-moduler / `shared/*.js` | 23 / 13 (11 med `.d.ts`) | alle i fokusområdene |
| Tabeller (`shared/schema.ts`) | 21 | alle |
| Migrasjoner | 24 (0001–0024) | alle mot skjema |
| Sider / klientfiler utenom `ui/` | 15 / 88 | alle sider statisk; 8 offentlige ruter kjørt i nettleser |
| Testsuiter offline / tester | 49 / 601 | kjørt |
| Integrasjonstester (PostgreSQL) | 1 suite / 28 tester | kjørt lokalt mot PG 16 |
| 4xx-avvisninger i `api/` | 178, hvorav 90 uten `code` | skannet |
| Spor (flyter) | 13 (+ F-10 delt i to) | 2 PASS · 10 PARTIAL · 2 FAIL · 0 BLOCKED |

## 4. Scorekort

| Område | Score | Begrunnelse |
|---|---|---|
| Sikkerhet | 8* | Ikke hovedfokus. Parametrisert SQL, CSRF, rolle­matrise testet; `npm audit` viser én transitiv zod-advisory (4 high) via `@vercel/functions`. |
| Ytelse | 8 | Ingen målte problemer; PDF-chunk 1,19 MB er lazy-lastet. Ikke målt i drift. |
| Vedlikeholdbarhet | 7 | Konsistente mønstre, men cron-modulen (987 linjer) dupliserer hjelpere som allerede har driftet (MAINT-001). |
| Arkitektur | 8 | Én backend, tydelige grenser, dokumentert; få avvik (registrations mangler `map*`). |
| Kodekvalitet | 7 | Streng tsc, 4 baseline-unntak, 13 `any` i klienten; noen kopier og hardkodede strenger. |
| Testbarhet | 7 | Sterk handler-harness og ekte SQL-tester; klientens skjemaflyter er nesten utestet, og noen vakter er vakuøse. |
| Sporbarhet | 7 | 2 FAIL-spor (årskalender-import, innleggsredigering). |
| Dataintegritet | 7 | Kjernen er robust; kantene (event-redigering, import, opprydding) mangler avstemming. |
| UX | 6 | God struktur og tilgjengelighetsgrunnlag, men feiltilstander som ser ut som tomhet og tap av utkast. |
| Tilgjengelighet | 8 | Skip-link, fokushåndtering, 44px, AlertDialog; noen mangler (h1 i feiltilstand, like navn, fokus etter feil). |
| Observerbarhet | 7 | Strukturerte logger og request-id; cron-feil mister stack, feilkonfigurasjon gir stille 500. |
| Dokumentasjon | 8 | Rik og ærlig; fem små avvik mot koden (DOC-001). |
| **Samlet** | **7** | Solid fundament; målrettede rettelser kreves for stille datatap og UX-tap. |

\* Sikkerhet ble ikke revidert i dybden.

## 5. Prioriterte funn

Konfidens: CONFIRMED = reprodusert (enhetsprobe, integrasjons-DB eller nettleser),
HIGH = sterk statisk evidens, POSSIBLE = avhenger av data/kjøretid som ikke er sett.
Funn merket † er også kontrollert av hovedrevisor direkte mot koden.

| ID | P | Alvor | Konf. | Tittel | Sted |
|---|---|---|---|---|---|
| DB-001† | P1 | Medium | CONFIRMED | Excel-reimport flater ut rik tekst i beskrivelse når et annet felt er endret | `api/yearly-calendar.js:342,372`, `shared/yearly-calendar-utils.js:357-380` |
| DB-002† | P1 | Medium | HIGH | Redigering av arrangement avstemmes ikke mot eksisterende påmeldinger/fotoslot | `api/events.js:364-400` |
| DB-003† | P1 | Medium | CONFIRMED | Bilder fra redigeringsverktøyet blir aldri slettet og er offentlige | `client/src/components/RichTextEditor.tsx:255`, `api/documents.js:15-37,66` |
| UX-001† | P1 | High | CONFIRMED | Utløpt sesjon under redigering sender til «/» og kaster utkast | `client/src/App.tsx:97-112`, `client/src/lib/queryClient.ts:66-77` |
| DB-004† | P2 | Medium | CONFIRMED | Påmelding åpen etter arrangementsdato når frist mangler | `api/registrations.js:85-95,516-528` |
| DB-005 | P2 | Medium | CONFIRMED | Kalender-plassering valideres bare i nettleseren | `api/yearly-calendar.js:87-151`, `shared/yearly-calendar-utils.js:273-287` |
| DB-006 | P2 | Medium | HIGH | Hele-rad-PUT uten samtidighetskontroll; toggles sender gammelt øyeblikksbilde | `client/src/pages/content.tsx:193-247`, `api/secure-settings.js:399-431` |
| DB-007 | P2 | Medium | POSSIBLE | Brukernavn unikt case-sensitivt, men slås opp case-insensitivt | `shared/schema.ts:8`, `api/auth.js:206-215` |
| DB-008 | P2 | Low | HIGH | Påmelding kan svare 500 etter at den er lagret; avmeldingslenke tapt | `api/registrations.js:622` |
| UX-002† | P2 | Medium | CONFIRMED | Listevisning skjuler feilet `/api/events` som «ingen treff» | `client/src/hooks/useCalendarEntries.ts:64-68` |
| UX-003† | P2 | Medium | CONFIRMED | Hardkodet norsk i påmeldingsdialogen; i18n-ratchet er blind | `client/src/components/event-registration-modal.tsx:29,332,488,496` |
| UX-004 | P2 | Medium | CONFIRMED | Offentlige skjema sender tomme felt; kun toast; brenner kontakt-kvote | `client/src/lib/form-schemas.ts:32-48`, `api/contact.js:69-79` |
| UX-005 | P2 | Medium | CONFIRMED | Innholdsredigering viser «Ingen innlegg» når lasting feiler | `client/src/pages/content.tsx:79-87,581-588` |
| UX-006† | P2 | Medium | HIGH | Lagre innlegg uten in-flight-sperre → doble innlegg/nyhetsbrev | `client/src/pages/content.tsx:153-185,426` |
| UX-007 | P2 | Medium | CONFIRMED | Navigasjon beholder scrollposisjon | `client/src/components/layout.tsx:71-82` |
| TEST-001† | P2 | Medium | CONFIRMED | Påminnelsesdato formateres i serverens tidssone; testsuite feiler utenfor UTC | `api/cron/event-reminders.js:133-141,199-208` |
| TEST-002† | P2 | Medium | CONFIRMED | Kildebaserte vakter blir stille grønne når markør forsvinner | `tests/registration-cancel.test.mjs:159-166,181-185` |
| OBS-001 | P2 | Medium | CONFIRMED | Feilet cron-steg mister stack; Sentry får bare stegnavn | `api/cron/event-reminders.js:826-856`, `api/_shared/sentry.js:42-71` |
| OBS-002† | P2 | Medium | HIGH | Feilkonfigurert `SESSION_SECRET` gir naken 500 uten Sentry | `api/auth.js:149-154` m.fl. |
| MAINT-001 | P2 | Medium | CONFIRMED | Cron-modulen dupliserer dato-/mal-hjelpere som har driftet | `api/cron/event-reminders.js` |
| DB-009 | P3 | Low | POSSIBLE | NULL `attendee_count` = 0 i tellere, 1 i skrivestier; ingen CHECK | `shared/schema.ts:52`, `api/events.js:109` |
| DB-010 | P3 | Low | CONFIRMED (CI-DB) | To RESTRICT-FK-er; slette-kappløp gir 500 | `api/events.js:298-301`, `migrations/0009` |
| DB-011 | P3 | Low | HIGH | Samtidige svar på kontaktmelding overskriver hverandre | `api/secure-settings.js:578-639` |
| DB-012 | P3 | Low | CONFIRMED | Re-abonnement beholder gammel `confirmed_at` | `api/contact.js` (subscribe) |
| DB-013 | P3 | Low | POSSIBLE | Tilbakekall mens opplasting pågår etterlater R2-objekter | `api/_shared/media-share.js:237-249` |
| UX-008 | P3 | Low | CONFIRMED | Beskyttet dyplenke uten innlogging lander stille på forsiden | `client/src/App.tsx:97-112` |
| UX-009 | P3 | Low | HIGH | Avvist påmelding (fullt/frist) oppdaterer ikke arrangementsdata | `event-registration-modal.tsx:130-175` |
| UX-010 | P3 | Low | HIGH | ErrorBoundary: «Last på nytt» går til «/», kun norsk | `client/src/components/ErrorBoundary.tsx:42-83` |
| UX-011 | P3 | Low | HIGH | Sider bak e-postlenker feiltolker forbigående feil, ingen «prøv igjen» | `client/src/pages/newsletter.tsx:57-66`, `registration-cancel.tsx:172-205` |
| UX-012 | P3 | Low | HIGH | Fritekst kuttes stille av serveren (ingen maxLength/teller) | `api/_shared/middleware.js:550` |
| TRACE-001 | P3 | Low | CONFIRMED | 90 av 178 avvisninger mangler `code`; content.tsx ignorerer koder | `api/registrations.js:185,229,266`, `content.tsx:179-229` |
| A11Y-001 | P3 | Low | CONFIRMED | Kalenderens totalfeil mangler h1 og «prøv igjen» | `calendar-views.tsx:220-227` |
| A11Y-002 | P3 | Low | CONFIRMED | Like tilgjengelige navn på slett-knapper per påmelding | `event-registrations-view.tsx:264-272` |
| A11Y-003 | P3 | Low | POSSIBLE | Fokus faller til `<body>` etter mislykket innsending | `event-registration-modal.tsx:490-497` |
| A11Y-004 | P3 | Low | CONFIRMED | Frittstående tekstlenker under 44px berøringsmål | `home.tsx`, `contact.tsx:385-390` |
| TEST-003 | P3 | Low | CONFIRMED | Autorisasjonsmatrisen sjekker per fil, ikke per rute; cron aldri kjørt i harness | `tests/api-authorization.test.mjs:112-119` |
| TEST-004 | P3 | Low | CONFIRMED | Klientens skjemaflyter har ingen atferdstester | ~56 av 88 klientfiler uten test |
| OBS-003 | P3 | Low | CONFIRMED | Telefon-redaksjon fjerner datoer og ID-er fra logger | `api/_shared/redact.js:9` |
| OBS-004 | P3 | Low | CONFIRMED | 11 `console.*` i `api/` utenom `logEvent` | `middleware.js:360` m.fl. |
| MAINT-002 | P3 | Low | CONFIRMED | `registrations` mangler `map*`-funksjon | `api/registrations.js:190,342,641,750` |
| MAINT-003 | P3 | Low | HIGH | Store sidekomponenter, utypet forespørselskropp | `pages/settings.tsx`, `yearly-calendar-entry-modal.tsx:130,163` |
| DOC-001 | P3 | Low | CONFIRMED | Dokumentasjon avviker fra koden (inkl. `createdBy` i årskalender) | `AGENTS.md`, `docs/subsystems.md:38-40` |

## 6. Sikkerhet (utenfor hovedfokus)

Ingen sikkerhetsfunn ble rapportert innen fokusområdene. Til oppfølging:

- `npm audit --omit=dev` gir 4 high, alle fra én transitiv zod-advisory
  (GHSA-mrhx-c7xc-m3w5) via `@vercel/functions` → `@vercel/oidc`. Koden bruker
  bare `waitUntil`. Om den kan utnyttes er ikke vurdert (Dependabot eier bump).
- DB-003 og DB-007 har personvern-/kontoaspekter, og OBS-002 gjør at
  rate-limit-nøkler faller tilbake til en kjent tom nøkkel uten varsel.
- `docs/subsystems.md:38-40` sier at offentlig årskalender viser `createdBy`, og
  `created_by` kan falle tilbake til innloggings-e-post. Handleren fjerner det i
  dag; den som «gjenoppretter» det dokumenterte vil lekke e-post (DOC-001).

## 7. Sporbarhet

Se [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md). Hovedbrudd:
- **F-05 (årskalender-import) FAIL:** commit-import skriver `payload.description`
  (arkets ren tekst) for hver endret rad, selv om diffen anså beskrivelsen som
  uendret (`api/yearly-calendar.js:342` → `:372`).
- **F-10b (innleggsredigering) FAIL:** lastefeil vises som tom liste, Lagre kan
  dobbeltklikkes, utløpt sesjon kaster utkastet, og toggles skriver gammel kopi.
- **F-04 PARTIAL:** `PUT /api/events` skriver type/tid/potluck uten å se på
  `event_registrations`/`photo_event_slots`.
- Kontraktsjekk feilkoder: alle `code`-literaler i `api/` finnes i
  `API_ERROR_CODES`/`SIGNUP_ERROR_CODES`/`MEDIA_ERROR_CODES` med oversettelse
  (unntatt intern `EMAIL_DEADLINE` og `PASSWORD_CHANGE_REQUIRED`, som håndteres
  eget). Gapet er avvisninger *uten* kode (TRACE-001).

## 8. Ytelse/DB

Ingen målte problemer. Påmelding, avmelding og outbox er én-setnings- eller
`SKIP LOCKED`-baserte. Merk for DB-integritet: indeksene
`event_registrations_event_id_idx` og `event_registrations_email_idx` kommer
bare fra `tests/integration/baseline.sql`; ingen migrasjon oppretter dem, så om
de finnes i produksjon er ikke verifisert. Skjemasammenligningen i
integrasjonstesten sammenligner ikke FK-er (DB-010).

## 9. Arkitektur/vedlikeholdbarhet

- **MAINT-001** — `api/cron/event-reminders.js` (987 linjer) bærer egne kopier av
  `osloToday` (`formatOsloDate`), datoformatering og e-postmaler. Kopien har
  allerede driftet (tidssone, `no-NO/en-US` mot `nb-NO/en-GB`), så foreldre får
  ulik datoformat i bekreftelse og påminnelse. Foreslått: flytt til `api/_shared/`
  (teller ikke mot funksjonstaket), handleren blir ~150 linjer.
- **MAINT-002** — `registrations` er eneste ressurs uten `map*`-funksjon; formen
  bygges fire steder.
- **MAINT-003** — `settings.tsx` (808), `media-shares.tsx` (683),
  `yearly-calendar-import-modal.tsx` (653), `content.tsx` (617) — store
  enkeltkomponenter uten atferdstester. Bør deles opp når funksjonsarbeid berører
  dem, ikke som egen refaktor.

## 10. Tilgjengelighet (WCAG 2.2 AA)

Sterk grunnmur: skip-link, fokus til `<main>` ved navigasjon, `aria-current`,
`<html lang>` synkronisert, `AlertDialog` for alle destruktive handlinger,
fullskjermsdialoger på telefon med `returnFocus`, ingen horisontal scroll ved
375px på 8 offentlige ruter i begge tema. Funn: A11Y-001 (statisk + kjøretid),
A11Y-002 (påvirker bare hjelpemidler), A11Y-003 (kjøretid; skjermleser ikke
testet), A11Y-004 (kjøretid, DOM-måling). Kontrast er ikke målt numerisk;
hardkodede `yellow-*`/`red-*`-klasser i `event-registration-modal.tsx:468`,
`content.tsx:496` og `event-registrations-view.tsx:268` bryter tokenregelen, men
gir ikke bekreftet kontrastbrudd.

## 11. Testing/observerbarhet

| Kommando | Resultat |
|---|---|
| `npm run check` | PASS (backend-baseline 4, i18n 29/29) |
| `npm test` | PASS 601/601, ingen flak i 4 parallelle kjøringer |
| `TZ=America/New_York npm test` | **FAIL 2** (`newsletter-broadcast.test.mjs:369,382`) |
| `TZ=Pacific/Auckland npm test` | **FAIL 3** (`events-handler.test.mjs:32`, `yearly-calendar-display.test.mjs:71,93`) |
| `npm run build` | PASS (advarsel om chunk > 500 kB; lazy) |
| `npm audit --omit=dev` | 4 high, én rotårsak (se §6) |
| `npm run test:integration` | PASS 28/28 mot lokal PostgreSQL 16.15 (CI bruker 17) |

Testene beskytter backend godt: 41 av 42 handlinger har atferdstest gjennom
ekte middleware, og autorisasjonsmatrisen sjekker 44 ruter × 4 roller. Hullene
er klientsiden (TEST-004: bare 11 av 88 klientfiler kjøres i test, ingen
skjemainnsending), cron-handleren (TEST-003) og vakuøse kildevakter (TEST-002).
Observerbarhet: strukturerte JSON-logger, `X-Request-Id`, `audit_log`, Sentry med
`waitUntil`. Hull: OBS-001–004.

## 12. Dokumentasjon

Rik, presis og ærlig om avveininger. DOC-001 samler avvik: `BUDGET` er 29 (ikke
30), `i18n.ts` er 3 459 linjer (ikke 2,5k), `.d.ts`-listen i `AGENTS.md` stemmer
ikke (`calendar-feed` har ingen), «Three suites» holder kildevakter (det er 9),
og `docs/subsystems.md:38-40` om `createdBy`. `shared/schema.ts:165`-kommentaren
om at `confirm_token` tømmes stemmer heller ikke.

## 13. Positive funn (verifisert)

- Påmelding er én låsende CTE med `ON CONFLICT DO NOTHING` og unik
  (event, e-post)-indeks; integrasjonstester under ekte samtidighet passerer.
- Fotoslot har unik indeks som siste skranke + retry på nøyaktig den
  constrainten.
- Avmelding, rådsletting og PATCH arkiverer/sletter og frigjør plass i én
  setning; konsistent låserekkefølge (registrering → arrangement).
- Outbox: idempotent fan-out, `SKIP LOCKED`, lease-gjenoppretting, terminal
  `failed`; dokumentert som «minst én gang».
- Årskalender-import skriver alle godkjente rader i én setning, rederiverer
  status på serveren og nekter å gjette mellom like titler.
- Dokumentsletting: leverandør først, identitet re-verifisert, «ikke funnet» =
  suksess.
- Mediedeling: kvote under advisory lock i `sql.transaction`, magic-byte-sjekk,
  abort av multipart ved purge.
- Klienten viser aldri serverens `error`-tekst; alle koder har typet oversettelse.
- Cache-invalidering matcher leserne (predikatbasert der det trengs).
- Datoregelen (ISO-tekst vs `timestamptz`) følges og er testet.

## 14. Veikart

| Fase | Innhold | Avhengigheter |
|---|---|---|
| 1 Stopp tap | DB-001, UX-001, UX-006, DB-003 (sperr nedlasting av `editor-image` først) | — |
| 2 Funksjonell integritet | DB-002, DB-004, DB-005, DB-006, DB-008, UX-002, UX-005, UX-004, UX-003 | UX-003 før utvidet i18n-ratchet; DB-006 deler mønster med UX-006 |
| 3 Pålitelighet | TEST-001 + MAINT-001 (samme rotårsak), OBS-001, OBS-002, DB-007 (sjekk prod-data først), DB-010, DB-009 | MAINT-001 påvirker `backend-invariants`; gjør TEST-002 før refaktor |
| 4 Vedlikehold | MAINT-002, MAINT-003, TRACE-001, OBS-003, OBS-004 | TRACE-001 før UX-011 |
| 5 Tester, a11y, dok | TEST-002, TEST-003, TEST-004, A11Y-001–004, UX-007–012, DB-011–013, DOC-001 | TEST-002 bør tas tidlig fordi den sikrer refaktorene i fase 3 |

## 15. Ikke verifisert / blokkert

| Område | Årsak | Effekt på konfidens |
|---|---|---|
| Produksjonsskjema og -data (Neon) | Ikke tilgang, og skal ikke testes mot prod | DB-007, DB-009, DB-010 er POSSIBLE/UNVERIFIED for prod; manglende baseline-indekser ukjent |
| Neon HTTP-driverens transaksjonsatferd | Kjørt mot lokal PG 16, ikke Neon | Samtidighetsfunn er resonnert for Neon |
| Cloudinary/R2/Gmail/Turnstile i drift | Ingen legitimasjon | DB-003/DB-013 bygger på kode, ikke observert lagring |
| Skjermleser | Ikke tilgjengelig | A11Y-002/003 og live-kunngjøringer ikke bekreftet med AT |
| Årskalender-import, medieopplasting, meldinger, innstillinger i nettleser | Ikke kjørt (statisk gjennomgang) | Disse UX-sporene er UNVERIFIED |
| Sikkerhet i dybden | Utenfor bestilt fokus | Scorekortets sikkerhetsscore er foreløpig |
| Vercels kjøretids-TZ | Antatt UTC fra docs | TEST-001 er latent i prod så lenge TZ=UTC |

## 16. Konklusjon

- **Sikkerhet:** ingen funn innen fokus; ikke revidert i dybden.
- **Korrekthet:** primærflytene (påmelding, avmelding, utsending) holder ende til
  ende; årskalender-import og arrangementsredigering kan stille ødelegge data.
- **Ytelse:** ingen vesentlige skaleringsbekymringer for denne bruken.
- **Vedlikeholdbarhet:** høy; konsistente mønstre og dokumentasjon, med cron-modulen
  som unntak.
- **Testbarhet:** backend-regresjoner fanges godt; klient-regresjoner og
  tidssonefeil gjør det ikke.
- **Driftstrygghet:** god, med svakheter i diagnostisering av cron- og
  konfigurasjonsfeil.
- **Teknisk gjeld:** lokalisert.

**Samlet vurdering: Krever målrettet utbedring** (Requires targeted remediation).
