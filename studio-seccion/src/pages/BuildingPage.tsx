import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDING_W, buildingParts, FLAT_D, FLAT_W, FLATS, FLOOR_TO_FLOOR, FLOORS, type FlatStatus, type FlatUnit } from '../demo/residencial';
import { hrefFor, navigate } from '../router';
import { MaterialSet } from '../viewer/materials';
import { AMBIENTS, Atmosphere, Ground, PartsGroup, hasWebGL } from '../viewer/SceneCanvas';
import { RenderLoop } from '../viewer/render';
import type { SceneDef } from '../viewer/sceneDef';
import { detectQuality } from '../viewer/store';

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const STATUS: Record<FlatStatus, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: '#7fc79a' },
  reservado: { label: 'Reservado', color: '#e3b45c' },
  vendido: { label: 'Vendido', color: '#9a9a9a' },
};

const CENTER = new Vector3(BUILDING_W / 2, (FLOORS * FLOOR_TO_FLOOR) / 2, FLAT_D / 2);

/** Definición mínima para reutilizar la atmósfera y el terreno del visor. */
function sceneStub(): SceneDef {
  return {
    id: 'residencial',
    kind: 'demo',
    title: 'Residencial Alameda',
    center: [CENTER.x, CENTER.y, CENTER.z],
    radius: 26,
    groundY: -0.02,
    lights: [],
    groundColor: '#4a5a44',
  } as unknown as SceneDef;
}

function OrbitRig({ focus }: { focus: FlatUnit | null }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const goal = useRef<{ target: Vector3; pos: Vector3 } | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.minDistance = 10;
    c.maxDistance = 60;
    c.maxPolarAngle = Math.PI / 2 - 0.03;
    c.target.copy(CENTER);
    const onChange = () => invalidate();
    c.addEventListener('change', onChange);
    controls.current = c;
    invalidate();
    return () => {
      c.removeEventListener('change', onChange);
      c.dispose();
    };
  }, [camera, gl, invalidate]);
  useEffect(() => {
    if (!focus) {
      goal.current = { target: CENTER.clone(), pos: new Vector3(BUILDING_W / 2 + 15, 7, FLAT_D + 17) };
    } else {
      const t = new Vector3(focus.originX + FLAT_W / 2, focus.level + 1.4, FLAT_D);
      goal.current = { target: t, pos: new Vector3(t.x + (focus.letter === 'A' ? -6 : 6), Math.max(2, t.y + 1.5), FLAT_D + 15) };
    }
    invalidate();
  }, [focus, invalidate]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.1));
      c.target.lerp(g.target, k);
      camera.position.lerp(g.pos, k);
      if (c.target.distanceTo(g.target) < 0.02 && camera.position.distanceTo(g.pos) < 0.05) goal.current = null;
      invalidate();
    }
    if (c.update()) invalidate();
    (camera as PerspectiveCamera).fov = MathUtils.clamp((camera as PerspectiveCamera).fov, 30, 70);
  });
  return null;
}

