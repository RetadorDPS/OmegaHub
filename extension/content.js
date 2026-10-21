/* content.js · Extensión TrendHunter Pro (MV3)
 *
 * Detecta tiendas Shopify en la página actual y
 * ofrece analizarlas en TrendHunter Pro. */
(function () {
  "use strict";

  function esShopify() {
    const generador = document.querySelector('meta[name="generator"]');
    if (generador && /shopify/i.test(generador.content || "")) return true;
    // El carrito JSON también es señal fiable.
    return Boolean(
      document.querySelector('script[src*="/cart.js"]') ||
        document.querySelector('script[src*="/cart.min.js"]'),
    );
  }

  if (!esShopify()) return;

  // Marca visual discreta en la esquina inferior izquierda.
  const etiqueta = document.createElement("div");
  etiqueta.textContent = "⚡ Shopify detectada · TrendHunter Pro";
  etiqueta.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:2147483647;" +
    "background:#1e1b4b;color:#fff;padding:8px 12px;border-radius:8px;" +
    "font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);";
  document.body.appendChild(etiqueta);
  setTimeout(function () {
    etiqueta.style.transition = "opacity .4s";
    etiqueta.style.opacity = "0.35";
  }, 4000);
})();
