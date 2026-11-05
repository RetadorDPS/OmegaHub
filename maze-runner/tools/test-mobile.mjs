/* Prueba de controles táctiles en horizontal (landscape).
   Uso: node tools/test-mobile.mjs (con el servidor en :8010) */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:8010/index.html';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });

let fails = 0;
const t = (n, ok, x = '') => { console.log(`${ok ? '✅' : '❌'} ${n} ${x}`); if (!ok) fails++; };

t('Controles táctiles visibles en móvil', await page.evaluate(() => !document.getElementById('touch').classList.contains('hidden')));

await page.type('#inpName', 'Movil');
await page.click('#btnStart');
await page.waitForFunction(() => window.__maze.game.state === 'play', { timeout: 6000 });
t('La partida arranca en móvil', true);

// joystick (zona izquierda)
const before = await page.evaluate(() => ({ x: window.__maze.game.player.x, y: window.__maze.game.player.y }));
await page.touchscreen.touchStart(80, 330);
await wait(120);
await page.touchscreen.touchMove(80, 270);
await wait(900);
await page.touchscreen.touchEnd();
const after = await page.evaluate(() => ({ x: window.__maze.game.player.x, y: window.__maze.game.player.y }));
const dist = Math.hypot(after.x - before.x, after.y - before.y);
t('El joystick mueve al corredor', dist > 0.5, `desplazamiento ${dist.toFixed(2)}`);

// arrastre para mirar
const d0 = await page.evaluate(() => window.__maze.game.player.dir);
await page.touchscreen.touchStart(600, 200);
await wait(80);
await page.touchscreen.touchMove(450, 200);
await wait(250);
await page.touchscreen.touchEnd();
const d1 = await page.evaluate(() => window.__maze.game.player.dir);
t('Arrastrar gira la cámara', Math.abs(d1 - d0) > 0.1, `Δdir ${(d1 - d0).toFixed(3)}`);

// botones
const f0 = await page.evaluate(() => window.__maze.game.player.flashOn);
await page.tap('#btnFlash');
await wait(200);
const f1 = await page.evaluate(() => window.__maze.game.player.flashOn);
t('Botón de linterna', f0 !== f1, `${f0} -> ${f1}`);

const fl0 = await page.evaluate(() => window.__maze.game.player.flares);
await page.tap('#btnFlare');
await wait(200);
const fl1 = await page.evaluate(() => ({ flares: window.__maze.game.player.flares, activas: window.__maze.game.flares.length }));
t('Botón de bengala', fl1.flares === fl0 - 1 && fl1.activas >= 1, JSON.stringify(fl1));

await page.tap('#btnPause');
await wait(250);
t('Botón de pausa', await page.evaluate(() => window.__maze.game.state === 'paused' && !document.getElementById('panelPause').classList.contains('hidden')));
await page.tap('#btnResume');
await wait(150);

// aviso de girar el móvil en vertical
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await wait(300);
await page.evaluate(() => { window.__maze.game.quit(); window.__maze.ui.showPanel('panelTitle'); });
await wait(150);
await page.click('#btnStart');
await wait(800);
const rotDisp = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
t('Aviso "gira el móvil" en vertical', rotDisp !== 'none', `display=${rotDisp}`);

console.log(errors.length ? '\n❌ ERRORES JS: ' + errors.join(' | ') : '\n✅ 0 errores JS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
