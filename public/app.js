"use strict";

const main = document.querySelector("#main-content");
const state = {
  view: "timing",
  live: null,
  calendar: null,
  sidebar: "control",
  topic: null,
  raw: null,
  rawLoading: null,
  rawSearch: "",
  driver: null,
};
let refreshTimer = null;
let lastRefreshAt = 0;
let refreshInFlight = false;
let queuedRefresh = false;
let topicRequest = 0;

const $ = (selector) => document.querySelector(selector);
const h = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const values = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
const field = (object, key, fallback = "—") => object?.[key] ?? fallback;
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
const colour = (value) => /^[0-9a-f]{6}$/i.test(value || "") ? `#${value}` : "#829778";
const compound = (value) => ({ SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?" })[String(value || "").toUpperCase()] || String(value || "—").slice(0, 2);
const tyreClass = (value) => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
const timestamp = (value, includeDate = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("es-ES", includeDate ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false } : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};


async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo consultar el servidor local.");
  return data;
}

const trackMapView = window.ApexTrackMap({
  mount: main, api, escape: h, colour,
  drivers: () => state.live?.drivers || [],
  connected: () => Boolean(state.live?.connection?.connected),
  hasPositionFeed: () => Boolean(state.live?.catalog?.some((topic) => topic.name === "Position.z")),
  header: () => `${sessionHero()}${notices()}`,
  time: timestamp,
  sessionName: sessionTitle,
});

const radioPlayer = window.ApexRadioPlayer({
  panel: document.querySelector("#radio-player"),
  onError: toast,
});

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 4000);
}