function FlatVolumes({
  selected,
  hovered,
  showStatus,
  onHover,
  onPick,
}: {
  selected: string | null;
  hovered: string | null;
  showStatus: boolean;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {FLATS.map((f) => {
        const active = f.id === selected || f.id === hovered;
        const opacity = f.id === selected ? 0.42 : f.id === hovered ? 0.3 : showStatus ? 0.2 : 0;
        const color = active ? '#e0a877' : STATUS[f.status].color;
        return (
          <mesh
            key={f.id}
            position={[f.originX + FLAT_W / 2, f.level + 1.35, FLAT_D / 2]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(f.id);
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              onPick(f.id);
            }}
          >
            <boxGeometry args={[FLAT_W + 0.36, 2.72, FLAT_D + 0.36]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

export default function BuildingPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(true);
  const [filter, setFilter] = useState<'todos' | 'disponible'>('todos');
  const quality = useMemo(() => detectQuality(), []);
  const def = useMemo(() => sceneStub(), []);
  const materials = useMemo(() => new MaterialSet({ interiorWall: 'blanco-roto', exteriorWall: 'revoco-marfil', floor: 'roble' }, '#4a5a44'), []);
  const parts = useMemo(() => buildingParts().parts, []);
  const webgl = useMemo(() => hasWebGL(), []);
  useEffect(() => () => materials.dispose(), [materials]);
  const unit = FLATS.find((f) => f.id === selected) ?? null;
  const list = FLATS.filter((f) => filter === 'todos' || f.status === 'disponible').sort((a, b) => b.floor - a.floor || a.letter.localeCompare(b.letter));
  const dusk = AMBIENTS.dusk;

  return (
    <div className="building" data-testid="edificio">
      <div className="building__stage">
        {webgl ? (
          <Canvas
            frameloop="demand"
            shadows={quality === 'baja' ? false : 'percentage'}
            dpr={quality === 'alta' ? [1, 2] : quality === 'media' ? [1, 1.5] : 1}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ fov: 50, near: 0.3, far: 1200, position: [BUILDING_W / 2 + 15, 7, FLAT_D + 17] }}
            onPointerMissed={() => setSelected(null)}
          >
            <Atmosphere def={def} preset="dusk" quality={quality} interiorOn />
            <RenderLoop
              quality={quality}
              title="Residencial Alameda"
              photoSky={{ top: dusk.top, mid: dusk.mid, horizon: dusk.horizon, ground: dusk.hemiGround, hdri: 'sunset', envIntensity: dusk.env * 1.3 }}
            />
            <OrbitRig focus={unit} />
            <PartsGroup parts={parts} materials={materials} />
            <Ground def={def} materials={materials} />
            <FlatVolumes selected={selected} hovered={hovered} showStatus={showStatus} onHover={setHovered} onPick={setSelected} />
          </Canvas>
        ) : (
          <p className="viewer__nowebgl">Este dispositivo no puede mostrar la vista 3D. Puedes consultar la lista de viviendas.</p>
        )}
      </div>

      <header className="vbar building__bar">
        <a className="vbar__back" href={hrefFor({ name: 'portada' })}>
          ← <span>Studio Sección</span>
        </a>
        <span className="vbar__title">Residencial Alameda</span>
        <span className="tag">Promoción de ejemplo</span>
        <label className="toggle building__toggle">
          <input type="checkbox" checked={showStatus} data-testid="ver-disponibilidad" onChange={(e) => setShowStatus(e.target.checked)} />
          Disponibilidad
        </label>
      </header>

      <aside className="building__panel" data-testid="lista-pisos">
        {unit ? (
          <div className="flat-detail" data-testid="detalle-piso">
            <button type="button" className="link" onClick={() => setSelected(null)}>
              ← Todas las viviendas
            </button>
            <p className="mono flat-detail__kicker">Planta {unit.floor} · {unit.orientation}</p>
            <h2>{unit.label}</h2>
            <p className="flat-detail__price">{euros(unit.price)}</p>
            <ul className="flat-detail__facts">
              <li>
                <b>{unit.area}</b> m² construidos
              </li>
              <li>
                <b>{unit.bedrooms}</b> dormitorios
              </li>
              <li>
                <b>{unit.bathrooms}</b> baño
              </li>
              <li>Balcón de 7,9 m²</li>
            </ul>
            <p className="flat-detail__status" style={{ color: STATUS[unit.status].color }}>
              ● {STATUS[unit.status].label}
            </p>
            <div className="flat-detail__actions">
              <button type="button" className="btn btn--light" data-testid="entrar-piso" onClick={() => navigate({ name: 'piso', id: unit.id })}>
                Entrar al piso
              </button>
            </div>
            <p className="panel__hint">Datos, precios y disponibilidad de ejemplo. El recorrido incluye mobiliario ilustrativo.</p>
          </div>
        ) : (
          <>
            <div className="building__head">
              <p className="mono flat-detail__kicker">12 viviendas · 6 plantas</p>
              <h2>Elige tu piso</h2>
              <p className="panel__hint">Toca una vivienda en el edificio o en la lista para verla de cerca y entrar.</p>
              <div className="chips" role="group" aria-label="Filtro">
                <button type="button" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>
                  Todas
                </button>
                <button type="button" aria-pressed={filter === 'disponible'} onClick={() => setFilter('disponible')}>
                  Disponibles
                </button>
              </div>
            </div>
            <ul className="flat-list">
              {list.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flat-row"
                    data-testid={`piso-${f.id}`}
                    data-hover={hovered === f.id}
                    onMouseEnter={() => setHovered(f.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(f.id)}
                  >
                    <span className="flat-row__label">{f.label}</span>
                    <span className="flat-row__meta">
                      {f.area} m² · {f.bedrooms} dorm.
                    </span>
                    <span className="flat-row__price">{f.status === 'vendido' ? '—' : euros(f.price)}</span>
                    <span className="flat-row__dot" style={{ background: STATUS[f.status].color }} title={STATUS[f.status].label} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
