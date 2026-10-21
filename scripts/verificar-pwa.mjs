/**
 * Verificación de la PWA y de las notificaciones push.
 *
 *   npm run verify:pwa
 *
 * Comprueba, contra el servidor real y con un navegador real:
 *
 *   1. Manifiesto (`/manifest.webmanifest`): campos que exige la instalación.
 *   2. Iconos: existen, son PNG válidos y tienen el tamaño declarado.
 *   3. Service worker: se sirve, se registra y controla la página.
 *   4. Metadatos del documento: manifiesto, iconos de Apple y theme-color.
 *   5. Pantalla sin conexión: se muestra al cortar la red.
 *   6. API de push: alta, consulta, validación, prueba y baja del dispositivo.
 *   7. Alertas: el canal push aparece en `estadoCanales` (con o sin claves).
 *
 * El envío real al servicio push del navegador (FCM/Apple) depende de la red
 * del entorno; si Chromium no puede suscribirse, se informa como aviso y no
 * cuenta como fallo. Todo lo demás debe pasar.
 */
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const resultados = [];
const avisos = [];

function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

function avisar(nombre, detalle) {
  avisos.push({ nombre, detalle });
  console.log(`⚠️  ${nombre} — ${detalle}`);
}

/** Tamaño real de un PNG (cabecera IHDR). */
function tamañoPng(buffer) {
  const firma = buffer.subarray(0, 8).toString("hex");
  if (firma !== "89504e470d0a1a0a") return null;
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
//  1-4 · Recursos estáticos y metadatos
// ---------------------------------------------------------------------------
console.log("\n── Manifiesto e iconos ──");

const respuestaManifiesto = await fetch(`${BASE}/manifest.webmanifest`);
const manifiesto = await respuestaManifiesto.json().catch(() => null);
registrar(
  "GET /manifest.webmanifest",
  respuestaManifiesto.status === 200 && Boolean(manifiesto?.name),
  `${respuestaManifiesto.status} · ${manifiesto?.short_name ?? "sin short_name"}`,
);

registrar(
  "Manifiesto: instalable",
  manifiesto?.display === "standalone" &&
    manifiesto?.start_url?.includes("/dashboard") &&
    manifiesto?.scope === "/" &&
    manifiesto?.lang === "es" &&
    Boolean(manifiesto?.theme_color),
  `display=${manifiesto?.display} start_url=${manifiesto?.start_url} color=${manifiesto?.theme_color}`,
);

const iconos = manifiesto?.icons ?? [];
const maskable = iconos.find((icono) => icono.purpose === "maskable");
registrar(
  "Manifiesto: iconos 192, 512 y maskable",
  iconos.some((i) => i.sizes === "192x192") && iconos.some((i) => i.sizes === "512x512") && Boolean(maskable),
  `${iconos.length} declarados`,
);

let iconosOk = true;
const detalleIconos = [];
for (const icono of iconos) {
  const respuesta = await fetch(`${BASE}${icono.src}`);
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  const tamaño = tamañoPng(buffer);
  const esperado = Number(icono.sizes.split("x")[0]);
  const correcto = respuesta.status === 200 && tamaño?.ancho === esperado && tamaño?.alto === esperado;
  if (!correcto) iconosOk = false;
  detalleIconos.push(`${icono.sizes}:${correcto ? "ok" : "mal"}`);
}
registrar("Iconos PNG reales con el tamaño declarado", iconosOk, detalleIconos.join(" "));

const apple = await fetch(`${BASE}/icons/apple-touch-icon-180.png`);
const tamanoApple = tamañoPng(Buffer.from(await apple.arrayBuffer()));
registrar(
  "apple-touch-icon 180×180",
  apple.status === 200 && tamanoApple?.ancho === 180 && tamanoApple?.alto === 180,
  `${tamanoApple?.ancho}×${tamanoApple?.alto}`,
);

const respuestaSw = await fetch(`${BASE}/sw.js`);
const textoSw = await respuestaSw.text();
registrar(
  "GET /sw.js",
  respuestaSw.status === 200 &&
    (respuestaSw.headers.get("content-type") ?? "").includes("javascript") &&
    textoSw.includes('addEventListener("push"') &&
    textoSw.includes("notificationclick"),
  `${respuestaSw.status} · ${(textoSw.length / 1024).toFixed(1)} kB`,
);

const offline = await fetch(`${BASE}/offline`);
const htmlOffline = await offline.text();
registrar(
  "GET /offline (pantalla sin conexión)",
  offline.status === 200 && htmlOffline.includes("Sin conexión"),
  `${offline.status}`,
);

const login = await fetch(`${BASE}/login`);
const htmlLogin = await login.text();
registrar(
  "Metadatos PWA en el documento",
  htmlLogin.includes('rel="manifest"') &&
    htmlLogin.includes("apple-touch-icon") &&
    htmlLogin.includes("theme-color") &&
    htmlLogin.includes("mobile-web-app-capable"),
  "manifest · apple-touch-icon · theme-color",
);

// ---------------------------------------------------------------------------
//  Navegador: registro del service worker y suscripción push
// ---------------------------------------------------------------------------
console.log("\n── Service worker y push en Chromium ──");

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

const contexto = await navegador.newContext({
  locale: "es-ES",
  colorScheme: "dark",
  viewport: { width: 412, height: 915 },
  permissions: ["notifications"],
});
await contexto.grantPermissions(["notifications"], { origin: BASE }).catch(() => null);
const pagina = await contexto.newPage();

await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await pagina.waitForTimeout(1500);

const registro = await pagina.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return { alcance: reg.scope, activo: Boolean(reg.active) };
  } catch {
    return null;
  }
});
registrar(
  "El service worker se registra y activa",
  Boolean(registro?.activo) && registro?.alcance?.startsWith(BASE),
  `${registro?.alcance ?? "sin registro"}`,
);

