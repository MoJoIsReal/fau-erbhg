# Oppgaver fra repo-revisjonen

Én atomær, testbar oppgave per funn i [`REPO_REVIEW.md`](REPO_REVIEW.md).
Innsats: S < ½ dag · M ≤ 2 dager · L > 2 dager. Hver oppgave skal levere
endring + test i samme PR, og følge valideringsstigen i `CLAUDE.md`
(`npm run check`, berørt suite, `npm test`, `npm run build` ved klientendring).

---

## P1

## [x] DB-001 — Excel-reimport skal ikke flate ut rik tekst i beskrivelsen
**Priority:** P1 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Dataintegritet / årskalender
### Files
`api/yearly-calendar.js`, `shared/yearly-calendar-utils.js`, `tests/yearly-calendar-handler.test.mjs`
### Problem
Diffen sammenligner lagret HTML som ren tekst og ser beskrivelsen som uendret, men commit skriver alltid arkets rene tekst (`payload.description`) for rader med *andre* endringer. Lenker, fet skrift og bilder forsvinner stille; forhåndsvisningen viser bare det andre feltet. Et bilde-only-felt blir `NULL`. I tillegg kutter `sanitizeImportRowText` beskrivelsen til 1000 tegn mens UI tillater 5000.
### Evidence
`shared/yearly-calendar-utils.js:367` (sammenligner ren tekst) → `api/yearly-calendar.js:342` (`description: payload.description`) → `:372` (`description = u.description`); `:169` (1000-tegnskutt). Probe: farge-endring → lagret verdi mistet `<strong>` og `<a href>`.
### Required change
Behold eksisterende `description` med mindre forhåndsvisningens `changes` inneholder `description`. Når teksten faktisk er endret, pakk avsnitt i `<p>` før lagring. Samkjør lengdegrensen med UI (eller avvis i stedet for å kutte).
### Acceptance criteria
- [ ] Commit av en rad der bare farge er endret lar `description` (HTML) være byte-identisk.
- [ ] En rad med endret tekst lagres som avsnitt i `<p>`.
- [ ] En beskrivelse over grensen avvises med radnummer, ikke kuttes stille.
### Verification
`node --test --experimental-test-module-mocks tests/yearly-calendar-handler.test.mjs` med `fields()` på UPDATE-setningen.
### Dependencies
Ingen. · **Related:** DB-005

## [x] DB-002 — Avstem eller sperr arrangementsendringer når påmeldinger finnes
**Priority:** P1 · **Severity:** Medium · **Confidence:** High · **Effort:** M · **Area:** Dataintegritet / arrangementer
### Files
`api/events.js`, `client/src/components/event-creation-modal.tsx`, `client/src/lib/i18n.ts`, `tests/events-handler.test.mjs`
### Problem
`PUT /api/events` skriver `type`, `time`, `date`, `potluck`, `no_signup`, `vigilo_signup`, `max_attendees` uten å se på eksisterende påmeldinger. Konsekvenser: fotoarrangement flyttet til 11:00 beholder barn booket 10:00 (i `photo_slots`, eksport og påminnelse); event→foto gjør vanlige påmeldinger til «legacy fotobooking» som deretter ikke kan redigeres; potluck på gjør at PATCH krever matsvar på gamle rader; datoendring nullstiller ikke `reminder_sent_at`/`newsletter_sent_at`.
### Evidence
`api/events.js:372-393` (UPDATE uten sjekk); `shared/photo-slots.js:58-101`; `api/registrations.js:108,117,126,682-686`; `api/cron/event-reminders.js:259-262,741-744`.
### Required change
Når påmeldinger finnes: avvis med 409 og ny kode (f.eks. `HAS_REGISTRATIONS`) endring av `type` (foto↔annet) og tid på fotoarrangement, med mindre klienten sender eksplisitt `force` etter advarsel. Ved datoendring: nullstill påminnelses- og nyhetsbrevstempler. Vis advarsel i modalen.
### Acceptance criteria
- [ ] PUT som endrer type eller fototid på arrangement med påmeldinger gir 409 med kode, og ingen UPDATE kjøres.
- [ ] Datoendring nullstiller `reminder_sent_at` for arrangementets påmeldinger.
- [ ] Modalen viser oversatt advarsel (no/en).
### Verification
Nye tilfeller i `tests/events-handler.test.mjs`; `npm run check`.
### Dependencies
TRACE-001 (ny kode i `API_ERROR_CODES`). · **Related:** DB-009

## [x] DB-003 — Rydd opp bilder fra redigeringsverktøyet og sperr nedlasting av dem
**Priority:** P1 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Dataintegritet / personvern
### Files
`api/documents.js`, `api/secure-settings.js`, `api/upload.js`, `api/cron/event-reminders.js` (eller ny `api/_shared/`-modul), tester
### Problem
Hvert bilde i rik tekst blir en `documents`-rad + offentlig Cloudinary-fil (`category: 'editor-image'`). Ingen sti sletter dem når bildet fjernes, innlegget slettes eller arrangementet slettes; listen skjuler dem så UI ikke kan slette dem; `?action=download&id=N` serverer dem på sekvensielle id-er. Avvist registrering etter direkte Cloudinary-opplasting etterlater filen uten rad.
### Evidence
`client/src/components/RichTextEditor.tsx:255`; `api/documents.js:66` (filtrerer bort), `:15-37` (download filtrerer ikke), `:116` (eneste `destroy`); `api/secure-settings.js:446-460`.
### Required change
1) `download` avviser `editor-image`. 2) Ved oppdatering/sletting av innhold: slett `editor-image`-rader som ikke lenger refereres av noe innlegg/arrangement/kalenderoppføring (leverandør først, som dokumentsletting). Alternativt en nattlig sveip i cron. 3) `upload.js`: `destroy` når registreringen avvises.
### Acceptance criteria
- [ ] Nedlasting av en `editor-image`-id gir 404.
- [ ] Sletting av et innlegg med bilde kaller `destroy` (mocket) og fjerner raden.
- [ ] Et bilde som fortsatt brukes et annet sted slettes ikke.
### Verification
`document-deletion`, `secure-settings-handler`, `upload-handler`-suitene.
### Dependencies
Ingen. Kjør en lesespørring i prod for å se omfanget før opprydding.

