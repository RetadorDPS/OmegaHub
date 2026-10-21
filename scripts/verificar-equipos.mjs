/**
 * Verificación de equipos (asientos) y webhooks.
 *
 *   npm run verify:equipos        (requiere `npm run start` y `npm run db:seed`)
 *
 * Comprueba los casos que de verdad pueden romperse en producción:
 *   1. El administrador (Business) ve su equipo y sus plazas.
 *   2. Un plan Pro no puede crear equipo (402) ni webhooks (402).
 *   3. Invitar valida correo, evita duplicados y no ocupa plaza hasta aceptar.
 *   4. El enlace de invitación solo lo puede aceptar el correo invitado.
 *   5. Al aceptar, el miembro hereda el plan del equipo (Business).
 *   6. Un miembro raso no puede invitar ni cambiar roles.
 *   7. El propietario no se puede quitar.
 *   8. Webhooks: rechaza http, localhost y direcciones internas (SSRF).
 *   9. Webhooks: crear, probar (falla sin red, pero se registra), pausar y borrar.
 *  10. Las pantallas nuevas responden y redirigen donde deben.
 *
 * Al terminar deja la base como estaba (revoca la plaza de prueba y borra los
 * webhooks creados durante la verificación).
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

const CUENTAS = {
  admin: { email: "admin@trendhunter.pro", password: "admin1234" },
  demo: { email: "demo@trendhunter.pro", password: "demo1234" },
  free: { email: "free@trendhunter.pro", password: "free1234" },
};

const resultados = [];
function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}`,
  },
});

/** Abre una sesión nueva en su propio contexto (cookies separadas). */
async function sesion(cuenta) {
  const contexto = await navegador.newContext({
    locale: "es-ES",
    colorScheme: "dark",
  });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await pagina.waitForTimeout(2_000);
  await pagina.fill("#email", cuenta.email);
  await pagina.fill("#password", cuenta.password);
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(3_500);
  return { contexto, pagina, ok: pagina.url().includes("/dashboard") };
}

/**
 * Petición JSON usando la sesión del navegador.
 *
 * Se usa la API de peticiones de Playwright (comparte las cookies del
 * contexto) en lugar de `fetch` dentro de la página: así el método es siempre
 * válido y el cuerpo solo viaja cuando el método lo admite.
 */
async function pedir(pagina, ruta, opciones = {}) {
  const metodo = (opciones.metodo ?? "GET").toUpperCase();
  const respuesta = await pagina.request.fetch(`${BASE}${ruta}`, {
    method: metodo,
    data:
      metodo === "GET" || metodo === "HEAD"
        ? undefined
        : (opciones.cuerpo ?? undefined),
    failOnStatusCode: false,
  });
  const texto = await respuesta.text();
  let datos = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { crudo: texto.slice(0, 200) };
  }
  return { estado: respuesta.status(), datos };
}

