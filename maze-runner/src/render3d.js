/* =============================================================
   Maze Runner Mobile — Motor de render V3 (WebGL / three.js)

   Sustituye al raycaster Canvas2D por geometría 3D real: mallas
   fusionadas por bioma (paredes/suelo/techo) a partir de la misma
   rejilla física de world.js, iluminación dinámica (linterna,
   bengalas, sol día/noche), niebla exponencial y dos cámaras
   intercambiables (primera y tercera persona). Reutiliza al 100%
   las texturas procedurales de textures.js convertidas a
   CanvasTexture — cero asset externo.

   Contrato público idéntico al render.js anterior:
     new Renderer(canvas) / .resize(cssW, cssH, quality) / .render(game)
   así que game.js no necesita cambios más allá del import.
   ============================================================= */

import * as THREE from '../vendor/three.module.js';
import { T, FL, DIL, BIOME } from './world.js';
import { buildTextures, buildSprites } from './textures.js';
import { ITEM_DEFS } from './entities.js';

const EYE_H = 1.65;

// mismo esquema de ambiente/niebla que el raycaster v2, en términos 3D
const BIOME_LIGHT = [
  { amb: 0.62, fog: 0.026, fr: 34, fg: 44, fb: 30, sky: [70, 96, 128] },
  { amb: 0.40, fog: 0.052, fr: 15, fg: 17, fb: 15, sky: [40, 42, 46] },
  { amb: 0.36, fog: 0.066, fr: 12, fg: 14, fb: 18, sky: [30, 34, 44] },
  { amb: 0.52, fog: 0.030, fr: 58, fg: 48, fb: 36, sky: [110, 96, 70] },
  { amb: 0.30, fog: 0.115, fr: 4, fg: 5, fb: 7, sky: [8, 9, 11] },
];

function texToCanvas(tex) {
  const c = document.createElement('canvas');
  c.width = tex.w; c.height = tex.h;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(tex.data), tex.w, tex.h), 0, 0);
  return c;
}

function makeTexture(tex, renderer) {
  const t = new THREE.CanvasTexture(texToCanvas(tex));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  t.needsUpdate = true;
  return t;
}

function makeSpriteTexture(tex) {
  const t = new THREE.CanvasTexture(texToCanvas(tex));
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Acumulador de cuadriláteros (2 triángulos) -> una sola BufferGeometry. */
class QuadBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = [];
  }
  // a,b: esquinas inferiores (a->b = dirección del tramo); h: altura; normal deseada
  addWallQuad(ax, ay, az, bx, by, bz, h, nx, ny, nz, uBase, r = 1, g = 1, b = 1) {
    // autocorrección de sentido: fuerza que la normal del triángulo calculado
    // coincida con la normal deseada, para no depender de deducir el winding a mano.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = 0, vy = h, vz = 0;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const dot = cx * nx + cy * ny + cz * nz;
    let p0x = ax, p0y = ay, p0z = az, p1x = bx, p1y = by, p1z = bz;
    if (dot < 0) { p0x = bx; p0y = by; p0z = bz; p1x = ax; p1y = ay; p1z = az; }
    const len = Math.hypot(p1x - p0x, p1y - p0y, p1z - p0z);
    const u0 = uBase, u1 = uBase + len;
    this._quad(
      p0x, p0y, p0z, p1x, p1y, p1z, p1x, p1y + h, p1z, p0x, p0y + h, p0z,
      nx, ny, nz, u0, 0, u1, 0, u1, h, u0, h, r, g, b,
    );
  }
  addFlatQuad(x0, y, z0, x1, z1, ny, uFlip, r = 1, g = 1, b = 1) {
    // suelo (ny=1) o techo (ny=-1), en el plano horizontal y=cte.
    // orden de vértices elegido para que el sentido (winding) real coincida
    // con la normal declarada — si no, WebGL recorta la cara por detrás.
    if (ny > 0) {
      this._quad(
        x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0,
        0, 1, 0, x0, z0, x0, z1, x1, z1, x1, z0, r, g, b,
      );
    } else {
      this._quad(
        x0, y, z1, x0, y, z0, x1, y, z0, x1, y, z1,
        0, -1, 0, x0, z1, x0, z0, x1, z0, x1, z1, r, g, b,
      );
    }
  }
  _quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, ua, va, ub, vb, uc, vc, ud, vd, r, g, b) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 6; i++) this.nrm.push(nx, ny, nz);
    this.uv.push(ua, va, ub, vb, uc, vc, ua, va, uc, vc, ud, vd);
    for (let i = 0; i < 6; i++) this.col.push(r, g, b);
  }
  toGeometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

