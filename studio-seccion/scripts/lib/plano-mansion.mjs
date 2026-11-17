// Mansión de una planta en U alrededor de un patio con piscina (28 × 18 m, 440 m²).
// Datos compartidos por el generador del PDF y por la prueba que comprueba que
// el modelo trazado sobre este plano se genera y se puede recorrer.
// Coordenadas en metros: x hacia la derecha, y hacia abajo (norte arriba).

export const EXT = 0.3;
export const INT = 0.15;

/** Muros: [id, ax, ay, bx, by, grosor]. */
export const MUROS = [
  // Perímetro en U (abierto al patio por el sur).
  ['n', 0, 0, 28, 0, EXT],
  ['e', 28, 0, 28, 18, EXT],
  ['s-este', 28, 18, 18, 18, EXT],
  ['patio-e', 18, 18, 18, 10, EXT],
  ['patio-n', 18, 10, 10, 10, EXT],
  ['patio-o', 10, 10, 10, 18, EXT],
  ['s-oeste', 10, 18, 0, 18, EXT],
  ['o', 0, 18, 0, 0, EXT],
  // Tabiques.
  ['cocina-vest', 10, 0, 10, 10, INT],
  ['cocina-fam', 0, 5, 10, 5, INT],
  ['vest-comedor', 10, 5, 18, 5, INT],
  ['vest-salon', 18, 0, 18, 10, INT],
  ['fam-dorm', 0, 10, 10, 10, INT],
  ['dorm2-dorm3', 5, 10, 5, 18, INT],
  ['salon-suite', 18, 10, 28, 10, INT],
  ['suite-bano', 25, 10, 25, 18, INT],
  ['aseo-o', 15.5, 0, 15.5, 3, INT],
  ['aseo-s', 15.5, 3, 18, 3, INT],
];

/** Huecos: [muro, tipo, distancia del inicio del muro al centro, ancho]. */
export const HUECOS = [
  ['n', 'ventana', 3.5, 3.0],
  ['n', 'puerta', 14.0, 1.4],
  ['n', 'ventana', 16.75, 0.8],
  ['n', 'ventana', 21.5, 3.0],
  ['n', 'ventana', 25.75, 2.5],
  ['e', 'ventana', 5.0, 4.0],
  ['e', 'ventana', 15.75, 1.5],
  ['s-este', 'ventana', 6.5, 4.0],
  ['s-este', 'ventana', 1.5, 1.2],
  ['patio-e', 'ventana', 4.0, 4.0],
  ['patio-n', 'puerta', 4.0, 3.0],
  ['patio-o', 'ventana', 4.0, 4.0],
  ['s-oeste', 'ventana', 2.5, 2.0],
  ['s-oeste', 'ventana', 7.5, 2.0],
  ['o', 'ventana', 4.5, 3.0],
  ['o', 'ventana', 10.5, 3.0],
  ['o', 'ventana', 15.5, 2.0],
  ['cocina-vest', 'puerta', 2.5, 0.9],
  ['cocina-vest', 'puerta', 7.5, 2.0],
  ['cocina-fam', 'puerta', 7.0, 0.9],
  ['vest-comedor', 'puerta', 4.0, 4.0],
  ['vest-salon', 'puerta', 4.0, 1.7],
  ['vest-salon', 'puerta', 7.5, 3.0],
  ['fam-dorm', 'puerta', 3.5, 0.9],
  ['fam-dorm', 'puerta', 6.5, 0.9],
  ['salon-suite', 'puerta', 3.5, 1.0],
  ['suite-bano', 'puerta', 2.0, 0.8],
  ['aseo-s', 'puerta', 1.25, 0.8],
];

/** Estancias: [nombre, x, y del rótulo y del punto de cámara]. */
export const ESTANCIAS = [
  ['Vestíbulo', 12.8, 2.4],
  ['Aseo', 16.75, 1.5],
  ['Cocina', 5.0, 2.6],
  ['Sala familiar', 3.0, 7.6],
  ['Comedor', 14.0, 7.6],
  ['Salón', 23.0, 5.4],
  ['Dormitorio principal', 21.5, 14.0],
  ['Baño principal', 26.5, 12.6],
  ['Dormitorio 2', 2.5, 14.5],
  ['Dormitorio 3', 7.5, 14.5],
];

/** Referencia de escala: el muro oeste de la cocina y la sala familiar mide 10,00 m entre ejes. */
export const REFERENCIA_MANSION = { a: [0, 0], b: [0, 10], metros: 10 };