## [x] UX-001 — Utløpt sesjon skal ikke kaste utkast
**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed · **Effort:** M · **Area:** UX / auth
### Files
`client/src/App.tsx`, `client/src/lib/queryClient.ts`, `client/src/hooks/useAuth.ts`, `client/src/components/login-modal.tsx`, `client/src/lib/i18n.ts`
### Problem
Enhver 401 (eller refetch av `/api/auth` som gir `null`) setter auth til `null`; `RequireAuth` kaller `setLocation("/")` og siden avmonteres. Utkast i innhold, meldingssvar og innstillinger går tapt.
### Evidence
`client/src/App.tsx:101-105`; `client/src/lib/queryClient.ts:66-77`. Kjøretid (mocket 401 ved lagring på `/content`): havnet på `/`, editor borte.
### Required change
Når en allerede innlogget bruker mister sesjonen på en beskyttet side: behold siden montert, åpne innloggingsmodal med «sesjonen er utløpt», og la brukeren lagre på nytt etter innlogging. Omdiriger bare ved eksplisitt utlogging eller manglende rolle.
### Acceptance criteria
- [ ] 401 ved lagring på `/content` → editoren er fortsatt montert med innholdet, innloggingsmodal åpen.
- [ ] Etter vellykket innlogging kan lagring gjentas uten å skrive på nytt.
- [ ] Eksplisitt utlogging sender fortsatt til `/` og viser ingen beskyttet data.
### Verification
Playwright med `page.route` (401), eller SSR-/bundle-test via `importBundle()`.
### Dependencies
Ingen. · **Related:** UX-008

---

## P2

## [x] DB-004 — Steng påmelding etter arrangementsdato
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Dataintegritet / påmelding
### Files
`api/registrations.js`, `shared/calendar-entries.js`, tester
### Problem
Uten frist er påmelding åpen også etter arrangementsdagen (server og klient). Avmeldingslenken krever `date >= osloToday()`, så en slik påmelding kan bare fjernes av styret.
### Evidence
`api/registrations.js:85-95` (`validateSignupForEvent` sjekker bare frist), `:516-528` (CTE); `shared/calendar-entries.js:165-180`; `api/_shared/registration-cancel.js:32-35`.
### Required change
Legg til `date >= osloToday` i CTE og `validateSignupForEvent` (kode `SIGNUP_CLOSED` eller ny `EVENT_PAST`); legg til `!isPast` i `signup.isOpen`.
### Acceptance criteria
- [ ] Påmelding til arrangement med passert dato og uten frist avvises med kode.
- [ ] Påmelding samme dag (Europe/Oslo) godtas.
- [ ] Knappen «Meld på» vises ikke for passerte arrangementer.
### Verification
`tests/registrations-handler.test.mjs`, `tests/calendar-entries.test.mjs`.
### Dependencies
Ingen.

## [x] DB-005 — Valider kalenderplassering på serveren
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Dataintegritet / årskalender
### Files
`api/yearly-calendar.js`, `shared/yearly-calendar-utils.js`, `shared/yearly-calendar-placement.js`
### Problem
Import og POST/PUT godtar uke 53 i år med 52 uker, uke utenfor radens måned/skoleår, ugyldige datoer (`2027-02-31`) og `schoolYear` som ikke stemmer med `date`. Slike rader vises aldri eller havner i feil skoleår. Månedsnotater uten uke kan lages i UI men ikke reimporteres.
### Evidence
`shared/yearly-calendar-utils.js:273-287`; `api/yearly-calendar.js:87-151,107`; eneste kaller av `resolveYearlyCalendarPlacement` er `client/src/components/yearly-calendar-entry-modal.tsx:151`.
### Required change
Kall `resolveYearlyCalendarPlacement` i `sanitizeEntryPayload` og i importvalideringen; avvis `null` og lagre avledet skoleår/år/måned. Tillat månedsnotat uten uke i import.
### Acceptance criteria
- [ ] Uke 53 i 2027 og måned 9 med uke 2 avvises ved import med radnummer.
- [ ] POST med `date` og avvikende `schoolYear` gir 400.
- [ ] Et månedsnotat uten uke kan eksporteres og reimporteres uendret.
### Verification
`yearly-calendar-import`, `yearly-calendar-placement`, `yearly-calendar-handler`. Kjør først en lesespørring i prod etter eksisterende rader som bryter reglene.
### Dependencies
Ingen. · **Related:** DB-001