function updateHeader() {
  const data = state.live;
  const connection = data?.connection || {};
  const status = connection.status || "connecting";
  const badge = $("#connection-badge");
  badge.className = `connection-badge ${status === "connected" ? "live" : status}`;
  $("#connection-label").textContent = { connected: "CONECTADO", connecting: "CONECTANDO", error: "SIN CONEXIÓN", replay: "REPLAY" }[status] || "INICIANDO";
  badge.title = [connection.error, `Último mensaje: ${timestamp(connection.lastMessageAt, true)}`].filter(Boolean).join(" · ");
  $("#topic-count").textContent = data?.catalog?.length || "";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

function sessionInfo() {
  return state.live?.feeds?.SessionInfo || {};
}
function sessionTitle() {
  const session = sessionInfo();
  return session.Meeting?.Name || session.Meeting?.OfficialName || "Tu muro de boxes";
}
function sessionSubtitle() {
  const session = sessionInfo();
  return [session.Name, session.Circuit?.ShortName || session.Meeting?.Circuit?.ShortName, session.Meeting?.Country?.Name].filter(Boolean).join(" · ") || "Toda la pista, en una segunda pantalla.";
}
function trackStatus() {
  const track = state.live?.feeds?.TrackStatus || {};
  return track.Message || { 1: "PISTA LIBRE", 2: "BANDERA AMARILLA", 3: "SAFETY CAR", 4: "PISTA CERRADA", 5: "BANDERA ROJA", 6: "VSC FINALIZANDO", 7: "VSC" }[Number(track.Status)] || "ESPERANDO PISTA";
}
function trackClass() {
  const status = Number(state.live?.feeds?.TrackStatus?.Status);
  return [2, 6, 7].includes(status) ? "yellow" : status === 5 ? "red" : "";
}

function sessionHero() {
  const lap = state.live?.feeds?.LapCount || {};
  const status = state.live?.feeds?.SessionStatus?.Status || "En espera";
  return `<section class="session-hero">
    <div><p class="eyebrow">${state.live?.connection?.status === "replay" ? "DATOS FICTICIOS · REPRODUCCIÓN" : "F1 LIVE TIMING · SEGUNDA PANTALLA"}</p>
      <h1 class="session-title">${h(sessionTitle())}</h1><p class="session-subtitle">${h(sessionSubtitle())}</p></div>
    <div class="session-meta"><div class="session-side-stat"><small>Estado de sesión</small><strong>${h(status)}</strong></div>
      ${finite(lap.CurrentLap) ? `<div class="session-side-stat"><small>Vuelta</small><strong>${h(lap.CurrentLap)} <span class="lap-total">/ ${h(field(lap, "TotalLaps", "?"))}</span></strong></div>` : ""}
      <span class="track-badge ${trackClass()}">${h(trackStatus())}</span></div>
  </section>`;
}

function notices() {
  const connection = state.live.connection;
  if (connection.status === "replay") return `<div class="info-banner">Modo demostración: todos los datos de pilotos, equipos, tiempos y mensajes son ficticios y sirven para probar la interfaz. Ejecuta «python3 server.py» para conectar con la fuente en vivo.</div>`;
  if (connection.status === "error") return `<div class="info-banner error-banner">No se puede mantener la conexión con F1. Se reintentará automáticamente; los últimos datos recibidos, si los hay, se conservan. Detalle: ${h(connection.error || "Fuente no disponible")}</div>`;
  if (connection.status === "connected" && !state.live.drivers.length) return `<div class="info-banner">Conexión establecida. La sesión todavía no ha enviado una clasificación para mostrar. El acceso y la cobertura pueden variar según la sesión.</div>`;
  return "";
}

function driverCode(row) {
  return `<div class="driver-code"><span class="team-stripe" style="--team:${colour(row.colour)}"></span><div><span>${h(row.code)} <span class="car-number">${h(row.number)}</span></span><span class="driver-team">${h(row.team)}</span></div></div>`;
}
function tyre(row) {
  return `<div><span class="compound ${h(tyreClass(row.compound))}" title="${h(row.compound)}${row.newTyres === "true" || row.newTyres === true ? " · Nuevo" : ""}">${h(compound(row.compound))}</span><span class="tyre-age">${h(row.tyreAge)} L</span></div>`;
}
function driverStatus(row) {
  if (row.retired || row.stopped) return '<span class="retired-status">FUERA</span>';
  if (row.inPit) return '<span class="pit-status">PIT</span>';
  if (row.pitOut) return '<span class="pit-status">PIT OUT</span>';
  return "";
}

function timingTable(rows) {
  return `<div class="table-scroll"><table class="timing-table"><thead><tr><th>Pos.</th><th>Piloto</th><th>Goma</th><th>Última</th><th>Líder</th><th>Intervalo</th><th class="optional">Paradas</th></tr></thead><tbody>${rows.map((row) => `<tr data-driver="${h(row.id)}" tabindex="0" role="button" aria-label="Ver datos de ${h(row.name)}">
    <td class="position">${h(row.position)}</td><td>${driverCode(row)}</td><td>${tyre(row)}</td>
    <td class="numeric lap-cell">${h(row.lastLap)}${driverStatus(row)}</td><td class="numeric">${h(row.gap || (row.position === "1" ? "LÍDER" : "—"))}</td>
    <td class="numeric">${h(row.interval || "—")}</td><td class="numeric">${h(row.pits)}</td></tr>`).join("")}</tbody></table></div>`;
}

function nextSessionCard() {
  const races = state.calendar?.races || [];
  const next = races.find((race) => new Date(`${race.date}T${race.time || "23:59:59Z"}`).getTime() > Date.now());
  if (!next) return `<p>Abre esta página durante una sesión para ver el resto de datos.</p>`;
  return `<section class="empty-state next-session"><span class="card-label">Próxima carrera en el calendario</span><strong>${h(next.raceName)}</strong><p>${h(new Date(`${next.date}T${next.time}`).toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }))} · Hora local</p></section>`;
}

function lapPanel() {
  const lap = state.live.feeds.LapCount || {};
  const clock = state.live.feeds.ExtrapolatedClock || {};
  const current = Number(lap.CurrentLap) || 0;
  const total = Number(lap.TotalLap) || Number(lap.TotalLaps) || 0;
  return `<section class="panel" id="lap-panel"><div class="panel-heading"><h2 class="panel-title">Carrera</h2><span class="card-label">LIVE / ${h(state.live.feeds.SessionStatus?.Status || "—")}</span></div>
    <div class="lap-counter"><span class="lap-current">${h(field(lap, "CurrentLap"))}</span><span class="lap-total"> / ${h(field(lap, "TotalLaps", "?"))}</span><div class="progress-track"><span style="width:${total ? Math.min(100, current / total * 100) : 0}%"></span></div></div>
    <div class="clock-row"><span>Restante</span><strong>${h(field(clock, "Remaining"))}</strong></div><div class="clock-row"><span>En pista</span><strong>${h(field(clock, "ElapsedTrackTime", field(clock, "Elapsed")))}</strong></div>
  </section>`;
}

function weatherPanel() {
  const weather = state.live.feeds.WeatherData || {};
  const metrics = [["Aire", "AirTemp", "°C"], ["Pista", "TrackTemp", "°C"], ["Humedad", "Humidity", "%"], ["Viento", "WindSpeed", " km/h"]];
  return `<section class="panel" id="weather-panel"><div class="panel-heading"><h2 class="panel-title">Condiciones</h2><span class="card-label">${weather.Rainfall === "1" ? "LLUVIA" : "PISTA"}</span></div>
    <div class="weather-grid">${metrics.map(([label, key, unit]) => `<div><span class="card-label">${label}</span><strong class="weather-value">${h(field(weather, key))}<span class="weather-unit">${unit}</span></strong></div>`).join("")}</div><div class="clock-row"><span>Dirección del viento</span><strong>${h(field(weather, "WindDirection"))}°</strong></div></section>`;
}

function sortedMessages(kind) {
  const feedName = kind === "control" ? "RaceControlMessages" : "TeamRadio";
  const key = kind === "control" ? "Messages" : "Captures";
  return values(state.live.feeds[feedName]?.[key]).sort((a, b) => String(b.Utc || "").localeCompare(String(a.Utc || "")));
}
function radioUrl(capture) {
  const path = sessionInfo().Path;
  if (!path || !capture.Path || !/^[\w./-]+$/i.test(capture.Path)) return "";
  try { return new URL(`${path}${capture.Path}`, "https://livetiming.formula1.com/static/").href; } catch { return ""; }
}
function radioKey(capture) {
  return `${capture.Utc || capture.Path || JSON.stringify(capture)}|${capture.RacingNumber || ""}`;
}
function eventsPanel() {
  const isControl = state.sidebar === "control";
  const rows = sortedMessages(state.sidebar);
  const items = isControl ? rows.map((message) => `<article class="message"><div class="message-meta"><span>${h(timestamp(message.Utc))}</span>${message.Lap ? `<span>VUELTA ${h(message.Lap)}</span>` : ""}${message.Flag ? `<span class="message-flag">${h(message.Flag)}</span>` : ""}${message.Category ? `<span>${h(message.Category)}</span>` : ""}</div><div class="message-text">${h(message.Message || message.Status || "Mensaje recibido")}</div></article>`).join("") : rows.map((capture) => {
    const driver = state.live.feeds.DriverList?.[String(capture.RacingNumber)] || {};
    const src = radioUrl(capture);
    const key = radioKey(capture);
    const label = `${driver.Tla || capture.RacingNumber || "Radio"} · ${timestamp(capture.Utc)}`;
    return `<article class="radio-item" data-radio-key="${h(key)}"><div class="message-meta"><span>${h(timestamp(capture.Utc))}</span><span class="driver-number">${h(driver.Tla || capture.RacingNumber || "EQUIPO")}</span></div><div class="message-text">${h(driver.FullName || `Coche ${capture.RacingNumber || "—"}`)}</div>${src ? `<button class="radio-play" type="button" data-radio-src="${h(src)}" data-radio-title="${h(label)}">▶ Escuchar radio</button>` : '<div class="secondary-value">Audio no disponible</div>'}</article>`;
  }).join("");
  return `<section class="panel" id="events-panel" data-sidebar="${state.sidebar}" data-session="${h(sessionInfo().Key || "")}"><div class="panel-heading"><h2 class="panel-title">Lo que no sale</h2><div class="sidebar-tabs"><button type="button" data-sidebar="control" class="${isControl ? "active" : ""}">CONTROL</button><button type="button" data-sidebar="radio" class="${!isControl ? "active" : ""}">RADIO</button></div></div>
    <div class="${isControl ? "messages" : "radio-list"}" ${isControl ? "" : 'id="radio-list"'}>${items || `<div class="empty-state"><h3>Sin mensajes</h3><p>Los mensajes de ${isControl ? "dirección de carrera" : "radio de equipo"} aparecerán cuando se reciban.</p></div>`}</div></section>`;
}

function renderTiming() {
  const drivers = state.live.drivers || [];
  const panels = `<div class="sidebar-stack">${lapPanel()}${weatherPanel()}${eventsPanel()}</div>`;
  const markup = `<div class="app-shell" id="timing-view">${sessionHero()}<div id="live-notices">${notices()}</div><div class="dashboard"><section class="panel" id="timing-main"><div class="panel-heading"><div><p class="card-label">POSICIONES EN PISTA</p><h2 class="panel-title">Clasificación en vivo</h2></div><span class="panel-meta">${drivers.length} COCHES · ${h(timestamp(state.live.connection.lastMessageAt))}</span></div>
    ${drivers.length ? timingTable(drivers) : `<div class="empty-state"><span class="empty-symbol">P_</span><h2>La pista habla aquí</h2><p>Mantén APEX abierto al empezar la sesión. Posiciones, diferencias, neumáticos, mensajes de control y mucho más aparecerán cuando lleguen los datos.</p>${!drivers.length && !state.live.catalog.length ? nextSessionCard() : ""}</div>`}
    <div class="empty-note">Pulsa un piloto para consultar sus sectores, velocidades y telemetría. Las diferencias y las banderas se muestran tal y como las envía la fuente; no son resultados oficiales hasta la clasificación final.</div></section>${panels}</div></div>`;
  if (!$("#timing-view")) {
    main.innerHTML = markup;
    return;
  }
  const template = document.createElement("template");
  template.innerHTML = markup;
  for (const selector of [".session-hero", "#live-notices", "#timing-main", "#lap-panel", "#weather-panel"]) {
    const current = main.querySelector(selector);
    const next = template.content.querySelector(selector);
    if (current && next) current.replaceWith(next);
  }
  const currentEvents = $("#events-panel");
  const nextEvents = template.content.querySelector("#events-panel");
  if (!currentEvents || !nextEvents) return;
  if (state.sidebar === "radio" && currentEvents.dataset.sidebar === "radio" && currentEvents.dataset.session === nextEvents.dataset.session) {
    radioPlayer.updateList(currentEvents.querySelector("#radio-list"), nextEvents.querySelector("#radio-list"));
  } else {
    currentEvents.replaceWith(nextEvents);
  }
}

function sectorCell(sector) {
  return `<span class="sector-value ${sector.personalBest ? "personal-best" : ""} ${sector.overallBest ? "overall-best" : ""}">${h(sector.value)}</span>`;
}
function renderStrategy() {
  const rows = state.live.drivers || [];
  main.innerHTML = `<div class="app-shell">${sessionHero()}${notices()}<p class="eyebrow muted">ESTRATEGIA · ${rows.length} PILOTOS</p><div class="strategy-grid"><section class="panel"><div class="panel-heading"><div><p class="card-label">TANDAS Y DEGRADACIÓN</p><h2 class="panel-title">Cada rueda cuenta</h2></div><span class="panel-meta">EDAD EN VUELTAS · PITS POR PILOTO</span></div>
  <div class="table-scroll"><table class="strategy-table"><thead><tr><th>Pos.</th><th>Piloto</th><th>Goma actual</th><th>Tanda</th><th>Paradas</th><th>En boxes</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${h(row.position)}</td><td>${driverCode(row)}</td><td>${tyre(row)}</td><td>${h(row.stint)}</td><td>${h(row.pits)}</td><td>${driverStatus(row) || "En pista"}</td></tr>`).join("") || '<tr><td colspan="6">Todavía no se han recibido tandas.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><div class="panel-heading"><div><p class="card-label">TIEMPOS POR SECTOR</p><h2 class="panel-title">Dónde se gana el tiempo</h2></div><span class="panel-meta">MEJOR EN MORADO</span></div>
  <div class="table-scroll"><table class="strategy-table"><thead><tr><th>Piloto</th><th>Sector 1</th><th>Sector 2</th><th>Sector 3</th><th>Mejor vuelta</th><th>Velocidad punta</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${driverCode(row)}</td>${row.sectors.map((sector) => `<td>${sectorCell(sector)}</td>`).join("")}<td>${h(row.bestLap)}</td><td>${h(field(row.speeds, "ST"))} <span class="secondary-value">km/h</span></td></tr>`).join("") || '<tr><td colspan="6">Los sectores aparecerán cuando comience la sesión.</td></tr>'}</tbody></table></div></section></div>
  <p class="info-tip">La edad de un neumático no mide por sí sola su desgaste. Consulta el explorador para ver todas las tandas recibidas y los datos que no tienen una vista propia. Los colores representan compuestos declarados por la fuente, no una estimación de APEX.</p></div>`;
}

