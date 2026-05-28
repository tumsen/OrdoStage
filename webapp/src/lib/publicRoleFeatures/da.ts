import type { PublicRoleFeature } from "./types";

export const rawPublicRoleFeaturesDa: PublicRoleFeature[] = [
  {
    slug: "hr-manager",
    title: "Personaleansvarlig",
    intro: "Hold styr på medarbejderlisten og onboarding uden at jage regneark.",
    heroLead:
      "OrdoStage giver HR og people operations én fælles medarbejderliste, som produktion, bemanding og rettigheder trækker på — så I onboarder én gang, og alle afdelinger arbejder ud fra samme registrering.",
    sections: [
      {
        heading: "Medarbejderliste",
        body: "Ét sted til navne, billeder, kontaktoplysninger og ansættelseskontekst.",
        bullets: [
          "Vedligehold profiler hele organisationen kan finde og genbruge",
          "Tilføj billeder, så crew og kontor genkender folk på showday",
          "Knyt personer til afdelinger og teams, der matcher jeres struktur",
        ],
      },
      {
        heading: "Teams og afdelinger",
        bullets: [
          "Spejl hvordan jeres hus eller turné er organiseret — ikke et generisk organisationsdiagram",
          "Gruppér personer til bemandingsvisninger og intern kommunikation",
          "Hold teammedlemskab synkroniseret, når folk skifter rolle midt i sæsonen",
        ],
      },
      {
        heading: "Invitationer og onboarding",
        bullets: [
          "Invitér nye medlemmer via e-mail og tildel dem den rigtige organisation",
          "Genbrug samme personregistrering på tværs af begivenheder, bemanding og tidsregistrering",
          "Reducer dubletter, når nogen arbejder på flere produktioner",
        ],
      },
      {
        heading: "Rettighedsgrupper",
        bullets: [
          "Tilpas adgang med rettighedsgrupper, så hver afdeling ser det, de har brug for",
          "Giv læse- eller skriveadgang pr. område — frivillige, freelancere og fastansatte inkluderet",
          "Understøt tillidsgrænser uden at vedligeholde separate værktøjer pr. afdeling",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "accountant", "producer"],
  },
  {
    slug: "producer",
    title: "Producent",
    intro: "Programmér sæsonen og hold kunstnerisk planlægning koblet til reelle datoer og spillesteder.",
    heroLead:
      "Fra første hold til premiere har producenter brug for programbeslutninger koblet til rigtige kalenderdata — ikke et parallelt regneark, der glider ud af sync. OrdoStage holder begivenheder, spillesteder og planer i ét levende overblik.",
    sections: [
      {
        heading: "Begivenheder og programmering",
        bullets: [
          "Kør jeres sæson eller enkeltstående forestillinger med shows, prøver og noter i én registrering",
          "Følg status fra programdialog gennem teknikuge",
          "Knyt begivenheder til spillesteder, så kunst og drift er enige om, hvad der er booket hvor",
        ],
      },
      {
        heading: "Plan og holds",
        bullets: [
          "Se holds, indflytninger og spillestedstilgængelighed i én fælles kalender",
          "Filtrér uge- og månedsvisninger på tværs af begivenheder, prøver, turneer og spillestedsbookinger",
          "Opdag konflikter, før de bliver kriser i teknikugen",
        ],
      },
      {
        heading: "Delte kalendere",
        bullets: [
          "Publicér kalendere, når partnere har brug for en skrivebeskyttet visning uden fuld adgang",
          "Eksportér eller del, når eksterne interessenter arbejder i Outlook eller Google",
          "Behold OrdoStage som sandhedskilde, mens I stadig koordinerer udadtil",
        ],
      },
      {
        heading: "Sæsonoverblik",
        body: "Se hele programbilledet — ikke kun næste forestilling.",
        bullets: [
          "Dashboard- og listevisninger for kommende begivenheder på tværs af organisationen",
          "Forbind turnédatoer med hjemmespillestedsprogram, når begge dele gælder",
          "Færre «så du opdateringen?»-øjeblikke før load-in",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "stage-manager", "tour-manager"],
  },
  {
    slug: "production-manager",
    title: "Produktionsleder",
    intro: "Koordinér deadlines, dokumenter og bemanding på tværs af hele produktionen.",
    heroLead:
      "Produktionsledere jonglerer faser, dokumenter, bemanding og kalendere på én gang. OrdoStage kobler produktionsplanlægning til de samme begivenheder og planer, som jeres stagemanagement-team stoler på — så intet sendes ud i en forældet version.",
    sections: [
      {
        heading: "Produktionsplanlægger",
        bullets: [
          "Planlæg faser og opgaver med omkostninger og noter på en produktionstidslinje",
          "Følg build- og teknikmilepæle sammen med den begivenhed, de understøtter",
          "Åbn opgavedetaljer for fasekontekst uden at forlade produktionsregistreringen",
        ],
      },
      {
        heading: "Produktionsdokumenter til begivenheder",
        bullets: [
          "Hold produktionsdokumenter og detaljer ved siden af den begivenhed, de hører til",
          "Reducer e-mailkæder med PDF'er i forskellige filnavne og datoer",
          "Giv stagemanagement og teknik ét sted at slå op før call time",
        ],
      },
      {
        heading: "Bemandingskrav",
        bullets: [
          "Sæt krav og tildelinger op for hver forestilling",
          "Brug bemandingsvisninger bygget omkring, hvordan performanceorganisationer faktisk bemandes",
          "Forbind listedata til de personer, HR allerede vedligeholder",
        ],
      },
      {
        heading: "Koordinering på tværs af kalendere",
        bullets: [
          "Filtrér planen på tværs af begivenheder, turneer, prøver og spillestedsbookinger",
          "Se indflytninger og produktionsdeadlines i samme visning som kunstneriske holds",
          "Koordinér med turnérouting, når en produktion forlader huset",
        ],
      },
    ],
    relatedSlugs: ["producer", "stage-manager", "head-of-stage"],
  },
  {
    slug: "stage-manager",
    title: "Stagemanager",
    intro: "Stol på plan og bemanding på showday — ikke en tråd med forældede beskeder.",
    heroLead:
      "På showday har stagemanagere brug for den aktuelle plan, bemanding og noter — ikke et screenshot fra i går. OrdoStage giver jer de samme live data, som kontoret bruger, filtreret til det, der betyder noget ved call time.",
    sections: [
      {
        heading: "Showday-plan",
        bullets: [
          "Se indflytninger, prøver og forestillinger i én filtrérbar kalender",
          "Uge- og månedsvisninger kombinerer begivenheder, spillestedsbookinger og turnédatoer",
          "Filtrér til det, jeres periode har brug for, uden at grave i irrelevante bookinger",
        ],
      },
      {
        heading: "Bemanding pr. begivenhed",
        bullets: [
          "Gennemgå showbemanning og tildelinger ud fra de samme data, som kontoret bruger",
          "Sæt krav og bekræftede tildelinger op pr. begivenhed",
          "Færre sidste-øjebliks-opkald, fordi nogen arbejdede ud fra en gammel liste",
        ],
      },
      {
        heading: "Noter og overleveringer",
        bullets: [
          "Åbn begivenhedsregistreringer med noter og links, som jeres crew kan stole på ved call time",
          "Hold produktionskontekst knyttet til forestillingen — ikke spredt i chat",
          "Understøt glidende overleveringer mellem prøve-, teknik- og forestillingsfaser",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "producer", "head-of-stage"],
  },
  {
    slug: "tour-manager",
    title: "Turnéleder",
    intro: "Planlæg turnéruten og hold hver by, dag og lokal pakke aligned.",
    heroLead:
      "Turné giver byer, lastbiler og lokale produktionsteams til hver beslutning. OrdoStage strukturerer turneer med dage og shows, genererer tech packs ud fra turnédata og deler planer, når partnere har brug for et link — ikke login til hele jeres organisation.",
    sections: [
      {
        heading: "Turnéstruktur",
        bullets: [
          "Strukturér turneer med dage, byer og shows, så routing forbliver overskuelig",
          "Se produktionsdeadlines sammen med rejse- og forestillingsdatoer",
          "Hold turnédetaljer tilgængelige for produktion uden at indtaste alt i regneark igen",
        ],
      },
      {
        heading: "Tekniske riders",
        bullets: [
          "Generér og del spillestedstekniske riders ud fra turnédata til lokale produktionsteams",
          "Færre «hvilken version er det?»-øjeblikke, når lastbilen ruller ind",
          "Giv front of house og lokalt crew den samme pakke, som jeres hjemmehold har godkendt",
        ],
      },
      {
        heading: "Offentlige turnélinks",
        bullets: [
          "Del offentlige eller personlige turnéplaner, når kunstnere og partnere har brug for et link",
          "Skrivebeskyttet adgang uden at give slip på kontrollen over hele organisationen",
          "Opdatér én gang i OrdoStage — alle med linket ser aktuelle datoer",
        ],
      },
      {
        heading: "Routing vs. spillestedsdatoer",
        bullets: [
          "Koordinér turnédatoer sammen med spillestedsbookinger og produktionsdeadlines",
          "Align hjemmespillesteds-holds med turnedatoer, når en forestilling både turnerer og har base",
          "Ét kalenderbillede til routingbeslutninger — ikke tre værktøjer, der er uenige",
        ],
      },
    ],
    relatedSlugs: ["head-of-stage", "production-manager", "producer"],
  },
  {
    slug: "head-of-stage",
    title: "Scenchef",
    intro: "Ejer spillestedsspecifikationer, lokaleinventar og teknisk information dér, hvor bookinger lever.",
    heroLead:
      "Tekniske afdelinger lever i specifikationer, filer og lokaletilgængelighed. OrdoStage holder spillestedsinventar, dokumenter og bookingkalendere samlet — så kunstnerisk programmering og scenedrift er enige om, hvad der er muligt hvornår.",
    sections: [
      {
        heading: "Spillestedsinventar",
        bullets: [
          "Vedligehold hver scene, sal og studie i ét samlet inventar",
          "Tilføj dokumenter og miniaturebilleder til det spillested, de beskriver",
          "Understøt organisationer med flere spillesteder og præsentationshuse med mange lokaler",
        ],
      },
      {
        heading: "Specifikationer og filer",
        bullets: [
          "Hold specifikationer og filer ved siden af lokalet — ikke tabt i e-mailvedhæftninger",
          "Reducer gensendelse af samme PDF, når en turné ankommer til en ny by",
          "Giv produktion og gæstende crew én autoritativ kilde pr. spillested",
        ],
      },
      {
        heading: "Spillestedsbookingkalender",
        bullets: [
          "Brug spillestedsbookingkalendere, så kunst og drift er enige om, hvad der er muligt",
          "Se holds, indflytninger og vedligeholdelse ved siden af det lokale, de påvirker",
          "Understøt interne bookinger adskilt fra offentlig begivenhedsprogrammering",
        ],
      },
      {
        heading: "Tekniske turnépakker",
        bullets: [
          "Understøt turnerende forestillinger med ensartet teknisk information ved hvert stop",
          "Generér riders ud fra turnédata, så lokale teams får det, de har brug for",
          "Align gæsteproduktionskrav med jeres spillesteds faktiske inventar",
        ],
      },
    ],
    relatedSlugs: ["tour-manager", "stage-manager", "production-manager"],
  },
  {
    slug: "accountant",
    title: "Bogholder",
    intro: "Gør crew-timer og virksomhedsoplysninger til tal, som økonomi kan arbejde med.",
    heroLead:
      "Økonomi har brug for timer, eksporter og virksomhedsoplysninger ét sted — ikke en mappe med timesedler efter sidste forestilling. OrdoStage forbinder tidsregistrering med det arbejde, crew faktisk udførte, og holder faktureringskontekst i organisationskontoen.",
    sections: [
      {
        heading: "Rapporter og eksporter",
        bullets: [
          "Kør tidsrapporter til lønforberedelse og retrospektiv omkostningsopgørelse",
          "Eksportér data, når økonomi skal afstemme uden for OrdoStage",
          "Hold ledere og økonomi aligned på de samme tal",
        ],
      },
      {
        heading: "Virksomhedskontooplysninger",
        bullets: [
          "Gem virksomheds- og fakturaoplysninger i organisationskontoen",
          "Hold faktureringskontakt og juridisk enhedsinformation, hvor ejere forventer det",
          "Understøt organisationsindstillinger, som økonomi har brug for til fakturering",
        ],
      },
      {
        heading: "Planer og fakturering",
        body: "Ejere vælger Flex (månedlig efterbetaling) eller Yearly (forpligtede pladser) — se priser for pladsniveauer og plansammenligning.",
        bullets: [
          "Flex skalerer med aktive fakturerbare medlemmer måned for måned",
          "Yearly tilbyder forpligtet pladsprissætning til stabile teams",
          "Fakturering administreres af organisationsejere under Konto",
        ],
      },
    ],
    relatedSlugs: ["hr-manager", "stage-manager", "production-manager"],
  },
];
