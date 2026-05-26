import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { FAU_EMAIL } from "@shared/constants";

const content = {
  no: {
    title: "Personvern",
    intro: "FAU Erdal Barnehage samler bare inn personopplysninger som trengs for kontakt, arrangementer og drift av FAU-arbeidet.",
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
        title: "Hvorfor vi lagrer det, og rettslig grunnlag",
        body: "Opplysningene brukes til å svare på henvendelser, administrere påmeldinger, sende nødvendig informasjon om arrangementer og gi FAU-medlemmer tilgang til relevant historikk. Behandlingen bygger på samtykket du gir når du sender skjemaet, og på FAUs berettigede interesse i å drive foreldrearbeidet (personvernforordningen art. 6 nr. 1 a og f)."
      },
      {
        title: "Sletting",
        body: "Kontakthenvendelser slettes automatisk etter 12 måneder. Arrangementspåmeldinger slettes automatisk 6 måneder etter at arrangementet er gjennomført."
      },
      {
        title: "Tilgang og databehandlere",
        body: "Kun autoriserte FAU-medlemmer har tilgang til admin-sidene. Appen bruker Vercel for hosting, Neon Postgres for database, Cloudinary for dokumentlagring og e-postleverandør for utsendinger. Disse opptrer som databehandlere på våre vegne."
      },
      {
        title: "Informasjonskapsler",
        body: "Vi bruker ikke informasjonskapsler til sporing eller markedsføring. Nettstedet lagrer kun et språkvalg lokalt i nettleseren din, og en innloggingskapsel for FAU-medlemmer som logger inn."
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
    intro: "FAU Erdal Kindergarten only collects personal data needed for contact, events and running the parent committee work.",
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
        title: "Why we store it, and legal basis",
        body: "The information is used to respond to messages, administer registrations, send necessary event information and give council members access to relevant history. Processing relies on the consent you give when submitting a form, and on FAU's legitimate interest in running the parent committee work (GDPR art. 6(1)(a) and (f))."
      },
      {
        title: "Deletion",
        body: "Contact messages are automatically deleted after 12 months. Event registrations are automatically deleted 6 months after the event has taken place."
      },
      {
        title: "Access and processors",
        body: "Only authorized FAU members can access the admin pages. The app uses Vercel for hosting, Neon Postgres for the database, Cloudinary for document storage and an email provider for outgoing messages. These act as data processors on our behalf."
      },
      {
        title: "Cookies",
        body: "We do not use cookies for tracking or marketing. The site only stores a language preference locally in your browser, plus a login cookie for FAU members who sign in."
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-3xl text-neutral-900 dark:text-neutral-50 mb-2">
          {text.title}
        </h2>
        <p className="text-neutral-600 dark:text-neutral-300 max-w-3xl">
          {text.intro}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {text.sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h3 className="font-heading text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                {section.title}
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {section.body}
              </p>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
