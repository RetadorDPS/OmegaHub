/**
 * Bucle de dibujo del visor. Hay tres caminos:
 *  - calidad baja: render directo (lo más ligero para móviles modestos);
 *  - calidad media/alta: cadena de posprocesado con oclusión ambiental (N8AO),
 *    antialiasing SMAA, brillo suave en las luminarias y mapeo de tonos AgX;
 *  - «Foto realista»: trazado de rayos progresivo (three-gpu-pathtracer) del
 *    encuadre actual, con la escena convertida a mallas estáticas.
 * Además resuelve las capturas a imagen (JPG) en el mismo fotograma en que se dibuja.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  HalfFloatType,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  NoToneMapping,
  RGBAFormat,
  Scene,
  type Light,
  type Object3D,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { useViewer, showToast, type Quality } from './store';
import { loadHdri, type HdriName } from './hdri';

/** Muestras objetivo del modo foto por nivel de calidad. */
export const PHOTO_SAMPLES: Record<Quality, number> = { alta: 400, media: 220, baja: 110 };

/** Cielo de fondo para el trazador: degradado equirectangular en coma flotante. */
function gradientSky(top: string, mid: string, horizon: string, ground: string): DataTexture {
  const w = 8;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  const ct = new Color(top);
  const cm = new Color(mid);
  const ch = new Color(horizon);
  const cg = new Color(ground);
  const c = new Color();
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < h; y++) {
    // v = 1 arriba (cénit), 0 abajo (nadir).
    const elevation = (y / (h - 1)) * 2 - 1;
    if (elevation < -0.02) c.copy(cg);
    else {
      c.copy(ch).lerp(cm, smooth(-0.02, 0.2, elevation));
      c.lerp(ct, smooth(0.12, 0.78, elevation));
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 1;
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat, FloatType);
  t.mapping = EquirectangularReflectionMapping;
  t.colorSpace = LinearSRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Copia estática de lo visible para el trazador: cada instancia de un
 * InstancedMesh pasa a ser una malla con su matriz; se descartan rótulos,
 * cúpula de cielo y elementos sin material estándar.
 */
function flattenScene(source: Scene): { scene: Scene; lights: Light[] } {
  const out = new Scene();
  const lights: Light[] = [];
  const tmp = new Matrix4();
  source.updateMatrixWorld(true);
  source.traverseVisible((o: Object3D) => {
    const any = o as Object3D & {
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      isLight?: boolean;
      isSprite?: boolean;
      material?: unknown;
      count?: number;
    };
    if (any.isLight) {
      lights.push(o as Light);
      return;
    }
    if (!any.isMesh || any.isSprite) return;
    const mat = any.material as { isShaderMaterial?: boolean; isMeshBasicMaterial?: boolean; isMeshStandardMaterial?: boolean } | { isShaderMaterial?: boolean }[];
    const first = Array.isArray(mat) ? mat[0] : mat;
    if (!first || (first as { isShaderMaterial?: boolean }).isShaderMaterial) return;
    const mesh = o as Mesh;
    if (any.isInstancedMesh) {
      const inst = o as unknown as { count: number; getMatrixAt: (i: number, m: Matrix4) => void };
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, tmp);
        const m = new Mesh(mesh.geometry, mesh.material);
        m.matrixAutoUpdate = false;
        m.matrix.multiplyMatrices(mesh.matrixWorld, tmp);
        m.matrixWorld.copy(m.matrix);
        out.add(m);
      }
      return;
    }
    const m = new Mesh(mesh.geometry, mesh.material);
    m.matrixAutoUpdate = false;
    m.matrix.copy(mesh.matrixWorld);
    m.matrixWorld.copy(m.matrix);
    out.add(m);
  });
  for (const l of lights) {
    const copy = l.clone() as Light & { target?: Object3D };
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(l.matrixWorld);
    copy.matrixWorld.copy(l.matrixWorld);
    const src = l as Light & { target?: Object3D };
    if (src.target && copy.target) {
      copy.target = src.target.clone();
      copy.target.matrixAutoUpdate = false;
      copy.target.matrixWorld.copy(src.target.matrixWorld);
      out.add(copy.target);
    }
    out.add(copy);
  }
  return { scene: out, lights };
}