const HATCH_TINT = [0.55, 0.92, 1.0];

function buildFloorGeoms(world, floor, ceiling) {
  const W = world.W, H = world.H;
  const grid = world.grid[floor], biome = world.biome[floor], sky = world.sky[floor];
  const builders = new Map(); // biome -> QuadBuilder
  const get = (bio) => builders.get(bio) || (builders.set(bio, new QuadBuilder()), builders.get(bio));

  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i = y * W + x;
      const t = grid[i];
      const open = t !== T.WALL;
      const openForCeil = open && !sky[i];
      const present = ceiling ? openForCeil : open;
      if (!present) { x++; continue; }
      const bio = biome[i];
      const isHatch = t === T.HATCH_DOWN || t === T.HATCH_UP;
      let x1 = x + 1;
      while (x1 < W) {
        const j = y * W + x1;
        const tj = grid[j];
        const openJ = tj !== T.WALL;
        const presentJ = ceiling ? (openJ && !sky[j]) : openJ;
        if (!presentJ || biome[j] !== bio) break;
        const hatchJ = tj === T.HATCH_DOWN || tj === T.HATCH_UP;
        if (hatchJ !== isHatch) break;
        x1++;
      }
      const qb = get(bio);
      const [r, g, b] = isHatch && !ceiling ? HATCH_TINT : [1, 1, 1];
      qb.addFlatQuad(x, 0, y, x1, y + 1, ceiling ? -1 : 1, false, r, g, b);
      x = x1;
    }
  }
  return builders;
}

const DIRS = [
  { dx: 1, dy: 0, nx: 1, nz: 0 },   // este
  { dx: -1, dy: 0, nx: -1, nz: 0 }, // oeste
  { dx: 0, dy: 1, nx: 0, nz: 1 },   // sur
  { dx: 0, dy: -1, nx: 0, nz: -1 }, // norte
];

