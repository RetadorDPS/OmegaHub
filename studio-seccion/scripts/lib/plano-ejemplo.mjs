// Geometría del plano de prueba, compartida por el generador y las pruebas.
// Coordenadas del dibujo en píxeles: x = OX + metros · S, y = OY + metros · S.
export const PLANO = { W: 900, H: 800, S: 70, OX: 150, OY: 120 };

/** Fracción (0–1) de la página para un punto en metros del plano. */
export const fraccion = (mx, my) => ({
  fx: (PLANO.OX + mx * PLANO.S) / PLANO.W,
  fy: (PLANO.OY + my * PLANO.S) / PLANO.H,
});

/** Contorno en L (metros), en el orden en que lo traza la prueba. */
export const CONTORNO = [
  [0, 0],
  [8, 0],
  [8, 4],
  [4, 4],
  [4, 7],
  [0, 7],
];
/** Extremos de la cota de referencia de 4,00 m (muro este). */
export const REFERENCIA = { a: [8, 0], b: [8, 4], metros: 4 };
/** Tabique interior de 4 m y centro de su puerta. */
export const TABIQUE = { a: [4, 0], b: [4, 4], puerta: [4, 2] };
