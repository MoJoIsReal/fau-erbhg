# FAU Erdal Barnehage — UI Design & Style Guide 1.1

> **Read this before any visual change** — a component, page layout, colour,
> spacing, typography, illustration, icon, motion or theme change. It is the
> visual source of truth for the site.
>
> The original is [`FAU_Erdal_Barnehage_UI_Design_Style_Guide_v1.1.pdf`](FAU_Erdal_Barnehage_UI_Design_Style_Guide_v1.1.pdf)
> (25 pages, September 2026, v1.1 "dark mode + modern refinement"). This file is
> a faithful text transcription so agents can read and grep it without a PDF
> renderer; section numbers match the PDF. If the two ever disagree, the PDF
> wins — fix this file. The guide itself is written in Norwegian and is kept in
> Norwegian below.

## How the guide maps onto this repository

| The guide says | In this repo |
|---|---|
| CSS tokens (§16, §23) are the single source of truth | `client/src/index.css` (`:root` and `.dark`), exposed as utilities by `tailwind.config.ts` |
| `[data-theme="dark"]` token override (§23) | the `.dark` block — `next-themes` toggles a class, not a data attribute; same tokens, same values |
| `--space-*` 8px system (§4) | Tailwind's default spacing scale (`gap-6` = 24px, `py-16` = 64px) — no separate tokens |
| Type scale (§3) | `text-display`, `text-h1`…`text-h4`, `text-body-lg`, `text-body`, `text-small`, `text-micro` (`clamp()` between mobile and desktop) |
| Category chips (§7) | `client/src/lib/calendar-kind-style.ts` → `--cat-*-dot` / `--cat-*-text` / `--cat-*-tint` |
| Recommended components (§16) | `client/src/components/site/` (`PageHero`, `SectionHeader`, `FilterChip`, `SegmentedControl`, `InfoBanner`, `EditorSurface`, `Artwork`, …) |
| Hero crops per breakpoint (§14, §15) | `client/src/components/site/illustrations.ts` + `attached_assets/illustrations/README.md` |
| Dark illustrations (§22) | each illustration has a hand-drawn night version that `Artwork` swaps in — never an overlay or grayscale on top |
| Printable calendar | `client/src/lib/yearly-calendar-pdf.tsx` via `calendar-pdf-theme.ts` — always the light tokens |

**Deliberate departures**, both for contrast and both commented where declared
in `index.css`: `--color-text-muted` is a darkened sibling of the guide's
`--color-muted` (#6F7D78 is only 3.99:1 on sand, below the guide's own 4.5:1
rule in §8), and every calendar category has an AA-safe `--cat-*-text` next to
the guide's published dot hue. Don't "fix" these back to the published values.

### Checklist for a visual change

1. Find the relevant section(s) below; follow the rule, not the look of the
   nearest existing code.
2. Use tokens and `components/site/` — no hex values, one-off radii, shadows or
   font sizes in components (§16, rule 4 in §17).
3. It works in **both** themes by swapping tokens, not by `dark:` variants (§19–23).
4. Contrast 4.5:1 for text, 3:1 for UI/focus/meaningful graphics, 3px visible
   focus ring, 44×44px targets, never colour alone (§8, §22).
5. Responsive at 375 / 430 / 768 / 1024 / 1440px in light and dark, no
   horizontal scroll at 375px (§17, §18, §23).
6. Respect `prefers-reduced-motion` (§15).
7. Keep editor/admin controls in `EditorSurface`, never among public filters (§11).

---

## Forside

**Designretning:** Skandinavisk, varm, luftig og moderne.
**Primærfont:** Manrope / Inter fallback.

Implementeringsklar visuell standard for hele erdal-bhg.no. Guiden bygger på
den vedlagte visuelle profilen og bannerillustrasjonene, og utvider dem til
konkrete design tokens, komponentregler, responsiv oppførsel og
tilgjengelighetskrav.

*Kildegrunnlag:* Kjernepalett, Manrope/Inter, avrundede flater,
komponentuttrykk og illustrasjonsstil er hentet fra den leverte visuelle
profilen. Spacing, responsive regler, semantiske farger, states og
tilgjengelighetsregler er en implementeringsmessig utvidelse av samme uttrykk.

## 1. Designretning

- **Varm og lokal** — laget for foreldre og lokalmiljøet, ikke en kommunal
  portal eller et generisk SaaS-produkt.
- **Rolig og oversiktlig** — mye luft, klare seksjoner, få samtidige
  prioriteringer og tydelig hierarki. Informasjon skal være rask å skanne.
- **Familievennlig uten å bli barnslig** — illustrasjoner og myke former gir
  personlighet; typografi og layout skal være voksen, ryddig og troverdig.