function buildWallGeoms(world, floor) {
  const W = world.W, H = world.H;
  const grid = world.grid[floor], biome = world.biome[floor], wallH = world.wallH[floor];
  const builders = new Map();
  const get = (bio) => builders.get(bio) || (builders.set(bio, new QuadBuilder()), builders.get(bio));
  const isWall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === T.WALL;
  const exposed = (x, y, dx, dy) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
    return grid[ny * W + nx] !== T.WALL;
  };

  // norte/sur: fusiona a lo largo de X dentro de cada fila
  for (const d of [DIRS[3], DIRS[2]]) {
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const i = y * W + x;
        if (!isWall(x, y) || !exposed(x, y, d.dx, d.dy)) { x++; continue; }
        const bio = biome[i], h = (wallH[i] || 19) / 16;
        let x1 = x + 1;
        while (x1 < W) {
          const j = y * W + x1;
          if (!isWall(x1, y) || !exposed(x1, y, d.dx, d.dy) || biome[j] !== bio || (wallH[j] || 19) / 16 !== h) break;
          x1++;
        }
        const qb = get(bio);
        const z = d.dy < 0 ? y : y + 1;
        qb.addWallQuad(x, 0, z, x1, 0, z, h, d.nx, 0, d.nz, x);
        x = x1;
      }
    }
  }
  // este/oeste: fusiona a lo largo de Y dentro de cada columna
  for (const d of [DIRS[1], DIRS[0]]) {
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        const i = y * W + x;
        if (!isWall(x, y) || !exposed(x, y, d.dx, d.dy)) { y++; continue; }
        const bio = biome[i], h = (wallH[i] || 19) / 16;
        let y1 = y + 1;
        while (y1 < H) {
          const j = y1 * W + x;
          if (!isWall(x, y1) || !exposed(x, y1, d.dx, d.dy) || biome[j] !== bio || (wallH[j] || 19) / 16 !== h) break;
          y1++;
        }
        const qb = get(bio);
        const px = d.dx < 0 ? x : x + 1;
        qb.addWallQuad(px, 0, y, px, 0, y1, h, d.nx, 0, d.nz, y);
        y = y1;
      }
    }
  }
  return builders;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 130);
    this.camera.rotation.order = 'YXZ';
    this.targetHFov = 100 * Math.PI / 180; // FOV horizontal objetivo, estable en cualquier pantalla

    this.scene = new THREE.Scene();
    this.fogObj = new THREE.FogExp2(0x05070a, 0.03);
    this.scene.fog = this.fogObj;
    this.scene.background = new THREE.Color(0x05070a);

    this.tex = buildTextures();
    this.spriteSrc = buildSprites();
    this.spriteTex = {};
    for (const k of Object.keys(this.spriteSrc)) {
      const v = this.spriteSrc[k];
      this.spriteTex[k] = Array.isArray(v) ? v.map((t) => makeSpriteTexture(t)) : makeSpriteTexture(v);
    }

    this._buildMaterials();
    this._buildLights();

    this.mode = 'first'; // 'first' | 'third'
    this.charGroup = this._buildCharacter();
    this.charGroup.visible = false;
    this.scene.add(this.charGroup);

    this._builtWorld = null;
    this.floorGroups = [null, null];
    this.wallMeshesByFloor = [[], []];
    this.doorAnims = [];

    this.entitySprites = new Map(); // entidad -> THREE.Sprite
    this.beaconSprite = null;
    this.flarePool = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffac55, 0, 9, 1.7);
      this.scene.add(pl);
      this.flarePool.push(pl);
    }

    this._raycaster = new THREE.Raycaster();
    this._camPos = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._camOrigin = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    this.resize(canvas.clientWidth || 360, canvas.clientHeight || 200, 0.5);
  }

  /* ---------------------------------------------------------- materiales/luces */

  _buildMaterials() {
    const mat = (tex, extra) => new THREE.MeshStandardMaterial({
      map: makeTexture(tex, this.renderer), roughness: 0.96, metalness: 0.02, vertexColors: true, fog: true, ...extra,
    });
    this.wallMat = this.tex.walls.slice(0, 5).map((t) => mat(t));
    this.floorMat = this.tex.floors.map((t) => mat(t));
    this.ceilMat = this.tex.ceils.map((t) => mat(t));
    this.doorMat = new THREE.MeshStandardMaterial({
      map: makeTexture(this.tex.walls[5], this.renderer), roughness: 0.9, metalness: 0.15,
      transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
    });
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfdcea, 0x3a3426, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2da, 0.9);
    this.sun.position.set(20, 40, 10);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);

    this.flashTarget = new THREE.Object3D();
    this.flashTarget.position.set(0, 0, -1);
    this.camera.add(this.flashTarget);
    this.flash = new THREE.SpotLight(0xfff0cf, 3.4, 42, 0.5, 0.55, 1.4);
    this.flash.position.set(0, 0, 0);
    this.flash.target = this.flashTarget;
    this.camera.add(this.flash);
    this.scene.add(this.camera);
  }

  /* --- personaje: nada de modelo humano importado (no hay pipeline de
     assets ni red para traer uno con rig): un corredor estilizado de bajo
     poligonaje con ropa de abrigo/mochila pintadas a mano en canvas, en el
     mismo espíritu "cero assets externos" que el resto del juego. */

  _charCanvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  _buildCharacter() {
    const g = new THREE.Group();

    // torso: chaqueta de faena verde musgo con cinturón y cremallera, UV
    // cilíndrica de la cápsula -> una franja horizontal = una vuelta.
    const jacketTex = this._charCanvasTex(128, (ctx, s) => {
      ctx.fillStyle = '#4a5340'; ctx.fillRect(0, 0, s, s * 0.62);
      ctx.fillStyle = '#39402f'; ctx.fillRect(0, s * 0.62, s, s * 0.1);
      ctx.fillStyle = '#5c6b4a'; ctx.fillRect(0, s * 0.72, s, s * 0.28);
      ctx.strokeStyle = 'rgba(20,22,16,0.55)'; ctx.lineWidth = Math.max(1, s * 0.012);
      ctx.beginPath(); ctx.moveTo(s * 0.5, 0); ctx.lineTo(s * 0.5, s * 0.62); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(s * 0.5, s * (0.08 + i * 0.1), Math.max(1, s * 0.012), 0, Math.PI * 2);
        ctx.fillStyle = '#1c1e18'; ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 160; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath(); ctx.moveTo(0, s * 0.62); ctx.lineTo(s, s * 0.62); ctx.stroke();
    });
    const jacket = new THREE.MeshStandardMaterial({ map: jacketTex, roughness: 0.92 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 10), jacket);
    body.position.y = 1.0;

    // cabeza: capucha/bandana oscura + rostro simple, UV esférica equirrect.
    const headTex = this._charCanvasTex(96, (ctx, s) => {
      ctx.fillStyle = '#caa177'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#2e2a24'; ctx.fillRect(0, 0, s, s * 0.4);
      ctx.fillStyle = '#231f1a'; ctx.fillRect(0, s * 0.33, s, s * 0.09);
      ctx.fillStyle = '#20201c';
      ctx.fillRect(s * 0.28, s * 0.5, s * 0.1, s * 0.07);
      ctx.fillRect(s * 0.62, s * 0.5, s * 0.1, s * 0.07);
      ctx.strokeStyle = 'rgba(40,25,15,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s * 0.38, s * 0.66); ctx.lineTo(s * 0.62, s * 0.66); ctx.stroke();
    });
    const headMat = new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.88 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), headMat);
    head.position.y = 1.56;
    head.rotation.y = Math.PI / 2;

    // mochila con correas y bolsillo lateral (caja: UV planar, una cara basta)
    const packTex = this._charCanvasTex(96, (ctx, s) => {
      ctx.fillStyle = '#5c4a30'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#4a3b26'; ctx.fillRect(s * 0.1, s * 0.55, s * 0.8, s * 0.35);
      ctx.strokeStyle = '#2e2515'; ctx.lineWidth = s * 0.03;
      ctx.beginPath(); ctx.moveTo(s * 0.22, 0); ctx.lineTo(s * 0.22, s); ctx.moveTo(s * 0.78, 0); ctx.lineTo(s * 0.78, s); ctx.stroke();
      ctx.fillStyle = '#20180e';
      ctx.fillRect(s * 0.4, s * 0.28, s * 0.2, s * 0.14);
    });
    const packMat = new THREE.MeshStandardMaterial({ map: packTex, roughness: 0.95 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.2), packMat);
    bag.position.set(0, 1.05, 0.26);

    g.add(body, head, bag);
    g.userData.body = body; g.userData.head = head; g.userData.bag = bag;
    return g;
  }

  /** Vende movimiento sin esqueleto: balanceo vertical + leve vaivén lateral
      sincronizados con el mismo ciclo de paso que usa la cámara en 1ª persona. */
  _animateCharacter(p) {
    const g = this.charGroup;
    if (!g.visible) return;
    const walking = p.moving;
    const bobY = walking ? Math.sin(p.bob) * (p.running ? 0.05 : 0.03) : Math.sin(p.bob * 0.4) * 0.01;
    const lean = walking ? Math.sin(p.bob) * (p.running ? 0.09 : 0.05) : 0;
    g.position.y = Math.max(0, bobY);
    g.rotation.z = lean;
    g.rotation.x = walking ? Math.cos(p.bob) * 0.03 : 0;
  }

  /* ---------------------------------------------------------- API pública */

  resize(cssW, cssH, quality = 0.5) {
    const scale = Math.max(0.35, Math.min(1, quality || 0.5));
    const w = Math.max(1, cssW || 360), h = Math.max(1, cssH || 200);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6) * scale);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // three.js fija el FOV *vertical*; sin compensar por aspecto, una pantalla
    // panorámica infla el FOV horizontal real a un fisheye que distorsiona los
    // giros. Se deriva el vertical de un horizontal objetivo estable.
    const vFov = 2 * Math.atan(Math.tan(this.targetHFov / 2) / aspect);
    this.camera.fov = Math.max(50, Math.min(92, vFov * 180 / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  setCameraMode(mode) {
    this.mode = mode === 'third' ? 'third' : 'first';
    this.charGroup.visible = this.mode === 'third';
  }

  toggleCameraMode() {
    this.setCameraMode(this.mode === 'first' ? 'third' : 'first');
    return this.mode;
  }

  /* ---------------------------------------------------------- nivel */

  _disposeFloor(idx) {
    const grp = this.floorGroups[idx];
    if (!grp) return;
    grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(grp);
    this.floorGroups[idx] = null;
    this.wallMeshesByFloor[idx] = [];
  }

  _buildLevel(world) {
    for (let f = 0; f < 2; f++) this._disposeFloor(f);
    this.doorAnims = [];

    for (let f = 0; f < 2; f++) {
      const grp = new THREE.Group();
      grp.visible = false;

      const floorB = buildFloorGeoms(world, f, false);
      for (const [bio, qb] of floorB) {
        const geo = qb.toGeometry(); if (!geo) continue;
        grp.add(new THREE.Mesh(geo, this.floorMat[bio]));
      }
      const ceilB = buildFloorGeoms(world, f, true);
      for (const [bio, qb] of ceilB) {
        const geo = qb.toGeometry(); if (!geo) continue;
        grp.add(new THREE.Mesh(geo, this.ceilMat[bio]));
      }
      const wallB = buildWallGeoms(world, f);
      const wallMeshes = [];
      for (const [bio, qb] of wallB) {
        const geo = qb.toGeometry(); if (!geo) continue;
        const m = new THREE.Mesh(geo, this.wallMat[bio]);
        grp.add(m); wallMeshes.push(m);
      }
      this.wallMeshesByFloor[f] = wallMeshes;

      if (f === FL.SURFACE) {
        for (const d of world.doors) {
          const h = (world.wallH[f][world.idx(d.x, d.y)] || 19) / 16;
          const geo = new THREE.PlaneGeometry(DIL, h, 1, 1);
          const mesh = new THREE.Mesh(geo, this.doorMat);
          const cx = d.x + DIL / 2, cy = d.y + DIL / 2;
          mesh.position.set(cx, h / 2, cy);
          if (d.axis !== 'v') mesh.rotation.y = Math.PI / 2;
          mesh.userData.door = d; mesh.userData.baseY = h / 2; mesh.userData.h = h;
          grp.add(mesh);
          this.doorAnims.push(mesh);
        }
      }

      this.scene.add(grp);
      this.floorGroups[f] = grp;
    }
  }

  /* ---------------------------------------------------------- entidades */

  _spriteFor(key, tex, fog) {
    let s = this.entitySprites.get(key);
    if (!s) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog });
      s = new THREE.Sprite(mat);
      this.scene.add(s);
      this.entitySprites.set(key, s);
    }
    return s;
  }

  _syncEntities(game) {
    const f = game.player.floor;
    const seen = new Set();

    for (const gv of game.grievers || []) {
      const frame = Math.floor(gv.animT * 6) % 2;
      const tex = this.spriteTex.griever[frame];
      const s = this._spriteFor(gv, tex, false);
      seen.add(gv);
      s.material.map = tex;
      s.visible = gv.floor === f;
      const h = 1.5, ar = tex.image.width / tex.image.height;
      s.scale.set(h * ar, h, 1);
      s.position.set(gv.x, h / 2, gv.y);
    }
    for (const it of game.items || []) {
      if (it.taken) continue;
      const tex = this.spriteTex[it.type];
      const s = this._spriteFor(it, tex, true);
      seen.add(it);
      const def = ITEM_DEFS[it.type] || { h: 0.5, yBase: 0.1 };
      const bob = Math.sin(it.bob || 0) * 0.08;
      s.visible = it.floor === f;
      const ar = tex.image.width / tex.image.height;
      s.scale.set(def.h * ar, def.h, 1);
      s.position.set(it.x, def.yBase + bob + def.h / 2, it.y);
    }
    for (const fl of game.flares || []) {
      const tex = this.spriteTex.flare;
      const s = this._spriteFor(fl, tex, false);
      seen.add(fl);
      s.visible = fl.floor === f;
      const ar = tex.image.width / tex.image.height;
      s.scale.set(0.5 * ar, 0.5, 1);
      s.position.set(fl.x, 0.25, fl.y);
    }

    const w = game.world;
    if (w.exit) {
      if (!this.beaconSprite) {
        const mat = new THREE.SpriteMaterial({ map: this.spriteTex.beacon, transparent: true, fog: false });
        this.beaconSprite = new THREE.Sprite(mat);
        this.scene.add(this.beaconSprite);
      }
      const ar = this.spriteTex.beacon.image.width / this.spriteTex.beacon.image.height;
      this.beaconSprite.scale.set(3.2 * ar, 3.2, 1);
      this.beaconSprite.position.set(w.exit.x + DIL / 2, 1.6, w.exit.y + DIL / 2);
      this.beaconSprite.visible = f === FL.SURFACE;
    }

    for (const [key, s] of this.entitySprites) {
      if (!seen.has(key)) { this.scene.remove(s); s.material.dispose(); this.entitySprites.delete(key); }
    }

    let fi = 0;
    for (const fl of game.flares || []) {
      if (fl.floor !== f || fi >= this.flarePool.length) continue;
      const pl = this.flarePool[fi++];
      pl.position.set(fl.x, 0.5, fl.y);
      pl.intensity = Math.max(0, fl.intensity || 0) * 9;
    }
    for (; fi < this.flarePool.length; fi++) this.flarePool[fi].intensity = 0;
  }

  /* ---------------------------------------------------------- cámara */

  _updateCamera(game) {
    const p = game.player, w = game.world;
    const dirX = Math.cos(p.dir), dirZ = Math.sin(p.dir);
    const bob = (p.bobOffset || 0) * 2.2;

    // agacharse bajo techos bajos (el subsuelo CRUEL es más bajo que los ojos
    // del jugador): sin esto la cámara atravesaría el techo.
    const cx = Math.max(0, Math.min(w.W - 1, Math.floor(p.x))), cy = Math.max(0, Math.min(w.H - 1, Math.floor(p.y)));
    const localCeil = (w.ceilH[p.floor][cy * w.W + cx] || 88) / 16;
    const targetEye = Math.min(EYE_H, localCeil - 0.18);
    this._eyeY = this._eyeY == null ? targetEye : this._eyeY + (targetEye - this._eyeY) * 0.12;
    const eyeH = this._eyeY;

    if (this.mode === 'first') {
      this.camera.position.set(p.x, eyeH + bob, p.y);
      this.camera.rotation.y = -p.dir;
      this.camera.rotation.x = p.pitch;
      this.charGroup.visible = false;
    } else {
      this.charGroup.visible = true;
      this.charGroup.position.set(p.x, 0, p.y);
      this.charGroup.rotation.y = -p.dir + Math.PI / 2;
      this._animateCharacter(p);

      const ceilMargin = localCeil - 0.2;
      const camDist = 3.4, camHeight = Math.min(1.9, ceilMargin);
      const wantX = p.x - dirX * camDist * Math.cos(p.pitch * 0.5);
      const wantZ = p.y - dirZ * camDist * Math.cos(p.pitch * 0.5);
      const wantY = camHeight - p.pitch * 2.2;

      const originY = Math.min(1.1, ceilMargin);
      this._camFwd.set(wantX - p.x, wantY - originY, wantZ - p.y);
      const dist = this._camFwd.length();
      this._camFwd.normalize();
      this._camOrigin.set(p.x, originY, p.y);
      this._raycaster.set(this._camOrigin, this._camFwd);
      this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(this.wallMeshesByFloor[p.floor] || [], false);
      let finalDist = dist;
      if (hits.length) finalDist = Math.max(0.6, hits[0].distance - 0.25);

      const camY = Math.min(originY + this._camFwd.y * finalDist, ceilMargin);
      this.camera.position.set(p.x + this._camFwd.x * finalDist, camY, p.y + this._camFwd.z * finalDist);
      this._lookAt.set(p.x + dirX * 2, eyeH, p.y + dirZ * 2);
      const lookAt = this._lookAt;
      this.camera.rotation.order = 'YXZ';
      const dx = lookAt.x - this.camera.position.x, dy = lookAt.y - this.camera.position.y, dz = lookAt.z - this.camera.position.z;
      this.camera.rotation.y = Math.atan2(dx, dz) + Math.PI;
      this.camera.rotation.x = Math.atan2(dy, Math.hypot(dx, dz));
    }
  }

  /* ---------------------------------------------------------- luz/niebla */

  _updateAtmosphere(game) {
    const p = game.player, w = game.world, f = p.floor;
    const bio = w.biomeAt(f, p.x, p.y);
    const bl = BIOME_LIGHT[bio];
    const dayFactor = f === FL.UNDER ? 0 : (game.dayFactor ?? 1);
    const adaptMul = 1 + 1.6 * Math.max(0, Math.min(1, game.darkAdapt || 0));

    this.fogObj.color.setRGB(bl.fr / 255, bl.fg / 255, bl.fb / 255);
    this.fogObj.density = bl.fog * (f === FL.UNDER ? 1.15 : 1);

    if (f === FL.UNDER) {
      this.scene.background.setRGB(bl.fr / 255, bl.fg / 255, bl.fb / 255);
    } else {
      const sky = bl.sky;
      const r = (sky[0] * dayFactor + bl.fr * (1 - dayFactor) * 0.6) / 255;
      const g = (sky[1] * dayFactor + bl.fg * (1 - dayFactor) * 0.6) / 255;
      const b = (sky[2] * dayFactor + bl.fb * (1 - dayFactor) * 0.6) / 255;
      this.scene.background.setRGB(r, g, b);
    }

    // three.js >= r155 usa unidades fotométricas (lux/candela): valores bajos
    // se ven casi negros con MeshStandardMaterial, de ahí la escala generosa.
    this.hemi.intensity = f === FL.UNDER ? 1.1 : (1.1 + 1.6 * dayFactor) * adaptMul;
    this.sun.intensity = f === FL.UNDER ? 0 : 5.6 * dayFactor;
    this.sun.position.set(p.x + 20, 40, p.y + 14);
    this.sunTarget.position.set(p.x, 0, p.y);
    this.ambient.intensity = Math.max(0.5, bl.amb * 1.8) * adaptMul;

    const flashOn = p.flashOn && p.battery > 0;
    this.flash.intensity = flashOn ? 14 : 0;
  }

  _updateDoors() {
    for (const mesh of this.doorAnims) {
      const d = mesh.userData.door;
      mesh.position.y = mesh.userData.baseY + mesh.userData.h * d.open;
      mesh.visible = d.open < 0.995;
    }
  }

  /* ---------------------------------------------------------- bucle */

  render(game) {
    const w = game.world;
    if (w !== this._builtWorld) { this._buildLevel(w); this._builtWorld = w; }

    const p = game.player;
    for (let f = 0; f < 2; f++) if (this.floorGroups[f]) this.floorGroups[f].visible = f === p.floor;

    this._updateCamera(game);
    this._updateAtmosphere(game);
    this._updateDoors();
    this._syncEntities(game);

    this.renderer.render(this.scene, this.camera);
  }
}
