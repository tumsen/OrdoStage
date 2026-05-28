import type { PublicRoleFeature } from "./types";

export const rawPublicRoleFeaturesDe: PublicRoleFeature[] = [
  {
    slug: "hr-manager",
    title: "HR-Manager",
    intro: "Halten Sie Ihre Personalübersicht aktuell und onboarden Sie Mitarbeitende, ohne Tabellen hinterherzujagen.",
    heroLead:
      "OrdoStage gibt HR und People Operations eine gemeinsame Personalübersicht, aus der Produktion, Besetzung und Berechtigungen schöpfen — Sie onboarden einmal, und jede Abteilung arbeitet mit demselben Datensatz.",
    sections: [
      {
        heading: "Personalübersicht",
        body: "Ein Ort für Namen, Fotos, Kontaktdaten und Beschäftigungskontext.",
        bullets: [
          "Pflegen Sie Profile, die Ihre gesamte Organisation finden und wiederverwenden kann",
          "Fügen Sie Fotos hinzu, damit Crew und Büro Personen am Showtag wiedererkennen",
          "Verknüpfen Sie Personen mit Abteilungen und Teams, die Ihrer Struktur entsprechen",
        ],
      },
      {
        heading: "Teams und Abteilungen",
        bullets: [
          "Spiegeln Sie, wie Ihr Haus oder Ihre Tour organisiert ist — kein generisches Organigramm",
          "Gruppieren Sie Personen für Besetzungsansichten und interne Kommunikation",
          "Halten Sie Teamzugehörigkeiten synchron, wenn Personen mitten in der Saison die Rolle wechseln",
        ],
      },
      {
        heading: "Einladungen und Onboarding",
        bullets: [
          "Laden Sie neue Mitglieder per E-Mail ein und weisen Sie sie der richtigen Organisation zu",
          "Verwenden Sie denselben Personendatensatz für Ereignisse, Besetzung und Zeiterfassung",
          "Reduzieren Sie Doppeleinträge, wenn jemand an mehreren Produktionen mitarbeitet",
        ],
      },
      {
        heading: "Berechtigungsgruppen",
        bullets: [
          "Passen Sie den Zugriff mit Berechtigungsgruppen an, damit jede Abteilung sieht, was sie braucht",
          "Gewähren Sie Lese- oder Schreibzugriff nach Bereich — Freiwillige, Freelancer und Festangestellte eingeschlossen",
          "Unterstützen Sie Vertrauensgrenzen, ohne separate Tools pro Abteilung zu pflegen",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "accountant", "producer"],
  },
  {
    slug: "producer",
    title: "Produzent",
    intro: "Programmieren Sie die Saison und halten Sie künstlerische Planung an echte Termine und Spielorte gebunden.",
    heroLead:
      "Vom ersten Hold bis zur Premiere brauchen Produzenten Programmierentscheidungen, die an echte Kalenderdaten gebunden sind — nicht an eine parallele Tabelle, die veraltet. OrdoStage hält Ereignisse, Spielorte und Zeitpläne in einem live Bild zusammen.",
    sections: [
      {
        heading: "Ereignisse und Programmierung",
        bullets: [
          "Führen Sie Ihre Saison oder Einzelveranstaltungen mit Shows, Proben und Notizen in einem Datensatz",
          "Verfolgen Sie den Status vom Programmiergespräch bis zur Technischen Woche",
          "Verknüpfen Sie Ereignisse mit Spielorten, damit künstlerische Leitung und Betrieb einig sind, was wo gebucht ist",
        ],
      },
      {
        heading: "Zeitplan und Holds",
        bullets: [
          "Sehen Sie Holds, Einbauten und Spielortverfügbarkeit in einem gemeinsamen Kalender",
          "Filtern Sie Wochen- und Monatsansichten über Ereignisse, Proben, Tourneen und Spielortbuchungen",
          "Erkennen Sie Konflikte, bevor sie in der Technischen Woche zur Krise werden",
        ],
      },
      {
        heading: "Geteilte Kalender",
        bullets: [
          "Veröffentlichen Sie Kalender, wenn Partner eine schreibgeschützte Ansicht ohne vollen Zugriff brauchen",
          "Exportieren oder teilen Sie, wenn externe Stakeholder in Outlook oder Google arbeiten",
          "Behalten Sie OrdoStage als Quelle der Wahrheit und koordinieren Sie dennoch nach außen",
        ],
      },
      {
        heading: "Saisonüberblick",
        body: "Sehen Sie das gesamte Programmbild — nicht nur die nächste Show.",
        bullets: [
          "Dashboard- und Listenansichten für bevorstehende Ereignisse in Ihrer Organisation",
          "Verbinden Sie Tourtermine mit der Programmierung am Heimspielort, wenn beides gilt",
          "Weniger «Hast du das Update gesehen?»-Momente vor dem Load-in",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "stage-manager", "tour-manager"],
  },
  {
    slug: "production-manager",
    title: "Produktionsleiter",
    intro: "Koordinieren Sie Deadlines, Dokumente und Besetzungsanforderungen über die gesamte Produktion hinweg.",
    heroLead:
      "Produktionsleiter jonglieren gleichzeitig mit Phasen, Dokumenten, Besetzung und Kalendern. OrdoStage verbindet Produktionsplanung mit denselben Ereignissen und Zeitplänen, auf die Ihr Stage-Management-Team setzt — damit nichts in einer veralteten Version rausgeht.",
    sections: [
      {
        heading: "Produktionsplaner",
        bullets: [
          "Planen Sie Phasen und Aufgaben mit Kosten und Notizen auf einer Produktionszeitachse",
          "Verfolgen Sie Build- und Technik-Meilensteine zusammen mit dem Ereignis, das sie unterstützen",
          "Öffnen Sie Aufgabendetails für Phasenkontext, ohne den Produktionsdatensatz zu verlassen",
        ],
      },
      {
        heading: "Produktionsdokumente zu Ereignissen",
        bullets: [
          "Halten Sie Produktionsdokumente und Details neben dem Ereignis, zu dem sie gehören",
          "Reduzieren Sie E-Mail-Ketten mit PDFs in unterschiedlichen Dateinamen und Datumsangaben",
          "Geben Sie Stage Management und Technik einen Ort zum Nachschlagen vor der Call Time",
        ],
      },
      {
        heading: "Besetzungsanforderungen",
        bullets: [
          "Richten Sie Anforderungen und Zuweisungen für jede Show aus",
          "Nutzen Sie Besetzungsansichten, die auf die tatsächliche Besetzungspraxis von Performance-Organisationen zugeschnitten sind",
          "Verbinden Sie Personaldaten mit den Personen, die HR bereits pflegt",
        ],
      },
      {
        heading: "Kalenderübergreifende Koordination",
        bullets: [
          "Filtern Sie den Zeitplan über Ereignisse, Tourneen, Proben und Spielortbuchungen",
          "Sehen Sie Einbauten und Produktionsdeadlines in derselben Ansicht wie künstlerische Holds",
          "Koordinieren Sie mit Tourrouting, wenn eine Produktion das Haus verlässt",
        ],
      },
    ],
    relatedSlugs: ["producer", "stage-manager", "head-of-stage"],
  },
  {
    slug: "stage-manager",
    title: "Inspizient",
    intro: "Vertrauen Sie am Showtag auf Zeitplan und Besetzungsbild — nicht auf einen Thread veralteter Nachrichten.",
    heroLead:
      "Am Showtag brauchen Inspizienten den aktuellen Zeitplan, die Besetzung und Notizen — keinen Screenshot von gestern. OrdoStage liefert dieselben Live-Daten wie das Büro, gefiltert auf das, was zur Call Time zählt.",
    sections: [
      {
        heading: "Showtag-Zeitplan",
        bullets: [
          "Sehen Sie Einbauten, Proben und Aufführungen in einem filterbaren Kalender",
          "Wochen- und Monatsansichten kombinieren Ereignisse, Spielortbuchungen und Tourtermine",
          "Filtern Sie auf das, was Ihr Lauf braucht, ohne irrelevante Buchungen zu durchsuchen",
        ],
      },
      {
        heading: "Besetzung pro Ereignis",
        bullets: [
          "Prüfen Sie Show-Besetzung und Zuweisungen aus denselben Daten wie das Büro",
          "Richten Sie Anforderungen und bestätigte Zuweisungen pro Ereignis aus",
          "Weniger Last-Minute-Anrufe, weil jemand mit einer alten Liste gearbeitet hat",
        ],
      },
      {
        heading: "Notizen und Übergaben",
        bullets: [
          "Öffnen Sie Ereignisdatensätze mit Notizen und Links, auf die Ihre Crew zur Call Time vertrauen kann",
          "Halten Sie Produktionskontext an der Show — nicht verstreut im Chat",
          "Unterstützen Sie reibungslose Übergaben zwischen Probe-, Technik- und Aufführungsphasen",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "producer", "head-of-stage"],
  },
  {
    slug: "tour-manager",
    title: "Tourmanager",
    intro: "Planen Sie die Tour und halten Sie jede Stadt, jeden Tag und jedes lokale Paket abgestimmt.",
    heroLead:
      "Tourneen fügen jeder Entscheidung Städte, Lkw und lokale Produktionsteams hinzu. OrdoStage strukturiert Tourneen mit Tagen und Shows, erzeugt Tech Packs aus Tourdaten und teilt Zeitpläne, wenn Partner einen Link brauchen — keinen Login in Ihre gesamte Organisation.",
    sections: [
      {
        heading: "Tourstruktur",
        bullets: [
          "Strukturieren Sie Tourneen mit Tagen, Städten und Shows, damit das Routing übersichtlich bleibt",
          "Sehen Sie Produktionsdeadlines neben Reise- und Aufführungsterminen",
          "Halten Sie Tourdetails für die Produktion zugänglich, ohne alles erneut in Tabellen einzutippen",
        ],
      },
      {
        heading: "Technische Riders",
        bullets: [
          "Erzeugen und teilen Sie Spielort-Tech-Riders aus Tourdaten für lokale Produktionsteams",
          "Weniger «Welche Version ist das?»-Momente, wenn der Lkw eintrifft",
          "Geben Sie Front of House und lokaler Crew dasselbe Paket, das Ihr Heimteam freigegeben hat",
        ],
      },
      {
        heading: "Öffentliche Tour-Links",
        bullets: [
          "Teilen Sie öffentliche oder persönliche Tourzeitpläne, wenn Künstler und Partner einen Link brauchen",
          "Schreibgeschützter Zugriff, ohne die Kontrolle über Ihre gesamte Organisation abzugeben",
          "Einmal in OrdoStage aktualisieren — jeder mit dem Link sieht aktuelle Termine",
        ],
      },
      {
        heading: "Routing vs. Spielorttermine",
        bullets: [
          "Koordinieren Sie Tourtermine neben Spielortbuchungen und Produktionsdeadlines",
          "Stimmen Sie Holds am Heimspielort mit Terminen auf der Straße ab, wenn eine Show tourt und zugleich residiert",
          "Ein Kalenderbild für Routing-Entscheidungen — nicht drei Tools, die sich widersprechen",
        ],
      },
    ],
    relatedSlugs: ["head-of-stage", "production-manager", "producer"],
  },
  {
    slug: "head-of-stage",
    title: "Leiter der Bühne",
    intro: "Verwalten Sie Spielortspezifikationen, Rauminventar und technische Informationen dort, wo Buchungen leben.",
    heroLead:
      "Technische Abteilungen leben in Spezifikationen, Dateien und Raumverfügbarkeit. OrdoStage hält Spielortinventar, Dokumente und Buchungskalender zusammen — damit künstlerische Programmierung und Bühnenbetrieb einig sind, was wann möglich ist.",
    sections: [
      {
        heading: "Spielortinventar",
        bullets: [
          "Pflegen Sie jede Bühne, jeden Saal und jedes Studio in einem zentralen Inventar",
          "Fügen Sie Dokumente und Vorschaubilder dem Spielort hinzu, den sie beschreiben",
          "Unterstützen Sie Organisationen mit mehreren Spielorten und Präsentationshäusern mit vielen Räumen",
        ],
      },
      {
        heading: "Spezifikationen und Dateien",
        bullets: [
          "Halten Sie Spezifikationen und Dateien neben dem Raum — nicht verloren in E-Mail-Anhängen",
          "Reduzieren Sie das erneute Versenden derselben PDF, wenn eine Tour in einer neuen Stadt ankommt",
          "Geben Sie Produktion und Gast-Crew eine autoritative Quelle pro Spielort",
        ],
      },
      {
        heading: "Spielort-Buchungskalender",
        bullets: [
          "Nutzen Sie Spielort-Buchungskalender, damit künstlerische Leitung und Betrieb einig sind, was möglich ist",
          "Sehen Sie Holds, Einbauten und Wartung neben dem Raum, den sie betreffen",
          "Unterstützen Sie interne Buchungen getrennt von der öffentlichen Ereignisprogrammierung",
        ],
      },
      {
        heading: "Technische Tour-Pakete",
        bullets: [
          "Unterstützen Sie tournde Shows mit konsistenter technischer Information an jedem Stopp",
          "Erzeugen Sie Riders aus Tourdaten, damit lokale Teams bekommen, was sie brauchen",
          "Stimmen Sie Anforderungen der Gastproduktion mit dem tatsächlichen Inventar Ihres Spielorts ab",
        ],
      },
    ],
    relatedSlugs: ["tour-manager", "stage-manager", "production-manager"],
  },
  {
    slug: "accountant",
    title: "Buchhalter",
    intro: "Machen Sie Crew-Stunden und Unternehmensdaten zu Zahlen, mit denen die Finanzabteilung arbeiten kann.",
    heroLead:
      "Die Finanzabteilung braucht Stunden, Exporte und Unternehmensdaten an einem Ort — keinen Ordner mit Stundenzetteln nach dem letzten Abend. OrdoStage verbindet Zeiterfassung mit der Arbeit, die die Crew tatsächlich geleistet hat, und hält Abrechnungskontext im Organisationskonto.",
    sections: [
      {
        heading: "Berichte und Exporte",
        bullets: [
          "Erstellen Sie Zeitberichte für die Lohnvorbereitung und retrospektive Kostenrechnung",
          "Exportieren Sie Daten, wenn die Finanzabteilung außerhalb von OrdoStage abgleichen muss",
          "Halten Sie Führungskräfte und Finanzabteilung auf denselben Zahlen",
        ],
      },
      {
        heading: "Unternehmenskontodaten",
        bullets: [
          "Speichern Sie Unternehmens- und Rechnungsdaten im Organisationskonto",
          "Halten Sie Rechnungskontakt und Informationen zur juristischen Person dort, wo Eigentümer sie erwarten",
          "Unterstützen Sie organisationweite Einstellungen, die die Finanzabteilung für die Rechnungsstellung braucht",
        ],
      },
      {
        heading: "Pläne & Abrechnung",
        body: "Eigentümer wählen Flex (monatliche Nachzahlung) oder Yearly (gebundene Plätze) — siehe Preise für Platzstufen und Planvergleich.",
        bullets: [
          "Flex skaliert monatlich mit aktiven abrechenbaren Mitgliedern",
          "Yearly bietet gebundene Platzpreise für stabile Teams",
          "Die Abrechnung wird von Organisationseigentümern unter Konto verwaltet",
        ],
      },
    ],
    relatedSlugs: ["hr-manager", "stage-manager", "production-manager"],
  },
];