function renderExplorer() {
  const catalog = state.live.catalog || [];
  if (!state.topic && catalog.length) state.topic = catalog.find((topic) => topic.name === "TimingDataF1")?.name || catalog[0].name;
  const topic = catalog.find((item) => item.name === state.topic);
  main.innerHTML = `<div class="app-shell">${sessionHero()}<p class="eyebrow muted">EXPLORADOR · CADA CAMPO RECIBIDO</p><div class="explorer-layout"><section class="panel"><div class="panel-heading"><h2 class="panel-title">Fuentes recibidas</h2><span class="panel-meta">${catalog.length}</span></div><div class="topic-list">${catalog.map((item) => `<button class="topic-button ${item.name === state.topic ? "active" : ""}" data-topic="${h(item.name)}" type="button"><strong>${h(item.label)}</strong><code>${h(item.name)}</code></button>`).join("") || '<div class="empty-state"><p>No se han recibido categorías todavía.</p></div>'}</div></section>
  <section class="panel"><div class="panel-heading"><div><p class="card-label">DATOS SIN PROCESAR</p><h2 class="panel-title" id="raw-title" ${topic ? `data-topic-title="${h(topic.name)}"` : ""}>${h(topic?.label || "Explorador")}</h2></div><span class="panel-meta">${h(timestamp(topic?.receivedAt, true))}</span></div><div class="raw-toolbar"><input class="raw-search" data-raw-search type="search" placeholder="Buscar campo o valor en el JSON…" aria-label="Buscar en los datos sin procesar" value="${h(state.rawSearch)}"><button class="small-button" data-copy type="button">Copiar</button><button class="small-button" data-download type="button">Descargar</button></div><pre class="json-output" id="raw-output">Cargando datos…</pre><div class="raw-note">Estos son los datos que conserva APEX de la categoría seleccionada, sin filtros semánticos. Los cambios se combinan por clave, no se presentan como una clasificación oficial. Las categorías de telemetría se descargan solo al seleccionarlas.</div></section></div></div>`;
  if (state.topic && state.raw?.name !== state.topic && state.rawLoading !== state.topic) loadTopic(state.topic);
  else if (state.raw?.name === state.topic) displayRaw();
}

