import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type PerspectiveCamera,
  type PointLight,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { formatMeters } from '../model/geometry';
import type { Layer, MatKey, Part } from '../generate/parts';
import { wallRotationY, type WallLayout } from '../generate/walls';
import type { ViewerController } from './controller';
import { MaterialSet, WORLD_UV_MATS } from './materials';
import { finalLayers, type LightingPreset, type SceneDef } from './sceneDef';
import { prefersReducedMotion, useViewer, type Quality } from './store';
import { labelTexture } from './textures';

// ---------------------------------------------------------------------------
// Geometrías compartidas
// ---------------------------------------------------------------------------

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYL = new CylinderGeometry(0.5, 0.5, 1, 24);
const UNIT_SPHERE = new IcosahedronGeometry(0.5, 2);

/** Caja con UV en metros: la textura se repite por tamaño real, no se estira. */
function worldUVBox(sx: number, sy: number, sz: number): BoxGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  // Orden de caras de BoxGeometry: +x, −x, +y, −y, +z, −z (4 vértices cada una).
  const dims: [number, number][] = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[face][0], uv.getY(i) * dims[face][1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}

function useDisposable<T extends { dispose: () => void }>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(make, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

// ---------------------------------------------------------------------------
// Aparición por capas
// ---------------------------------------------------------------------------

type RevealKind = 'grow' | 'drop' | 'none';

function Reveal({
  name,
  visible,
  kind,
  pivotY = 0,
  children,
}: {
  name: string;
  visible: boolean;
  kind: RevealKind;
  pivotY?: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const k = useRef(visible ? 1 : 0);
  const invalidate = useThree((s) => s.invalidate);

  const apply = () => {
    const g = ref.current;
    if (!g) return;
    const e = 1 - Math.pow(1 - k.current, 3);
    g.visible = k.current > 0;
    if (kind === 'grow') {
      g.scale.y = Math.max(e, 1e-4);
      g.position.y = pivotY * (1 - e);
    } else if (kind === 'drop') {
      g.position.y = (1 - e) * 2.4;
    }
  };

  useLayoutEffect(() => {
    // Ocultar es inmediato: al retroceder no quedan restos de la etapa posterior.
    if (!visible || prefersReducedMotion() || kind === 'none') k.current = visible ? 1 : 0;
    apply();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useFrame((_, dt) => {
    if (visible && k.current < 1) {
      k.current = Math.min(1, k.current + Math.min(dt, 0.05) / 0.6);
      apply();
      invalidate();
    }
  });

  return (
    <group ref={ref} visible={visible} name={`capa:${name}`}>
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Piezas declarativas
// ---------------------------------------------------------------------------

function Instanced({
  parts,
  geometry,
  material,
  shadows,
}: {
  parts: Part[];
  geometry: BufferGeometry;
  material: Material;
  shadows: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scl = new Vector3();
    parts.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rotY ?? 0);
      m.compose(pos.set(...p.p), q, scl.set(...p.s));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      renderOrder={material.transparent ? 3 : 0}
    />
  );
}

function SinglePart({ part, material }: { part: Part; material: Material }) {
  const geometry = useDisposable<BufferGeometry>(
    () =>
      part.shape === 'rbox'
        ? new RoundedBoxGeometry(part.s[0], part.s[1], part.s[2], 3, Math.min(part.r ?? 0.02, Math.min(...part.s) / 2 - 1e-4))
        : worldUVBox(part.s[0], part.s[1], part.s[2]),
    [part],
  );
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={part.p}
      rotation-y={part.rotY ?? 0}
      castShadow={!part.noShadow}
      receiveShadow
    />
  );
}

function PartsGroup({ parts, materials }: { parts: Part[]; materials: MaterialSet }) {
  const { batches, singles } = useMemo(() => {
    const map = new Map<string, { parts: Part[]; shape: Part['shape']; mat: MatKey; shadows: boolean }>();
    const single: Part[] = [];
    for (const p of parts) {
      if (p.shape === 'rbox' || (p.shape === 'box' && WORLD_UV_MATS.has(p.mat))) {
        single.push(p);
        continue;
      }
      const key = `${p.shape}|${p.mat}|${p.noShadow ? 0 : 1}`;
      let b = map.get(key);
      if (!b) {
        b = { parts: [], shape: p.shape, mat: p.mat, shadows: !p.noShadow };
        map.set(key, b);
      }
      b.parts.push(p);
    }
    return { batches: [...map.entries()], singles: single };
  }, [parts]);
  return (
    <>
      {batches.map(([key, b]) => (
        <Instanced
          key={key}
          parts={b.parts}
          geometry={b.shape === 'cyl' ? UNIT_CYL : b.shape === 'sphere' ? UNIT_SPHERE : UNIT_BOX}
          material={materials.get(b.mat)}
          shadows={b.shadows}
        />
      ))}
      {singles.map((p, i) => (
        <SinglePart key={i} part={p} material={materials.get(p.mat)} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Muros y losa generados desde el modelo
// ---------------------------------------------------------------------------

function Walls({ layouts, materials, raw }: { layouts: WallLayout[]; materials: MaterialSet; raw: boolean }) {
  const items = useMemo(
    () =>
      layouts.map((layout) => ({
        layout,
        pieces: layout.pieces.map((piece) => ({
          piece,
          geometry: worldUVBox(piece.u1 - piece.u0, piece.y1 - piece.y0, layout.wall.thickness),
        })),
      })),
    [layouts],
  );
  useEffect(
    () => () => {
      for (const it of items) for (const p of it.pieces) p.geometry.dispose();
    },
    [items],
  );
  const cap = materials.get('wall-cap');
  const rawMat = materials.get('wall-raw');
  return (
    <>
      {items.map(({ layout, pieces }) => {
        const plus = raw ? rawMat : materials.get(layout.sidePlus === 'interior' ? 'wall-int' : 'wall-ext');
        const minus = raw ? rawMat : materials.get(layout.sideMinus === 'interior' ? 'wall-int' : 'wall-ext');
        const mats = raw ? [rawMat, rawMat, rawMat, rawMat, rawMat, rawMat] : [cap, cap, cap, cap, plus, minus];
        return (
          <group
            key={layout.wall.id}
            position={[layout.wall.a.x, 0, layout.wall.a.y]}
            rotation-y={wallRotationY(layout.dir)}
          >
            {pieces.map(({ piece, geometry }, i) => (
              <mesh
                key={i}
                geometry={geometry}
                material={mats}
                position={[(piece.u0 + piece.u1) / 2, (piece.y0 + piece.y1) / 2, 0]}
                castShadow
                receiveShadow
              />
            ))}
          </group>
        );
      })}
    </>
  );
}

function SlabMesh({ def, materials, finished }: { def: SceneDef; materials: MaterialSet; finished: boolean }) {
  const slab = def.project.slab;
  const geometry = useDisposable(() => {
    const shape = new Shape();
    const pts = slab && slab.points.length >= 3 ? slab.points : [];
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.y) : shape.lineTo(p.x, -p.y)));
    return new ExtrudeGeometry(shape, { depth: slab?.thickness ?? 0.25, bevelEnabled: false });
  }, [slab]);
  if (!slab || slab.points.length < 3) return null;
  const concrete = materials.get('concrete');
  return (
    <mesh
      geometry={geometry}
      // Tapas (grupo 0): pavimento cuando hay acabados. Cantos (grupo 1): hormigón.
      material={[finished ? materials.get('floor') : concrete, concrete]}
      rotation-x={-Math.PI / 2}
      position-y={-slab.thickness}
      receiveShadow
      castShadow
    />
  );
}

// ---------------------------------------------------------------------------
// Rótulos: cotas y nombres de estancia
// ---------------------------------------------------------------------------

function Label({ text, position, height = 0.42, flat = false, plain = false }: { text: string; position: [number, number, number]; height?: number; flat?: boolean; plain?: boolean }) {
  const { texture, aspect } = useMemo(
    () => labelTexture(text, plain ? { background: null, color: '#eef3fb', weight: 500 } : {}),
    [text, plain],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  if (flat) {
    return (
      <mesh position={position} rotation-x={-Math.PI / 2} renderOrder={4}>
        <planeGeometry args={[height * aspect, height]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
      </mesh>
    );
  }
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} fog={false} />
    </sprite>
  );
}

function ModelLabels({ def, dimensions }: { def: SceneDef; dimensions: boolean }) {
  const size = Math.max(0.36, def.radius * 0.055);
  return (
    <>
      {def.project.rooms.map((r) => (
        <Label key={r.id} text={r.name} position={[r.camera.x, 1.1, r.camera.y]} height={size * 1.1} />
      ))}
      {dimensions &&
        def.layouts
          .filter((l) => l.length >= 1)
          .map((l) => (
            <Label
              key={l.wall.id}
              text={formatMeters(l.length)}
              position={[
                (l.wall.a.x + l.wall.b.x) / 2,
                l.wall.height + size * 0.8,
                (l.wall.a.y + l.wall.b.y) / 2,
              ]}
              height={size * 0.8}
            />
          ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Atmósfera: cielo, niebla, luz ambiente y sol, con transición entre ambientes
// ---------------------------------------------------------------------------

interface Ambient {
  top: string;
  mid: string;
  horizon: string;
  fog: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  sunDir: [number, number, number];
  env: number;
  exposure: number;
  interior: number;
}

const AMBIENTS: Record<LightingPreset, Ambient> = {
  dusk: {
    top: '#0a1429',
    mid: '#2b426e',
    horizon: '#c08a72',
    fog: '#27344f',
    fogDensity: 0.0105,
    hemiSky: '#7f9bd4',
    hemiGround: '#2b2723',
    hemi: 0.5,
    sun: '#b3c4ff',
    sunI: 0.62,
    sunDir: [-0.5, 0.62, 0.6],
    env: 0.2,
    exposure: 1.0,
    interior: 1,
  },
  day: {
    top: '#6d99cf',
    mid: '#b9d0e6',
    horizon: '#eceeec',
    fog: '#d6dcde',
    fogDensity: 0.0055,
    hemiSky: '#e8effa',
    hemiGround: '#9d9482',
    hemi: 0.95,
    sun: '#fff1da',
    sunI: 2.5,
    sunDir: [0.52, 0.85, 0.5],
    env: 0.5,
    exposure: 0.92,
    interior: 0,
  },
  blueprint: {
    top: '#0f2a52',
    mid: '#123160',
    horizon: '#153969',
    fog: '#153969',
    fogDensity: 0,
    hemiSky: '#ffffff',
    hemiGround: '#cfd8ea',
    hemi: 1.1,
    sun: '#ffffff',
    sunI: 0.4,
    sunDir: [0.3, 1, 0.3],
    env: 0.2,
    exposure: 1,
    interior: 0,
  },
};

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.2, h));
  c = mix(c, uTop, smoothstep(0.12, 0.78, h));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function Atmosphere({
  def,
  preset,
  quality,
  interiorOn,
}: {
  def: SceneDef;
  preset: LightingPreset;
  quality: Quality;
  interiorOn: boolean;
}) {
  const { scene, gl, invalidate, camera } = useThree();
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const dome = useRef<Mesh>(null);
  const lights = useRef<(PointLight | null)[]>([]);
  const cur = useRef({ ...AMBIENTS[preset], interiorK: interiorOn ? 1 : 0 });
  const settled = useRef(false);
  const tmp = useMemo(() => new Color(), []);
  const hillMaterial = useDisposable(() => new MeshBasicMaterial({ color: '#1b2740' }), []);

  const skyMaterial = useDisposable(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color(AMBIENTS[preset].top) },
          uMid: { value: new Color(AMBIENTS[preset].mid) },
          uHorizon: { value: new Color(AMBIENTS[preset].horizon) },
        },
      }),
    [],
  );

  useEffect(() => {
    // Entorno neutro generado en local para los reflejos PBR (sin HDRI externos).
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.fog = new FogExp2(AMBIENTS[preset].fog, AMBIENTS[preset].fogDensity);
    gl.toneMapping = ACESFilmicToneMapping;
    gl.outputColorSpace = SRGBColorSpace;
    invalidate();
    return () => {
      scene.environment = null;
      scene.fog = null;
      env.dispose();
      pmrem.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene]);

  useEffect(() => {
    settled.current = false;
    invalidate();
  }, [preset, interiorOn, invalidate]);

  const applyAll = () => {
    const c = cur.current;
    const u = skyMaterial.uniforms;
    (u.uTop.value as Color).set(c.top);
    (u.uMid.value as Color).set(c.mid);
    (u.uHorizon.value as Color).set(c.horizon);
    const fog = scene.fog as FogExp2 | null;
    if (fog) {
      fog.color.set(c.fog);
      fog.density = c.fogDensity;
    }
    hillMaterial.color.set(c.fog).lerp(tmp.set(c.top), 0.45);
    if (hemi.current) {
      hemi.current.color.set(c.hemiSky);
      hemi.current.groundColor.set(c.hemiGround);
      hemi.current.intensity = c.hemi;
    }
    if (sun.current) {
      const s = sun.current;
      s.color.set(c.sun);
      s.intensity = c.sunI;
      const [cx, cy, cz] = def.center;
      const d = new Vector3(...c.sunDir).normalize().multiplyScalar(def.radius * 3 + 30);
      s.position.set(cx + d.x, cy + d.y, cz + d.z);
      s.target.position.set(cx, cy, cz);
      s.target.updateMatrixWorld();
    }
    scene.environmentIntensity = c.env;
    gl.toneMappingExposure = c.exposure;
    lights.current.forEach((l, i) => {
      if (l) l.intensity = def.lights[i].intensity * c.interior * c.interiorK;
    });
  };

  useFrame((_, rawDt) => {
    if (dome.current) dome.current.position.copy(camera.position);
    if (settled.current) return;
    const target = AMBIENTS[preset];
    const c = cur.current;
    const dt = Math.min(rawDt, 0.05);
    const instant = prefersReducedMotion();
    const a = instant ? 1 : 1 - Math.exp(-4.2 * dt);
    let delta = 0;
    const num = (key: 'fogDensity' | 'hemi' | 'sunI' | 'env' | 'exposure' | 'interior') => {
      const next = MathUtils.lerp(c[key], target[key], a);
      delta += Math.abs(target[key] - next) / (Math.abs(target[key]) + 0.05);
      c[key] = next;
    };
    num('fogDensity');
    num('hemi');
    num('sunI');
    num('env');
    num('exposure');
    num('interior');
    const col = (key: 'top' | 'mid' | 'horizon' | 'fog' | 'hemiSky' | 'hemiGround' | 'sun') => {
      c[key] = `#${tmp.set(c[key]).lerp(new Color(target[key]), a).getHexString()}`;
    };
    col('top');
    col('mid');
    col('horizon');
    col('fog');
    col('hemiSky');
    col('hemiGround');
    col('sun');
    c.sunDir = c.sunDir.map((v, i) => MathUtils.lerp(v, target.sunDir[i], a)) as [number, number, number];
    const ik = interiorOn ? 1 : 0;
    c.interiorK = MathUtils.lerp(c.interiorK, ik, a);
    delta += Math.abs(ik - c.interiorK);
    applyAll();
    if (delta < 0.004) {
      Object.assign(c, target, { sunDir: [...target.sunDir], interiorK: ik });
      applyAll();
      settled.current = true;
    }
    invalidate();
  });

  const shadowSize = quality === 'alta' ? 2048 : 1024;
  const reach = def.radius + 10;
  const hills = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = [];
    // Lomas bajas y anchas: una silueta suave contra el horizonte, no picos.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.09;
      const r = 230 + ((i * 37) % 70);
      const h = 9 + ((i * 53) % 15);
      out.push({
        p: [def.center[0] + Math.cos(a) * r, def.groundY + h / 2 - 1.5, def.center[2] + Math.sin(a) * r],
        s: [150 + ((i * 29) % 110), h, 150 + ((i * 17) % 90)],
      });
    }
    return out;
  }, [def]);
  const cone = useDisposable(() => new ConeGeometry(0.5, 1, 9, 1), []);

  return (
    <>
      <mesh ref={dome} material={skyMaterial} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[420, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={quality !== 'baja'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
      >
        <orthographicCamera attach="shadow-camera" args={[-reach, reach, reach, -reach, 1, def.radius * 6 + 90]} />
      </directionalLight>
      {def.lights.slice(0, quality === 'baja' ? 4 : def.lights.length).map((l, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          position={l.p}
          color="#ffc98f"
          distance={l.distance}
          decay={1.8}
          intensity={0}
          castShadow={quality === 'alta' && !!l.main}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.003}
          shadow-normalBias={0.03}
          shadow-camera-near={0.15}
          shadow-camera-far={l.distance}
        />
      ))}
      {def.kind === 'demo' &&
        preset !== 'blueprint' &&
        hills.map((h, i) => <mesh key={i} geometry={cone} material={hillMaterial} position={h.p} scale={h.s} />)}
    </>
  );
}

function Ground({ def, materials }: { def: SceneDef; materials: MaterialSet }) {
  const geometry = useDisposable(() => {
    const size = 560;
    const g = new PlaneGeometry(size, size);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size);
    return g;
  }, []);
  return (
    <mesh
      geometry={geometry}
      material={materials.get('ground')}
      rotation-x={-Math.PI / 2}
      position={[def.center[0], def.groundY - 0.002, def.center[2]]}
      receiveShadow
    />
  );
}

function BlueprintSheet({ def, materials }: { def: SceneDef; materials: MaterialSet }) {
  const { x0, x1, z0, z1 } = def.sheet;
  const w = x1 - x0;
  const d = z1 - z0;
  const geometry = useDisposable(() => {
    const g = new PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
    return g;
  }, [w, d]);
  return (
    <>
      <mesh
        geometry={geometry}
        material={materials.get('blueprint')}
        rotation-x={-Math.PI / 2}
        position={[(x0 + x1) / 2, -0.002, (z0 + z1) / 2]}
      />
      {def.project.rooms.map((r) => (
        <Label key={r.id} text={r.name.toUpperCase()} position={[r.camera.x, 0.03, r.camera.y]} height={Math.max(0.3, def.radius * 0.04)} flat plain />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

const REVEAL: Record<Layer, RevealKind> = {
  plano: 'none',
  trazado: 'none',
  base: 'grow',
  estructura: 'grow',
  cerramientos: 'grow',
  carpinterias: 'grow',
  cubierta: 'drop',
  acabados: 'none',
  mobiliario: 'grow',
  entorno: 'none',
};

function Driver({ controller }: { controller: ViewerController }) {
  const { camera, gl, invalidate, scene } = useThree();
  useEffect(() => {
    controller.attach(camera as PerspectiveCamera, gl.domElement, invalidate);
    controller.scene = scene;
    return () => {
      controller.scene = null;
      controller.detach();
    };
  }, [controller, camera, gl, invalidate, scene]);
  useFrame((state, dt) => {
    if (controller.update(dt)) state.invalidate();
  });
  return null;
}

function SceneContents({ def, materials, controller }: { def: SceneDef; materials: MaterialSet; controller: ViewerController }) {
  const mode = useViewer((s) => s.mode);
  const stage = useViewer((s) => s.stage);
  const quality = useViewer((s) => s.quality);
  const showDimensions = useViewer((s) => s.showDimensions);
  const tick = useViewer((s) => s.tick);
  const invalidate = useThree((s) => s.invalidate);

  const stageDef = mode === 'obra' ? def.stages[stage] : def.stages[def.stages.length - 1];
  const visible = useMemo(() => {
    const set = new Set<Layer>(mode === 'obra' ? stageDef.layers : finalLayers(def));
    if (mode === 'maqueta') set.delete('cubierta');
    return set;
  }, [mode, stageDef, def]);
  const lighting: LightingPreset = mode === 'obra' ? stageDef.lighting : def.presentLighting;
  const raw = mode === 'obra' && !!stageDef.rawWalls;
  const finished = visible.has('acabados');

  const byLayer = useMemo(() => {
    const map = new Map<Layer, Part[]>();
    for (const p of def.parts) {
      const list = map.get(p.layer);
      if (list) list.push(p);
      else map.set(p.layer, [p]);
    }
    return map;
  }, [def]);

  useEffect(() => {
    invalidate();
  }, [mode, stage, quality, showDimensions, tick, invalidate]);

  const layer = (name: Layer, extra?: ReactNode) => (
    <Reveal key={name} name={name} visible={visible.has(name)} kind={REVEAL[name]} pivotY={name === 'base' ? def.groundY : 0}>
      {byLayer.has(name) && <PartsGroup parts={byLayer.get(name)!} materials={materials} />}
      {extra}
    </Reveal>
  );

  return (
    <>
      <Driver controller={controller} />
      <Atmosphere def={def} preset={lighting} quality={quality} interiorOn={visible.has('mobiliario')} />
      {layer('plano', <BlueprintSheet def={def} materials={materials} />)}
      {layer('trazado')}
      {layer('base', <SlabMesh def={def} materials={materials} finished={finished} />)}
      {layer('estructura')}
      {layer('cerramientos', <Walls layouts={def.layouts} materials={materials} raw={raw} />)}
      {layer('carpinterias')}
      {layer('cubierta')}
      {layer('acabados')}
      {layer('mobiliario')}
      {layer('entorno', <Ground def={def} materials={materials} />)}
      {mode === 'maqueta' && <ModelLabels def={def} dimensions={showDimensions} />}
    </>
  );
}

export function SceneCanvas({
  def,
  materials,
  controller,
}: {
  def: SceneDef;
  materials: MaterialSet;
  controller: ViewerController;
}) {
  const quality = useViewer((s) => s.quality);
  const dpr: number | [number, number] = quality === 'alta' ? [1, 2] : quality === 'media' ? [1, 1.5] : 1;
  const start = def.tour.stops[0].pose;
  return (
    <Canvas
      // Se dibuja bajo demanda: con la escena quieta no se consume GPU.
      frameloop="demand"
      shadows={quality === 'baja' ? false : 'percentage'}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.08, far: 900, position: start.pos }}
      aria-label={`Vista 3D de ${def.title}`}
    >
      <SceneContents def={def} materials={materials} controller={controller} />
    </Canvas>
  );
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
