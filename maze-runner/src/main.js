/* =============================================================
   Maze Runner Mobile — arranque
   ============================================================= */

import { Game } from './game.js';
import { UI } from './ui.js';

const game = new Game();
const ui = new UI(game);

// utilidades de depuración
window.__maze = { game, ui };