async function loadTopic(topic) {
  const request = ++topicRequest;
  state.raw = null;
  state.rawLoading = topic;
  const output = $("#raw-output");
  if (output) output.textContent = "Consultando datos locales…";
  try {
    const result = await api(`/api/live/topic?name=${encodeURIComponent(topic)}`);
    if (request !== topicRequest) return;
    state.raw = result;
    displayRaw();
  } catch (error) {
    if (request === topicRequest && $("#raw-output")) $("#raw-output").textContent = error.message;
  } finally {
    if (request === topicRequest) state.rawLoading = null;
  }
}

function displayRaw() {
  const output = $("#raw-output");
  if (!output) return;
  if (!state.raw) { output.textContent = "No hay datos de esta categoría."; return; }
  let text = "";
  try { text = JSON.stringify(state.raw.data, null, 2); } catch { text = "Esta categoría no se puede serializar en el navegador."; }
  if (state.rawSearch) {
    const terms = state.rawSearch.toLocaleLowerCase();
    const lines = text.split("\n").filter((line) => line.toLocaleLowerCase().includes(terms));
    output.textContent = lines.length ? lines.join("\n") : "No hay campos o valores que coincidan con la búsqueda.";
    if (lines.length) output.textContent = `${lines.length} líneas que coinciden (vista filtrada)\n\n${lines.join("\n")}`;
  } else output.textContent = text;
  output.dataset.fullText = text;
  if (state.raw.truncated) $(".raw-note").textContent = "Se conserva una ventana limitada de muestras para evitar que la app agote la memoria. Los datos mostrados son los más recientes.";
}

