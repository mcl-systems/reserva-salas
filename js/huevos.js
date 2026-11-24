/**
 * Huevos de pascua 🥚 — detalles escondidos para alegrar el día.
 * Se desactivan con EASTER_EGGS: false en config.js. Respetan "reducir movimiento" del sistema.
 *
 * Lista (no la compartas, ¡que la gracia es encontrarlos!):
 *   konami      ↑ ↑ ↓ ↓ ← → ← → B A          → modo fiesta
 *   logo        7 clics seguidos en el logo
 *   chiste      pedirle un chiste al asistente
 *   cafe        pedirle un café al asistente
 *   viernes     reservar un viernes desde las 4 p. m.
 *   madrugador  reservar una reunión que empieza antes de las 7:30 a. m.
 *   cumple      reservar algo con «cumpleaños» o «pastel» en el título
 *   fiesta      escribir «fiesta» en el buscador (Ctrl+K)
 * Las decoraciones de temporada están en epocas.js.
 */
var Huevos = (function () {
  'use strict';

  var CLAVE = 'rs_huevos';
  var LISTA = [
    { id: 'konami', nombre: 'Código secreto', pista: 'Los videojugadores de los 80 lo conocen.', emoji: '🎮' },
    { id: 'logo', nombre: 'Curiosidad', pista: 'A veces hay que insistir con el logo.', emoji: '🌀' },
    { id: 'chiste', nombre: 'Sentido del humor', pista: 'El asistente también sabe reír.', emoji: '😂' },
    { id: 'cafe', nombre: 'Cafeína', pista: 'Pídele al asistente lo que más se toma en las reuniones.', emoji: '☕' },
    { id: 'viernes', nombre: 'Valiente', pista: 'Una reunión cuando todos piensan en el fin de semana.', emoji: '💪' },
    { id: 'madrugador', nombre: 'Madrugador', pista: 'Al que madruga…', emoji: '🌅' },
    { id: 'cumple', nombre: '¡Feliz cumpleaños!', pista: 'Celebra algo en una sala.', emoji: '🎂' },
    { id: 'fiesta', nombre: 'Fiestero', pista: 'Busca algo divertido con Ctrl+K.', emoji: '🎉' },
  ];
  var CHISTES = [
    '¿Por qué la sala de juntas siempre está tranquila? Porque todos sus problemas se resuelven… en la próxima reunión.',
    '—¿Tienes un minuto para una reunión rápida? —Claro. —Perfecto, será de 1 hora 30.',
    'Mi reunión de las 9 se canceló, la de las 10 se movió y la de las 11 «pudo haber sido un correo». Productividad: 100 %.',
    'El auditorio le dijo a la cabina: «No te sientas pequeña, tú tienes conversaciones más profundas».',
    '¿Cuál es el colmo de una sala de reuniones? Estar ocupada y no hacer nada.',
    'Reservé la sala para pensar en grande… y me tocó la Cabina 1.',
  ];

  function activos() { return !window.APP_CONFIG || APP_CONFIG.EASTER_EGGS !== false; }
  function movimientoReducido() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function encontrados() { return U.almacen.leer(CLAVE) || []; }

  function encontrar(id, mensaje) {
    if (!activos()) return false;
    var lista = encontrados();
    var huevo = LISTA.filter(function (h) { return h.id === id; })[0];
    if (!huevo) return false;
    var nuevo = lista.indexOf(id) === -1;
    if (nuevo) {
      lista.push(id);
      U.almacen.guardar(CLAVE, lista);
      confeti({ cantidad: 90 });
    }
    var texto = (mensaje ? mensaje + ' · ' : '') + (nuevo
      ? '🥚 ¡Encontraste un huevo de pascua! «' + huevo.nombre + '» (' + lista.length + ' de ' + LISTA.length + ')'
      : '');
    if (texto && window.App) App.aviso(texto.replace(/ · $/, ''), nuevo ? 'Ver colección' : '', nuevo ? mostrarColeccion : null);
    return nuevo;
  }

  // ------------------------------------------------------------------ confeti
  function confeti(op) {
    op = op || {};
    if (!activos() || movimientoReducido()) return;
    var colores = op.colores || ['#ea4335', '#fbbc04', '#34a853', '#4285f4', '#a142f4', '#ff6d01'];
    var lienzo = document.createElement('canvas');
    lienzo.className = 'lienzo-confeti';
    var dpr = window.devicePixelRatio || 1;
    lienzo.width = window.innerWidth * dpr;
    lienzo.height = window.innerHeight * dpr;
    document.body.appendChild(lienzo);
    var ctx = lienzo.getContext('2d');
    ctx.scale(dpr, dpr);
    var piezas = [];
    var n = op.cantidad || 160;
    for (var i = 0; i < n; i++) {
      var desdeArriba = op.lluvia;
      piezas.push({
        x: desdeArriba ? Math.random() * window.innerWidth : window.innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: desdeArriba ? -20 - Math.random() * window.innerHeight * 0.5 : window.innerHeight * 0.35,
        vx: desdeArriba ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 16,
        vy: desdeArriba ? 2 + Math.random() * 3 : -8 - Math.random() * 9,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        c: colores[Math.floor(Math.random() * colores.length)],
      });
    }
    var inicio = performance.now();
    var duracion = op.duracion || 3200;
    (function cuadro(t) {
      var avance = t - inicio;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      piezas.forEach(function (p) {
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - avance / duracion);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      });
      if (avance < duracion) requestAnimationFrame(cuadro);
      else lienzo.remove();
    })(inicio);
  }

  function modoFiesta() {
    var raiz = document.documentElement;
    raiz.classList.add('fiesta');
    confeti({ cantidad: 220, duracion: 4000 });
    setTimeout(function () { raiz.classList.remove('fiesta'); }, 12000);
  }

  // ------------------------------------------------------------------ disparadores
  var secuencia = [];
  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  function alTeclear(e) {
    if (!activos()) return;
    secuencia.push(String(e.key).toLowerCase());
    secuencia = secuencia.slice(-KONAMI.length);
    if (secuencia.join(',') === KONAMI.join(',')) {
      secuencia = [];
      modoFiesta();
      encontrar('konami', '🎮 ¡Modo fiesta activado!');
    }
  }

  /** true si el usuario va a mitad del código secreto (para que B y A no cambien de vista). */
  function enSecuencia() {
    for (var n = Math.min(secuencia.length, KONAMI.length - 1); n >= 8; n--) {
      if (secuencia.slice(-n).join(',') === KONAMI.slice(0, n).join(',')) return true;
    }
    return false;
  }

  var clics = [];
  function clicLogo() {
    if (!activos()) return false;
    var ahora = Date.now();
    clics = clics.filter(function (t) { return ahora - t < 2500; });
    clics.push(ahora);
    if (clics.length >= 7) {
      clics = [];
      var logo = document.querySelector('.barra .logo');
      if (logo) {
        logo.classList.remove('girando');
        void logo.offsetWidth;
        logo.classList.add('girando');
      }
      encontrar('logo', '🌀 ¡Mareado! El logo dio una vuelta completa');
      return true;
    }
    return false;
  }

  /** Respuestas especiales del asistente. Devuelve HTML o null. */
  function responder(texto) {
    if (!activos()) return null;
    var t = Interprete.normalizar(texto);
    if (/\b(chiste|algo gracioso|hazme reir|cuentame algo)\b/.test(t)) {
      encontrar('chiste');
      return '<p>' + U.esc(CHISTES[Math.floor(Math.random() * CHISTES.length)]) + '</p><p>¿Ahora sí reservamos una sala? 😄</p>';
    }
    if (/\b(cafe|cafecito|capuchino|expreso|espresso)\b/.test(t) && !/\b(reserva|sala|reunion)\b/.test(t)) {
      encontrar('cafe');
      return '<p>☕ No puedo prepararte un café… todavía. Pero puedo reservarte la sala más cerca de la cafetería.</p>';
    }
    if (/\b(quien eres|como te llamas|eres humano|eres un robot)\b/.test(t)) {
      return '<p>Soy el asistente de ' + U.esc(App.C.NOMBRE_APP || 'Reserva de Salas') + '. No tomo café ni llego tarde a las reuniones, pero sí sé encontrarte una sala libre. 🙂</p>';
    }
    if (/\b(sentido de la vida|el universo y todo lo demas)\b/.test(t) || /^42$/.test(t.trim())) {
      return '<p>42. Pero para reservar una sala necesito un poco más de información. 🌌</p>';
    }
    if (/\b(te quiero|eres el mejor|eres la mejor|gracias totales)\b/.test(t)) {
      return '<p>¡Qué lindo! 💙 Yo también te quiero… casi tanto como una sala libre a la hora exacta.</p>';
    }
    return null;
  }

  /** Resultado especial en el buscador. */
  function buscar(q) {
    if (!activos() || !/^(fiesta|party|celebrar)/.test(q)) return null;
    return {
      grupo: 'Sorpresa', icono: 'celebration', texto: '¡Fiesta!', detalle: 'Presiona Enter',
      fn: function () { modoFiesta(); encontrar('fiesta', '🎉 ¡A celebrar!'); },
    };
  }

  /** Después de crear una reserva. */
  function alReservar(r) {
    if (!activos() || !r) return;
    var ini = new Date(r.inicio);
    var titulo = Interprete.normalizar(r.titulo || '');
    setTimeout(function () {
      if (/\b(cumpleanos|cumple|pastel|torta|happy birthday)\b/.test(titulo)) {
        confeti({ cantidad: 200 });
        encontrar('cumple', '🎂 ¡Que lo disfruten!');
      } else if (ini.getDay() === 5 && ini.getHours() >= 16) {
        encontrar('viernes', '💪 ¿Reunión el viernes por la tarde? Eso es valentía');
      } else if (ini.getHours() * 60 + ini.getMinutes() < 7 * 60 + 30) {
        encontrar('madrugador', '🌅 ¡Al que madruga, la sala le ayuda!');
      }
    }, 900);
  }

  // ------------------------------------------------------------------ colección
  function mostrarColeccion() {
    var lista = encontrados();
    U.$('#huevos-cuerpo').innerHTML =
      '<p class="tenue" style="margin:0 0 6px">Has encontrado <b>' + lista.length + ' de ' + LISTA.length + '</b> huevos de pascua.</p>' +
      '<div class="barra-progreso"><span style="width:' + (lista.length / LISTA.length * 100) + '%"></span></div>' +
      '<ul class="huevos-lista">' + LISTA.map(function (h) {
        var ok = lista.indexOf(h.id) !== -1;
        return '<li class="' + (ok ? '' : 'oculto') + '"><span class="huevo">' + (ok ? h.emoji : '🥚') + '</span><span><b>' + (ok ? U.esc(h.nombre) : '???') +
          '</b><small>' + U.esc(ok ? '¡Encontrado!' : 'Pista: ' + h.pista) + '</small></span></li>';
      }).join('') + '</ul>';
    U.$('#dlg-huevos').showModal();
  }

  function iniciar() {
    if (!activos()) return;
    document.addEventListener('keydown', alTeclear);
  }

  return {
    iniciar: iniciar, activos: activos, enSecuencia: enSecuencia, encontrar: encontrar, confeti: confeti, modoFiesta: modoFiesta, clicLogo: clicLogo,
    responder: responder, buscar: buscar, alReservar: alReservar, mostrarColeccion: mostrarColeccion,
    progreso: function () { return { encontrados: encontrados().length, total: LISTA.length }; },
  };
})();
