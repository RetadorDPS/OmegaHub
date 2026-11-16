/**
 * Recorrido guiado de Casa Mirador: de la escala del paisaje a la íntima.
 * Exterior → acercamiento → terraza → salón → dormitorio.
 *
 * Los tramos interiores pasan por el centro de la corredera de la terraza
 * (x 5,5–7,9 en z = 6,4), del paso salón–entrada (z 4,68–5,63 en x = 4,4) y de
 * la puerta del dormitorio (x 3,0–3,9 en z = 3,8). `tour.test.ts` lo comprueba
 * contra las colisiones reales.
 */
import type { Tour } from '../viewer/tour';

const EYE = 1.6;
const DECK_EYE = 1.57;

export const demoTour: Tour = {
  stops: [
    {
      id: 'exterior',
      chapter: 'Exterior',
      label: 'Casa Mirador · ladera sur',
      note: 'La casa en su parcela, al caer la tarde.',
      pose: { pos: [25, 9.5, 31], look: [6.6, 1.0, 4.6] },
      onFoot: false,
    },
    {
      id: 'acercamiento',
      chapter: 'Acercamiento',
      label: 'Fachada sur',
      note: 'El alero protege la terraza y la cristalera del salón.',
      pose: { pos: [12.8, 3.1, 17.2], look: [7.4, 1.35, 5.2] },
      onFoot: false,
    },
    {
      id: 'terraza',
      chapter: 'Terraza',
      label: 'Terraza · acceso',
      note: 'La corredera abierta une la tarima exterior con el salón.',
      pose: { pos: [7.25, DECK_EYE, 9.7], look: [7.2, 1.38, 3.0] },
      onFoot: true,
    },
    {
      id: 'salon',
      chapter: 'Salón',
      label: 'Salón · cocina',
      note: 'Estar, comedor y cocina en un solo espacio de 46 m².',
      pose: { pos: [6.35, EYE, 5.0], look: [10.4, 1.05, 2.4] },
      onFoot: true,
    },
    {
      id: 'dormitorio',
      chapter: 'Dormitorio',
      label: 'Dormitorio',
      note: 'Orientado a poniente, con salida visual al jardín.',
      pose: { pos: [3.36, EYE, 3.02], look: [1.2, 1.22, 0.9] },
      onFoot: true,
    },
  ],
  legs: [
    {
      kind: 'path',
      seconds: 7,
      via: [[19.5, 6.4, 24.5]],
      lookVia: [[7.0, 1.2, 5.0]],
    },
    {
      kind: 'path',
      seconds: 6.5,
      via: [[9.6, 2.05, 13.2]],
      lookVia: [[7.3, 1.4, 4.2]],
    },
    {
      kind: 'path',
      seconds: 6,
      via: [
        [6.8, 1.585, 7.6],
        [6.6, EYE, 6.2],
      ],
      lookVia: [
        [7.4, 1.35, 2.6],
        [9.2, 1.2, 2.4],
      ],
    },
    {
      kind: 'path',
      seconds: 9,
      via: [
        [5.45, EYE, 5.15],
        [4.4, EYE, 5.15],
        [3.72, EYE, 4.86],
        [3.45, EYE, 4.3],
        [3.45, EYE, 3.8],
        [3.4, EYE, 3.3],
      ],
      lookVia: [
        [6.6, 1.2, 3.4],
        [2.6, 1.45, 5.2],
        [1.6, 1.4, 4.9],
        [3.3, 1.4, 3.2],
        [3.2, 1.3, 1.6],
        [1.7, 1.25, 1.1],
      ],
    },
  ],
};

/** Encuadres por etapa de obra (cámara en órbita, fuera de la casa). */
export const demoStagePoses: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [6, 21, 13.5], look: [6, 0, 4.4] },
  { pos: [18.5, 9.5, 19], look: [6.2, 0.2, 4.4] },
  { pos: [18, 7.2, 18.5], look: [6.4, 1.2, 4.2] },
  { pos: [17.5, 6.2, 18.5], look: [6.4, 1.3, 4.2] },
  { pos: [15.5, 4.6, 17.5], look: [6.8, 1.3, 4.6] },
];