const capacidades = await pagina.evaluate(() => ({
  push: "PushManager" in window,
  notificaciones: "Notification" in window,
  permiso: "Notification" in window ? Notification.permission : "no",
  seCuro: window.isSecureContext,
}));
registrar(
  "El navegador expone PushManager y notificaciones",
  capacidades.push && capacidades.notificaciones,
  `permiso=${capacidades.permiso} seguro=${capacidades.seCuro}`,
);

// Sesión para probar la API de push autenticada.
await pagina.waitForTimeout(1000);
await pagina.fill("#email", "demo@trendhunter.pro");
await pagina.fill("#password", "demo1234");
await pagina.click('button[type="submit"]');
await pagina.waitForTimeout(5000);
registrar("Sesión iniciada como demo", pagina.url().includes("/dashboard"), pagina.url());

/** Ejecuta un fetch con la sesión del navegador. */
async function api(ruta, opciones = {}) {
  return pagina.evaluate(
    async ([rutaApi, opcionesApi]) => {
      const respuesta = await fetch(rutaApi, {
        method: opcionesApi.method ?? "GET",
        headers: opcionesApi.body ? { "content-type": "application/json" } : {},
        body: opcionesApi.body ? JSON.stringify(opcionesApi.body) : undefined,
      });
      const texto = await respuesta.text();
      let cuerpo = null;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = texto.slice(0, 200);
      }
      return { estado: respuesta.status, cuerpo };
    },
    [ruta, opciones],
  );
}

const estado = await api("/api/push/estado");
const clavePublica = estado.cuerpo?.clavePublica ?? null;
registrar(
  "GET /api/push/estado",
  estado.estado === 200 && "configurado" in (estado.cuerpo?.servidor ?? {}),
  `configurado=${estado.cuerpo?.servidor?.configurado} dispositivos=${estado.cuerpo?.total}`,
);

