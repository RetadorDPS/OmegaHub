// ==UserScript==
// @name         Phone Agent — manos
// @namespace    https://github.com/RetadorDPS/OmegaHub
// @version      0.1.0
// @description  Ejecutor de Phone Agent: recibe tareas de la cabina y conduce Google, Claude y ChatGPT.
// @author       Phone Agent
// @match        https://www.google.com/*
// @match        https://google.com/*
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

/**
 * LAS MANOS. Corre dentro de cada pestaña (Google, Claude, ChatGPT) y hace lo
 * que la cabina le pide.
 *
 * Cómo se entera de las tareas: sondeando la tabla `web_tasks` de Supabase.
 * No hay WebSocket ni servidor propio: PostgREST manda cabeceras CORS, así que
 * un fetch normal sirve desde cualquier origen. Es menos elegante que Realtime
 * y más que suficiente para un prototipo.
 *
 * REGLA DE ENRUTAMIENTO: cada pestaña solo reclama tareas que sabe ejecutar.
 * La de Claude no toca las de Google. Por eso no hace falta decirle a la cabina
 * en qué pestaña estás: se encarga sola.
 *
 * LO QUE NO HACE: nada fuera de las pestañas. No hay API de accesibilidad ni
 * permisos del sistema; solo el DOM de las páginas que tienes abiertas.
 */
