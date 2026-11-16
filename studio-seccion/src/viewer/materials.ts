/**
 * Registro de materiales PBR del visor. Cada escena tiene el suyo para poder
 * cambiar acabados sin afectar a otras y liberar memoria al salir.
 */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Texture,
} from 'three';
import type { Finishes } from '../model/types';
import type { MatKey } from '../generate/parts';
import {
  EXTERIOR_WALL_FINISHES,
  FLOOR_FINISHES,
  INTERIOR_WALL_FINISHES,
  findFinish,
  type FinishPreset,
} from './finishes';
import {
  artTexture,
  blueprintTexture,
  concreteTexture,
  deckTexture,
  finishTexture,
  grassTexture,
  gravelTexture,
  soffitTexture,
} from './textures';

interface Spec {
  color: string;
  roughness?: number;
  metalness?: number;
  map?: () => Texture;
  emissive?: string;
  emissiveIntensity?: number;
  flat?: boolean;
}

const SPECS: Partial<Record<MatKey, Spec>> = {
  'wall-raw': { color: '#cfc9bd', roughness: 1 },
  'wall-cap': { color: '#d8d2c6', roughness: 0.95 },
  concrete: { color: '#a5a29b', roughness: 0.9, map: concreteTexture },
  'concrete-dark': { color: '#6b6a67', roughness: 0.9, map: concreteTexture },
  frame: { color: '#27231f', roughness: 0.45, metalness: 0.55 },
  door: { color: '#9a7652', roughness: 0.6 },
  stud: { color: '#dcb886', roughness: 0.8 },
  roof: { color: '#303236', roughness: 0.85 },
  'roof-raw': { color: '#8a8780', roughness: 0.95 },
  soffit: { color: '#a8794f', roughness: 0.7, map: soffitTexture },
  ceiling: { color: '#f2ede3', roughness: 0.96 },
  deck: { color: '#99745a', roughness: 0.72, map: deckTexture },
  ground: { color: '#4a5a44', roughness: 1, map: grassTexture },
  gravel: { color: '#9a958a', roughness: 1, map: gravelTexture },
  paver: { color: '#bdb8ad', roughness: 0.9 },
  oak: { color: '#b98d5f', roughness: 0.55 },
  walnut: { color: '#5f4535', roughness: 0.5 },
  white: { color: '#ece7de', roughness: 0.5 },
  stone: { color: '#d6d1c7', roughness: 0.32 },
  black: { color: '#1d1d1f', roughness: 0.5, metalness: 0.35 },
  brass: { color: '#b89052', roughness: 0.32, metalness: 0.9 },
  steel: { color: '#bfc2c5', roughness: 0.28, metalness: 0.9 },
  fabric: { color: '#b7ab99', roughness: 1 },
  'fabric-dark': { color: '#4b4844', roughness: 1 },
  linen: { color: '#e8e1d4', roughness: 1 },
  sage: { color: '#7d8a76', roughness: 1 },
  terracotta: { color: '#b3674a', roughness: 0.9 },
  rug: { color: '#cbbfad', roughness: 1 },
  leaf: { color: '#55784a', roughness: 0.9, flat: true },
  'leaf-dark': { color: '#34503a', roughness: 0.9, flat: true },
  trunk: { color: '#4d3c30', roughness: 0.95 },
  pot: { color: '#8e8a83', roughness: 0.85 },
  glow: { color: '#fff1d6', emissive: '#ffcf8f', emissiveIntensity: 3.2, roughness: 0.6 },
  'glow-soft': { color: '#ffe9c4', emissive: '#ffc680', emissiveIntensity: 1.5, roughness: 0.6 },
  'art-a': { color: '#ffffff', roughness: 0.9, map: () => artTexture('a') },
  'art-b': { color: '#ffffff', roughness: 0.9, map: () => artTexture('b') },
  'book-a': { color: '#2f3a4a', roughness: 0.8 },
  'book-b': { color: '#c9b79a', roughness: 0.8 },
  'book-c': { color: '#8a4f3a', roughness: 0.8 },
};

