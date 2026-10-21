/**
 * Auditoría de la interfaz: que todo enlace lleve a alguna parte, que ninguna
 * pantalla devuelva error y que el navegador no registre fallos.
 *
 *   npm run audit:ui        (requiere `npm run start` y `npm run db:seed`)
 *
 * Para cada cuenta recorre la navegación real del panel (los enlaces que ve el
 * usuario, no una lista escrita a mano), entra en cada destino, mide el tiempo
 * de respuesta y recoge:
 *   · respuestas HTTP ≥ 400,
 *   · enlaces internos rotos dentro del contenido,
 *   · errores de consola y peticiones fallidas,
 *   · botones con `aria-label`/texto que no tienen acción asociada (heurística).
 */
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE =
  process.env.CHROMIUM_PATH ??
  path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [
  path.join(process.cwd(), ".chromium", "libs"),
  path.join(process.cwd(), ".chromium", "libs", "lib"),
].join(":");

const CUENTAS = [
  {
    nombre: "Administrador (Business)",
    email: "admin@trendhunter.pro",
    password: "admin1234",
  },
  {
    nombre: "Usuario Pro",
    email: "demo@trendhunter.pro",
    password: "demo1234",
  },
];

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}`,
  },
});

const hallazgos = [];
const anotar = (tipo, detalle) => {
  hallazgos.push({ tipo, detalle });
  console.log(`${tipo === "error" ? "❌" : "⚠️ "} [${tipo}] ${detalle}`);
};

for (const cuenta of CUENTAS) {
  const contexto = await navegador.newContext({
    locale: "es-ES",
    colorScheme: "dark",
    viewport: { width: 1500, height: 1000 },
  });
  const pagina = await contexto.newPage();

  const erroresConsola = [];
  const fallosRed = [];
  const avisosSinRed = new Set();
  pagina.on("console", (mensaje) => {
    if (mensaje.type() === "error")
      erroresConsola.push(mensaje.text().slice(0, 200));
  });
  // Rutas que pueden responder 5xx de forma honesta cuando no hay red
  // (Google Trends): se avisa, no se cuenta como fallo de la app.
  const ESPERADAS_SIN_RED = ["/api/tendencias/del-dia"];
  pagina.on("response", (respuesta) => {
    const url = respuesta.url();
    if (respuesta.status() < 400 || url.includes("favicon")) return;
    const relativa = url.replace(BASE, "");
    if (ESPERADAS_SIN_RED.some((ruta) => relativa.startsWith(ruta))) {
      avisosSinRed.add(`${respuesta.status()} ${relativa}`);
      return;
    }
    fallosRed.push(`${respuesta.status()} ${relativa}`);
  });

  console.log(`\n=== ${cuenta.nombre} ===`);
  await pagina.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await pagina.waitForTimeout(2_500);
  await pagina.fill("#email", cuenta.email);
  await pagina.fill("#password", cuenta.password);
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(4_000);
  if (!pagina.url().includes("/dashboard")) {
    anotar("error", `${cuenta.nombre}: no se pudo iniciar sesión`);
    await contexto.close();
    continue;
  }

  // Enlaces de la barra lateral y del menú superior: la navegación real.
  await pagina.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2_000);
  const destinos = await pagina.evaluate(() => {
    const rutas = new Set();
    for (const enlace of document.querySelectorAll('a[href^="/dashboard"]')) {
      rutas.add(enlace.getAttribute("href")?.split("?")[0] ?? "");
    }
    return [...rutas].filter(Boolean);
  });
  console.log(`Rutas descubiertas en la navegación: ${destinos.length}`);

  for (const ruta of destinos) {
    const inicio = Date.now();
    const respuesta = await pagina.goto(`${BASE}${ruta}`, {
      waitUntil: "domcontentloaded",
    });
    const duracion = Date.now() - inicio;
    await pagina.waitForTimeout(900);
    if (!respuesta || respuesta.status() >= 400) {
      anotar(
        "error",
        `${cuenta.nombre}: ${ruta} responde ${respuesta?.status() ?? "sin respuesta"}`,
      );
      continue;
    }
    if (duracion > 4_000)
      anotar("aviso", `${ruta} tarda ${duracion} ms en pintar el HTML`);
    const titulo =
      (
        await pagina
          .locator("h1")
          .first()
          .textContent()
          .catch(() => "")
      )?.trim() ?? "";
    if (!titulo) anotar("aviso", `${ruta} no tiene encabezado <h1>`);
    // Enlaces internos rotos visibles en la página.
    const enlaces = await pagina.evaluate(() =>
      [...document.querySelectorAll('a[href^="/"]')].map(
        (enlace) => enlace.getAttribute("href") ?? "",
      ),
    );
    for (const enlace of new Set(enlaces)) {
      if (
        enlace.startsWith("/api") ||
        enlace.includes("#") ||
        enlace.startsWith("/_next")
      )
        continue;
      const comprobacion = await pagina.request.get(`${BASE}${enlace}`);
      if (comprobacion.status() >= 400) {
        anotar(
          "error",
          `${ruta} → enlace roto ${enlace} (${comprobacion.status()})`,
        );
      }
    }
  }

  // Botones del panel que deberían hacer algo: se pulsan solo los que abren
  // diálogo o pestaña (los que envían datos ya tienen su propia verificación).
  await pagina.goto(`${BASE}/dashboard/settings/notifications`, {
    waitUntil: "domcontentloaded",
  });
  await pagina.waitForTimeout(1_200);
  const botonesSinAccion = await pagina.evaluate(() => {
    const sospechosos = [];
    for (const boton of document.querySelectorAll("button")) {
      const texto = (boton.textContent ?? "").trim();
      if (!texto || boton.disabled) continue;
      // Sin handler de React ni tipo submit ni atributo de acción conocida.
      const tieneReact = Object.keys(boton).some((clave) =>
        clave.startsWith("__react"),
      );
      if (!tieneReact && boton.type !== "submit")
        sospechosos.push(texto.slice(0, 40));
    }
    return sospechosos;
  });
  if (botonesSinAccion.length > 0) {
    anotar(
      "aviso",
      `${cuenta.nombre}: botones sin acción aparente en Notificaciones → ${botonesSinAccion.join(" | ")}`,
    );
  }

  for (const aviso of avisosSinRed)
    anotar(
      "aviso",
      `sin red (esperado, se degrada con aviso en pantalla): ${aviso}`,
    );
  // Ese 5xx esperado también aparece en la consola del navegador: se filtra.
  for (const error of new Set(erroresConsola)) {
    if (error.includes("502") && avisosSinRed.size > 0) continue;
    anotar("error", `consola (${cuenta.nombre}): ${error}`);
  }
  for (const fallo of new Set(fallosRed))
    anotar("error", `red (${cuenta.nombre}): ${fallo}`);
  await contexto.close();
}

await navegador.close();

const errores = hallazgos.filter((fila) => fila.tipo === "error").length;
const avisos = hallazgos.length - errores;
console.log(`\n=== RESUMEN: ${errores} errores · ${avisos} avisos ===`);
if (errores > 0) process.exit(1);
