// ==UserScript==
// @name         Phone Agent — manos
// @namespace    https://github.com/RetadorDPS/OmegaHub
// @version      0.3.0
// @updateURL    https://raw.githubusercontent.com/RetadorDPS/OmegaHub/arena/95f82923-omegahub/phone-agent-web/userscript/phone-agent.user.js
// @downloadURL  https://raw.githubusercontent.com/RetadorDPS/OmegaHub/arena/95f82923-omegahub/phone-agent-web/userscript/phone-agent.user.js
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

  /**
   * Espera al final REAL de la respuesta; una pausa de generación no cuenta.
   * La UI suele mostrar un botón Detener mientras la IA trabaja. Si el diseño
   * cambia y no lo encontramos, exigimos una estabilidad mucho más larga; al
   * agotar el plazo rechazamos la tarea en vez de leer un fragmento como final.
   */
  function waitForAssistantCompletion(readState, options, onProgress) {
    options = options || {};
    var intervalMs = options.intervalMs || 200;
    var stableMs = options.stableMs || 2400;
    var noSignalStableMs = options.noSignalStableMs || 20000;
    var timeoutMs = options.timeoutMs || 180000;
    var deadline = Date.now() + timeoutMs;
    var lastText = '';
    var stableSince = Date.now();
    var firstTextAt = 0;
    var sawGenerating = false;
    var lastProgress = 0;
    function reportProgress(message) {
      try { if (onProgress) onProgress(message); }
      catch (e) { log('no pude mostrar el progreso:', e.message); }
    }

    return new Promise(function (resolve, reject) {
      (function tick() {
        var now = Date.now();
        var sample;
        try { sample = readState() || {}; }
        catch (e) { return reject(new Error('No pude leer el estado de la respuesta: ' + e.message)); }
        var text = String(sample.text || '').trim();
        var generating = !!sample.generating;

        if (generating) {
          if (!sawGenerating) reportProgress('La respuesta se está generando. Esperaré a que termine.');
          sawGenerating = true;
        }
        if (text && !firstTextAt) firstTextAt = now;
        if (text !== lastText) {
          lastText = text;
          stableSince = now;
        }

        var requiredStable = sawGenerating ? stableMs : noSignalStableMs;
        if (text && !generating && now - stableSince >= requiredStable &&
            (sawGenerating || now - firstTextAt >= noSignalStableMs)) {
          return resolve(text);
        }

        if (now >= deadline) {
          return reject(new Error('No pude confirmar que la respuesta terminó. No leeré este fragmento como si fuera la respuesta final; revisa la pestaña y vuelve a intentarlo.'));
        }
        if (onProgress && text && !sawGenerating && now - firstTextAt >= 8000 &&
            now - lastProgress >= 8000) {
          lastProgress = now;
          reportProgress('Sigo esperando para asegurarme de no leer una respuesta incompleta.');
        }
        setTimeout(tick, intervalMs);
      })();
    });
  }

  /** Detecta las señales visibles habituales de que Claude/ChatGPT siguen generando. */
  function assistantIsGenerating() {
    try {
      if (document.querySelector('[data-is-streaming="true"], [data-streaming="true"]')) return true;
      var buttons = document.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        var label = [b.getAttribute('aria-label'), b.getAttribute('title'),
          b.getAttribute('data-testid'), b.innerText].filter(Boolean).join(' ');
        if (/(?:stop|detener|parar|generating|generando|stop-button)/i.test(label)) return true;
      }
    } catch (e) { log('no pude detectar si la IA sigue generando:', e.message); }
    return false;
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
        }, p.onProgress);
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
          }, p.onProgress
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
        }, p.onProgress);
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
          }, p.onProgress
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
  async function askAssistant(text, sel, onProgress) {
    if (!text || !String(text).trim()) throw new Error('No me has dado texto para ' + sel.name);
    function reportProgress(message) {
      try { if (onProgress) onProgress(message); }
      catch (e) { log('no pude mostrar el progreso:', e.message); }
    }

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
    reportProgress('Tarea enviada a ' + sel.name + '. Espero la respuesta completa.');

    var nodes = await waitForNewAnswer(sel.answer, before, 30000);
    if (!nodes) throw new Error(sel.name + ' no ha respondido. Puede que necesite iniciar sesión.');

    var answer = await waitForAssistantCompletion(function () {
      var all = document.querySelectorAll(sel.answer);
      var last = all[all.length - 1];
      return {
        text: last ? last.innerText : '',
        generating: assistantIsGenerating()
      };
    }, { timeoutMs: 180000 }, onProgress);

    return { assistant: sel.name, answer: answer.trim() };
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

  // ==========================================================================
  // MODO AUTÓNOMO — voz e interfaz dentro de la propia pestaña
  // ==========================================================================
  // Por qué existe esto: sin esto, la cabina y las manos necesitan un buzón
  // compartido (Supabase) porque viven en orígenes distintos. Pero si la voz y
  // los botones están DENTRO de la pestaña, todo ocurre en un mismo sitio y no
  // hace falta conectar absolutamente nada.
  //
  // El precio: solo actúa sobre la pestaña en la que está. Para mandar en varias
  // a la vez hace falta el modo con bus (más abajo). Los dos conviven.

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  var speechSequence = 0;
  function speak(text) {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      // En móvil, una frase enorme puede cortarse; se encola por fragmentos
      // para que la respuesta larga se lea entera y en orden.
      speechSequence++;
      var token = speechSequence;
      speechSynthesis.cancel();
      var words = String(text).replace(/\s+/g, ' ').trim().split(' ');
      var chunks = [];
      var chunk = '';
      words.forEach(function (word) {
        if (chunk && (chunk.length + word.length + 1 > 650)) {
          chunks.push(chunk);
          chunk = '';
        }
        chunk += (chunk ? ' ' : '') + word;
      });
      if (chunk) chunks.push(chunk);
      var index = 0;
      var voice = (speechSynthesis.getVoices() || []).filter(function (x) {
        return /^es/i.test(x.lang);
      })[0] || null;
      function next() {
        if (token !== speechSequence || index >= chunks.length) return;
        var u = new SpeechSynthesisUtterance(chunks[index++]);
        u.lang = 'es-ES';
        u.rate = 1.03;
        if (voice) u.voice = voice;
        u.onend = next;
        u.onerror = function (e) { log('falló un fragmento de voz:', e.error || 'error'); };
        speechSynthesis.speak(u);
      }
      next();
    } catch (e) { log('no se pudo hablar:', e.message); }
  }

  function listen(onText, onError) {
    if (!SR) {
      // Firefox para Android no reconoce la voz en páginas web. No es un fallo
      // nuestro y no hay polyfill: se usa el dictado del teclado.
      onError('Este navegador no reconoce la voz. Escribe abajo, o usa el micrófono del propio teclado.');
      return;
    }
    var rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (e) { onText(e.results[0][0].transcript.trim()); };
    rec.onerror = function (e) {
      onError(e.error === 'not-allowed' ? 'El navegador no me deja usar el micrófono.'
            : e.error === 'no-speech'   ? 'No he oído nada.'
            : 'No te he oído bien (' + e.error + ').');
    };
    try { rec.start(); } catch (e) { onError('No pude arrancar el micrófono.'); }
  }

  /**
   * Convierte una frase en una acción.
   *
   * Es la MISMA tabla que la de panel/app.js, duplicada a propósito: un
   * userscript tiene que ser un fichero único y autocontenido, no puede
   * importar nada. El test (tests/parser.test.mjs) ejecuta las dos copias sobre
   * los mismos casos, así que si alguien cambia una y se olvida de la otra,
   // falla el test en vez de divergir en silencio.
   */
  function parse(text) {
    // Se quitan los signos de apertura: al dictar por voz salen ("¿qué pone
    // aquí?") y un patrón anclado con ^ no casa si la frase empieza por "¿".
    var t = text.trim().replace(/^[¿?¡!«»"'\s]+/, '').replace(/\s+/g, ' ');
    var m;
    var fin = '(?:$|[\\s.,!?¡¿])';

    if (new RegExp('^(?:est[áa]s ah[íi]|sigues ah[íi]|ping|hola|oye)' + fin, 'i').test(t)) {
      return { action: 'ping', params: {} };
    }
    if (/^(?:lee|leer)\s+(?:la\s+)?p[áa]gina|^qu[ée]\s+pone\s+aqu[íi]|^(?:lee|leer)\s+esto/i.test(t)) {
      return { action: 'read_page', params: {} };
    }
    m = t.match(/^(?:b[úu]sca|b[úu]scar|b[úu]squeme|b[úu]scame|google|googlear)(?:\s+en\s+google)?\s+(.+)$/i);
    if (m) return { action: 'search_google', params: { query: m[1].trim() } };
    m = t.match(/^tradu(?:ce|cir|ceme|ce)\s+(.+?)(?:\s+al?\s+([a-záéíóúñ]+))?$/i);
    if (m) return { action: 'translate', params: { text: m[1].trim(), target: m[2] || 'español' } };
    m = t.match(/^(?:pregunta|dile|pide|preg[úu]ntale)\s+a\s+claude[\s:,]*(.+)$/i);
    if (m) return { action: 'ask_claude', params: { text: m[1].trim() } };
    m = t.match(/^(?:pregunta|dile|pide|preg[úu]ntale)\s+a\s+chat\s?gpt[\s:,]*(.+)$/i);
    if (m) return { action: 'ask_chatgpt', params: { text: m[1].trim() } };
    m = t.match(/^abre\s+(.+)$/i);
    if (m) {
      var target = m[1].trim();
      var known = {
        'claude': 'https://claude.ai', 'claude ai': 'https://claude.ai',
        'chatgpt': 'https://chatgpt.com', 'chat gpt': 'https://chatgpt.com',
        'google': 'https://www.google.com', 'el google': 'https://www.google.com'
      };
      var url = known[target.toLowerCase()] || (/^https?:\/\//i.test(target) ? target : null);
      if (!url) return { action: 'search_google', params: { query: target }, note: 'No conozco esa web, la busco en Google.' };
      return { action: 'open_tab', params: { url: url } };
    }
    return { action: 'ask_claude', params: { text: t } };
  }

  /** Resultado crudo → frase que se puede leer en voz alta. */
  function summarise(action, res) {
    if (action === 'ping') return 'Sí, estoy aquí. Esta pestaña es ' + res.tab + '.';
    if (action === 'search_google') {
      if (!res.results || !res.results.length) return 'No he encontrado resultados para ' + res.query + '.';
      return res.results.slice(0, 3).map(function (r, i) {
        return (i + 1) + '. ' + r.title + '. ' + (r.snippet || '').slice(0, 150);
      }).join('\n\n');
    }
    if (action === 'ask_claude' || action === 'ask_chatgpt' || action === 'translate') {
      return (res.answer || '(respuesta vacía)').slice(0, 6000);
    }
    if (action === 'read_page') return res.title + '\n\n' + (res.text || '').slice(0, 900);
    if (action === 'open_tab') return 'Abriendo ' + res.url;
    return 'Hecho.';
  }

  async function runLocal(text) {
    if (!text || !text.trim()) return;
    var parsed = parse(text);
    uiSay('tú', text);
    if (parsed.note) uiSay('sistema', parsed.note);

    if (!canHandle(parsed.action)) {
      var msg = 'Esta pestaña no puede hacer eso. Aquí solo sé: ' +
        ((currentDriver() ? currentDriver().actions : []).concat(Object.keys(universal))).join(', ') + '.';
      uiSay('agente', msg, 'err');
      speak(msg);
      return;
    }
    var doing = (parsed.action === 'search_google' ? 'Buscando…'
              : parsed.action === 'read_page' ? 'Leyendo…'
              : parsed.action === 'translate' ? 'Traduciendo…'
              : parsed.action === 'open_tab' ? 'Abriendo…'
              : parsed.action === 'ping' ? 'Comprobando…'
              : 'Preguntando…');
    var id = uiSay('agente', doing, 'pending');

    try {
      var d = currentDriver();
      var fn = (d && d[parsed.action]) || universal[parsed.action];
      var params = Object.assign({}, parsed.params || {}, {
        onProgress: function (message) {
          uiReplace(id, message, 'pending');
          speak(message);
        }
      });
      if (parsed.action === 'ask_claude' || parsed.action === 'ask_chatgpt' || parsed.action === 'translate') {
        speak('He enviado tu petición. Esperaré a que termine la respuesta completa y luego te la leeré.');
      }
      var res = await fn(params);
      var out = summarise(parsed.action, res);
      uiReplace(id, out);
      speak(out);
    } catch (e) {
      uiReplace(id, 'Ha fallado: ' + (e.message || e), 'err');
      speak('Ha fallado.');
    }
  }

  // ── Interfaz flotante ────────────────────────────────────────────────────
  //
  // Va dentro de un shadow root a propósito: Google y Claude tienen CSS muy
  // agresivo y, sin aislamiento, cualquiera de sus reglas puede destrozar el
  // widget. Con shadow DOM sus estilos no entran y los nuestros no salen.

  var ui = null;

  function mountUI() {
    if (ui) return ui;
    var host = document.createElement('div');
    host.id = 'phoneagent-host';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '.fab{position:fixed;right:14px;bottom:14px;z-index:2147483647;width:56px;height:56px;' +
        'border-radius:50%;border:none;background:#6c63ff;color:#fff;font-size:22px;cursor:pointer;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.4);touch-action:manipulation}' +
      '.fab.busy{background:#d69b2a}' +
      '.panel{position:fixed;right:12px;bottom:80px;z-index:2147483647;width:min(92vw,360px);' +
        'max-height:64vh;display:none;flex-direction:column;background:#171a21;color:#e8eaed;' +
        'border:1px solid #2a2f3a;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.5)}' +
      '.panel.open{display:flex}' +
      '.head{padding:9px 12px;font-size:12px;color:#9aa2b1;border-bottom:1px solid #2a2f3a;' +
        'display:flex;justify-content:space-between;gap:8px;align-items:center}' +
      '.log{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;' +
        'min-height:90px;font-size:14px;line-height:1.45}' +
      '.e{display:flex;flex-direction:column;gap:2px}' +
      '.e .w{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#9aa2b1}' +
      '.e .b{padding:8px 10px;border-radius:11px;background:#1e222b;border:1px solid #2a2f3a;' +
        'white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.e.me{align-items:flex-end}.e.me .b{background:#23283a;border-color:#33405f}' +
      '.e.err .b{background:#2a1a1a;border-color:#5e2a28}' +
      '.e.pending .b{color:#9aa2b1;font-style:italic}' +
      '.row{display:flex;gap:6px;padding:9px;border-top:1px solid #2a2f3a}' +
      '.row input{flex:1;min-width:0;padding:10px;border-radius:9px;border:1px solid #2a2f3a;' +
        'background:#1e222b;color:#e8eaed;font-size:14px}' +
      '.row button{width:42px;border:none;border-radius:9px;background:#6c63ff;color:#fff;' +
        'font-size:16px;cursor:pointer}' +
      '.row button.mic{background:#2fa96b}.row button.mic.off{background:#3a3f4a}' +
      '.chips{display:flex;gap:5px;flex-wrap:wrap;padding:0 9px 9px}' +
      '.chips button{font-size:11px;padding:4px 8px;border-radius:999px;border:1px solid #2a2f3a;' +
        'background:#1e222b;color:#9aa2b1;cursor:pointer}' +
      '</style>' +
      '<button class="fab" aria-label="Phone Agent">🤖</button>' +
      '<div class="panel">' +
        '<div class="head"><span class="who"></span><button class="mute" style="background:none;border:none;color:#9aa2b1;cursor:pointer;font-size:13px">🔊 voz</button></div>' +
        '<div class="log"></div>' +
        '<div class="chips"></div>' +
        '<div class="row">' +
          '<button class="mic" aria-label="Hablar">🎤</button>' +
          '<input type="text" placeholder="Di o escribe…">' +
          '<button class="go" aria-label="Enviar">➤</button>' +
        '</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(host);

    var panel = root.querySelector('.panel');
    var logEl = root.querySelector('.log');
    var input = root.querySelector('input');
    var fab = root.querySelector('.fab');
    var micBtn = root.querySelector('.mic');
    var voicing = true;

    root.querySelector('.who').textContent =
      location.host + (SR ? '' : ' · sin voz de entrada');
    if (!SR) micBtn.classList.add('off');

    var chips = ['estás ahí', 'lee la página', 'busca el tiempo en Madrid', 'traduce hello al español'];
    var chipsEl = root.querySelector('.chips');
    chips.forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c;
      b.onclick = function () { runLocal(c); };
      chipsEl.appendChild(b);
    });

    fab.onclick = function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) input.focus(); };
    root.querySelector('.go').onclick = function () {
      var v = input.value; input.value = ''; runLocal(v);
    };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') { var v = input.value; input.value = ''; runLocal(v); }
    };
    micBtn.onclick = function () {
      if (!SR) { uiSay('sistema', 'Este navegador no reconoce la voz. Escribe, o usa el micrófono del teclado.', 'err'); return; }
      micBtn.classList.add('busy');
      listen(function (text) { micBtn.classList.remove('busy'); runLocal(text); },
             function (err) { micBtn.classList.remove('busy'); uiSay('sistema', err, 'err'); });
    };
    root.querySelector('.mute').onclick = function (e) {
      voicing = !voicing;
      e.target.textContent = voicing ? '🔊 voz' : '🔇 voz';
    };

    ui = {
      say: function (who, text, cls) {
        var d = document.createElement('div');
        d.className = 'e ' + (cls || '');
        var w = document.createElement('span'); w.className = 'w'; w.textContent = who;
        var b = document.createElement('div'); b.className = 'b'; b.textContent = text;
        d.appendChild(w); d.appendChild(b);
        logEl.insertBefore(d, logEl.firstChild);
        while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
        panel.classList.add('open');
        return d;
      },
      replace: function (node, text, cls) {
        if (!node) return;
        node.className = 'e ' + (cls || '');
        node.querySelector('.b').textContent = text;
      },
      busy: function (on) { fab.classList.toggle('busy', !!on); }
    };
    return ui;
  }

  function uiSay(who, text, cls) { return mountUI().say(who, text, cls); }
  function uiReplace(node, text, cls) { mountUI().replace(node, text, cls); }

  // ── Arranque ─────────────────────────────────────────────────────────────

  function start() {
    var d = currentDriver();
    log('activo en', location.host, d ? '(driver ' + d.key + ')' : '(solo acciones universales)');

    // La interfaz va SIEMPRE: es lo que permite usarlo sin configurar nada.
    mountUI();

    if (!isConfigured()) {
      // No es un error: sin Supabase funciona en modo autónomo (esta pestaña).
      badge('listo (esta pestaña)', 'ok');
      log('Modo autónomo: funciona en esta pestaña sin conectar nada. ' +
          'Para mandar en varias pestañas a la vez: window.phoneAgent.setup({supabaseUrl, anonKey, channel})');
      return;
    }
    badge('a la escucha', 'ok');
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
    can: canHandle,
    run: runLocal,          // ejecutar algo a mano desde la consola
    parse: parse,           // expuesto para que el test use la copia real
    ui: mountUI
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
