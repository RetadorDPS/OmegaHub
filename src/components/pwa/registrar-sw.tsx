"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (`/sw.js`) que da soporte a la PWA:
 * instalación, caché del armazón y notificaciones push.
 *
 * No pinta nada. En el sitio estático de GitHub Pages, `NEXT_PUBLIC_BASE_PATH`
 * sitúa el service worker y su alcance bajo `/OmegaHub/`.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelado = false;
    const registrar = async () => {
      try {
        const registro = await navigator.serviceWorker.register(`${BASE}/sw.js`, {
          scope: `${BASE}/`,
          updateViaCache: "none",
        });
        if (cancelado) return;

        // Un service worker nuevo espera: se activa en la siguiente carga.
        registro.addEventListener("updatefound", () => {
          const nuevo = registro.installing;
          if (!nuevo) return;
          nuevo.addEventListener("statechange", () => {
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
              nuevo.postMessage({ tipo: "SALTAR_ESPERA" });
            }
          });
        });
      } catch {
        // Sin service worker la app funciona igual: solo se pierden PWA y push.
      }
    };

    if (document.readyState === "complete") void registrar();
    else window.addEventListener("load", registrar, { once: true });

    return () => {
      cancelado = true;
      window.removeEventListener("load", registrar);
    };
  }, []);

  return null;
}
