"use strict";

/* Vista del mapa, aislada del resto del panel para no copiar Position.z. */
window.ApexTrackMap = function createTrackMapView(options) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  let track = null;
  let focusId = null;
  let loading = false;
  let lastLoad = 0;
  let drawnRevision = null;
  let drawnFocus = null;
  let svg = null;
  let outlineShadow = null;
  let outlinePath = null;
  let carsGroup = null;
  const carNodes = new Map();
  const h = options.escape;

  function contrastingText(color) {
    const [red, green, blue] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
    return red * .299 + green * .587 + blue * .114 > 145 ? "#101510" : "#f0f2eb";
  }

  function element(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function carList() {
    return track?.cars?.length ? track.cars : (options.drivers() || []).map((driver) => ({
      id: driver.id, code: driver.code, name: driver.name, colour: driver.colour,
      position: driver.position, gap: driver.gap, status: null,
    }));
  }

  /* Actualiza la lista sin destruir los botones: así un clic nunca se pierde. */
  function updateList() {
    const list = document.querySelector("#map-driver-list");
    if (!list) return;
    const cars = carList();
    if (!cars.length) {
      if (!list.querySelector(".map-list-empty")) {
        list.innerHTML = '<div class="map-list-empty">Los pilotos aparecerán cuando llegue la clasificación.</div>';
      }
      return;
    }
    list.querySelector(".map-list-empty")?.remove();
    const existing = new Map([...list.querySelectorAll("[data-map-focus]")].map((button) => [button.dataset.mapFocus, button]));
    const buttons = [];
    for (const car of cars) {
      const id = String(car.id);
      let button = existing.get(id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.mapFocus = id;
        button.innerHTML = '<span class="map-driver-position"></span><span class="map-driver-stripe"></span><span class="map-driver-name"><strong></strong><small></small></span><span class="map-driver-gap"></span>';
        existing.set(id, button);
      }
      const selected = focusId === id;
      button.className = `map-driver-item${selected ? " selected" : ""}`;
      button.setAttribute("aria-pressed", String(selected));
      button.querySelector(".map-driver-position").textContent = car.position;
      button.querySelector(".map-driver-stripe").style.setProperty("--team", options.colour(car.colour));
      button.querySelector(".map-driver-name strong").textContent = car.code;
      button.querySelector(".map-driver-name small").textContent = car.name;
      button.querySelector(".map-driver-gap").textContent = car.status && car.status !== "OnTrack" ? car.status : car.gap || "—";
      buttons.push(button);
    }
    const current = [...list.querySelectorAll("[data-map-focus]")];
    if (current.length !== buttons.length || current.some((button, index) => button !== buttons[index])) {
      for (const button of buttons) list.appendChild(button);
    }
    for (const [id, button] of existing) {
      if (!cars.some((car) => String(car.id) === id)) button.remove();
    }
  }

  function ensureSvg(stage) {
    if (svg && stage.contains(svg)) return;
    stage.innerHTML = "";
    stage.dataset.state = "map";
    svg = element("svg", { class: "track-map-svg", role: "img" });
    outlineShadow = element("path", { class: "track-outline-shadow" });
    outlinePath = element("path", { class: "track-outline" });
    carsGroup = element("g", { class: "track-cars" });
    svg.append(outlineShadow, outlinePath, carsGroup);
    stage.appendChild(svg);
    carNodes.clear();
  }

  function carNode(car) {
    let node = carNodes.get(car.id);
    if (node) return node;
    node = element("g", { class: "track-car", "data-driver": car.id, tabindex: "0", role: "button" });
    const title = element("title");
    node.append(
      title,
      element("circle", { class: "car-hit-area", r: "26" }),
      element("circle", { class: "car-focus-ring", r: "19" }),
      element("circle", { class: "car-dot", r: "12" }),
      element("text", { class: "car-code", "text-anchor": "middle", y: "3.5" }),
      element("text", { class: "car-selected-label" }),
    );
    carsGroup.appendChild(node);
    carNodes.set(car.id, node);
    return node;
  }

  function draw() {
    const stage = document.querySelector("#track-stage");
    if (!stage) return;
    updateList();
    if (!track?.available) {
      drawnRevision = null;
      drawnFocus = null;
      const receiving = options.hasPositionFeed();
      const connected = options.connected();
      const key = receiving ? "receiving" : connected ? "connected" : "waiting";
      if (stage.dataset.state !== key) {
        stage.dataset.state = key;
        const title = receiving ? "Dibujando el circuito" : connected ? "Sin posiciones disponibles" : "Esperando posiciones";
        const message = receiving
          ? "Ya están llegando coordenadas. APEX unirá las trayectorias y completará el trazado a medida que los coches recorran el circuito."
          : connected
            ? "La conexión anónima y gratuita no está recibiendo Position.z. F1 reserva las posiciones y la telemetría de coche para cuentas con suscripción, así que APEX no dibuja un mapa inventado."
            : "Cuando la fuente proporcione coordenadas, APEX generará el trazado automáticamente. No necesitas configurar el circuito.";
        stage.innerHTML = `<div class="map-placeholder"><span class="map-placeholder-symbol">⌁</span><h3>${title}</h3><p>${message}</p></div>`;
      }
      const meta = document.querySelector("#map-updated");
      if (meta) meta.textContent = receiving ? "CONSTRUYENDO TRAZADO" : "POSITION.Z SIN DATOS";
      return;
    }
    if (track.revision === drawnRevision && focusId === drawnFocus) return;
    drawnRevision = track.revision;
    drawnFocus = focusId;

    const points = track.outline.filter((point) => point.length === 2 && point.every(Number.isFinite));
    if (points.length < 2) return;
    ensureSvg(stage);
    svg.setAttribute("viewBox", `0 0 ${track.viewBox[0]} ${track.viewBox[1]}`);
    svg.setAttribute("aria-label", `Mapa dinámico de ${options.sessionName()}`);
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ") + (track.closed ? " Z" : "");
    outlineShadow.setAttribute("d", path);
    outlinePath.setAttribute("d", path);

    const visible = new Set();
    for (const car of track.cars) {
      if (!car.point?.length || !car.point.every(Number.isFinite)) continue;
      visible.add(car.id);
      const [x, y] = car.point;
      const node = carNode(car);
      const selected = car.id === focusId;
      const offTrack = car.status && car.status !== "OnTrack" && car.status !== "0";
      node.setAttribute("class", `track-car${selected ? " selected" : ""}${offTrack ? " off-track" : ""}`);
      node.setAttribute("aria-label", `Ver telemetría de ${car.name}`);
      node.querySelector("title").textContent = `${car.position} · ${car.name}`;
      for (const circle of node.querySelectorAll("circle")) {
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
      }
      const code = node.querySelector(".car-code");
      code.setAttribute("x", x);
      code.setAttribute("y", y + 3.5);
      code.setAttribute("fill", contrastingText(options.colour(car.colour)));
      code.textContent = car.code;
      const label = node.querySelector(".car-selected-label");
      label.setAttribute("x", x + 20);
      label.setAttribute("y", y - 18);
      label.textContent = selected ? `${car.position} · ${car.code}` : "";
    }
    for (const [id, node] of carNodes) {
      if (!visible.has(id)) {
        node.remove();
        carNodes.delete(id);
      }
    }
    const meta = document.querySelector("#map-updated");
    if (meta) meta.textContent = `${visible.size} COCHES · ${options.time(track.receivedAt)}`;
  }

  async function load() {
    if (!options.hasPositionFeed() || loading || Date.now() - lastLoad < 250) return;
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
      svg = null;
      drawnRevision = null;
      drawnFocus = null;
      carNodes.clear();
    } else {
      document.querySelector(".map-session-header").innerHTML = options.header();
    }
    if (!options.hasPositionFeed()) track = null;
    draw();
    load();
  }

  function focus(id) {
    focusId = focusId === id ? null : id;
    draw();
  }

  return { render, focus };
};