## [x] DB-006 — Hindre tapte oppdateringer ved hele-rad-PUT
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** M · **Area:** Dataintegritet / innhold
### Files
`client/src/pages/content.tsx`, `api/secure-settings.js`, `api/yearly-calendar.js`
### Problem
PUT for blogginnlegg (og årskalender, styremedlemmer, barnehageinfo) skriver alle kolonner uten versjonssjekk. Arkiver/«vis på forsiden» sender hele innlegget fra en opptil 5 min gammel liste, og overskriver en annens nylige redigering.
### Evidence
`client/src/pages/content.tsx:193-247`; `api/secure-settings.js:399-431`; `api/yearly-calendar.js:447-486`.
### Required change
Gjør toggles til delvise oppdateringer (bare feltet som endres). For full redigering: send `updatedAt` og svar 409 (`CONFLICT`) ved avvik.
### Acceptance criteria
- [ ] «Vis på forsiden» endrer bare `show_on_homepage`.
- [ ] PUT med utdatert `updatedAt` gir 409 og ingen UPDATE.
- [ ] Klienten viser oversatt konfliktmelding og laster på nytt.
### Verification
`secure-settings-handler`, `yearly-calendar-handler`.
### Dependencies
TRACE-001 (koden `CONFLICT`). · **Related:** UX-006

## [x] DB-007 — Gjør brukernavn unikt uavhengig av store/små bokstaver
**Priority:** P2 · **Severity:** Medium · **Confidence:** Possible · **Effort:** S · **Area:** Dataintegritet / brukere
### Files
`migrations/0025_*.sql` (ny), `shared/schema.ts`, `api/secure-settings.js`
### Problem
`UNIQUE(username)` er case-sensitiv, mens innlogging bruker `lower(username)` uten `LIMIT`/`ORDER` og glemt-passord tar `LIMIT 1`. To varianter kan opprettes; innlogging plukker vilkårlig rad.
### Evidence
`shared/schema.ts:8`; `api/secure-settings.js:726-740`; `api/auth.js:206-215,470-475`.
### Required change
Sjekk først prod: `SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1`. Deretter ny migrasjon med `UNIQUE INDEX ON users (lower(username))`, speil i `schema.ts`, og `lower()` i opprettelsesoppslaget.
### Acceptance criteria
- [ ] Integrasjonstest: to case-varianter gir unik-brudd.
- [ ] Oppretting av `ola@x.no` når `Ola@x.no` finnes gir 409.
### Verification
`npm run test:integration`, `secure-settings-handler`.
### Dependencies
Ingen.

## [x] DB-008 — En lagret påmelding skal aldri besvares med 500
**Priority:** P2 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Dataintegritet / påmelding
### Files
`api/registrations.js`, `tests/registrations-handler.test.mjs`
### Problem
`reservePublicMail` kjøres etter at påmeldingen er committet, utenfor try/catch. Feiler den, svarer handleren 500; ny innsending gir `ALREADY_REGISTERED`, og avmeldingslenken er tapt.
### Evidence
`api/registrations.js:622`.
### Required change
Pakk reservasjonen i try/catch; ved feil behandle som «ikke sendt» (svaret bærer `cancelUrl`) og rapporter via `reportProviderError`.
### Acceptance criteria
- [ ] Når budsjettsetningen kaster, svarer handleren 201 med `cancelUrl`.
### Verification
`tests/registrations-handler.test.mjs` med `scriptedSql` som kaster på budsjettsetningen.
### Dependencies
Ingen.

## [x] UX-002 — Vis feil i kalenderens listevisning når én kilde feiler
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** UX / kalender
### Files
`client/src/components/calendar-views.tsx`, `client/src/hooks/useCalendarEntries.ts`
### Problem
`hasDataError` brukes bare i månedsvisningen. Når `/api/events` feiler, viser listevisningen «Ingenting igjen med disse filtrene».
### Evidence
`client/src/hooks/useCalendarEntries.ts:64-68`; `calendar-views.tsx:313-337`. Kjøretid: events 500 → «ingen treff», ingen varsel.
### Required change
Vis `QueryNotice` med «prøv igjen» over begge visninger når `hasDataError`; undertrykk «ingen treff»-teksten da.
### Acceptance criteria
- [ ] Events 500 + yearly 200 → varsel med «prøv igjen» i listevisningen.
### Verification
Playwright med `page.route`, eller SSR-test.
### Dependencies
Ingen. · **Related:** A11Y-001

## [x] UX-003 — Oversett påmeldingsdialogen og gjør i18n-ratchet seende
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** UX / i18n
### Files
`client/src/components/event-registration-modal.tsx`, `event-registrations-modal.tsx`, `attendee-tooltip.tsx`, `location-map-link.tsx`, `ErrorBoundary.tsx`, `client/src/lib/i18n.ts`, `scripts/check-i18n.mjs`
### Problem
Engelsk modus viser «Antall deltakere», «Velg antall», «personer», «Avbryt», «Meld deg på» og norske zod-meldinger. Ratchet teller bare `language === 'no' ?`-grener.
### Evidence
`event-registration-modal.tsx:29,99,332,338,346,488,496`.
### Required change
Flytt strengene til `t.*`; bygg zod-skjemaet per språk som `event-creation-modal.tsx:33`. Utvid `check-i18n.mjs` til å flagge streng-literaler med `[æøå]` i JSX utenfor `i18n.ts` (med tillatelsesliste), med eget budsjett som bare kan synke.
### Acceptance criteria
- [ ] Engelsk dialog har ingen norske strenger.
- [ ] `npm run check` feiler på en ny hardkodet norsk JSX-streng.
### Verification
`npm run check`; kjøretid i engelsk modus.
### Dependencies
Ingen. · **Related:** UX-010