function download(dataUrl: string, name: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface PhotoSky {
  top: string;
  mid: string;
  horizon: string;
  ground: string;
  hdri: HdriName;
  envIntensity: number;
}

interface Tracer {
  renderSample: () => void;
  samples: number;
  dispose: () => void;
  updateCamera: () => void;
  reset: () => void;
}

export function RenderLoop({ quality, title, photoSky }: { quality: Quality; title: string; photoSky: PhotoSky }) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const photo = useViewer((s) => s.photo);
  const tracer = useRef<Tracer | null>(null);
  const useComposer = quality !== 'baja';

  const composer = useMemo(() => {
    if (!useComposer) return null;
    const c = new EffectComposer(gl as WebGLRenderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    c.addPass(new RenderPass(scene, camera));
    const ao = new N8AOPostPass(scene, camera, size.width, size.height);
    ao.configuration.aoRadius = 0.9;
    ao.configuration.distanceFalloff = 0.6;
    ao.configuration.intensity = 2.4;
    ao.configuration.halfRes = quality !== 'alta';
    ao.setQualityMode(quality === 'alta' ? 'Medium' : 'Performance');
    c.addPass(ao);
    c.addPass(
      new EffectPass(
        camera,
        new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.2, intensity: 0.55, mipmapBlur: true, radius: 0.6 }),
        new SMAAEffect(),
        new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      ),
    );
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, useComposer, quality]);

  useEffect(() => {
    // El mapeo de tonos lo hace la cadena; sin ella, el renderer.
    gl.toneMapping = composer ? NoToneMapping : ACESFilmicToneMapping;
    invalidate();
    return () => {
      composer?.dispose();
      gl.toneMapping = ACESFilmicToneMapping;
    };
  }, [composer, gl, invalidate]);

  useEffect(() => {
    composer?.setSize(size.width, size.height);
    invalidate();
  }, [composer, size, invalidate]);

  // Modo foto: prepara el trazador sobre una copia estática de la escena.
  useEffect(() => {
    if (photo === 'off') return;
    let alive = true;
    let raf = 0;
    let sky: DataTexture | null = null;
    (async () => {
      try {
        const [{ WebGLPathTracer }, env] = await Promise.all([import('three-gpu-pathtracer'), loadHdri(photoSky.hdri)]);
        if (!alive) return;
        const { scene: flat } = flattenScene(scene);
        sky = gradientSky(photoSky.top, photoSky.mid, photoSky.horizon, photoSky.ground);
        flat.background = sky;
        flat.environment = env;
        flat.environmentIntensity = photoSky.envIntensity;
        flat.backgroundIntensity = 1;
        const pt = new WebGLPathTracer(gl as WebGLRenderer);
        pt.bounces = quality === 'baja' ? 4 : 6;
        pt.transmissiveBounces = 6;
        pt.filterGlossyFactor = 0.5;
        pt.minSamples = 1;
        pt.fadeDuration = 250;
        pt.renderDelay = 0;
        pt.tiles.set(quality === 'alta' ? 2 : 3, quality === 'alta' ? 2 : 3);
        pt.renderScale = quality === 'alta' ? 1 : quality === 'media' ? 0.85 : 0.6;
        gl.toneMapping = ACESFilmicToneMapping;
        // Se deja pintar el aviso de «Preparando» antes del cálculo, que bloquea un momento.
        await new Promise((r) => setTimeout(r, 120));
        if (!alive) {
          pt.dispose();
          return;
        }
        pt.setScene(flat, camera as PerspectiveCamera);
        if (!alive) {
          pt.dispose();
          return;
        }
        tracer.current = pt as unknown as Tracer;
        useViewer.setState({ photoSamples: 0, photoTarget: PHOTO_SAMPLES[quality] });
        // Mientras se afina la imagen se pide un fotograma en cada refresco de pantalla.
        const pump = () => {
          if (!alive) return;
          if (useViewer.getState().photo === 'rendering') invalidate();
          raf = requestAnimationFrame(pump);
        };
        raf = requestAnimationFrame(pump);
      } catch (e) {
        console.warn(e);
        showToast('Este dispositivo no puede generar la foto realista (necesita WebGL 2 con texturas en coma flotante).', 5000);
        useViewer.setState({ photo: 'off' });
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      tracer.current?.dispose();
      tracer.current = null;
      sky?.dispose();
      gl.toneMapping = composer ? NoToneMapping : ACESFilmicToneMapping;
      invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo === 'off']);

  useFrame((_, dt) => {
    const st = useViewer.getState();
    const pt = tracer.current;
    if (st.photo !== 'off' && pt) {
      pt.renderSample();
      const samples = pt.samples;
      if (Math.floor(samples) !== st.photoSamples) useViewer.setState({ photoSamples: Math.floor(samples) });
      if (samples < st.photoTarget) invalidate();
      else if (st.photo === 'rendering') useViewer.setState({ photo: 'done' });
    } else if (st.photo !== 'off') {
      // Mientras se prepara el trazador se mantiene la última imagen normal.
      if (composer) composer.render(dt);
      else gl.render(scene, camera);
    } else if (composer) composer.render(dt);
    else gl.render(scene, camera);

    if (st.capture) {
      // Se lee el lienzo en el mismo fotograma en que se ha dibujado.
      const url = gl.domElement.toDataURL('image/jpeg', 0.94);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      download(url, `${title.replace(/[^\p{L}\p{N}]+/gu, '-')}-${stamp}.jpg`);
      useViewer.setState({ capture: false });
    }
  }, 1);

  return null;
}
