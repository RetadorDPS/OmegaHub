import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box3, LoadingManager, Vector3, type Group, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inspectGlb } from '../editor/glbFile';
import type { ImportedModel, Project } from '../model/types';
import { hrefFor, navigate } from '../router';
import { loadPlanFile, loadProject, saveProject } from '../storage/db';
import { MaterialSet } from '../viewer/materials';
import { PhotoPanel } from '../viewer/PhotoPanel';
import { RenderLoop } from '../viewer/render';
import { AMBIENTS, Atmosphere, Ground, hasWebGL } from '../viewer/SceneCanvas';
import type { LightingPreset, SceneDef } from '../viewer/sceneDef';
import { detectQuality, showToast, useViewer } from '../viewer/store';

const UNIT_SCALE: Record<ImportedModel['units'], number> = { m: 1, cm: 0.01, mm: 0.001 };

/** Lee el GLB sin seguir referencias externas: cualquier URL que no sea local se anula. */
async function parseGlb(data: ArrayBuffer): Promise<Group> {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (url.startsWith('data:') || url.startsWith('blob:') ? url : 'data:,'));
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(data, '');
  gltf.scene.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return gltf.scene;
}

function Orbit({ radius, center, enabled }: { radius: number; center: Vector3; enabled: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.target.copy(center);
    c.minDistance = radius * 0.15;
    c.maxDistance = radius * 6;
    c.maxPolarAngle = Math.PI / 2 - 0.02;
    camera.position.set(center.x + radius * 1.6, center.y + radius * 0.8, center.z + radius * 1.8);
    (camera as PerspectiveCamera).near = Math.max(0.02, radius / 500);
    (camera as PerspectiveCamera).far = radius * 80 + 500;
    (camera as PerspectiveCamera).updateProjectionMatrix();
    const onChange = () => invalidate();
    c.addEventListener('change', onChange);
    ref.current = c;
    c.update();
    invalidate();
    return () => {
      c.removeEventListener('change', onChange);
      c.dispose();
    };
  }, [camera, gl, invalidate, radius, center]);
  useEffect(() => {
    if (ref.current) ref.current.enabled = enabled;
  }, [enabled]);
  useFrame(() => {
    if (ref.current?.enabled && ref.current.update()) invalidate();
  });
  return null;
}