## [x] UX-004 — Valider offentlige skjema i klienten og vis feltfeil
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** UX / skjema
### Files
`client/src/lib/form-schemas.ts`, `event-registration-modal.tsx`, `client/src/pages/contact.tsx`, `tests/form-schemas.test.mjs`
### Problem
Påkrevde felt er `z.string()` uten `min(1)`/`email()`, så tomme skjema sendes; feil vises bare som toast; Turnstile nullstilles; kontaktskjemaets IP-grense (3 per 10 min) brukes opp før feltsjekk (`api/contact.js:69-79`), så hele barnehagens nett kan bli sperret.
### Evidence
`client/src/lib/form-schemas.ts:32-48`; `event-registration-modal.tsx:28-33`; `contact.tsx:95-98,173-185`.
### Required change
Per-språk-skjema med `.trim().min(1)` og `.email()` (betinget av anonym); kartlegg serverkoder til `form.setError` på feltet. Vurder å sjekke påkrevde felt før IP-grensen i `contact.js`.
### Acceptance criteria
- [ ] Tom innsending sender ingen forespørsel og viser feltfeil (WCAG 3.3.1).
- [ ] `form-schemas`-paritet fortsatt grønn.
### Verification
`tests/form-schemas.test.mjs`; bundle-test eller Playwright.
### Dependencies
UX-003 (per-språk-skjema).

## [x] UX-005 — Vis lastefeil i innholdsredigeringen
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** UX / innhold
### Files
`client/src/pages/content.tsx`
### Problem
Bare `isLoading` leses; ved 500 vises «Ingen innlegg ennå», og medlemmer kan gjenskape innlegg (duplikater, ev. nyhetsbrev).
### Evidence
`content.tsx:79-87,277-283,581-588`.
### Required change
`if (isError && !data) return <QueryNotice …/>` som de andre rådssidene.
### Acceptance criteria
- [ ] 500 på blogginnlegg viser feil med «prøv igjen», ikke tom-tilstand.
### Verification
SSR-test som for `messages`/`admin`.
### Dependencies
Ingen.

## [x] UX-006 — Sperr Lagre mens innlegg lagres
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** S · **Area:** UX / innhold
### Files
`client/src/pages/content.tsx`
### Problem
Lagre-knappen leser ikke `isPending`; `editingKey` er `"new"` til opprettelse og invalidering er ferdig, så dobbeltklikk gir to POST og (med nyhetsbrev) to utsendinger.
### Evidence
`content.tsx:153-185`, knapp `:426-429` uten `disabled`.
### Required change
Deaktiver Lagre og radhandlinger mens create/update-mutasjon pågår.
### Acceptance criteria
- [ ] To raske klikk gir én POST.
### Verification
Bundle-test eller Playwright.
### Dependencies
Ingen. · **Related:** DB-006

## [x] UX-007 — Scroll til toppen ved sidebytte
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** UX / navigasjon
### Files
`client/src/components/layout.tsx`
### Problem
Fokus flyttes til `<main>` med `preventScroll: true`, og ingen `scrollTo` finnes. Fra bunnen av forsiden åpnes `/contact` på y=2322 av 3134 på telefon.
### Evidence
`layout.tsx:71-82`.
### Required change
`window.scrollTo(0, 0)` ved endring av `pathname` (ikke ved rene query-endringer som `?vis=`/`?view=`); bevar tilbake-knappens posisjon om mulig.
### Acceptance criteria
- [ ] Navigasjon via bunnteksten åpner ny side på toppen.
- [ ] `?view=month` ↔ list beholder posisjon.
### Verification
Playwright ved 375px.
### Dependencies
Ingen.

## [x] TEST-001 — Formater e-postdatoer i Europe/Oslo og pin testsuitens tidssone
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Tester / datoer
### Files
`api/cron/event-reminders.js`, `package.json`, `.github/workflows/ci.yml`, berørte tester
### Problem
`registrationReminderEmail` og `formatLongDate` bruker `toLocaleDateString` uten `timeZone`; under New York-tid sier påminnelsen for 10.9. «9. september». Suiten feiler med `TZ=America/New_York` (2) og `TZ=Pacific/Auckland` (3).
### Evidence
`api/cron/event-reminders.js:133-141,199-208`; `api/_shared/registration-emails.js:17-23` har allerede rettelsen.
### Required change
Bruk én Oslo-forankret formatter (samme som `registration-emails.js`). Legg til et CI-ben med `TZ=America/New_York` (å bare pinne `TZ=UTC` skjuler feilen). Rett test-fixtures på grensedager.
### Acceptance criteria
- [ ] `TZ=America/New_York npm test` og `TZ=Pacific/Auckland npm test` er grønne.
- [ ] Bekreftelse og påminnelse bruker samme datoformat.
### Verification
Kjør suiten under tre TZ-verdier.
### Dependencies
Gjøres sammen med eller før MAINT-001.

## [x] TEST-002 — Gjør kildebaserte testvakter selvsjekkende
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Tester
### Files
`tests/helpers.mjs`, `tests/registration-cancel.test.mjs`, `tests/client-invariants.test.mjs`, `tests/registration-integrity.test.mjs`
### Problem
`source.slice(indexOf(a), indexOf(b))` gir tom streng eller siste tegn når en markør er omdøpt, så `doesNotMatch` passerer. Personvernvakten «rådslisten velger aldri `cancel_token`» blir stille en no-op. `client-invariants.test.mjs:83-93` pinner klassenavn, som `AGENTS.md` forbyr.
### Evidence
`tests/registration-cancel.test.mjs:159-166,181-185`; 26 `indexOf(` i tests/, én grensesjekk.
### Required change
`sliceBetween(source, a, b)` i `helpers.mjs` som asserter begge indekser ≥ 0; bruk den overalt. Erstatt `cancel_token`-vakten med en harness-test på rådslistens svar. Fjern klassenavn-pinnene.
### Acceptance criteria
- [ ] Omdøping av en markør får testen til å feile.
- [ ] Rådslisten testes på atferd (svaret mangler `cancelToken`).
### Verification
Simuler omdøping lokalt; `npm test`.
### Dependencies
Bør gjøres før MAINT-001/MAINT-002.

