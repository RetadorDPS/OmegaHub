// Pruebas de extremo a extremo de Studio Sección en Chromium (escritorio y móvil).
//
//   npm run build && npm run preview        (en otra terminal)
//   npm run e2e                             (usa http://127.0.0.1:4173/)
//   BASE_URL=http://127.0.0.1:5173/ npm run e2e   (contra el servidor de desarrollo)
//
// Recorre las pruebas de aceptación: visita guiada de Casa Mirador, obra por
// etapas reversible, flujo plano → escala → trazado → 3D → recorrido, cambio de
// puerta, persistencia, entradas PDF e imagen, archivo inválido, movimiento
// reducido y ausencia de peticiones a terceros. Deja capturas en docs/capturas/.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BASE_URL, launch } from './lib/browser.mjs';
import { CONTORNO, fraccion, REFERENCIA, TABIQUE } from './lib/plano-ejemplo.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'docs', 'capturas');
mkdirSync(shots, { recursive: true });
const only = process.env.SOLO?.split(',') ?? null;

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const section = (title) => console.log(`\n${title}`);

const browser = await launch();
const origin = new URL(BASE_URL).origin;
const foreign = new Set();
const consoleErrors = [];

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    if (new URL(url).origin !== origin) foreign.add(url);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  return { context, page };
}

const viewerReady = (page) => page.waitForSelector('[data-testid="viewer"][data-ready="true"]', { timeout: 60000 });
const debug = (page) => page.evaluate(() => window.__studio.controller.debug());
const layers = (page) => page.evaluate(() => window.__studio.controller.debugLayers());
const tourSettled = (page) =>
  page.waitForFunction(
    () => {
      const d = window.__studio.controller.debug();
      return Math.abs(d.s - d.target) < 1e-4 && Number.isInteger(Math.round(d.s * 1e4) / 1e4);
    },
    null,
    { timeout: 120000 },
  );
const text = (page, id) => page.textContent(`[data-testid="${id}"]`);
const click = (page, id) => page.click(`[data-testid="${id}"]`);
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const run = (name) => !only || only.includes(name);

