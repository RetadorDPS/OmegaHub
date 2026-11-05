/* Verifica MazeRunner.html abriéndolo con file:// (sin servidor, sin red).
   Uso: node tools/test-singlefile.mjs  */
import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const file = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'MazeRunner.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 420 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });

await page.goto(file, { waitUntil: 'domcontentloaded' });
await wait(500);

let fails = 0;
const t = (n, ok, x = '') => { console.log(`${ok ? '✅' : '❌'} ${n} ${x}`); if (!ok) fails++; };

t('Arranca sin servidor (file://)', await page.evaluate(() => !!window.__maze && !!window.__maze.game));

await page.evaluate(() => { document.getElementById('inpName').value = 'ArchivoUnico'; });
await page.click('#btnStart');
await page.waitForFunction(() => window.__maze.game.state === 'play', { timeout: 6000 }).catch(() => {});
await wait(500);

const st = await page.evaluate(() => {
  const g = window.__maze.game;
  const cv = document.getElementById('view');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1;
  return { state: g.state, seed: g.seed, mean: +(s / (d.length / 4)).toFixed(1), grievers: g.grievers.length, items: g.items.length };
});
t('La partida corre y dibuja en pantalla', st.state === 'play' && st.mean > 5, JSON.stringify(st));

console.log(errors.length ? '\n❌ ERRORES: ' + errors.join(' | ') : '\n✅ 0 errores JS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
