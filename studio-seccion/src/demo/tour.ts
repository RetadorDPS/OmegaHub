/**
 * Recorrido guiado de Villa Mirador: de la parcela al dormitorio.
 * Exterior → acercamiento → terraza → salón → cocina → dormitorio principal.
 *
 * Los tramos a pie bordean la piscina por el oeste, entran por el centro de la
 * corredera (x 13,3–16,1 en z = 8), cruzan el paso al pasillo (z 4,7–5,9 en
 * x = 9) y la puerta del dormitorio (x 4,05–4,95 en z = 4,6). `tour.test.ts`
 * lo comprueba contra las colisiones reales.
 */
import type { Tour } from '../viewer/tour';

const EYE = 1.6;
const DECK_EYE = 1.57;

export const demoTour: Tour = {
  stops: [
    {
      id: 'exterior',
      chapter: 'Exterior',
      label: 'Villa Mirador · parcela',
      note: 'Una planta en L abierta a la piscina, al caer la tarde.',
      pose: { pos: [34, 13, 33], look: [11.5, 0.5, 7.5] },
      onFoot: false,
    },
    {
      id: 'acercamiento',
      chapter: 'Acercamiento',
      label: 'Jardín sur',
      note: 'El voladizo protege la terraza y los ventanales del salón.',
      pose: { pos: [7.6, 2.0, 22.5], look: [13.5, 1.2, 9.5] },
      onFoot: false,
    },
    {
      id: 'terraza',
      chapter: 'Terraza',
      label: 'Terraza · piscina',
      note: 'La corredera abierta une la terraza con el salón.',
      pose: { pos: [14.7, DECK_EYE, 10.15], look: [14.7, 1.35, 3.5] },
      onFoot: true,
    },
    {
      id: 'salon',
      chapter: 'Salón',
      label: 'Salón · chimenea',
      note: 'Estar, comedor y cocina en 88 m² continuos.',
      pose: { pos: [14.0, EYE, 6.3], look: [19.6, 1.1, 4.6] },
      onFoot: true,
    },
    {
      id: 'cocina',
      chapter: 'Cocina',
      label: 'Cocina · isla',
      note: 'Isla de piedra con barra para cuatro y lucernario cenital.',
      pose: { pos: [13.0, EYE, 4.3], look: [16.5, 1.0, 1.2] },
      onFoot: true,
    },
    {
      id: 'dormitorio',
      chapter: 'Dormitorio',
      label: 'Dormitorio principal',
      note: 'Con baño propio y vistas al jardín norte.',
      pose: { pos: [4.3, EYE, 3.7], look: [1.2, 1.0, 2.3] },
      onFoot: true,
    },
  ],
  legs: [
    { kind: 'path', seconds: 7, via: [[22, 7.5, 31]], lookVia: [[12, 0.8, 8]] },
    {
      kind: 'path',
      seconds: 8,
      via: [
        [9.9, 1.75, 17.4],
        [10.2, 1.64, 13.2],
        [10.3, 1.6, 11.3],
        [10.9, 1.58, 10.35],
      ],
      lookVia: [
        [13, 1.2, 9],
        [13.8, 1.25, 7],
        [14.2, 1.3, 5.5],
        [14.5, 1.35, 4.5],
      ],
    },
    {
      kind: 'path',
      seconds: 6,
      via: [
        [14.7, 1.585, 9.0],
        [14.7, EYE, 7.3],
      ],
      lookVia: [
        [14.8, 1.3, 4.5],
        [17.5, 1.2, 4.6],
      ],
    },
    { kind: 'path', seconds: 4.5, via: [[13.4, EYE, 5.3]], lookVia: [[16.5, 1.1, 3.2]] },
    {
      kind: 'path',
      seconds: 11,
      via: [
        [11.6, EYE, 4.9],
        [10.0, EYE, 5.3],
        [8.6, EYE, 5.3],
        [6.0, EYE, 5.3],
        [4.6, EYE, 5.1],
        [4.5, EYE, 4.4],
      ],
      lookVia: [
        [9, 1.4, 5.3],
        [6, 1.45, 5.3],
        [4, 1.4, 5.2],
        [4.3, 1.3, 3.8],
        [3, 1.2, 2.8],
        [1.8, 1.05, 2.4],
      ],
    },
  ],
};

/** Encuadres por etapa de obra (cámara en órbita, fuera de la casa). */
export const demoStagePoses: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [10.5, 34, 22], look: [10.5, 0, 6.5] },
  { pos: [32, 15, 30], look: [10.5, 0.2, 6.5] },
  { pos: [31, 11, 29], look: [10.5, 1.3, 6] },
  { pos: [30, 9, 29], look: [10.5, 1.4, 6.5] },
  { pos: [27, 6, 28], look: [12, 1.3, 8] },
];