function openDriver(id) {
  const row = state.live?.drivers.find((item) => item.id === String(id));
  if (!row) return;
  state.driver = row;
  const dialog = $("#driver-dialog");
  $("#driver-content").innerHTML = `<div class="driver-detail-title"><span class="eyebrow">COCHE ${h(row.number)} · P${h(row.position)}</span><h2 id="driver-title">${h(row.name)}</h2><p>${h(row.team)} · Compuesto ${h(row.compound)} · ${h(row.tyreAge)} vueltas</p></div>
    <div class="telemetry-metrics">${[["Última vuelta", row.lastLap], ["Mejor vuelta", row.bestLap], ["Al líder", row.gap || "—"], ["Al siguiente", row.interval || "—"]].map(([label, value]) => `<div class="telemetry-metric"><strong>${h(value)}</strong><small>${h(label)}</small></div>`).join("")}</div><div class="table-scroll"><table class="strategy-table"><thead><tr><th>S1</th><th>S2</th><th>S3</th><th>Trampa</th></tr></thead><tbody><tr>${row.sectors.map((sector) => `<td>${sectorCell(sector)}</td>`).join("")}<td>${h(row.speeds.ST)}</td></tr></tbody></table></div>
    <h3 class="detail-subheading">Última velocidad recibida</h3><div id="driver-telemetry" class="detail-loading">Consultando la telemetría disponible para este coche…</div><div class="detail-links"><button class="small-button" type="button" data-driver-topic="TimingDataF1">Datos de tiempo ↗</button><button class="small-button" type="button" data-driver-topic="CarData.z">Telemetría completa ↗</button></div>`;
  if (!dialog.open) dialog.showModal();
  loadTelemetry(id, $("#driver-telemetry"), row.number);
}