## [x] OBS-001 — Bevar stack og send hver feil fra cron-steg til Sentry
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Observerbarhet
### Files
`api/cron/event-reminders.js`, `api/_shared/sentry.js`, `tests/observability.test.mjs`
### Problem
`stage` logger bare `{stage, message}`; kjøringen kaster `AggregateError('Morning stage(s) failed: …')` og `toSentryEvent` leser ikke `.errors`. Ingen cron-linje har `requestId`.
### Evidence
`event-reminders.js:826-833,856`; `sentry.js:42-71`.
### Required change
Logg redigert stack i `stage`; legg til én exception per `error.errors` i `toSentryEvent`; send `requestId` til cron-loggene.
### Acceptance criteria
- [ ] En kastende stegfunksjon gir Sentry-event med stegets egen stack.
### Verification
`tests/observability.test.mjs`.
### Dependencies
Ingen.

## [x] OBS-002 — Feilkonfigurert SESSION_SECRET skal varsle
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** S · **Area:** Observerbarhet / konfig
### Files
`api/auth.js`, `api/_shared/rate-limit.js`, `tests/auth-handler.test.mjs`
### Problem
Fire steder i `auth.js` fanger `getJwtConfig()`-feil og svarer 500 uten Sentry; rate-limit-HMAC faller stille tilbake til tom nøkkel. Kommentaren i `rate-limit.js:42` sier login «refuses loudly», men det gjør den ikke.
### Evidence
`api/auth.js:149-154,328-333,444-449,512-517`; `api/_shared/rate-limit.js:39-43`.
### Required change
La feilen kaste til `withApiHandler` (eller kall `reportProviderError`); rapporter én gang når rate-limit-nøkkelen faller tilbake.
### Acceptance criteria
- [ ] Login uten `SESSION_SECRET` gir 500 *og* et Sentry-kall (mocket).
### Verification
Ny test i `auth-handler`.
### Dependencies
Ingen.

## [x] MAINT-001 — Flytt delte hjelpere ut av cron-modulen
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Vedlikehold
### Files
`api/cron/event-reminders.js`, `api/_shared/registration-emails.js`, `api/_shared/newsletter.js`, nye `api/_shared/{dates,newsletter-outbox,retention}.js`, `tests/backend-invariants.test.mjs`
### Problem
987 linjer med kopier av `osloToday` (`formatOsloDate`), datoformattering og maler; kopiene har driftet (TEST-001, `no-NO/en-US` mot `nb-NO/en-GB`). `broadcastNewsletter` er én funksjon på ~320 linjer.
### Evidence
`event-reminders.js:94,113,133,199,212,246-565,565-711`.
### Required change
Én dato-hjelper; påminnelsesmal til `registration-emails.js`; nyhetsbrevmal til `newsletter.js`; utsending og retention til egne `_shared`-moduler. Handleren beholder ruting og logging.
### Acceptance criteria
- [ ] Ingen duplikat av `osloToday` i `api/`.
- [ ] Alle cron-, nyhetsbrev- og integrasjonstester grønne uendret i atferd.
### Verification
`npm test`; `npm run test:integration`.
### Dependencies
TEST-001, TEST-002 først.

---

## P3

## [x] DB-009 — NOT NULL og CHECK på setekolonner
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** DB
### Files
ny migrasjon, `shared/schema.ts`
### Problem
`attendee_count` er nullbar; `SUM` teller NULL som 0, skrivestier og klient som 1. Ingen CHECK på `attendee_count`, `current_attendees`, `max_attendees`.
### Evidence
`shared/schema.ts:52`; `api/events.js:109`; `api/cron/event-reminders.js:593-598`; `api/registrations.js:256,707,767`.
### Required change
Forhåndssjekk som 0009, backfill NULL→1, `SET NOT NULL`, `CHECK (attendee_count BETWEEN 1 AND 100)`, `CHECK (current_attendees >= 0)`, `CHECK (max_attendees >= 0)`. Også `event_registration_cancellations.attendee_count`.
### Acceptance criteria
- [ ] Integrasjonstest: NULL/negativ verdi avvises.
### Verification
`npm run test:integration`.
### Dependencies
Lesespørring i prod først.

## [x] DB-010 — Én FK per relasjon og robust FK-gjenkjenning
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed (CI-DB) · **Effort:** S · **Area:** DB
### Files
`api/events.js`, ny migrasjon, `tests/integration/database.test.mjs`
### Problem
Migrert database har både `event_registrations_event_id_events_id_fk` og `…_fkey`; `isRegistrationForeignKeyConflict` matcher ett navn, så et slette-kappløp gir 500 i stedet for 400. Skjemasammenligningen ignorerer FK-er.
### Evidence
`api/events.js:298-301`; `migrations/0009_registration_integrity.sql`; `tests/integration/database.test.mjs:627`.
### Required change
Match på `code === '23503' && table === 'event_registrations'`; migrasjon som fjerner duplikat-FK; sammenlign `contype = 'f'` med `confdeltype`.
### Acceptance criteria
- [ ] Integrasjonstest asserter én FK; events-handler-test med begge navn gir 400.
### Verification
`events-handler`, `npm run test:integration`.
### Dependencies
Sjekk prod-FK-er først.

## [x] DB-011 — Krev eierskap før svar på kontaktmelding
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** DB
### Files
`api/secure-settings.js`
### Problem
Les → send e-post → ubetinget UPDATE; to styremedlemmer kan svare samme forelder, siste svar lagres.
### Evidence
`api/secure-settings.js:578-639`.
### Required change
Kreve meldingen med `UPDATE … WHERE status <> 'responded' RETURNING` før sending; 409 ellers.
### Acceptance criteria
- [ ] Svar på allerede besvart melding gir 409 og ingen e-post.
### Verification
`secure-settings-handler`.
### Dependencies
TRACE-001.

