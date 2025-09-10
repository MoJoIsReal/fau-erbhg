export type Language = 'no' | 'en';

export interface Translations {
  // Navigation
  navigation: {
    information: string;
    events: string;
    contact: string;
    documents: string;
  };
  // Header
  header: {
    title: string;
    subtitle: string;
    login: string;
    logout: string;
    loggingOut: string;
  };
  // Home page
  home: {
    title: string;
    subtitle: string;
    welcomeTitle: string;
    welcomeDescription: string;
    missionTitle: string;
    missionDescription: string;
    valuesTitle: string;
    valuesDescription: string;
    boardTitle: string;
    boardDescription: string;
    getInvolvedTitle: string;
    getInvolvedDescription: string;
    attendMeetings: string;
    attendMeetingsDesc: string;
    volunteerEvents: string;
    volunteerEventsDesc: string;
    shareIdeas: string;
    shareIdeasDesc: string;
    nextMeeting: string;
    moreInfo: string;
    aboutKindergarten: string;
    address: string;
    municipality: string;
    openingHours: string;
    numberOfChildren: string;
    owner: string;
    kindergartenDescription: string;
    fauTitle: string;
    contact: string;
    fauBoard: string;
    leader: string;
    member: string;
    vara: string;
    fauDescription: string;
    upcomingEvents: string;
    noEvents: string;
    safety: string;
    cooperation: string;
    engagement: string;
  };
  // Events page
  events: {
    title: string;
    subtitle: string;
    addEvent: string;
    noEvents: string;
    noEventsDesc: string;
    register: string;
    full: string;
    attendees: string;
    maxAttendees: string;
    unlimited: string;
    location: string;
    time: string;
    date: string;
    cancelled: string;
    viewList: string;
    viewCalendar: string;
    pastEvents: string;
    noPastEvents: string;
    noPastEventsDesc: string;
    viewRegistrations: string;
    edit: string;
    cancel: string;
    delete: string;
  };
  // Contact page  
  contact: {
    title: string;
    subtitle: string;
    name: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
    send: string;
    sending: string;
    success: string;
    successDesc: string;
    error: string;
    errorDesc: string;
    anonymous: string;
    anonymousDesc: string;
    contactMethod: string;
    fauContact: string;
    fauContactDesc: string;
    kindergartenContact: string;
    kindergartenContactDesc: string;
    subjectPlaceholder: string;
    selectSubject: string;
    subjects: {
      anonymous: string;
      general: string;
      concern: string;
      feedback: string;
    };
  };
  // Documents page
  documents: {
    title: string;
    subtitle: string;
    upload: string;
    uploadDocument: string;
    uploadDescription: string;
    uploadSuccess: string;
    uploadSuccessDesc: string;
    uploadError: string;
    uploadErrorDesc: string;
    documentType: string;
    selectType: string;
    fileName: string;
    fileNamePlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    uploadedByLabel: string;
    uploadedByPlaceholder: string;
    dragDropText: string;
    orClickToSelect: string;
    maxFileSize: string;
    categories: {
      protocol: string;
      protocolDesc: string;
      regulations: string;
      regulationsDesc: string;
      budget: string;
      budgetDesc: string;
    };
    noDocuments: string;
    noDocumentsDesc: string;
    download: string;
    uploadedBy: string;
    uploadedAt: string;
    fileSize: string;
    seeAll: string;
    recentActivity: string;
    noRecentActivity: string;
  };
  // Modals
  modals: {
    login: {
      title: string;
      email: string;
      password: string;
      cancel: string;
      login: string;
      loggingIn: string;
      membersOnly: string;
      contactInfo: string;
      success: string;
      successDesc: string;
      error: string;
      invalidCredentials: string;
    };

    eventCreation: {
      title: string;
      description: string;
      titleLabel: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      dateLabel: string;
      timeLabel: string;
      locationLabel: string;
      locationPlaceholder: string;
      typeLabel: string;
      maxAttendeesLabel: string;
      maxAttendeesPlaceholder: string;
      customLocationLabel: string;
      customLocationPlaceholder: string;
      cancel: string;
      create: string;
      creating: string;
      success: string;
      successDesc: string;
      error: string;
      errorDesc: string;
      types: {
        meeting: string;
        event: string;
        dugnad: string;
        internal: string;
        annet: string;
      };
      locations: {
        erdal: string;
        digitalt: string;
        annet: string;
      };
    };
    eventRegistration: {
      title: string;
      name: string;
      email: string;
      phone: string;
      attendees: string;
      comments: string;
      commentsPlaceholder: string;
      cancel: string;
      register: string;
      registering: string;
      success: string;
      successDesc: string;
      error: string;
      errorDesc: string;
    };
  };
  // Footer
  footer: {
    description: string;
    contactInfo: string;
    address: string;
    phone: string;
    email: string;
    facebook: string;
    website: string;
    barnehageFakta: string;
    fubLink: string;
    hours: string;
    nextMeeting: string;
    parentMeeting: string;
    copyright: string;
  };
  // Common
  common: {
    loading: string;
    unknownSize: string;
    bytes: string;
    required: string;
    file: string;
    cancel: string;
    upload: string;
    uploading: string;
  };
}