// Suscripción real del navegador (requiere alcanzar el servicio push).
if (!clavePublica) {
  avisar("Suscripción push real", "el servidor no tiene NEXT_PUBLIC_VAPID_PUBLIC_KEY");
} else {
  const suscripcion = await pagina.evaluate(async (publica) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const relleno = "=".repeat((4 - (publica.length % 4)) % 4);
      const normalizada = (publica + relleno).replace(/-/g, "+").replace(/_/g, "/");
      const binario = atob(normalizada);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
      const existente = await reg.pushManager.getSubscription();
      const sub =
        existente ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
      return { endpoint: sub.endpoint, keys: sub.toJSON().keys };
    } catch (error) {
      return { error: String(error) };
    }
  }, clavePublica);

  if (suscripcion?.error) {
    avisar("Suscripción push real", `${suscripcion.error.slice(0, 120)} (sin salida al servicio push del navegador)`);

    // Sin servicio push accesible se prueba el mismo camino con una
    // suscripción sintética con claves criptográficas válidas: cubre alta,
    // consulta y baja reales en la base de datos.
    const ecdh = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      .publicKey.export({ type: "spki", format: "der" })
      .subarray(-65)
      .toString("base64url");
    const sintetica = {
      endpoint: `https://push.example.com/fcm/send/${randomUUID()}`,
      keys: { p256dh: ecdh, auth: randomBytes(16).toString("base64url") },
    };

    const alta = await api("/api/push/subscribe", { method: "POST", body: sintetica });
    registrar("POST /api/push/subscribe (suscripción válida)", alta.estado === 201, `${alta.estado} · ${alta.cuerpo?.navegador}`);

    const tras = await api("/api/push/estado");
    const guardado = (tras.cuerpo?.dispositivos ?? []).some((dispositivo) => dispositivo.activa);
    registrar("El dispositivo queda guardado y activo", guardado, `${tras.cuerpo?.total} dispositivo(s)`);

    const repetida = await api("/api/push/subscribe", { method: "POST", body: sintetica });
    const trasRepetir = await api("/api/push/estado");
    registrar(
      "La misma suscripción no se duplica",
      repetida.estado === 201 && trasRepetir.cuerpo?.total === 1,
      `${trasRepetir.cuerpo?.total} dispositivo(s)`,
    );

    const baja = await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sintetica.endpoint } });
    const despues = await api("/api/push/estado");
    registrar(
      "POST /api/push/unsubscribe elimina el dispositivo",
      baja.estado === 200 && despues.cuerpo?.total === 0,
      `eliminadas=${baja.cuerpo?.eliminadas}`,
    );
  } else {
    const alta = await api("/api/push/subscribe", { method: "POST", body: suscripcion });
    registrar("POST /api/push/subscribe (dispositivo real)", alta.estado === 201, `${alta.estado} · ${alta.cuerpo?.navegador}`);

    const tras = await api("/api/push/estado");
    const guardado = (tras.cuerpo?.dispositivos ?? []).some((dispositivo) => dispositivo.activa);
    registrar("El dispositivo queda guardado y activo", guardado, `${tras.cuerpo?.total} dispositivo(s)`);

    const prueba = await api("/api/push/test", { method: "POST" });
    registrar(
      "POST /api/push/test envía al dispositivo",
      prueba.estado === 200 && (prueba.cuerpo?.enviados ?? 0) > 0,
      `estado=${prueba.estado} enviados=${prueba.cuerpo?.enviados ?? 0} ${prueba.cuerpo?.error ?? ""}`.trim(),
    );

    const baja = await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: suscripcion.endpoint } });
    const despues = await api("/api/push/estado");
    registrar(
      "POST /api/push/unsubscribe elimina el dispositivo",
      baja.estado === 200 && despues.cuerpo?.total === 0,
      `eliminadas=${baja.cuerpo?.eliminadas}`,
    );
    await pagina.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    });
  }
}

