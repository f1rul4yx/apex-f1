"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $("#main-content");
const currentYear = new Date().getFullYear();
const seasonOptions = [currentYear, currentYear - 1, currentYear - 2];

const state = {
  season: currentYear,
  seasons: new Map(),
  races: new Map(),
  calendarFilter: "all",
  standingsType: "drivers",
  timezone: localStorage.getItem("apex-timezone") || "local",
  summaryMode: "simple",
  resultTab: "race",
  routeVersion: 0,
};

const TEAM_COLORS = {
  mercedes: "#00a88f",
  red_bull: "#4768d7",
  ferrari: "#df4949",
  mclaren: "#ed8a2c",
  aston_martin: "#23856d",
  alpine: "#4c9dd7",
  williams: "#4b88cc",
  rb: "#6f7fae",
  racing_bulls: "#6f7fae",
  sauber: "#83b71f",
  audi: "#9aaf00",
  haas: "#8c9298",
  cadillac: "#8d8475",
};

const COUNTRIES = {
  Australia: ["Australia", "🇦🇺"],
  China: ["China", "🇨🇳"],
  Japan: ["Japón", "🇯🇵"],
  Bahrain: ["Baréin", "🇧🇭"],
  "Saudi Arabia": ["Arabia Saudí", "🇸🇦"],
  USA: ["Estados Unidos", "🇺🇸"],
  "United States": ["Estados Unidos", "🇺🇸"],
  Canada: ["Canadá", "🇨🇦"],
  Monaco: ["Mónaco", "🇲🇨"],
  Spain: ["España", "🇪🇸"],
  Austria: ["Austria", "🇦🇹"],
  UK: ["Reino Unido", "🇬🇧"],
  "United Kingdom": ["Reino Unido", "🇬🇧"],
  Belgium: ["Bélgica", "🇧🇪"],
  Hungary: ["Hungría", "🇭🇺"],
  Netherlands: ["Países Bajos", "🇳🇱"],
  Italy: ["Italia", "🇮🇹"],
  Azerbaijan: ["Azerbaiyán", "🇦🇿"],
  Singapore: ["Singapur", "🇸🇬"],
  Mexico: ["México", "🇲🇽"],
  Brazil: ["Brasil", "🇧🇷"],
  Qatar: ["Catar", "🇶🇦"],
  UAE: ["Emiratos Árabes Unidos", "🇦🇪"],
  "United Arab Emirates": ["Emiratos Árabes Unidos", "🇦🇪"],
  France: ["Francia", "🇫🇷"],
  Portugal: ["Portugal", "🇵🇹"],
  Germany: ["Alemania", "🇩🇪"],
  Russia: ["Rusia", "🇷🇺"],
  Turkey: ["Turquía", "🇹🇷"],
  Argentina: ["Argentina", "🇦🇷"],
  "South Africa": ["Sudáfrica", "🇿🇦"],
  India: ["India", "🇮🇳"],
  Korea: ["Corea del Sur", "🇰🇷"],
  Malaysia: ["Malasia", "🇲🇾"],
  Sweden: ["Suecia", "🇸🇪"],
  Switzerland: ["Suiza", "🇨🇭"],
};

const CONCEPTS = [
  {
    id: "drs",
    title: "DRS",
    subtitle: "El adelantamiento tiene un pequeño aliado",
    icon: "wind",
    simple: "El DRS abre una parte del alerón trasero para reducir la resistencia al aire y ganar velocidad en recta.",
    why: "Ayuda a que un coche que sigue de cerca a otro tenga una oportunidad de adelantar. Solo puede activarse en zonas determinadas y cuando se cumplen las condiciones reglamentarias.",
    detail: "DRS significa Drag Reduction System, o sistema de reducción de resistencia aerodinámica. En carrera, normalmente necesitas estar a un segundo o menos del coche de delante en el punto de detección. No es un botón de adelantamiento automático: todavía hay que frenar más tarde o colocar mejor el coche.",
    example: "Si ves que un piloto se acerca rápidamente por una recta con el alerón abierto, está usando el DRS para intentar llegar a la frenada en mejores condiciones.",
  },
  {
    id: "undercut",
    title: "Undercut",
    subtitle: "Parar antes para salir por delante",
    icon: "trending",
    simple: "Un piloto entra antes en boxes para aprovechar el ritmo de unos neumáticos más nuevos y ganar la posición cuando su rival pare después.",
    why: "Adelantar en pista puede ser muy difícil. La estrategia permite ganar una posición sin tener que superar al rival directamente en un adelantamiento.",
    detail: "Tras su parada, el piloto con neumáticos nuevos intenta marcar vueltas rápidas. Si el rival pierde tiempo con sus neumáticos antiguos, la diferencia acumulada puede bastar para que salga por detrás cuando haga su propia parada. El tráfico, la temperatura y el tiempo perdido en boxes influyen en el resultado.",
    example: "APEX solo señala un undercut cuando los datos de paradas, posiciones y tiempos permiten sostenerlo. Una parada anterior, por sí sola, no demuestra que haya funcionado.",
  },
  {
    id: "safety-car",
    title: "Safety Car",
    subtitle: "La carrera se agrupa por seguridad",
    icon: "shield",
    simple: "Sale un coche de seguridad para neutralizar la carrera cuando hay un incidente que hace peligroso seguir a ritmo normal.",
    why: "Los pilotos reducen su velocidad y se agrupan. Las diferencias que había en pista pueden desaparecer, y una parada en boxes durante este periodo puede costar menos tiempo respecto al resto.",
    detail: "Durante el Safety Car no está permitido adelantar, salvo excepciones previstas por el reglamento. El coche de seguridad recoge al líder y el grupo circula a una velocidad controlada hasta que la pista vuelve a ser segura. Un Virtual Safety Car es distinto: mantiene a los pilotos bajo un límite de tiempo sin agruparlos físicamente de la misma manera.",
    example: "Un piloto que tenía 15 segundos de ventaja puede perderla al agruparse el pelotón. Eso no significa que haya cometido un error; es una consecuencia de la neutralización.",
  },
  {
    id: "neumaticos",
    title: "Neumáticos",
    subtitle: "Ritmo y duración: elige tu equilibrio",
    icon: "circle",
    simple: "Los compuestos blandos suelen ofrecer más agarre, mientras que los duros están pensados para durar más. La elección condiciona la estrategia.",
    why: "Un neumático más rápido no siempre es la mejor opción para toda una carrera: si se degrada demasiado, obliga a parar antes o hace perder ritmo al final de la tanda.",
    detail: "En seco, Pirelli selecciona compuestos de su gama para cada fin de semana y los presenta como blando, medio y duro. También existen intermedios y de lluvia extrema para condiciones húmedas. La temperatura de la pista, el asfalto y el estilo de conducción afectan mucho a su comportamiento.",
    example: "Una tanda larga con el compuesto duro puede ahorrar una parada, pero un blando nuevo puede dar más velocidad durante menos vueltas. No hay una elección universalmente mejor.",
  },
  {
    id: "overcut",
    title: "Overcut",
    subtitle: "Quedarse fuera y ganar después",
    icon: "timer",
    simple: "Es lo contrario al undercut: un piloto retrasa su parada y aprovecha vueltas rápidas mientras su rival ya circula con neumáticos nuevos.",
    why: "Puede funcionar si los neumáticos antiguos todavía tienen buen ritmo, hay pista libre o el rival encuentra tráfico después de parar.",
    detail: "El piloto que permanece en pista busca mantener o mejorar sus tiempos antes de entrar en boxes. Para que funcione, debe conservar suficiente rendimiento y salir por delante tras su parada. Que alguien pare más tarde no basta para afirmar que intentaba un overcut.",
    example: "Si el primer piloto para y sale detrás de varios coches, su rival puede aprovechar pista libre para ganarle la posición alargando su tanda.",
  },
  {
    id: "parc-ferme",
    title: "Parc Fermé",
    subtitle: "El coche queda bajo control",
    icon: "lock",
    simple: "Es un régimen que limita las modificaciones que los equipos pueden hacer en los coches durante determinados periodos del fin de semana.",
    why: "Evita que se transforme completamente el coche entre la clasificación y la carrera, y obliga a encontrar una puesta a punto que funcione en ambas.",
    detail: "Bajo condiciones de parc fermé solo se permiten determinados trabajos y ajustes. Las reparaciones pueden requerir supervisión y las sustituciones deben cumplir el reglamento. Sus condiciones y excepciones pueden variar, por lo que conviene consultar la normativa vigente de cada temporada.",
    example: "Un equipo no puede cambiar libremente toda la configuración aerodinámica después de clasificar: buena parte de las decisiones quedan fijadas para la carrera.",
  },
];

