// ---------- Helpers ----------
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "bxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function timeToMin(t) {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function isoToDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Textfarbe (schwarz/weiß) je nach Helligkeit der Hintergrundfarbe.
function contrastColor(hex) {
  const c = (hex || "").replace("#", "");
  if (c.length !== 6) return "#1e2330";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e2330" : "#ffffff";
}

// ---------- Bereich (Platzbelegung / Hallenbelegung) ----------
// Beide Bereiche teilen sich Kategorien und Wochentage, haben aber komplett getrennte
// Orts- und Belegungslisten (eigene Stammdaten, eigenes Meta/Import) — siehe BEREICHE.
const BEREICHE = {
  platz: { ortsKey: "plaetze", belegKey: "belegungen", metaKey: "meta", ortsField: "platz", ortLabel: "Platz" },
  halle: { ortsKey: "hallen", belegKey: "hallenbelegungen", metaKey: "hallenMeta", ortsField: "halle", ortLabel: "Halle" }
};
let currentBereich = "platz";
function bcfg() { return BEREICHE[currentBereich]; }

// ---------- State ----------
let appData = { meta: {}, plaetze: [], kategorien: [], belegungen: [], hallenMeta: {}, hallen: [], hallenbelegungen: [] };
let currentUser = null;
let currentDay = TAGE[0].id;
let editingBelegungId = null;
let persistTimer = null;

// ---------- Normalisierung & Lookups ----------
function normalizeData(data) {
  const d = data && typeof data === "object" ? data : {};
  return {
    meta: d.meta && typeof d.meta === "object" ? d.meta : {},
    plaetze: Array.isArray(d.plaetze) && d.plaetze.length ? d.plaetze : DEFAULT_PLAETZE.slice(),
    kategorien: Array.isArray(d.kategorien) && d.kategorien.length ? d.kategorien : DEFAULT_KATEGORIEN.slice(),
    belegungen: Array.isArray(d.belegungen) ? d.belegungen : [],
    hallenMeta: d.hallenMeta && typeof d.hallenMeta === "object" ? d.hallenMeta : {},
    hallen: Array.isArray(d.hallen) && d.hallen.length ? d.hallen : DEFAULT_HALLEN.slice(),
    hallenbelegungen: Array.isArray(d.hallenbelegungen) ? d.hallenbelegungen : []
  };
}
function ortsListe() { return appData[bcfg().ortsKey]; }
function belegungsListe() { return appData[bcfg().belegKey]; }
function currentMeta() { return appData[bcfg().metaKey] || {}; }
function ortById(id) { return ortsListe().find((p) => p.id === id) || null; }
function kategorieById(id) { return appData.kategorien.find((k) => k.id === id) || null; }
function ortName(id) { const p = ortById(id); return p ? p.name : id; }
function tagName(id) { const t = TAGE.find((x) => x.id === id); return t ? t.name : id; }
function tagIndex(id) { return TAGE.findIndex((x) => x.id === id); }
function ortIndex(id) { return ortsListe().findIndex((p) => p.id === id); }

// Standorte in Reihenfolge des ersten Auftretens (im aktuellen Bereich).
function standorte() {
  const seen = [];
  ortsListe().forEach((p) => { const s = p.standort || "—"; if (!seen.includes(s)) seen.push(s); });
  return seen;
}

// ---------- Selects befüllen ----------
function fillSelect(el, options, allLabel) {
  if (!el) return;
  const cur = el.value;
  el.innerHTML = (allLabel != null ? `<option value="">${escapeHtml(allLabel)}</option>` : "") +
    options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  if ([...el.options].some((o) => o.value === cur)) el.value = cur;
}

function populateFilters() {
  const stOpts = standorte().map((s) => ({ value: s, label: s }));
  const katOpts = appData.kategorien.map((k) => ({ value: k.id, label: k.name }));
  fillSelect(document.getElementById("gitter-standort"), stOpts, "Alle Standorte");
  fillSelect(document.getElementById("liste-standort"), stOpts, "Alle Standorte");
  fillSelect(document.getElementById("liste-tag"), TAGE.map((t) => ({ value: t.id, label: t.name })), "Alle Tage");
  fillSelect(document.getElementById("liste-kategorie"), katOpts, "Alle Kategorien");
}

