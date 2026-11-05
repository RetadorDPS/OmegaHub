/* =============================================================
   Maze Runner Mobile — Persistencia
   Ranking local (localStorage) + ajustes + sincronización
   opcional con Supabase vía REST (nunca bloquea: timeout + fallback).
   ============================================================= */

import { DEFAULT_BACKEND } from './config.js';

const LS_SCORES = 'mazerunner.scores.v1';
const LS_NAME = 'mazerunner.name';
const LS_CFG = 'mazerunner.cfg.v1';
const LS_SETTINGS = 'mazerunner.settings.v1';

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* almacenamiento no disponible (file://, privado…) */ } }
function safeRemove(key) { try { localStorage.removeItem(key); } catch { /* ignorar */ } }

/* ------------------------------ ranking local ------------------------------ */

export function getScores() {
  try { return JSON.parse(safeGet(LS_SCORES) || '[]'); } catch { return []; }
}

export function addScore(entry) {
  const s = getScores();
  s.push(entry);
  s.sort((a, b) => a.time - b.time);
  const top = s.slice(0, 25);
  safeSet(LS_SCORES, JSON.stringify(top));
  return top;
}

export function clearScores() { safeRemove(LS_SCORES); }

export function getName() { return safeGet(LS_NAME) || ''; }
export function setName(n) { safeSet(LS_NAME, n); }

/* ------------------------------ configuración backend ------------------------------ */

export function getConfigSaved() {
  try { return JSON.parse(safeGet(LS_CFG) || '{}'); } catch { return {}; }
}

/** Config efectiva: lo guardado por el usuario, o el backend por defecto, o {} si se desactivó. */
export function getConfig() {
  const c = getConfigSaved();
  if (c && c.disabled) return {};
  if (c && c.url && c.key) return c;
  return DEFAULT_BACKEND;
}

export function setConfig(c) {
  if (!c || (!c.url && !c.key)) { safeSet(LS_CFG, JSON.stringify({ disabled: true })); return; }
  safeSet(LS_CFG, JSON.stringify(c));
}

/* ------------------------------ ajustes ------------------------------ */

export function getSettings() {
  let s = {};
  try { s = JSON.parse(safeGet(LS_SETTINGS) || '{}'); } catch { s = {}; }
  return { sens: 1.0, invertY: false, bob: 0.5, assist: true, bloom: true, sound: true, ...s };
}

export function saveSettings(s) { safeSet(LS_SETTINGS, JSON.stringify(s || {})); }

/* ------------------------------ Supabase ------------------------------ */

function restUrl(cfg, path) { return `${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`; }
function headers(cfg) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' };
}

/** fetch con tope de tiempo: la red nunca bloquea el arranque del juego. */
async function fetchT(url, opts, ms = 4000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

export async function sbTop(cfg, limit = 10) {
  if (!cfg || !cfg.url || !cfg.key) return null;
  try {
    const r = await fetchT(
      `${restUrl(cfg, 'leaderboard')}?select=username,escape_time_seconds,sector_reached,completed_at&order=escape_time_seconds.asc&limit=${limit}`,
      { headers: headers(cfg) },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function sbSubmit(cfg, entry) {
  if (!cfg || !cfg.url || !cfg.key) return false;
  try {
    const r = await fetchT(restUrl(cfg, 'leaderboard'), {
      method: 'POST',
      headers: { ...headers(cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({
        username: entry.name,
        escape_time_seconds: entry.time,
        sector_reached: entry.sector || 1,
      }),
    });
    return r.ok || r.status === 201;
  } catch { return false; }
}

/** Semilla diaria vía RPC (la crea si no existe). Tope corto: no debe retrasar el arranque. */
export async function sbDailySeedRpc(cfg) {
  if (!cfg || !cfg.url || !cfg.key) return null;
  try {
    const r = await fetchT(restUrl(cfg, 'rpc/get_daily_seed'), {
      method: 'POST', headers: headers(cfg), body: '{}',
    }, 2000);
    if (!r.ok) return null;
    const v = parseInt((await r.text()).trim(), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

export async function sbDailySeed(cfg) {
  if (!cfg || !cfg.url || !cfg.key) return null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetchT(`${restUrl(cfg, 'daily_mazes')}?select=seed_value&maze_date=eq.${today}&limit=1`, { headers: headers(cfg) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.length ? j[0].seed_value : null;
  } catch { return null; }
}

/** Inserta la semilla del día si no existe (requiere permisos de escritura). */
export async function sbEnsureDaily(cfg, seed) {
  if (!cfg || !cfg.url || !cfg.key) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetchT(restUrl(cfg, 'daily_mazes'), {
      method: 'POST',
      headers: { ...headers(cfg), Prefer: 'return=minimal' },
      body: JSON.stringify({ maze_date: today, seed_value: seed, active_sectors: 8, underground_unlocked: true }),
    });
    return r.ok || r.status === 201 || r.status === 409;
  } catch { return false; }
}
