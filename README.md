# Platzbelegung (v1.0)

Belegungsplan für die Trainingsplätze und Hallen des 1. SC 1911 Heiligenstadt — Teil der
[Tools-Übersicht](https://tecko1985.github.io/ToolsUebersicht/).

Wer nutzt wann welchen Platz bzw. welche Halle: Wochenplan (Montag–Samstag) als Gitter
(Zeit × Platz) sowie als filterbare Terminliste. Zwei komplett getrennte Bereiche:

- **⚽ Platzbelegung** — 14 Plätze am Hauptplatz sowie an den Außenstandorten
  Kalteneber, Rengelrode und Günterode.
- **🏀 Hallenbelegung** — 6 Hallen für die Hallensaison (Stadionhalle, LK Halle Kurpark,
  Kath. Gymnasium, Liethenhalle, Th.-Storm-Schule, Solidorhalle/Staatl. Gymnasium).

Alle eingeloggten Nutzer können die Pläne einsehen; **Bearbeiten dürfen Administratoren
und Mitglieder von Gruppen mit Bearbeiten-Recht für Platzbelegung** (vergeben in der
Tools-Übersicht-Gruppenverwaltung).

## Bedienung

- **Gitter** — Bereich und Tag auswählen, Belegungen erscheinen farbig nach Kategorie im
  Zeitraster. Standort-Filter trennt Hauptplatz von den Außenstandorten.
- **Liste** — alle Termine, filterbar nach Tag, Standort, Kategorie und Textsuche
  (handyfreundlich).
- **Ansehen** — auf eine Belegung im Gitter oder in der Liste klicken zeigt alle Details
  (Ansprechpartner, Notiz) in einer Ansehen-Ansicht, auch ohne Bearbeiten-Recht.
- **Bearbeiten** — auf eine Belegung tippen zum Ändern/Löschen, auf ein freies Feld tippen
  legt eine neue an (oder „+ Neue Belegung“, Felder u. a. Kürzel, Ansprechpartner,
  Kategorie, Notiz). Belegungen lassen sich im Gitter per Drag & Drop verschieben; bei
  Zeit-Überschneidungen warnt die App.

## Technik

Vanilla-JS-App (kein Build-Step), Anmeldung & Speicherung laufen über das zentrale
ToolsUebersicht-Login-Gateway (`admin-worker.js`), das die Daten serverseitig in der
Vereins-Nextcloud ablegt (`platzbelegung.json`). Kein separates Passwort im Client;
gleichzeitige Änderungen von zwei Geräten werden erkannt und gemeldet.

- `index.html`, `app.js`, `db.js`, `config.js`, `style.css` — die App
- `tools/excel-to-seed.ps1` — einmalige Konvertierung des Excel-Platzplans nach
  `platzbelegung-seed.json`
- `tools/hallen-excel-to-seed.ps1` — dito für den Hallenplan (`hallenbelegung-seed.json`)

## Erstbefüllung

1. Als berechtigter Nutzer anmelden, Bereich wählen, Tab **Einstellungen** →
   „Datendatei auswählen…“ → die jeweilige Seed-JSON wählen.
2. Danach wird der Plan ausschließlich in der App gepflegt.
