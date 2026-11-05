/* Prueba de humo en navegador real + mecánicas de juego.
   Requiere: npm install puppeteer-core (ya instalado en esta carpeta)
             un servidor estático en :8010 (python3 -m http.server 8010)
   Uso: node tools/test-gameplay.mjs  */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:8010/index.html';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const t = (name, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 420, deviceScaleFactor: 1 });

// En este sandbox de pruebas el proxy de salida bloquea Supabase: son fallos de red
// esperados que storage.js ya absorbe con timeout + alternativa local, no errores de JS.
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0' });
await wait(300);
t('La página carga sin errores', errors.length === 0, errors[0] || '');

await page.type('#inpName', 'Prueba');
await page.click('#btnStart');
await page.waitForFunction(() => window.__maze && window.__maze.game.state === 'play', { timeout: 6000 });
t('La partida arranca (state=play)', true);

const info = await page.evaluate(() => {
  const g = window.__maze.game;
  return {
    seed: g.seed, grievers: g.grievers.length, items: g.items.length,
    doors: g.world.doors.length, hatches: g.world.hatches.length,
    health: g.player.health, battery: g.player.battery,
  };
});
t('Mundo generado con entidades', info.grievers > 10 && info.items > 20 && info.doors === 12 && info.hatches === 3, JSON.stringify(info));

// FPS
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(tick);
}));
t('Renderiza a buen ritmo', fps > 20, `${fps.toFixed(1)} fps`);

// moverse con el teclado
const moved = await page.evaluate(async () => {
  const g = window.__maze.game;
  const p0 = { x: g.player.x, y: g.player.y };
  g.input.keys.add('KeyW');
  await new Promise((r) => setTimeout(r, 1200));
  g.input.keys.delete('KeyW');
  return Math.hypot(g.player.x - p0.x, g.player.y - p0.y);
});
t('El jugador se mueve con el teclado', moved > 0.3, `${moved.toFixed(2)} u`);

// recoger un objeto
const pick = await page.evaluate(async () => {
  const g = window.__maze.game;
  const it = g.items.find((i) => !i.taken && i.floor === g.player.floor);
  if (!it) return { ok: false };
  const before = it.type === 'battery' ? g.player.battery : it.type === 'flare' ? g.player.flares : it.type === 'medkit' ? g.player.health : g.player.codes;
  g.player.x = it.x; g.player.y = it.y;
  await new Promise((r) => setTimeout(r, 250));
  return { ok: it.taken, type: it.type, before };
});
t('Recoger un objeto lo marca como tomado', pick.ok, JSON.stringify(pick));

// escotilla: bajar y subir
const hatch = await page.evaluate(async () => {
  const g = window.__maze.game, w = g.world;
  const h = w.hatches[0];
  g.player.floor = 0; g.player.x = h.x + 0.5; g.player.y = h.y + 0.5;
  g.interact();
  await new Promise((r) => setTimeout(r, 150));
  const down = g.player.floor;
  g.interact();
  await new Promise((r) => setTimeout(r, 150));
  const up = g.player.floor;
  return { down, up };
});
t('Las escotillas cambian de piso', hatch.down === 1 && hatch.up === 0, JSON.stringify(hatch));

// puertas: de noche deben cerrarse y bloquear
const doorTest = await page.evaluate(async () => {
  const g = window.__maze.game, w = g.world;
  g.player.floor = 0;
  const d = w.doors[0];
  g.cycleT = 240; // DAY_LEN v2: fuerza el cambio a noche en el próximo update
  await new Promise((r) => setTimeout(r, 2500));
  return { isNight: g.isNight, open: d.open, blocked: w.isBlocked(0, d.x, d.y) };
});
t('Las puertas se cierran de noche', doorTest.isNight === true && doorTest.open < 0.3 && doorTest.blocked === true, JSON.stringify(doorTest));

// daño y muerte
const death = await page.evaluate(async () => {
  const g = window.__maze.game;
  g.cycleT = 0; // vuelve a ser de día para no complicar
  g.player.health = 1;
  g.damagePlayer(50);
  await new Promise((r) => setTimeout(r, 200));
  return { health: g.player.health, state: g.state };
});
t('El daño letal termina la partida', death.health <= 0 && death.state === 'dead', JSON.stringify(death));

// reiniciar y forzar victoria
await page.evaluate(() => { window.__maze.game.quit(); window.__maze.ui.showPanel('panelTitle'); });
await wait(150);
await page.click('#btnStart');
await page.waitForFunction(() => window.__maze.game.state === 'play', { timeout: 6000 });
const win = await page.evaluate(async () => {
  const g = window.__maze.game, w = g.world;
  g.player.floor = 0;
  g.player.codes = 3;
  g.player.x = w.exit.x + 0.5; g.player.y = w.exit.y + 0.5;
  g.interact();
  await new Promise((r) => setTimeout(r, 300));
  const local = JSON.parse(localStorage.getItem('mazerunner.scores.v1') || '[]');
  return { state: g.state, scores: local.length };
});
t('Victoria: llegar a la salida con 3 códigos', win.state === 'win' && win.scores >= 1, JSON.stringify(win));

console.log(errors.length ? '\n❌ ERRORES JS:\n' + errors.join('\n') : '\n✅ 0 errores JS en toda la prueba');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