function h(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

const ICON_PATHS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 20h4M12 13v7M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4"/>',
  users: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/>',
  flag: '<path d="M5 21V4M5 5c5-4 9 4 14 0v9c-5 4-9-4-14 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  timer: '<path d="M9 2h6M12 2v3M12 9v4l3 2"/><circle cx="12" cy="13" r="8"/>',
  trending: '<path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5ZM2 12l10 5 10-5M2 17l10 5 10-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
  circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M3 12h5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
};

function icon(name, className = "") {
  return `<svg class="${h(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.circle}</svg>`;
}

function teamColor(team) {
  if (/^[0-9a-f]{6}$/i.test(team?.colour || "")) return `#${team.colour}`;
  return TEAM_COLORS[team?.constructorId] || "#798171";
}

function driverName(driver) {
  return `${driver?.givenName || ""} ${driver?.familyName || ""}`.trim() || "Piloto";
}

function shortDriver(driver) {
  if (!driver) return "Piloto";
  return `${driver.givenName?.charAt(0) || ""}. ${driver.familyName || driver.givenName}`;
}

function countryInfo(race) {
  const country = race?.Circuit?.Location?.country || "";
  return COUNTRIES[country] || [country || "Gran Premio", "🏁"];
}

function gpName(race) {
  const [country] = countryInfo(race);
  const locality = race?.Circuit?.Location?.locality;
  if (["Las Vegas", "Miami", "Mexico City", "São Paulo"].includes(locality)) {
    const names = { "Las Vegas": "Las Vegas", Miami: "Miami", "Mexico City": "Ciudad de México", "São Paulo": "São Paulo" };
    return `Gran Premio de ${names[locality]}`;
  }
  if (country === "Países Bajos") return "Gran Premio de los Países Bajos";
  return `Gran Premio de ${country}`;
}

function raceISO(race) {
  if (!race?.date) return null;
  return `${race.date}T${race.time || "12:00:00Z"}`;
}