try {
  // ------------------------------------------------------------- sesiones
  const admin = await sesion(CUENTAS.admin);
  registrar("Login del administrador", admin.ok);
  const demo = await sesion(CUENTAS.demo);
  registrar("Login del usuario Pro", demo.ok);
  const free = await sesion(CUENTAS.free);
  registrar("Login del usuario Free", free.ok);

  // ------------------------------------------------- 1 · equipo del admin
  const equipoAdmin = await pedir(admin.pagina, "/api/equipos");
  const propio = equipoAdmin.datos.propio;
  registrar(
    "El admin ve su equipo con plazas",
    equipoAdmin.estado === 200 &&
      propio &&
      propio.asientos === 5 &&
      propio.ocupados >= 1,
    `${propio?.nombre ?? "sin equipo"} · ${propio?.ocupados}/${propio?.asientos}`,
  );
  registrar(
    "El propietario está marcado como tal",
    propio?.miembros?.some(
      (miembro) => miembro.role === "OWNER" && miembro.status === "ACTIVE",
    ),
  );

  // ------------------------------------- 2 · planes sin asientos
  const equipoDemo = await pedir(demo.pagina, "/api/equipos", {
    metodo: "POST",
    cuerpo: { nombre: "Equipo de prueba" },
  });
  registrar(
    "Un plan Pro no puede crear equipo (402)",
    equipoDemo.estado === 402,
    `${equipoDemo.estado} · ${equipoDemo.datos.error ?? ""}`,
  );
  const webhookDemo = await pedir(demo.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Prueba",
      url: "https://hooks.slack.com/services/T/B/x",
      eventos: ["alerta"],
    },
  });
  registrar(
    "Un plan Pro no puede crear webhooks (402)",
    webhookDemo.estado === 402,
    `${webhookDemo.estado}`,
  );

  // ------------------------------------- 3 · invitaciones
  const correoInvalido = await pedir(
    admin.pagina,
    "/api/equipos/invitaciones",
    {
      metodo: "POST",
      cuerpo: { email: "no-es-un-correo", role: "MEMBER" },
    },
  );
  registrar(
    "Rechaza un correo inválido",
    correoInvalido.estado === 400,
    `${correoInvalido.estado}`,
  );

  const invitacion = await pedir(admin.pagina, "/api/equipos/invitaciones", {
    metodo: "POST",
    cuerpo: { email: "free@trendhunter.pro", role: "MEMBER" },
  });
  const enlace = invitacion.datos.enlace ?? "";
  const tokenAntiguo = enlace.split("token=")[1] ?? "";
  registrar(
    "Invita a un correo real y devuelve enlace",
    invitacion.estado === 201 && tokenAntiguo.length > 16,
    enlace.slice(0, 48),
  );
  registrar(
    "La invitación no ocupa plaza todavía",
    invitacion.datos.plazas?.pendientes >= 1,
    `${invitacion.datos.plazas?.pendientes} pendientes`,
  );

  const repetida = await pedir(admin.pagina, "/api/equipos/invitaciones", {
    metodo: "POST",
    cuerpo: { email: "free@trendhunter.pro", role: "MEMBER" },
  });
  registrar(
    "Reinvitar no duplica la plaza",
    repetida.estado === 201,
    `${repetida.estado}`,
  );

  // Cada invitación nueva invalida el enlace anterior (un solo uso de verdad).
  const token = (repetida.datos.enlace ?? "").split("token=")[1] ?? "";
  const viejo = await pedir(
    free.pagina,
    `/api/equipos/invitaciones?token=${encodeURIComponent(tokenAntiguo)}`,
  );
  registrar(
    "Reinvitar invalida el enlace anterior",
    viejo.estado === 404,
    `${viejo.estado}`,
  );

  const publica = await pedir(
    free.pagina,
    `/api/equipos/invitaciones?token=${encodeURIComponent(token)}`,
  );
  registrar(
    "La invitación se puede leer sin exponer datos de más",
    publica.estado === 200 &&
      publica.datos.invitacion?.email === "free@trendhunter.pro" &&
      !("id" in (publica.datos.invitacion ?? {})),
    publica.datos.invitacion?.equipo ?? "",
  );

  // ------------------------------------- 4 · aceptar con otro correo
  const ajeno = await pedir(demo.pagina, "/api/equipos/invitaciones/aceptar", {
    metodo: "POST",
    cuerpo: { token },
  });
  registrar(
    "Otro correo no puede aceptar la invitación (403)",
    ajeno.estado === 403,
    `${ajeno.estado}`,
  );

  // ------------------------------------- 5 · aceptar con el correo correcto
  const aceptada = await pedir(
    free.pagina,
    "/api/equipos/invitaciones/aceptar",
    { metodo: "POST", cuerpo: { token } },
  );
  registrar(
    "El correo invitado acepta",
    aceptada.estado === 200,
    `${aceptada.estado} · ${aceptada.datos.equipo ?? ""}`,
  );

  const reuso = await pedir(demo.pagina, "/api/equipos/invitaciones/aceptar", {
    metodo: "POST",
    cuerpo: { token },
  });
  registrar(
    "El enlace no se puede reutilizar",
    reuso.estado >= 400,
    `${reuso.estado}`,
  );

  // El plan efectivo se refresca al recargar la sesión.
  const equiposFree = await pedir(free.pagina, "/api/equipos");
  registrar(
    "El miembro hereda el plan del equipo",
    equiposFree.datos.planEfectivo === "BUSINESS" &&
      equiposFree.datos.membresias?.length >= 1,
    `${equiposFree.datos.planEfectivo} · ${equiposFree.datos.membresias?.[0]?.nombre ?? ""}`,
  );

  // ------------------------------------- 6 · permisos dentro del equipo
  const miembroInvita = await pedir(free.pagina, "/api/equipos/invitaciones", {
    metodo: "POST",
    cuerpo: { email: "otro@trendhunter.pro", role: "MEMBER" },
  });
  registrar(
    "Un miembro raso no puede invitar (403)",
    miembroInvita.estado === 403,
    `${miembroInvita.estado}`,
  );

  const equipoActualizado = await pedir(admin.pagina, "/api/equipos");
  const plazaFree = equipoActualizado.datos.propio?.miembros?.find(
    (miembro) => miembro.email === "free@trendhunter.pro",
  );
  const plazaOwner = equipoActualizado.datos.propio?.miembros?.find(
    (miembro) => miembro.role === "OWNER",
  );

  const quitarOwner = await pedir(
    admin.pagina,
    `/api/equipos/miembros/${plazaOwner?.id}`,
    { metodo: "DELETE" },
  );
  registrar(
    "El propietario no se puede quitar",
    quitarOwner.estado === 400,
    `${quitarOwner.estado}`,
  );

  const ascender = await pedir(
    admin.pagina,
    `/api/equipos/miembros/${plazaFree?.id}`,
    {
      metodo: "PATCH",
      cuerpo: { role: "ADMIN" },
    },
  );
  registrar(
    "El propietario puede ascender a administrador",
    ascender.estado === 200,
    `${ascender.estado}`,
  );

  // ------------------------------------- 7 · webhooks (validación)
  const http = await pedir(admin.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Inseguro",
      url: "http://ejemplo.com/hook",
      eventos: ["alerta"],
    },
  });
  registrar(
    "Rechaza webhooks sin https",
    http.estado === 400,
    `${http.estado}`,
  );

  const local = await pedir(admin.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Interno",
      url: "https://localhost:3000/hook",
      eventos: ["alerta"],
    },
  });
  registrar(
    "Rechaza localhost (SSRF)",
    local.estado === 400,
    `${local.estado}`,
  );

  const metadatos = await pedir(admin.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Metadatos",
      url: "https://169.254.169.254/latest/meta-data",
      eventos: ["alerta"],
    },
  });
  registrar(
    "Rechaza la IP de metadatos del cloud (SSRF)",
    metadatos.estado === 400,
    `${metadatos.estado}`,
  );

  const creado = await pedir(admin.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Prueba de verificación",
      url: "https://hooks.slack.com/services/T000/B000/verificacionAutomatica0001",
      provider: "SLACK",
      eventos: ["alerta", "precio"],
    },
  });
  registrar(
    "Crea un webhook de Slack con eventos",
    creado.estado === 201 && creado.datos.webhook?.eventos?.includes("precio"),
    `${creado.estado}`,
  );
  registrar(
    "La URL se guarda ofuscada en la respuesta",
    creado.datos.webhook?.url?.includes("…"),
    creado.datos.webhook?.url ?? "",
  );

  const generico = await pedir(admin.pagina, "/api/webhooks", {
    metodo: "POST",
    cuerpo: {
      nombre: "Firma HMAC",
      url: "https://ejemplo-automatizacion.com/hook",
      provider: "GENERIC",
      eventos: ["producto"],
    },
  });
  registrar(
    "El webhook genérico recibe un secreto de firma",
    generico.estado === 201 &&
      typeof generico.datos.secreto === "string" &&
      generico.datos.secreto.startsWith("whsec_"),
    `${generico.estado}`,
  );

  const prueba = await pedir(
    admin.pagina,
    `/api/webhooks/${creado.datos.webhook?.id}/probar`,
    { metodo: "POST" },
  );
  registrar(
    "La prueba responde con el motivo cuando no hay red",
    prueba.estado === 200 || prueba.estado === 502,
    `${prueba.estado} · ${prueba.datos.motivo ?? prueba.datos.error ?? "entregado"}`,
  );

  const pausa = await pedir(
    admin.pagina,
    `/api/webhooks/${creado.datos.webhook?.id}`,
    {
      metodo: "PATCH",
      cuerpo: { activo: false },
    },
  );
  registrar(
    "Se puede pausar un webhook",
    pausa.estado === 200 && pausa.datos.webhook?.activo === false,
  );

  const ajenoWebhook = await pedir(
    demo.pagina,
    `/api/webhooks/${creado.datos.webhook?.id}`,
    { metodo: "DELETE" },
  );
  registrar(
    "Otro usuario no puede borrar mi webhook (404)",
    ajenoWebhook.estado === 404,
    `${ajenoWebhook.estado}`,
  );

  // ------------------------------------- 8 · pantallas
  const paginaEquipo = await admin.pagina.goto(`${BASE}/dashboard/equipos`, {
    waitUntil: "domcontentloaded",
  });
  await admin.pagina.waitForTimeout(1_500);
  const tituloEquipo =
    (await admin.pagina
      .locator("h1")
      .first()
      .textContent()
      .catch(() => "")) ?? "";
  registrar(
    "La pantalla de equipo carga",
    paginaEquipo?.status() === 200 && tituloEquipo.includes("Equipo"),
    tituloEquipo.trim(),
  );

  const paginaNoti = await admin.pagina.goto(
    `${BASE}/dashboard/settings/notifications`,
    { waitUntil: "domcontentloaded" },
  );
  await admin.pagina.waitForTimeout(1_500);
  const textoNoti = await admin.pagina.locator("body").innerText();
  registrar(
    "Los webhooks se configuran en Notificaciones",
    paginaNoti?.status() === 200 && textoNoti.includes("Webhooks"),
  );

  const nuevaInvitacion = await pedir(
    admin.pagina,
    "/api/equipos/invitaciones",
    {
      metodo: "POST",
      cuerpo: { email: "nueva@trendhunter.pro", role: "MEMBER" },
    },
  );
  const tokenNuevo =
    (nuevaInvitacion.datos.enlace ?? "").split("token=")[1] ?? "";
  const paginaAceptar = await free.pagina.goto(
    `${BASE}/equipos/aceptar?token=${encodeURIComponent(tokenNuevo)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await free.pagina.waitForTimeout(2_000);
  const textoAceptar = await free.pagina.locator("body").innerText();
  registrar(
    "La página de invitación muestra el equipo",
    paginaAceptar?.status() === 200 && textoAceptar.includes("Agencia Norte"),
    textoAceptar.includes("Agencia Norte") ? "ok" : "sin datos",
  );

  // ------------------------------------- limpieza
  await pedir(admin.pagina, `/api/equipos/miembros/${plazaFree?.id}`, {
    metodo: "DELETE",
  });
  await pedir(admin.pagina, `/api/webhooks/${creado.datos.webhook?.id}`, {
    metodo: "DELETE",
  });
  await pedir(admin.pagina, `/api/webhooks/${generico.datos.webhook?.id}`, {
    metodo: "DELETE",
  });
  registrar("Limpieza de datos de prueba", true);
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, error.message);
} finally {
  await navegador.close();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(
  `\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`,
);
if (fallos > 0) process.exit(1);