function telemetrySample(id, entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const channels = entries[index]?.Cars?.[String(id)]?.Channels;
    if (channels) return { time: entries[index].Utc, channels };
  }
  return null;
}
function speedHistory(id, entries) {
  const speeds = [];
  let firstTime = "";
  for (const entry of entries) {
    const speed = Number(entry?.Cars?.[String(id)]?.Channels?.["2"]);
    if (Number.isFinite(speed)) { speeds.push(speed); if (!firstTime) firstTime = entry.Utc; }
  }
  return { values: speeds.slice(-160), firstTime };
}
function loadTelemetry(id, target, number) {
  if (!target) return;
  api("/api/live/topic?name=CarData.z").then((topic) => {
    if (!target.isConnected) return;
    const entries = Array.isArray(topic.data?.Entries) ? topic.data.Entries : [];
    const latest = telemetrySample(id, entries);
    const history = speedHistory(id, entries);
    const channels = latest?.channels || {};
    const metrics = [["Velocidad", channels[2], "km/h"], ["RPM", channels[0], ""], ["Marcha", channels[3], ""], ["Acelerador", channels[4], "%"], ["Freno", channels[5], "%"], ["DRS", channels[8] ?? channels[6], ""]];
    let svg = "";
    if (history.values.length > 1) {
      const max = Math.max(...history.values, 1);
      const points = history.values.map((value, index) => `${(index / (history.values.length - 1) * 620 + 5).toFixed(1)},${(155 - value / max * 135).toFixed(1)}`).join(" ");
      svg = `<svg class="telemetry-chart" viewBox="0 0 630 180" role="img" aria-label="Últimas ${history.values.length} velocidades recibidas del coche ${h(number)}"><text x="12" y="20" fill="#929b90" font-size="10">${h(max)} km/h</text><polyline points="${points}"/><text x="530" y="173" fill="#929b90" font-size="9">Últimas ${history.values.length} muestras</text></svg>`;
    }
    target.innerHTML = latest || svg ? `${latest ? `<div class="telemetry-metrics">${metrics.map(([label, value, unit]) => `<div class="telemetry-metric"><strong>${h(value)}<span class="weather-unit"> ${h(unit)}</span></strong><small>${h(label)}</small></div>`).join("")}</div>` : ""}${svg}` : `<p>No se han recibido muestras de telemetría para este coche en la ventana conservada.</p>`;
  }).catch(() => { if (target.isConnected) target.textContent = "Telemetría aún no disponible para esta sesión. Los tiempos y sectores anteriores proceden del feed de clasificación."; });
}

