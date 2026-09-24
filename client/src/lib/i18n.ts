export type Language = 'no' | 'en';

export interface Translations {
  dataState: { unavailable: string; staleHint: string; retry: string; loading: string };
  calendarWorkspace: {
    editHint: string;
    allEntries: string;
    allEntriesHint: string;
    wholeMonth: string;
    addDay: string;
    addWeek: string;
    addNote: string;
    jumpMonth: string;
    downloadHint: string;
    weekdayStart: string;
    weekdayEnd: string;
    placementError: string;
    pdfDetails: string;
    pdfDetailsHint: string;
    pdfPrintEdition: string;
  };
  entryEditor: {
    intro: string;
    content: string;
    schedule: string;
    publishing: string;
    signup: string;
    preview: string;
    category: string;
    categoryHint: string;
    homepage: string;
    homepageHint: string;
    calendarOnly: string;
    closedHint: string;
    eventHomepageHint: string;
    advanced: string;
    colorHint: string;
    month: string;
    year: string;
    format: string;
    onsiteSignup: string;
    photoSignupHint: string;
    noSignup: string;
    vigiloSignup: string;
    internalSignup: string;
    updated: string;
    update: string;
    saving: string;
    error: string;
    addressError: string;
    placeSmall: string;
    placeLarge: string;
    placeMeeting: string;
    placeOutside: string;
    categories: { bhgdag: string; arrangement: string; family: string; info: string; internt: string };
  };

  // Navigation
  navigation: {
    home: string;
    updates: string;
    calendar: string;
    contact: string;
    documents: string;
  };
  // Shared chrome: skip link, menus, footer groups. Anything that appears
  // on more than one page and belongs to no single one.
  ui: {
    skipToContent: string;
    menu: string;
    quickLinks: string;
    externalLink: string;
    account: string;
    appearance: string;
    editorTools: string;
    aboutFau: string;
  };
  // Header
  header: {
    overview: string;
    content: string;
    messages: string;
    settings: string;
    switchLightMode: string;
    switchDarkMode: string;
    lightMode: string;
    darkMode: string;
    title: string;
    subtitle: string;
    login: string;
    logout: string;
    loggingOut: string;
  };
  // Home page
  home: {
    home: string;
    updates: string;
    tipsTricks: string;
    news: string;
    by: string;
    readMore: string;
    loadingInformation: string;
    title: string;
    welcomeDescription: string;
    valuesTitle: string;
    moreInfo: string;
    aboutKindergarten: string;
    municipality: string;
    openingHours: string;
    fauTitle: string;
    fauBoard: string;
    leader: string;
    member: string;
    vara: string;
    fauDescription: string;
    upcomingEvents: string;
    seeAllEvents: string;
    noEvents: string;
    heroImageAlt: string;
    heroCalendarCta: string;
    heroContactCta: string;
    valueChildrenTitle: string;
    valueChildrenBody: string;
    valueTogetherTitle: string;
    valueTogetherBody: string;
    valueEngagementTitle: string;
    valueEngagementBody: string;
    nextUpLabel: string;
    comingDates: string;
    openCalendar: string;
    practicalInfo: string;
    boardOnContact: string;
    closingTitle: string;
    closingBody: string;
    closingHand: string;
    closingCta: string;
  };
  // Combined calendar page (events + yearly calendar as tabs)
  calendar: {
    title: string;
    viewLabel: string;
    listView: string;
    monthView: string;
    detailEmpty: string;
    detailPlace: string;
    detailWeek: string;
    detailDeadline: string;
    detailSignup: string;
    noDescription: string;
    allTypes: string;
    allDay: string;
    listHeading: string;
    listIntro: string;
    monthIntro: string;
    pickADay: string;
    tagline: string;
    noEventsThisWeek: string;
    noEventsThisDay: string;
    weeklyFood: string;
    reminderTitle: string;
    reminderBody: string;
    editorLabel: string;
    newEntry: string;
    newPickerHint: string;
    newEventButton: string;
    newEventHint: string;
    newYearlyHint: string;
    staffCannotCreateEvents: string;
    excelScopeNote: string;
    confirmCancelTitle: string;
    confirmCancelBody: string;
    confirmDeleteBody: string;
    week: string;
    thisWeek: string;
    allWeek: string;
    filtersLabel: string;
    withSignup: string;
    noRegistrationsYet: string;
    placesFilled: string;
    showEarlier: string;
    nothingMatches: string;
    noTypesSelected: string;
    endOfList: string;
    loadFailed: string;
    kinds: {
      arrangement: string;
      family: string;
      mote: string;
      dugnad: string;
      foto: string;
      internt: string;
      bhgdag: string;
      varmmat: string;
      temauke: string;
      stengt: string;
      beskjed: string;
      info: string;
    };
    subscribe: string;
    subscribeTitle: string;
    subscribeDescription: string;
    subscribeGoogle: string;
    subscribeApple: string;
    subscribeOutlook: string;
    subscribeUrlLabel: string;
    subscribeUrlHint: string;
    subscribeCopy: string;
    subscribeCopied: string;
    subscribeCopyFailed: string;
    subscribeCopyFailedHint: string;
    subscribeDownload: string;
    subscribeDownloadHint: string;
  };
  // Events page
  events: {
    registrationDeleted: string;
    registrationHasBeenDeleted: string;
    deleteError: string;
    couldNotDeleteRegistration: string;
    loadingRegistrations: string;
    registered: string;
    registrationList: string;
    cancelled: string;
    cancellationList: string;
    cancellationListDesc: string;
    cancelledAt: string;
    downloadExcel: string;
    exportFailed: string;
    people: string;
    deleteRegistration: string;
    deleteRegistration2: string;
    childrenTimeSlots: string;
    comment: string;
    selectDate: string;
    clearDeadline: string;
    sendNewsletterReminder: string;
    eventDeleted: string;
    eventHasBeenDeleted: string;
    cannotDelete: string;
    eventHasRegistrationsCannot: string;
    couldNotDelete: string;
    errorOccurredWhileDeleting: string;
    eventCancelled: string;
    eventHasBeenCancelled: string;
    cancellationError: string;
    registerVigilo: string;
    noSignupRequired: string;
    at: string;
    internalEvent: string;
    cancelled2: string;
    deleteEvent: string;
    more: string;
    previousMonth: string;
    nextMonth: string;
    today: string;
    noRegistrationsYet: string;
    loading: string;
    attendees2: string;
    missingNames: string;
    registerPhotoSession: string;
    eventRegistration: string;
    parentGuardianName: string;
    parentGuardianName2: string;
    numberChildren: string;
    child: string;
    children: string;
    childrenSFirstNames: string;
    register: string;
    full: string;
    attendees: string;
    maxAttendees: string;
    registrationClosed: string;
    time: string;
    date: string;
    viewRegistrations: string;
    edit: string;
    cancel: string;
    delete: string;
  };
  // Contact page  
  contact: {
    title: string;
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
    heroLead: string;
    formTitle: string;
    formLead: string;
    otherWays: string;
  };
  // Newsletter ("nyhetsbrev")
  // Cloudflare Turnstile on the public forms (event signup, contact, newsletter).
  turnstile: {
    label: string;
    notReady: string;
    loadFailed: string;
  };
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
      statusPending: string;
      statusActive: string;
      statusUnsubscribed: string;
      activeCount: string;
      noSubscribers: string;
      delete: string;
      deleteConfirm: string;
    };
  };
  // Self-service cancellation of an event registration (/avmelding)
  registrationCancel: {
    navTitle: string;
    title: string;
    subtitle: string;
    loading: string;
    registeredAs: string;
    attendees: string;
    confirmQuestion: string;
    cancelButton: string;
    cancelling: string;
    successTitle: string;
    successDesc: string;
    closedTitle: string;
    closedDesc: string;
    notFoundTitle: string;
    notFoundDesc: string;
    errorTitle: string;
    errorDesc: string;
    missingTokenDesc: string;
  };
  // Documents page
  documents: {
    documentDeleted: string;
    documentWasDeletedSuccessfully: string;
    error: string;
    delete: string;
    deleteDocument: string;
    cancel: string;
    fileTypeNotAllowed: string;
    fileLargerThan10: string;
    title: string;
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
    dragDropText: string;
    orClickToSelect: string;
    maxFileSize: string;
    removeFile: string;
    categories: {
      protocol: string;
      regulations: string;
      budget: string;
    };
    noDocuments: string;
    noDocumentsDesc: string;
    download: string;
    fileSize: string;
    heroLead: string;
    allCategories: string;
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
      titleLabel: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      dateLabel: string;
      timeLabel: string;
      locationLabel: string;
      locationPlaceholder: string;
      maxAttendeesLabel: string;
      maxAttendeesPlaceholder: string;
      maxAttendeesRange: string;
      registrationDeadlineLabel: string;
      registrationDeadlineHint: string;
      customLocationLabel: string;
      customLocationPlaceholder: string;
      cancel: string;
      create: string;
      success: string;
      errorDesc: string;
      types: {
        foto: string;
      };
      locations: {
        digitalt: string;
        annet: string;
      };
    };
    eventEdit: {
      title: string;
    };
    eventRegistration: {
      success: string;
      successDesc: string;
      error: string;
      errorDesc: string;
    };
  };
  // Footer
  footer: {
    description: string;
    facebook: string;
    website: string;
    barnehageFakta: string;
    fubLink: string;
    usefulLinks: string;
    vigilo: string;
    meals: string;
    privacy: string;
    copyright: string;
  };
  // Common
  common: {
    pageNotFound: string;
    pageNotFoundBody: string;
    goHomePage: string;
    loading: string;
    bytes: string;
    required: string;
    file: string;
    cancel: string;
    upload: string;
    uploading: string;
  };
  // Settings
  // Admin surfaces (dashboard, messages, content editor)
  newsPage: {
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    noSearchResults: string;
    searchResults: string;
    allCategories: string;
    newestFirst: string;
    noPostsYet: string;
    loadingPosts: string;
    couldNotLoadPosts: string;
    newsDescription: string;
    tipsDescription: string;
    loadMoreFailed: string;
    retry: string;
    tipsTricks: string;
    noTipsYet: string;
    loadingTips: string;
    couldNotLoadTips: string;
    news: string;
    noNewsYet: string;
    loadingNews: string;
    couldNotLoadNews: string;
    category: string;
    by: string;
    post: string;
    loading: string;
    postNotFound: string;
    allTips: string;
    allNews: string;
    heroLead: string;
    categoryNews: string;
    categoryTips: string;
    loadMore: string;
    backToList: string;
  };
  adminPage: {
    messages: string;
    newInquiry: string;
    newInquiries: string;
    allHandled: string;
    content: string;
    publishedPost: string;
    publishedPosts: string;
    documents: string;
    uploadedLast30Days: string;
    settings: string;
    boardKindergartenUsers: string;
    newsletterSubscribers: string;
    waiting: string;
    noUpcomingEvents: string;
    registered: string;
    goEvents: string;
  };
  messagesPage: {
    updated: string;
    statusHasBeenUpdated: string;
    error: string;
    couldNotUpdateStatus: string;
    deleted: string;
    messageWasDeleted: string;
    couldNotDeleteMessage: string;
    new: string;
    responded: string;
    archived: string;
    new2: string;
    messages: string;
    filterByStatus: string;
    showAll: string;
    showOnlyThese: string;
    noMessagesYet: string;
    noMessagesWithStatus: string;
    anonymous: string;
    archive: string;
    restore: string;
    deleteMessage: string;
    deleteMessage2: string;
    cancel: string;
    delete: string;
    showLess: string;
    showMore: string;
    by: string;
    reply: string;
    replyTitle: string;
    replySentFromFau: string;
    originalMessage: string;
    yourReply: string;
    replyPlaceholder: string;
    sendReply: string;
    sending: string;
    replySent: string;
    replyWasSent: string;
    couldNotSendReply: string;
    replyRequired: string;
    cannotReplyAnonymous: string;
    sentReply: string;
  };
  contentPage: {
    content: string;
    error: string;
    titleContentRequired: string;
    saved: string;
    postHasBeenSaved: string;
    couldNotSavePost: string;
    updated: string;
    couldNotUpdatePost: string;
    deleted: string;
    postWasDeleted: string;
    couldNotDeletePost: string;
    updatesPosts: string;
    newPost: string;
    filterByStatus: string;
    all: string;
    published: string;
    archived: string;
    searchTitles: string;
    searchTitles2: string;
    title: string;
    postTitle: string;
    writeYourPostHere: string;
    category: string;
    news: string;
    tipsTricks: string;
    publishDate: string;
    writtenBy: string;
    selectAuthor: string;
    save: string;
    cancel: string;
    delete: string;
    deleteBlogPost: string;
    noTitle: string;
    edit: string;
    removeFromHome: string;
    showHome: string;
    sendInNewsletter: string;
    sendInNewsletterHint: string;
    newsletterAlreadySent: string;
    newsletterSentBadge: string;
    newsletterQueuedBadge: string;
    publish: string;
    archive: string;
    by: string;
    archived2: string;
    deletePost: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    heading1: string;
    heading2: string;
    heading3: string;
    bulletList: string;
    numberedList: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    quote: string;
    codeBlock: string;
    link: string;
    image: string;
    undo: string;
    redo: string;
    uploadFailed: string;
    couldNotUploadImage: string;
    addLink: string;
    url: string;
    saveLink: string;
    removeLink: string;
    video: string;
    addVideo: string;
    videoUrl: string;
    insertVideo: string;
    invalidVideoUrl: string;
    invalidVideoUrlDescription: string;
  };
  settings: {
    deleted: string;
    memberWasDeleted: string;
    error: string;
    couldNotDeleteMember: string;
    cannotSave: string;
    saved: string;
    boardMembersHaveBeen: string;
    couldNotSaveChanges: string;
    kindergartenInfoHasBeen: string;
    couldNotSaveInformation: string;
    settings: string;
    fauBoard: string;
    kindergarten: string;
    users: string;
    newsletter: string;
    name: string;
    johnDoe: string;
    role: string;
    selectRole: string;
    deleteMember: string;
    deleteBoardMember: string;
    cancel: string;
    delete: string;
    removeMember: string;
    addMember: string;
    reorderHint: string;
    moveMember: string;
    unnamedMember: string;
    reorder: {
      instructions: string;
      onDragStart: string;
      onDragOver: string;
      onDragOverNoTarget: string;
      onDragEnd: string;
      onDragEndNoTarget: string;
      onDragCancel: string;
    };
    saveChanges: string;
    kindergartenInformation: string;
    contactEmail: string;
    address: string;
    openingHours: string;
    numberChildren: string;
    owner: string;
    directorName: string;
    directorSName: string;
    directorEmail: string;
    directorExampleCom: string;
    description: string;
    discardChanges: string;
    noUnsavedChanges: string;
    roles: {
      leder: string;
      medlem: string;
      vara: string;
    };
  };
  // Yearly calendar (Årskalender)
  yearlyCalendar: {
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
    notes: string;
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
      title: string;
      description: string;
      weekNumber: string;
      weekNumberEnd: string;
      date: string;
      color: string;
      notifyNewsletter: string;
      notifyNewsletterHint: string;
      startTime: string;
      endTime: string;
      timeHint: string;
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
      successDelete: string;
      errorDelete: string;
    };
  };
}

