"use strict";

/* Reproductor persistente: el audio vive fuera del panel que se refresca. */
window.ApexRadioPlayer = function createRadioPlayer(options) {
  const panel = options.panel;
  const player = panel.querySelector("audio");
  const title = panel.querySelector("[data-radio-title]");
  let currentUrl = "";

  function report(error) {
    if (error?.name === "NotAllowedError") {
      title.textContent = "Pulsa ▶ para iniciar el audio";
      return;
    }
    title.textContent = "No se pudo reproducir esta radio";
    options.onError("No se pudo cargar el audio de esta radio.");
  }

  function play(url, label) {
    if (!url) return;
    title.textContent = label || "Radio de equipo";
    panel.hidden = false;
    // Llamar a play() dentro del clic conserva el permiso del navegador.
    if (url === currentUrl) {
      player.currentTime = 0;
    } else {
      currentUrl = url;
      player.src = url;
    }
    player.play().catch(report);
  }

  /* Actualiza la lista sin destruir los botones ya presentes. */
  function updateList(current, desired) {
    if (!current || !desired) return;
    const incoming = [...desired.querySelectorAll("[data-radio-key]")];
    if (!incoming.length) {
      if (!current.querySelector("[data-radio-key]")) current.innerHTML = desired.innerHTML;
      return;
    }
    current.querySelector(".empty-state")?.remove();
    const existing = new Map(
      [...current.querySelectorAll("[data-radio-key]")].map((item) => [item.dataset.radioKey, item]),
    );
    for (const item of incoming.reverse()) {
      const previous = existing.get(item.dataset.radioKey);
      if (!previous) current.prepend(item);
      else {
        const label = previous.querySelector(".message-text");
        if (label) label.textContent = item.querySelector(".message-text")?.textContent || "";
      }
    }
  }

  player.addEventListener("ended", () => { panel.hidden = true; });
  player.addEventListener("error", () => {
    if (currentUrl) {
      title.textContent = "No se pudo cargar esta radio";
      options.onError("No se pudo cargar el audio de esta radio.");
    }
  });
  panel.querySelector("[data-radio-close]").addEventListener("click", () => {
    currentUrl = "";
    player.pause();
    player.removeAttribute("src");
    player.load();
    panel.hidden = true;
  });

  return { play, updateList };
};
