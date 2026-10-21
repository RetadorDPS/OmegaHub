/* ==========================================================================
   TrendHunter Pro · Service worker (PWA)
   --------------------------------------------------------------------------
   · Instalación: precarga la pantalla sin conexión y los iconos.
   · Navegación: RED PRIMERO. Si no hay red, caché y, si tampoco, /offline.
   · Estáticos (_next/static, imágenes, fuentes): caché primero (inmutables).
   · API: nunca se cachea; si falla, se devuelve un error JSON explícito.
   · Push: muestra la notificación del sistema y abre la ficha al tocarla.
   · Al activarse una versión nueva se borran las cachés antiguas.

   La versión vive en CACHE_VERSION: al publicar cambios hay que subirla
   (src/lib/pwa.ts → VERSION_PWA) para invalidar la caché anterior.
   ========================================================================== */

const CACHE_VERSION = "thp-v1";
const CACHE_ESTATICOS = `${CACHE_VERSION}-estaticos`;
const CACHE_PAGINAS = `${CACHE_VERSION}-paginas`;
const CACHE_IMAGENES = `${CACHE_VERSION}-imagenes`;
const CACHES_ACTUALES = [CACHE_ESTATICOS, CACHE_PAGINAS, CACHE_IMAGENES];

const OFFLINE = "/offline";
const PRECARGA = [
  OFFLINE,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

/** Alcance del service worker (sirve igual en raíz que bajo basePath). */
const ALCANCE = self.registration.scope;

/** Ruta absoluta dentro del alcance de la app. */
function dentroDeLaApp(ruta) {
  return new URL(ruta, ALCANCE).toString();
}

// ---------------------------------------------------------------------------
//  Ciclo de vida
// ---------------------------------------------------------------------------
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      // Si algún recurso falla, no se rompe la instalación.
      await Promise.allSettled(PRECARGA.map((ruta) => cache.add(new Request(dentroDeLaApp(ruta), { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((nombre) => !CACHES_ACTUALES.includes(nombre)).map((nombre) => caches.delete(nombre)));
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
//  Estrategias de red
// ---------------------------------------------------------------------------

/** Red primero; caché como respaldo; /offline si no hay nada. */
async function redPrimero(peticion) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok && respuesta.type === "basic") {
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch {
    const enCache = await cache.match(peticion, { ignoreSearch: true });
    if (enCache) return enCache;
    const offline = await caches.match(dentroDeLaApp(OFFLINE));
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Sin conexión</title><body style='font-family:system-ui;background:#0b1020;color:#e2e8f0;padding:2rem'><h1>Sin conexión</h1><p>Vuelve a conectarte para ver datos actualizados.</p></body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

/** Caché primero (recursos inmutables); si falta, red y se guarda. */
async function cachePrimero(peticion, nombreCache) {
  const cache = await caches.open(nombreCache);
  const enCache = await cache.match(peticion);
  if (enCache) return enCache;
  const respuesta = await fetch(peticion);
  if (respuesta && respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const esApi = url.pathname.includes("/api/") || url.pathname.includes("/_next/data/");
  if (esApi) {
    // Los datos siempre frescos: sin red, error claro en lugar de cifras viejas.
    return;
  }

  const esNavegacion = request.mode === "navigate";
  const esEstatico =
    url.pathname.includes("/_next/static/") ||
    url.pathname.includes("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".js");

  if (esNavegacion) {
    evento.respondWith(redPrimero(request));
    return;
  }
  if (esEstatico) {
    evento.respondWith(cachePrimero(request, CACHE_ESTATICOS));
    return;
  }
  if (request.destination === "image") {
    evento.respondWith(cachePrimero(request, CACHE_IMAGENES));
  }
});

// ---------------------------------------------------------------------------
//  Push y notificaciones
// ---------------------------------------------------------------------------
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { titulo: "TrendHunter Pro", cuerpo: evento.data ? evento.data.text() : "" };
  }

  const titulo = datos.titulo || "TrendHunter Pro";
  const opciones = {
    body: datos.cuerpo || "",
    icon: dentroDeLaApp("/icons/icon-192.png"),
    badge: dentroDeLaApp("/icons/favicon-64.png"),
    // `tag` agrupa avisos del mismo elemento (no se apilan sin fin).
    tag: datos.etiqueta || "thp-aviso",
    renotify: true,
    data: { url: datos.url || "/dashboard" },
    vibrate: [80, 40, 80],
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = dentroDeLaApp(evento.notification.data?.url || "/dashboard");

  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          ventana.navigate(destino);
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});

// ---------------------------------------------------------------------------
//  Mensajes desde la página (por ejemplo, forzar actualización)
// ---------------------------------------------------------------------------
self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "SALTAR_ESPERA") {
    self.skipWaiting();
  }
});
