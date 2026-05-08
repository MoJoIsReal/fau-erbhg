import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

const content = {
  no: {
    title: "Personvern",
    intro: "FAU Erdal Barnehage samler bare inn personopplysninger som trengs for kontakt, arrangementer og drift av FAU-arbeidet.",
    sections: [
      {
        title: "Hva vi lagrer",
        body: "Kontaktskjema kan lagre navn, e-post, telefon, emne og melding. Arrangementspåmelding kan lagre navn, e-post, telefon, antall deltakere, kommentarer og eventuelle barnenavn der det trengs for fotografering eller praktisk gjennomføring."
      },
      {
        title: "Hvorfor vi lagrer det",
        body: "Opplysningene brukes til å svare på henvendelser, administrere påmeldinger, sende nødvendig informasjon om arrangementer og gi FAU-medlemmer tilgang til relevant historikk."
      },
      {
        title: "Sletting",
        body: "Kontakthenvendelser slettes automatisk etter 12 måneder. Arrangementspåmeldinger slettes automatisk 6 måneder etter at arrangementet er gjennomført."
      },
      {
        title: "Tilgang og databehandlere",
        body: "Kun autoriserte FAU-medlemmer har tilgang til admin-sidene. Appen bruker Vercel for hosting, Neon Postgres for database, Cloudinary for dokumentlagring og e-postleverandør for utsendinger."
      },
      {
        title: "Innsyn eller sletting",
        body: "Du kan kontakte FAU dersom du ønsker innsyn, retting eller sletting av opplysninger knyttet til deg."
      }
    ]
  },
  en: {
    title: "Privacy",
    intro: "FAU Erdal Kindergarten only collects personal data needed for contact, events and running the parent committee work.",
    sections: [
      {
        title: "What we store",
        body: "The contact form may store name, email, phone number, subject and message. Event registration may store name, email, phone number, attendee count, comments and child names when needed for photography or practical event handling."
      },
      {
        title: "Why we store it",
        body: "The information is used to respond to messages, administer registrations, send necessary event information and give council members access to relevant history."
      },
      {
        title: "Deletion",
        body: "Contact messages are automatically deleted after 12 months. Event registrations are automatically deleted 6 months after the event has taken place."
      },
      {
        title: "Access and processors",
        body: "Only authorized FAU members can access the admin pages. The app uses Vercel for hosting, Neon Postgres for the database, Cloudinary for document storage and an email provider for outgoing messages."
      },
      {
        title: "Access or deletion requests",
        body: "You can contact FAU if you want access, correction or deletion of information related to you."
      }
    ]
  }
};

export default function Privacy() {
  const { language } = useLanguage();
  const text = content[language];

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
