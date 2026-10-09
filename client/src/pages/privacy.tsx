import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { FAU_EMAIL } from "@shared/constants";

type PrivacySection = {
  title: string;
  body: string;
  link?: { href: string; label: string };
};

type PrivacyText = { title: string; intro: string; sections: PrivacySection[] };

const TURNSTILE_PRIVACY_URL = "https://www.cloudflare.com/turnstile-privacy-policy/";

const content: Record<"no" | "en", PrivacyText> = {
  no: {
    title: "Personvern",
    intro: "FAU Erdal Barnehage samler bare inn personopplysninger som trengs for kontakt, arrangementer, nyhetsbrev, deling av bilder med foreldrene og drift av FAU-arbeidet.",
    sections: [
      {
        title: "Behandlingsansvarlig",
        body: `FAU Erdal Barnehage (foreldrenes arbeidsutvalg) er behandlingsansvarlig for personopplysningene som beskrives her. Du kan kontakte oss på ${FAU_EMAIL} ved spørsmål om personvern.`
      },
      {
        title: "Hva vi lagrer",
        body: "Kontaktskjema kan lagre navn, e-post, telefon, emne og melding. Arrangementspåmelding kan lagre navn, e-post, telefon, antall deltakere, kommentarer og eventuelle barnenavn der det trengs for fotografering eller praktisk gjennomføring."
      },
      {
        title: "Barns opplysninger",
        body: "Ved enkelte arrangementer (for eksempel fotografering) lagrer vi fornavn på barn. Disse oppgis av foresatte ved påmelding, brukes kun til å gjennomføre arrangementet, og slettes sammen med påmeldingen."
      },
      {
        title: "Nyhetsbrev",
        body: "Melder du deg på nyhetsbrevet, lagrer vi e-postadressen din, navnet hvis du oppgir det, og hvilket språk du vil ha det på. Du får først en e-post med en bekreftelseslenke som virker i 7 dager, og vi sender ingenting før du har bekreftet. En påmelding som ikke blir bekreftet, slettes etter 30 dager. For hver utsending lagrer vi hva som ble sendt til deg og om det kom fram; dette slettes etter 90 dager. Hver e-post har en lenke for å melde deg av. Da får du ingen flere e-poster, men adressen står igjen merket som avmeldt – kontakt FAU hvis du vil ha den slettet helt. Grunnlaget er samtykket du gir når du bekrefter påmeldingen."
      },
      {
        title: "Bilder og videoer som deles med foreldrene",
        body: "FAU kan dele bilder, videoer og lydopptak fra barnehagen med foreldrene gjennom en hemmelig lenke, eventuelt med PIN-kode. Opptakene kan vise barn. De lagres i en privat lagringstjeneste hos Cloudflare (R2), er aldri offentlige og kan ikke finnes uten lenken. Før opplasting fjernes posisjon (GPS) og annen metadata fra filene, og bildene som vises i oversikten er små kopier uten slik informasjon. Hver deling slettes automatisk når den utløper, senest 365 dager etter at den ble delt. Når du åpner en deling, brukes IP-adressen din i hashet form til å begrense antall forsøk. Delingssiden har ingen statistikk, feilrapportering eller innhold fra andre nettsteder."
      },
      {
        title: "Hvorfor vi lagrer det, og rettslig grunnlag",
        body: "Opplysningene brukes til å svare på henvendelser, administrere påmeldinger, sende nødvendig informasjon om arrangementer og gi FAU-medlemmer tilgang til relevant historikk. Behandlingen bygger på samtykket du gir når du sender skjemaet, og på FAUs berettigede interesse i å drive foreldrearbeidet (personvernforordningen art. 6 nr. 1 a og f)."
      },
      {
        title: "Sletting",
        body: "Kontakthenvendelser slettes automatisk etter 12 måneder. Arrangementspåmeldinger, og registrerte avmeldinger, slettes automatisk 6 måneder etter at arrangementet er gjennomført. Opplysninger om utsendte nyhetsbrev slettes etter 90 dager, og delte bilder og videoer senest 365 dager etter at de ble delt. For å stoppe misbruk av skjemaene og innloggingen teller vi forsøk per IP-adresse og e-postadresse i hashet form; disse tellerne slettes innen en uke etter at de er utløpt. Når en innlogget bruker endrer eller sletter noe, logger vi hvilken konto som gjorde det og hva som ble endret (bare ID-er, ikke innholdet); loggen slettes etter 12 måneder."
      },
      {
        title: "Tilgang og databehandlere",
        body: "Kun autoriserte FAU-medlemmer har tilgang til admin-sidene. Appen bruker Vercel for hosting og anonym besøksstatistikk, Neon Postgres for database, Cloudinary for dokumentlagring, Cloudflare for sikkerhetssjekken på skjemaene og for lagring av delte bilder og videoer, Sentry for feilrapporter og Google (Gmail) for utsending av e-post. Disse opptrer som databehandlere på våre vegne."
      },
      {
        title: "Sikkerhetssjekk på skjemaene",
        body: "Skjemaene for arrangementspåmelding, kontakt og nyhetsbrev bruker Cloudflare Turnstile for å skille mennesker fra automatiserte roboter. Turnstile behandler tekniske opplysninger fra nettleseren din, som IP-adresse og nettleserdata, og brukes bare til denne kontrollen. Cloudflare behandler opplysningene på våre vegne, og som selvstendig behandlingsansvarlig for å forbedre Turnstiles robotgjenkjenning. Grunnlaget er vår berettigede interesse i å beskytte skjemaene mot misbruk.",
        link: { href: TURNSTILE_PRIVACY_URL, label: "Cloudflares personvernvedlegg for Turnstile" }
      },
      {
        title: "Feilrapporter og besøksstatistikk",
        body: "Når noe går galt på nettstedet, sendes en feilrapport til Sentry slik at vi kan rette feilen. Rapportene renses for e-postadresser, telefonnumre og hemmelige lenker før de sendes, og skjermen din blir ikke tatt opp. Vercel Analytics gir oss anonym statistikk over hvilke sider som besøkes, uten informasjonskapsler. Grunnlaget er vår berettigede interesse i å holde nettstedet i drift."
      },
      {
        title: "Informasjonskapsler",
        body: "Vi bruker ikke informasjonskapsler til sporing eller markedsføring. For FAU-medlemmer som logger inn, settes tre nødvendige informasjonskapsler: selve innloggingen (varer i 2 timer), en sikkerhetsnøkkel som beskytter mot forfalskede forespørsler, og en som husker at nettleseren har vært logget inn før (180 dager), slik at ingen andre kan sperre deg ute fra kontoen. I nettleseren din lagres også språkvalg, lyst eller mørkt tema og hvordan du har filtrert kalenderen."
      },
      {
        title: "Dine rettigheter",
        body: "Du har rett til innsyn i, retting av og sletting av opplysninger om deg, samt rett til å protestere mot eller begrense behandlingen og til dataportabilitet. Kontakt FAU for å bruke rettighetene dine."
      },
      {
        title: "Klage",
        body: "Mener du at vi behandler opplysninger i strid med regelverket, kan du klage til Datatilsynet (datatilsynet.no)."
      }
    ]
  },
  en: {
    title: "Privacy",
    intro: "FAU Erdal Kindergarten only collects personal data needed for contact, events, the newsletter, sharing photos with parents and running the parent committee work.",
    sections: [
      {
        title: "Data controller",
        body: `FAU Erdal Kindergarten (the parents' committee) is the data controller for the personal data described here. You can contact us at ${FAU_EMAIL} with any privacy questions.`
      },
      {
        title: "What we store",
        body: "The contact form may store name, email, phone number, subject and message. Event registration may store name, email, phone number, attendee count, comments and child names when needed for photography or practical event handling."
      },
      {
        title: "Children's data",
        body: "For some events (for example photography) we store children's first names. These are provided by parents/guardians during registration, used only to run the event, and deleted together with the registration."
      },
      {
        title: "Newsletter",
        body: "If you sign up for the newsletter, we store your email address, your name if you give it, and the language you want it in. You first receive an email with a confirmation link that works for 7 days, and we send nothing until you have confirmed. A signup that is never confirmed is deleted after 30 days. For each mailing we store what was sent to you and whether it was delivered; this is deleted after 90 days. Every email has a link to unsubscribe. You then receive no more emails, but the address stays marked as unsubscribed – contact FAU if you want it deleted completely. Our basis is the consent you give when you confirm the signup."
      },
      {
        title: "Photos and videos shared with parents",
        body: "FAU may share photos, videos and audio recordings from the kindergarten with parents through a secret link, optionally with a PIN code. The recordings may show children. They are stored in a private storage service at Cloudflare (R2), are never public and cannot be found without the link. Location (GPS) and other metadata are removed from the files before upload, and the pictures shown in the overview are small copies without such information. Each share is deleted automatically when it expires, at the latest 365 days after it was shared. When you open a share, your IP address is used in hashed form to limit the number of attempts. The share page has no statistics, error reporting or content from other websites."
      },
      {
        title: "Why we store it, and legal basis",
        body: "The information is used to respond to messages, administer registrations, send necessary event information and give council members access to relevant history. Processing relies on the consent you give when submitting a form, and on FAU's legitimate interest in running the parent committee work (GDPR art. 6(1)(a) and (f))."
      },
      {
        title: "Deletion",
        body: "Contact messages are automatically deleted after 12 months. Event registrations, and recorded cancellations, are automatically deleted 6 months after the event has taken place. Records of sent newsletters are deleted after 90 days, and shared photos and videos at the latest 365 days after they were shared. To stop abuse of the forms and the login, we count attempts per IP address and email address in hashed form; these counters are deleted within a week after they expire. When a signed-in user changes or deletes something, we log which account did it and what was changed (ids only, not the content); this log is deleted after 12 months."
      },
      {
        title: "Access and processors",
        body: "Only authorized FAU members can access the admin pages. The app uses Vercel for hosting and anonymous visit statistics, Neon Postgres for the database, Cloudinary for document storage, Cloudflare for the security check on forms and for storing shared photos and videos, Sentry for error reports and Google (Gmail) for sending email. These act as data processors on our behalf."
      },
      {
        title: "Security check on forms",
        body: "The event signup, contact and newsletter forms use Cloudflare Turnstile to tell people from automated bots. Turnstile processes technical data from your browser, such as your IP address and browser details, only for this check. Cloudflare processes this data on our behalf, and as an independent controller to improve Turnstile's bot detection. Our basis is our legitimate interest in protecting the forms from abuse.",
        link: { href: TURNSTILE_PRIVACY_URL, label: "Cloudflare's Turnstile Privacy Addendum" }
      },
      {
        title: "Error reports and visit statistics",
        body: "When something goes wrong on the site, an error report is sent to Sentry so we can fix it. Reports are stripped of email addresses, phone numbers and secret links before they are sent, and your screen is not recorded. Vercel Analytics gives us anonymous statistics on which pages are visited, without cookies. Our basis is our legitimate interest in keeping the site running."
      },
      {
        title: "Cookies",
        body: "We do not use cookies for tracking or marketing. For FAU members who sign in, three necessary cookies are set: the login itself (lasts 2 hours), a security key that protects against forged requests, and one that remembers that the browser has signed in before (180 days), so nobody else can lock you out of your account. Your browser also stores your language choice, light or dark theme, and how you have filtered the calendar."
      },
      {
        title: "Your rights",
        body: "You have the right to access, rectify and erase data about you, as well as to object to or restrict processing and to data portability. Contact FAU to exercise your rights."
      },
      {
        title: "Complaints",
        body: "If you believe we process data unlawfully, you can lodge a complaint with the Norwegian Data Protection Authority (datatilsynet.no)."
      }
    ]
  }
};

export default function Privacy() {
  const { language } = useLanguage();
  const text = content[language];

  usePageMeta({
    title: text.title,
    description:
      language === "no"
        ? "Slik behandler FAU Erdal Barnehage personopplysninger: hva vi lagrer, hvorfor, lagringstid og dine rettigheter."
        : "How FAU Erdal Kindergarten handles personal data: what we store, why, retention and your rights.",
    path: "/personvern",
  });

  // A legal page is prose, not a dashboard: one column at a readable measure,
  // sections separated by rules rather than wrapped in a card.
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-h1 font-bold tracking-tight text-ink">{text.title}</h1>
      <p className="mt-4 text-body-lg text-copy">{text.intro}</p>

      <div className="mt-10 divide-y divide-hairline">
        {text.sections.map((section) => (
          <section key={section.title} className="py-6 first:pt-0">
            <h2 className="text-h4 font-bold text-ink">{section.title}</h2>
            <p className="mt-2 text-copy">{section.body}</p>
            {section.link && (
              <p className="mt-2 text-copy">
                <a href={section.link.href} className="font-semibold text-brand underline underline-offset-2">
                  {section.link.label}
                </a>
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