/** Materiales cuya textura se repite por metros y necesitan UV en escala de mundo. */
export const WORLD_UV_MATS: ReadonlySet<MatKey> = new Set<MatKey>([
  'deck',
  'soffit',
  'gravel',
  'concrete',
  'concrete-dark',
  'roof',
]);

export class MaterialSet {
  private mats = new Map<MatKey, Material>();
  private owned: Texture[] = [];
  private finishes: Finishes;
  /** Color del terreno: la demo usa césped al atardecer; un proyecto propio, una base neutra. */
  groundColor: string;

  constructor(finishes: Finishes, groundColor = '#4a5a44') {
    this.finishes = finishes;
    this.groundColor = groundColor;
  }

  get(key: MatKey): Material {
    let m = this.mats.get(key);
    if (!m) {
      m = this.create(key);
      this.mats.set(key, m);
    }
    return m;
  }

  private own(t: Texture): Texture {
    const copy = t.clone();
    copy.needsUpdate = true;
    this.owned.push(copy);
    return copy;
  }

  private fromFinish(preset: FinishPreset): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color: preset.color, roughness: preset.roughness });
    this.applyFinish(m, preset);
    return m;
  }

  private applyFinish(m: MeshStandardMaterial, preset: FinishPreset) {
    m.color.set(preset.color);
    m.roughness = preset.roughness;
    const t = finishTexture(preset.texture, preset.tile);
    m.map = t ? this.own(t) : null;
    m.needsUpdate = true;
  }

  private create(key: MatKey): Material {
    switch (key) {
      case 'wall-int':
        return this.fromFinish(findFinish(INTERIOR_WALL_FINISHES, this.finishes.interiorWall));
      case 'wall-ext':
        return this.fromFinish(findFinish(EXTERIOR_WALL_FINISHES, this.finishes.exteriorWall));
      case 'floor':
        return this.fromFinish(findFinish(FLOOR_FINISHES, this.finishes.floor));
      case 'glass':
        return new MeshStandardMaterial({
          color: '#bcd3dc',
          roughness: 0.04,
          metalness: 0.1,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: DoubleSide,
          envMapIntensity: 2.2,
        });
      case 'chalk':
        return new MeshBasicMaterial({ color: '#f4f6fb', fog: false });
      case 'blueprint':
        return new MeshBasicMaterial({ color: '#ffffff', map: this.own(blueprintTexture()), fog: false });
      default: {
        const spec = SPECS[key];
        if (!spec) return new MeshStandardMaterial({ color: '#ff00ff' });
        const m = new MeshStandardMaterial({
          color: key === 'ground' ? this.groundColor : spec.color,
          roughness: spec.roughness ?? 0.8,
          metalness: spec.metalness ?? 0,
          flatShading: spec.flat ?? false,
        });
        if (spec.map) m.map = this.own(spec.map());
        if (spec.emissive) {
          m.emissive = new Color(spec.emissive);
          m.emissiveIntensity = spec.emissiveIntensity ?? 1;
        }
        return m;
      }
    }
  }

  /** Cambia acabados en caliente: solo color, rugosidad y mapa de detalle. */
  setFinishes(finishes: Finishes) {
    this.finishes = finishes;
    const apply = (key: MatKey, list: FinishPreset[], id: string) => {
      const m = this.mats.get(key);
      if (m) this.applyFinish(m as MeshStandardMaterial, findFinish(list, id));
    };
    apply('wall-int', INTERIOR_WALL_FINISHES, finishes.interiorWall);
    apply('wall-ext', EXTERIOR_WALL_FINISHES, finishes.exteriorWall);
    apply('floor', FLOOR_FINISHES, finishes.floor);
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.owned) t.dispose();
    this.mats.clear();
    this.owned = [];
  }
}