- **Funksjon først** — kalender, dokumenter og kontaktinformasjon er
  kjernefunksjoner. Dekor skal støtte disse, ikke konkurrere med dem.

**Visuelle nøkkelord**
- Natur, fellesskap, lek, trygghet og lokal tilhørighet.
- Dempede grønntoner kombinert med varme aksentfarger.
- Store, vennlige flater med 12–24 px radius.
- Tydelige chips/tagger som gjør mye informasjon skannbar.
- Fotografi og illustrasjon kan blandes, men i kontrollerte seksjoner.

**Unngå**
- For mange gradienter, glassmorphism og trend-effekter.
- Mørke flater som dominerer siden.
- For små fonter og tettpakket informasjon.
- Farge som eneste signal for status eller kategori.

## 2. Fargesystem

Kjernepaletten er hentet direkte fra den leverte visuelle profilen.

| Navn | Hex | Bruk |
|---|---|---|
| Primær skoggrønn | `#0F6B46` | CTA, aktiv nav, viktige lenker |
| Sekundær sage | `#B7D3B1` | Dekor, aktive seksjoner, myke bakgrunner |
| Lys grønn | `#E8F3E8` | Bakgrunn, infoflater, kalender current-week |
| Sand | `#F9F6F1` | Sidebakgrunn og varme nøytraler |
| Fersken | `#FFE8D8` | Påmelding, varm info, sekundær callout |
| Blå | `#E6F0FA` | Informasjon og rolige statusflater |
| Oransje | `#F4A261` | Varmmat, tidsnære/highlight-elementer |
| Rød | `#E76F51` | Arrangement/varsling, ikke generell dekor |

**Semantiske nøytraler og states**

| Token | Verdi | Bruk |
|---|---|---|
| `--color-ink` | `#102A24` | Hovedtekst / overskrifter |
| `--color-text` | `#364742` | Brødtekst |
| `--color-muted` | `#6F7D78` | Sekundær metadata |
| `--color-border` | `#DCE6E1` | Kort, input, separator |
| `--color-surface` | `#FCFDFB` | Kort og hovedflater |
| `--color-primary-hover` | `#0B5438` | Hover primær |
| `--color-primary-active` | `#083F2B` | Pressed/active |

**Regel:** bakgrunnsfargene er bevisst lyse. Primærgrønn brukes konsentrert
til handlinger og aktive states slik at den beholder tydeligheten sin.

## 3. Typografi

Manrope er anbefalt primærfont. Inter er første fallback og kan brukes som
hovedfont dersom Manrope ikke er tilgjengelig.

| Rolle | Desktop | Mobil | Vekt | Line-height |
|---|---|---|---|---|
| Display / hero | 56 px | 42 px | 700 | 1.08 |
| H1 | 40 px | 34 px | 700 | 1.15 |
| H2 | 30 px | 26 px | 700 | 1.25 |
| H3 | 22 px | 20 px | 650/700 | 1.32 |
| H4 | 18 px | 18 px | 650 | 1.4 |
| Body large | 18 px | 17 px | 400 | 1.55 |
| Body | 16 px | 16 px | 400 | 1.6 |
| Small | 14 px | 14 px | 400 | 1.55 |
| Micro / metadata | 12 px | 12 px | 500 | 1.45 |

```css
font-family: 'Manrope', 'Inter', system-ui, -apple-system, BlinkMacSystemFont,
             'Segoe UI', sans-serif;
```

**Dekorativ håndskrift:** Profilen bruker håndskrevne budskap som dekorativt
element. Anbefalt: Caveat 500–600 eller et ferdig illustrasjonslag. Håndskrift
skal aldri brukes til navigasjon, skjema, metadata eller lengre tekst. Maks 1–2
korte budskap per side.

**Typografiske regler**
- Maks bredde på brødtekst: 68–72 tegn.
- Overskrifter skal normalt venstrejusteres.
- Unngå ALL CAPS utenom små labels på 11–12 px med tydelig letter-spacing.
- Bruk `tabular-nums` for datoer, uketall og klokkeslett i kalenderen.
- Ikke bruk mer enn tre fontvekter på samme side: 400, 600 og 700.

## 4. Layout, spacing og breakpoints

Et konsekvent 8 px-system gir den luftige profilen.

| Token | px | Bruk |
|---|---|---|
| `--space-1` | 4 | mikroavstand |
| `--space-2` | 8 | ikon/label |
| `--space-3` | 12 | tett komponent |
| `--space-4` | 16 | standard innvendig padding |
| `--space-5` | 20 | kortkomponent |
| `--space-6` | 24 | grid gap |
| `--space-8` | 32 | seksjon internt |
| `--space-10` | 40 | mobil seksjon |
| `--space-12` | 48 | stor seksjon |
| `--space-16` | 64 | desktop seksjon |
| `--space-20` | 80 | hero / hovedseksjon |