export const translations: Record<Language, Translations> = {
  no: {
    navigation: {
      information: "Informasjon",
      events: "Arrangementer", 
      contact: "Kontakt",
      documents: "Dokumenter"
    },
    header: {
      title: "FAU Erdal Barnehage",
      subtitle: "Foreldrenes arbeidsutvalg",
      login: "FAU-pålogging",
      logout: "Logg ut",
      loggingOut: "Logger ut..."
    },
    home: {
      title: "Velkommen til FAU Erdal Barnehage",
      subtitle: "Sammen skaper vi det beste for våre barn",
      welcomeTitle: "Velkommen til vårt arbeidsutvalg",
      welcomeDescription: "FAU Erdal Barnehage er foreldrenes egen frivillige forening. Vi jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna.",
      missionTitle: "Vårt oppdrag",
      missionDescription: "Som frivillig foreldreforening arbeider vi uavhengig for å fremme foreldrenes syn og interesser i barnehagen.",
      valuesTitle: "Våre verdier",
      valuesDescription: "Samarbeid, kvalitet og barnets beste står i sentrum. Vi tror på åpen dialog mellom foreldre, barnehage og kommune.",
      boardTitle: "Vårt utvalg",
      boardDescription: "FAU består av foreldrerepresentanter som er valgt for å ivareta alle familiers interesser i barnehagen.",
      getInvolvedTitle: "Bli involvert",
      getInvolvedDescription: "Det finnes mange måter å engasjere seg på i foreldrerådet:",
      attendMeetings: "Delta på møter",
      attendMeetingsDesc: "Kom på våre månedlige møter og vær med på beslutninger",
      volunteerEvents: "Bidra på arrangementer", 
      volunteerEventsDesc: "Hjelp til med dugnader og sosiale aktiviteter",
      shareIdeas: "Del dine ideer",
      shareIdeasDesc: "Kom med forslag til forbedringer og nye initiativ",
      nextMeeting: "Neste møte",
      moreInfo: "Mer informasjon →",
      aboutKindergarten: "Om Barnehagen",
      address: "Kontakt:",
      municipality: "Adresse:",
      openingHours: "Åpningstider:",
      numberOfChildren: "Antall barn:",
      owner: "Eier:",
      kindergartenDescription: "Erdal barnehage er en kommunal barnehage på Askøy som tilbyr et trygt og stimulerende miljø for barn. Barnehagen har fokus på utvikling gjennom lek og læring i naturskjønne omgivelser.",
      fauTitle: "Foreldrenes arbeidsutvalg (FAU)",
      contact: "Kontakt:",
      fauBoard: "FAU-styre:",
      leader: "Leder:",
      member: "Medlem:",
      vara: "Vara:",
      fauDescription: "Foreldrenes arbeidsutvalg (FAU) er foreldrenes egen frivillige forening. Vi jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna i barnehagen.",
      upcomingEvents: "Kommende Arrangement",
      noEvents: "Ingen Planlagte Arrangement",
      safety: "Trygghet",
      cooperation: "Samarbeid",
      engagement: "Engasjement"
    },
    events: {
      title: "Arrangementer",
      subtitle: "Kommende aktiviteter og møter i FAU Erdal Barnehage",
      addEvent: "Legg til arrangement",
      noEvents: "Ingen kommende arrangementer",
      noEventsDesc: "Sjekk tilbake senere for oppdateringer om kommende aktiviteter og møter.",
      register: "Meld deg på",
      full: "Fullt",
      attendees: "påmeldte",
      maxAttendees: "maks",
      unlimited: "ubegrenset",
      location: "Sted",
      time: "Tid", 
      date: "Dato",
      cancelled: "Avlyst",
      viewList: "Liste",
      viewCalendar: "Kalender",
      pastEvents: "Tidligere arrangementer",
      noPastEvents: "Ingen tidligere arrangementer",
      noPastEventsDesc: "Det er ingen tidligere arrangementer å vise.",
      viewRegistrations: "Se påmeldte",
      edit: "Rediger",
      cancel: "Avlys",
      delete: "Slett"
    },
    contact: {
      title: "Kontakt oss",
      subtitle: "Ta kontakt med foreldrerådet for spørsmål, forslag eller tilbakemeldinger",
      name: "Navn",
      email: "E-post",
      phone: "Telefon",
      subject: "Emne", 
      message: "Melding",
      send: "Send melding",
      sending: "Sender...",
      success: "Melding sendt!",
      successDesc: "Takk for din henvendelse. Vi tar kontakt så snart som mulig.",
      error: "Feil ved sending",
      errorDesc: "Kunne ikke sende meldingen. Prøv igjen senere.",
      anonymous: "Send anonym melding",
      anonymousDesc: "Send melding uten å oppgi kontaktinformasjon",
      contactMethod: "Velg kontaktmetode",
      fauContact: "FAU Erdal Barnehage",
      fauContactDesc: "Kontakt for foreldrerepresentantene",
      kindergartenContact: "Erdal Barnehage",
      kindergartenContactDesc: "Hovedkontakt for barnehagen",
      subjectPlaceholder: "Velg et emne",
      selectSubject: "Vennligst velg et emne",
      subjects: {
        anonymous: "Anonym Henvendelse",
        general: "Generell Henvendelse",
        concern: "Bekymring",
        feedback: "Tilbakemelding"
      }
    },
    documents: {
      title: "Dokumenter",
      subtitle: "Møtereferater, vedtekter og andre viktige dokumenter",
      upload: "Last opp dokument",
      uploadDocument: "Last opp dokument",
      uploadDescription: "Last opp dokumenter som møtereferat, budsjett eller andre viktige filer.",
      uploadSuccess: "Dokument lastet opp!",
      uploadSuccessDesc: "Dokumentet er nå tilgjengelig for alle.",
      uploadError: "Feil ved opplasting",
      uploadErrorDesc: "Kunne ikke laste opp dokumentet. Prøv igjen senere.",
      documentType: "Dokumenttype",
      selectType: "Velg type",
      fileName: "Filnavn/Tittel",
      fileNamePlaceholder: "Skriv inn tittel",
      description: "Beskrivelse",
      descriptionPlaceholder: "Kort beskrivelse av dokumentet...",
      uploadedByLabel: "Ditt navn",
      uploadedByPlaceholder: "For hvem laster opp",
      dragDropText: "Dra og slipp filen her, eller",
      orClickToSelect: "klikk for å velge",
      maxFileSize: "Maks filstørrelse: 10MB",
      categories: {
        protocol: "Møtereferater",
        protocolDesc: "Referater fra møter",
        regulations: "Vedtekter", 
        regulationsDesc: "Vedtekter og retningslinjer",
        budget: "Årsplaner & Annet",
        budgetDesc: "Årsplaner og andre dokumenter"
      },
      noDocuments: "Ingen dokumenter funnet",
      noDocumentsDesc: "Det er ingen dokumenter i denne kategorien ennå.",
      download: "Last ned",
      uploadedBy: "Lastet opp av",
      uploadedAt: "Dato",
      fileSize: "Ukjent størrelse",
      seeAll: "Se alle",
      recentActivity: "Nylig aktivitet",
      noRecentActivity: "Ingen nylig aktivitet"
    },
    modals: {
      login: {
        title: "Logg inn som FAU-medlem",
        email: "E-post",
        password: "Passord", 
        cancel: "Avbryt",
        login: "Logg inn",
        loggingIn: "Logger inn...",
        membersOnly: "Kun for FAU-medlemmer",
        contactInfo: "Kontakt andre styremedlemmer hvis du trenger tilgang",
        success: "Innlogging vellykket",
        successDesc: "Du er nå logget inn som FAU-medlem",
        error: "Innlogging feilet",
        invalidCredentials: "Ugyldig brukernavn eller passord"
      },

      eventCreation: {
        title: "Opprett nytt arrangement",
        description: "Fyll ut skjemaet for å opprette et nytt arrangement eller møte.",
        titleLabel: "Tittel",
        titlePlaceholder: "Navn på arrangementet",
        descriptionLabel: "Beskrivelse",
        descriptionPlaceholder: "Beskriv arrangementet...",
        dateLabel: "Dato",
        timeLabel: "Klokkeslett",
        locationLabel: "Sted",
        locationPlaceholder: "Velg sted",
        typeLabel: "Type arrangement",
        maxAttendeesLabel: "Maks deltakere",
        maxAttendeesPlaceholder: "La stå tom for ubegrenset",
        customLocationLabel: "Egen adresse",
        customLocationPlaceholder: "Skriv inn adresse...",
        cancel: "Avbryt",
        create: "Opprett arrangement",
        creating: "Oppretter...",
        success: "Arrangement opprettet!",
        successDesc: "Det nye arrangementet er nå tilgjengelig for påmelding.",
        error: "Feil ved opprettelse",
        errorDesc: "Kunne ikke opprette arrangementet. Prøv igjen senere.",
        types: {
          meeting: "Møte",
          event: "Arrangement",
          dugnad: "Dugnad",
          internal: "Internt",
          annet: "Annet"
        },
        locations: {
          erdal: "Erdal Barnehage",
          digitalt: "Digitalt",
          annet: "Annet"
        }
      },
      eventRegistration: {
        title: "Meld deg på arrangement",
        name: "Navn",
        email: "E-post",
        phone: "Telefon",
        attendees: "Antall deltakere",
        comments: "Kommentarer",
        commentsPlaceholder: "Eventuelle kommentarer eller spesielle behov...",
        cancel: "Avbryt",
        register: "Meld deg på",
        registering: "Melder på...",
        success: "Påmelding vellykket!",
        successDesc: "Du er nå påmeldt arrangementet.",
        error: "Feil ved påmelding",
        errorDesc: "Kunne ikke melde deg på. Prøv igjen senere."
      }
    },
    footer: {
      description: "Foreldrenes arbeidsutvalg (FAU) er foreldrenes egen frivillige organisasjon som jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna i barnehagen.",
      contactInfo: "Informasjon",
      address: "",
      phone: "",
      email: "✉️ fauerdalbarnehage@gmail.com",
      facebook: "👥 Facebook-gruppe for foreldre",
      website: "🌐 Erdal Barnehage nettside",
      barnehageFakta: "📊 Barnehage Fakta - informasjon",
      fubLink: "FUB - Råd og veiledning for foreldre",
      hours: "",
      nextMeeting: "Neste møte",
      parentMeeting: "FAU-møte",
      copyright: "© 2025 FAU Erdal Barnehage. Alle rettigheter reservert."
    },
    common: {
      loading: "Laster...",
      unknownSize: "Ukjent størrelse",
      bytes: "Bytes",
      required: "påkrevd",
      file: "Fil",
      cancel: "Avbryt",
      upload: "Last opp",
      uploading: "Laster opp..."
    }
  },
  en: {
    navigation: {
      information: "Information",
      events: "Events",
      contact: "Contact", 
      documents: "Documents"
    },
    header: {
      title: "FAU Erdal Kindergarten",
      subtitle: "Parents' Council Working Committee",
      login: "Council Login",
      logout: "Log out",
      loggingOut: "Logging out..."
    },
    home: {
      title: "Welcome to FAU Erdal Kindergarten",
      subtitle: "Together we create the best for our children",
      welcomeTitle: "Welcome to our parent council",
      welcomeDescription: "FAU Erdal Kindergarten is the parents' own voluntary association. We work to safeguard parents' interests and contribute to a good environment for the children.",
      missionTitle: "Our mission",
      missionDescription: "As a voluntary parent association, we work independently to promote parents' views and interests in the kindergarten.",
      valuesTitle: "Our values", 
      valuesDescription: "Openness, inclusion and quality are central to everything we do. We believe in cooperation and that all parents have something valuable to contribute.",
      boardTitle: "Our board",
      boardDescription: "The parent council consists of engaged parents who are elected to represent all families in the kindergarten.",
      getInvolvedTitle: "Get involved",
      getInvolvedDescription: "There are many ways to get involved in the parent council:",
      attendMeetings: "Attend meetings",
      attendMeetingsDesc: "Come to our monthly meetings and participate in decisions",
      volunteerEvents: "Help with events",
      volunteerEventsDesc: "Assist with work days and social activities",
      shareIdeas: "Share your ideas",
      shareIdeasDesc: "Come up with suggestions for improvements and new initiatives",
      nextMeeting: "Next meeting",
      moreInfo: "More information →",
      aboutKindergarten: "About the Kindergarten",
      address: "Address:",
      municipality: "Address:",
      openingHours: "Opening hours:",
      numberOfChildren: "Number of children:",
      owner: "Owner:",
      kindergartenDescription: "Erdal kindergarten is a municipal kindergarten in Askøy that offers a safe and stimulating environment for children. The kindergarten focuses on development through play and learning in beautiful natural surroundings.",
      fauTitle: "Parents' Council Working Committee (FAU)",
      contact: "Contact:",
      fauBoard: "FAU board:",
      leader: "Leader:",
      member: "Member:",
      vara: "Deputy member:",
      fauDescription: "The Parents' Council Working Committee (FAU) is the parents' own voluntary association. We work to safeguard parents' interests and contribute to a good environment for the children in the kindergarten.",
      upcomingEvents: "Upcoming Events",
      noEvents: "No Scheduled Events",
      safety: "Safety",
      cooperation: "Cooperation",
      engagement: "Engagement"
    },
    events: {
      title: "Events",
      subtitle: "Upcoming activities and meetings at FAU Erdal Kindergarten",
      addEvent: "Add event",
      noEvents: "No upcoming events",
      noEventsDesc: "Check back later for updates on upcoming activities and meetings.",
      register: "Register",
      full: "Full",
      attendees: "registered",
      maxAttendees: "max",
      unlimited: "unlimited",
      location: "Location",
      time: "Time",
      date: "Date",
      cancelled: "Cancelled",
      viewList: "List",
      viewCalendar: "Calendar",
      pastEvents: "Past events",
      noPastEvents: "No past events",
      noPastEventsDesc: "There are no past events to display.",
      viewRegistrations: "View registrations",
      edit: "Edit",
      cancel: "Cancel",
      delete: "Delete"
    },
    contact: {
      title: "Contact us",
      subtitle: "Get in touch with the parent council for questions, suggestions or feedback",
      name: "Name",
      email: "Email",
      phone: "Phone",
      subject: "Subject",
      message: "Message", 
      send: "Send message",
      sending: "Sending...",
      success: "Message sent!",
      successDesc: "Thank you for your inquiry. We will get back to you as soon as possible.",
      error: "Sending error",
      errorDesc: "Could not send the message. Please try again later.",
      anonymous: "Send anonymous message",
      anonymousDesc: "Send message without providing contact information",
      contactMethod: "Select contact method",
      fauContact: "FAU Erdal Kindergarten",
      fauContactDesc: "Contact for parent representatives",
      kindergartenContact: "Erdal Kindergarten",
      kindergartenContactDesc: "Main contact for the kindergarten",
      subjectPlaceholder: "Select a subject",
      selectSubject: "Please select a subject",
      subjects: {
        anonymous: "Anonymous Inquiry",
        general: "General Inquiry",
        concern: "Concern",
        feedback: "Feedback"
      }
    },
    documents: {
      title: "Documents",
      subtitle: "Meeting minutes, bylaws and other important documents",
      upload: "Upload document",
      uploadDocument: "Upload Document",
      uploadDescription: "Upload documents such as meeting minutes, budget or other important files.",
      uploadSuccess: "Document uploaded!",
      uploadSuccessDesc: "The document is now available to everyone.",
      uploadError: "Upload error",
      uploadErrorDesc: "Could not upload the document. Please try again later.",
      documentType: "Document type",
      selectType: "Select type",
      fileName: "Filename/Title",
      fileNamePlaceholder: "Enter title",
      description: "Description",
      descriptionPlaceholder: "Brief description of the document...",
      uploadedByLabel: "Your name",
      uploadedByPlaceholder: "Who is uploading",
      dragDropText: "Drag and drop file here, or",
      orClickToSelect: "click to select",
      maxFileSize: "Max file size: 10MB",
      categories: {
        protocol: "Meeting Minutes",
        protocolDesc: "Meeting records",
        regulations: "Bylaws",
        regulationsDesc: "Guidelines and bylaws",
        budget: "Annual Plans & Other",
        budgetDesc: "Annual plans and other documents"
      },
      noDocuments: "No documents found",
      noDocumentsDesc: "There are no documents in this category yet.",
      download: "Download",
      uploadedBy: "Uploaded by",
      uploadedAt: "Date",
      fileSize: "Unknown size",
      seeAll: "See all",
      recentActivity: "Recent Activity",
      noRecentActivity: "No recent activity"
    },
    modals: {
      login: {
        title: "Log in as council member",
        email: "Email",
        password: "Password",
        cancel: "Cancel",
        login: "Log in",
        loggingIn: "Logging in...",
        membersOnly: "Council members only",
        contactInfo: "Contact other board members if you need access",
        success: "Login successful",
        successDesc: "You are now logged in as a council member",
        error: "Login failed",
        invalidCredentials: "Invalid username or password"
      },

      eventCreation: {
        title: "Create new event",
        description: "Fill out the form to create a new event or meeting.",
        titleLabel: "Title",
        titlePlaceholder: "Event name",
        descriptionLabel: "Description",
        descriptionPlaceholder: "Describe the event...",
        dateLabel: "Date",
        timeLabel: "Time",
        locationLabel: "Location",
        locationPlaceholder: "Select location",
        typeLabel: "Event type",
        maxAttendeesLabel: "Max attendees",
        maxAttendeesPlaceholder: "Leave empty for unlimited",
        customLocationLabel: "Custom address",
        customLocationPlaceholder: "Enter address...",
        cancel: "Cancel",
        create: "Create event",
        creating: "Creating...",
        success: "Event created!",
        successDesc: "The new event is now available for registration.",
        error: "Creation error",
        errorDesc: "Could not create the event. Please try again later.",
        types: {
          meeting: "Meeting",
          event: "Event",
          dugnad: "Volunteer work",
          internal: "Internal",
          annet: "Other"
        },
        locations: {
          erdal: "Erdal Kindergarten",
          digitalt: "Digital",
          annet: "Other"
        }
      },
      eventRegistration: {
        title: "Register for event",
        name: "Name",
        email: "Email",
        phone: "Phone",
        attendees: "Number of attendees",
        comments: "Comments",
        commentsPlaceholder: "Any comments or special needs...",
        cancel: "Cancel",
        register: "Register",
        registering: "Registering...",
        success: "Registration successful!",
        successDesc: "You are now registered for the event.",
        error: "Registration error",
        errorDesc: "Could not register you. Please try again later."
      }
    },
    footer: {
      description: "The parent working committee (FAU) is the parents' own voluntary organization that works to safeguard parents' interests and contribute to a good environment for the children in the kindergarten.",
      contactInfo: "Information",
      address: "",
      phone: "",
      email: "✉️ fauerdalbarnehage@gmail.com", 
      facebook: "👥 Facebook group for parents",
      website: "🌐 Erdal Kindergarten website",
      barnehageFakta: "📊 Barnehage Fakta - information",
      fubLink: "FUB - Advice and guidance for parents",
      hours: "",
      nextMeeting: "Next meeting",
      parentMeeting: "FAU meeting",
      copyright: "© 2025 FAU Erdal Kindergarten. All rights reserved."
    },
    common: {
      loading: "Loading...",
      unknownSize: "Unknown size",
      bytes: "Bytes",
      required: "required",
      file: "File",
      cancel: "Cancel",
      upload: "Upload",
      uploading: "Uploading..."
    }
  }
};

export function useTranslation(language: Language) {
  return translations[language];
}

export function formatDate(dateString: string, language: Language): string {
  const locale = language === 'no' ? 'no-NO' : 'en-US';
  return new Date(dateString).toLocaleDateString(locale, { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

export function formatFileSize(bytes: number | null | undefined, language: Language): string {
  const t = useTranslation(language);
  if (!bytes) return t.documents.fileSize;
  if (bytes === 0) return `0 ${t.common.bytes}`;
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