// ---------- Tagesumschalter ----------
function renderDaySwitch() {
  const el = document.getElementById("day-switch");
  el.innerHTML = TAGE.map((t) =>
    `<button data-day="${t.id}" class="${t.id === currentDay ? "active" : ""}">${escapeHtml(t.name)}</button>`
  ).join("");
}

// ---------- Legende ----------
function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = appData.kategorien
    .filter((k) => k.id !== "frei")
    .map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:${escapeHtml(k.farbe)}"></span>${escapeHtml(k.name)}</span>`)
    .join("");
}

// ---------- Gitter ----------
let draggedBookingId = null;

function renderGrid() {
  const ortsField = bcfg().ortsField;
  const stf = document.getElementById("gitter-standort").value;
  const orte = ortsListe().filter((p) => !stf || (p.standort || "—") === stf);
  const ortIds = new Set(orte.map((p) => p.id));
  const bookings = belegungsListe().filter((b) => b.tag === currentDay && ortIds.has(b[ortsField]));

  const emptyEl = document.getElementById("gitter-empty");
  const gridEl = document.getElementById("grid");

  if (bookings.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  let startMin = Math.min(...bookings.map((b) => timeToMin(b.start)).filter((x) => x != null));
  let endMin = Math.max(...bookings.map((b) => timeToMin(b.ende)).filter((x) => x != null));
  if (!isFinite(startMin)) startMin = timeToMin(DEFAULT_GRID_START);
  if (!isFinite(endMin)) endMin = timeToMin(DEFAULT_GRID_END);
  const slotCount = Math.max(1, Math.round((endMin - startMin) / SLOT_MIN));

  // pro Ort: welche Belegung startet in Slot i, und welche Slots sind überdeckt
  const startMap = {}, covered = {};
  orte.forEach((p) => { startMap[p.id] = {}; covered[p.id] = new Set(); });
  bookings.forEach((b) => {
    const s = timeToMin(b.start), e = timeToMin(b.ende);
    if (s == null || e == null || e <= s) return;
    const si = Math.round((s - startMin) / SLOT_MIN);
    const span = Math.round((e - s) / SLOT_MIN);
    const ortId = b[ortsField];
    if (!startMap[ortId]) return;
    startMap[ortId][si] = { b, span };
    for (let k = si + 1; k < si + span; k++) covered[ortId].add(k);
  });

  let html = '<table class="grid-table"><thead><tr><th class="col-time">Zeit</th>';
  orte.forEach((p) => { html += `<th>${escapeHtml(p.name)}</th>`; });
  html += "</tr></thead><tbody>";

  for (let i = 0; i < slotCount; i++) {
    const slotMin = startMin + i * SLOT_MIN;
    html += `<tr><td class="slot-time">${minToTime(slotMin)}</td>`;
    orte.forEach((p) => {
      if (covered[p.id].has(i)) return; // von rowspan überdeckt
      const entry = startMap[p.id][i];
      if (entry) {
        const kat = kategorieById(entry.b.kategorie);
        const bg = kat ? kat.farbe : "#e9ecef";
        const fg = contrastColor(bg);
        html += `<td class="slot-booking" rowspan="${entry.span}" style="background:${escapeHtml(bg)};color:${fg}" data-id="${escapeHtml(entry.b.id)}" draggable="true" title="${escapeHtml(entry.b.start + "–" + entry.b.ende + " · " + p.name)}">${escapeHtml(entry.b.label)}</td>`;
      } else {
        html += `<td class="slot-free" data-ort="${escapeHtml(p.id)}" data-slotmin="${slotMin}"></td>`;
      }
    });
    html += "</tr>";
  }
  html += "</tbody></table>";
  gridEl.innerHTML = html;
}

// ---------- Liste ----------
function filteredListe() {
  const ortsField = bcfg().ortsField;
  const q = (document.getElementById("liste-search").value || "").trim().toLowerCase();
  const tagF = document.getElementById("liste-tag").value;
  const stF = document.getElementById("liste-standort").value;
  const katF = document.getElementById("liste-kategorie").value;
  let list = belegungsListe().filter((b) => {
    const p = ortById(b[ortsField]);
    if (tagF && b.tag !== tagF) return false;
    if (stF && (!p || (p.standort || "—") !== stF)) return false;
    if (katF && b.kategorie !== katF) return false;
    if (q) {
      const hay = `${b.label} ${p ? p.name : ""} ${b.notiz || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => {
    if (a.tag !== b.tag) return tagIndex(a.tag) - tagIndex(b.tag);
    const ta = timeToMin(a.start) || 0, tb = timeToMin(b.start) || 0;
    if (ta !== tb) return ta - tb;
    return ortIndex(a[ortsField]) - ortIndex(b[ortsField]);
  });
  return list;
}

function listeRowHtml(b) {
  const kat = kategorieById(b.kategorie);
  const color = kat ? kat.farbe : "#e9ecef";
  const p = ortById(b[bcfg().ortsField]);
  return `
    <div class="list-row" data-id="${escapeHtml(b.id)}" style="border-left-color:${escapeHtml(color)}">
      <div class="lr-strong">${escapeHtml(tagName(b.tag).slice(0, 2))}<span class="lr-sub"> ${escapeHtml(tagName(b.tag))}</span></div>
      <div>${escapeHtml(b.start)}–${escapeHtml(b.ende)}</div>
      <div>${escapeHtml(p ? p.name : b[bcfg().ortsField])}<div class="lr-sub">${escapeHtml(p ? (p.standort || "") : "")}</div></div>
      <div class="lr-strong">${escapeHtml(b.label)}</div>
      <div><span class="kat-chip"><span class="kat-dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(kat ? kat.name : "—")}</span></div>
    </div>`;
}

function renderListe() {
  const list = filteredListe();
  document.getElementById("liste-rows").innerHTML = list.map(listeRowHtml).join("");
  document.getElementById("liste-count").textContent = `${list.length} von ${belegungsListe().length}`;
  document.getElementById("liste-empty").classList.toggle("hidden", list.length > 0);
}

// ---------- Meta / Changelog / Version / Nutzer ----------
function renderMeta() {
  const m = currentMeta();
  const rows = [
    ["Gültig ab", isoToDisplay(m.gueltigAb) || "—"],
    ["Saison", m.saison || "—"],
    ["Belegungen", String(belegungsListe().length)],
    ["Letzter Stand", m.stand ? new Date(m.stand).toLocaleString("de-DE") : "—"]
  ];
  document.getElementById("meta-view").innerHTML = rows.map(([k, v]) =>
    `<div class="form-field"><label>${escapeHtml(k)}</label><span>${escapeHtml(v)}</span></div>`).join("");
  const hint = document.getElementById("gueltig-hint");
  hint.textContent = m.gueltigAb ? `Gültig ab ${isoToDisplay(m.gueltigAb)}${m.saison ? " · Saison " + m.saison : ""}` : "";
}

function renderVersionInfo() {
  document.querySelectorAll("#version-badge, #version-badge-2").forEach((el) => { if (el) el.textContent = "v" + APP_VERSION; });
  const list = document.getElementById("changelog-list");
  if (!list) return;
  list.innerHTML = APP_CHANGELOG.map((entry) => `
    <div class="changelog-entry">
      <div class="cv">Version ${escapeHtml(entry.version)}</div>
      ${entry.groups.map((g) => `
        <div class="changelog-group">
          <div class="cg-title">${escapeHtml(g.title)}</div>
          <ul class="cg-items">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>`).join("")}
    </div>`).join("");
}

// Bearbeiten dürfen Site-Admins sowie Nutzer, deren Gruppe in der Tools-Übersicht
// für diese App Bearbeiten-Rechte hat (server-seitig aufgelöst, siehe fetchMe/canEdit
// in db.js) — alle anderen eingeloggten Nutzer dürfen den Plan nur ansehen. Gilt für
// beide Bereiche gleichermaßen.
function canEdit() {
  if (!currentUser) return false;
  return currentUser.isAdmin || !!currentUser.canEdit;
}

function renderHeaderUser() {
  const el = document.getElementById("header-user");
  const el2 = document.getElementById("einstellungen-user");
  if (!currentUser) { if (el) el.textContent = ""; if (el2) el2.textContent = ""; return; }
  const name = (currentUser.vorname || currentUser.nachname)
    ? `${currentUser.vorname || ""} ${currentUser.nachname || ""}`.trim()
    : currentUser.username;
  const rolle = currentUser.isAdmin ? " (Admin)" : (canEdit() ? " (Bearbeiter)" : "");
  if (el) el.textContent = "👤 " + name + rolle;
  if (el2) el2.textContent = "Angemeldet als " + name + rolle +
    (canEdit() ? "" : " — Bearbeiten ist bestimmten Nutzern vorbehalten.");
}

function applyAdminVisibility() {
  const editable = canEdit();
  document.body.classList.toggle("can-edit", editable);
  document.querySelectorAll(".editor-only").forEach((el) => el.classList.toggle("hidden", !editable));
}

function renderAll() {
  populateFilters();
  renderDaySwitch();
  renderLegend();
  renderGrid();
  renderListe();
  renderMeta();
  renderVersionInfo();
  document.getElementById("import-banner").classList.toggle("hidden", belegungsListe().length > 0);
}

// ---------- Bereich-Umschalter (Platzbelegung / Hallenbelegung) ----------
function switchBereich(bereich) {
  if (!BEREICHE[bereich]) return;
  currentBereich = bereich;
  document.querySelectorAll(".bereich-switch button").forEach((b) => b.classList.toggle("active", b.dataset.bereich === bereich));
  renderAll();
  switchTab("gitter");
}

// ---------- Belegungs-Formular ----------
function openBelegungModal(idOrPrefill) {
  const cfg = bcfg();
  const isNew = !idOrPrefill || typeof idOrPrefill === "object";
  if (isNew && !canEdit()) return;
  const b = (!isNew) ? belegungsListe().find((x) => x.id === idOrPrefill) : null;
  editingBelegungId = b ? b.id : null;
  const editable = canEdit();

  fillSelect(document.getElementById("bf-tag"), TAGE.map((t) => ({ value: t.id, label: t.name })), null);
  fillSelect(document.getElementById("bf-platz"), ortsListe().map((p) => ({ value: p.id, label: (p.standort && p.standort !== p.name) ? p.name + " (" + p.standort + ")" : p.name })), null);
  fillSelect(document.getElementById("bf-kategorie"), appData.kategorien.map((k) => ({ value: k.id, label: k.name })), null);

  const platzLabelEl = document.getElementById("bf-platz-label");
  if (platzLabelEl) platzLabelEl.textContent = cfg.ortLabel + " *";

  const prefill = (typeof idOrPrefill === "object" && idOrPrefill) ? idOrPrefill : {};
  document.getElementById("bf-tag").value = b ? b.tag : (prefill.tag || currentDay);
  document.getElementById("bf-platz").value = b ? b[cfg.ortsField] : (prefill[cfg.ortsField] || ortsListe()[0].id);
  document.getElementById("bf-start").value = b ? b.start : (prefill.start || "");
  document.getElementById("bf-ende").value = b ? b.ende : (prefill.ende || "");
  document.getElementById("bf-label").value = b ? b.label : "";
  document.getElementById("bf-kategorie").value = b ? b.kategorie : (appData.kategorien[0] ? appData.kategorien[0].id : "sch");
  document.getElementById("bf-ansprechpartner").value = b ? (b.ansprechpartner || "") : "";
  document.getElementById("bf-notiz").value = b ? (b.notiz || "") : "";

  ["bf-tag", "bf-platz", "bf-start", "bf-ende", "bf-label", "bf-kategorie", "bf-ansprechpartner", "bf-notiz"]
    .forEach((id) => { document.getElementById(id).disabled = !editable; });

  document.getElementById("belegung-modal-title").textContent = b ? (editable ? "Belegung bearbeiten" : "Belegung ansehen") : "Neue Belegung";
  document.getElementById("btn-delete-belegung").classList.toggle("hidden", !b || !editable);
  document.getElementById("btn-save-belegung").classList.toggle("hidden", !editable);
  document.getElementById("btn-cancel-belegung").textContent = editable ? "Abbrechen" : "Schließen";
  document.getElementById("belegung-modal").classList.remove("hidden");
  if (editable) document.getElementById("bf-label").focus();
}

function closeBelegungModal() {
  document.getElementById("belegung-modal").classList.add("hidden");
  editingBelegungId = null;
}

function saveBelegung() {
  if (!canEdit()) return;
  const cfg = bcfg();
  const tag = document.getElementById("bf-tag").value;
  const ort = document.getElementById("bf-platz").value;
  const start = document.getElementById("bf-start").value;
  const ende = document.getElementById("bf-ende").value;
  const label = document.getElementById("bf-label").value.trim();
  const kategorie = document.getElementById("bf-kategorie").value;
  const ansprechpartner = document.getElementById("bf-ansprechpartner").value.trim();
  const notiz = document.getElementById("bf-notiz").value.trim();

  if (!label) { alert("Bitte eine Mannschaft / ein Kürzel eingeben."); return; }
  if (!start || !ende) { alert("Bitte Start- und Endzeit angeben."); return; }
  if (timeToMin(ende) <= timeToMin(start)) { alert("Die Endzeit muss nach der Startzeit liegen."); return; }

  const list = belegungsListe();

  // Überschneidungs-Warnung analog zur Drag&Drop-Prüfung — hier nur warnen statt
  // blockieren, damit bewusst gewollte bzw. schon im Bestand vorhandene
  // Überlappungen weiter bearbeitbar bleiben (das Gitter zeigt dann nur eine an).
  const neuS = timeToMin(start), neuE = timeToMin(ende);
  const ueberlappt = list.find((x) =>
    x.id !== editingBelegungId && x.tag === tag && x[cfg.ortsField] === ort &&
    timeToMin(x.start) < neuE && neuS < timeToMin(x.ende)
  );
  if (ueberlappt && !confirm(
    `Achtung: Überschneidung mit „${ueberlappt.label}“ (${ueberlappt.start}–${ueberlappt.ende}) auf diesem ${cfg.ortLabel}. ` +
    "Trotzdem speichern? Im Gitter wird dann nur eine der beiden Belegungen angezeigt."
  )) return;
  let b = editingBelegungId ? list.find((x) => x.id === editingBelegungId) : null;
  const isNew = !b;
  if (isNew) { b = { id: uuid() }; list.push(b); }
  Object.assign(b, { tag, [cfg.ortsField]: ort, start, ende, label, kategorie, ansprechpartner, notiz });
  persist();
  renderAll();
  closeBelegungModal();
}

function deleteBelegung() {
  if (!canEdit() || !editingBelegungId) return;
  if (!confirm("Diese Belegung wirklich löschen?")) return;
  const cfg = bcfg();
  appData[cfg.belegKey] = belegungsListe().filter((x) => x.id !== editingBelegungId);
  persist();
  renderAll();
  closeBelegungModal();
}

// ---------- Import (einmaliger Excel-Seed als JSON, je Bereich getrennt) ----------
function handleImportFile(file) {
  if (!file) return;
  if (!canEdit()) { alert("Nur berechtigte Nutzer können importieren."); return; }
  const cfg = bcfg();
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e) { alert("Die Datei ist kein gültiges JSON."); return; }
    if (!parsed || !Array.isArray(parsed[cfg.belegKey])) {
      alert(`Die Datei enthält nicht das erwartete Format ({ ${cfg.belegKey}: [...] }).`);
      return;
    }
    if (belegungsListe().length > 0 &&
        !confirm("Es sind bereits Belegungen vorhanden. Diese durch den Import ERSETZEN?")) return;
    if (!confirm(`Wirklich ${parsed[cfg.belegKey].length} Belegungen importieren?`)) return;
    // Nur die Felder des AKTUELLEN Bereichs ersetzen — der jeweils andere Bereich
    // (z. B. die 71 bestehenden Platzbelegungen) bleibt dabei unangetastet.
    appData = normalizeData(Object.assign({}, appData, {
      [cfg.metaKey]: parsed.meta || {},
      [cfg.ortsKey]: Array.isArray(parsed[cfg.ortsKey]) && parsed[cfg.ortsKey].length ? parsed[cfg.ortsKey] : appData[cfg.ortsKey],
      [cfg.belegKey]: parsed[cfg.belegKey]
    }));
    renderAll();
    const ok = await saveNow();
    if (ok) alert(`Import erfolgreich gespeichert: ${belegungsListe().length} Belegungen.`);
  };
  reader.readAsText(file, "utf-8");
}

// ---------- Tabs ----------
function switchTab(tab) {
  document.querySelectorAll("nav button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "gitter") renderGrid();
  if (tab === "liste") renderListe();
  if (tab === "info") { renderMeta(); renderVersionInfo(); }
}

// ---------- Gateway: Laden / Speichern / Konflikte ----------
function setSaveStatus(text, kind) {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = text;
  el.className = "header-status" + (kind ? " is-" + kind : "");
}

function persist() {
  clearTimeout(persistTimer);
  setSaveStatus("Änderung noch nicht gespeichert…", "pending");
  persistTimer = setTimeout(doPersist, 300);
}
async function saveNow() { clearTimeout(persistTimer); return doPersist(); }

// Es darf immer nur EIN dav-save unterwegs sein. gatewayRev (das ETag, mit dem der
// Worker Konflikte erkennt) wird erst aktualisiert, wenn ein Save zurückkommt —
// ein zweiter Save, der währenddessen startet, schickt also dasselbe, inzwischen
// veraltete ETag und wird zwangsläufig mit 409 abgelehnt. Für die bearbeitende
// Person sah das aus wie "ein anderes Gerät hat geändert", obwohl sie allein war,
// und reloadAfterConflict() verwarf dabei ihre letzte Eingabe.
// Deshalb: Änderungen, die während eines laufenden Saves anfallen, nur vormerken
// und danach in einem Rutsch nachschreiben. appData wird ohnehin immer komplett
// geschrieben, es geht also nichts verloren, wenn mehrere Änderungen zusammenfallen.
let saveRunner = null;
let saveDirty = false;
function doPersist() {
  saveDirty = true;
  if (!saveRunner) saveRunner = runSaveLoop().finally(() => { saveRunner = null; });
  return saveRunner;
}
async function runSaveLoop() {
  let ok = true;
  while (saveDirty) {
    saveDirty = false;
    ok = await writeToGateway();
    // Bei Konflikt/Fehler wurde der Stand neu geladen bzw. der Login-Screen
    // gezeigt — dann NICHT blind nachschreiben, das würde den fremden Stand
    // wieder überbügeln.
    if (!ok) { saveDirty = false; break; }
  }
  return ok;
}

async function writeToGateway() {
  setSaveStatus("Speichern…", "pending");
  try {
    appData.meta = Object.assign({}, appData.meta, { stand: new Date().toISOString() });
    appData.hallenMeta = Object.assign({}, appData.hallenMeta, { stand: new Date().toISOString() });
    await gatewaySave(appData);
    const t = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    setSaveStatus("Gespeichert " + t, "ok");
    return true;
  } catch (e) {
    if (e instanceof ConflictError) { await reloadAfterConflict(); setSaveStatus("Von anderem Gerät aktualisiert", ""); return false; }
    if (e instanceof NotLoggedInError) { showConnectScreen("Sitzung abgelaufen — bitte neu anmelden."); return false; }
    console.error("Speichern fehlgeschlagen", e);
    setSaveStatus("Nicht gespeichert", "error");
    alert("Speichern fehlgeschlagen: " + e.message);
    return false;
  }
}

async function reloadAfterConflict() {
  try {
    const data = await gatewayLoad();
    appData = normalizeData(data);
    renderAll();
    alert("Die Daten wurden zwischenzeitlich auf einem anderen Gerät geändert — die aktuelle Version wurde neu geladen. Bitte die letzte Änderung bei Bedarf erneut vornehmen.");
  } catch (e) {
    console.error("Neuladen nach Konflikt fehlgeschlagen", e);
  }
}

// ---------- Start ----------
function showConnectScreen(errorMsg) {
  document.getElementById("connect-screen").style.display = "";
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("cloud-error").textContent = errorMsg ? "Fehler: " + errorMsg : "";
}

async function startApp() {
  document.getElementById("connect-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "";
  renderAll();
  try {
    currentUser = await fetchMe();
  } catch (_) { /* best effort */ }
  renderHeaderUser();
  applyAdminVisibility();
}

async function init() {
  setupListeners();
  if (!getSessionToken()) { showConnectScreen(); return; }
  try {
    const data = await gatewayLoad();
    appData = normalizeData(data);
    await startApp();
  } catch (e) {
    if (e instanceof NotLoggedInError) { showConnectScreen(); return; }
    console.error("Nextcloud-Zugriff über Login fehlgeschlagen", e);
    showConnectScreen(e.message);
  }
}

function setupListeners() {
  document.querySelectorAll(".bereich-switch button").forEach((b) => b.addEventListener("click", () => switchBereich(b.dataset.bereich)));
  document.querySelectorAll("nav button[data-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  const versionBadgeHeader = document.getElementById("version-badge");
  versionBadgeHeader.addEventListener("click", () => switchTab("info"));
  versionBadgeHeader.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab("info"); }
  });

  document.getElementById("day-switch").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-day]");
    if (!btn) return;
    currentDay = btn.dataset.day;
    renderDaySwitch();
    renderGrid();
  });
  document.getElementById("gitter-standort").addEventListener("change", renderGrid);
  document.getElementById("btn-new-gitter").addEventListener("click", () => openBelegungModal({ tag: currentDay }));
  document.getElementById("btn-new-liste").addEventListener("click", () => openBelegungModal({ tag: currentDay }));

  document.getElementById("grid").addEventListener("click", (e) => {
    const booking = e.target.closest("td.slot-booking");
    if (booking) { openBelegungModal(booking.dataset.id); return; }
    const free = e.target.closest("td.slot-free");
    if (free && canEdit()) {
      const slotMin = parseInt(free.dataset.slotmin, 10);
      const prefill = { tag: currentDay, start: minToTime(slotMin), ende: minToTime(slotMin + SLOT_MIN) };
      prefill[bcfg().ortsField] = free.dataset.ort;
      openBelegungModal(prefill);
    }
  });

  // Belegungen per Drag & Drop auf ein freies Feld verschieben (nur berechtigte Nutzer).
  document.getElementById("grid").addEventListener("dragstart", (e) => {
    const cell = e.target.closest("td.slot-booking[draggable='true']");
    if (!cell || !canEdit()) { e.preventDefault(); return; }
    draggedBookingId = cell.dataset.id;
    cell.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedBookingId);
  });
  document.getElementById("grid").addEventListener("dragend", (e) => {
    e.target.closest("td.slot-booking")?.classList.remove("is-dragging");
    document.querySelectorAll("#grid td.drop-target").forEach((el) => el.classList.remove("drop-target"));
    draggedBookingId = null;
  });
  document.getElementById("grid").addEventListener("dragover", (e) => {
    const free = e.target.closest("td.slot-free");
    if (!free || !draggedBookingId) return;
    e.preventDefault();
    free.classList.add("drop-target");
  });
  document.getElementById("grid").addEventListener("dragleave", (e) => {
    e.target.closest("td.slot-free")?.classList.remove("drop-target");
  });
  document.getElementById("grid").addEventListener("drop", (e) => {
    const free = e.target.closest("td.slot-free");
    if (!free || !draggedBookingId || !canEdit()) return;
    e.preventDefault();
    free.classList.remove("drop-target");
    const ortsField = bcfg().ortsField;
    const list = belegungsListe();
    const booking = list.find((b) => b.id === draggedBookingId);
    draggedBookingId = null;
    if (!booking) return;

    const dauer = timeToMin(booking.ende) - timeToMin(booking.start);
    const neuStart = parseInt(free.dataset.slotmin, 10);
    const neuEnde = neuStart + dauer;
    const neuOrt = free.dataset.ort;
    const konflikt = list.some((b) =>
      b.id !== booking.id && b.tag === booking.tag && b[ortsField] === neuOrt &&
      timeToMin(b.start) < neuEnde && neuStart < timeToMin(b.ende)
    );
    if (konflikt) { alert("Der Zielzeitraum ist auf diesem Platz bereits belegt."); return; }

    booking[ortsField] = neuOrt;
    booking.start = minToTime(neuStart);
    booking.ende = minToTime(neuEnde);
    persist();
    renderAll();
  });

  ["liste-search", "liste-tag", "liste-standort", "liste-kategorie"].forEach((id) =>
    document.getElementById(id).addEventListener("input", renderListe));
  ["liste-tag", "liste-standort", "liste-kategorie"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderListe));
  document.getElementById("liste-rows").addEventListener("click", (e) => {
    const row = e.target.closest(".list-row");
    if (row) openBelegungModal(row.dataset.id);
  });

  document.getElementById("belegung-modal-close").addEventListener("click", closeBelegungModal);
  document.getElementById("btn-cancel-belegung").addEventListener("click", closeBelegungModal);
  document.getElementById("btn-save-belegung").addEventListener("click", saveBelegung);
  document.getElementById("btn-delete-belegung").addEventListener("click", deleteBelegung);
  document.getElementById("belegung-modal").addEventListener("click", (e) => { if (e.target.id === "belegung-modal") closeBelegungModal(); });
  document.getElementById("belegung-form").addEventListener("submit", (e) => { e.preventDefault(); saveBelegung(); });

  document.getElementById("btn-import-seed").addEventListener("click", () => document.getElementById("import-file-input").click());
  document.getElementById("import-file-input").addEventListener("change", (e) => { handleImportFile(e.target.files[0]); e.target.value = ""; });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("belegung-modal").classList.contains("hidden")) closeBelegungModal();
  });
}

document.addEventListener("DOMContentLoaded", init);