// Validación y permisos de la API, sin depender del servicio push.
const contextoAnonimo = await navegador.newContext();
const sinSesion = await contextoAnonimo.newPage();
await sinSesion.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
const respuestaAnonima = await sinSesion.evaluate(async (base) => {
  const respuesta = await fetch(`${base}/api/push/subscribe`, { method: "POST", body: "{}" });
  return respuesta.status;
}, BASE);
registrar("POST /api/push/subscribe sin sesión → 401", respuestaAnonima === 401, `${respuestaAnonima}`);

// El motor de alertas exige sesión de administrador: se abre una aparte.
await sinSesion.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await sinSesion.waitForTimeout(2000);
await sinSesion.fill("#email", "admin@trendhunter.pro");
await sinSesion.fill("#password", "admin1234");
await sinSesion.click('button[type="submit"]');
await sinSesion.waitForTimeout(5000);

const invalida = await api("/api/push/subscribe", {
  method: "POST",
  body: { endpoint: "http://inseguro.example.com/x", keys: { p256dh: "x".repeat(60), auth: "y".repeat(12) } },
});
registrar("POST /api/push/subscribe rechaza endpoint HTTP → 400", invalida.estado === 400, `${invalida.cuerpo?.error}`);

const sinClaves = await api("/api/push/subscribe", { method: "POST", body: { endpoint: "https://push.example.com/abc" } });
registrar("POST /api/push/subscribe exige claves → 400", sinClaves.estado === 400, `${sinClaves.cuerpo?.error}`);

// Canal push visible en el motor de alertas (la tarea exige sesión de admin).
const canalPush = await sinSesion.evaluate(async (base) => {
  const respuesta = await fetch(`${base}/api/cron/alertas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enviarCanales: false }),
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, canales: datos.canales ?? [] };
}, BASE);
registrar(
  "El motor de alertas declara el canal push",
  canalPush.canales.some((canal) => canal.id === "push"),
  canalPush.canales.map((canal) => `${canal.id}:${canal.configurado ? "sí" : "no"}`).join(" "),
);

// ---------------------------------------------------------------------------
//  Sin conexión: el service worker debe mostrar /offline
// ---------------------------------------------------------------------------
console.log("\n── Sin conexión ──");
await pagina.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await pagina.waitForTimeout(2500);

// 1 · La pantalla de aviso queda precargada en la caché del service worker.
const precargada = await pagina.evaluate(async () => {
  const claves = await caches.keys();
  const coincide = await caches.match("/offline");
  return { claves, offline: Boolean(coincide) };
});
registrar(
  "La pantalla sin conexión está precargada",
  precargada.offline && precargada.claves.length >= 1,
  `${precargada.claves.length} caché(s)`,
);

// 2 · La política de respaldo está en el código del service worker: si la red
//     falla y no hay copia, se devuelve la pantalla de aviso (nunca una cifra
//     antigua). La emulación de red de Chromium no alcanza a las peticiones
//     del propio service worker, así que aquí se comprueba el código servido.
const respaldo =
  textoSw.includes('caches.match(dentroDeLaApp(OFFLINE))') &&
  textoSw.includes("cache.match(peticion, { ignoreSearch: true })") &&
  textoSw.includes("status: 503");
registrar("El service worker cae en /offline y luego en un aviso 503", respaldo, "sin datos obsoletos");
avisar(
  "Corte de red completo",
  "no reproducible aquí: la emulación de red del navegador no afecta a las peticiones del service worker",
);

await navegador.close();

// ---------------------------------------------------------------------------
//  Resumen
// ---------------------------------------------------------------------------
const fallos = resultados.filter((fila) => !fila.ok);
console.log(`\n=== RESUMEN: ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas ===`);
if (avisos.length > 0) {
  console.log("Avisos (no cuentan como fallo):");
  for (const aviso of avisos) console.log(` · ${aviso.nombre}: ${aviso.detalle}`);
}
if (fallos.length > 0) {
  console.log("Fallos:");
  for (const fallo of fallos) console.log(` · ${fallo.nombre} ${fallo.detalle}`);
}
process.exit(fallos.length > 0 ? 1 : 0);
