# Privat mediedeling

Admin kan laste opp bilder, video og lydklipp og dele dem med foreldrene
gjennom en hemmelig lenke. Innholdet viser barn, så personvern er hovedkravet:
ingenting er offentlig, indekserbart eller mulig å finne uten lenken, og alt
slettes automatisk.

Dokumentet har fire deler:

1. [Slik virker det](#1-slik-virker-det): for den som vedlikeholder koden.
2. [Oppsett](#2-oppsett-steg-for-steg): gjøres én gang, steg for steg.
3. [Brukerveiledning for FAU-styret](#3-brukerveiledning-for-fau-styret).
4. [Drift, kostnader og feilsøking](#4-drift-kostnader-og-feilsøking).

---

## 1. Slik virker det

```
 Admin (nettleser)                     Vercel (api/media.js)            Cloudflare R2 (privat bøtte)
 ─────────────────                     ─────────────────────            ────────────────────────────
 velger filer
 fjerner GPS/EXIF lokalt ──────────▶  sjekker type, størrelse, kvote
                                      lagrer rad i Neon
                          ◀──────────  presignert PUT-URL (30 min)
 laster opp direkte ─────────────────────────────────────────────────▶  lagrer filen
                          ──────────▶  sjekker størrelse, type og de
                                      første bytene i R2 ─────────────▶
 publiserer               ──────────▶  gir lenken /del#<token>

 Forelder (mobil)
 ────────────────
 åpner /del#<token>
 (token forlater aldri nettleseren
  i URL-en; det sendes i en POST) ──▶  slår opp SHA-256(token) i Neon,
                                      sjekker utløp og PIN
                          ◀──────────  presignerte GET-URL-er (1 time)
 viser bilder/video/lyd ◀────────────────────────────────────────────── leser filen
```

| Del | Hvor |
|---|---|
| API (én Vercel-funksjon, nr. 10 av 12) | `api/media.js` |
| R2-klient og presignering | `api/_shared/r2.js` |
| Token, PIN, levetid, filsignaturer, sletting | `api/_shared/media-share.js` |
| Regler begge sider deler (filtyper, grenser) | `shared/media.js` |
| Tabeller | `migrations/0019_media_shares.sql`, `shared/schema.ts` |
| Admin-side `/admin/media` | `client/src/pages/media-shares.tsx` |
| Fjerning av metadata og opplasting | `client/src/lib/media-scrub.ts`, `client/src/lib/media-upload.ts` |
| Delingssiden `/del` | `client/del.html`, `client/src/share/` |
| Daglig sletting | `api/cron/event-reminders.js` (morgenkjøringen kl. 07 UTC) |
| Test mot ekte R2 | `scripts/media-smoke.mjs` |

### Personvern og sikkerhet

- **Lenken.** Tokenet er 256 bit fra `crypto.randomBytes`, kodet som base64url.
  Det står i URL-fragmentet (`/del#…`). Fragmentet sendes aldri til noen
  server, og havner derfor ikke i Vercels logger, i våre logger eller i
  `Referer`. Nettsiden sender tokenet i en POST, og vi logger aldri
  forespørselskroppen.
- **Databasen.** Tokenet lagres som SHA-256 til oppslag. I tillegg lagres en
  AES-GCM-kryptert kopi, med nøkkel avledet fra `SESSION_SECRET`, slik at admin
  kan kopiere lenken igjen. En databasedump alene åpner ingenting. Filnavn
  lagres ikke noe sted, og objektnøklene er tilfeldige
  (`media/<id>/<128 bit>`).
- **Ugyldige lenker.** Ugyldig, utløpt, tilbakekalt og aldri eksisterende
  deling gir nøyaktig samme svar: «Denne lenken er ikke lenger tilgjengelig».
  Utløp sjekkes ved hvert oppslag, ikke bare av den daglige slettingen.
- **PIN.** 4–8 sifre, lagret som bcrypt-hash. Feil PIN begrenses til 5 forsøk
  per 15 minutter per IP og deling, og til 30 per døgn per deling. Etter riktig
  PIN får fanen en signert tilgang som varer 12 timer, så forelderen slipper å
  skrive PIN på nytt når avspillings-URL-ene fornyes.
- **Filene er aldri offentlige.** Bøtta har ingen offentlig tilgang og ingen
  r2.dev-adresse. Nettleseren får bare presignerte URL-er: 30 minutter for
  opplasting, 1 time for avspilling. Går en URL ut midt i en video, henter
  siden nye og fortsetter på samme sekund.
- **Opplasting kontrolleres to ganger.** Type og størrelse er en del av
  signaturen, så R2 avviser alt annet. Etterpå sjekker API-et størrelse, type
  og de første bytene av det R2 faktisk lagret, og sletter filen hvis noe ikke
  stemmer.
- **Metadata fjernes i nettleseren, uten omkoding.** Bilder beholder original
  oppløsning og piksler; bare rotasjonen beholdes.
  - JPEG, PNG og WebP mister EXIF (også GPS), XMP og kameradata.
  - MP4, MOV og M4A får posisjonsfeltene blanket ut: `©xyz`, `loci` og
    `com.apple.quicktime.location.*`.
  - En fil som ikke kan tolkes, blir ikke lastet opp.
- **Delingssiden er et eget inngangspunkt** (`del.html`). Den har ingen
  analytics, ingen Sentry og ingen Google Fonts. Fonten serveres fra vårt eget
  domene. `vercel.json` gir den blant annet:
  - `Referrer-Policy: no-referrer`
  - `X-Robots-Tag: noindex, nofollow, noarchive`
  - en CSP som bare tillater vårt eget domene og R2
- **Admin** er den vanlige innloggingen, med rollen `admin`
  (`MEDIA_SHARE_ROLES` i `shared/constants.js`). Det gir JWT i en
  HttpOnly/Secure/SameSite=Strict-cookie, rate-limitet innlogging og CSRF på
  alle endringer. `/admin*` og `/api/*` svarer med `X-Robots-Tag: noindex`, og
  `robots.txt` stenger `/del` og `/admin`.
- **Automatisk sletting.** Morgenkjøringen i cron sletter utløpte delinger, og
  utkast som er eldre enn ett døgn: først filene i R2, så radene. En
  lifecycle-regel i R2 er sikkerhetsnett.
- **Levetid:**
  - standard 90 dager ved opprettelse, maks 180
  - hver forlengelse gir inntil 180 dager til
  - aldri lenger enn 365 dager etter publisering

**Begrensninger du bør kjenne til:**

- **Nedlastingssperre.** `controlsList="nodownload"`, sperret høyreklikk og
  sperret «Lagre bilde» på iOS er en terskel, ikke en sperre. Skjermbilder og
  skjermopptak kan ikke hindres.
- **iPhone-video.** iPhone filmer som standard i HEVC. Det spilles av på
  Apple-enheter, men ikke alltid på Android eller Chrome på PC. Konvertering
  er ikke mulig på gratisnivået, så sett kameraet til «Mest kompatibel» (se
  del 3).
- **Rotert tilgang.** Roteres `SESSION_SECRET`, virker lenkene fortsatt, men
  admin kan ikke lenger vise dem på nytt. Innloggede brukere må også logge inn
  igjen.

---

## 2. Oppsett steg for steg

Gjør stegene i denne rekkefølgen. Regn med ca. 30 minutter.

### 2.1 Aktiver R2 i Cloudflare

1. Logg inn på <https://dash.cloudflare.com> med kontoen som skal eie
   lagringen.
2. Velg **Storage & databases → R2 object storage** i menyen til venstre.
3. Velg **Purchase R2 Plan** / **Enable R2**. Cloudflare krever et
   betalingskort selv på gratisnivået. Du belastes ingenting så lenge bruken
   holder seg under gratisgrensene (se del 4), og API-et nekter nye
   opplastinger før vi når dem.
4. Noter **Account ID**. Den står til høyre på R2-oversikten, under
   **Account Details**, og er 32 tegn med tall og bokstavene a–f.

### 2.2 Opprett den private bøtta

1. Velg **Create bucket** på R2-siden.
2. **Bucket name:** `fau-erdal-media`, eller et annet navn du noterer.
3. **Location:** velg **Specify jurisdiction → European Union (EU)**. Da
   lagres og behandles dataene bare i EU, som passer med GDPR. Jurisdiksjonen
   kan ikke endres senere.
4. **Default storage class:** Standard.
5. Velg **Create bucket**.
6. Åpne bøtta, gå til **Settings** og kontroller:
   - **Public access → R2.dev subdomain** skal være **Disabled**
     (standardverdien). Ikke slå den på.
   - **Custom Domains** skal være tom. Ikke koble til et domene.

### 2.3 CORS-regel (bare for nettsidens domene)

Nettleseren laster opp direkte til R2, og det krever en CORS-regel. I
bøttas **Settings → CORS Policy → Add CORS policy → JSON**, lim inn:

```json
[
  {
    "AllowedOrigins": ["https://www.erdal-bhg.no", "https://erdal-bhg.no"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Velg **Save**.

- **`ExposeHeaders: ETag` er påkrevd.** Uten den feiler alle videoer over
  8 MB med «R2 returned no ETag».
- **Legg ikke til `*`** eller andre domener. Skal du teste en
  preview-deployment, bruk en egen test-bøtte med preview-domenet i sin egen
  regel.

### 2.4 Lifecycle-regler (sikkerhetsnett)

I bøttas **Settings → Object lifecycle rules**:

1. **Rediger den eksisterende regelen** «Default Multipart Abort Rule»:
   **Abort incomplete multipart uploads after** → **1 day**. Lagre.
2. **Legg til en ny regel** med **Add rule**:
   - **Rule name:** `slett-media-etter-368-dager`
   - **Apply to:** *Prefix* `media/`
   - **Delete objects:** **after 368 days**
   - Lagre.

Appen sletter selv hver deling når den utløper. Regelen fanger bare opp det
den eventuelt ikke rekker. 368 dager ligger så vidt over den lengste lovlige
levetiden (365 dager etter publisering + ett døgn som utkast), så regelen
sletter aldri en aktiv deling.

### 2.5 API-nøkkel med minst mulig rettigheter

1. Gå tilbake til R2-oversikten og velg **Manage** ved **API Tokens** under
   **Account Details**.
2. Velg **Create Account API token**. Det er bedre enn et bruker-token, som
   slutter å virke hvis personen forlater kontoen.
3. **Token name:** `fau-nettside-mediedeling`.
4. **Permissions:** **Object Read & Write**.
   - Ikke velg *Admin Read & Write*.
   - Appen trenger bare å lese, skrive og slette objekter. Bøtter og regler
     kan den ikke endre.
5. **Specify bucket(s):** **Apply to specific buckets only** → velg
   `fau-erdal-media`.
6. **TTL:** *Forever*. Alternativt en dato, men da må du huske å fornye
   tokenet før den.
7. **Client IP Address Filtering:** la stå tom. Vercel har ikke faste
   IP-adresser på gratisnivået.
8. Velg **Create Account API token**.
9. **Kopier med én gang** *Access Key ID* og *Secret Access Key*. Secret vises
   bare denne ene gangen. Lim dem rett inn i Vercel (neste steg), ikke i
   e-post, chat eller dokumenter.

### 2.6 Miljøvariabler i Vercel

Gå til <https://vercel.com> → prosjektet **fau-erdalbhg** → **Settings →
Environment Variables**. Legg inn følgende for **Production**:

| Navn | Verdi | Type |
|---|---|---|
| `R2_ACCOUNT_ID` | Account ID fra 2.1 | vanlig |
| `R2_ACCESS_KEY_ID` | Access Key ID fra 2.5 | **Sensitive** |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key fra 2.5 | **Sensitive** |
| `R2_BUCKET` | `fau-erdal-media` | vanlig |
| `R2_JURISDICTION` | `eu` (hvis du valgte EU i 2.2; ellers utelat den) | vanlig |
| `MEDIA_MAX_FILE_BYTES` | *valgfri*, standard `1073741824` (1 GiB), maks 5 GiB | vanlig |
| `MEDIA_STORAGE_QUOTA_BYTES` | *valgfri*, standard `9663676416` (9 GiB) | vanlig |

- **Disse finnes allerede og brukes også her:**
  - `SESSION_SECRET`: nøkkelen til den krypterte lenkekopien og PIN-tilgangen.
  - `CRON_SECRET`: den daglige slettingen.
  - `PUBLIC_BASE_URL`: domenet i lenkene, standard `https://www.erdal-bhg.no`.
- **Ikke legg R2-variablene på Preview** uten en egen test-bøtte. En preview
  skal aldri kunne skrive i produksjonsbøtta. Uten variablene viser
  admin-siden «Lagringen er ikke satt opp ennå», og ingenting kan lastes opp.
- **`ADMIN_PASSWORD` og `SITE_URL` brukes ikke.** Innloggingen er den vanlige
  admin-kontoen, og domenet kommer fra `PUBLIC_BASE_URL`.

### 2.7 Databasen

Kjør hele innholdet i `migrations/0019_media_shares.sql` i Neons SQL-editor
**før** du deployer koden. Sjekk deretter:

```sql
SELECT to_regclass('public.media_shares'), to_regclass('public.media_files');
```

Begge skal være ikke-null. Migrasjonen oppretter bare nye tabeller og kan
kjøres på nytt.

### 2.8 Deploy og kontroll

1. Merge til `main`. Vercel deployer automatisk.
2. Kjør røyktesten mot den ekte bøtta fra din egen maskin, med de samme
   verdiene i en lokal `.env.local` som aldri committes:

   ```bash
   npm ci
   node --env-file=.env.local scripts/media-smoke.mjs https://www.erdal-bhg.no
   ```

   Den laster opp, leser og sletter ett lite testobjekt, og sjekker at:
   - presignert opplasting og avspilling virker
   - feil filtype avvises
   - en URL faktisk slutter å virke når den utløper
   - bøtta ikke kan leses eller listes uten signatur
   - CORS slipper inn bare nettsidens domene og eksponerer `ETag`

   Alle linjer skal si `OK`.
3. Gå gjennom den manuelle sjekklisten i del 4.4 på en iPhone.

---

## 3. Brukerveiledning for FAU-styret

Mediedeling er bare tilgjengelig for brukere med admin-rolle. Logg inn som
vanlig og velg **Admin → Mediedeling**, eller gå rett til
`https://www.erdal-bhg.no/admin/media`.

**Før du filmer eller tar bilder med iPhone:**

- **Innstillinger → Kamera → Formater → Mest kompatibel**, så videoene spilles
  av på alle telefoner.
- **Innstillinger → Personvern → Stedstjenester → Kamera → Aldri**, så
  bildene ikke får posisjon i utgangspunktet. Siden fjerner posisjonen uansett
  før opplasting, men det er tryggest å ikke ha den.

**Lag en deling:**

1. Skriv en **tittel**, for eksempel «Sommerfest 2026». Legg eventuelt til en
   kort **beskrivelse**.
2. Velg **Tilgjengelig i**. Standard er 90 dager.
3. Legg eventuelt inn en **PIN-kode** på 4–8 sifre. Send PIN-koden på en
   annen kanal enn lenken: lenken i Vigilo, PIN-en på SMS eller muntlig.
4. **Velg filer**: bilder (JPEG, PNG, WebP), video (MP4, MOV) og lyd (MP3,
   M4A, WAV), inntil 1 GB per fil. Filer som ikke støttes, merkes med en gang
   og lastes ikke opp.
5. Trykk **Last opp og publiser**.
   - Hver fil får en fremdriftslinje, og «Posisjon og kameradata fjernet»
     vises når det var noe å fjerne.
   - Ikke lukk fanen mens opplastingen pågår.
   - Store videoer lastes opp i biter og prøves på nytt automatisk hvis nettet
     hikker.
6. Når **Delingen er klar** vises, trykker du **Kopier lenke** og sender den
   til foreldrene.
7. Hvis noen filer feilet, kan du velge **Publiser uten disse** eller
   **Forkast delingen** og prøve igjen.

**Senere, i listen «Delinger»:**

- **Kopier lenke** henter lenken på nytt.
- **Forleng** legger til 30, 90 eller 180 dager. En deling kan aldri vare mer
  enn 365 dager etter at den ble publisert.
- **Tilbakekall** sletter alle filene og lenken med en gang. Bruk den hvis en
  lenke er kommet på avveie, eller hvis en forelder ber om at et bilde
  fjernes. Tilbakekall kan ikke angres; last eventuelt opp en ny deling uten
  bildet.
- «**Utløpt – slettes i natt**» og «**Ufullstendig – slettes i natt**»
  forsvinner av seg selv etter neste morgenkjøring.

**Hva foreldrene ser:**

- Hvis delingen har PIN, kommer en PIN-skjerm først.
- Deretter tittel, beskrivelse og et bildegalleri. Trykk på et bilde for
  fullskjerm, og sveip for å bla.
- Videoer og lydklipp har vanlige avspillingsknapper.
- Nederst står en kort tekst om at innholdet bare er for foreldrene, ikke skal
  lastes ned eller deles videre, og når det slettes.
- Utløpte eller tilbakekalte lenker viser bare «Denne lenken er ikke lenger
  tilgjengelig».

**Godt å vite:**

- Lagringsplassen øverst på siden viser hvor mye som er brukt av kvoten.
  Tilbakekall gamle delinger når den begynner å bli full.
- Den som har lenken (og PIN-en), kan se innholdet. Del den bare i lukkede
  kanaler for foreldre i barnehagen.

---

## 4. Drift, kostnader og feilsøking

### 4.1 Gratisnivåene

| Tjeneste | Grense (gratis) | Denne løsningen |
|---|---|---|
| Vercel Hobby, funksjoner | 12 per prosjekt | 10 i bruk (`api/media.js` er ny) |
| Vercel Hobby, cron | Kjører én gang per døgn | Ingen ny cron; slettingen går i morgenkjøringen |
| Vercel, båndbredde / request body 4,5 MB | 100 GB/mnd | Filene går aldri gjennom Vercel, bare små JSON-kall |
| **R2, lagring** | **10 GB-måned** | **Den reelle grensen.** Kvoten i API-et stopper opplasting ved 9 GiB |
| R2, skriveoperasjoner (klasse A) | 1 mill./mnd | En video på 1 GB er ca. 130 operasjoner |
| R2, leseoperasjoner (klasse B) | 10 mill./mnd | Ett bilde/én videobit per visning; godt innenfor |
| R2, utgående trafikk | Gratis og ubegrenset | Avspilling koster ingenting |
| Neon | Eksisterende database | To små tabeller |

- **Ved lange levetider.** Med opptil 365 dagers levetid kan få, lange videoer
  fylle 9 GiB: ti videoer på 900 MB er nok. Løsningen er å tilbakekalle eller
  la delinger utløpe, eller å heve `MEDIA_STORAGE_QUOTA_BYTES` bevisst. Over
  10 GB koster R2 ca. 0,015 USD per GB per måned.
- **Vilkårene for Vercel Hobby** gjelder ikke-kommersiell bruk. Det gjelder
  allerede resten av nettsiden og endres ikke av dette.

### 4.2 Hva logges

- Hver forespørsel logges med sti, handling, status og (for admin) bruker-id.
- Aldri logget:
  - tokens og PIN-koder
  - filnavn og objektnøkler
  - forespørselskroppen
- En sletting som feiler, logges som `media.purge_failed`, med bare delingens
  id. Den prøves igjen neste morgen.
- Morgenkjøringens `cron.run`-linje har feltene `mediaSharesDeleted`,
  `mediaFilesDeleted` og `mediaPurgeFailed`.

### 4.3 Feilsøking

| Symptom | Årsak og løsning |
|---|---|
| Admin: «Lagringen er ikke satt opp ennå» | R2-variablene mangler eller er feil i dette Vercel-miljøet (2.6). Deploy på nytt etter endring. |
| Opplasting feiler med en gang, konsollen viser CORS-feil | CORS-regelen mangler, eller domenet i `AllowedOrigins` er feil (2.3). Kjør røyktesten. |
| Store videoer feiler, små filer virker | `ExposeHeaders: ["ETag"]` mangler i CORS-regelen. |
| 503 fra API-et med `R2_NOT_CONFIGURED` i loggen | `R2_ACCOUNT_ID` er ikke 32 heks-tegn, eller `R2_JURISDICTION` er noe annet enn `eu`/`us`. |
| «Filen kunne ikke leses og ble ikke lastet opp» | Filstrukturen kunne ikke tolkes, så metadata kunne ikke fjernes trygt. Eksporter filen på nytt fra telefonen/Bilder og prøv igjen. |
| Video spilles på iPhone, men ikke på Android/PC | HEVC-video. Film med «Mest kompatibel» (del 3). |
| Admin: «Lagringsplassen er full» | Kvoten er nådd. Tilbakekall gamle delinger. |
| Lenken viser «ikke lenger tilgjengelig» for alle | Delingen er utløpt eller tilbakekalt, eller lenken er avkortet (tokenet er 43 tegn etter `#`). |

### 4.4 Tester

**Automatisk, i `npm test` (uten nettverk):**

- `media-handler`:
  - ugyldig, utløpt og utkast gir samme 404
  - PIN-flyten
  - rate-limit
  - presignerte URL-er utløper etter 3600 sekunder
  - admin-endepunkter avviser anonyme, `member` og `staff`
  - kvote og filsjekk
  - rekkefølgen i slettingen
- `media-share`: token, kryptering, levetid, filsignaturer.
- `media-scrub`: syntetiske filer med GPS.
- `api-authorization`: alle admin-ruter.
- `deploy-config`: headere, CSP og at delingssiden ikke drar inn
  tredjepartskode.

**Automatisk, i `npm run test:integration`:** SQL-en mot ekte PostgreSQL
(utløp, kvote, summering, hva cron sletter).

**Verifisert i Chromium under utviklingen:** hele flyten fra admin til
forelder, mot ekte handlere, ekte Postgres og en simulert R2 som håndhever
utløp og CORS. Det omfattet blant annet:

- multipart-opplasting av en 12 MB-video
- at lagrede filer ikke har GPS (sjekket med ffmpeg)
- PIN og galleri
- at avspilling gjenopptas etter at URL-en er utløpt
- ingen CSP-brudd og ingen tredjepartsforespørsler på delingssiden
- tilbakekall

**Må testes manuelt etter oppsett.** Dette kan ikke kjøres her, fordi det
krever ekte R2 og en iPhone:

- [ ] `scripts/media-smoke.mjs` mot produksjonsbøtta. Alle linjer skal si
  `OK`, også at en presignert URL avvises etter utløp.
- [ ] På en iPhone (Safari):
  - [ ] Last opp en video på minst 300 MB fra *Bilder* til `/admin/media`.
        Opplastingen skal fullføres.
  - [ ] Åpne lenken i Safari: videoen skal vise første bilde, spilles av
        inne i siden (ikke bare i fullskjerm) og kunne spoles.
  - [ ] Pause videoen, vent over én time, trykk spill av igjen: den skal
        fortsette der den var.
  - [ ] Et langt trykk på et bilde skal ikke gi «Arkiver bilde».
- [ ] På en Android-telefon (Chrome): galleri, video og lyd.
- [ ] Ugyldig lenke og utløpt lenke gir samme melding.
- [ ] `curl -sI https://www.erdal-bhg.no/del` viser
      `x-robots-tag: noindex, nofollow, noarchive` og
      `referrer-policy: no-referrer`.
- [ ] `curl -s -X POST 'https://www.erdal-bhg.no/api/media?action=create'`
      uten innlogging gir `401`.
