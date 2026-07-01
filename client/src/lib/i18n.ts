export type Language = 'no' | 'en';

export interface Translations {
  // Navigation
  navigation: {
    home: string;
    updates: string;
    news: string;
    tips: string;
    events: string;
    contact: string;
    documents: string;
    more: string;
    yearlyCalendar: string;
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
    registrationDeadline: string;
    registrationClosed: string;
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
  // Newsletter ("nyhetsbrev")
  newsletter: {
    navTitle: string;
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    nameLabel: string;
    namePlaceholder: string;
    subscribe: string;
    subscribing: string;
    consent: string;
    successTitle: string;
    successDesc: string;
    errorTitle: string;
    errorDesc: string;
    confirmPendingTitle: string;
    confirmSuccessTitle: string;
    confirmSuccessDesc: string;
    confirmErrorTitle: string;
    confirmErrorDesc: string;
    unsubPendingTitle: string;
    unsubSuccessTitle: string;
    unsubSuccessDesc: string;
    unsubErrorTitle: string;
    unsubErrorDesc: string;
    footerLink: string;
    admin: {
      title: string;
      description: string;
      email: string;
      status: string;
      subscribed: string;
      statusPending: string;
      statusActive: string;
      statusUnsubscribed: string;
      activeCount: string;
      noSubscribers: string;
      delete: string;
      deleteConfirm: string;
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
    passwordChange: {
      title: string;
      description: string;
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      save: string;
      saving: string;
      success: string;
      error: string;
      mismatch: string;
      tooShort: string;
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
      registrationDeadlineLabel: string;
      registrationDeadlineHint: string;
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
        foto: string;
      };
      locations: {
        erdal: string;
        digitalt: string;
        annet: string;
      };
    };
    eventEdit: {
      title: string;
      description: string;
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
    privacy: string;
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
  // Settings
  settings: {
    roles: {
      leder: string;
      medlem: string;
      vara: string;
    };
  };
  // Yearly calendar (Årskalender)
  yearlyCalendar: {
    title: string;
    subtitle: string;
    schoolYearLabel: string;
    downloadAllPdf: string;
    downloadMonthPdf: string;
    downloadTemplate: string;
    importExcel: string;
    pdfGenerating: string;
    pdfErrorTitle: string;
    pdfErrorDescription: string;
    excelTemplateErrorTitle: string;
    excelTemplateErrorDescription: string;
    addEntry: string;
    noEntries: string;
    currentAndUpcomingMonths: string;
    currentAndUpcomingMonthsDescription: string;
    pastMonths: string;
    pastMonthsDescription: string;
    currentMonthBadge: string;
    pastMonthBadge: string;
    thisWeekBadge: string;
    todayBadge: string;
    week: string;
    weekHeader: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    notes: string;
    tagline: string;
    entryTypes: {
      weekEvent: string;
      dayEvent: string;
      food: string;
      note: string;
      closed: string;
    };
    months: {
      january: string;
      february: string;
      march: string;
      april: string;
      may: string;
      june: string;
      july: string;
      august: string;
      september: string;
      october: string;
      november: string;
      december: string;
    };
    modal: {
      addTitle: string;
      editTitle: string;
      type: string;
      title: string;
      description: string;
      weekNumber: string;
      weekNumberEnd: string;
      date: string;
      color: string;
      colorHint: string;
      showOnHomepage: string;
      showOnHomepageHint: string;
      showForParents: string;
      showForParentsHint: string;
      notifyNewsletter: string;
      notifyNewsletterHint: string;
      save: string;
      saving: string;
      delete: string;
      cancel: string;
      deleteConfirm: string;
      success: string;
      error: string;
    };
    importModal: {
      title: string;
      chooseFile: string;
      preview: string;
      commit: string;
      commitValidRows: string;
      committing: string;
      cancel: string;
      newEntries: string;
      unchangedEntries: string;
      changedEntries: string;
      invalidRows: string;
      ambiguousRows: string;
      updateExisting: string;
      createNew: string;
      ignore: string;
      oldValue: string;
      newValue: string;
      noFile: string;
      previewError: string;
      importSuccess: string;
      importError: string;
      partialImportTitle: string;
      partialImportDescription: string;
      validationErrorsFromServer: string;
      unknownValidationError: string;
      emptyValue: string;
      validation: {
        missingTitle: string;
        titleTooLong: string;
        descriptionTooLong: string;
        invalidEntryType: string;
        invalidYear: string;
        invalidMonth: string;
        monthOutsideSchoolYear: string;
        invalidColor: string;
        invalidBoolean: string;
        dateRequired: string;
        dateMismatch: string;
        weekRequired: string;
        weekEndRange: string;
        weekEndAfterStart: string;
      };
      fields: {
        schoolYear: string;
        year: string;
        month: string;
        entryType: string;
        title: string;
        description: string;
        color: string;
        weekNumber: string;
        weekNumberEnd: string;
        date: string;
        showOnHomepage: string;
        showForParents: string;
      };
    };
    inKindergartenBadge: string;
    forParentsBadge: string;
    closedBadge: string;
    colors: {
      red: string;
      yellow: string;
      green: string;
      orange: string;
      blue: string;
      pink: string;
      purple: string;
      none: string;
    };
    staff: {
      manageTitle: string;
      manageDescription: string;
      addStaff: string;
      username: string;
      name: string;
      role: string;
      roleFau: string;
      roleKindergarten: string;
      create: string;
      creating: string;
      existingStaff: string;
      noStaff: string;
      delete: string;
      deleteConfirm: string;
      successCreate: string;
      errorCreate: string;
      emailSent: string;
    };
  };
}

export const translations: Record<Language, Translations> = {
  no: {
    navigation: {
      home: "Hjem",
      updates: "Aktuelt",
      news: "Nyheter",
      tips: "Tips & triks",
      events: "Arrangementer",
      contact: "Kontakt",
      documents: "Dokumenter",
      more: "Mer",
      yearlyCalendar: "Årskalender"
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
      getInvolvedDescription: "Det finnes mange måter å engasjere seg på i FAU:",
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
      upcomingEvents: "Hva skjer fremover",
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
      registrationDeadline: "Påmeldingsfrist",
      registrationClosed: "Påmeldingsfristen er utløpt",
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
      subtitle: "Ta kontakt med FAU for spørsmål, forslag eller tilbakemeldinger",
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
    newsletter: {
      navTitle: "Nyhetsbrev",
      title: "Meld deg på nyhetsbrevet",
      subtitle: "Få påminnelser på e-post om kommende arrangementer i barnehagen og aktiviteter for barn og foreldre.",
      emailLabel: "E-post",
      emailPlaceholder: "din@epost.no",
      nameLabel: "Navn (valgfritt)",
      namePlaceholder: "Navn Navnesen",
      subscribe: "Meld meg på",
      subscribing: "Melder på...",
      consent: "Vi bruker e-postadressen din kun til å sende påminnelser fra FAU. Du kan melde deg av når som helst via lenken nederst i hver e-post.",
      successTitle: "Sjekk e-posten din",
      successDesc: "Vi har sendt deg en bekreftelseslenke. Klikk på den for å fullføre påmeldingen.",
      errorTitle: "Noe gikk galt",
      errorDesc: "Kunne ikke fullføre påmeldingen. Prøv igjen senere.",
      confirmPendingTitle: "Bekrefter påmelding...",
      confirmSuccessTitle: "Påmelding bekreftet!",
      confirmSuccessDesc: "Takk! Du vil nå motta påminnelser fra FAU Erdal Barnehage.",
      confirmErrorTitle: "Ugyldig eller utløpt lenke",
      confirmErrorDesc: "Bekreftelseslenken er ugyldig eller allerede brukt. Prøv å melde deg på på nytt.",
      unsubPendingTitle: "Melder deg av...",
      unsubSuccessTitle: "Du er nå avmeldt",
      unsubSuccessDesc: "Du vil ikke lenger motta nyhetsbrev fra FAU Erdal Barnehage.",
      unsubErrorTitle: "Noe gikk galt",
      unsubErrorDesc: "Kunne ikke melde deg av. Prøv igjen senere.",
      footerLink: "📧 Meld deg på nyhetsbrev",
      admin: {
        title: "Nyhetsbrev-abonnenter",
        description: "Foreldre som har bekreftet påmelding til nyhetsbrevet. Påminnelser sendes automatisk dagen før arrangementer som er huket av.",
        email: "E-post",
        status: "Status",
        subscribed: "Påmeldt",
        statusPending: "Venter på bekreftelse",
        statusActive: "Aktiv",
        statusUnsubscribed: "Avmeldt",
        activeCount: "aktive abonnenter",
        noSubscribers: "Ingen abonnenter ennå.",
        delete: "Slett abonnent",
        deleteConfirm: "Dette fjerner abonnenten permanent."
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
      passwordChange: {
        title: "Endre passord",
        description: "Passordet ditt må endres før du kan bruke innloggede funksjoner. Passord må oppdateres minst en gang i året.",
        currentPassword: "Nåværende passord",
        newPassword: "Nytt passord",
        confirmPassword: "Gjenta nytt passord",
        save: "Lagre passord",
        saving: "Lagrer...",
        success: "Passordet er oppdatert",
        error: "Kunne ikke endre passord",
        mismatch: "Passordene er ikke like",
        tooShort: "Passordet må være minst 12 tegn"
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
        registrationDeadlineLabel: "Påmeldingsfrist",
        registrationDeadlineHint: "La stå tomt hvis påmelding skal være åpen fram til arrangementet.",
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
          annet: "Annet",
          foto: "Foto"
        },
        locations: {
          erdal: "Erdal Barnehage",
          digitalt: "Digitalt",
          annet: "Annet"
        }
      },
      eventEdit: {
        title: "Rediger arrangement",
        description: "Oppdater arrangementets detaljer"
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
      nextMeeting: "Neste Arrangement",
      parentMeeting: "FAU-møte",
      privacy: "Personvern",
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
    },
    settings: {
      roles: {
        leder: "Leder",
        medlem: "Medlem",
        vara: "Vara"
      }
    },
    yearlyCalendar: {
      title: "Årskalender",
      subtitle: "Hva skjer i barnehagen måned for måned",
      schoolYearLabel: "Barnehageår",
      downloadAllPdf: "Last ned PDF (hele året)",
      downloadMonthPdf: "Last ned måned",
      downloadTemplate: "Last ned Excel-mal",
      importExcel: "Importer Excel",
      pdfGenerating: "Genererer PDF…",
      pdfErrorTitle: "Klarte ikke å lage PDF",
      pdfErrorDescription: "Noe gikk galt under generering av PDF-en. Prøv igjen om litt.",
      excelTemplateErrorTitle: "Klarte ikke å laste ned Excel-mal",
      excelTemplateErrorDescription: "Noe gikk galt under nedlasting av Excel-malen. Prøv igjen om litt.",
      addEntry: "Legg til",
      noEntries: "Ingenting registrert ennå.",
      currentAndUpcomingMonths: "Denne og kommende måneder",
      currentAndUpcomingMonthsDescription: "Her ligger måneden vi er i nå og resten av barnehageåret fremover.",
      pastMonths: "Måneder som er forbi",
      pastMonthsDescription: "Tidligere måneder er samlet her, med den nyeste først.",
      currentMonthBadge: "Denne måneden",
      pastMonthBadge: "Forbi",
      thisWeekBadge: "Denne uken",
      todayBadge: "I dag",
      week: "Uke",
      weekHeader: "Uke",
      monday: "Mandag",
      tuesday: "Tirsdag",
      wednesday: "Onsdag",
      thursday: "Torsdag",
      friday: "Fredag",
      notes: "Notater",
      tagline: "Kunsten å være sammen i lekens magiske verden",
      entryTypes: {
        weekEvent: "Hele uken",
        dayEvent: "Dag",
        food: "Ukens varmmat",
        note: "Notat",
        closed: "Stengt"
      },
      months: {
        january: "Januar",
        february: "Februar",
        march: "Mars",
        april: "April",
        may: "Mai",
        june: "Juni",
        july: "Juli",
        august: "August",
        september: "September",
        october: "Oktober",
        november: "November",
        december: "Desember"
      },
      modal: {
        addTitle: "Ny oppføring",
        editTitle: "Rediger oppføring",
        type: "Type",
        title: "Tittel",
        description: "Beskrivelse",
        weekNumber: "Fra uke",
        weekNumberEnd: "Til uke (valgfri)",
        date: "Dato",
        color: "Farge",
        colorHint: "Standardfarge bestemmes av type. Velg en farge her kun for spesielle unntak.",
        showOnHomepage: "Vis på hjemmesiden (I barnehagen)",
        showOnHomepageHint: "Vises under \"Kommende arrangementer\" på forsiden, merket \"I barnehagen\".",
        showForParents: "Vis på hjemmesiden (For foreldre)",
        showForParentsHint: "Vises under \"Kommende arrangementer\" på forsiden, merket \"For foreldre\".",
        notifyNewsletter: "Send påminnelse på nyhetsbrev",
        notifyNewsletterHint: "Dagen før sendes beskrivelsen som påminnelse på e-post til alle påmeldte nyhetsbrev-abonnenter.",
        save: "Lagre",
        saving: "Lagrer...",
        delete: "Slett",
        cancel: "Avbryt",
        deleteConfirm: "Er du sikker på at du vil slette denne oppføringen?",
        success: "Oppføring lagret",
        error: "Kunne ikke lagre oppføringen"
      },
      importModal: {
        title: "Importer årskalender fra Excel",
        chooseFile: "Velg Excel-fil",
        preview: "Forhåndsvis",
        commit: "Importer",
        commitValidRows: "Importer gyldige rader",
        committing: "Importerer...",
        cancel: "Avbryt",
        newEntries: "Nye oppføringer",
        unchangedEntries: "Uendrede oppføringer",
        changedEntries: "Endrede oppføringer",
        invalidRows: "Ugyldige rader",
        ambiguousRows: "Usikre treff",
        updateExisting: "Oppdater eksisterende",
        createNew: "Opprett ny",
        ignore: "Ignorer",
        oldValue: "Gammel verdi",
        newValue: "Ny verdi",
        noFile: "Velg en Excel-fil først.",
        previewError: "Kunne ikke forhåndsvise importen",
        importSuccess: "Importen er fullført",
        importError: "Kunne ikke importere årskalenderen",
        partialImportTitle: "Importen ble delvis fullført",
        partialImportDescription: "Noen rader kan være importert, mens andre feilet. Åpne importen på nytt og forhåndsvis filen igjen før du prøver på nytt.",
        validationErrorsFromServer: "Raden har valideringsfeil fra serveren:",
        unknownValidationError: "Raden har en valideringsfeil fra serveren:",
        emptyValue: "(tom)",
        validation: {
          missingTitle: "Rad {row}: Mangler tittel.",
          titleTooLong: "Rad {row}: Tittel kan maksimalt være 200 tegn.",
          descriptionTooLong: "Rad {row}: Beskrivelse kan maksimalt være 1000 tegn.",
          invalidEntryType: "Rad {row}: Ugyldig type \"{value}\". Bruk en av: {allowed}.",
          invalidYear: "Rad {row}: År må være et heltall.",
          invalidMonth: "Rad {row}: Måned må være et heltall mellom 1 og 12.",
          monthOutsideSchoolYear: "Rad {row}: {month} ligger utenfor barnehageåret {schoolYear}.",
          invalidColor: "Rad {row}: Fargen \"{value}\" er ikke tillatt. Bruk en av: {allowed}.",
          invalidBoolean: "Rad {row}: {field} må være true/false, ja/nei, yes/no eller 1/0.",
          dateRequired: "Rad {row}: {type} krever dato i format YYYY-MM-DD innenfor barnehageåret {schoolYear}.",
          dateMismatch: "Rad {row}: Dato {date} samsvarer ikke med år/måned.",
          weekRequired: "Rad {row}: {type} krever uke_fra mellom 1 og 53.",
          weekEndRange: "Rad {row}: uke_til må være mellom 1 og 53.",
          weekEndAfterStart: "Rad {row}: uke_til må være høyere enn uke_fra."
        },
        fields: {
          schoolYear: "Barnehageår",
          year: "År",
          month: "Måned",
          entryType: "Type",
          title: "Tittel",
          description: "Beskrivelse",
          color: "Farge",
          weekNumber: "Fra uke",
          weekNumberEnd: "Til uke",
          date: "Dato",
          showOnHomepage: "Vis på hjemmesiden",
          showForParents: "For foreldre"
        }
      },
      inKindergartenBadge: "I barnehagen",
      forParentsBadge: "For foreldre",
      closedBadge: "Stengt",
      colors: {
        red: "Rød",
        yellow: "Gul",
        green: "Grønn",
        orange: "Oransje",
        blue: "Blå",
        pink: "Rosa",
        purple: "Lilla",
        none: "Ingen"
      },
      staff: {
        manageTitle: "Brukere",
        manageDescription: "Opprett FAU-medlemmer og barnehageansatte. Systemet sender midlertidig passord på e-post og brukeren må endre passord ved første innlogging.",
        addStaff: "Opprett bruker",
        username: "Brukernavn (e-post)",
        name: "Navn",
        role: "Rolle",
        roleFau: "FAU-Medlem",
        roleKindergarten: "Barnehageansatt",
        create: "Opprett",
        creating: "Oppretter...",
        existingStaff: "Eksisterende brukere",
        noStaff: "Ingen brukere ennå.",
        delete: "Slett",
        deleteConfirm: "Slette denne brukeren?",
        successCreate: "Bruker opprettet",
        errorCreate: "Kunne ikke opprette bruker",
        emailSent: "Innloggingsdetaljer er sendt på e-post"
      }
    }
  },
  en: {
    navigation: {
      home: "Home",
      updates: "Updates",
      news: "News",
      tips: "Tips & Tricks",
      events: "Events",
      contact: "Contact",
      documents: "Documents",
      more: "More",
      yearlyCalendar: "Yearly calendar"
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
      upcomingEvents: "What's coming up",
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
      registrationDeadline: "Registration deadline",
      registrationClosed: "Registration deadline has passed",
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
    newsletter: {
      navTitle: "Newsletter",
      title: "Subscribe to the newsletter",
      subtitle: "Get email reminders about upcoming events at the kindergarten and activities for children and parents.",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      nameLabel: "Name (optional)",
      namePlaceholder: "John Doe",
      subscribe: "Subscribe",
      subscribing: "Subscribing...",
      consent: "We use your email address only to send reminders from FAU. You can unsubscribe at any time via the link at the bottom of every email.",
      successTitle: "Check your email",
      successDesc: "We have sent you a confirmation link. Click it to complete your subscription.",
      errorTitle: "Something went wrong",
      errorDesc: "Could not complete the subscription. Please try again later.",
      confirmPendingTitle: "Confirming subscription...",
      confirmSuccessTitle: "Subscription confirmed!",
      confirmSuccessDesc: "Thank you! You will now receive reminders from FAU Erdal Kindergarten.",
      confirmErrorTitle: "Invalid or expired link",
      confirmErrorDesc: "The confirmation link is invalid or already used. Please try subscribing again.",
      unsubPendingTitle: "Unsubscribing...",
      unsubSuccessTitle: "You have been unsubscribed",
      unsubSuccessDesc: "You will no longer receive newsletters from FAU Erdal Kindergarten.",
      unsubErrorTitle: "Something went wrong",
      unsubErrorDesc: "Could not unsubscribe you. Please try again later.",
      footerLink: "📧 Subscribe to newsletter",
      admin: {
        title: "Newsletter subscribers",
        description: "Parents who have confirmed their newsletter subscription. Reminders are sent automatically the day before flagged events.",
        email: "Email",
        status: "Status",
        subscribed: "Subscribed",
        statusPending: "Awaiting confirmation",
        statusActive: "Active",
        statusUnsubscribed: "Unsubscribed",
        activeCount: "active subscribers",
        noSubscribers: "No subscribers yet.",
        delete: "Delete subscriber",
        deleteConfirm: "This permanently removes the subscriber."
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
      passwordChange: {
        title: "Change password",
        description: "You must change your password before using signed-in features. Passwords must be updated at least once a year.",
        currentPassword: "Current password",
        newPassword: "New password",
        confirmPassword: "Confirm new password",
        save: "Save password",
        saving: "Saving...",
        success: "Password updated",
        error: "Could not change password",
        mismatch: "Passwords do not match",
        tooShort: "Password must be at least 12 characters"
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
        registrationDeadlineLabel: "Registration deadline",
        registrationDeadlineHint: "Leave empty if registration should stay open until the event.",
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
          annet: "Other",
          foto: "Photo"
        },
        locations: {
          erdal: "Erdal Kindergarten",
          digitalt: "Digital",
          annet: "Other"
        }
      },
      eventEdit: {
        title: "Edit event",
        description: "Update the event details"
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
      nextMeeting: "Next Event",
      parentMeeting: "FAU meeting",
      privacy: "Privacy",
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
    },
    settings: {
      roles: {
        leder: "Leader",
        medlem: "Member",
        vara: "Deputy"
      }
    },
    yearlyCalendar: {
      title: "Yearly calendar",
      subtitle: "What's happening at the kindergarten, month by month",
      schoolYearLabel: "Kindergarten year",
      downloadAllPdf: "Download PDF (whole year)",
      downloadMonthPdf: "Download month",
      downloadTemplate: "Download Excel template",
      importExcel: "Import Excel",
      pdfGenerating: "Generating PDF…",
      pdfErrorTitle: "Could not generate PDF",
      pdfErrorDescription: "Something went wrong while generating the PDF. Please try again in a moment.",
      excelTemplateErrorTitle: "Could not download Excel template",
      excelTemplateErrorDescription: "Something went wrong while downloading the Excel template. Please try again in a moment.",
      addEntry: "Add entry",
      noEntries: "Nothing scheduled yet.",
      currentAndUpcomingMonths: "This and upcoming months",
      currentAndUpcomingMonthsDescription: "This section starts with the current month and continues through the rest of the kindergarten year.",
      pastMonths: "Past months",
      pastMonthsDescription: "Earlier months are collected here, with the most recent first.",
      currentMonthBadge: "This month",
      pastMonthBadge: "Past",
      thisWeekBadge: "This week",
      todayBadge: "Today",
      week: "Week",
      weekHeader: "Week",
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      notes: "Notes",
      tagline: "The art of being together in the magical world of play",
      entryTypes: {
        weekEvent: "All week",
        dayEvent: "Day",
        food: "Hot meal of the week",
        note: "Note",
        closed: "Closed"
      },
      months: {
        january: "January",
        february: "February",
        march: "March",
        april: "April",
        may: "May",
        june: "June",
        july: "July",
        august: "August",
        september: "September",
        october: "October",
        november: "November",
        december: "December"
      },
      modal: {
        addTitle: "New entry",
        editTitle: "Edit entry",
        type: "Type",
        title: "Title",
        description: "Description",
        weekNumber: "From week",
        weekNumberEnd: "To week (optional)",
        date: "Date",
        color: "Color",
        colorHint: "Default colour is determined by entry type. Pick a colour here only for special exceptions.",
        showOnHomepage: "Show on homepage (At the kindergarten)",
        showOnHomepageHint: "Appears under \"Upcoming events\" on the front page, marked \"At the kindergarten\".",
        showForParents: "Show on homepage (For parents)",
        showForParentsHint: "Appears under \"Upcoming events\" on the front page, marked \"For parents\".",
        notifyNewsletter: "Send newsletter reminder",
        notifyNewsletterHint: "The day before, the description is emailed as a reminder to all confirmed newsletter subscribers.",
        save: "Save",
        saving: "Saving...",
        delete: "Delete",
        cancel: "Cancel",
        deleteConfirm: "Are you sure you want to delete this entry?",
        success: "Entry saved",
        error: "Could not save the entry"
      },
      importModal: {
        title: "Import yearly calendar from Excel",
        chooseFile: "Choose Excel file",
        preview: "Preview",
        commit: "Import",
        commitValidRows: "Import valid rows",
        committing: "Importing...",
        cancel: "Cancel",
        newEntries: "New entries",
        unchangedEntries: "Unchanged entries",
        changedEntries: "Changed entries",
        invalidRows: "Invalid rows",
        ambiguousRows: "Ambiguous rows",
        updateExisting: "Update existing",
        createNew: "Create new",
        ignore: "Ignore",
        oldValue: "Old value",
        newValue: "New value",
        noFile: "Choose an Excel file first.",
        previewError: "Could not preview the import",
        importSuccess: "Import completed",
        importError: "Could not import yearly calendar",
        partialImportTitle: "Import partially completed",
        partialImportDescription: "Some rows may have been imported while others failed. Reopen import and preview the file again before retrying.",
        validationErrorsFromServer: "Row has validation errors from the server. Detailed server message:",
        unknownValidationError: "Row has a validation error from the server:",
        emptyValue: "(empty)",
        validation: {
          missingTitle: "Row {row}: Missing title.",
          titleTooLong: "Row {row}: Title can be at most 200 characters.",
          descriptionTooLong: "Row {row}: Description can be at most 1000 characters.",
          invalidEntryType: "Row {row}: Invalid type \"{value}\". Use one of: {allowed}.",
          invalidYear: "Row {row}: Year must be an integer.",
          invalidMonth: "Row {row}: Month must be an integer between 1 and 12.",
          monthOutsideSchoolYear: "Row {row}: {month} is outside kindergarten year {schoolYear}.",
          invalidColor: "Row {row}: Color \"{value}\" is not allowed. Use one of: {allowed}.",
          invalidBoolean: "Row {row}: {field} must be true/false, yes/no, ja/nei, or 1/0.",
          dateRequired: "Row {row}: {type} requires a date in YYYY-MM-DD format within kindergarten year {schoolYear}.",
          dateMismatch: "Row {row}: Date {date} does not match year/month.",
          weekRequired: "Row {row}: {type} requires uke_fra between 1 and 53.",
          weekEndRange: "Row {row}: uke_til must be between 1 and 53.",
          weekEndAfterStart: "Row {row}: uke_til must be higher than uke_fra."
        },
        fields: {
          schoolYear: "Kindergarten year",
          year: "Year",
          month: "Month",
          entryType: "Type",
          title: "Title",
          description: "Description",
          color: "Color",
          weekNumber: "From week",
          weekNumberEnd: "To week",
          date: "Date",
          showOnHomepage: "Show on homepage",
          showForParents: "For parents"
        }
      },
      inKindergartenBadge: "At the kindergarten",
      forParentsBadge: "For parents",
      closedBadge: "Closed",
      colors: {
        red: "Red",
        yellow: "Yellow",
        green: "Green",
        orange: "Orange",
        blue: "Blue",
        pink: "Pink",
        purple: "Purple",
        none: "None"
      },
      staff: {
        manageTitle: "Users",
        manageDescription: "Create FAU members and kindergarten employee users. The system emails a temporary password and the user must change it on first login.",
        addStaff: "Create user",
        username: "Username (email)",
        name: "Name",
        role: "Role",
        roleFau: "FAU member",
        roleKindergarten: "Kindergarten employee",
        create: "Create",
        creating: "Creating...",
        existingStaff: "Existing users",
        noStaff: "No users yet.",
        delete: "Delete",
        deleteConfirm: "Delete this user?",
        successCreate: "User created",
        errorCreate: "Could not create user",
        emailSent: "Login details were sent by email"
      }
    }
  }
};

export function useTranslation(language: Language) {
  return translations[language];
}

export function formatDate(
  dateString: string | number | Date | null | undefined,
  language: Language,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  if (dateString === null || dateString === undefined || dateString === '') return '';
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'no' ? 'no-NO' : 'en-US';
  return date.toLocaleDateString(locale, options);
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