## [x] DB-012 — Riktige samtykketidspunkter ved re-abonnement
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** DB / nyhetsbrev
### Files
`api/contact.js`, `shared/schema.ts` (kommentar)
### Problem
Re-abonnement beholder første `confirmed_at` og overskriver `created_at`; listen viser bekreftelse før opprettelse. Kommentaren i `schema.ts:165` om at `confirm_token` tømmes er feil.
### Required change
Nullstill `confirmed_at` ved re-arming, sett den ved pending→active; rett kommentaren.
### Acceptance criteria
- [ ] Unsubscribed → pending → active gir ny `confirmed_at`.
### Verification
`contact-handler`.
### Dependencies
Ingen.

## [x] DB-013 — Unngå R2-objekter uten rad ved tilbakekall under opplasting
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** M · **Area:** DB / mediedeling
### Files
`api/_shared/media-share.js`, `api/media.js`
### Problem
`purgeShare` velger filer → sletter objekter → sletter deling; en PUT (presign gyldig 30 min) som fullføres etterpå etterlater objekt uten rad til livssyklusregelen (368 dager).
### Evidence
`api/_shared/media-share.js:237-249`; `api/media.js:574-581`; `api/_shared/r2.js:27`.
### Required change
Merk delingen som «revoking» først slik at `upload-init/complete` avviser, eller sveip foreldreløse prefikser. Les `docs/mediedeling.md` først.
### Acceptance criteria
- [ ] `upload-init` på en deling under tilbakekall avvises med `MEDIA_ERROR_CODES`-kode.
### Verification
`media-handler`, `media-share`.
### Dependencies
Ingen.

## [x] UX-008 — Beskyttet dyplenke skal be om innlogging og komme tilbake
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** UX
### Files
`client/src/App.tsx`, `login-modal.tsx`
### Problem
`/admin` uten innlogging → `/` uten melding.
### Required change
Omdiriger til `/?login=1&next=…` (valider samme opprinnelse, kun relative stier) og returner etter innlogging.
### Acceptance criteria
- [ ] `/admin` utlogget åpner innlogging; etter innlogging vises `/admin`.
- [ ] `next=https://evil` ignoreres.
### Verification
Playwright.
### Dependencies
UX-001.

## [x] UX-009 — Oppdater arrangementsdata når påmelding avvises
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** UX
### Files
`client/src/components/event-registration-modal.tsx`
### Problem
Ved `EVENT_FULL`/`DEADLINE_PASSED`/`EVENT_INACTIVE`/`PHOTO_SLOTS_FULL` invalideres ingenting; dialogen viser fortsatt ledige plasser.
### Evidence
`event-registration-modal.tsx:130-175,467-476`.
### Required change
Invalider arrangement/påmeldinger på disse kodene og vis lukket/full-tilstand.
### Acceptance criteria
- [ ] Etter `EVENT_FULL` viser dialog og liste «Fullt».
### Verification
Bundle-test.
### Dependencies
Ingen.

## [x] UX-010 — Rett ErrorBoundary
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** UX
### Files
`client/src/components/ErrorBoundary.tsx`
### Problem
«Last inn på nytt» går til `/`; feiltilstanden nullstilles aldri ved tilbake-navigasjon; kun norsk.
### Evidence
`ErrorBoundary.tsx:42-44,53-83`.
### Required change
`location.reload()`; nullstill ved `popstate`; oversatt tekst (boundary ligger over språk-konteksten, så bruk `navigator.language`/lagret språk).
### Acceptance criteria
- [ ] Knappen laster gjeldende side; tilbake-knappen fjerner feilskjermen.
### Verification
Bundle-test.
### Dependencies
UX-003.

## [x] UX-011 — Skill forbigående feil fra ugyldig lenke på e-postsider
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** UX
### Files
`client/src/pages/newsletter.tsx`, `client/src/pages/registration-cancel.tsx`
### Problem
Enhver bekreftelsesfeil (429/nettverk) vises som «ugyldig eller brukt lenke»; ingen «prøv igjen»; avmeldingsoppslag sier «Kunne ikke melde av» før noen handling.
### Evidence
`newsletter.tsx:57-66`; `registration-cancel.tsx:172-174,204-205`.
### Required change
Kartlegg 404/410 → ugyldig lenke, alt annet → forbigående med «prøv igjen» (som `share-page.tsx`). Behold klikk-for-å-handle.
### Acceptance criteria
- [ ] 429 viser «for mange forsøk» med «prøv igjen».
### Verification
Bundle-test.
### Dependencies
TRACE-001.

## [x] UX-012 — Vis lengdegrenser i fritekstfelt
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** UX
### Files
`event-registration-modal.tsx`, `contact.tsx`, `shared/constants.js`
### Problem
Serveren kutter stille (kommentar 1000, navn 100, melding 5000), f.eks. allergiinformasjon.
### Evidence
`api/registrations.js:64`; `api/contact.js:86`; `api/_shared/middleware.js:550-551`.
### Required change
Grenser i `shared/constants.js`; `maxLength` + teller i klienten.
### Acceptance criteria
- [ ] Feltene stopper ved serverens grense og viser gjenstående tegn.
### Verification
`npm run check`; bundle-test.
### Dependencies
Ingen.