**Grid og beholdere**
- Desktop: 12 kolonner, 24 px gap, maks innholdsbredde 1200 px.
- Tablet: 8 kolonner, 20 px gap, 24 px sidepadding.
- Mobil: 4 kolonner, 16 px gap, 16 px sidepadding.
- Full-bleed illustrasjoner kan gå til viewport-kant, men tekst følger alltid container.

| Breakpoint | Område | Hovedatferd |
|---|---|---|
| Mobile | 0–639 px | Stack, kort full bredde, måned → agenda ved behov |
| Tablet | 640–1023 px | 2 kolonner, komprimert nav, færre sidepaneler |
| Desktop | 1024–1439 px | 12-kolonne layout, full nav |
| Wide | 1440 px + | Samme container, mer ytre luft — ikke strekk innholdet |

## 5. Former, radius, border og dybde

Myke former skal være gjennomgående, men ikke «boble-design».

| Element | Radius | Border | Shadow |
|---|---|---|---|
| Små chips / badges | 999 px | 1 px subtil | Ingen |
| Input / knapper | 10–12 px | 1 px | Ingen / hover |
| Kort | 16 px | 1 px | `0 4px 18px rgba(16,42,36,.06)` |
| Hero / banner | 20–24 px | 0–1 px | svært subtil |
| Modal / panel | 20 px | 1 px | `0 18px 50px rgba(16,42,36,.14)` |

**Overflatehierarki:** Side `#F9F6F1` eller hvit · Standardkort `#FCFDFB` +
border · Aktiv/utvalgt `#E8F3E8` + grønn aksent.

**Interaksjon**
- Hover kommuniseres primært med 2–6 % toneendring, border og lett løft — ikke store animasjoner.
- Focus-ring: 3 px, tydelig synlig utenfor komponenten.
- Pressed/active: mørkere primærfarge og 1 px optisk innpress.
- Disabled: behold lesbar tekst; opacity rundt 0.55 og ingen hover.

## 6. Header og navigasjon

Samme header på alle sider. Kalender, Aktuelt, Dokumenter og Kontakt skal
føles som deler av ett system.

- **Desktop header — 72 px:** Logo venstre. Hovednav sentrert/høyre. Aktiv side
  markeres med primærgrønn underline *eller* svak lysgrønn pill — ikke begge.
  Søk kan være ikonknapp.
- **Mobil header — 60–64 px:** Logo + menyknapp. Meny åpnes som full bredde
  sheet/drawer. Hovedsidene først, sekundære funksjoner under separator.

**Nav-regler**
- Sticky header er tillatt etter at brukeren har scrollet forbi hero, men den skal være kompakt.
- Klikkeflate minimum 44×44 px.
- Aktiv nav må kommuniseres både med farge og form/underline.
- Admin/redaktørfunksjoner ligger i eget område og blandes ikke inn i offentlig navigasjon.

**Anbefalt struktur:** Hjem | Aktuelt | Kalender | Dokumenter | Kontakt.
Sekundært: språk / søk / evt. bruker-redaktør.

## 7. Knapper, lenker, chips og filtre

Enkle, runde og tydelige komponenter — med én dominerende primærhandling per seksjon.

| Variant | Utseende | Mål |
|---|---|---|
| Primær | Bakgrunn `#0F6B46`, hvit tekst | 44–48 px høyde, 16–20 px horisontal padding |
| Sekundær | Hvit/transparent, grønn border | 44–48 px høyde, samme radius |
| Tertiær | Tekstlenke + pil | Ingen bakgrunn, underline på hover |

**Chips / tags**

| Kategori | Farge | Regel |
|---|---|---|
| Arrangement | `#E76F51` | rød/korall dot + tekst |
| Møte | `#2F80ED` | blå dot + tekst |
| Dugnad | `#0F6B46` | grønn dot + tekst |
| Foto | `#7655D6` | lilla dot + tekst |
| Internt | `#667085` | slate dot + tekst |
| I barnehagen | `#3B82F6` | blå dot + tekst |
| Varmmat | `#F59E0B` | oransje dot + tekst |
| Temauke | `#7655D6` | lilla dot + tekst |
| Stengt | `#D64545` | rød dot + tydelig label |
| Beskjed | `#737373` | grå dot + tekst |

**Viktig:** kategori skal alltid vises med tekst eller ikon i tillegg til farge.

## 8. Skjema og tilgjengelighet

Tydelige labels, gode fokusmarkeringer og lesbar kontrast er en del av det
visuelle systemet — ikke et tillegg.

