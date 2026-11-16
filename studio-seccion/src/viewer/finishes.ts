/**
 * Acabados predefinidos. El color vive en el material (no en la textura), de
 * modo que cambiar de acabado no exige regenerar ni «hornear» nada.
 */
export type TextureKind = 'plaster' | 'concrete' | 'planks' | 'boards-vertical' | 'terrazzo' | 'none';

export interface FinishPreset {
  id: string;
  label: string;
  color: string;
  texture: TextureKind;
  /** Metros que cubre una repetición de la textura. */
  tile: number;
  roughness: number;
}

export const INTERIOR_WALL_FINISHES: FinishPreset[] = [
  { id: 'blanco-roto', label: 'Blanco roto', color: '#efe9de', texture: 'plaster', tile: 2.4, roughness: 0.94 },
  { id: 'arcilla', label: 'Arcilla', color: '#d6bfa6', texture: 'plaster', tile: 2.4, roughness: 0.96 },
  { id: 'gris-niebla', label: 'Gris niebla', color: '#c5c9c9', texture: 'plaster', tile: 2.4, roughness: 0.94 },
];

export const EXTERIOR_WALL_FINISHES: FinishPreset[] = [
  { id: 'revoco-marfil', label: 'Revoco marfil', color: '#e6dfd1', texture: 'plaster', tile: 3, roughness: 0.97 },
  { id: 'hormigon-visto', label: 'Hormigón visto', color: '#a3a19b', texture: 'concrete', tile: 3, roughness: 0.9 },
  { id: 'madera-oscura', label: 'Madera oscura', color: '#5a4636', texture: 'boards-vertical', tile: 1.6, roughness: 0.85 },
];

export const FLOOR_FINISHES: FinishPreset[] = [
  { id: 'roble', label: 'Roble natural', color: '#c39a6b', texture: 'planks', tile: 2.4, roughness: 0.62 },
  { id: 'microcemento', label: 'Microcemento', color: '#b4b1aa', texture: 'concrete', tile: 3.2, roughness: 0.55 },
  { id: 'terrazo', label: 'Terrazo claro', color: '#ddd6c9', texture: 'terrazzo', tile: 1.6, roughness: 0.42 },
];

export const findFinish = (list: FinishPreset[], id: string): FinishPreset =>
  list.find((f) => f.id === id) ?? list[0];
