const APP_VERSION = "1.0";

// Wochentage des Plans (kein Sonntag im Bestand).
const TAGE = [
  { id: "Mo", name: "Montag" },
  { id: "Di", name: "Dienstag" },
  { id: "Mi", name: "Mittwoch" },
  { id: "Do", name: "Donnerstag" },
  { id: "Fr", name: "Freitag" },
  { id: "Sa", name: "Samstag" }
];

const SLOT_MIN = 30;               // Raster-Granularität in Minuten
const DEFAULT_GRID_START = "15:30"; // Fallback-Fenster, falls ein Tag keine Termine hat
const DEFAULT_GRID_END = "22:00";

// Höchstzahl gespeicherter Backups. Ist der Vorrat voll, wird NICHTS automatisch
// gelöscht — die App verlangt stattdessen, dass zuerst eines von Hand entfernt
// wird (bewusste Entscheidung: ein Backup verschwindet nie ungefragt).
const MAX_BACKUPS = 10;

// Startbestand für Plätze & Kategorien — greift, wenn im Gateway noch keine bzw.
// leere Daten liegen, damit die App (Dropdowns, Gitter) auch vor dem Excel-Import
// bedienbar ist. Muss zu tools/excel-to-seed.ps1 passen.
const DEFAULT_PLAETZE = [
  { id: "stadion-l", name: "Stadion links", standort: "Hauptplatz" },
  { id: "stadion-r", name: "Stadion rechts", standort: "Hauptplatz" },
  { id: "parkplatz", name: "KuRa Links", standort: "Hauptplatz" },
  { id: "kunstrasen", name: "KuRa Rechts", standort: "Hauptplatz" },
  { id: "kabinenseite", name: "Torwartplatz", standort: "Hauptplatz" },
  { id: "kleiner-platz", name: "Kleiner Platz / Käfig", standort: "Hauptplatz" },
  { id: "stelzenberg-vorne", name: "Stelzenberg vorne", standort: "Hauptplatz" },
  { id: "stelzenberg", name: "Stelzenberg hinten", standort: "Hauptplatz" },
  { id: "kalteneber-l", name: "Kalteneber links", standort: "Kalteneber" },
  { id: "kalteneber-r", name: "Kalteneber rechts", standort: "Kalteneber" },
  { id: "rengelrode-l", name: "Rengelrode vorne", standort: "Rengelrode" },
  { id: "rengelrode-r", name: "Rengelrode hinten", standort: "Rengelrode" },
  { id: "guenterode-l", name: "Günterode links", standort: "Günterode" },
  { id: "guenterode-r", name: "Günterode rechts", standort: "Günterode" }
];

// Startbestand für die Hallen (Hallensaison) — analog zu DEFAULT_PLAETZE, greift bei
// leerem Gateway-Stand. Ids/Namen aus tools/hallen-excel-to-seed.ps1 (Excel-Import).
const DEFAULT_HALLEN = [
  { id: "stadionhalle", name: "Stadionhalle", standort: "Stadionhalle" },
  { id: "lkh-kurpark", name: "LK Halle Kurpark", standort: "LK Halle Kurpark" },
  { id: "kath-gymn", name: "Kath. Gymnasium", standort: "Kath. Gymnasium" },
  { id: "liethenhalle", name: "Liethenhalle", standort: "Liethenhalle" },
  { id: "stormhalle", name: "Th.-Storm-Schule (große Sporthalle)", standort: "Th.-Storm-Schule (große Sporthalle)" },
  { id: "solidorhalle", name: "Solidorhalle / Staatl. Gymnasium", standort: "Solidorhalle / Staatl. Gymnasium" }
];

const DEFAULT_KATEGORIEN = [
  { id: "sch", name: "1. SC 1911 (Herren & Jugend)", farbe: "#1a56a0" },
  { id: "dfb", name: "DFB-Stützpunkt", farbe: "#8a5a2b" },
  { id: "nf", name: "Nachwuchsförderung", farbe: "#e08a1e" },
  { id: "tsv", name: "TSV / Kooperation", farbe: "#2e8b57" },
  { id: "freizeit", name: "Freizeit / Breitensport", farbe: "#0d9488" },
  { id: "fremd", name: "Fremdverein / extern", farbe: "#c0392b" },
  { id: "frei", name: "Freie Zeit", farbe: "#e9ecef" }
];

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Platzbelegung & Hallenbelegung",
        items: [
          "Zwei komplett getrennte Bereiche: Platzbelegung (14 Plätze am Hauptplatz sowie in Kalteneber, Rengelrode und Günterode) und Hallenbelegung für die Hallensaison (6 Hallen: Stadionhalle, LK Halle Kurpark, Kath. Gymnasium, Liethenhalle, Th.-Storm-Schule, Solidorhalle/Staatl. Gymnasium) — jeweils eigenes Gitter, eigene Liste und eigener Excel-Import.",
          "Wochenplan als Gitter (Zeit × Platz bzw. Halle) je Wochentag Montag–Samstag, farblich nach Kategorie.",
          "Filterbare Terminliste (nach Tag, Standort, Kategorie und Textsuche) — ideal fürs Handy.",
          "Die Terminliste lässt sich als PDF speichern oder ausdrucken — genau in dem Umfang, den der eingestellte Filter gerade zeigt, nach Wochentagen gegliedert und mit den Farben der Kategorien.",
          "Standort-Filter trennt den Hauptplatz von den Außenstandorten.",
          "Auf eine Belegung im Gitter oder in der Liste klicken zeigt alle Details (Ansprechpartner, Notiz) in einer Ansehen-Ansicht — auch für Nutzer ohne Bearbeiten-Recht."
        ]
      },
      {
        title: "Bearbeiten (Admin & berechtigte Gruppen)",
        items: [
          "Belegungen anlegen, ändern und löschen über ein Formular (Tag, Platz/Halle, Start/Ende, Kürzel, Ansprechpartner, Kategorie, Notiz) — mit Warnung, wenn sich die Zeit mit einer bestehenden Belegung überschneidet.",
          "Direkt auf ein freies Feld im Gitter tippen legt eine neue Belegung für diesen Platz und diese Zeit an.",
          "Bestehende Belegungen im Gitter per Drag & Drop auf ein freies Feld verschieben.",
          "Bearbeiten-Recht wird über die Gruppenverwaltung der Tools-Übersicht vergeben; alle übrigen eingeloggten Nutzer sehen den Plan nur an."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Einmaliger Import des bestehenden Excel-Plans (als JSON) je Bereich per Knopfdruck.",
          "Automatische Nextcloud-Synchronisierung über die zentrale Anmeldung (Tools-Übersicht) — kein separates Passwort nötig; gleichzeitige Änderungen von zwei Geräten werden erkannt und gemeldet."
        ]
      },
      {
        title: "Backups",
        items: [
          "Im Tab „Einstellungen“ lassen sich bis zu 10 Backups anlegen — jedes sichert den vollständigen Stand beider Bereiche (Platzbelegung und Hallenbelegung) und kann mit einem Kommentar versehen werden.",
          "Jeder gesicherte Stand lässt sich per Knopfdruck wieder herstellen; die Liste zeigt Zeitpunkt, wer gesichert hat, den Kommentar und die Anzahl der enthaltenen Belegungen.",
          "Vor einem Excel-Import und vor dem Wiederherstellen legt die App automatisch einen Sicherungspunkt an — die beiden Momente, in denen viel auf einmal überschrieben wird.",
          "Es wird nie ein Backup von selbst gelöscht: sind alle 10 Plätze belegt, meldet die App das und wartet, bis eines von Hand entfernt wurde."
        ]
      }
    ]
  }
];