| Element | Spesifikasjon |
|---|---|
| Input høyde | 48 px desktop og mobil |
| Radius | 10–12 px |
| Border | `#DCE6E1`, 1 px |
| Label | 14 px / 600, alltid synlig over feltet |
| Placeholder | Sekundær hjelp — aldri erstatning for label |
| Focus | 3 px focus ring + primær border |
| Error | Rød tekst + ikon + forklaring under felt |
| Help text | 13–14 px, `#6F7D78` |

**Kontrast og tastatur**
- Normal tekst minst 4.5:1 mot bakgrunn.
- Stor tekst kan bruke 3:1 når den faktisk oppfyller kriteriene for stor tekst.
- UI-komponenter, fokus og meningsbærende grafikk minst 3:1 mot nærliggende farge.
- Alle interaktive elementer må kunne nås og betjenes med tastatur.
- Ikke fjern outline uten å erstatte den med en synlig focus state.
- Respekter `prefers-reduced-motion`.

**Praktisk regel:** Bruk primærgrønn til tekst/ikon på lyse flater, men mørk
tekst (`#102A24`) på sage, fersken, blå og oransje flater dersom hvit tekst
ikke gir tilstrekkelig kontrast.

## 9. Kort og innholdsmoduler

Samme komponentlogikk på Hjem, Aktuelt, Kalender, Dokumenter og Kontakt.

| Modul | Innhold |
|---|---|
| Eventkort | Dato-blokk + kategori + tittel + tid/sted + kort beskrivelse + pil. Bilde valgfritt. |
| Nyhetskort | 3:2 bilde, tag, tittel, dato. Maks 2–3 tekstlinjer i oversikten. |
| Dokumentrad | Filikon + navn + type/størrelse + primær handling «Last ned». Ingen store kort nødvendig. |
| Nyttig lenke | Ikon øverst/venstre, kort label og forklaring. Hele kortet klikkbart. |
| Info-/varselboks | Ikon + kort overskrift + én forklarende setning. Farge viser tone, ikke alvor alene. |
| Kontaktkort | Ikon + rolle/kanal + verdi. Skjema ved siden av på desktop, under på mobil. |

**Korttetthet:** Kort skal ikke brukes rundt alt. Bruk åpne seksjoner og
separatorlinjer når innholdet allerede ligger i en tydelig kontekst — spesielt
i kalenderens ukevisning og dokumentlisten.

## 10. Kalender — hovedmønster

Kalenderen beholder Liste / Måned / År, men uke-for-uke er anbefalt
primærvisning fordi kildematerialet er organisert etter uker.

**A. Liste — primærvisning**
- Én seksjon/kort per uke med «UKE 38» og dato-spenn i header.
- Ukens faste informasjon øverst: varmmat, temauke, beskjeder, studenter eller frister.
- Enkeltdager som separate eventrader med dag, dato, kategori, tittel og metadata.
- Gjeldende uke får lys grønn bakgrunn/border og pill «Denne uken».
- Uker uten arrangement kan være komprimerte, men ukens faste info skal fortsatt kunne vises.
- På mobil er ukeheaderen sticky kun dersom det faktisk forbedrer skanning; unngå flere samtidige sticky elementer.

**B. Måned**
- Klassisk månedsgitter på desktop, mandag–søndag.
- Maks 2–3 synlige hendelser per dato; resten som «+N flere».
- Klikk/tap på dato åpner detaljpanel under kalender eller side-sheet.
- På smal mobil: agenda under valgt dato fremfor å presse full kalendertekst inn i cellene.

**C. År**
- 12 mini-måneder: 3×4 desktop, 2×6 tablet, 1×12 eller 2×6 på mobil.
- Prikker viser hendelser, men månedskortet skal kunne åpnes for detaljer.
- Årssiden er fugleperspektiv — ikke vis full eventtekst her.

## 11. Kalender — filtre, states og redaktørmodus

Offentlig bruk og redigering skal skilles visuelt.

**Topplinje**
- Segmented control: Liste | Måned | År. Aktiv visning: primærgrønn bakgrunn og hvit tekst.
- Barnehageår-dropdown til høyre på desktop, under visningsvalg på mobil.
- Filtre brytes til flere linjer og kan samles under «Flere filtre» når bredden blir liten.
- Aktive filtre er synlige og kan fjernes med ett trykk.

**Redaktørmodus**
- Admin-handlinger («Nytt i kalenderen», import, PDF, rediger årskalender) vises kun for innlogget redaktør.
- Redaktørverktøy i en egen verktøylinje med svak sand/grå bakgrunn — aldri mellom offentlige filtre.
- Destruktive handlinger bruker rød kun ved faktisk risiko.
- Import/eksport har korte hjelpetekster, men dominerer ikke kalenderen.