## [x] TRACE-001 — Koder på avvisninger brukeren kan møte
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Kontrakt
### Files
`shared/constants.js`, `client/src/lib/i18n.ts`, `api/registrations.js`, `api/contact.js`, `api/events.js`, `client/src/pages/content.tsx`
### Problem
90 av 178 4xx mangler `code`. Brukernære: `registrations.js:185` (429), `:229`/`:266` (404 «kan ikke lenger endres»), `:375`/`:666` (413), `contact.js:349` (utløpt lenke), `events.js:463,478` (`hasRegistrations` ad hoc), `:486` (409). `content.tsx:179-229` bruker aldri `apiErrorText`.
### Required change
Legg til `RATE_LIMITED`, `LINK_EXPIRED`, `HAS_REGISTRATIONS`, `CONFLICT` i `API_ERROR_CODES` og `t.apiErrors` (no/en); sett dem på de brukernære stedene; bruk `apiErrorText` i `content.tsx`.
### Acceptance criteria
- [ ] Hver nevnt avvisning har kode og oversettelse.
- [ ] Rate-begrenset forelder på avmeldingssiden ser «for mange forsøk».
### Verification
Handler-suitene; `npm run check`.
### Dependencies
Ingen (blokkerer DB-002, DB-006, DB-011, UX-011).

## [x] A11Y-001 — Kalenderens totalfeil: behold hero og legg til «prøv igjen»
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Tilgjengelighet
### Files
`client/src/components/calendar-views.tsx`
### Problem
`EmptyState` uten handling erstatter hele siden inkl. `PageHero`; ingen h1 (WCAG 1.3.1/2.4.6).
### Evidence
`calendar-views.tsx:220-227`.
### Required change
Behold hero; legg til retry-handling.
### Acceptance criteria
- [ ] Ved begge kilder 500 finnes h1 og en «prøv igjen»-knapp.
### Verification
SSR-test.
### Dependencies
UX-002.

## [x] A11Y-002 — Unike navn på slett-knapper per påmelding
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Tilgjengelighet
### Files
`client/src/components/event-registrations-view.tsx`, `i18n.ts`
### Problem
Slett-knappene har likt tilgjengelig navn; rediger-knappen inkluderer navnet (`registration-edit-dialog.tsx:103`).
### Evidence
`event-registrations-view.tsx:264-272`.
### Required change
Legg `registration.name` i `aria-label`.
### Acceptance criteria
- [ ] Hver slett-knapp har unikt navn.
### Verification
`editor-accessibility`- eller SSR-test.
### Dependencies
Ingen.

## [x] A11Y-003 — Behold fokus etter mislykket innsending
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Tilgjengelighet
### Files
`event-registration-modal.tsx` (og skjema med samme mønster)
### Problem
Knappen deaktiveres under innsending; etter feil står fokus på `<body>` (WCAG 2.4.3/3.3.1).
### Evidence
`event-registration-modal.tsx:490-497,170-174`.
### Required change
Fokuser første ugyldige felt eller en inline feilmelding; eller `aria-disabled` + vakt i stedet for `disabled`.
### Acceptance criteria
- [ ] Etter avvist innsending ligger fokus i dialogen på feilen.
### Verification
Playwright (`document.activeElement`).
### Dependencies
UX-004.

## [x] A11Y-004 — 44px berøringsmål for frittstående tekstlenker
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Tilgjengelighet
### Files
`client/src/pages/home.tsx`, `client/src/pages/contact.tsx`
### Problem
«Se hele kalenderen» (149×22), «Se hele FAU-styret» (246×22), mailto-lenker (22px) bryter stilguidens 44px-regel.
### Required change
`min-h-11 inline-flex items-center` som i `login-modal.tsx:189`.
### Acceptance criteria
- [ ] Lenkene måler ≥ 44px høyde ved 375px.
### Verification
Playwright DOM-måling.
### Dependencies
Ingen.

## [x] TEST-003 — Autorisasjonsmatrise per rute og cron i harness
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Tester
### Files
`tests/api-authorization.test.mjs`, ny `tests/event-reminders-handler.test.mjs` (eller i `event-reminders`), `tests/media-handler.test.mjs`, `api/cron/event-reminders.js`
### Problem
Fullstendighetssjekken krever bare at hver fil med `requireRole` finnes i `ROUTES`; ny handling i eksisterende fil passerer uten rad. Cron-handleren kjøres aldri gjennom `importHandler`; ugyldig `req.query.date` gir `RangeError` → 500. `upload-abort` har ingen atferdstest.
### Evidence
`tests/api-authorization.test.mjs:112-119`; `event-reminders.js:928-986`.
### Required change
Utled (metode, action/resource)-par fra handlerne og feil på manglende rad; harness-test for cron (`?task=newsletter`, ugyldig dato → 400); test for `upload-abort`.
### Acceptance criteria
- [ ] Ny `action` uten matriserad får suiten til å feile.
- [ ] `?date=foo` gir 400.
### Verification
`npm test`.
### Dependencies
Ingen.

## [ ] TEST-004 — Atferdstester for klientens skjemaflyter

> **Status (delvis):** skjemaenes valideringsregler er flyttet til `client/src/lib/form-schemas.ts` og testet i `tests/form-schemas.test.mjs`. De interaktive flytene er verifisert manuelt i Chromium; å kjøre dem i CI krever en nettlesertestløper, som ikke er lagt til uten avklaring.
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** L · **Area:** Tester
### Files
`tests/` (ny suite per flyt), `tests/helpers.mjs`
### Problem
Bare 11 av 88 klientfiler kjøres i test; ingen skjemainnsending (påmelding, kontakt, innlegg, import, medieopplasting) er testet.
### Required change
Start med påmelding, kontakt og innholdsredigering via `importBundle()` eller en liten Playwright-suite mot `vite preview` med `page.route`. Ikke legg til nytt testrammeverk uten avklaring.
### Acceptance criteria
- [ ] Minst påmelding, kontakt og innleggslagring har én suksess- og én feiltest.
### Verification
`npm test`.
### Dependencies
UX-001, UX-004, UX-006 gir naturlige første tester.

