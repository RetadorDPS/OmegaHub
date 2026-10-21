/* popup.js · Extensión TrendHunter Pro (MV3) */
(function () {
  "use strict";

  const CAMBIO_APP = "appUrl";
  const entradaUrl = document.getElementById("url");
  const entradaApp = document.getElementById("appUrl");
  const aviso = document.getElementById("aviso");
  const catalogo = document.getElementById("catalogo");
  const estado = document.getElementById("estado");

  // La pestaña actual se copia al portapapeles de la extensión.
  chrome.tabs.query({ active: true, currentWindow: true }, function (pestañas) {
    const pestaña = pestañas[0];
    if (pestaña && pestaña.url) entradaUrl.value = pestaña.url;
    actualizarCatalogo();
  });

  // URL de la app: configurable, recordada.
  chrome.storage.local.get(CAMBIO_APP, function (guardado) {
    if (guardado[CAMBIO_APP]) {
      entradaApp.value = guardado[CAMBIO_APP];
      aviso.hidden = true;
    } else {
      aviso.hidden = false;
    }
  });
  entradaApp.addEventListener("change", function () {
    chrome.storage.local.set({ [CAMBIO_APP]: entradaApp.value.trim() });
    actualizarCatalogo();
  });

  function appUrl() {
    return (entradaApp.value || "").trim().replace(/\/$/, "");
  }

  function actualizarCatalogo() {
    catalogo.disabled = !appUrl();
  }

  entradaApp.addEventListener("input", actualizarCatalogo);

  // Analizar: deep link al Shop Analyzer con la URL.
  catalogo.addEventListener("click", function () {
    const destino = appUrl();
    const tienda = entradaUrl.value.trim();
    if (!destino || !tienda) return;
    const enlace = destino + "/dashboard/shop-analyzer?url=" + encodeURIComponent(tienda);
    chrome.tabs.create({ url: enlace });
  });
})();