**Eventdetaljer — detaljpanel:** Kategori + tittel → dato/tid/sted →
beskrivelse → evt. påmelding/lenke. På desktop til høyre for eller under
kalenderen; på mobil som full-width sheet. Samme struktur for alle eventtyper.

## 12. Forside — anbefalt sidearkitektur

Forsiden svarer raskt på: Hva skjer snart? Hva er nytt? Hvor finner jeg det viktigste?

1. **Hero** — banner_top som inspirasjon/illustrasjonslag. Overskrift og
   ingress er ekte HTML-tekst over/ved siden av bildet, ikke kun tekst bakt inn i bildet.
2. **Tre verdier** — For barna / Sammen / Engasjement. Tre enkle kolonner med
   ikon, kort overskrift og én setning.
3. **Neste arrangement** — ett tydelig hovedkort + «Se alle arrangementer».
   Bilde bare når det finnes et relevant og godt bilde.
4. **Aktuelt + mini-kalender** — 2/3 + 1/3 på desktop. Nyhetsliste venstre,
   liten månedskalender eller neste datoer høyre. Stack på mobil.
5. **Nyttige lenker + banner** — Vigilo, Askøy kommune/barnehage, mat og
   måltider, 100-lista eller andre stabile ressurser. Avslutt med en varm
   illustrasjonsflate før footer.

## 13. Aktuelt, Dokumenter og Kontakt

Tre ulike sidetyper — samme visuelle språk.

- **Aktuelt:** filterchips øverst · 3-kolonne kortgrid desktop · 1 kolonne mobil · dato alltid synlig · bilder 3:2 og konsistent crop.
- **Dokumenter:** søk/filter ved behov · kompakt dokumentliste · type/størrelse som metadata · «Last ned» som tydelig handling · ingen unødvendige thumbnails.
- **Kontakt:** kontaktkort først · skjema maks 600 px bredt · navn/e-post/melding · tydelig send-state · adresse/kart kun dersom nyttig.

**Footer**
- Hvit eller svært lys sand bakgrunn som standard. Mørk footer kan brukes dersom kontrasten testes og resten av siden er lys.
- Logo, kort FAU-beskrivelse, hurtiglenker, Facebook, kontakt og juridiske lenker.
- Footer er ikke en «søppelskuff»; maks 4 tydelige grupper.

## 14. Illustrasjon, foto og bildebruk

- **Stil:** myk håndtegnet natur, dempede grønntoner, varme oransje/korall-detaljer, barn sett i aktivitet eller bakfra.
- **Fotografi:** naturlig lys, ekte aktiviteter, ikke stock-lignende posering. Respekter personvern og samtykke.
- **Miks:** foto + illustrasjon kan fungere i banner/callout, men ikke i alle kort samtidig.
- **Tekst i bilder:** viktig informasjon skal ikke kun finnes i bildefilen. Gjenta teksten som HTML.
- **Cropping:** bevar barn, skilt og sentrale naturdetaljer. Ikke crop slik at ansikter/kropper kuttes unaturlig.

| Bruk | Ratio | Notat |
|---|---|---|
| Hero desktop | ca. 2.4:1 | banner_top passer direkte |
| Bunnbanner | ca. 2:1 | banner_bunn / dekorativ CTA |
| Nyhetskort | 3:2 | `object-fit: cover` |
| Eventkort bilde | 4:3 eller 3:2 | valgfritt |
| Mobil hero | 4:3 / 1:1 utsnitt | alternativ crop, ikke bare center-crop av desktop |

## 15. Responsivitet og motion

Mobil er en fullverdig design, ikke en krympet desktop.

- Prioriter innhold fremfor sidepaneler. Sekundært innhold flyttes under hovedinnholdet.
- Knapper og filterchips kan wrappe; unngå horisontal scroll bortsett fra en bevisst carousel.
- Minste klikkeflate: 44×44 px.
- Månedskalender kan vise forenklede prikker med agenda under valgt dato på mobil.
- Årsvisning kan gå fra 3×4 til 2×6/1×12.
- Hero-illustrasjoner trenger egne crop-posisjoner per breakpoint.
- Skjema skal aldri kreve sideveis zoom.

| Motion | Varighet | Kurve |
|---|---|---|
| Hover / micro | 120–160 ms | ease-out |
| Accordion / filter | 180–220 ms | `cubic-bezier(.2,.8,.2,1)` |
| Panel / sheet | 220–280 ms | `cubic-bezier(.2,.8,.2,1)` |
| Page transitions | unngå | bruk native navigation |

Ved `prefers-reduced-motion: reduce` fjernes ikke-essensiell animasjon eller
reduseres til umiddelbare state-endringer.

## 16. Design tokens — CSS