export const translations: Record<Language, Translations> = {
  no: {
    dataState: {
      unavailable: "Opplysningene er ikke tilgjengelige akkurat nå",
      staleHint: "Prøv igjen. Opplysninger som fortsatt vises, kan være ufullstendige eller utdaterte.",
      retry: "Prøv igjen",
      loading: "Laster opplysninger …",
    },
    calendarWorkspace: {
      editHint: "Velg en dato eller uke i måneden for å legge til. Endre dato eller uke i skjemaet for å flytte en oppføring.",
      allEntries: "Månedens oppføringer",
      allEntriesHint: "Alle kalenderoppføringer i måneden, også de som skjules av filtre eller vises sammen med et arrangement.",
      wholeMonth: "Hele måneden",
      addDay: "Legg til på datoen",
      addWeek: "Legg til i uken",
      addNote: "Legg til månedsnotat",
      jumpMonth: "Gå til måned",
      downloadHint: "PDF inkluderer alle oppføringer, uavhengig av filtrene. Barnehageåret går fra august til juli.",
      weekdayStart: "Fra ukedag",
      weekdayEnd: "Til ukedag",
      placementError: "Velg en gyldig dato, måned og uke. Slutt må være etter eller lik start.",
      pdfDetails: "Detaljoversikt",
      pdfDetailsHint: "Lange oppføringer og flere hendelser vises i detaljoversikten etter kalenderen.",
      pdfPrintEdition: "Kalender · utskriftsutgave",
    },
    entryEditor: {
      intro: "Velg innhold, tidspunkt og hvordan oppføringen skal vises.",
      content: "Innhold og kategori",
      schedule: "Tidspunkt",
      publishing: "Synlighet og påminnelse",
      signup: "Påmelding",
      preview: "Slik vises merket",
      category: "Kategori",
      categoryHint: "Samme merking på forsiden og i kalenderen. Interne møter er også synlige for foreldrene.",
      homepage: "Vis på forsiden",
      homepageHint: "Oppføringen vises også under kommende arrangementer.",
      calendarOnly: "Oppføringen er fortsatt synlig i kalenderen.",
      closedHint: "Stengte dager vises alltid på forsiden.",
      eventHomepageHint: "Arrangementet vises på forsiden og i kalenderen, også når det er et internt møte.",
      advanced: "Farge i årsplanen",
      colorHint: "Gjelder bare årsplanen og PDF-en. Forsiden og kalenderen bruker kategoriens farge.",
      month: "Måned",
      year: "År",
      format: "Varighet / oppføringstype",
      onsiteSignup: "Påmelding på nettsiden",
      photoSignupHint: "Foto bruker påmelding med barnas navn og tildelte fototider. På forsiden og i kalenderen vises arrangementet under For barna.",
      noSignup: "Ingen påmelding",
      vigiloSignup: "Påmelding i Vigilo",
      internalSignup: "Interne møter vises offentlig, men har ingen påmelding.",
      updated: "Arrangement oppdatert",
      update: "Lagre endringer",
      saving: "Lagrer …",
      error: "Kunne ikke lagre endringene",
      addressError: "Oppgi en gyldig adresse (minst 5 tegn).",
      placeSmall: "Småbarnsfløyen",
      placeLarge: "Storbarnsfløyen",
      placeMeeting: "Møterom",
      placeOutside: "Ute",
      categories: {
          bhgdag: "For barna",
          arrangement: "For foreldre",
          family: "For foreldre og barn",
          info: "Info",
          internt: "Internt møte"
      }
    },
    navigation: {
      home: "Hjem",
      updates: "Aktuelt",
      calendar: "Kalender",
      contact: "Kontakt",
      documents: "Dokumenter",
    },
    ui: {
      skipToContent: "Hopp til innholdet",
      menu: "Meny",
      quickLinks: "Snarveier",
      externalLink: "åpnes i ny fane",
      account: "Konto",
      appearance: "Språk og visning",
      editorTools: "Redaktørverktøy",
      aboutFau: "Om FAU"
    },
    header: {
      overview: "Oversikt",
      content: "Innhold",
      messages: "Meldinger",
      settings: "Innstillinger",
      switchLightMode: "Bytt til lyst modus",
      switchDarkMode: "Bytt til mørkt modus",
      lightMode: "Lyst modus",
      darkMode: "Mørkt modus",
      title: "FAU Erdal Barnehage",
      subtitle: "Foreldrenes arbeidsutvalg",
      login: "FAU-pålogging",
      logout: "Logg ut",
      loggingOut: "Logger ut..."
    },
    home: {
      home: "Hjem",
      updates: "Aktuelt",
      tipsTricks: "Tips & triks",
      news: "Nyheter",
      by: "av",
      readMore: "Les mer",
      loadingInformation: "Laster informasjon...",
      title: "Velkommen til FAU Erdal Barnehage",
      welcomeDescription: "FAU Erdal Barnehage er foreldrenes egen frivillige forening. Vi jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna.",
      valuesTitle: "Våre verdier",
      moreInfo: "Mer informasjon",
      aboutKindergarten: "Om Barnehagen",
      municipality: "Adresse:",
      openingHours: "Åpningstider:",
      fauTitle: "Foreldrenes arbeidsutvalg (FAU)",
      fauBoard: "FAU-styre:",
      leader: "Leder:",
      member: "Medlem:",
      vara: "Vara:",
      fauDescription: "Foreldrenes arbeidsutvalg (FAU) er foreldrenes egen frivillige forening. Vi jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna i barnehagen.",
      upcomingEvents: "Hva skjer fremover",
      seeAllEvents: "Se hele kalenderen",
      noEvents: "Ingen planlagte arrangementer",
      heroImageAlt: "Illustrasjon: to barn på tur mot et treskilt med ordene for barna, sammen og engasjement",
      heroCalendarCta: "Se hva som skjer",
      heroContactCta: "Ta kontakt",
      valueChildrenTitle: "For barna",
      valueChildrenBody: "Alt FAU gjør skal komme barna til gode – i leken, i hverdagen og på tur.",
      valueTogetherTitle: "Sammen",
      valueTogetherBody: "Foreldre, ansatte og barnehage drar i samme retning. Vi er bindeleddet.",
      valueEngagementTitle: "Engasjement",
      valueEngagementBody: "Alle kan bidra med det de har tid til – en dugnadstime teller like mye som et møte.",
      nextUpLabel: "Neste ut",
      comingDates: "Nærmeste datoer",
      openCalendar: "Åpne kalenderen",
      practicalInfo: "Praktisk informasjon",
      boardOnContact: "Se hele FAU-styret og kontaktinfo",
      closingTitle: "Har du en idé, eller lyst til å bidra?",
      closingBody: "Det trengs ikke mye. En melding, en time på dugnad eller et innspill på neste foreldremøte er nok til å utgjøre en forskjell.",
      closingHand: "Vi hører gjerne fra deg",
      closingCta: "Send oss en melding",
    },
    calendar: {
      title: "Kalender",
      viewLabel: "Visning",
      listView: "Liste",
      monthView: "Måned",
      detailEmpty: "Velg noe i kalenderen for å se detaljene her.",
      detailPlace: "Sted",
      detailWeek: "Uke",
      detailDeadline: "Påmeldingsfrist",
      detailSignup: "Påmelding",
      noDescription: "Ingen beskrivelse lagt inn.",
      allTypes: "Alle",
      allDay: "Hele dagen",
      listHeading: "Alt som skjer i Erdal Barnehage",
      listIntro:
        "En oversiktlig kalender for barnehageåret. Her finner du arrangementer, møter og viktige datoer.",
      monthIntro: "En oversikt over alle aktivitetene denne måneden. Klikk på en dato for å se mer informasjon.",
      pickADay: "Velg en dag i kalenderen for å se hva som skjer.",
      tagline: "Små mennesker, store dager",
      noEventsThisWeek: "Ingen planlagte arrangementer denne uken.",
      noEventsThisDay: "Ingenting er lagt inn denne dagen.",
      weeklyFood: "Ukens varmmat:",
      reminderTitle: "Vil du ha påminnelser om viktige datoer?",
      reminderBody: "Legg til kalenderen i mobil eller nettbrett, så går du ikke glipp av noe.",
      editorLabel: "Redaktør",
      newEntry: "Nytt i kalenderen",
      newPickerHint: "Velg hva du legger inn — resten av skjemaet retter seg etter valget.",
      newEventButton: "Arrangement med påmelding",
      newEventHint: "Deltakerliste, maks antall, påmeldingsfrist og varsel på nyhetsbrevet.",
      newYearlyHint: "Dato eller uke, med valgfri visning på forsiden.",
      staffCannotCreateEvents:
        "Som ansatt kan du legge inn i årskalenderen, men ikke opprette arrangementer med påmelding — de krever FAU-rolle.",
      excelScopeNote:
        "Excel-mal og import dekker årskalenderen for valgt barnehageår. Arrangementer med påmelding redigeres enkeltvis, fordi de har deltakerlister og frister en regnearkrad ikke kan bære.",
      confirmCancelTitle: "Avlyse arrangementet?",
      confirmCancelBody:
        "Arrangementet har påmeldte, så det kan ikke slettes. Det blir stående i kalenderen med gjennomstreket tittel, slik at de påmeldte ser at det er avlyst.",
      confirmDeleteBody: "Ingen er påmeldt, så oppføringen kan slettes. Dette kan ikke angres.",
      week: "Uke",
      thisWeek: "Denne uken",
      allWeek: "hele uken",
      filtersLabel: "Filtre",
      withSignup: "Med påmelding",
      noRegistrationsYet: "Ingen påmeldte ennå",
      placesFilled: "{count} av {max} plasser fylt",
      showEarlier: "Vis tidligere uker",
      nothingMatches: "Ingen oppføringer igjen med disse filtrene.",
      noTypesSelected: "Ingen typer er valgt. Trykk «Vis alt» for å få kalenderen tilbake.",
      endOfList: "Det er alt som er lagt inn fremover.",
      loadFailed: "Klarte ikke å hente kalenderen. Prøv å laste siden på nytt.",
      kinds: {
        arrangement: "Arrangement",
        family: "For foreldre og barn",
        mote: "Møte",
        dugnad: "Dugnad",
        foto: "Foto",
        internt: "Internt",
        bhgdag: "I barnehagen",
        varmmat: "Varmmat",
        temauke: "Temauke",
        stengt: "Stengt",
        beskjed: "Beskjed",
        info: "Info",
      },
      subscribe: "Abonner på kalenderen",
      subscribeTitle: "Abonner på kalenderen",
      subscribeDescription:
        "Få arrangementer, møter og datoer fra årskalenderen rett inn i din egen kalender. Nye og endrede datoer oppdateres automatisk.",
      subscribeGoogle: "Legg til i Google Kalender",
      subscribeApple: "Abonner i Apple Kalender",
      subscribeOutlook: "Abonner i Outlook",
      subscribeUrlLabel: "Kalenderadresse (URL)",
      subscribeUrlHint:
        "Kopier adressen og lim den inn der kalenderappen din spør etter «abonner på kalender fra URL».",
      subscribeCopy: "Kopier kalenderadressen",
      subscribeCopied: "Kalenderadressen er kopiert",
      subscribeCopyFailed: "Kunne ikke kopiere",
      subscribeCopyFailedHint: "Marker adressen i feltet og kopier den manuelt.",
      subscribeDownload: "Last ned som .ics-fil",
      subscribeDownloadHint:
        "Engangsimport av dagens datoer. Filen oppdateres ikke senere – bruk abonnement hvis du vil ha endringer automatisk.",
    },
    events: {
      registrationDeleted: "Påmelding slettet",
      registrationHasBeenDeleted: "Påmeldingen har blitt slettet.",
      deleteError: "Feil ved sletting",
      couldNotDeleteRegistration: "Kunne ikke slette påmeldingen. Prøv igjen senere.",
      loadingRegistrations: "Laster påmeldinger...",
      registered: "Påmeldte",
      registrationList: "Påmeldingsliste",
      cancelled: "Avmeldte",
      cancellationList: "Avmeldinger",
      cancellationListDesc: "Meldte seg av med lenken i e-posten. Plassene er frigitt.",
      cancelledAt: "Avmeldt",
      downloadExcel: "Last ned Excel",
      exportFailed: "Kunne ikke laste ned deltakerlisten. Prøv igjen.",
      people: "personer",
      deleteRegistration: "Slett påmelding",
      deleteRegistration2: "Slett påmelding?",
      childrenTimeSlots: "Barn og tidspunkt",
      comment: "Kommentar:",
      selectDate: "Velg dato",
      clearDeadline: "Fjern frist",
      sendNewsletterReminder: "Send påminnelse på nyhetsbrev",
      eventDeleted: "Arrangement slettet",
      eventHasBeenDeleted: "Arrangementet har blitt slettet.",
      cannotDelete: "Kan ikke slette",
      eventHasRegistrationsCannot: "Dette arrangementet har påmeldinger og kan ikke slettes. Du kan avlyse det i stedet.",
      couldNotDelete: "Kunne ikke slette",
      errorOccurredWhileDeleting: "En feil oppstod ved sletting av arrangementet.",
      eventCancelled: "Arrangement avlyst",
      eventHasBeenCancelled: "Arrangementet har blitt avlyst og e-poster er sendt til alle påmeldte.",
      cancellationError: "Feil ved avlysning",
      registerVigilo: "Påmelding i Vigilo",
      noSignupRequired: "Ingen påmelding nødvendig",
      at: "kl.",
      internalEvent: "Internt arrangement",
      cancelled2: "AVLYST",
      deleteEvent: "Slette arrangement?",
      more: "mer",
      previousMonth: "Forrige måned",
      nextMonth: "Neste måned",
      today: "I dag",
      noRegistrationsYet: "Ingen påmeldte ennå",
      loading: "Laster...",
      attendees2: "påmeldte",
      missingNames: "Manglende navn",
      registerPhotoSession: "Påmelding til fotografering",
      eventRegistration: "Påmelding til arrangement",
      parentGuardianName: "Navn foresatt *",
      parentGuardianName2: "Navn på foresatt",
      numberChildren: "Antall barn",
      child: "barn",
      children: "barn",
      childrenSFirstNames: "Fornavn på barn",
      register: "Meld deg på",
      full: "Fullt",
      attendees: "påmeldte",
      maxAttendees: "maks",
      registrationClosed: "Påmeldingsfristen er utløpt",
      time: "Tid", 
      date: "Dato",
      viewRegistrations: "Se påmeldte",
      edit: "Rediger",
      cancel: "Avlys",
      delete: "Slett"
    },
    contact: {
      title: "Kontakt oss",
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
      },
      heroLead: "Har du et spørsmål, en idé eller noe du vil ta opp? Vi svarer så fort vi kan.",
      formTitle: "Send oss en melding",
      formLead: "Feltene med stjerne må fylles ut. Velger du «Anonym henvendelse» sender vi meldingen uten navn og kontaktinfo.",
      otherWays: "Andre måter å nå oss på",
    },
    turnstile: {
      label: "Sikkerhetssjekk",
      notReady: "Sikkerhetssjekken er ikke ferdig eller har utløpt. Vent til den er fullført, og send på nytt.",
      loadFailed: "Sikkerhetssjekken kunne ikke lastes. Sjekk nettverket, slå av eventuelle blokkeringsutvidelser og last siden på nytt.",
    },
    newsletter: {
      navTitle: "Nyhetsbrev",
      title: "Meld deg på nyhetsbrevet",
      subtitle: "Få påminnelser på e-post om kommende arrangementer i barnehagen, og nyhetssaker FAU merker for nyhetsbrevet.",
      emailLabel: "E-post",
      emailPlaceholder: "din@epost.no",
      nameLabel: "Navn (valgfritt)",
      namePlaceholder: "Navn Navnesen",
      subscribe: "Meld meg på",
      subscribing: "Melder på...",
      consent: "Vi bruker e-postadressen din kun til å sende påminnelser og nyheter fra FAU. Du kan melde deg av når som helst via lenken nederst i hver e-post.",
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
      footerLink: "Meld deg på nyhetsbrev",
      admin: {
        title: "Nyhetsbrev-abonnenter",
        description: "Foreldre som har bekreftet påmelding til nyhetsbrevet. Påminnelser sendes automatisk dagen før arrangementer som er huket av, og nyhetssaker som er huket av sendes ved neste utsending.",
        statusPending: "Venter på bekreftelse",
        statusActive: "Aktiv",
        statusUnsubscribed: "Avmeldt",
        activeCount: "aktive abonnenter",
        noSubscribers: "Ingen abonnenter ennå.",
        delete: "Slett abonnent",
        deleteConfirm: "Dette fjerner abonnenten permanent."
      }
    },
    registrationCancel: {
      navTitle: "Avmelding",
      title: "Meld deg av arrangement",
      subtitle: "Kan du likevel ikke komme? Her kan du melde deg av, så plassen går til andre.",
      loading: "Henter påmeldingen...",
      registeredAs: "Påmeldt som",
      attendees: "Antall deltakere",
      confirmQuestion: "Vil du melde deg av dette arrangementet?",
      cancelButton: "Meld meg av",
      cancelling: "Melder deg av...",
      successTitle: "Du er nå avmeldt",
      successDesc: "Påmeldingen er slettet. Du kan melde deg på igjen fra kalenderen dersom det er ledige plasser.",
      closedTitle: "Avmelding er stengt",
      closedDesc: "Arrangementet har allerede funnet sted, så påmeldingen kan ikke lenger endres.",
      notFoundTitle: "Fant ikke påmeldingen",
      notFoundDesc: "Lenken er ugyldig, eller så er påmeldingen allerede slettet.",
      errorTitle: "Noe gikk galt",
      errorDesc: "Kunne ikke melde deg av. Prøv igjen senere, eller kontakt FAU.",
      missingTokenDesc: "Bruk lenken i bekreftelses- eller påminnelses-e-posten for å melde deg av."
    },
    documents: {
      documentDeleted: "Dokument slettet",
      documentWasDeletedSuccessfully: "Dokumentet ble slettet.",
      error: "Feil",
      delete: "Slett",
      deleteDocument: "Slett dokument?",
      cancel: "Avbryt",
      fileTypeNotAllowed: "Filtypen er ikke tillatt",
      fileLargerThan10: "Filen er større enn 10 MB",
      title: "Dokumenter",
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
      dragDropText: "Dra og slipp filen her, eller",
      orClickToSelect: "klikk for å velge",
      maxFileSize: "Maks filstørrelse: 10MB",
      removeFile: "Fjern valgt fil",
      categories: {
        protocol: "Møtereferater",
        regulations: "Vedtekter",
        budget: "Årsplaner & Annet",
      },
      noDocuments: "Ingen dokumenter funnet",
      noDocumentsDesc: "Det er ingen dokumenter i denne kategorien ennå.",
      download: "Last ned",
      fileSize: "Ukjent størrelse",
      heroLead: "Referater, vedtekter og budsjett – til å lese eller laste ned.",
      allCategories: "Alle",
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
        titleLabel: "Tittel",
        titlePlaceholder: "Navn på arrangementet",
        descriptionLabel: "Beskrivelse",
        descriptionPlaceholder: "Beskriv arrangementet...",
        dateLabel: "Dato",
        timeLabel: "Klokkeslett",
        locationLabel: "Sted",
        locationPlaceholder: "Velg sted",
        maxAttendeesLabel: "Maks deltakere",
        maxAttendeesPlaceholder: "La stå tom for ubegrenset",
        maxAttendeesRange: "Skriv et helt tall fra 1 til {max}, eller la feltet stå tomt for ubegrenset.",
        registrationDeadlineLabel: "Påmeldingsfrist",
        registrationDeadlineHint: "La stå tomt hvis påmelding skal være åpen fram til arrangementet.",
        customLocationLabel: "Egen adresse",
        customLocationPlaceholder: "Skriv inn adresse...",
        cancel: "Avbryt",
        create: "Opprett arrangement",
        success: "Arrangement opprettet!",
        errorDesc: "Kunne ikke opprette arrangementet. Prøv igjen senere.",
        types: {
          foto: "Foto"
        },
        locations: {
          digitalt: "Digitalt",
          annet: "Annet"
        }
      },
      eventEdit: {
        title: "Rediger arrangement",
      },
      eventRegistration: {
        success: "Påmelding vellykket!",
        successDesc: "Du er nå påmeldt arrangementet. Bekreftelsen på e-post har en lenke du kan bruke hvis du må melde deg av.",
        error: "Feil ved påmelding",
        errorDesc: "Kunne ikke melde deg på. Prøv igjen senere."
      }
    },
    footer: {
      description: "Foreldrenes arbeidsutvalg (FAU) er foreldrenes egen frivillige organisasjon som jobber for å ivareta foreldrenes interesser og bidra til et godt miljø for barna i barnehagen.",
      facebook: "Facebook-gruppe for foreldre",
      website: "Erdal Barnehage sin nettside",
      barnehageFakta: "Barnehagefakta",
      fubLink: "FUB – råd og veiledning for foreldre",
      usefulLinks: "Nyttige lenker",
      vigilo: "Vigilo",
      meals: "Mat og måltider i barnehagen",
      privacy: "Personvern",
      copyright: "© 2025 FAU Erdal Barnehage. Alle rettigheter reservert."
    },
    common: {
      pageNotFound: "Siden finnes ikke",
      pageNotFoundBody: "Lenken kan være utdatert, eller siden kan ha blitt flyttet.",
      goHomePage: "Gå til forsiden",
      loading: "Laster...",
      bytes: "Bytes",
      required: "påkrevd",
      file: "Fil",
      cancel: "Avbryt",
      upload: "Last opp",
      uploading: "Laster opp..."
    },
    newsPage: {
      searchLabel: "Søk i innlegg",
      searchPlaceholder: "Søk i innlegg …",
      clearSearch: "Tøm søket",
      noSearchResults: "Ingen innlegg matcher søket",
      searchResults: "{count} innlegg vises",
      allCategories: "Alle",
      newestFirst: "Nyeste først",
      noPostsYet: "Ingen innlegg ennå",
      loadingPosts: "Laster innlegg …",
      couldNotLoadPosts: "Kunne ikke laste innlegg",
      newsDescription: "Siste nyheter og informasjon fra FAU Erdal Barnehage.",
      tipsDescription: "Praktiske tips og råd for foreldre i Erdal Barnehage.",
      loadMoreFailed: "Kunne ikke laste flere innlegg. Prøv igjen.",
      retry: "Prøv igjen",
      tipsTricks: "Tips & triks",
      noTipsYet: "Ingen tips ennå",
      loadingTips: "Laster tips...",
      couldNotLoadTips: "Kunne ikke laste tips",
      news: "Nyheter",
      noNewsYet: "Ingen nyheter ennå",
      loadingNews: "Laster nyheter...",
      couldNotLoadNews: "Kunne ikke laste nyheter",
      category: "Kategori",
      by: "av",
      post: "Innlegg",
      loading: "Laster …",
      postNotFound: "Fant ikke innlegget",
      allTips: "Alle tips",
      allNews: "Alle nyheter",
      heroLead: "Nyheter, referater og praktiske tips fra FAU og barnehagen.",
      categoryNews: "Nyheter",
      categoryTips: "Tips & triks",
      loadMore: "Vis flere",
      backToList: "Tilbake til Aktuelt",
    },
    adminPage: {
      messages: "Meldinger",
      newInquiry: "ny henvendelse",
      newInquiries: "nye henvendelser",
      allHandled: "alt er behandlet",
      content: "Innhold",
      publishedPost: "publisert innlegg",
      publishedPosts: "publiserte innlegg",
      documents: "Dokumenter",
      uploadedLast30Days: "lastet opp siste 30 dager",
      settings: "Innstillinger",
      boardKindergartenUsers: "Styret, barnehagen, brukere",
      newsletterSubscribers: "og nyhetsbrev-abonnenter",
      waiting: "Venter",
      noUpcomingEvents: "Ingen kommende arrangementer",
      registered: "påmeldte",
      goEvents: "Til arrangementer",
    },
    messagesPage: {
      updated: "Oppdatert!",
      statusHasBeenUpdated: "Status er oppdatert",
      error: "Feil",
      couldNotUpdateStatus: "Kunne ikke oppdatere status",
      deleted: "Slettet!",
      messageWasDeleted: "Meldingen ble slettet",
      couldNotDeleteMessage: "Kunne ikke slette melding",
      new: "Ny",
      responded: "Besvart",
      archived: "Arkivert",
      new2: "Nye",
      messages: "Meldinger",
      filterByStatus: "Filtrer på status",
      showAll: "Vis alle",
      showOnlyThese: "Vis kun disse",
      noMessagesYet: "Ingen meldinger ennå",
      noMessagesWithStatus: "Ingen meldinger med denne statusen",
      anonymous: "Anonym",
      archive: "Arkiver",
      restore: "Gjenopprett",
      deleteMessage: "Slett melding",
      deleteMessage2: "Slett melding?",
      cancel: "Avbryt",
      delete: "Slett",
      showLess: "Vis mindre",
      showMore: "Vis mer",
      by: "av",
      reply: "Svar",
      replyTitle: "Svar på henvendelse",
      replySentFromFau: "Svaret sendes fra FAU sin e-postadresse til",
      originalMessage: "Opprinnelig henvendelse",
      yourReply: "Ditt svar",
      replyPlaceholder: "Skriv svaret her …",
      sendReply: "Send svar",
      sending: "Sender …",
      replySent: "Svar sendt!",
      replyWasSent: "Svaret er sendt, og henvendelsen er markert som besvart.",
      couldNotSendReply: "Kunne ikke sende svar",
      replyRequired: "Skriv et svar før du sender",
      cannotReplyAnonymous: "Anonyme henvendelser har ingen e-postadresse å svare til",
      sentReply: "Sendt svar",
    },
    contentPage: {
      content: "Innhold",
      error: "Feil",
      titleContentRequired: "Tittel og innhold er påkrevd",
      saved: "Lagret!",
      postHasBeenSaved: "Innlegget er lagret",
      couldNotSavePost: "Kunne ikke lagre innlegg",
      updated: "Oppdatert!",
      couldNotUpdatePost: "Kunne ikke oppdatere innlegg",
      deleted: "Slettet!",
      postWasDeleted: "Innlegget ble slettet",
      couldNotDeletePost: "Kunne ikke slette innlegg",
      updatesPosts: "Aktuelt / Innlegg",
      newPost: "Nytt innlegg",
      filterByStatus: "Filtrer på status",
      all: "Alle",
      published: "Publiserte",
      archived: "Arkiverte",
      searchTitles: "Søk i titler …",
      searchTitles2: "Søk i titler",
      title: "Tittel",
      postTitle: "Tittel på innlegget",
      writeYourPostHere: "Skriv innlegget her...",
      category: "Kategori",
      news: "Nyheter",
      tipsTricks: "Tips & triks",
      publishDate: "Publiseringsdato",
      writtenBy: "Skrevet av",
      selectAuthor: "Velg forfatter",
      save: "Lagre",
      cancel: "Avbryt",
      delete: "Slett",
      deleteBlogPost: "Slette blogginnlegg?",
      noTitle: "(Uten tittel)",
      edit: "Rediger",
      removeFromHome: "Fjern fra hjem",
      showHome: "Vis på hjem",
      sendInNewsletter: "Ta med i nyhetsbrevet",
      sendInNewsletterHint:
        "Saken sendes på e-post til alle bekreftede nyhetsbrev-abonnenter ved neste utsending (kl. 21). Den sendes bare én gang.",
      newsletterAlreadySent: "Sendt i nyhetsbrevet",
      newsletterSentBadge: "Sendt i nyhetsbrev",
      newsletterQueuedBadge: "Sendes i nyhetsbrev",
      publish: "Publiser",
      archive: "Arkiver",
      by: "av",
      archived2: "ARKIVERT",
      deletePost: "Slette innlegg?",
      bold: "Fet",
      italic: "Kursiv",
      underline: "Understrek",
      strikethrough: "Gjennomstrek",
      heading1: "Overskrift 1",
      heading2: "Overskrift 2",
      heading3: "Overskrift 3",
      bulletList: "Punktliste",
      numberedList: "Nummerert liste",
      alignLeft: "Venstrejuster",
      alignCenter: "Midtstill",
      alignRight: "Høyrejuster",
      quote: "Sitat",
      codeBlock: "Kodeblokk",
      link: "Lenke",
      image: "Bilde",
      undo: "Angre",
      redo: "Gjør om",
      uploadFailed: "Opplasting feilet",
      couldNotUploadImage: "Kunne ikke laste opp bilde",
      addLink: "Legg til lenke",
      url: "URL",
      saveLink: "Lagre lenke",
      removeLink: "Fjern lenke",
      video: "Video",
      addVideo: "Legg til video",
      videoUrl: "YouTube-lenke",
      insertVideo: "Sett inn video",
      invalidVideoUrl: "Ugyldig videolenke",
      invalidVideoUrlDescription: "Lim inn en YouTube-lenke, for eksempel https://www.youtube.com/watch?v=xxxxxxxxxxx",
    },
    settings: {
      deleted: "Slettet!",
      memberWasDeleted: "Medlem ble slettet",
      error: "Feil",
      couldNotDeleteMember: "Kunne ikke slette medlem",
      cannotSave: "Kan ikke lagre",
      saved: "Lagret!",
      boardMembersHaveBeen: "Styremedlemmer er lagret",
      couldNotSaveChanges: "Kunne ikke lagre endringer",
      kindergartenInfoHasBeen: "Barnehageinformasjon er lagret",
      couldNotSaveInformation: "Kunne ikke lagre informasjon",
      settings: "Innstillinger",
      fauBoard: "FAU-styret",
      kindergarten: "Barnehagen",
      users: "Brukere",
      newsletter: "Nyhetsbrev",
      name: "Navn",
      johnDoe: "Navn Navnesen",
      role: "Rolle",
      selectRole: "Velg rolle",
      deleteMember: "Slett medlem",
      deleteBoardMember: "Slette styremedlem?",
      cancel: "Avbryt",
      delete: "Slett",
      removeMember: "Fjern medlem",
      addMember: "Legg til medlem",
      reorderHint:
        "Dra i håndtaket til venstre for å endre rekkefølgen. Rekkefølgen lagres når du trykker «Lagre endringer», og er den samme som vises på nettsiden.",
      moveMember: "Endre rekkefølge: {name}",
      unnamedMember: "medlem uten navn",
      reorder: {
        instructions:
          "Trykk mellomrom eller Enter for å ta tak i medlemmet. Bruk piltastene opp og ned for å velge ny plass, mellomrom eller Enter for å slippe, og Escape for å avbryte.",
        onDragStart: "Flytter {item}.",
        onDragOver: "{item} er nå over {target}.",
        onDragOverNoTarget: "{item} er ikke over en plass i listen.",
        onDragEnd: "{item} ble flyttet til plassen til {target}.",
        onDragEndNoTarget: "{item} ble sluppet uten å bli flyttet.",
        onDragCancel: "Flyttingen av {item} ble avbrutt.",
      },
      saveChanges: "Lagre endringer",
      kindergartenInformation: "Barnehageinformasjon",
      contactEmail: "Kontakt e-post",
      address: "Adresse",
      openingHours: "Åpningstider",
      numberChildren: "Antall barn",
      owner: "Eier",
      directorName: "Styrer (navn)",
      directorSName: "Navn på styrer",
      directorEmail: "Styrer (e-post)",
      directorExampleCom: "styrer@example.com",
      description: "Beskrivelse",
      discardChanges: "Forkast endringer",
      noUnsavedChanges: "Ingen ulagrede endringer",
      roles: {
        leder: "Leder",
        medlem: "Medlem",
        vara: "Vara"
      }
    },
    yearlyCalendar: {
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
      notes: "Notater",
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
        title: "Tittel",
        description: "Beskrivelse",
        weekNumber: "Fra uke",
        weekNumberEnd: "Til uke (valgfri)",
        date: "Dato",
        color: "Farge",
        notifyNewsletter: "Send påminnelse på nyhetsbrev",
        notifyNewsletterHint: "Dagen før sendes beskrivelsen som påminnelse på e-post til alle påmeldte nyhetsbrev-abonnenter.",
        startTime: "Starttid (valgfritt)",
        endTime: "Sluttid (valgfritt)",
        timeHint: "Uten klokkeslett står oppføringen som en heldagsdato. Med starttid vises den som et vanlig avtalepunkt i kalenderen til de som abonnerer.",
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
        emailSent: "Innloggingsdetaljer er sendt på e-post",
        successDelete: "Bruker slettet",
        errorDelete: "Kunne ikke slette brukeren"
      }
    }
  },
  en: {
    dataState: {
      unavailable: "Information is currently unavailable",
      staleHint: "Please try again. Any information still shown may be incomplete or out of date.",
      retry: "Try again",
      loading: "Loading information …",
    },
    calendarWorkspace: {
      editHint: "Select a date or week in the month to add an entry. Change its date or week in the form to move it.",
      allEntries: "Entries this month",
      allEntriesHint: "All calendar entries in this month, including entries hidden by filters or displayed alongside an event.",
      wholeMonth: "Whole month",
      addDay: "Add on this date",
      addWeek: "Add in this week",
      addNote: "Add month note",
      jumpMonth: "Go to month",
      downloadHint: "PDF includes all entries, regardless of filters. The kindergarten year runs from August to July.",
      weekdayStart: "From weekday",
      weekdayEnd: "To weekday",
      placementError: "Choose a valid date, month and week. The end must be on or after the start.",
      pdfDetails: "Full details",
      pdfDetailsHint: "Long entries and additional activities are listed in full after the calendar.",
      pdfPrintEdition: "Calendar · print edition",
    },
    entryEditor: {
      intro: "Choose the content, timing and how the entry is displayed.",
      content: "Content and category",
      schedule: "Timing",
      publishing: "Visibility and reminder",
      signup: "Registration",
      preview: "Label preview",
      category: "Category",
      categoryHint: "The same label on the homepage and calendar. Internal meetings are also visible to parents.",
      homepage: "Show on homepage",
      homepageHint: "Also include this entry in upcoming events.",
      calendarOnly: "The entry remains visible in the calendar.",
      closedHint: "Closed days always appear on the homepage.",
      eventHomepageHint: "The event appears on the homepage and calendar, including internal meetings.",
      advanced: "Yearly plan colour",
      colorHint: "Only affects the yearly plan and PDF. The homepage and calendar use the category colour.",
      month: "Month",
      year: "Year",
      format: "Duration / entry type",
      onsiteSignup: "Registration on this website",
      photoSignupHint: "Photo registration collects children’s names and assigns photo time slots. The event appears under For children on the homepage and calendar.",
      noSignup: "No registration",
      vigiloSignup: "Registration in Vigilo",
      internalSignup: "Internal meetings are publicly listed, without registration.",
      updated: "Event updated",
      update: "Save changes",
      saving: "Saving …",
      error: "Could not save changes",
      addressError: "Enter a valid address (at least 5 characters).",
      placeSmall: "Toddler wing",
      placeLarge: "Older children’s wing",
      placeMeeting: "Meeting room",
      placeOutside: "Outside",
      categories: {
          bhgdag: "For children",
          arrangement: "For parents",
          family: "For parents and children",
          info: "Information",
          internt: "Internal meeting"
      }
    },
    navigation: {
      home: "Home",
      updates: "Updates",
      calendar: "Calendar",
      contact: "Contact",
      documents: "Documents",
    },
    ui: {
      skipToContent: "Skip to content",
      menu: "Menu",
      quickLinks: "Quick links",
      externalLink: "opens in a new tab",
      account: "Account",
      appearance: "Language and display",
      editorTools: "Editor tools",
      aboutFau: "About FAU"
    },
    header: {
      overview: "Overview",
      content: "Content",
      messages: "Messages",
      settings: "Settings",
      switchLightMode: "Switch to light mode",
      switchDarkMode: "Switch to dark mode",
      lightMode: "Light mode",
      darkMode: "Dark mode",
      title: "FAU Erdal Kindergarten",
      subtitle: "Parents' Council Working Committee",
      login: "Council Login",
      logout: "Log out",
      loggingOut: "Logging out..."
    },
    home: {
      home: "Home",
      updates: "Updates",
      tipsTricks: "Tips & Tricks",
      news: "News",
      by: "by",
      readMore: "Read more",
      loadingInformation: "Loading information...",
      title: "Welcome to FAU Erdal Kindergarten",
      welcomeDescription: "FAU Erdal Kindergarten is the parents' own voluntary association. We work to safeguard parents' interests and contribute to a good environment for the children.",
      valuesTitle: "Our values",
      moreInfo: "More information",
      aboutKindergarten: "About the Kindergarten",
      municipality: "Address:",
      openingHours: "Opening hours:",
      fauTitle: "Parents' Council Working Committee (FAU)",
      fauBoard: "FAU board:",
      leader: "Leader:",
      member: "Member:",
      vara: "Deputy member:",
      fauDescription: "The Parents' Council Working Committee (FAU) is the parents' own voluntary association. We work to safeguard parents' interests and contribute to a good environment for the children in the kindergarten.",
      seeAllEvents: "See the full calendar",
      upcomingEvents: "What's coming up",
      noEvents: "No Scheduled Events",
      heroImageAlt: "Illustration: two children walking towards a wooden sign reading for barna, sammen and engasjement",
      heroCalendarCta: "See what's on",
      heroContactCta: "Get in touch",
      valueChildrenTitle: "For the children",
      valueChildrenBody: "Everything FAU does should reach the children – in play, in everyday life and on outings.",
      valueTogetherTitle: "Together",
      valueTogetherBody: "Parents, staff and kindergarten pulling the same way. We are the link between them.",
      valueEngagementTitle: "Engagement",
      valueEngagementBody: "Everyone can contribute what time they have – an hour at a work day counts as much as a meeting.",
      nextUpLabel: "Next up",
      comingDates: "Coming dates",
      openCalendar: "Open the calendar",
      practicalInfo: "Practical information",
      boardOnContact: "See the full FAU board and contact details",
      closingTitle: "Got an idea, or want to help out?",
      closingBody: "It doesn't take much. A message, an hour at a work day or a word at the next parents' meeting is enough to make a difference.",
      closingHand: "We'd love to hear from you",
      closingCta: "Send us a message",
    },
    calendar: {
      title: "Calendar",
      viewLabel: "View",
      listView: "List",
      monthView: "Month",
      detailEmpty: "Pick something in the calendar to see the details here.",
      detailPlace: "Place",
      detailWeek: "Week",
      detailDeadline: "Registration deadline",
      detailSignup: "Registration",
      noDescription: "No description added.",
      allTypes: "All",
      allDay: "All day",
      listHeading: "Everything happening at Erdal Kindergarten",
      listIntro:
        "A clear calendar for the kindergarten year. Events, meetings and the dates that matter.",
      monthIntro: "An overview of everything happening this month. Pick a date to see more.",
      pickADay: "Pick a day in the calendar to see what is on.",
      tagline: "Small people, big days",
      noEventsThisWeek: "Nothing planned this week.",
      noEventsThisDay: "Nothing is scheduled on this day.",
      weeklyFood: "This week's hot meal:",
      reminderTitle: "Want reminders for the dates that matter?",
      reminderBody: "Add the calendar to your phone or tablet so nothing slips past you.",
      editorLabel: "Editor",
      newEntry: "New in the calendar",
      newPickerHint: "Choose what you are adding — the rest of the form follows from it.",
      newEventButton: "Event with signup",
      newEventHint: "Attendee list, maximum, registration deadline and newsletter notice.",
      newYearlyHint: "A date or week, optionally shown on the homepage.",
      staffCannotCreateEvents:
        "As staff you can add to the yearly calendar, but not create events with signup — those need a council role.",
      excelScopeNote:
        "The Excel template and import cover the yearly calendar for the selected kindergarten year. Events with signup are edited one at a time, because they carry attendee lists and deadlines a spreadsheet row cannot.",
      confirmCancelTitle: "Cancel this event?",
      confirmCancelBody:
        "People have signed up, so it cannot be deleted. It stays in the calendar with its title struck through, so those who signed up can see it is cancelled.",
      confirmDeleteBody: "Nobody has signed up, so the entry can be deleted. This cannot be undone.",
      week: "Week",
      thisWeek: "This week",
      allWeek: "all week",
      filtersLabel: "Filters",
      withSignup: "With signup",
      noRegistrationsYet: "No registrations yet",
      placesFilled: "{count} of {max} places filled",
      showEarlier: "Show earlier weeks",
      nothingMatches: "Nothing left with these filters.",
      noTypesSelected: "No types selected. Choose \u201cShow all\u201d to bring the calendar back.",
      endOfList: "That is everything scheduled from here on.",
      loadFailed: "Could not load the calendar. Try reloading the page.",
      kinds: {
        arrangement: "Event",
        family: "For parents and children",
        mote: "Meeting",
        dugnad: "Working bee",
        foto: "Photos",
        internt: "Internal",
        bhgdag: "At the kindergarten",
        varmmat: "Hot meal",
        temauke: "Theme week",
        stengt: "Closed",
        beskjed: "Notice",
        info: "Info",
      },
      subscribe: "Subscribe to the calendar",
      subscribeTitle: "Subscribe to the calendar",
      subscribeDescription:
        "Get events, meetings and the dates from the yearly calendar straight into your own calendar. New and changed dates update automatically.",
      subscribeGoogle: "Add to Google Calendar",
      subscribeApple: "Subscribe in Apple Calendar",
      subscribeOutlook: "Subscribe in Outlook",
      subscribeUrlLabel: "Calendar address (URL)",
      subscribeUrlHint:
        "Copy the address and paste it where your calendar app asks to subscribe to a calendar from a URL.",
      subscribeCopy: "Copy the calendar address",
      subscribeCopied: "Calendar address copied",
      subscribeCopyFailed: "Could not copy",
      subscribeCopyFailedHint: "Select the address in the field and copy it manually.",
      subscribeDownload: "Download as an .ics file",
      subscribeDownloadHint:
        "A one-off import of today's dates. The file never updates — subscribe instead if you want changes automatically.",
    },
    events: {
      registrationDeleted: "Registration deleted",
      registrationHasBeenDeleted: "The registration has been deleted.",
      deleteError: "Delete error",
      couldNotDeleteRegistration: "Could not delete the registration. Please try again later.",
      loadingRegistrations: "Loading registrations...",
      registered: "Registered",
      registrationList: "Registration List",
      cancelled: "Cancelled",
      cancellationList: "Cancellations",
      cancellationListDesc: "Cancelled with the link in their email. The places have been released.",
      cancelledAt: "Cancelled",
      downloadExcel: "Download Excel",
      exportFailed: "Could not download the attendee list. Please try again.",
      people: "people",
      deleteRegistration: "Delete registration",
      deleteRegistration2: "Delete registration?",
      childrenTimeSlots: "Children and time slots",
      comment: "Comment:",
      selectDate: "Select date",
      clearDeadline: "Clear deadline",
      sendNewsletterReminder: "Send newsletter reminder",
      eventDeleted: "Event deleted",
      eventHasBeenDeleted: "The event has been deleted.",
      cannotDelete: "Cannot delete",
      eventHasRegistrationsCannot: "This event has registrations and cannot be deleted. You can cancel it instead.",
      couldNotDelete: "Could not delete",
      errorOccurredWhileDeleting: "An error occurred while deleting the event.",
      eventCancelled: "Event cancelled",
      eventHasBeenCancelled: "The event has been cancelled and emails have been sent to all attendees.",
      cancellationError: "Cancellation error",
      registerVigilo: "Register in Vigilo",
      noSignupRequired: "No signup required",
      at: "at",
      internalEvent: "Internal event",
      cancelled2: "CANCELLED",
      deleteEvent: "Delete event?",
      more: "more",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      today: "Today",
      noRegistrationsYet: "No registrations yet",
      loading: "Loading...",
      attendees2: "attendees",
      missingNames: "Missing names",
      registerPhotoSession: "Register for photo session",
      eventRegistration: "Event registration",
      parentGuardianName: "Parent/guardian name *",
      parentGuardianName2: "Parent/guardian name",
      numberChildren: "Number of children",
      child: "child",
      children: "children",
      childrenSFirstNames: "Children\\'s first names",
      register: "Register",
      full: "Full",
      attendees: "registered",
      maxAttendees: "max",
      registrationClosed: "Registration deadline has passed",
      time: "Time",
      date: "Date",
      viewRegistrations: "View registrations",
      edit: "Edit",
      cancel: "Cancel",
      delete: "Delete"
    },
    contact: {
      title: "Contact us",
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
      },
      heroLead: "Got a question, an idea or something to raise? We answer as soon as we can.",
      formTitle: "Send us a message",
      formLead: "Fields marked with a star are required. Choosing an anonymous enquiry sends the message without your name or contact details.",
      otherWays: "Other ways to reach us",
    },
    turnstile: {
      label: "Security check",
      notReady: "The security check isn't finished or has expired. Wait for it to complete, then send again.",
      loadFailed: "The security check could not load. Check your connection, turn off any blocking extensions and reload the page.",
    },
    newsletter: {
      navTitle: "Newsletter",
      title: "Subscribe to the newsletter",
      subtitle: "Get email reminders about upcoming events at the kindergarten, plus the news posts FAU flags for the newsletter.",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      nameLabel: "Name (optional)",
      namePlaceholder: "John Doe",
      subscribe: "Subscribe",
      subscribing: "Subscribing...",
      consent: "We use your email address only to send reminders and news from FAU. You can unsubscribe at any time via the link at the bottom of every email.",
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
      footerLink: "Subscribe to newsletter",
      admin: {
        title: "Newsletter subscribers",
        description: "Parents who have confirmed their newsletter subscription. Reminders are sent automatically the day before flagged events, and flagged news posts go out on the next send.",
        statusPending: "Awaiting confirmation",
        statusActive: "Active",
        statusUnsubscribed: "Unsubscribed",
        activeCount: "active subscribers",
        noSubscribers: "No subscribers yet.",
        delete: "Delete subscriber",
        deleteConfirm: "This permanently removes the subscriber."
      }
    },
    registrationCancel: {
      navTitle: "Cancel registration",
      title: "Cancel your registration",
      subtitle: "Can no longer attend? Cancel here so the place can go to someone else.",
      loading: "Loading your registration...",
      registeredAs: "Registered as",
      attendees: "Number of attendees",
      confirmQuestion: "Do you want to cancel your registration for this event?",
      cancelButton: "Cancel my registration",
      cancelling: "Cancelling...",
      successTitle: "Your registration is cancelled",
      successDesc: "The registration has been deleted. You can sign up again from the calendar if there are places left.",
      closedTitle: "Cancellation is closed",
      closedDesc: "The event has already taken place, so the registration can no longer be changed.",
      notFoundTitle: "Registration not found",
      notFoundDesc: "The link is invalid, or the registration has already been cancelled.",
      errorTitle: "Something went wrong",
      errorDesc: "Could not cancel your registration. Please try again later, or contact FAU.",
      missingTokenDesc: "Use the link in your confirmation or reminder email to cancel your registration."
    },
    documents: {
      documentDeleted: "Document deleted",
      documentWasDeletedSuccessfully: "The document was deleted successfully.",
      error: "Error",
      delete: "Delete",
      deleteDocument: "Delete document?",
      cancel: "Cancel",
      fileTypeNotAllowed: "File type is not allowed",
      fileLargerThan10: "File is larger than 10 MB",
      title: "Documents",
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
      dragDropText: "Drag and drop file here, or",
      orClickToSelect: "click to select",
      maxFileSize: "Max file size: 10MB",
      removeFile: "Remove selected file",
      categories: {
        protocol: "Meeting Minutes",
        regulations: "Bylaws",
        budget: "Annual Plans & Other",
      },
      noDocuments: "No documents found",
      noDocumentsDesc: "There are no documents in this category yet.",
      download: "Download",
      fileSize: "Unknown size",
      heroLead: "Minutes, statutes and budgets – to read or download.",
      allCategories: "All",
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
        titleLabel: "Title",
        titlePlaceholder: "Event name",
        descriptionLabel: "Description",
        descriptionPlaceholder: "Describe the event...",
        dateLabel: "Date",
        timeLabel: "Time",
        locationLabel: "Location",
        locationPlaceholder: "Select location",
        maxAttendeesLabel: "Max attendees",
        maxAttendeesPlaceholder: "Leave empty for unlimited",
        maxAttendeesRange: "Enter a whole number from 1 to {max}, or leave it empty for unlimited.",
        registrationDeadlineLabel: "Registration deadline",
        registrationDeadlineHint: "Leave empty if registration should stay open until the event.",
        customLocationLabel: "Custom address",
        customLocationPlaceholder: "Enter address...",
        cancel: "Cancel",
        create: "Create event",
        success: "Event created!",
        errorDesc: "Could not create the event. Please try again later.",
        types: {
          foto: "Photo"
        },
        locations: {
          digitalt: "Digital",
          annet: "Other"
        }
      },
      eventEdit: {
        title: "Edit event",
      },
      eventRegistration: {
        success: "Registration successful!",
        successDesc: "You are now registered for the event. The confirmation email has a link you can use if you need to cancel.",
        error: "Registration error",
        errorDesc: "Could not register you. Please try again later."
      }
    },
    footer: {
      description: "The parent working committee (FAU) is the parents' own voluntary organization that works to safeguard parents' interests and contribute to a good environment for the children in the kindergarten.", 
      facebook: "Facebook group for parents",
      website: "Erdal Kindergarten website",
      barnehageFakta: "Barnehagefakta",
      fubLink: "FUB – advice and guidance for parents",
      usefulLinks: "Useful links",
      vigilo: "Vigilo",
      meals: "Food and meals in kindergarten",
      privacy: "Privacy",
      copyright: "© 2025 FAU Erdal Kindergarten. All rights reserved."
    },
    common: {
      pageNotFound: "Page not found",
      pageNotFoundBody: "The link may be out of date, or the page may have moved.",
      goHomePage: "Go to the home page",
      loading: "Loading...",
      bytes: "Bytes",
      required: "required",
      file: "File",
      cancel: "Cancel",
      upload: "Upload",
      uploading: "Uploading..."
    },
    newsPage: {
      searchLabel: "Search posts",
      searchPlaceholder: "Search posts …",
      clearSearch: "Clear search",
      noSearchResults: "No posts match your search",
      searchResults: "{count} posts shown",
      allCategories: "All",
      newestFirst: "Newest first",
      noPostsYet: "No posts yet",
      loadingPosts: "Loading posts …",
      couldNotLoadPosts: "Could not load posts",
      newsDescription: "Latest news and information from FAU Erdal Kindergarten.",
      tipsDescription: "Practical tips and advice for parents at Erdal Kindergarten.",
      loadMoreFailed: "Could not load more posts. Please try again.",
      retry: "Try again",
      tipsTricks: "Tips & Tricks",
      noTipsYet: "No tips yet",
      loadingTips: "Loading tips...",
      couldNotLoadTips: "Could not load tips",
      news: "News",
      noNewsYet: "No news yet",
      loadingNews: "Loading news...",
      couldNotLoadNews: "Could not load news",
      category: "Category",
      by: "by",
      post: "Post",
      loading: "Loading …",
      postNotFound: "Post not found",
      allTips: "All tips",
      allNews: "All news",
      heroLead: "News, minutes and practical tips from FAU and the kindergarten.",
      categoryNews: "News",
      categoryTips: "Tips & tricks",
      loadMore: "Load more",
      backToList: "Back to Updates",
    },
    adminPage: {
      messages: "Messages",
      newInquiry: "new inquiry",
      newInquiries: "new inquiries",
      allHandled: "all handled",
      content: "Content",
      publishedPost: "published post",
      publishedPosts: "published posts",
      documents: "Documents",
      uploadedLast30Days: "uploaded in the last 30 days",
      settings: "Settings",
      boardKindergartenUsers: "Board, kindergarten, users",
      newsletterSubscribers: "and newsletter subscribers",
      waiting: "Waiting",
      noUpcomingEvents: "No upcoming events",
      registered: "registered",
      goEvents: "Go to events",
    },
    messagesPage: {
      updated: "Updated!",
      statusHasBeenUpdated: "Status has been updated",
      error: "Error",
      couldNotUpdateStatus: "Could not update status",
      deleted: "Deleted!",
      messageWasDeleted: "Message was deleted",
      couldNotDeleteMessage: "Could not delete message",
      new: "New",
      responded: "Responded",
      archived: "Archived",
      new2: "New",
      messages: "Messages",
      filterByStatus: "Filter by status",
      showAll: "Show all",
      showOnlyThese: "Show only these",
      noMessagesYet: "No messages yet",
      noMessagesWithStatus: "No messages with this status",
      anonymous: "Anonymous",
      archive: "Archive",
      restore: "Restore",
      deleteMessage: "Delete message",
      deleteMessage2: "Delete message?",
      cancel: "Cancel",
      delete: "Delete",
      showLess: "Show less",
      showMore: "Show more",
      by: "by",
      reply: "Reply",
      replyTitle: "Reply to inquiry",
      replySentFromFau: "The reply is sent from FAU's email address to",
      originalMessage: "Original inquiry",
      yourReply: "Your reply",
      replyPlaceholder: "Write your reply here …",
      sendReply: "Send reply",
      sending: "Sending …",
      replySent: "Reply sent!",
      replyWasSent: "The reply was sent and the inquiry is marked as responded.",
      couldNotSendReply: "Could not send reply",
      replyRequired: "Write a reply before sending",
      cannotReplyAnonymous: "Anonymous inquiries have no email address to reply to",
      sentReply: "Sent reply",
    },
    contentPage: {
      content: "Content",
      error: "Error",
      titleContentRequired: "Title and content are required",
      saved: "Saved!",
      postHasBeenSaved: "Post has been saved",
      couldNotSavePost: "Could not save post",
      updated: "Updated!",
      couldNotUpdatePost: "Could not update post",
      deleted: "Deleted!",
      postWasDeleted: "Post was deleted",
      couldNotDeletePost: "Could not delete post",
      updatesPosts: "Updates / Posts",
      newPost: "New post",
      filterByStatus: "Filter by status",
      all: "All",
      published: "Published",
      archived: "Archived",
      searchTitles: "Search titles …",
      searchTitles2: "Search titles",
      title: "Title",
      postTitle: "Post title",
      writeYourPostHere: "Write your post here...",
      category: "Category",
      news: "News",
      tipsTricks: "Tips & Tricks",
      publishDate: "Publish date",
      writtenBy: "Written by",
      selectAuthor: "Select author",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      deleteBlogPost: "Delete blog post?",
      noTitle: "(No title)",
      edit: "Edit",
      removeFromHome: "Remove from home",
      showHome: "Show on home",
      sendInNewsletter: "Include in the newsletter",
      sendInNewsletterHint:
        "The post is emailed to every confirmed newsletter subscriber on the next send (21:00). It goes out only once.",
      newsletterAlreadySent: "Sent in the newsletter",
      newsletterSentBadge: "Sent in newsletter",
      newsletterQueuedBadge: "Queued for newsletter",
      publish: "Publish",
      archive: "Archive",
      by: "by",
      archived2: "ARCHIVED",
      deletePost: "Delete post?",
      bold: "Bold",
      italic: "Italic",
      underline: "Underline",
      strikethrough: "Strikethrough",
      heading1: "Heading 1",
      heading2: "Heading 2",
      heading3: "Heading 3",
      bulletList: "Bullet list",
      numberedList: "Numbered list",
      alignLeft: "Align left",
      alignCenter: "Align center",
      alignRight: "Align right",
      quote: "Quote",
      codeBlock: "Code block",
      link: "Link",
      image: "Image",
      undo: "Undo",
      redo: "Redo",
      uploadFailed: "Upload failed",
      couldNotUploadImage: "Could not upload image",
      addLink: "Add link",
      url: "URL",
      saveLink: "Save link",
      removeLink: "Remove link",
      video: "Video",
      addVideo: "Add video",
      videoUrl: "YouTube link",
      insertVideo: "Insert video",
      invalidVideoUrl: "Invalid video link",
      invalidVideoUrlDescription: "Paste a YouTube link, for example https://www.youtube.com/watch?v=xxxxxxxxxxx",
    },
    settings: {
      deleted: "Deleted!",
      memberWasDeleted: "Member was deleted",
      error: "Error",
      couldNotDeleteMember: "Could not delete member",
      cannotSave: "Cannot save",
      saved: "Saved!",
      boardMembersHaveBeen: "Board members have been saved",
      couldNotSaveChanges: "Could not save changes",
      kindergartenInfoHasBeen: "Kindergarten info has been saved",
      couldNotSaveInformation: "Could not save information",
      settings: "Settings",
      fauBoard: "FAU Board",
      kindergarten: "Kindergarten",
      users: "Users",
      newsletter: "Newsletter",
      name: "Name",
      johnDoe: "John Doe",
      role: "Role",
      selectRole: "Select role",
      deleteMember: "Delete member",
      deleteBoardMember: "Delete board member?",
      cancel: "Cancel",
      delete: "Delete",
      removeMember: "Remove member",
      addMember: "Add member",
      reorderHint:
        "Drag the handle on the left to change the order. The order is saved when you press \u201cSave changes\u201d, and is the one shown on the website.",
      moveMember: "Reorder: {name}",
      unnamedMember: "unnamed member",
      reorder: {
        instructions:
          "Press space or Enter to pick the member up. Use the up and down arrow keys to choose a new place, space or Enter to drop, and Escape to cancel.",
        onDragStart: "Moving {item}.",
        onDragOver: "{item} is now over {target}.",
        onDragOverNoTarget: "{item} is not over a place in the list.",
        onDragEnd: "{item} was moved to {target}'s place.",
        onDragEndNoTarget: "{item} was dropped without being moved.",
        onDragCancel: "Moving {item} was cancelled.",
      },
      saveChanges: "Save changes",
      kindergartenInformation: "Kindergarten Information",
      contactEmail: "Contact email",
      address: "Address",
      openingHours: "Opening hours",
      numberChildren: "Number of children",
      owner: "Owner",
      directorName: "Director (name)",
      directorSName: "Director's name",
      directorEmail: "Director (email)",
      directorExampleCom: "director@example.com",
      description: "Description",
      discardChanges: "Discard changes",
      noUnsavedChanges: "No unsaved changes",
      roles: {
        leder: "Leader",
        medlem: "Member",
        vara: "Deputy"
      }
    },
    yearlyCalendar: {
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
      notes: "Notes",
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
        title: "Title",
        description: "Description",
        weekNumber: "From week",
        weekNumberEnd: "To week (optional)",
        date: "Date",
        color: "Color",
        notifyNewsletter: "Send newsletter reminder",
        notifyNewsletterHint: "The day before, the description is emailed as a reminder to all confirmed newsletter subscribers.",
        startTime: "Start time (optional)",
        endTime: "End time (optional)",
        timeHint: "Without a time the entry stays an all-day date. With a start time it appears as a normal appointment in subscribers' calendars.",
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
        emailSent: "Login details were sent by email",
        successDelete: "User deleted",
        errorDelete: "Could not delete the user"
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
