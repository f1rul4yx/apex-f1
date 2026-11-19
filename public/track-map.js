"use strict";

/* Vista del mapa, aislada del resto del panel para no copiar Position.z. */
window.ApexTrackMap = function createTrackMapView(options) {
  let track = null;
  let focusId = null;
  let loading = false;
  let lastLoad = 0;
  const h = options.escape;

  function contrastingText(color) {
    const [red, green, blue] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
    return red * .299 + green * .587 + blue * .114 > 145 ? "#101510" : "#f0f2eb";
  }

  function listMarkup() {
    const cars = track?.cars?.length ? track.cars : (options.drivers() || []).map((driver) => ({
      id: driver.id, code: driver.code, name: driver.name, colour: driver.colour,
      position: driver.position, gap: driver.gap, status: null,
    }));
    if (!cars.length) return '<div class="map-list-empty">Los pilotos aparecerán cuando llegue la clasificación.</div>';
    return cars.map((car) => `<button class="map-driver-item ${focusId === car.id ? "selected" : ""}" data-map-focus="${h(car.id)}" type="button" aria-pressed="${focusId === car.id}"><span class="map-driver-position">${h(car.position)}</span><span class="map-driver-stripe" style="--team:${options.colour(car.colour)}"></span><span class="map-driver-name"><strong>${h(car.code)}</strong><small>${h(car.name)}</small></span><span class="map-driver-gap">${h(car.status && car.status !== "OnTrack" ? car.status : car.gap || "—")}</span></button>`).join("");
  }

  function draw() {
    const list = document.querySelector("#map-driver-list");
    if (list) list.innerHTML = listMarkup();
    const stage = document.querySelector("#track-stage");
    if (!stage) return;
    if (!track?.available) {
      stage.innerHTML = `<div class="map-placeholder"><span class="map-placeholder-symbol">⌁</span><h3>El circuito se dibuja solo</h3><p>En cuanto lleguen coordenadas de los coches, APEX unirá sus trayectorias. El trazado puede tardar una vuelta en completarse y depende de que la sesión envíe posiciones.</p></div>`;
      const meta = document.querySelector("#map-updated");
      if (meta) meta.textContent = "ESPERANDO POSITION.Z";
      return;
    }
    const points = track.outline.filter((point) => point.length === 2 && point.every(Number.isFinite));
    if (points.length < 2) return;
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ") + (track.closed ? " Z" : "");
    const cars = track.cars.filter((car) => car.point?.length === 2 && car.point.every(Number.isFinite));
    const dots = cars.map((car) => {
      const [x, y] = car.point;
      const selected = car.id === focusId;
      const offTrack = car.status && car.status !== "OnTrack" && car.status !== "0";
      return `<g class="track-car ${selected ? "selected" : ""} ${offTrack ? "off-track" : ""}" data-driver="${h(car.id)}" tabindex="0" role="button" aria-label="Ver telemetría de ${h(car.name)}"><title>${h(car.position)} · ${h(car.name)}</title><circle class="car-hit-area" cx="${x}" cy="${y}" r="26"/><circle class="car-focus-ring" cx="${x}" cy="${y}" r="19"/><circle class="car-dot" cx="${x}" cy="${y}" r="12" fill="${options.colour(car.colour)}"/><text class="car-code" x="${x}" y="${y + 3.5}" text-anchor="middle" fill="${contrastingText(options.colour(car.colour))}">${h(car.code)}</text>${selected ? `<text class="car-selected-label" x="${x + 20}" y="${y - 18}">${h(car.position)} · ${h(car.code)}</text>` : ""}</g>`;
    }).join("");
    stage.innerHTML = `<svg class="track-map-svg" viewBox="0 0 ${track.viewBox[0]} ${track.viewBox[1]}" role="img" aria-label="Mapa dinámico de ${h(options.sessionName())}"><path class="track-outline-shadow" d="${path}"/><path class="track-outline" d="${path}"/>${dots}</svg>`;
    const meta = document.querySelector("#map-updated");
    if (meta) meta.textContent = `${cars.length} COCHES · ${options.time(track.receivedAt)}`;
  }

  async function load() {
    if (loading || Date.now() - lastLoad < 1100) return;
    loading = true;
    lastLoad = Date.now();
    try {
      track = await options.api("/api/live/track");
      draw();
    } catch (error) {
      if (!track) {
        const stage = document.querySelector("#track-stage");
        if (stage) stage.innerHTML = `<div class="map-placeholder"><h3>Mapa no disponible</h3><p>${h(error.message)}</p></div>`;
      }
    } finally {
      loading = false;
    }
  }

  function render() {
    const current = document.querySelector("#track-view");
    if (!current) {
      options.mount.innerHTML = `<div class="app-shell" id="track-view"><div class="map-session-header">${options.header()}</div><p class="eyebrow muted">MAPA DINÁMICO · GENERADO CON LAS TRAYECTORIAS</p><div class="map-layout"><section class="panel map-panel"><div class="panel-heading"><div><p class="card-label">POSITION.Z · COORDENADAS POR PILOTO</p><h2 class="panel-title">El circuito, en vivo</h2></div><span class="panel-meta" id="map-updated">ESPERANDO COORDENADAS</span></div><div class="track-stage" id="track-stage"></div><div class="map-legend"><span><i class="legend-dot"></i> Cada coche, con el color de su equipo</span><span>Pulsa un coche para abrir su ficha</span></div></section><aside class="panel map-drivers-panel"><div class="panel-heading"><div><p class="card-label">ENFOCAR PILOTO</p><h2 class="panel-title">En pista</h2></div><span class="panel-meta">POS.</span></div><div class="map-driver-list" id="map-driver-list"></div><div class="map-source-note">El trazado se genera a partir de los datos recibidos; no es un mapa geográfico ni garantiza una orientación norte-sur. Puede ser incompleto al principio de una sesión.</div></aside></div></div>`;
    } else {
      document.querySelector(".map-session-header").innerHTML = options.header();
    }
    draw();
    load();
  }

  function focus(id) {
    focusId = focusId === id ? null : id;
    draw();
  }

  return { render, focus };
};