Tokens er single source of truth; unngå hardkodede farger/spacings i komponenter.

```css
:root {
  --font-ui: 'Manrope', 'Inter', system-ui, sans-serif;
  --color-primary: #0F6B46;
  --color-primary-hover: #0B5438;
  --color-primary-active: #083F2B;
  --color-sage: #B7D3B1;
  --color-green-50: #E8F3E8;
  --color-sand: #F9F6F1;
  --color-peach: #FFE8D8;
  --color-blue-50: #E6F0FA;
  --color-orange: #F4A261;
  --color-red: #E76F51;
  --color-ink: #102A24;
  --color-text: #364742;
  --color-muted: #6F7D78;
  --color-border: #DCE6E1;
  --color-surface: #FCFDFB;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;
  --space-16: 64px; --space-20: 80px;
  --container: 1200px;
  --shadow-card: 0 4px 18px rgba(16,42,36,.06);
  --shadow-panel: 0 18px 50px rgba(16,42,36,.14);
}
```

**Anbefalte komponentnavn:** SiteHeader, MobileNav, HeroBanner, SectionHeader,
Button, IconButton, FilterChip, SegmentedControl, EventCard, WeekCard,
EventRow, MonthCalendar, YearCalendar, NewsCard, DocumentRow, InfoBanner,
ContactCard, FormField, SelectField, Modal/Sheet, SiteFooter.

## 17. Implementeringskontrakt

1. Treat this guide as the visual source of truth.
2. Preserve current information architecture and data/content behavior unless explicitly asked to change it.
3. Use semantic HTML and accessible interactive elements.
4. Use the CSS design tokens from this guide; do not hardcode one-off colors or spacing values.
5. Build reusable components for navigation, filters, cards, calendar views, document rows and forms.
6. Calendar must retain List / Month / Year. List is week-first and the primary public view.
7. Keep editor/admin controls visually separated and hidden from non-editors.
8. Implement responsive behavior for mobile, tablet and desktop — do not merely scale desktop down.
9. Important text must remain real HTML text even when a supplied banner image includes similar text.
10. Do not use color alone to convey calendar category or status.
11. Maintain visible keyboard focus and support `prefers-reduced-motion`.
12. Before finishing, verify all pages at 375px, 768px, 1024px and 1440px widths.

**Akseptansekriterier**
- Header og footer er konsistente på alle sider.
- Hjem, Aktuelt, Kalender, Dokumenter og Kontakt bruker samme tokens og komponentfamilie.
- Ingen horisontal scroll ved 375 px, med unntak av eksplisitt definert kontroll der alternativ finnes.
- Listekalender er uke-for-uke og gjeldende uke er visuelt tydelig.
- Måneds- og årsvisning er fortsatt tilgjengelig og funksjonell.
- Alle filtre er tastaturbetjenbare og states er synlige uten kun farge.
- Bannere har robust responsive crop og viktig tekst finnes i DOM.
- Kontrast og focus states kontrolleres før release.
- Komponenter har loading/empty/error state der det er relevant.

## 18. QA-sjekkliste før publisering

- **Visuelt:** sammenlign side for side mot guiden · primærgrønn ikke overbrukt · konsekvent radius, spacing og korttetthet.
- **Responsivt:** 375 / 430 / 768 / 1024 / 1440 px · ingen klippet tekst eller uleselige kalenderceller · hero-illustrasjoner cropper riktig.
- **Tilgjengelighet:** keyboard gjennom hele siden · synlig focus på alle controls · kontrast testet · alt-tekst eller dekorativ `alt=""` etter formål.
- **Funksjon:** kalender Liste/Måned/År · filtre og barnehageår · nedlasting av dokumenter · kontaktskjema-states · redaktørverktøy kun for autorisert bruker.
- **Ytelse:** komprimer bilder · responsive `srcset`/`sizes` · lazy-load under fold · unngå fontvekter som ikke brukes.

**Sluttmål:** Nettsiden skal oppleves roligere, mer moderne og mer helhetlig,
samtidig som kalenderens informasjonsrikdom bevares — enklere for foreldre å
finne det som gjelder akkurat nå, uten at års- og månedsoversikten forsvinner.

## 19. Dark mode — designprinsipp

Dark mode er samme visuelle identitet under andre lysforhold — ikke en direkte
invertering av light mode.

**Hovedregel:** Behold det varme, skandinaviske og familievennlige uttrykket.
Tydelig overflatehierarki, varm off-white tekst og kontrollert bruk av sage,
fersken, blått og amber — ikke bare mørkegrønt overalt.