export default function ModelPage({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<LightingPreset>('day');
  const photo = useViewer((s) => s.photo);
  const quality = useMemo(() => detectQuality(), []);
  const materials = useMemo(() => new MaterialSet({ interiorWall: 'blanco-roto', exteriorWall: 'revoco-marfil', floor: 'roble' }, '#4a5a44'), []);
  useEffect(() => () => materials.dispose(), [materials]);
  useEffect(() => {
    useViewer.setState({ photo: 'off', photoSamples: 0, photoTarget: 0, quality });
  }, [quality]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await loadProject(id);
        if (!p.model) throw new Error('Este proyecto no es un modelo importado.');
        const file = await loadPlanFile(id);
        if (!file) throw new Error('No se encuentra el archivo del modelo en este navegador.');
        inspectGlb(file.name, file.data);
        const root = await parseGlb(file.data);
        if (!alive) return;
        setProject(p);
        setScene(root);
      } catch (e) {
        if (alive) setError((e as Error).message || 'No se pudo abrir el modelo.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Escala por unidades, apoyado en el suelo y centrado en planta.
  const placed = useMemo(() => {
    if (!scene || !project?.model) return null;
    const s = UNIT_SCALE[project.model.units];
    scene.scale.setScalar(s);
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const radius = Math.max(1, size.length() / 2);
    return { size, radius, center: new Vector3(0, size.y * 0.4, 0) };
  }, [scene, project?.model]);

  const def = useMemo(
    () =>
      ({
        id,
        kind: 'proyecto',
        title: project?.name ?? '',
        center: [0, placed ? placed.center.y : 1, 0],
        radius: placed?.radius ?? 10,
        groundY: -0.01,
        lights: [],
        groundColor: '#4a5a44',
      }) as unknown as SceneDef,
    [id, project?.name, placed],
  );

  // Muchos programas exportan en centímetros o milímetros: se detecta por el tamaño.
  const guessed = useRef(false);
  useEffect(() => {
    if (!placed || !project?.model || guessed.current) return;
    guessed.current = true;
    const longest = Math.max(placed.size.x, placed.size.y, placed.size.z);
    if (project.model.units === 'm' && longest > 300) {
      const units = longest > 3000 ? 'mm' : 'cm';
      void setUnits(units);
      showToast(`El modelo medía ${Math.round(longest)} m: se interpreta en ${units === 'mm' ? 'milímetros' : 'centímetros'}. Puedes cambiarlo abajo.`, 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  const setUnits = async (units: ImportedModel['units']) => {
    if (!project?.model) return;
    const next = { ...project, model: { ...project.model, units }, updatedAt: Date.now() };
    setProject(next);
    await saveProject(next).catch(() => showToast('No se pudo guardar el cambio de unidades.'));
  };

  if (error) {
    return (
      <main className="blocked" role="alert">
        <h1>No se pudo abrir el modelo</h1>
        <p>{error}</p>
        <a className="btn btn--dark" href={hrefFor({ name: 'proyectos' })}>
          Volver a mis proyectos
        </a>
      </main>
    );
  }
  if (!project || !scene || !placed) {
    return (
      <div className="loading" role="status">
        <b>Studio Sección</b>
        <span>Abriendo el modelo 3D…</span>
      </div>
    );
  }
  const amb = AMBIENTS[preset];
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  return (
    <div className="viewer" data-testid="visor-modelo" data-photo={photo === 'off' ? 'off' : 'on'}>
      <div className="viewer__stage">
        {hasWebGL() ? (
          <Canvas
            frameloop="demand"
            shadows={quality === 'baja' ? false : 'percentage'}
            dpr={quality === 'alta' ? [1, 2] : quality === 'media' ? [1, 1.5] : 1}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ fov: 42 }}
          >
            <Atmosphere def={def} preset={preset} quality={quality} interiorOn={false} />
            <RenderLoop
              quality={quality}
              title={project.name}
              photoSky={{ top: amb.top, mid: amb.mid, horizon: amb.horizon, ground: amb.hemiGround, hdri: amb.hdri ?? 'sky', envIntensity: amb.env * 1.3 }}
            />
            <Orbit radius={placed.radius} center={placed.center} enabled={photo === 'off'} />
            <primitive object={scene} />
            <Ground def={def} materials={materials} />
          </Canvas>
        ) : (
          <p className="viewer__nowebgl">Este dispositivo no puede mostrar la vista 3D.</p>
        )}
      </div>
      <header className="vbar">
        <button type="button" className="vbar__back" onClick={() => navigate({ name: 'proyectos' })}>
          ← <span>Proyectos</span>
        </button>
        <span className="vbar__title">{project.name}</span>
        <nav className="vbar__modes" aria-label="Ambiente">
          <button type="button" aria-pressed={preset === 'day'} onClick={() => setPreset('day')}>
            Día
          </button>
          <button type="button" aria-pressed={preset === 'dusk'} onClick={() => setPreset('dusk')}>
            Atardecer
          </button>
        </nav>
        <div className="vbar__actions">
          <button
            type="button"
            className="vbar__photo"
            data-testid="foto-realista"
            disabled={photo !== 'off'}
            onClick={() => useViewer.setState({ photo: 'rendering', photoSamples: 0 })}
          >
            <span>Foto realista</span>
          </button>
        </div>
      </header>
      <footer className="vfoot">
        <div className="vfoot__caption">
          <span className="vfoot__index">GLB</span>
          <div>
            <h2 className="vfoot__chapter">Modelo importado</h2>
            <p className="vfoot__label">
              {project.model?.fileName} · {fmt(placed.size.x)} × {fmt(placed.size.z)} m · {fmt(placed.size.y)} m de alto
            </p>
            <p className="vfoot__disclaimer">Vista en órbita. Sin colisiones ni etapas de obra: el archivo no trae datos de navegación.</p>
          </div>
        </div>
        <div className="vfoot__controls vfoot__controls--wrap">
          <div className="chips" role="group" aria-label="Unidades del archivo">
            {(['m', 'cm', 'mm'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={project.model?.units === u} data-testid={`unidades-${u}`} onClick={() => void setUnits(u)}>
                {u === 'm' ? 'Metros' : u === 'cm' ? 'Centímetros' : 'Milímetros'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--light" onClick={() => useViewer.setState((s) => ({ capture: true, tick: s.tick + 1 }))}>
            Guardar imagen
          </button>
        </div>
      </footer>
      {photo !== 'off' && <PhotoPanel onClose={() => undefined} />}
      <ModelToast />
    </div>
  );
}

function ModelToast() {
  const toast = useViewer((s) => s.toast);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}