function dateObject(raceOrISO) {
  const value = typeof raceOrISO === "string" ? raceOrISO : raceISO(raceOrISO);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function tz() {
  return state.timezone === "utc" ? "UTC" : undefined;
}

function timezoneName() {
  return state.timezone === "utc" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ");
}

function formatDate(value, options = {}) {
  const date = dateObject(value);
  if (!date) return "Hora por confirmar";
  return new Intl.DateTimeFormat("es-ES", { timeZone: tz(), ...options }).format(date);
}

function raceDate(race, long = false) {
  return formatDate(race, long
    ? { weekday: "long", day: "numeric", month: "long" }
    : { day: "numeric", month: "short" }
  ).replaceAll(".", "");
}

function raceTime(race) {
  if (!race?.time) return "Por confirmar";
  return formatDate(race, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function raceEnd(race) {
  const start = dateObject(race);
  return start ? start.getTime() + 3 * 60 * 60 * 1000 : 0;
}

function raceStatus(race) {
  const now = Date.now();
  const start = dateObject(race)?.getTime() || 0;
  if (now > raceEnd(race)) return "completed";
  if (now >= start) return "weekend";
  return "upcoming";
}

function nextRace(races) {
  return races.find((race) => Date.now() < raceEnd(race)) || races.at(-1);
}

function seasonSelect() {
  return `<select class="season-select" data-season-select aria-label="Seleccionar temporada">${seasonOptions.map((year) =>
    `<option value="${year}" ${year === state.season ? "selected" : ""}>Temporada ${year}</option>`).join("")}</select>`;
}

function timezoneSelect() {
  return `<select class="timezone-select" data-timezone-select aria-label="Zona horaria">
    <option value="local" ${state.timezone === "local" ? "selected" : ""}>Mi hora · ${h(timezoneName())}</option>
    <option value="utc" ${state.timezone === "utc" ? "selected" : ""}>UTC</option>
  </select>`;
}

function dataNotice(data) {
  if (!data?.stale) return "";
  return `<div class="data-notice">${icon("info")}<span>La fuente no está disponible ahora. Mostramos una copia guardada${data.fetchedAt ? ` del ${formatDate(data.fetchedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.</span></div>`;
}

function trackSvg(circuitId = "") {
  const paths = [
    "M90 195c-27-11-35-45-17-63 14-14 45-13 50-34 4-18-17-37-4-55 13-19 46-7 61 6 20 18 23 38 43 43 17 4 35-12 52-5 28 11 37 55 17 77-18 20-50 6-65 26-12 16-8 46-29 51-25 6-35-31-58-31-18 0-32 3-50-15Z",
    "M60 160c-8-34 20-51 45-48 31 4 34-18 34-40 0-27 27-42 48-29 18 11 6 35 22 44 17 10 44-9 61 0 24 13 33 42 19 61-14 20-42 16-50 38-9 25 10 48-10 60-21 13-43-11-56-27-14-17-31-16-48-10-23 8-41 14-58-1-12-11-3-32-7-48Z",
    "M69 207c-25-17-16-47 4-61 19-14 38-7 46-28 9-24-16-47-2-70 13-21 40-19 57-4 15 14 13 35 30 46 15 9 38-5 57 2 29 11 48 50 31 75-15 22-47 9-65 22-21 16-14 54-41 58-27 4-37-34-60-35-21-1-38 9-57-5Z",
  ];
  const index = [...circuitId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % paths.length;
  return `<svg class="track-art" viewBox="0 0 380 280" aria-hidden="true">
    <g transform="translate(20 0)"><path class="track-shadow" d="${paths[index]}"/><path class="track-line" d="${paths[index]}"/><circle class="track-start" cx="90" cy="195" r="5"/><text x="105" y="202">SALIDA / META</text><text x="245" y="250">TRAZADO ILUSTRATIVO</text></g>
  </svg>`;
}

async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(data?.error || "No se pudieron cargar los datos.");
  return data;
}

async function ensureSeason(year) {
  if (!state.seasons.has(year)) {
    const data = await api(`/api/season?year=${year}`);
    state.seasons.set(year, data);
  }
  return state.seasons.get(year);
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "inicio";
  const parts = hash.split("/");
  if (parts[0] === "gp") return { name: "gp", year: Number(parts[1]), round: Number(parts[2]) };
  return { name: ["inicio", "calendario", "clasificacion", "aprende"].includes(parts[0]) ? parts[0] : "inicio" };
}

function setDocumentTitle(title) {
  document.title = title ? `${title} — APEX` : "APEX — La Fórmula 1, explicada";
}

function updateNav(active) {
  $$('[data-nav]').forEach((link) => link.classList.toggle("active", link.dataset.nav === active));
  $("#header-season").textContent = state.season;
}

function loadingPage() {
  main.innerHTML = `<div class="initial-loader"><span class="loader-flag"></span><p>Cargando datos de la temporada…</p></div>`;
}

function renderError(message) {
  setDocumentTitle("No hay conexión");
  main.innerHTML = `<div class="page"><div class="error-page"><span class="error-code">BANDERA AMARILLA</span><h1>No pudimos cargar los datos</h1><p>${h(message)}</p><button class="button button-dark" data-retry type="button">${icon("refresh")} Reintentar</button></div></div>`;
}

function miniStandings(standings) {
  if (!standings.length) return `<div class="empty-state"><h3>Parrilla en preparación</h3><p>La clasificación aparecerá cuando empiece la temporada.</p></div>`;
  const leaderPoints = Number(standings[0].points) || 1;
  return `<div class="mini-standings">${standings.slice(0, 5).map((item) => {
    const team = item.Constructors?.[0];
    const points = Number(item.points) || 0;
    return `<div class="mini-standing">
      <span class="position-number">${h(item.position)}</span>
      <div class="driver-cell"><span class="driver-avatar" style="--team-color:${teamColor(team)}">${h(item.Driver.code || item.Driver.familyName.slice(0, 3).toUpperCase())}</span><div class="driver-info"><span class="driver-name">${h(shortDriver(item.Driver))}</span><span class="driver-team">${h(team?.name || "Equipo")}</span></div></div>
      <div class="points-bar" style="--team-color:${teamColor(team)}" aria-hidden="true"><span style="width:${Math.max(3, points / leaderPoints * 100)}%"></span></div>
      <span class="mini-points">${h(item.points)}<small>PTS</small></span>
    </div>`;
  }).join("")}</div>`;
}

function renderHome(data) {
  const race = nextRace(data.races);
  if (!race) return renderError("Todavía no hay un calendario disponible para esta temporada.");
  const status = raceStatus(race);
  const isOver = status === "completed" && data.races.at(-1)?.round === race.round;
  const [country, flag] = countryInfo(race);
  const completed = data.races.filter((item) => raceStatus(item) === "completed").length;
  const drivers = data.driverStandings;
  setDocumentTitle("Inicio");
  main.innerHTML = `<div class="page home-page">
    ${dataNotice(data)}
    <section class="home-hero" aria-labelledby="home-title">
      <div class="hero-layout">
        <div class="hero-copy">
          <div class="hero-round"><span class="eyebrow light"><span class="live-dot"></span>${isOver ? "ÚLTIMA PARADA" : "PRÓXIMA PARADA"}</span><span class="round-number">RONDA ${h(race.round)} / ${data.races.length}</span></div>
          <h1 class="hero-title" id="home-title">${h(gpName(race))}</h1>
          <p class="hero-location">${icon("pin")} ${h(race.Circuit.circuitName)} · ${h(race.Circuit.Location.locality)}, ${h(country)}</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#gp/${state.season}/${race.round}">${status === "completed" ? "Ver resultados" : "Explorar el Gran Premio"} ${icon("arrow")}</a>
            <button class="button button-ghost" type="button" data-ics-round="${h(race.round)}">${icon("calendar")} Añadir al calendario</button>
          </div>
          <div class="hero-schedule"><div class="hero-date"><small>Fecha de carrera</small><strong>${h(raceDate(race, true))}</strong></div><div class="hero-time"><small>Hora · ${h(timezoneName())}</small><strong>${h(raceTime(race))}</strong></div></div>
        </div>
        <div class="hero-race-panel">
          ${trackSvg(race.Circuit.circuitId)}
          <div class="countdown-card">
            <div class="countdown-label"><span>${status === "completed" ? "TEMPORADA" : "CUENTA ATRÁS PARA LA CARRERA"}</span><span>Horarios en tu zona</span></div>
            ${status === "completed" ? '<div class="hero-finished">Temporada completada. Revive cada carrera.</div>' : `<div class="countdown" data-countdown="${h(raceISO(race))}">${countdownMarkup(race)}</div>`}
          </div>
        </div>
      </div>
    </section>

    <section class="season-strip" aria-label="Resumen de la temporada">
      <div class="season-stat"><span class="stat-icon">${icon("flag")}</span><div><strong class="stat-value">${data.races.length}</strong><span class="stat-label">Grandes Premios</span></div></div>
      <div class="season-stat"><span class="stat-icon">${icon("users")}</span><div><strong class="stat-value">${drivers.length || "—"}</strong><span class="stat-label">Pilotos en el mundial</span></div></div>
      <div class="season-stat"><span class="stat-icon">${icon("trophy")}</span><div><strong class="stat-value">${data.constructorStandings.length || "—"}</strong><span class="stat-label">Equipos en la lucha</span></div></div>
      <div class="season-stat"><span class="stat-icon">${icon("check")}</span><div><strong class="stat-value">${completed} / ${data.races.length}</strong><span class="stat-label">Carreras disputadas</span></div></div>
    </section>

    <div class="home-grid">
      <section class="card standings-preview">
        <div class="section-heading"><div><h2>La lucha por el mundial</h2><p>Clasificación de pilotos · Ronda ${h(data.standingsRound)}</p></div><a class="text-link" href="#clasificacion">Ver clasificación ${icon("arrow")}</a></div>
        ${miniStandings(drivers)}
      </section>
      <section class="card learn-preview">
        <div class="section-heading"><div><h2>Entiende la carrera</h2><p class="muted">Conceptos clave, sin tecnicismos.</p></div><a class="text-link" href="#aprende" aria-label="Ver todos los conceptos">${icon("arrow")}</a></div>
        <div class="concept-list">${CONCEPTS.slice(0, 3).map((concept) => conceptRow(concept)).join("")}</div>
      </section>
    </div>
    <p class="home-bottom-note">${icon("info")} Datos de OpenF1 · Esta versión se actualiza después de las sesiones, no en directo.</p>
  </div>`;
  updateCountdowns();
}

function countdownMarkup(race) {
  const distance = Math.max(0, (dateObject(race)?.getTime() || Date.now()) - Date.now());
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor(distance / 3600000) % 24;
  const minutes = Math.floor(distance / 60000) % 60;
  const seconds = Math.floor(distance / 1000) % 60;
  return [["Días", days], ["Horas", hours], ["Min", minutes], ["Seg", seconds]].map(([label, value]) =>
    `<div class="countdown-unit"><strong class="countdown-value">${String(value).padStart(2, "0")}</strong><small>${label}</small></div>`).join("");
}

function updateCountdowns() {
  $$('[data-countdown]').forEach((element) => {
    const race = { date: element.dataset.countdown.slice(0, 10), time: element.dataset.countdown.slice(11) };
    element.innerHTML = countdownMarkup(race);
  });
}

function conceptRow(concept) {
  return `<button class="concept-link" type="button" data-concept="${concept.id}"><span class="concept-icon">${icon(concept.icon)}</span><span><span class="concept-name">${h(concept.title)}</span><span class="concept-subtitle">${h(concept.subtitle)}</span></span>${icon("arrow")}</button>`;
}

function renderCalendar(data) {
  const next = nextRace(data.races);
  const filtered = data.races.filter((race) => {
    if (state.calendarFilter === "completed") return raceStatus(race) === "completed";
    if (state.calendarFilter === "upcoming") return raceStatus(race) !== "completed";
    return true;
  });
  setDocumentTitle("Calendario");
  main.innerHTML = `<div class="page page-pad">
    <div class="page-heading"><div><p class="eyebrow">CADA PARADA, EN TU HORA</p><h1 class="page-title">Calendario ${state.season}</h1><p class="page-intro">Todo el fin de semana, de los primeros libres a la bandera a cuadros.</p></div><div class="heading-controls">${seasonSelect()}${timezoneSelect()}</div></div>
    ${dataNotice(data)}
    <div class="filter-row"><div class="segmented" aria-label="Filtrar carreras">${[["all", "Todas"], ["upcoming", "Próximas"], ["completed", "Disputadas"]].map(([value, label]) => `<button type="button" data-calendar-filter="${value}" class="${state.calendarFilter === value ? "active" : ""}" aria-pressed="${state.calendarFilter === value}">${label}</button>`).join("")}</div><span class="calendar-count">${filtered.length} ${filtered.length === 1 ? "Gran Premio" : "Grandes Premios"} · ${h(timezoneName())}</span></div>
    ${filtered.length ? `<div class="calendar-grid">${filtered.map((race) => raceCard(race, next)).join("")}</div>` : `<div class="empty-state">${icon("calendar")}<h3>No hay carreras en este filtro</h3><p>Prueba con otra selección para ver el resto de la temporada.</p></div>`}
  </div>`;
}

function raceCard(race, next) {
  const status = raceStatus(race);
  const isNext = next?.round === race.round && status !== "completed";
  const [, flag] = countryInfo(race);
  const statusLabel = status === "completed" ? "Disputado" : status === "weekend" ? "En curso" : isNext ? "Próximo" : `Ronda ${race.round}`;
  return `<a class="card race-card ${isNext ? "next-race" : ""}" href="#gp/${state.season}/${race.round}" aria-label="${h(gpName(race))}, ronda ${h(race.round)}">
    <div class="race-card-top"><div><span class="race-round">RONDA ${String(race.round).padStart(2, "0")}</span><div><span class="flag" aria-hidden="true">${flag}</span></div></div><span class="tag ${isNext ? "next" : status === "completed" ? "done" : ""}">${statusLabel}</span></div>
    <div class="race-date-block">${h(raceDate(race, true))} · ${h(raceTime(race))}</div>
    <h2>${h(gpName(race))}</h2>
    <p class="race-circuit">${icon("pin")}<span>${h(race.Circuit.circuitName)}</span></p>
    <div class="race-card-footer"><div class="race-card-time"><small>${status === "completed" ? "Ver fin de semana" : "Carrera"}</small><strong>${status === "completed" ? "Resultados y resumen" : `${h(raceDate(race))} · ${h(raceTime(race))}`}</strong></div><span class="card-arrow">${icon("arrow")}</span></div>
  </a>`;
}

function renderStandings(data) {
  const isDrivers = state.standingsType === "drivers";
  const standings = isDrivers ? data.driverStandings : data.constructorStandings;
  const first = standings[0];
  const second = standings[1];
  const gap = first && second ? Number(first.points) - Number(second.points) : 0;
  setDocumentTitle("Clasificación");
  main.innerHTML = `<div class="page page-pad">
    <div class="page-heading"><div><p class="eyebrow">CADA PUNTO CUENTA</p><h1 class="page-title">Clasificación</h1><p class="page-intro">El mundial, al día. Pilotos, equipos, victorias y distancia con el líder.</p></div>${seasonSelect()}</div>
    ${dataNotice(data)}
    <section class="card standings-card">
      <div class="table-toolbar"><div class="segmented" aria-label="Tipo de clasificación"><button type="button" data-standing-type="drivers" class="${isDrivers ? "active" : ""}" aria-pressed="${isDrivers}">Pilotos</button><button type="button" data-standing-type="constructors" class="${!isDrivers ? "active" : ""}" aria-pressed="${!isDrivers}">Constructores</button></div><label class="search-box">${icon("search")}<span class="sr-only">Buscar en la clasificación</span><input type="search" id="standings-search" placeholder="Buscar ${isDrivers ? "piloto o equipo" : "equipo"}…" autocomplete="off"></label></div>
      <div class="table-scroll">${isDrivers ? driverTable(standings) : constructorTable(standings)}</div>
      <div class="table-footer"><span id="table-count">${standings.length} ${isDrivers ? "pilotos" : "equipos"} · Actualizado tras la ronda ${h(data.standingsRound)}</span><span>Fuente: OpenF1</span></div>
    </section>
    ${first && second ? `<section class="card standings-insight"><div><h3>La diferencia en lo más alto</h3><p>${h(isDrivers ? driverName(first.Driver) : first.Constructor.name)} aventaja a ${h(isDrivers ? driverName(second.Driver) : second.Constructor.name)} al frente del campeonato.</p></div><div class="insight-number"><strong>${gap}</strong><span>puntos de ventaja</span></div></section>` : ""}
  </div>`;
}

function driverTable(standings) {
  const leaderPoints = Number(standings[0]?.points) || 1;
  return `<table class="standings-table"><thead><tr><th>Pos.</th><th>Piloto</th><th class="optional-mobile">Equipo</th><th class="optional-mobile">Victorias</th><th style="text-align:right">Puntos</th></tr></thead><tbody>${standings.map((item) => {
    const team = item.Constructors?.[0];
    const search = `${driverName(item.Driver)} ${team?.name || ""}`.toLowerCase();
    return `<tr data-search="${h(search)}"><td class="table-position">${h(item.position)}</td><td class="table-driver"><div class="driver-cell"><span class="team-color-line" style="--team-color:${teamColor(team)}"></span><div class="driver-info"><span class="driver-name">${h(driverName(item.Driver))}<span class="driver-code">${h(item.Driver.code || "")}</span></span><span class="driver-team">${item.Driver.permanentNumber ? `N.º ${h(item.Driver.permanentNumber)}` : ""}</span></div></div></td><td class="optional-mobile">${h(team?.name || "—")}</td><td class="optional-mobile">${h(item.wins)}</td><td class="table-points points-cell">${h(item.points)} <small>PTS</small><div class="points-bar" style="--team-color:${teamColor(team)}"><span style="width:${Math.max(2, Number(item.points) / leaderPoints * 100)}%"></span></div></td></tr>`;
  }).join("")}</tbody></table>`;
}

function constructorTable(standings) {
  const leaderPoints = Number(standings[0]?.points) || 1;
  return `<table class="standings-table"><thead><tr><th>Pos.</th><th>Equipo</th><th class="optional-mobile">Pilotos</th><th class="optional-mobile">Victorias</th><th style="text-align:right">Puntos</th></tr></thead><tbody>${standings.map((item) => {
    const team = item.Constructor;
    return `<tr data-search="${h(`${team.name} ${team.nationality}`.toLowerCase())}"><td class="table-position">${h(item.position)}</td><td><div class="team-table-name" style="--team-color:${teamColor(team)}"><span class="team-monogram">${h(team.name.slice(0, 2).toUpperCase())}</span>${h(team.name)}</div></td><td class="optional-mobile">${h(team.drivers || team.nationality || "—")}</td><td class="optional-mobile">${h(item.wins)}</td><td class="table-points points-cell">${h(item.points)} <small>PTS</small><div class="points-bar" style="--team-color:${teamColor(team)}"><span style="width:${Math.max(2, Number(item.points) / leaderPoints * 100)}%"></span></div></td></tr>`;
  }).join("")}</tbody></table>`;
}

function sessions(race) {
  const sessionMap = [
    ["FirstPractice", "Libres 1"], ["SecondPractice", "Libres 2"], ["ThirdPractice", "Libres 3"],
    ["SprintQualifying", "Clasificación del sprint"], ["Sprint", "Sprint"], ["Qualifying", "Clasificación"],
  ];
  const entries = sessionMap.filter(([key]) => race[key]?.date).map(([key, label]) => ({ key, label, date: `${race[key].date}T${race[key].time || "12:00:00Z"}` }));
  entries.push({ key: "Race", label: "Carrera", date: raceISO(race) });
  return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function sessionList(race) {
  return `<div class="session-list">${sessions(race).map((session) => `<div class="session-row ${session.key === "Race" ? "main-session" : ""}"><span class="session-name">${icon(session.key === "Race" ? "flag" : session.key === "Qualifying" ? "timer" : "clock")} ${h(session.label)}</span><span class="session-day">${h(formatDate(session.date, { weekday: "short", day: "numeric", month: "short" }).replaceAll(".", ""))}</span><strong class="session-time">${h(formatDate(session.date, { hour: "2-digit", minute: "2-digit", hour12: false }))}</strong></div>`).join("")}</div>`;
}

function raceInfo(race) {
  const [country] = countryInfo(race);
  return `<div class="race-info-list">
    <div class="race-info-item">${icon("calendar")}<div><small>Fecha de carrera</small><strong>${h(raceDate(race, true))}</strong></div></div>
    <div class="race-info-item">${icon("clock")}<div><small>Hora de inicio</small><strong>${h(raceTime(race))} · ${h(timezoneName())}</strong></div></div>
    <div class="race-info-item">${icon("pin")}<div><small>Circuito</small><strong>${h(race.Circuit.circuitName)}</strong></div></div>
    <div class="race-info-item">${icon("globe")}<div><small>Sede</small><strong>${h(race.Circuit.Location.locality)}, ${h(country)}</strong></div></div>
  </div>`;
}

function buildInsights(results, analysis = {}) {
  const insights = [];
  const winner = results.find((item) => item.position === "1");
  if (winner) {
    const grid = Number(winner.grid);
    const start = grid > 0 ? `desde la P${grid}` : "desde el pit lane";
    insights.push({
      icon: "trophy", title: "El ganador",
      text: `${driverName(winner.Driver)} ganó la carrera saliendo ${start}${grid === 1 ? ", la pole position" : ""}.`,
      detail: `Parrilla: P${winner.grid} · Resultado: P1${winner.Time?.time ? ` · Tiempo: ${winner.Time.time}` : ""} · ${winner.points} puntos`,
    });
  }
  const fastest = results.find((item) => item.FastestLap?.rank === "1");
  if (fastest) {
    insights.push({
      icon: "timer", title: "La vuelta más rápida",
      text: `${driverName(fastest.Driver)} firmó la mejor vuelta de la carrera: ${fastest.FastestLap.Time?.time || "tiempo no disponible"}.`,
      detail: `Vuelta ${fastest.FastestLap.lap || "—"} · Terminó P${fastest.position}. La vuelta rápida no siempre decide el resultado de la carrera.`,
    });
  }
  if (analysis?.fastestPit) {
    const driver = results.find((item) => String(item.number) === String(analysis.fastestPit.driverNumber));
    if (driver) {
      insights.push({
        icon: "zap", title: "La parada más rápida",
        text: analysis.fastestPit.metric === "lane_duration"
          ? `${driverName(driver.Driver)} registró el paso por boxes más rápido: ${Number(analysis.fastestPit.duration).toFixed(1)} segundos.`
          : `${driverName(driver.Driver)} completó la parada más rápida: ${Number(analysis.fastestPit.duration).toFixed(1)} segundos detenido.`,
        detail: `Registrada en la vuelta ${analysis.fastestPit.lap || "—"}. ${analysis.fastestPit.metric === "lane_duration" ? "Mide todo el paso por el pit lane, no solo el tiempo detenido." : "Mide el tiempo detenido, no todo el paso por el pit lane."}`,
      });
    }
  }
  if (analysis?.neutralizations > 0) {
    insights.push({
      icon: "shield", title: "La carrera se neutralizó",
      text: `El control de carrera registró ${analysis.neutralizations} ${analysis.neutralizations === 1 ? "despliegue" : "despliegues"} de Safety Car o Virtual Safety Car.`,
      detail: "Se cuentan los mensajes de despliegue registrados por OpenF1, no las vueltas que duró cada neutralización.",
    });
  }
  const climbers = results.filter((item) => Number(item.grid) > 0 && /^\d+$/.test(item.positionText || item.position)).map((item) => ({ item, gain: Number(item.grid) - Number(item.position) })).sort((a, b) => b.gain - a.gain);
  if (climbers[0]?.gain > 0) {
    const { item, gain } = climbers[0];
    insights.push({
      icon: "trending", title: "La mayor remontada",
      text: `${driverName(item.Driver)} ganó ${gain} ${gain === 1 ? "posición" : "posiciones"}: salió P${item.grid} y terminó P${item.position}.`,
      detail: "Se calcula restando la posición final a la posición de salida. Los datos no atribuyen la remontada a una causa concreta.",
    });
  }
  if (analysis?.winnerCompounds?.length) {
    const names = { SOFT: "blando", MEDIUM: "medio", HARD: "duro", INTERMEDIATE: "intermedio", WET: "lluvia extrema" };
    const compounds = analysis.winnerCompounds.map((compound) => names[compound] || compound.toLowerCase());
    insights.push({
      icon: "circle", title: "Los neumáticos del ganador",
      text: `El ganador utilizó ${compounds.length === 1 ? `el compuesto ${compounds[0]}` : `estos compuestos: ${compounds.join(" → ")}`}.`,
      detail: "La secuencia procede de las tandas registradas por OpenF1; los datos por sí solos no demuestran la intención del equipo.",
    });
  }
  const notFinished = results.filter((item) => item.status !== "Finished" && !String(item.status).startsWith("+"));
  if (notFinished.length) {
    insights.push({
      icon: "alert", title: "Quiénes no terminaron",
      text: `${notFinished.length} ${notFinished.length === 1 ? "piloto no completó" : "pilotos no completaron"} la carrera: ${notFinished.map((item) => shortDriver(item.Driver)).join(", ")}.`,
      detail: notFinished.map((item) => `${shortDriver(item.Driver)}: ${item.status}`).join(" · "),
    });
  }
  return insights.slice(0, 7);
}

function podium(results) {
  const top = results.filter((item) => ["1", "2", "3"].includes(item.position)).sort((a, b) => Number(a.position) - Number(b.position));
  if (top.length < 3) return "";
  return `<div class="podium">${top.map((item) => `<div class="podium-place"><span class="podium-position">${item.position}</span><span class="podium-medal">${item.position}</span><h3 class="podium-driver">${h(shortDriver(item.Driver))}</h3><span class="podium-team">${h(item.Constructor?.name || "")}</span></div>`).join("")}</div>`;
}

function resultsTable(results, qualifying = false) {
  if (!results.length) return `<div class="empty-state">${icon("flag")}<h3>Resultados todavía no disponibles</h3><p>Vuelve después de la sesión para consultar la clasificación.</p></div>`;
  if (qualifying) {
    return `<div class="table-scroll"><table class="results-table"><thead><tr><th>Pos.</th><th>Piloto</th><th class="optional-mobile">Equipo</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead><tbody>${results.map((item) => `<tr><td class="table-position">${h(item.position)}</td><td class="table-driver"><span class="driver-name">${h(driverName(item.Driver))}</span></td><td class="optional-mobile">${h(item.Constructor?.name || "—")}</td><td>${h(item.Q1 || "—")}</td><td>${h(item.Q2 || "—")}</td><td>${h(item.Q3 || "—")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  return `<div class="table-scroll"><table class="results-table"><thead><tr><th>Pos.</th><th>Piloto</th><th class="optional-mobile">Parrilla</th><th class="optional-mobile">Vueltas</th><th>Tiempo / estado</th><th style="text-align:right">Puntos</th></tr></thead><tbody>${results.map((item) => `<tr><td class="table-position">${h(item.positionText || item.position)}</td><td class="table-driver"><div class="driver-cell"><span class="team-color-line" style="--team-color:${teamColor(item.Constructor)}"></span><div class="driver-info"><span class="driver-name">${h(driverName(item.Driver))}</span><span class="driver-team">${h(item.Constructor?.name || "")}</span></div></div></td><td class="optional-mobile">P${h(item.grid)}</td><td class="optional-mobile">${h(item.laps)}</td><td class="result-status">${h(item.Time?.time || item.status)}${item.FastestLap?.rank === "1" ? ' <span class="fastest-lap">VUELTA RÁPIDA</span>' : ""}</td><td class="table-points">${h(item.points)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderRace(currentRoute, data, raceData = null) {
  const scheduleRace = data.races.find((item) => Number(item.round) === currentRoute.round);
  if (!scheduleRace) return renderError("Ese Gran Premio no existe en el calendario seleccionado.");
  const race = raceData?.race?.Circuit ? { ...scheduleRace, ...raceData.race } : scheduleRace;
  const results = raceData?.results || [];
  const qualifying = raceData?.qualifying || [];
  const status = raceStatus(scheduleRace);
  const [, flag] = countryInfo(race);
  const insights = buildInsights(results, raceData?.analysis);
  const hasResults = results.length > 0;
  const activeResults = state.resultTab === "qualifying" ? qualifying : results;
  setDocumentTitle(gpName(race));
  main.innerHTML = `<div class="page page-pad">
    <a href="#calendario" class="breadcrumb">${icon("arrow")} Volver al calendario</a>
    ${dataNotice(raceData || data)}
    <section class="race-detail-hero" data-round="${String(race.round).padStart(2, "0")}">
      <div class="race-detail-heading"><div class="race-detail-title-row"><span class="flag" aria-hidden="true">${flag}</span><div><p class="eyebrow">RONDA ${h(race.round)} · TEMPORADA ${state.season}</p><h1>${h(gpName(race))}</h1><p class="race-detail-location">${h(race.Circuit.circuitName)} · ${h(race.Circuit.Location.locality)}</p></div></div><span class="tag ${status !== "completed" ? "next" : ""}">${status === "completed" ? "Carrera disputada" : status === "weekend" ? "Fin de semana en curso" : "Próximamente"}</span></div>
      <div class="race-detail-actions"><button class="button button-primary" type="button" data-ics-round="${h(race.round)}">${icon("calendar")} Añadir al calendario</button>${hasResults ? '<button class="button button-ghost" type="button" data-scroll-results>Ver clasificación</button>' : ""}</div>
    </section>

    <div class="detail-grid">
      <div class="detail-main">
        ${raceData === null ? `<section class="card detail-card"><div class="detail-loading">Buscando resultados de la sesión…</div></section>` : ""}
        ${hasResults ? `<section class="card detail-card"><div class="section-heading"><div><h2>El podio</h2><p>Resultado oficial de la carrera</p></div><span class="tag done">Final</span></div>${podium(results)}</section>` : ""}
        ${insights.length ? `<section class="card detail-card"><div class="section-heading"><div><h2>La carrera, en claro</h2><p>Hechos que explican el resultado.</p></div><div class="mode-toggle" aria-label="Nivel de explicación"><button type="button" data-summary-mode="simple" class="${state.summaryMode === "simple" ? "active" : ""}">En breve</button><button type="button" data-summary-mode="expert" class="${state.summaryMode === "expert" ? "active" : ""}">Con datos</button></div></div><div class="explainer-list">${insights.map((item) => `<article class="explainer-item"><span class="explainer-icon">${icon(item.icon)}</span><div><h3>${h(item.title)}</h3><p>${h(item.text)}${state.summaryMode === "expert" ? `<span class="fact-detail">${h(item.detail)}</span>` : ""}</p></div></article>`).join("")}</div></section>` : ""}
        ${raceData !== null && (hasResults || qualifying.length || status === "completed") ? `<section class="card detail-card" id="race-results"><div class="section-heading"><div><h2>Clasificación</h2><div class="result-tabs"><button type="button" data-result-tab="race" class="${state.resultTab === "race" ? "active" : ""}">Carrera</button><button type="button" data-result-tab="qualifying" class="${state.resultTab === "qualifying" ? "active" : ""}">Clasificación previa</button></div></div></div>${resultsTable(activeResults, state.resultTab === "qualifying")}</section>` : ""}
        ${!hasResults && raceData !== null && status !== "completed" ? `<section class="card detail-card"><div class="section-heading"><div><h2>El fin de semana</h2><p>Todos los horarios · ${h(timezoneName())}</p></div></div>${sessionList(scheduleRace)}</section><section class="card detail-card"><div class="section-heading"><div><h2>Tu resumen, después de la carrera</h2><p>Sin spoilers hasta que decidas consultarlo.</p></div></div><div class="explainer-item"><span class="explainer-icon">${icon("book")}</span><div><h3>Resultados que se entienden</h3><p>Cuando termine la sesión encontrarás aquí el podio, la vuelta rápida, la mayor remontada y los datos esenciales, sin interpretaciones inventadas.</p></div></div></section>` : ""}
      </div>
      <aside class="detail-side">
        ${hasResults || status === "completed" ? `<section class="card detail-card"><div class="section-heading"><div><h2>El fin de semana</h2><p>Horarios · ${h(timezoneName())}</p></div></div>${sessionList(scheduleRace)}</section>` : ""}
        <section class="card detail-card"><div class="section-heading"><h2>Datos del circuito</h2></div>${raceInfo(scheduleRace)}</section>
        <section class="card detail-card"><div class="section-heading"><h2>¿Nuevo en la F1?</h2></div><p class="muted" style="font-size:12px;margin-top:-6px">Aprende los conceptos que aparecen en cada retransmisión, explicados sin tecnicismos.</p><a class="text-link" href="#aprende">Explorar el glosario ${icon("arrow")}</a></section>
      </aside>
    </div>
  </div>`;
}

function renderLearn() {
  setDocumentTitle("Aprende Fórmula 1");
  updateNav("aprende");
  main.innerHTML = `<div class="page page-pad">
    <div class="learn-hero"><div><p class="eyebrow">DE LA PARILLA A LA BANDERA</p><h1 class="page-title">La F1, sin<br>tecnicismos.</h1><p class="page-intro">Lo esencial para seguir una carrera y entender las decisiones que cambian el resultado.</p></div><div class="learn-hero-note"><strong>No necesitas saberlo todo.</strong>Empieza por una idea. Cada explicación incluye por qué importa y un ejemplo de carrera.</div></div>
    <div class="filter-row"><span class="calendar-count" id="concept-count">${CONCEPTS.length} conceptos esenciales</span><label class="search-box learn-search">${icon("search")}<span class="sr-only">Buscar un concepto</span><input type="search" id="learn-search" placeholder="¿Qué quieres entender?" autocomplete="off"></label></div>
    <div class="learn-grid" id="learn-grid">${CONCEPTS.map((concept, index) => `<article class="card learn-card" data-search="${h(`${concept.title} ${concept.subtitle} ${concept.simple}`.toLowerCase())}"><div class="learn-card-top"><span class="concept-icon">${icon(concept.icon)}</span><span class="learn-number">${String(index + 1).padStart(2, "0")}</span></div><h2>${h(concept.title)}</h2><p>${h(concept.simple)}</p><button class="text-link" type="button" data-concept="${concept.id}">Entender el concepto ${icon("arrow")}</button></article>`).join("")}</div>
    <div class="empty-state" id="learn-empty" hidden><h3>No encontramos ese concepto</h3><p>Prueba con “DRS”, “neumáticos” o “estrategia”.</p></div>
  </div>`;
}

function openConcept(id) {
  const concept = CONCEPTS.find((item) => item.id === id);
  if (!concept) return;
  $("#dialog-content").innerHTML = `<span class="dialog-kicker">GUÍA APEX · EN 2 MINUTOS</span><h2 id="dialog-title">${h(concept.title)}</h2><p class="dialog-simple">${h(concept.simple)}</p><div class="dialog-section"><h3>Por qué importa</h3><p>${h(concept.why)}</p></div><div class="dialog-section"><h3>Un poco más de detalle</h3><p>${h(concept.detail)}</p></div><div class="dialog-section dialog-example"><h3>En una carrera</h3><p><strong>Ejemplo:</strong> ${h(concept.example)}</p></div>`;
  const dialog = $("#concept-dialog");
  if (!dialog.open) dialog.showModal();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3500);
}

function downloadCalendar(round) {
  const data = state.seasons.get(state.season);
  const race = data?.races.find((item) => Number(item.round) === Number(round));
  if (!race) return showToast("No encontramos esa carrera en el calendario.");
  const start = dateObject(race);
  if (!start) return showToast("La fecha todavía no está confirmada.");
  const end = new Date(start.getTime() + 2 * 3600000);
  const icsDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escapeICS = (text) => String(text).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//APEX//Calendario F1//ES", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:apex-${state.season}-${round}@apex.local`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${escapeICS(gpName(race))}`,
    `LOCATION:${escapeICS(`${race.Circuit.circuitName}, ${race.Circuit.Location.locality}`)}`,
    `DESCRIPTION:${escapeICS("Carrera añadida desde APEX. Comprueba los horarios oficiales por si cambian.")}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `apex-${state.season}-ronda-${round}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Carrera descargada. Abre el archivo para añadirla a tu calendario.");
}

function filterStandings(query) {
  const normalized = query.trim().toLowerCase();
  let visible = 0;
  $$('.standings-table tbody tr').forEach((row) => {
    const match = row.dataset.search.includes(normalized);
    row.hidden = !match;
    if (match) visible += 1;
  });
  const count = $("#table-count");
  if (count) count.textContent = normalized ? `${visible} resultados para “${query.trim()}”` : `${$$('.standings-table tbody tr').length} resultados`;
}

function filterConcepts(query) {
  const normalized = query.trim().toLowerCase();
  let visible = 0;
  $$('.learn-card').forEach((card) => {
    const match = card.dataset.search.includes(normalized);
    card.hidden = !match;
    if (match) visible += 1;
  });
  $("#concept-count").textContent = `${visible} ${visible === 1 ? "concepto" : "conceptos"}`;
  $("#learn-empty").hidden = visible > 0;
}

async function renderRoute() {
  const currentRoute = route();
  const version = ++state.routeVersion;
  $("#mobile-nav").hidden = true;
  $("#menu-button").setAttribute("aria-expanded", "false");
  if (currentRoute.name === "aprende") {
    state.season = Number.isFinite(currentRoute.year) ? currentRoute.year : state.season;
    renderLearn();
    return;
  }
  if (currentRoute.name === "gp" && Number.isFinite(currentRoute.year)) state.season = currentRoute.year;
  updateNav(currentRoute.name === "gp" ? "calendario" : currentRoute.name);
  if (!state.seasons.has(state.season)) loadingPage();
  try {
    const data = await ensureSeason(state.season);
    if (version !== state.routeVersion) return;
    updateNav(currentRoute.name === "gp" ? "calendario" : currentRoute.name);
    if (currentRoute.name === "inicio") renderHome(data);
    if (currentRoute.name === "calendario") renderCalendar(data);
    if (currentRoute.name === "clasificacion") renderStandings(data);
    if (currentRoute.name === "gp") {
      if (!Number.isInteger(currentRoute.round) || currentRoute.round < 1) return renderError("La ronda indicada no es válida.");
      const key = `${state.season}-${currentRoute.round}`;
      renderRace(currentRoute, data, state.races.get(key) || null);
      if (!state.races.has(key)) {
        try {
          const raceData = await api(`/api/race?year=${state.season}&round=${currentRoute.round}`);
          state.races.set(key, raceData);
          if (version === state.routeVersion) renderRace(currentRoute, data, raceData);
        } catch (error) {
          if (version === state.routeVersion) {
            renderRace(currentRoute, data, { race: {}, results: [], qualifying: [] });
            if (raceStatus(data.races.find((item) => Number(item.round) === currentRoute.round)) === "completed") {
              showToast(error.message);
            }
          }
        }
      }
    }
  } catch (error) {
    if (version === state.routeVersion) renderError(error.message);
  }
}

// Eventos globales: funcionan también después de cambiar de pantalla.
document.addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.concept) openConcept(target.dataset.concept);
  if (target.dataset.calendarFilter) {
    state.calendarFilter = target.dataset.calendarFilter;
    renderCalendar(state.seasons.get(state.season));
  }
  if (target.dataset.standingType) {
    state.standingsType = target.dataset.standingType;
    renderStandings(state.seasons.get(state.season));
  }
  if (target.dataset.summaryMode) {
    state.summaryMode = target.dataset.summaryMode;
    const currentRoute = route();
    renderRace(currentRoute, state.seasons.get(state.season), state.races.get(`${state.season}-${currentRoute.round}`));
  }
  if (target.dataset.resultTab) {
    state.resultTab = target.dataset.resultTab;
    const currentRoute = route();
    renderRace(currentRoute, state.seasons.get(state.season), state.races.get(`${state.season}-${currentRoute.round}`));
  }
  if (target.dataset.icsRound) downloadCalendar(target.dataset.icsRound);
  if (target.hasAttribute("data-scroll-results")) {
    $("#race-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (target.hasAttribute("data-retry")) {
    state.seasons.delete(state.season);
    renderRoute();
  }
  if (target.classList.contains("dialog-close")) $("#concept-dialog").close();
  if (target.closest("#mobile-nav")) {
    $("#mobile-nav").hidden = true;
    $("#menu-button").setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-season-select]")) {
    state.season = Number(event.target.value);
    state.resultTab = "race";
    renderRoute();
  }
  if (event.target.matches("[data-timezone-select]")) {
    state.timezone = event.target.value;
    localStorage.setItem("apex-timezone", state.timezone);
    renderRoute();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "standings-search") filterStandings(event.target.value);
  if (event.target.id === "learn-search") filterConcepts(event.target.value);
});

$("#menu-button").addEventListener("click", () => {
  const nav = $("#mobile-nav");
  nav.hidden = !nav.hidden;
  $("#menu-button").setAttribute("aria-expanded", String(!nav.hidden));
});

$("#concept-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

window.addEventListener("hashchange", () => {
  // Los enlaces internos de accesibilidad no representan una ruta de la SPA.
  if (location.hash === "#main-content") return;
  state.resultTab = "race";
  window.scrollTo({ top: 0, behavior: "instant" });
  renderRoute();
});

$("#footer-year").textContent = currentYear;
setInterval(updateCountdowns, 1000);
renderRoute();