(function () {
  'use strict';

  var TAG = '[PhoneAgent]';
  var POLL_MS = 1200;

  // ── Utilidades ───────────────────────────────────────────────────────────

  function log() {
    var args = [TAG].concat([].slice.call(arguments));
    console.log.apply(console, args);
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /** Espera a que exista un elemento. Devuelve null si se agota el tiempo. */
  function waitFor(selector, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var deadline = Date.now() + timeoutMs;
    return new Promise(function (resolve) {
      (function tick() {
        var el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 150);
      })();
    });
  }

  /**
   * Escribe texto en un campo. Vale para <input>, <textarea> y contenteditable.
   *
   * El truco importante: Claude y ChatGPT usan ProseMirror sobre React. Poner
   * `.value` o `.textContent` NO funciona, porque React no se entera y el botón
   * de enviar se queda deshabilitado. `execCommand('insertText')` sí pasa por el
   * camino que sus manejadores esperan.
   */
  function typeInto(el, text) {
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      return true;
    }
    // Campos normales: hay que lanzar el evento 'input' a mano o React no lo ve.
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Espera a que un texto deje de crecer: así se sabe que la IA terminó. */
  function waitUntilStable(getText, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    var deadline = Date.now() + timeoutMs;
    var last = '';
    var stableSince = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        var now = getText() || '';
        if (now !== last) {
          last = now;
          stableSince = Date.now();
        } else if (now.length > 0 && Date.now() - stableSince > 1800) {
          return resolve(now);
        }
        if (Date.now() > deadline) return resolve(now);
        setTimeout(tick, 400);
      })();
    });
  }

  // ── Bus con Supabase ─────────────────────────────────────────────────────

  function fetchJson(method, url, body, extraHeaders) {
    return new Promise(function (resolve, reject) {
      var opts = {
        method: method,
        url: url,
        headers: {
          'apikey': cfg().anonKey,
          'Authorization': 'Bearer ' + cfg().anonKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      };
      if (extraHeaders) for (var h in extraHeaders) opts.headers[h] = extraHeaders[h];
      if (body !== undefined) opts.data = JSON.stringify(body);
      // GM_xmlhttpRequest salta las restricciones de origen del navegador.
      // Con @grant none habría que usar fetch y depender del CORS de PostgREST
      // (que lo manda, pero así no hay sorpresas con cabeceras preflight).
      if (typeof GM_xmlhttpRequest === 'function') {
        opts.onload = function (r) {
          if (r.status >= 200 && r.status < 300) resolve(safeParse(r.responseText));
          else reject(new Error('HTTP ' + r.status + ': ' + (r.responseText || '').slice(0, 200)));
        };
        opts.onerror = function () { reject(new Error('Error de red hablando con Supabase')); };
        opts.ontimeout = function () { reject(new Error('Supabase no respondió a tiempo')); };
        GM_xmlhttpRequest(opts);
      } else {
        fetch(url, {
          method: method,
          headers: opts.headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); });
          return r.json();
        }).then(resolve, reject);
      }
    });
  }

  function safeParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function rest(path, query) {
    return cfg().supabaseUrl.replace(/\/+$/, '') + '/rest/v1/' + path + (query ? '?' + query : '');
  }

  // ── Configuración ────────────────────────────────────────────────────────

  var DEFAULTS = { supabaseUrl: '', anonKey: '', channel: '', enabled: true };

  function cfg() {
    var out = {};
    for (var k in DEFAULTS) {
      var v = (typeof GM_getValue === 'function') ? GM_getValue(k, DEFAULTS[k]) : null;
      if (v === null || v === undefined || v === '') {
        try { v = localStorage.getItem('phoneagent_' + k) || DEFAULTS[k]; } catch (e) { v = DEFAULTS[k]; }
      }
      out[k] = (k === 'enabled') ? (v === true || v === 'true') : v;
    }
    return out;
  }

  function saveCfg(patch) {
    for (var k in patch) {
      if (typeof GM_setValue === 'function') GM_setValue(k, patch[k]);
      try { localStorage.setItem('phoneagent_' + k, String(patch[k])); } catch (e) { /* privado */ }
    }
  }

  function isConfigured() {
    var c = cfg();
    return !!(c.supabaseUrl && c.anonKey && c.channel);
  }

  // ── Drivers: qué sabe hacer cada pestaña ─────────────────────────────────

  var drivers = [
    {
      key: 'google',
      label: 'Google',
      matches: function () { return /(^|\.)google\.[a-z.]+$/i.test(location.hostname); },
      actions: ['search_google', 'read_page', 'open_tab', 'ping'],

      search_google: async function (p) {
        var query = (p.query || '').trim();
        if (!query) throw new Error('Falta el texto a buscar');
        var box = await waitFor('textarea[name="q"], input[name="q"]', 6000);
        if (!box) throw new Error('No encuentro la caja de búsqueda de Google');
        typeInto(box, query);
        await sleep(250);
        var form = box.closest('form');
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
        else if (form) form.submit();
        else { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); }
        await sleep(1800);
        return { query: query, results: readGoogleResults() };
      }
    },

    {
      key: 'claude',
      label: 'Claude',
      matches: function () { return /(^|\.)claude\.ai$/i.test(location.hostname); },
      actions: ['ask_claude', 'translate', 'read_page', 'open_tab', 'ping'],

      ask_claude: async function (p) {
        return askAssistant(p.text, {
          box: 'div.ProseMirror[contenteditable="true"], textarea[placeholder]',
          send: 'button[aria-label*="Send" i], button[aria-label*="Enviar" i], button[aria-label*="send message" i]',
          answer: '[data-is-streaming], .font-claude-message, [class*="response"]',
          name: 'Claude'
        });
      },

      translate: async function (p) {
        var target = p.target || 'español';
        var texto = p.text || '';
        if (!texto) throw new Error('No me has dado texto que traducir');
        return askAssistant(
          'Traduce al ' + target + ' el siguiente texto. Devuelve solo la traducción, sin comentarios.\n\n' + texto,
          {
            box: 'div.ProseMirror[contenteditable="true"], textarea[placeholder]',
            send: 'button[aria-label*="Send" i], button[aria-label*="Enviar" i]',
            answer: '[data-is-streaming], .font-claude-message, [class*="response"]',
            name: 'Claude'
          }
        );
      }
    },

    {
      key: 'chatgpt',
      label: 'ChatGPT',
      matches: function () { return /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname); },
      actions: ['ask_chatgpt', 'translate', 'read_page', 'open_tab', 'ping'],

      ask_chatgpt: async function (p) {
        return askAssistant(p.text, {
          box: '#prompt-textarea, div.ProseMirror[contenteditable="true"], textarea',
          send: 'button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="Enviar" i]',
          answer: '[data-message-author-role="assistant"]',
          name: 'ChatGPT'
        });
      },

      translate: async function (p) {
        var target = p.target || 'español';
        var texto = p.text || '';
        if (!texto) throw new Error('No me has dado texto que traducir');
        return askAssistant(
          'Traduce al ' + target + ' el siguiente texto. Devuelve solo la traducción, sin comentarios.\n\n' + texto,
          {
            box: '#prompt-textarea, div.ProseMirror[contenteditable="true"], textarea',
            send: 'button[data-testid="send-button"], button[aria-label*="Send" i]',
            answer: '[data-message-author-role="assistant"]',
            name: 'ChatGPT'
          }
        );
      }
    }
  ];

  /** Acciones que cualquier pestaña puede hacer. */
  var universal = {
    ping: async function () {
      return {
        ok: true,
        tab: location.host,
        title: document.title,
        url: location.href,
        driver: currentDriver() ? currentDriver().key : 'ninguno',
        hora: new Date().toISOString()
      };
    },

    open_tab: async function (p) {
      if (!p.url) throw new Error('Falta la URL');
      // window.open desde un script puede quedar bloqueado si no hubo gesto del
      // usuario. Se avisa en vez de fallar en silencio.
      var w = window.open(p.url, '_blank');
      if (!w) throw new Error('El navegador bloqueó la pestaña nueva. Ábrela a mano la primera vez.');
      return { ok: true, url: p.url };
    },

    read_page: async function () {
      var main = document.querySelector('main, article, #content, body');
      var text = (main ? main.innerText : document.body.innerText) || '';
      return {
        title: document.title,
        url: location.href,
        chars: text.length,
        // Se recorta: mandar 40.000 caracteres a la cabina no aporta y satura.
        text: text.slice(0, 4000)
      };
    }
  };

  function currentDriver() {
    for (var i = 0; i < drivers.length; i++) {
      if (drivers[i].matches()) return drivers[i];
    }
    return null;
  }

  /** ¿Puede ESTA pestaña ejecutar la acción? */
  function canHandle(action) {
    if (universal[action]) return true;
    var d = currentDriver();
    return !!(d && d[action]);
  }

  // ── Lectura de resultados ────────────────────────────────────────────────

  function readGoogleResults() {
    var out = [];
    var titles = document.querySelectorAll('#search h3, div[data-hveid] h3');
    for (var i = 0; i < titles.length && out.length < 6; i++) {
      var h3 = titles[i];
      var link = h3.closest('a');
      // El resumen suele estar en un contenedor hermano del enlace.
      var block = link ? link.closest('div[data-hveid], div.g, div') : h3.parentElement;
      var snippet = '';
      if (block) {
        var spans = block.querySelectorAll('span, div');
        for (var j = 0; j < spans.length; j++) {
          var t = (spans[j].innerText || '').trim();
          if (t.length > 60 && t !== h3.innerText) { snippet = t; break; }
        }
      }
      out.push({
        title: (h3.innerText || '').trim(),
        url: link ? link.href : null,
        snippet: snippet.slice(0, 400)
      });
    }
    return out;
  }

  /**
   * Flujo común de "preguntar a un asistente": escribir, enviar, esperar a que
   * la respuesta deje de crecer. Compartido entre Claude y ChatGPT porque el
   * esqueleto es idéntico; solo cambian los selectores.
   */
  async function askAssistant(text, sel) {
    if (!text || !String(text).trim()) throw new Error('No me has dado texto para ' + sel.name);

    var box = await waitFor(sel.box, 8000);
    if (!box) throw new Error('No encuentro la caja de texto de ' + sel.name + '. ¿Estás dentro de una conversación?');

    // Contar respuestas antes de enviar, para leer la NUEVA y no la anterior.
    var before = document.querySelectorAll(sel.answer).length;

    typeInto(box, String(text));
    await sleep(400);

    var send = document.querySelector(sel.send);
    if (!send) throw new Error('No encuentro el botón de enviar en ' + sel.name);
    if (send.disabled) {
      // React aún no se ha enterado del texto. Un Enter suele desbloquearlo.
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(400);
      send = document.querySelector(sel.send);
      if (send && send.disabled) throw new Error('El botón de enviar de ' + sel.name + ' sigue bloqueado');
    }
    send.click();

    var nodes = await waitForNewAnswer(sel.answer, before, 15000);
    if (!nodes) throw new Error(sel.name + ' no ha respondido. Puede que necesite iniciar sesión.');

    var answer = await waitUntilStable(function () {
      var all = document.querySelectorAll(sel.answer);
      var last = all[all.length - 1];
      return last ? last.innerText : '';
    }, 90000);

    return { assistant: sel.name, answer: (answer || '').trim().slice(0, 6000) };
  }

  function waitForNewAnswer(selector, countBefore, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    return new Promise(function (resolve) {
      (function tick() {
        var all = document.querySelectorAll(selector);
        if (all.length > countBefore) return resolve(all);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 300);
      })();
    });
  }

  // ── Latido ───────────────────────────────────────────────────────────────

  /**
   * Escribe en web_tabs que esta pestaña sigue abierta. Es lo único que permite
   * a la cabina dibujar la barra de pestañas: desde una página web no hay forma
   * de preguntar al navegador qué más hay abierto.
   *
   * Es un UPSERT sobre (channel, origin), así que recargar la página no duplica
   * la fila: se actualiza la que ya existía.
   */
  async function heartbeat() {
    if (!isConfigured() || !cfg().enabled) return;
    var d = currentDriver();
    var row = {
      channel: cfg().channel,
      driver_key: d ? d.key : 'ninguno',
      origin: location.origin,
      title: document.title.slice(0, 120),
      actions: (d ? d.actions : []).concat(Object.keys(universal)),
      last_seen: new Date().toISOString()
    };
    try {
      await fetchJson('POST',
        rest('web_tabs', 'on_conflict=channel,origin'),
        row,
        { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    } catch (e) {
      // Un latido perdido no es grave; el siguiente lo arregla.
      log('latido fallido:', e.message);
    }
  }

  // ── Bucle principal ──────────────────────────────────────────────────────

  var running = false;
  var claimed = {};   // ids ya vistos, para no ejecutar dos veces la misma tarea

  async function poll() {
    if (running) return;
    running = true;
    try {
      if (!isConfigured()) { badge('sin configurar', 'warn'); return; }
      var c = cfg();
      if (!c.enabled) { badge('en pausa', 'warn'); return; }

      var q = 'channel=eq.' + encodeURIComponent(c.channel) +
              '&status=eq.pending&order=created_at.asc&limit=5&select=id,action,params,created_at';
      var pending = await fetchJson('GET', rest('web_tasks', q));
      if (!pending || !pending.length) { badge('a la escucha', 'ok'); return; }

      for (var i = 0; i < pending.length; i++) {
        var task = pending[i];
        if (claimed[task.id]) continue;
        if (!canHandle(task.action)) continue;   // otra pestaña se encargará
        claimed[task.id] = true;
        await execute(task);
      }
      badge('a la escucha', 'ok');
    } catch (e) {
      badge('error', 'err');
      log('fallo al sondear:', e.message);
    } finally {
      running = false;
    }
  }

  async function execute(task) {
    log('ejecutando', task.action, task.params);
    // Reclamo condicional: si otra pestaña ya lo cogió, el UPDATE no afecta a
    // ninguna fila y nos retiramos. Evita ejecutar lo mismo dos veces.
    var claimUrl = rest('web_tasks', 'id=eq.' + encodeURIComponent(task.id) + '&status=eq.pending');
    var claimedRows = await fetchJson('PATCH', claimUrl, { status: 'running', origin_url: location.href });
    if (!claimedRows || claimedRows.length === 0) {
      log('la tarea ya la cogió otra pestaña');
      return;
    }

    var url = rest('web_tasks', 'id=eq.' + encodeURIComponent(task.id));
    try {
      var d = currentDriver();
      var fn = (d && d[task.action]) || universal[task.action];
      if (!fn) throw new Error('Ninguna pestaña abierta sabe hacer "' + task.action + '"');
      var result = await fn(task.params || {});
      await fetchJson('PATCH', url, { status: 'done', result: result });
      badge('hecho', 'ok');
    } catch (e) {
      log('error al ejecutar:', e.message);
      await fetchJson('PATCH', url, { status: 'failed', error: String(e.message || e) });
      badge('falló', 'err');
    }
  }

  // ── Indicador visual ─────────────────────────────────────────────────────

  var badgeEl = null;
  function badge(text, kind) {
    try {
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.id = 'phoneagent-badge';
        badgeEl.style.cssText =
          'position:fixed;bottom:10px;left:10px;z-index:2147483647;' +
          'font:12px/1.3 system-ui,sans-serif;padding:5px 9px;border-radius:12px;' +
          'color:#fff;background:#333;opacity:.82;pointer-events:none;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.4);max-width:60vw;' +
          'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        document.documentElement.appendChild(badgeEl);
      }
      var colors = { ok: '#1a7f4b', warn: '#a06a00', err: '#a32020' };
      badgeEl.style.background = colors[kind] || '#333';
      var d = currentDriver();
      badgeEl.textContent = '🤖 ' + (d ? d.label : 'web') + ' · ' + text;
    } catch (e) { /* no romper la página por un adorno */ }
  }

  // ── Arranque ─────────────────────────────────────────────────────────────

  function start() {
    var d = currentDriver();
    log('activo en', location.host, d ? '(driver ' + d.key + ')' : '(solo acciones universales)');
    if (!isConfigured()) {
      badge('sin configurar', 'warn');
      log('Falta configuración. Desde la consola: window.phoneAgent.setup({supabaseUrl, anonKey, channel})');
    } else {
      badge('a la escucha', 'ok');
    }
    setInterval(poll, POLL_MS);
    setInterval(heartbeat, 5000);
    heartbeat();
    poll();
    // El título cambia al navegar; se refresca el latido para no mostrar uno viejo.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) heartbeat();
    });
  }

  // API desde la consola del navegador, para configurar sin recompilar nada.
  window.phoneAgent = {
    setup: function (o) { saveCfg(o); log('configurado, recargando…'); setTimeout(function () { location.reload(); }, 400); },
    config: cfg,
    save: saveCfg,
    pause: function () { saveCfg({ enabled: false }); badge('en pausa', 'warn'); },
    resume: function () { saveCfg({ enabled: true }); poll(); },
    test: function () { return poll(); },
    drivers: function () { return drivers.map(function (x) { return x.key; }); },
    can: canHandle
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