**Mål**
- Redusere lysbelastning uten å miste den varme merkevaren.
- Skille tydelig mellom sidebakgrunn, seksjon, kort og aktiv state.
- Beholde illustrasjonene som varme «vinduer av lys» i den mørke UI-en.
- Sikre at bodytekst, metadata og kalenderdata er komfortable å lese.
- La sekundærpaletten fortsatt skille Kalender, Dokumenter, Kontakt og Aktuelt.

**Unngå**
- Ren svart bakgrunn eller ren hvit tekst som gir hard kontrast.
- At alle flater får nesten samme mørkegrønne tone.
- At light-mode-illustrasjoner tones så hardt ned at de mister karakter.
- At adminverktøy får mer visuell vekt enn offentlig innhold.
- At dark mode ser ut som et teknisk tema i stedet for et ferdig design.

**Temaadferd**
- Støtt både systempreferanse (`prefers-color-scheme`) og manuelt tema-valg.
- Et eksplisitt brukervalg overstyrer systempreferanse og huskes lokalt.
- Sett tema før første paint for å unngå flash av feil tema.
- Theme-toggle har tydelig `aria-label` og synlig fokusstate.

## 20. Dark mode — farger og tokens

| Navn | Hex | Bruk |
|---|---|---|
| Bakgrunn | `#091A15` | Sidebakgrunn |
| Surface | `#10251E` | Kort / hovedflate |
| Raised | `#162D24` | Hover / løftet kort |
| Soft surface | `#1A3429` | Info / seksjon |
| Border | `#29483B` | Separator / border |
| Tekst | `#F5F2EA` | Overskrift / body |
| Muted | `#B8C5BF` | Sekundær tekst |
| Subtle | `#8FA29A` | Metadata |
| Primary | `#67D49A` | CTA / aktiv |
| Sage dark | `#173128` | Grønne heroer |
| Peach dark | `#3B2720` | Kontakt / varm tone |
| Blue dark | `#172B36` | Dokumenter / info |

**Aksenter og kategorifarger i dark mode** (swatches i PDF-en, uten hex-label):
Arrangement `#F28C79` · Møte `#6FA8FF` · Dugnad `#67D49A` · Foto `#A78BFA` ·
Varmmat `#F4B774` · Stengt `#FF7A7A`.

**Kontrastkrav:** `#F5F2EA` på `#091A15` gir svært høy kontrast. `#B8C5BF` og
`#8FA29A` kan brukes til sekundærtekst/metadata, men små tekster skal
kontrolleres mot WCAG. Primær `#67D49A` brukes normalt med mørk tekst når den
er fylt knapp.

## 21. Dark mode — komponenter og sider

Komponentfamilien er den samme som i light mode; forskjellen ligger i
flatehierarki, kontrast og bevisst bruk av sekundærfargene.

- **Header og footer:** Header `#0D211A` / subtil border. Footer `#10251E`
  eller `#0D211A`. Logo og navigasjon skal ha mer visuell vekt.
- **Kort:** Standard `#10251E`, hover/raised `#162D24`, 1 px `#29483B`.
  Luminans og border fremfor tunge skygger.
- **Knapper:** Primær fylt `#67D49A` med `#091A15` tekst. Sekundær transparent
  med `#67D49A` border/tekst. Focus-ring 3 px.
- **PageHero:** Behold sideidentitet: Kalender = sage dark, Dokumenter = blue
  dark, Kontakt = peach dark. Ikke gjør alle heroer grønne.
- **Aktuelt:** Editorial hierarki: én fremhevet sak + sekundære kort. Ikke et
  ensartet grid av like mørke rektangler.
- **Dokumenter:** Listen kan være kompakt og mørk, men heroen skal oppleves
  tydelig blå/slate med relevant illustrasjon.
- **Kontakt:** Mørk fersken/terracotta hero og kontaktillustrasjonen.
  Inputfelt tydelig lysere/mørkere enn sidebakgrunnen.
- **Admin / redaktør:** Egen, dempet toolbar, gjerne collapsible. Offentlig UX dominerer visuelt.

**Moderne uttrykk:** romslig, presis og moderne — større typografi, tydeligere
containers, færre men mer meningsfulle kort og et bevisst editorial preg.
Unngå «admin-dashboard»-følelse på offentlige sider.

## 22. Dark mode — bilder, kalender og tilgjengelighet

Illustrasjoner beholder varme og identitet. Kalenderen har høyere flatekontrast
enn resten av siden fordi den er et arbeidsområde.

**Bildebehandling**
- Ikke legg global kraftig dimming på illustrasjoner.
- Ved svært lys himmel: 6–12 % mørk overlay eller smartere crop. *(Dette repoet
  bruker egne nattegnede versjoner i stedet — ingen overlay over dem.)*