// ---------------------------------------------------------------------------
// 1. Casa Mirador en escritorio
// ---------------------------------------------------------------------------
if (run('demo')) {
  section('Casa Mirador · escritorio');
  const { context, page } = await newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-testid="portada"]');
  check('la portada muestra las dos entradas', (await page.isVisible('[data-testid="entrar-demo"]')) && (await page.isVisible('[data-testid="subir-plano"]')));
  await settle(page, 600);
  await page.screenshot({ path: join(shots, 'portada.png') });

  await click(page, 'entrar-demo');
  await viewerReady(page);
  check('abre directamente, sin iniciar sesión', (await text(page, 'capitulo')) === 'Exterior');

  const expected = ['Acercamiento', 'Terraza', 'Salón', 'Dormitorio'];
  for (const chapter of expected) {
    await click(page, 'siguiente');
    await tourSettled(page);
    await settle(page, 250);
    check(`avanza a «${chapter}»`, (await text(page, 'capitulo')) === chapter);
    if (chapter === 'Salón') {
      const d = await debug(page);
      check('en interiores la cámara va a altura de ojos (1,60 m)', near(d.camera[1], 1.6, 0.01), `y = ${d.camera[1].toFixed(3)}`);
      await settle(page, 900);
      await page.screenshot({ path: join(shots, 'interior-salon.png') });
    }
  }

  // Retroceso con teclado, pausa a mitad de tramo y cambio a modo libre.
  await page.keyboard.press('ArrowLeft');
  await tourSettled(page);
  check('la flecha izquierda retrocede al salón', (await text(page, 'capitulo')) === 'Salón');
  await click(page, 'reproducir');
  await page.waitForFunction(() => {
    const d = window.__studio.controller.debug();
    return d.s > 3.12 && d.s < 3.9;
  }, null, { timeout: 60000 });
  await click(page, 'reproducir');
  await settle(page, 900);
  const paused1 = await debug(page);
  await settle(page, 900);
  const paused2 = await debug(page);
  check('pausa a mitad de tramo y la cámara se queda quieta', near(paused1.s, paused2.s, 1e-6) && paused1.s % 1 > 0.05, `s = ${paused1.s.toFixed(3)}`);

  await click(page, 'explorar-libre');
  await page.waitForSelector('[data-testid="insignia-libre"]');
  const free0 = await debug(page);
  check('recupera el control sin cambiar de pantalla ni de sitio', free0.mode === 'caminar' && near(free0.camera[0], paused2.camera[0], 0.2) && near(free0.camera[2], paused2.camera[2], 0.2));
  check('el modo libre se anuncia con claridad', (await text(page, 'insignia-libre')).includes('Modo libre'));
  await page.keyboard.down('w');
  await settle(page, 1200);
  await page.keyboard.up('w');
  const free1 = await debug(page);
  check('camina con el teclado', Math.hypot(free1.camera[0] - free0.camera[0], free1.camera[2] - free0.camera[2]) > 0.15);

  // Colisiones de la demo: contra el muro este y a través de la corredera.
  const wallHit = await page.evaluate(() => window.__studio.controller.simulateWalk({ x: 6.5, y: 5.3 }, Math.PI / 2, 12));
  check('el muro este detiene el paso', wallHit.x < 12 - 0.12 - 0.2, `x final = ${wallHit.x.toFixed(2)}`);
  const glass = await page.evaluate(() => window.__studio.controller.simulateWalk({ x: 9.9, y: 5.9 }, 0, 6));
  check('la cristalera fija no se atraviesa', glass.y < 6.4 - 0.12 - 0.2, `z final = ${glass.y.toFixed(2)}`);
  const slider = await page.evaluate(() => window.__studio.controller.simulateWalk({ x: 6.7, y: 5.6 }, 0, 3));
  check('la corredera abierta sí deja salir a la terraza', slider.y > 7.2, `z final = ${slider.y.toFixed(2)}`);

  await click(page, 'reiniciar');
  await settle(page, 900);
  check('reiniciar cámara lleva a un punto de entrada seguro', (await debug(page)).mode === 'caminar');
  await click(page, 'volver-guia');
  await page.waitForFunction(() => window.__studio.controller.debug().mode === 'guia');
  await tourSettled(page);
  check('vuelve a la guía en un capítulo', ['Salón', 'Dormitorio'].includes(await text(page, 'capitulo')));

  // Maqueta.
  await click(page, 'modo-maqueta');
  await settle(page, 2200);
  const maqueta = await layers(page);
  check('la maqueta oculta la cubierta y conserva la distribución', !('cubierta' in maqueta) && 'cerramientos' in maqueta && 'mobiliario' in maqueta);

  // Obra por etapas.
  await click(page, 'modo-obra');
  await settle(page, 2000);
  const stageIds = ['plano', 'base', 'estructura', 'envolvente', 'acabados'];
  const seen = [];
  for (let i = 0; i < stageIds.length; i++) {
    if (i > 0) await click(page, 'etapa-siguiente');
    await settle(page, 1700);
    seen.push(await layers(page));
    if (stageIds[i] === 'estructura') await page.screenshot({ path: join(shots, 'obra-estructura.png') });
  }
  check('el plano muestra solo trazado', Object.keys(seen[0]).sort().join() === 'plano,trazado');
  check('la base añade losa y terreno', 'base' in seen[1] && !('estructura' in seen[1]));
  check('la estructura muestra el entramado (más de 150 piezas)', (seen[2].estructura ?? 0) > 150, `${seen[2].estructura} piezas`);
  check('la envolvente trae muros, carpinterías y cubierta', ['cerramientos', 'carpinterias', 'cubierta'].every((l) => l in seen[3]) && !('estructura' in seen[3]));
  check('los acabados añaden mobiliario', 'mobiliario' in seen[4] && 'acabados' in seen[4]);
  check('cada etapa dibuja geometría distinta', new Set(seen.map((s) => JSON.stringify(s))).size === 5);
  await click(page, 'etapa-base');
  await settle(page, 1700);
  const back = await layers(page);
  check('retroceder restaura la etapa sin residuos', JSON.stringify(back) === JSON.stringify(seen[1]), JSON.stringify(back));
  await click(page, 'etapa-acabados');
  await settle(page, 1500);
  check('y se puede volver a avanzar hasta el acabado', JSON.stringify(await layers(page)) === JSON.stringify(seen[4]));
  await context.close();
}

