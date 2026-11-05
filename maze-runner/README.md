# 🏃 Maze Runner Mobile — El Laberinto

Juego de supervivencia en primera persona para móvil, en **horizontal**, con
motor propio (raycaster en Canvas 2D, sin librerías ni dependencias de
ejecución). Vive en esta carpeta, aislado del resto del repositorio
(`OmegaHub`/`trendhunter-pro`, que no se toca).

## Cómo jugar

**Opción A — un solo archivo (sin servidor, sin internet):**
abre `MazeRunner.html` con doble clic, o pásalo al móvil y ábrelo con Chrome.

**Opción B — servidor local (recomendado para desarrollar):**

```bash
cd maze-runner
python3 -m http.server 8010
# abre http://localhost:8010 (o http://<IP-de-tu-PC>:8010 desde el móvil)
```

**Opción C — instalada como app (pantalla completa + horizontal forzado):**
aloja esta carpeta en un hosting con HTTPS (p. ej. GitHub Pages) y, desde
Chrome en Android, "Añadir a la pantalla de inicio". El `manifest.webmanifest`
fuerza `display: fullscreen` y `orientation: landscape`.

Tras cualquier cambio en `src/`, regenera el archivo único con:

```bash
node tools/build-single.mjs
```

## Objetivo

Sales de **El Área** (zona segura, muros colosales). Reúne los **3 códigos
CRUEL** (2 en superficie, 1 en el subsuelo) y llega a la **salida** —se
marca en verde en el minimapa cuando la conoces— antes de que te atrapen.
Al anochecer las 12 puertas se cierran: quédate dentro de un sector o en
El Área. Los Grievers patrullan, oyen si corres y persiguen si te ven; una
flecha roja en el HUD avisa cuando te persiguen.

## Controles

| Móvil | Escritorio | Acción |
|---|---|---|
| Joystick izquierdo | WASD / flechas | Moverse |
| Arrastrar en el resto de la pantalla | Ratón (clic para fijar el puntero) | Mirar |
| 🏃 / joystick a tope | Shift | Correr |
| 🔦 | F | Linterna |
| 🔥 | G | Bengala |
| ⚡ | E / Espacio | Interactuar (escotillas, salida) |
| ⏸ | Esc | Pausa |

## Arquitectura

```
maze-runner/
├── index.html / styles.css        HUD, menús y controles (horizontal)
├── manifest.webmanifest / sw.js   PWA instalable, offline
├── MazeRunner.html                generado por tools/build-single.mjs
├── src/
│   ├── rng.js        PRNG determinista (mulberry32) + semilla diaria
│   ├── config.js     backend Supabase por defecto
│   ├── storage.js    ranking local + ajustes + REST Supabase (con timeout)
│   ├── audio.js       SFX 100% procedurales (WebAudio)
│   ├── textures.js   16 texturas 128 px + sprites, procedurales
│   ├── world.js       generación del laberinto (3×3 bloques, puertas, IA)
│   ├── player.js      movimiento con asistencia, stamina, linterna
│   ├── entities.js    Grievers (IA), objetos, bengalas
│   ├── render.js      raycaster: alturas por bioma, niebla, sprites
│   ├── minimap.js      minimapa con niebla de guerra
│   ├── input.js        táctil / teclado / ratón
│   ├── ui.js            menús, HUD, ranking, ajustes
│   └── game.js          bucle, ciclo día/noche, reglas
├── Backend/Supabase/supabase_schema.sql
└── tools/               build-single.mjs + tests (ver abajo)
```

## Backend Supabase (opcional)

El ranking y la semilla diaria funcionan contra Supabase si hay conexión;
si no, el juego sigue jugando con ranking local y una semilla diaria
calculada por fecha (`src/rng.js:dailySeed`). Nunca bloquea el arranque
(todas las llamadas tienen un tope de 2–4 s). Esquema completo en
`Backend/Supabase/supabase_schema.sql`; la URL/clave por defecto están en
`src/config.js` y se pueden sustituir desde el propio juego (panel
"Supabase" en el menú).

## Tests

```bash
npm install puppeteer-core          # una vez (usa el Chrome ya instalado)
python3 -m http.server 8010 &       # para los tests que necesitan servidor
node tools/test-world.mjs           # generación: conectividad, puertas, campo de flujo
node tools/test-gameplay.mjs        # humo en navegador real + 9 mecánicas
node tools/test-mobile.mjs          # controles táctiles en horizontal
node tools/test-singlefile.mjs      # MazeRunner.html abriendo con file://
```

Todos en verde: generación en 6 semillas, 9/9 mecánicas, controles táctiles
y archivo único, 0 errores de JS.

## Notas de esta reconstrucción

Este juego se reconstruyó desde cero en este repositorio a partir de una
especificación completa (algoritmos, constantes y arquitectura), no copiando
archivos de una sesión anterior. Al hacerlo se encontró y corrigió un bug
real de generación (el punto de aparición coincidía con un obstáculo
decorativo en el centro de El Área, dejando el laberinto inalcanzable) y
dos colisiones de nombres al empaquetar el archivo único — ambos cubiertos
ahora por `tools/test-world.mjs` y por una guardia de colisiones en
`tools/build-single.mjs`.

No incluidos en esta vuelta (quedan como siguiente paso si se quieren):
ilustraciones generadas por IA, bloom/post-proceso, mano con linterna en
primera persona, port a Unity, y el empaquetado a APK con Capacitor.