- Bevar varme detaljer — illustrasjonene fungerer som «windows of light».
- Hovedskilt bruker alltid: FOR BARNA / SAMMEN / ENGASJEMENT.
- «Små mennesker, store dager» er sekundær tagline.

**Kalender — anbefalt dark-hierarki**

| Lag | Hex |
|---|---|
| Page | `#091A15` |
| Calendar container | `#10251E` |
| Cells | `#122920` |
| Hover | `#193429` |
| Grid | `#28453A` |
| Today / selected | `#67D49A` |

Måneds- og årsvisning skal fortsatt føles som kalender, ikke generiske kort.
Eventfarger får lysere dark-mode-varianter, og farge er aldri eneste signal.

**Tilgjengelighet**
- Normal tekst minst 4.5:1. Små metadata ofres ikke for en «subtil» estetikk.
- UI-komponenter, focus og meningsbærende grafikk minst 3:1 mot nærliggende farge.
- Focus-ring synlig både på `#091A15` og `#10251E`.
- Respekter `prefers-reduced-motion` og `prefers-color-scheme`.
- Test light og dark separat — god kontrast i light mode garanterer ikke god dark mode.

## 23. Dark mode — CSS og implementeringskontrakt

Én token-override for temaet; ingen tilfeldige dark-mode-farger per komponent.
(I repoet ligger dette i `.dark`-blokken i `client/src/index.css`.)

```css
[data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #091A15;
  --color-surface: #10251E;
  --color-surface-raised: #162D24;
  --color-surface-soft: #1A3429;
  --color-border: #29483B;
  --color-ink: #F5F2EA;
  --color-text: #F5F2EA;
  --color-muted: #B8C5BF;
  --color-subtle: #8FA29A;
  --color-primary: #67D49A;
  --color-primary-hover: #7DDFAB;
  --color-sage-surface: #173128;
  --color-peach-surface: #3B2720;
  --color-blue-surface: #172B36;
  --color-orange: #F4B774;
  --color-red: #F28C79;
  --shadow-card: none;
}
```

**Implementeringskrav**
- Én theme root / token override — ikke separate hardkodede komponentpaletter.
- Systemtema brukes bare når brukeren ikke har valgt eksplisitt light/dark.
- Persist tema-valg og unngå flash ved initial render.
- Test Hjem, Aktuelt, Kalender Liste/Måned/År, Dokumenter og Kontakt i begge tema.
- Dark mode bevarer sidefargene: sage / blue / peach i mørke varianter.
- Alle gamle illustrasjoner med LEK / MESTRING / GLEDE eller andre tilfeldige
  verdier erstattes med FOR BARNA / SAMMEN / ENGASJEMENT.
- Illustrasjoner gjøres ikke grå eller sterkt mørklagte; crop og svært subtil overlay ved behov.
- QA ved 375, 430, 768, 1024 og 1440 px i både light og dark.

## 24. Moderne uttrykk — refinement guardrails

Gjelder begge tema, og hindrer at designet ender som et lite, generisk admin-dashboard.

- **Skala og container:** Desktop hovedcontainer normalt 1120–1200 px. Ikke la
  store skjermer stå igjen med enorme, passive marginer. Bodytekst rundt 16 px;
  metadata vanligvis minst 13–14 px.
- **Hero-system:** 2–3 bevisste PageHero-varianter (Split / Editorial /
  Compact). Illustrasjonene får reell visuell vekt, men viktig tekst er HTML.
- **Forside:** Større hero, tydeligere verdier, komprimert Praktisk
  informasjon. Detaljert styreoversikt hører hjemme på Kontakt/Om FAU.
- **Aktuelt:** Mer editorial: fremhevet sak + sekundære kort, gjerne med
  bilder. Unngå database-grid av identiske tekstkort.
- **Kalender:** Behold uke-først Liste + Måned + År. Mer desktopbredde, større
  celler og tydeligere arbeidsflate. Kalenderen er en kjernefunksjon.
- **Dokumenter og Kontakt:** Dokumentlisten er enkel, men heroen har
  personlighet. Kontakt bruker den kontaktspesifikke illustrasjonen fremfor tilfeldig naturcrop.
- **Verdier og skilt:** Offisielle verdier i skilt og profilgrafikk er alltid
  FOR BARNA / SAMMEN / ENGASJEMENT. Forklarende verdi-tekst vises som HTML.
- **Adminverktøy:** Redaktørverktøy er sekundære/collapsible. Brukere skal
  oppleve en moderne offentlig nettside, ikke et CMS-grensesnitt.

**Sluttmål:** Tydelig moderne, varm og gjennomført — moderne typografisk skala,
stor nok desktop-layout, sterke men rolige illustrasjoner og et design som
føles laget for FAU Erdal Barnehage. Ikke bare «den gamle siden med nye farger».