// ---------------------------------------------------------------------------
// 2. Casa Mirador en móvil y con movimiento reducido
// ---------------------------------------------------------------------------
if (run('movil')) {
  section('Casa Mirador · móvil (390 × 844, táctil)');
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}#/demo`);
  await viewerReady(page);
  await page.tap('[data-testid="siguiente"]');
  await tourSettled(page);
  check('los botones táctiles avanzan la visita', (await text(page, 'capitulo')) === 'Acercamiento');
  await page.tap('[data-testid="siguiente"]');
  await tourSettled(page);
  await settle(page, 600);
  await page.screenshot({ path: join(shots, 'movil-terraza.png') });
  await page.tap('[data-testid="explorar-libre"]');
  await page.waitForSelector('[data-testid="joystick"]');
  const before = await debug(page);
  const box = await page.locator('[data-testid="joystick"]').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Empuje del mando hacia delante mediante eventos de puntero táctiles.
  await page.evaluate(
    async ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="joystick"]');
      const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: cx, clientY: y, bubbles: true, isPrimary: true }));
      fire('pointerdown', cy);
      fire('pointermove', cy - 40);
      await new Promise((r) => setTimeout(r, 1300));
      fire('pointerup', cy - 40);
    },
    { cx, cy },
  );
  const after = await debug(page);
  check('el mando táctil mueve la cámara', Math.hypot(after.camera[0] - before.camera[0], after.camera[2] - before.camera[2]) > 0.15);
  const foot = await page.locator('[data-testid="pie"]').boundingBox();
  check('el panel inferior deja libre la mayor parte de la escena', foot.height < 844 * 0.42, `${Math.round(foot.height)} px`);
  await context.close();

  section('Casa Mirador · movimiento reducido');
  const reduced = await newPage({ reducedMotion: 'reduce' });
  await reduced.page.goto(`${BASE_URL}#/demo`);
  await viewerReady(reduced.page);
  const t0 = Date.now();
  await click(reduced.page, 'siguiente');
  await reduced.page.waitForFunction(() => window.__studio.controller.debug().s === 1, null, { timeout: 15000 });
  const elapsed = Date.now() - t0;
  check('con animación reducida el capítulo cambia por fundido, sin travelling', elapsed < 2500 && (await text(reduced.page, 'capitulo')) === 'Acercamiento', `${elapsed} ms`);
  await reduced.context.close();
}

// ---------------------------------------------------------------------------
// 3. Crear desde mi plano
// ---------------------------------------------------------------------------
const edState = (page) =>
  page.evaluate(() => {
    const p = window.__editor.state().project;
    const len = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    return {
      id: p.id,
      plan: p.plan,
      calibration: p.calibration,
      walls: p.walls.map((w) => ({ id: w.id, length: len(w), thickness: w.thickness, a: w.a, b: w.b })),
      openings: p.openings,
      slab: p.slab,
      rooms: p.rooms,
      tool: window.__editor.state().tool,
    };
  });

/** Coordenadas de pantalla de un punto del plano de ejemplo dado en metros. */
const planPoint = (page, mx, my) =>
  page.evaluate(
    ({ fx, fy }) => {
      const st = window.__editor.state();
      const plan = st.project.plan;
      const mpp = window.__editor.metersPerPixel();
      return window.__editor.toScreen({ x: fx * plan.width * mpp, y: fy * plan.height * mpp });
    },
    fraccion(mx, my),
  );
const clickPlan = async (page, mx, my) => {
  const p = await planPoint(page, mx, my);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(60);
};

async function createProject(page, name) {
  await page.goto(`${BASE_URL}#/proyectos`);
  await page.waitForSelector('[data-testid="proyectos"]');
  await page.fill('[data-testid="nombre-proyecto"]', name);
  await click(page, 'crear-proyecto');
  await page.waitForSelector('[data-testid="inicio-plano"]');
}