## [x] OBS-003 — Telefon-redaksjon skal ikke spise datoer
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Observerbarhet
### Files
`api/_shared/redact.js`, `api/_shared/log.js`, `api/cron/event-reminders.js`
### Problem
`/(?:\+?\d[\d\s().-]{6,}\d)/g` gjør `2026-11-02T07:00:00.000Z` til `[redacted-phone]T07…`; omgått to steder.
### Required change
Match reelle telefonformer (valgfri +47 og 8 sifre), ekskluder ISO-datoer; fjern omgåelsene.
### Acceptance criteria
- [ ] Eksisterende positive redaksjonstester består; ISO-dato og epoch består urørt.
### Verification
`observability`, `provider-errors`.
### Dependencies
Ingen.

## [x] OBS-004 — Bruk `logEvent` i stedet for `console.*` i `api/`
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Observerbarhet
### Files
`api/_shared/middleware.js:200,360`, `api/contact.js:145,163,180,208`, `api/registrations.js:631,790`, `api/events.js:135`, `api/_shared/cloudinary.js:15`, `api/_shared/sentry.js:97`
### Problem
Linjene mangler `requestId`, nivå og hendelsesnavn; ugyldige token logges som error.
### Required change
Konverter til `logEvent`; senk token-linjen til warn/debug.
### Acceptance criteria
- [ ] Ingen `console.*` i `api/` utenom dokumentert unntak (`logCronRun`).
### Verification
`grep -rn "console\." api/`.
### Dependencies
Ingen.

## [x] MAINT-002 — Innfør `mapRegistration`
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Vedlikehold
### Files
`api/registrations.js`
### Problem
Svarformen bygges fire steder (`:190-196`, `:342-350`, `:641-647`, `:750-755`), i strid med «Row mapping» i `AGENTS.md`.
### Required change
Én `mapRegistration(row)` + en offentlig tillatelsesliste-projeksjon.
### Acceptance criteria
- [ ] Alle svar går via mapperen; eksisterende tester uendret grønne.
### Verification
`registrations-handler`, `registration-cancel`.
### Dependencies
TEST-002.

## [x] MAINT-003 — Typ forespørselskroppen i årskalendermodalen
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Vedlikehold
### Files
`client/src/components/yearly-calendar-entry-modal.tsx`
### Problem
`seed: any` og `body: any` (`:130,163`) lar forespørselen være utypet. Store sider (`settings.tsx` 808, `media-shares.tsx` 683, `yearly-calendar-import-modal.tsx` 653, `content.tsx` 617) bør deles når funksjonsarbeid berører dem.
### Required change
Typ som `InsertYearlyCalendarEntry`. Ingen separat refaktor av store sider.
### Acceptance criteria
- [ ] Ingen `any` i modalen; `npm run check` grønn.
### Verification
`npm run check`.
### Dependencies
Ingen.

## [x] DOC-001 — Rett dokumentasjonsavvik
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Dokumentasjon
### Files
`AGENTS.md`, `CLAUDE.md`, `docs/subsystems.md`, `shared/schema.ts`
### Problem
`BUDGET` er 29 (ikke 30); `i18n.ts` er 3 459 linjer (ikke 2,5k); `.d.ts`-listen stemmer ikke (`calendar-feed` har ingen; `structured-data`, `video-embed`, `calendar-entries`, `yearly-calendar-display/-placement` mangler); 9 suiter (ikke 3) har kildevakter; matrisen fanger ikke nye ruter (TEST-003); `docs/subsystems.md:38-40` sier at offentlig årskalender viser `createdBy`, men handleren fjerner det (og feltet kan inneholde innloggings-e-post); `schema.ts:165`.
### Required change
Oppdater tekstene til å stemme med koden. For `createdBy`: beskriv dagens atferd og hvorfor.
### Acceptance criteria
- [ ] Hvert punkt over stemmer med koden.
### Verification
Les gjennom; ingen kjøring nødvendig.
### Dependencies
TEST-003 (formulering om matrisen).

---

## Avhengighetsgraf

```
TRACE-001 ──► DB-002, DB-006, DB-011, UX-011
UX-001 ─────► UX-008
UX-003 ─────► UX-004 ──► A11Y-003
        └───► UX-010
UX-002 ─────► A11Y-001
TEST-002 ───► MAINT-001, MAINT-002
TEST-001 ───► MAINT-001
TEST-003 ───► DOC-001
UX-001, UX-004, UX-006 ─► TEST-004
Prod-lesespørring først: DB-003, DB-005, DB-007, DB-009, DB-010
```

## Kan kjøres parallelt (ingen innbyrdes avhengighet eller filkonflikt)

- **Spor A (backend data):** DB-001, DB-004, DB-008, DB-012
- **Spor B (innholdssiden):** UX-005 + UX-006 (samme fil, én PR), deretter DB-006
- **Spor C (klient generelt):** UX-001, UX-002, UX-007, A11Y-002, A11Y-004
- **Spor D (kvalitet):** TEST-002, TEST-001, OBS-001, OBS-002, OBS-003
- **Spor E (kontrakt):** TRACE-001 (lås opp DB-002/DB-006/DB-011/UX-011)
- **Spor F (opprydding):** DB-003 (egen PR, krever prod-kartlegging)