function showToast(message) { toast(message); }
function rawText() { return $("#raw-output")?.dataset.fullText || JSON.stringify(state.raw?.data ?? {}, null, 2); }
function render() {
  updateHeader();
  if (!state.live) return;
  if (state.view === "explorer" && document.activeElement?.matches("[data-raw-search]")) return;
  if (state.view === "timing") renderTiming();
  else if (state.view === "strategy") renderStrategy();
  else if (state.view === "map") trackMapView.render();
  else renderExplorer();
}

async function refresh() {
  if (refreshInFlight) { queuedRefresh = true; return; }
  refreshInFlight = true;
  try {
    state.live = await api("/api/live");
    render();
  } catch (error) {
    if (!state.live) main.innerHTML = `<div class="initial-loader"><span class="empty-symbol">!</span><p>Sin conexión con APEX</p><small>${h(error.message)} Vuelve a ejecutar «python3 server.py».</small></div>`;
  } finally {
    refreshInFlight = false;
    if (queuedRefresh) { queuedRefresh = false; scheduleRefresh(); }
  }
}
function scheduleRefresh() {
  // Límite estable por vista. Si ya pasó el mínimo, se refresca en el acto
  // para no añadir la latencia de un temporizador a cada mensaje.
  const minimum = { timing: 120, map: 250, strategy: 400, explorer: 1200 }[state.view] ?? 200;
  const wait = lastRefreshAt + minimum - performance.now();
  if (wait <= 0) {
    if (refreshTimer !== null) { clearTimeout(refreshTimer); refreshTimer = null; }
    lastRefreshAt = performance.now();
    refresh();
    return;
  }
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    lastRefreshAt = performance.now();
    refresh();
  }, wait);
}
async function loadCalendar() {
  try { state.calendar = await api(`/api/season?year=${new Date().getUTCFullYear()}`); if (state.view === "timing" && !state.live?.drivers.length) render(); }
  catch { /* OpenF1 histórico es opcional; el directo no depende de él. */ }
}
function connectEvents() {
  if (!("EventSource" in window)) { setInterval(scheduleRefresh, 3000); return; }
  const events = new EventSource("/api/live/events");
  events.addEventListener("update", scheduleRefresh);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.radioSrc) radioPlayer.play(button.dataset.radioSrc, button.dataset.radioTitle);
  if (button.dataset.view) { state.view = button.dataset.view; window.scrollTo({ top: 0, behavior: "instant" }); render(); }
  if (button.dataset.sidebar) { state.sidebar = button.dataset.sidebar; render(); }
  if (button.dataset.mapFocus) trackMapView.focus(button.dataset.mapFocus);
  if (button.dataset.topic) {
    state.view = "explorer"; state.topic = button.dataset.topic; state.rawSearch = ""; state.raw = null; renderExplorer(); updateHeader();
  }
  if (button.dataset.driverTopic) { state.topic = button.dataset.driverTopic; state.rawSearch = ""; state.raw = null; state.view = "explorer"; $("#driver-dialog").close(); render(); }
  if (button.hasAttribute("data-copy")) {
    navigator.clipboard?.writeText(rawText()).then(() => showToast("JSON copiado al portapapeles.")).catch(() => showToast("El navegador no permitió copiar los datos."));
    if (!navigator.clipboard) showToast("Tu navegador no permite usar el portapapeles.");
  }
  if (button.hasAttribute("data-download")) {
    const url = URL.createObjectURL(new Blob([rawText()], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `apex-${state.topic || "live"}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Categoría descargada en formato JSON.");
  }
  if (button.classList.contains("dialog-close")) $("#driver-dialog").close();
});
document.querySelector("main").addEventListener("click", (event) => {
  const row = event.target.closest("[data-driver]");
  if (row) openDriver(row.dataset.driver);
});
document.querySelector("main").addEventListener("keydown", (event) => {
  const row = event.target.closest("[data-driver]");
  if (row && ["Enter", " "].includes(event.key)) { event.preventDefault(); openDriver(row.dataset.driver); }
});
document.addEventListener("input", (event) => {
  if (event.target.matches("[data-raw-search]")) { state.rawSearch = event.target.value; displayRaw(); }
});
$("#fullscreen-button").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else showToast("Este navegador no permite pantalla completa.");
  } catch { showToast("No se pudo cambiar a pantalla completa."); }
});
$("#driver-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
refresh();
loadCalendar();
connectEvents();
setInterval(scheduleRefresh, 5000);