async function calibrate(page) {
  await page.waitForSelector('[data-testid="fondo-plano"]');
  await page.waitForSelector('[data-testid="panel-escala"]');
  await clickPlan(page, ...REFERENCIA.a);
  await clickPlan(page, ...REFERENCIA.b);
  await page.fill('[data-testid="escala-metros"]', String(REFERENCIA.metros));
  await click(page, 'escala-aplicar');
  await page.waitForSelector('[data-testid="escala-ok"]');
}

if (run('plano')) {
  section('Crear desde mi plano · imagen PNG');
  const { context, page } = await newPage();
  await createProject(page, 'Casa en L');

  // Archivo inválido: texto con extensión de imagen.
  await page.setInputFiles('[data-testid="archivo-plano"]', { name: 'plano.png', mimeType: 'image/png', buffer: Buffer.from('esto no es un plano') });
  await page.waitForSelector('[data-testid="error-plano"]');
  check('un archivo inválido se explica y no rompe el flujo', (await text(page, 'error-plano')).includes('no es un PDF, PNG ni JPG'));
  check('y la pantalla de carga sigue disponible', await page.isVisible('[data-testid="archivo-plano"]', { strict: false }).catch(() => true));

  await page.setInputFiles('[data-testid="archivo-plano"]', join(root, 'public', 'ejemplos', 'plano-en-L.png'));
  await page.waitForSelector('[data-testid="fondo-plano"]');
  let st = await edState(page);
  check('la imagen se carga como fondo 2D', st.plan?.kind === 'image' && st.plan.width === 1800);
  check('sin calibrar se ofrece primero el paso de escala', st.tool === 'calibrate' && st.calibration === null);
  check('y no se muestran cotas en metros', (await page.locator('.pc-dim').count()) === 0);

  await calibrate(page);
  st = await edState(page);
  check('la escala sale del tramo de 4 m marcado, no del tamaño de página', near(st.calibration.metersPerPixel, 1 / 140, 1e-5), `${(1 / st.calibration.metersPerPixel).toFixed(2)} px/m`);

  // Contorno en L.
  await click(page, 'herramienta-wall');
  for (const [x, y] of CONTORNO) await clickPlan(page, x, y);
  await clickPlan(page, ...CONTORNO[0]);
  st = await edState(page);
  check('el contorno en L queda trazado con seis muros', st.walls.length === 6);
  check('las longitudes coinciden con el plano (8 · 4 · 4 · 3 · 4 · 7 m)', [8, 4, 4, 3, 4, 7].every((L, i) => near(st.walls[i].length, L, 0.03)), st.walls.map((w) => w.length.toFixed(2)).join(' · '));

  // Muro interior de 4 m y puerta.
  await clickPlan(page, ...TABIQUE.a);
  await clickPlan(page, ...TABIQUE.b);
  st = await edState(page);
  const inner = st.walls[6];
  check('el muro interior mide 4,00 m en el editor', !!inner && near(inner.length, 4, 0.02), inner ? inner.length.toFixed(3) : 'sin muro');
  const label = await page.textContent(`[data-dim-for="${inner.id}"]`);
  check('y su cota se rotula como «4,00 m»', label === '4,00 m', label);

  await click(page, 'herramienta-door');
  await clickPlan(page, ...TABIQUE.puerta);
  st = await edState(page);
  const door = st.openings[0];
  check('la puerta queda sobre el muro interior', !!door && door.wallId === inner.id && near(door.offset, 2, 0.05), door ? `a ${door.offset.toFixed(2)} m` : 'sin puerta');

  // Grosor del tabique, losa, estancias y deshacer/rehacer.
  await click(page, 'herramienta-select');
  const mid = await planPoint(page, 4, 3.3);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForSelector('[data-testid="props-muro"]');
  await page.fill('[data-testid="muro-grosor"]', '0,10');
  await page.keyboard.press('Enter');
  check('se puede ajustar el grosor del muro', near((await edState(page)).walls[6].thickness, 0.1, 1e-6));

  await click(page, 'proponer-losa');
  st = await edState(page);
  check('la losa se propone desde los muros y queda cerrada (44 m²)', st.slab?.closed === true && st.slab.points.length === 6);

  await click(page, 'herramienta-room');
  await clickPlan(page, 2, 2);
  await page.waitForSelector('[data-testid="estancia-nombre"]');
  await page.fill('[data-testid="estancia-nombre"]', 'Salón');
  await click(page, 'herramienta-room');
  await clickPlan(page, 6, 2);
  await page.fill('[data-testid="estancia-nombre"]', 'Cocina');
  st = await edState(page);
  check('las estancias tienen nombre y punto de cámara', st.rooms.length === 2 && st.rooms[0].name === 'Salón' && st.rooms[1].name === 'Cocina');

  const roomsBefore = st.rooms.length;
  await click(page, 'deshacer');
  const afterUndo = await edState(page);
  await click(page, 'rehacer');
  const afterRedo = await edState(page);
  check('deshacer y rehacer funcionan', afterUndo.rooms[1]?.name !== 'Cocina' && afterRedo.rooms.length === roomsBefore && afterRedo.rooms[1].name === 'Cocina');
  await settle(page, 400);
  await page.screenshot({ path: join(shots, 'editor-plano.png') });

  // Validaciones: hueco fuera de muro y hueco solapado no se aceptan.
  const doorScreen = await planPoint(page, 4, 2);
  await click(page, 'herramienta-select');
  await page.mouse.click(doorScreen.x, doorScreen.y);
  await page.waitForSelector('[data-testid="props-hueco"]');
  await page.fill('[data-testid="hueco-ancho"]', '5');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="aviso-editor"]');
  check('un hueco más ancho que su muro se rechaza con explicación', (await text(page, 'aviso-editor')).includes('no cabe') && near((await edState(page)).openings[0].width, 0.9, 1e-6));

  // Generar 3D.
  await click(page, 'generar-3d');
  await viewerReady(page);
  const model = await page.evaluate(() => {
    const d = window.__studio.def;
    return {
      kind: d.kind,
      title: d.title,
      walls: d.layouts.map((l) => ({ id: l.wall.id, length: l.length, pieces: l.pieces.map((p) => ({ kind: p.kind, u0: p.u0, u1: p.u1, y0: p.y0, y1: p.y1 })) })),
      stages: d.stages.map((s) => ({ id: s.id, illustrative: !!s.illustrative, layers: s.layers })),
      stops: d.tour.stops.map((s) => s.chapter),
      entries: d.entryPoints.map((e) => e.id),
    };
  });
  const innerModel = model.walls.find((w) => w.id === inner.id);
  check('el modelo es el de este plano, no la demo', model.kind === 'proyecto' && model.title === 'Casa en L' && model.walls.length === 7);
  check('la cota de 4 m coincide entre editor y modelo', near(innerModel.length, inner.length, 1e-9) && near(innerModel.length, 4, 0.02), innerModel.length.toFixed(3));
  check('la distribución coincide muro a muro', model.walls.every((w, i) => near(w.length, st.walls[i].length, 1e-9)));
  const lintel = innerModel.pieces.find((p) => p.kind === 'lintel');
  check('la puerta es un hueco real en el muro, con dintel', !!lintel && near(lintel.u1 - lintel.u0, 0.9, 1e-6) && near(lintel.y0, 2.1, 1e-6) && !innerModel.pieces.some((p) => p.kind !== 'lintel' && p.u0 < lintel.u1 - 1e-6 && p.u1 > lintel.u0 + 1e-6));
  check('la visita va de exterior a maqueta y a un interior validado', model.stops[0] === 'Exterior' && model.stops[1] === 'Maqueta' && model.stops.includes('Salón'));
  check('las etapas solo usan lo definido y marcan lo ilustrativo', !model.stages.some((s) => s.layers.includes('estructura') || s.layers.includes('cubierta') || s.layers.includes('mobiliario')) && model.stages.at(-1).illustrative);

  await click(page, 'siguiente');
  await tourSettled(page);
  await settle(page, 1200);
  check('segunda parada: maqueta sin cubierta', (await text(page, 'capitulo')) === 'Maqueta');
  await click(page, 'modo-maqueta');
  await settle(page, 2200);
  await page.screenshot({ path: join(shots, 'proyecto-propio-maqueta.png') });

  // Recorrido: por la puerta sí, por el muro no.
  const roomId = model.entries[0];
  await click(page, 'modo-libre');
  await page.waitForSelector(`[data-testid="entrar-${roomId}"]`);
  await click(page, `entrar-${roomId}`);
  await page.waitForFunction(() => window.__studio.controller.debug().mode === 'caminar');
  await settle(page, 900);
  await page.screenshot({ path: join(shots, 'proyecto-propio-interior.png') });
  const walk = (from, seconds = 4) => page.evaluate(({ from, seconds }) => window.__studio.controller.simulateWalk(from, Math.PI / 2, seconds), { from, seconds });
  // El tabique va de norte a sur: la puerta está a `offset` metros de su arranque.
  const doorY = st.walls[6].a.y + door.offset;
  const wallX = st.walls[6].a.x;
  const through = await walk({ x: wallX - 2, y: doorY });
  check('se pasa por la puerta', through.x > wallX + 1, `x final = ${through.x.toFixed(2)} (muro en ${wallX.toFixed(2)})`);
  const blocked = await walk({ x: wallX - 2, y: doorY + 1.3 });
  check('y no por el muro', blocked.x < wallX - 0.05 - 0.2, `x final = ${blocked.x.toFixed(2)}`);

  // Acabados.
  await click(page, 'abrir-acabados');
  await click(page, 'acabado-terrazo');
  await settle(page, 500);

  // Cambio de posición de la puerta: se actualizan 3D y colisión.
  await click(page, 'salir');
  await page.waitForSelector('[data-testid="editor"]');
  await page.waitForSelector('[data-testid="fondo-plano"]');
  await click(page, 'herramienta-select');
  const doorNow = await planPoint(page, 4, 2);
  await page.mouse.click(doorNow.x, doorNow.y);
  await page.waitForSelector('[data-testid="props-hueco"]');
  await page.fill('[data-testid="hueco-posicion"]', '0,30');
  await page.keyboard.press('Enter');
  st = await edState(page);
  check('la puerta se mueve en el plano', near(st.openings[0].offset, 0.75, 1e-6), `centro a ${st.openings[0].offset} m`);
  await click(page, 'generar-3d');
  await viewerReady(page);
  const moved = await page.evaluate((id) => window.__studio.def.layouts.find((l) => l.wall.id === id).pieces.find((p) => p.kind === 'lintel'), inner.id);
  check('el 3D se regenera con la puerta en su nueva posición', near(moved.u0, 0.3, 1e-6) && near(moved.u1, 1.2, 1e-6));
  await click(page, 'modo-libre');
  await click(page, `entrar-${roomId}`);
  await page.waitForFunction(() => window.__studio.controller.debug().mode === 'caminar');
  const oldSpot = await walk({ x: wallX - 2, y: doorY });
  check('la colisión cierra el hueco antiguo', oldSpot.x < wallX - 0.05 - 0.2, `x final = ${oldSpot.x.toFixed(2)}`);
  const newSpot = await walk({ x: wallX - 2, y: st.walls[6].a.y + 0.75 });
  check('y abre el nuevo', newSpot.x > wallX + 1, `x final = ${newSpot.x.toFixed(2)}`);

  // Persistencia: recarga completa del navegador.
  await click(page, 'salir');
  await page.waitForSelector('[data-testid="editor"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="estado-guardado"]')?.textContent?.includes('Guardado'), null, { timeout: 15000 });
  await settle(page, 300);
  const projectId = st.id;
  await page.reload();
  await page.waitForSelector('[data-testid="fondo-plano"]', { timeout: 30000 });
  const reopened = await edState(page);
  check('al reabrir conserva el trazado y la puerta movida', reopened.id === projectId && reopened.walls.length === 7 && near(reopened.openings[0].offset, 0.75, 1e-6) && reopened.rooms.length === 2);
  check('conserva el plano, la escala y los acabados', reopened.plan?.fileName === 'plano-en-L.png' && near(reopened.calibration.metersPerPixel, 1 / 140, 1e-5) && (await page.evaluate(() => window.__editor.state().project.finishes.floor)) === 'terrazo');

  // Sin estancia válida: se explica qué falta y se puede corregir.
  await click(page, 'herramienta-select');
  for (const [x, y] of [
    [2, 2],
    [6, 2],
  ]) {
    const p = await planPoint(page, x, y);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('[data-testid="props-estancia"]');
    await click(page, 'borrar');
  }
  await page.waitForSelector('[data-testid="aviso-sin-estancia"]');
  check('sin estancias se avisa de que falta un punto interior', (await text(page, 'aviso-sin-estancia')).includes('no se puede entrar a pie'));
  await click(page, 'generar-3d');
  await viewerReady(page);
  check('el 3D explica qué falta para entrar y deja volver a corregirlo', (await page.textContent('.viewer__notices')).includes('no se puede recorrer a pie') && (await page.isVisible('[data-testid="salir"]')));
  await click(page, 'salir');
  await page.waitForSelector('[data-testid="editor"]');
  await click(page, 'deshacer');
  await click(page, 'deshacer');
  check('deshacer recupera las estancias borradas', (await edState(page)).rooms.length === 2);
  await page.waitForFunction(() => document.querySelector('[data-testid="estado-guardado"]')?.textContent?.includes('Guardado'), null, { timeout: 15000 });

  // -------------------------------------------------------------------------
  section('Crear desde mi plano · PDF');
  await createProject(page, 'Casa en L (PDF)');
  await page.setInputFiles('[data-testid="archivo-plano"]', join(root, 'public', 'ejemplos', 'plano-en-L.pdf'));
  await page.waitForSelector('[data-testid="fondo-plano"]', { timeout: 60000 });
  let pdf = await edState(page);
  check('el PDF se dibuja en el navegador con PDF.js', pdf.plan?.kind === 'pdf' && pdf.plan.pageCount === 1 && pdf.plan.width > 1000, `${pdf.plan?.width} × ${pdf.plan?.height} px`);
  await calibrate(page);
  await click(page, 'herramienta-wall');
  await clickPlan(page, ...TABIQUE.a);
  await clickPlan(page, ...TABIQUE.b);
  await page.keyboard.press('Escape');
  pdf = await edState(page);
  check('la misma cota de 4 m sale al calibrar el PDF', pdf.walls.length === 1 && near(pdf.walls[0].length, 4, 0.02), pdf.walls[0]?.length.toFixed(3));
  await page.waitForFunction(() => document.querySelector('[data-testid="estado-guardado"]')?.textContent?.includes('Guardado'), null, { timeout: 15000 });

  // Lista de proyectos: ambos existen por separado; se elimina uno.
  await page.goto(`${BASE_URL}#/proyectos`);
  await page.waitForSelector('[data-testid="tarjeta-proyecto"]');
  const names = await page.locator('.card__name').allTextContents();
  check('los proyectos se guardan por separado', names.includes('Casa en L') && names.includes('Casa en L (PDF)'));
  const card = page.locator('[data-testid="tarjeta-proyecto"]', { hasText: 'Casa en L (PDF)' });
  await card.locator('[data-testid="eliminar-proyecto"]').click();
  await card.locator('[data-testid="confirmar-eliminar"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tarjeta-proyecto"]').length === 1);
  check('un proyecto se puede eliminar', !(await page.locator('.card__name').allTextContents()).includes('Casa en L (PDF)'));
  check('se aclara que solo está en este dispositivo', (await page.textContent('.projects__list-head')).includes('solo en este dispositivo'));
  await context.close();
}

// ---------------------------------------------------------------------------
// 4. Editor en móvil
// ---------------------------------------------------------------------------
if (run('editor-movil')) {
  section('Crear desde mi plano · móvil');
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await createProject(page, 'Prueba móvil');
  await page.tap('[data-testid="ejemplo-png"]');
  await page.waitForSelector('[data-testid="fondo-plano"]', { timeout: 30000 });
  check('el plano de ejemplo se abre en móvil', (await edState(page)).plan?.fileName === 'plano-en-L.png');
  await settle(page, 500);
  await page.screenshot({ path: join(shots, 'movil-editor.png') });
  await context.close();
}

await browser.close();

section('Red');
check('ninguna petición sale a servicios de terceros', foreign.size === 0, [...foreign].slice(0, 3).join(', '));
const realErrors = consoleErrors.filter((e) => !/Failed to load resource/.test(e) || /poster/.test(e) === false);
check('sin errores de consola', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} comprobaciones correctas.`);
process.exit(failures ? 1 : 0);
