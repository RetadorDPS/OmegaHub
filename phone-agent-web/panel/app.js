/* Phone Agent · cabina.
 *
 * La cabina es la boca y los oídos; las manos están en las pestañas (el
 * userscript). No pueden hablarse directamente porque viven en orígenes
 * distintos, así que se escriben en la tabla web_tasks de Supabase.
 *
 * Nada de esto necesita servidor propio: PostgREST responde con CORS y por eso
 * un fetch normal basta desde GitHub Pages.
 */
(function () {
  'use strict';

  var LS = 'phoneagent_panel_v1';
  var POLL_MS = 1200;
  var TABS_STALE_MS = 15000;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    cfg: load(),
    tasks: {},        // id -> {status, action, result, error}
    listening: false,
    lastSpoken: ''
  };

  // ── Configuración ────────────────────────────────────────────────────

  function load() {
    try {
      return Object.assign(
        { supabaseUrl: '', anonKey: '', channel: '', voice: true },
        JSON.parse(localStorage.getItem(LS) || '{}')
      );
    } catch (e) {
      return { supabaseUrl: '', anonKey: '', channel: '', voice: true };
    }
  }

  function save() { localStorage.setItem(LS, JSON.stringify(state.cfg)); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback para contextos sin crypto.randomUUID (http, navegadores viejos).
    var b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(b)
      : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function configured() {
    return !!(state.cfg.supabaseUrl && state.cfg.anonKey && state.cfg.channel);
  }

  // ── Hablar con Supabase ──────────────────────────────────────────────

  function rest(path, query) {
    return state.cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/' + path + (query ? '?' + query : '');
  }

  function api(method, path, query, body, prefer) {
    var headers = {
      'apikey': state.cfg.anonKey,
      'Authorization': 'Bearer ' + state.cfg.anonKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (prefer) headers['Prefer'] = prefer;
    return fetch(rest(path, query), {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = 'HTTP ' + r.status;
          try { msg = JSON.parse(t).message || msg; } catch (e) { /* no era JSON */ }
          throw new Error(msg + (r.status === 401 ? ' — revisa la anon key' : ''));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  // ── Voz ──────────────────────────────────────────────────────────────

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function speak(text) {
    if (!state.cfg.voice || !text) return;
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();   // corta lo anterior: las respuestas llegan seguidas
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = 1.03;
      var v = speechSynthesis.getVoices().filter(function (x) {
        return /^es/i.test(x.lang);
      })[0];
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* no romper la cabina por el audio */ }
  }

  function startListening() {
    if (!SR) return;
    var rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      state.listening = true;
      $('btnMic').classList.add('listening');
      $('micLabel').textContent = 'Te escucho…';
    };
    rec.onresult = function (e) {
      var text = e.results[0][0].transcript.trim();
      if (text) { $('cmdInput').value = text; runCommand(text); }
    };
    rec.onerror = function (e) {
      // 'not-allowed' = permiso de micrófono denegado; 'no-speech' = silencio.
      var msg = e.error === 'not-allowed'
        ? 'El navegador no me deja usar el micrófono. Revisa el permiso del sitio.'
        : e.error === 'no-speech' ? 'No he oído nada.'
        : 'No te he oído bien (' + e.error + ').';
      setMicIdle();
      push('sistema', msg, 'err');
      speak(msg);
    };
    rec.onend = setMicIdle;

    try { rec.start(); } catch (e) { setMicIdle(); }
  }

  function setMicIdle() {
    state.listening = false;
    $('btnMic').classList.remove('listening');
    $('micLabel').textContent = SR ? 'Pulsa y habla' : 'Sin micrófono';
  }

  // ── Entender lo que dice ─────────────────────────────────────────────

  /**
   * Convierte una frase en español en una tarea. A propósito simple: son reglas,
   * no un modelo. Para un prototipo es mejor predecible que listo, y cuando algo
   * no encaja se manda a Claude, que es lo que el usuario espera de todos modos.
   */
  function parse(text) {
    // Se quitan los signos de apertura: al dictar por voz salen ("¿qué pone
    // aquí?") y un patrón anclado con ^ no casa si la frase empieza por "¿".
    var t = text.trim().replace(/^[¿?¡!«»"'\s]+/, '').replace(/\s+/g, ' ');
    var m;

    // IMPORTANTE: los patrones se aplican sobre el texto ORIGINAL con la
    // bandera /i, nunca sobre una copia en minúsculas. Si se pasa por
    // .toLowerCase() primero, lo que se captura y se manda a Claude llega en
    // minúsculas ("qué es el RNA" → "qué es el rna").
    //
    // Y nada de \b al final de los patrones: en JavaScript \w no incluye las
    // vocales acentuadas, así que "estás ahí" no tiene frontera de palabra tras
    // la "í" y el patrón no casa. Se remata con (?:$|[\s.,!?¡¿]).
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
    if (m) {
      return { action: 'translate', params: { text: m[1].trim(), target: m[2] || 'español' } };
    }

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
      if (!url) {
        // No conozco esa web: lo más útil es buscarla en vez de fallar.
        return { action: 'search_google', params: { query: target }, note: 'No conozco esa web, la busco en Google.' };
      }
      return { action: 'open_tab', params: { url: url } };
    }

    // Sin patrón: se lo paso a Claude. Es el destino más útil por defecto.
    return { action: 'ask_claude', params: { text: t } };
  }

  var ACTION_LABEL = {
    search_google: 'buscando en Google',
    ask_claude: 'preguntando a Claude',
    ask_chatgpt: 'preguntando a ChatGPT',
    translate: 'traduciendo',
    read_page: 'leyendo la página',
    open_tab: 'abriendo pestaña',
    ping: 'comprobando las pestañas'
  };

  // ── Enviar tareas y recoger resultados ───────────────────────────────

  function runCommand(text) {
    if (!text.trim()) return;
    if (!configured()) {
      push('sistema', 'Falta la conexión a Supabase. Toca ⚙ arriba y pega la URL, la anon key y genera un canal.', 'err');
      $('configDialog').showModal();
      return;
    }
    var parsed = parse(text);
    push('tú', text, 'me');
    if (parsed.note) push('sistema', parsed.note, '');

    var entryId = 'local-' + uuid();
    push('agente', ACTION_LABEL[parsed.action] + '…', 'pending', entryId);

    api('POST', 'web_tasks', undefined, {
      channel: state.cfg.channel,
      action: parsed.action,
      params: parsed.params,
      status: 'pending'
    }, 'return=representation')
      .then(function (rows) {
        var row = rows && rows[0];
        if (row) state.tasks[row.id] = { entryId: entryId, status: 'pending' };
      })
      .catch(function (e) {
        replace(entryId, 'No pude enviar la tarea: ' + e.message, 'err');
        speak('No he podido enviar la tarea.');
      });
  }

  /** Sondea el bus: resultados nuevos y pestañas vivas. */
  function poll() {
    if (!configured()) { setStatus('warn', 'Sin conectar — toca ⚙ para pegar tu Supabase'); return; }

    api('GET', 'web_tasks',
      'channel=eq.' + encodeURIComponent(state.cfg.channel) +
      '&order=created_at.desc&limit=12&select=id,action,status,result,error,origin_url,created_at')
      .then(renderTasks)
      .catch(function (e) { setStatus('err', 'Supabase no responde: ' + e.message); });

    api('GET', 'web_tabs',
      'channel=eq.' + encodeURIComponent(state.cfg.channel) +
      '&select=driver_key,origin,title,actions,last_seen')
      .then(renderTabs)
      .catch(function () { /* el panel sigue aunque esto falle */ });
  }

  function renderTasks(rows) {
    if (!rows) return;
    var alive = rows.filter(function (r) { return r.status === 'done' || r.status === 'failed'; });
    setStatus(alive.length ? 'ok' : 'warn',
      alive.length ? 'Conectado · canal ' + state.cfg.channel.slice(0, 8) + '…'
                   : 'Conectado, esperando al ejecutor');

    rows.forEach(function (r) {
      var known = state.tasks[r.id];
      if (known && known.status === r.status) return;
      state.tasks[r.id] = { entryId: known && known.entryId, status: r.status };

      if (r.status === 'failed') {
        var msg = 'Ha fallado: ' + (r.error || 'motivo desconocido');
        known && known.entryId ? replace(known.entryId, msg, 'err') : push('agente', msg, 'err');
        speak('Ha fallado.');
        return;
      }
      if (r.status !== 'done' || !r.result) return;

      var text = summarise(r.action, r.result);
      known && known.entryId ? replace(known.entryId, text, '') : push('agente', text, '');
      speak(text);
    });
  }

  /** Convierte el resultado crudo en una frase que se pueda leer en voz alta. */
  function summarise(action, res) {
    try {
      if (action === 'ping') {
        return 'Sí, estoy aquí. Tengo abierta ' + res.tab + ' con el ejecutor ' + res.driver + '.';
      }
      if (action === 'search_google') {
        if (!res.results || !res.results.length) return 'No he encontrado resultados para ' + res.query + '.';
        return res.results.slice(0, 3).map(function (r, i) {
          return (i + 1) + '. ' + r.title + '. ' + (r.snippet || '').slice(0, 160);
        }).join('\n\n');
      }
      if (action === 'ask_claude' || action === 'ask_chatgpt' || action === 'translate') {
        return (res.answer || '(respuesta vacía)').slice(0, 1200);
      }
      if (action === 'read_page') {
        return res.title + '\n\n' + (res.text || '').slice(0, 900);
      }
      if (action === 'open_tab') {
        return 'Abriendo ' + res.url;
      }
      return JSON.stringify(res).slice(0, 400);
    } catch (e) {
      return 'He recibido algo que no sé resumir.';
    }
  }

  function renderTabs(rows) {
    var bar = $('tabsBar');
    var now = Date.now();
    var live = (rows || []).filter(function (r) {
      return now - new Date(r.last_seen).getTime() < TABS_STALE_MS;
    });
    if (!live.length) {
      bar.innerHTML = '<span class="tabsHint">Ningún ejecutor conectado — instala el userscript (⚙ → Cómo conectar)</span>';
      return;
    }
    bar.innerHTML = '';
    live.forEach(function (r) {
      var el = document.createElement('span');
      el.className = 'tab';
      var name = r.driver_key === 'ninguno' ? 'web' : r.driver_key;
      el.textContent = name + ' · ' + (r.actions || []).length + ' acciones';
      el.title = r.origin;
      bar.appendChild(el);
    });
  }

  // ── Interfaz ─────────────────────────────────────────────────────────

  function setStatus(kind, text) {
    $('stateDot').className = 'dot ' + kind;
    $('statusLine').textContent = text;
  }

  function push(who, text, cls, entryId) {
    var li = document.createElement('li');
    li.className = 'entry ' + (cls || '');
    if (entryId) li.id = entryId;
    var w = document.createElement('span');
    w.className = 'who';
    w.textContent = who;
    var b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    li.appendChild(w); li.appendChild(b);
    var log = $('log');
    log.insertBefore(li, log.firstChild);   // lo último arriba: se ve sin desplazar
    while (log.children.length > 40) log.removeChild(log.lastChild);
  }

  function replace(entryId, text, cls) {
    var li = document.getElementById(entryId);
    if (!li) return push('agente', text, cls);
    li.className = 'entry ' + (cls || '');
    li.querySelector('.bubble').textContent = text;
  }

  // ── Arranque ─────────────────────────────────────────────────────────

  function initConfig() {
    if (!state.cfg.channel) { state.cfg.channel = uuid(); save(); }
    $('cfgUrl').value = state.cfg.supabaseUrl;
    $('cfgKey').value = state.cfg.anonKey;
    $('cfgChannel').value = state.cfg.channel;
    $('chanEcho').textContent = state.cfg.channel;
    $('cfgVoice').checked = !!state.cfg.voice;
  }

  $('btnMic').addEventListener('click', function () {
    if (!SR) {
      push('sistema',
        'Este navegador no reconoce la voz (Firefox no lo soporta). Escribe abajo, o usa el dictado del teclado: en el campo de texto, toca el icono del micrófono del teclado.',
        'err');
      return;
    }
    if (state.listening) return;
    startListening();
  });

  $('cmdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('cmdInput').value;
    $('cmdInput').value = '';
    runCommand(v);
  });

  $('chips').addEventListener('click', function (e) {
    var cmd = e.target.getAttribute && e.target.getAttribute('data-cmd');
    if (cmd) runCommand(cmd);
  });

  $('btnConfig').addEventListener('click', function () { initConfig(); $('configDialog').showModal(); });

  $('btnNewChannel').addEventListener('click', function () {
    $('cfgChannel').value = uuid();
    $('chanEcho').textContent = $('cfgChannel').value;
  });

  $('cfgVoice').addEventListener('change', function () {
    state.cfg.voice = $('cfgVoice').checked; save();
  });

  $('btnTestConn').addEventListener('click', function () {
    var url = $('cfgUrl').value.trim();
    var key = $('cfgKey').value.trim();
    var msg = $('cfgMsg');
    if (!url || !key) { msg.textContent = 'Faltan la URL y la anon key.'; return; }
    msg.textContent = 'Probando…';
    var headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };
    fetch(url.replace(/\/+$/, '') + '/rest/v1/web_tasks?select=id&limit=1', { headers: headers })
      .then(function (r) {
        if (r.status === 404) throw new Error('existe la conexión pero falta la tabla web_tasks. Ejecuta la migración 002.');
        if (!r.ok) throw new Error('HTTP ' + r.status + ' — revisa la anon key');
        msg.textContent = '✅ Conexión correcta. La tabla web_tasks responde.';
      })
      .catch(function (e) { msg.textContent = '❌ ' + e.message; });
  });

  $('configForm').addEventListener('submit', function () {
    state.cfg.supabaseUrl = $('cfgUrl').value.trim();
    state.cfg.anonKey = $('cfgKey').value.trim();
    state.cfg.channel = $('cfgChannel').value.trim();
    save();
    initConfig();
    state.tasks = {};
    poll();
  });

  // Las voces llegan de forma asíncrona en algunos navegadores.
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = function () {};

  initConfig();
  if (!SR) $('btnMic').classList.add('unsupported');
  setMicIdle();
  poll();
  setInterval(poll, POLL_MS);

  push('sistema',
    SR ? 'Cabina lista. Pulsa el botón y habla, o escribe abajo.'
       : 'Cabina lista. Este navegador no reconoce la voz: escribe abajo o usa el dictado del teclado.',
    '');
})();
