/**
 * Decoración por época del año (calendario salvadoreño).
 *
 * En cada época cambia:
 *  - una guirnalda delgada bajo la barra superior y en el letrero de acceso,
 *  - el color con que se marca «hoy» (el amarillo señal pasa al color de la época),
 *  - un emoji junto al logo y un saludo en «Mi panel» (que se puede cerrar),
 *  - en algunas, unas pocas partículas que caen despacio (nieve, pétalos, corazones).
 *
 * Modos (lo decide la organización: hoja Config → EPOCA, o config.js → EPOCA si no hay servidor;
 * los administradores lo cambian desde el menú de su cuenta y se aplica a todos):
 *   'auto'    → se activa sola según la fecha
 *   'apagada' → sin decoración
 *   '<id>'    → deja fija una época (útil para probarla)
 * Épocas propias de la organización: config.js → EPOCAS_PROPIAS.
 */
var Epocas = (function () {
  var CLAVE = 'rs_epoca_org'; // copia local del valor de la organización (para decorar la pantalla de acceso)
  var deOrganizacion = null;
  try { localStorage.removeItem('rs_epoca'); } catch (e) { /* versiones anteriores guardaban una preferencia personal */ }
  var CLAVE_SALUDO = 'rs_epoca_saludo_';

  function f(anio, mes, dia) { return new Date(anio, mes, dia); }
  function sumar(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  /** Domingo de Resurrección (algoritmo de Meeus/Jones/Butcher). */
  function pascua(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return f(y, mes - 1, dia);
  }

  // colores: los de la guirnalda · acento: color de «hoy» · sobre: texto encima del acento
  var BASE = [
    { id: 'anio-nuevo', nombre: 'Año nuevo', emoji: '🎆', rango: function (y) { return [f(y, 0, 1), f(y, 0, 6)]; },
      colores: ['#d4a017', '#1d2b36', '#e8e2d0'], acento: '#f2c14e', sobre: '#1d2b36', adorno: 'banderines', particulas: null,
      mensaje: '¡Feliz año nuevo! Que este año tenga menos reuniones que pudieron ser un correo.' },
    { id: 'amistad', nombre: 'Amor y amistad', emoji: '💌', rango: function (y) { return [f(y, 1, 10), f(y, 1, 14)]; },
      colores: ['#e5487a', '#ffb3c8', '#c2185b'], acento: '#ff8fb1', sobre: '#4a0d24', adorno: 'banderines', particulas: '❤',
      mensaje: 'Feliz Día del Amor y la Amistad. Buen día para invitar a alguien a un café (sin reservar sala).' },
    { id: 'semana-santa', nombre: 'Semana Santa', emoji: '🌿', rango: function (y) { var p = pascua(y); return [sumar(p, -7), p]; },
      colores: ['#6a3d9a', '#c9b3e6', '#4f7f3a'], acento: '#c9b3e6', sobre: '#2b1747', adorno: 'banderines', particulas: null,
      mensaje: 'Felices vacaciones de Semana Santa. Revisa tus reuniones antes del asueto.' },
    { id: 'dia-cruz', nombre: 'Día de la Cruz', emoji: '🍉', rango: function (y) { return [f(y, 4, 1), f(y, 4, 3)]; },
      colores: ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'], acento: '#ffd54f', sobre: '#3e2700', adorno: 'banderines', particulas: null,
      mensaje: 'Feliz Día de la Cruz. Que no falten la fruta ni el papel de colores.' },
    { id: 'madres', nombre: 'Día de las Madres', emoji: '💐', rango: function (y) { return [f(y, 4, 6), f(y, 4, 10)]; },
      colores: ['#ec407a', '#f8bbd0', '#8bc34a'], acento: '#f8a5c2', sobre: '#4a0d24', adorno: 'banderines', particulas: '✿',
      mensaje: 'Feliz Día de las Madres a todas las mamás del equipo.' },
    { id: 'padres', nombre: 'Día del Padre', emoji: '👔', rango: function (y) { return [f(y, 5, 13), f(y, 5, 17)]; },
      colores: ['#1565c0', '#90caf9', '#37474f'], acento: '#90caf9', sobre: '#0d2a4a', adorno: 'banderines', particulas: null,
      mensaje: 'Feliz Día del Padre a todos los papás del equipo.' },
    { id: 'maestro', nombre: 'Día del Maestro', emoji: '🍎', rango: function (y) { return [f(y, 5, 20), f(y, 5, 22)]; },
      colores: ['#c62828', '#2e7d32', '#f9a825'], acento: '#ef9a9a', sobre: '#3b0b0b', adorno: 'banderines', particulas: null,
      mensaje: 'Feliz Día del Maestro. Gracias a quienes enseñan.' },
    { id: 'agostinas', nombre: 'Fiestas agostinas', emoji: '🎡', rango: function (y) { return [f(y, 7, 1), f(y, 7, 6)]; },
      colores: ['#ff7043', '#ffca28', '#26a69a', '#ab47bc'], acento: '#ffca28', sobre: '#3e2700', adorno: 'banderines', particulas: null,
      mensaje: '¡Felices fiestas agostinas! Disfruta las vacaciones.' },
    { id: 'patrias', nombre: 'Fiestas patrias', emoji: '🇸🇻', rango: function (y) { return [f(y, 8, 1), f(y, 8, 15)]; },
      colores: ['#0f47af', '#ffffff', '#0f47af'], acento: '#0f47af', sobre: '#ffffff', adorno: 'banderitas', particulas: null,
      mensaje: 'Septiembre, mes de la patria. ¡Feliz Día de la Independencia!', confeti: ['#0f47af', '#ffffff', '#0f47af', '#ffffff', '#ffc72c'] },
    { id: 'calabiuza', nombre: 'La Calabiuza y Día de los Difuntos', emoji: '🎃', rango: function (y) { return [f(y, 9, 28), f(y, 10, 2)]; },
      colores: ['#ef6c00', '#4a148c', '#ffb74d'], acento: '#ffa040', sobre: '#2d1000', adorno: 'banderines', particulas: null,
      mensaje: 'Temporada de calabazas, ánimas y dulce de ayote.' },
    { id: 'navidad', nombre: 'Navidad', emoji: '🎄', rango: function (y) { return [f(y, 11, 1), f(y, 11, 31)]; },
      colores: ['#d32f2f', '#2e7d32', '#fbc02d', '#1976d2'], acento: '#c62828', sobre: '#ffffff', adorno: 'luces', particulas: '❄', colorParticula: '#8fb8d8',
      mensaje: '¡Felices fiestas! Revisa las reuniones de fin de año antes de las vacaciones.' },
  ];

  function cfg() { return (typeof window !== 'undefined' && window.APP_CONFIG) || {}; }

  /** Épocas de la organización desde config.js: { id, nombre, emoji, desde:'MM-DD', hasta:'MM-DD', colores:[], mensaje } */
  function propias() {
    return (cfg().EPOCAS_PROPIAS || []).filter(function (e) { return e && e.id && e.desde && e.hasta; }).map(function (e) {
      var col = e.colores && e.colores.length ? e.colores : ['#0b6b57', '#ffc533'];
      return {
        id: String(e.id), nombre: e.nombre || e.id, emoji: e.emoji || '🎉', propia: true,
        rango: function (y) {
          var a = String(e.desde).split('-').map(Number), b = String(e.hasta).split('-').map(Number);
          var ini = f(y, a[0] - 1, a[1]), fin = f(y, b[0] - 1, b[1]);
          if (fin < ini) fin = f(y + 1, b[0] - 1, b[1]); // cruza el fin de año
          return [ini, fin];
        },
        colores: col, acento: e.acento || col[1] || col[0], sobre: e.sobre || '#1d2b36',
        adorno: e.adorno || 'banderines', particulas: e.particulas || null, colorParticula: e.colorParticula, mensaje: e.mensaje || '',
      };
    });
  }

  function todas() {
    var fuera = cfg().EPOCAS_DESACTIVADAS || [];
    // Las propias van primero: si se cruzan con una del sistema, gana la de la organización
    return propias().concat(BASE.filter(function (e) { return fuera.indexOf(e.id) === -1; }));
  }

  /** Época activa en una fecha (o null). También mira el año anterior para rangos que cruzan enero. */
  function deFecha(fecha) {
    var d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    var lista = todas();
    for (var i = 0; i < lista.length; i++) {
      for (var y = d.getFullYear() - 1; y <= d.getFullYear(); y++) {
        var r = lista[i].rango(y);
        if (d >= r[0] && d <= r[1]) return lista[i];
      }
    }
    return null;
  }

  function buscar(id) { return todas().filter(function (e) { return e.id === id; })[0] || null; }

  function modo() {
    if (deOrganizacion) return deOrganizacion;
    var guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { /* sin almacenamiento */ }
    return guardado || cfg().EPOCA || 'auto';
  }

  /** El valor que manda el servidor al iniciar sesión (o el que acaba de elegir un administrador). */
  function establecer(valor) {
    deOrganizacion = valor || cfg().EPOCA || 'auto';
    try { localStorage.setItem(CLAVE, JSON.stringify(deOrganizacion)); } catch (e) { /* sin almacenamiento */ }
    return aplicar();
  }

  function actual() {
    var m = modo();
    if (m === 'apagada') return null;
    if (m === 'auto') return deFecha(new Date());
    return buscar(m) || deFecha(new Date());
  }

  // ------------------------------------------------------------------ adornos
  var ANCHO = 2600; // la guirnalda cubre pantallas muy anchas; lo que sobra se recorta

  /** Guirnalda como SVG en línea, para poder animar cada pieza (luces que titilan, banderines que ondean). */
  function guirnalda(e) {
    var c = e.colores, s = '', i, x, alto;
    if (e.adorno === 'luces') {
      alto = 26;
      var paso = 30, tramo = paso * 5;
      for (x = 0; x < ANCHO; x += tramo) s += '<path d="M' + x + ' 4Q' + (x + tramo / 2) + ' 16 ' + (x + tramo) + ' 4" stroke="#4e5d52" stroke-width="1.6" fill="none"/>';
      for (i = 0, x = paso / 2; x < ANCHO; i++, x += paso) {
        var t = ((x % tramo) / tramo), y = 4 + Math.sin(t * Math.PI) * 12 * (1 - Math.abs(0.5 - t) * 0.2) * (t <= 1 ? 1 : 0);
        var col = c[i % c.length];
        s += '<g class="foco" style="animation-delay:' + ((i * 0.37) % 2.4).toFixed(2) + 's">' +
          '<rect x="' + (x - 2.2).toFixed(1) + '" y="' + (y + 1).toFixed(1) + '" width="4.4" height="4" rx="1" fill="#4e5d52"/>' +
          '<ellipse cx="' + x.toFixed(1) + '" cy="' + (y + 10).toFixed(1) + '" rx="4.6" ry="6.6" fill="' + col + '"/>' +
          '<ellipse cx="' + (x - 1.4).toFixed(1) + '" cy="' + (y + 8).toFixed(1) + '" rx="1.3" ry="2.2" fill="#fff" opacity=".7"/></g>';
      }
    } else if (e.adorno === 'franjas' || e.adorno === 'banderitas') {
      alto = 32;
      var ancho = 36;
      for (x = 0; x < ANCHO; x += ancho * 6) s += '<path d="M' + x + ' 3Q' + (x + ancho * 3) + ' 10 ' + (x + ancho * 6) + ' 3" stroke="#7a8a80" stroke-width="1.2" fill="none"/>';
      for (i = 0, x = 4; x < ANCHO; i++, x += ancho) {
        var yb = 3 + Math.sin(((x % (ancho * 6)) / (ancho * 6)) * Math.PI) * 6;
        s += '<g class="bandera-mini" style="animation-delay:' + ((i * 0.23) % 3).toFixed(2) + 's">' +
          '<rect x="' + x + '" y="' + yb.toFixed(1) + '" width="28" height="7" fill="' + c[0] + '"/>' +
          '<rect x="' + x + '" y="' + (yb + 7).toFixed(1) + '" width="28" height="7" fill="' + (c[1] || '#fff') + '"/>' +
          '<rect x="' + x + '" y="' + (yb + 14).toFixed(1) + '" width="28" height="7" fill="' + (c[2] || c[0]) + '"/>' +
          '<circle cx="' + (x + 14) + '" cy="' + (yb + 10.5).toFixed(1) + '" r="2.2" fill="#c9a227"/>' +
          '<rect x="' + x + '" y="' + yb.toFixed(1) + '" width="28" height="21" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".6"/></g>';
      }
    } else {
      // Banderines de papel picado, con calados
      alto = 30;
      var w = 28, grupo = w * 6;
      for (x = 0; x < ANCHO; x += grupo) s += '<path d="M' + x + ' 3Q' + (x + grupo / 2) + ' 11 ' + (x + grupo) + ' 3" stroke="#7a8a80" stroke-width="1.2" fill="none"/>';
      for (i = 0, x = 0; x < ANCHO; i++, x += w) {
        var y0 = 3 + Math.sin(((x % grupo) / grupo) * Math.PI) * 7;
        var cx = x + w / 2;
        s += '<g class="banderin" style="animation-delay:' + ((i * 0.31) % 3).toFixed(2) + 's">' +
          '<path d="M' + (x + 2) + ' ' + y0.toFixed(1) + 'H' + (x + w - 2) + 'L' + cx + ' ' + (y0 + 22).toFixed(1) + 'Z" fill="' + c[i % c.length] + '"/>' +
          '<circle cx="' + cx + '" cy="' + (y0 + 6).toFixed(1) + '" r="2.2" fill="#fff" opacity=".55"/>' +
          '<path d="M' + (cx - 5) + ' ' + (y0 + 4).toFixed(1) + 'l2 2-2 2zM' + (cx + 5) + ' ' + (y0 + 4).toFixed(1) + 'l-2 2 2 2z" fill="#fff" opacity=".55"/>' +
          '<path d="M' + cx + ' ' + (y0 + 11).toFixed(1) + 'l2 3-2 3-2-3z" fill="#fff" opacity=".55"/></g>';
      }
    }
    return { html: '<svg class="guirnalda" xmlns="http://www.w3.org/2000/svg" width="' + ANCHO + '" height="' + alto + '" viewBox="0 0 ' + ANCHO + ' ' + alto + '">' + s + '</svg>', alto: alto };
  }

  /** Patrón muy tenue para el fondo de la aplicación. */
  var FIGURAS = {
    navidad: 'copo', 'anio-nuevo': 'estrella', amistad: 'corazon', 'semana-santa': 'rombo', 'dia-cruz': 'confeti', madres: 'flor',
    padres: 'estrella', maestro: 'estrella', agostinas: 'confeti', patrias: 'estrella', calabiuza: 'hoja',
  };
  function figura(tipo, x, y, r, color, giro) {
    var t = 'transform="rotate(' + giro + ' ' + x + ' ' + y + ')"';
    if (tipo === 'copo') {
      var l = '';
      for (var k = 0; k < 3; k++) l += '<line x1="' + (x - r) + '" y1="' + y + '" x2="' + (x + r) + '" y2="' + y + '" transform="rotate(' + (giro + k * 60) + ' ' + x + ' ' + y + ')"/>';
      return '<g stroke="' + color + '" stroke-width="1.6" stroke-linecap="round">' + l + '</g>';
    }
    if (tipo === 'corazon') return '<path ' + t + ' d="M' + x + ' ' + (y + r * 0.7) + 'C' + (x - r * 1.1) + ' ' + (y - r * 0.1) + ' ' + (x - r * 0.6) + ' ' + (y - r * 1.1) + ' ' + x + ' ' + (y - r * 0.5) + 'C' + (x + r * 0.6) + ' ' + (y - r * 1.1) + ' ' + (x + r * 1.1) + ' ' + (y - r * 0.1) + ' ' + x + ' ' + (y + r * 0.7) + 'Z" fill="' + color + '"/>';
    if (tipo === 'flor') {
      var f = '';
      for (var j = 0; j < 5; j++) f += '<circle cx="' + (x + r * 0.6 * Math.cos(j * 1.2566)).toFixed(1) + '" cy="' + (y + r * 0.6 * Math.sin(j * 1.2566)).toFixed(1) + '" r="' + (r * 0.45).toFixed(1) + '" fill="' + color + '"/>';
      return f;
    }
    if (tipo === 'rombo') return '<rect x="' + (x - r / 2) + '" y="' + (y - r / 2) + '" width="' + r + '" height="' + r + '" fill="' + color + '" transform="rotate(45 ' + x + ' ' + y + ')"/>';
    if (tipo === 'confeti') return '<rect x="' + (x - 2) + '" y="' + (y - r / 2) + '" width="4" height="' + r + '" rx="1.5" fill="' + color + '" ' + t + '/>';
    if (tipo === 'hoja') return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r * 0.45) + '" ry="' + r + '" fill="' + color + '" ' + t + '/>';
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + color + '"/>';
  }
  function patron(e) {
    var tipo = FIGURAS[e.id] || 'confeti';
    var puntos = [[14, 18, 6, 0], [70, 10, 4, 30], [44, 52, 5, 60], [104, 40, 6, 15], [20, 92, 4, 45], [82, 84, 7, 75], [118, 110, 4, 20], [56, 116, 5, 50]];
    var s = puntos.map(function (p, i) { return figura(tipo, p[0], p[1], p[2], e.colores[i % e.colores.length], p[3]); }).join('');
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><g opacity=".13">' + s + '</g></svg>') + '")';
  }

  var SIMBOLOS = {
    navidad: ['❄', '✦', '❅'], 'anio-nuevo': ['✦', '✧', '★'], amistad: ['❤', '♥'], madres: ['✿', '❀', '♥'], patrias: ['★', '✦'],
    calabiuza: ['✦', '•'], agostinas: ['■', '●', '▲'], 'dia-cruz': ['■', '●'],
  };
  function quitarParticulas() {
    Array.prototype.forEach.call(document.querySelectorAll('.particula-epoca'), function (p) { p.remove(); });
  }
  function particulas(e) {
    quitarParticulas();
    var simbolos = e.particulas ? [e.particulas] : SIMBOLOS[e.id];
    if (!simbolos || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var colores = e.colorParticula ? [e.colorParticula] : e.colores;
    for (var i = 0; i < 18; i++) {
      var c = document.createElement('span');
      c.className = 'particula-epoca';
      c.setAttribute('aria-hidden', 'true');
      var dentro = document.createElement('span');
      dentro.textContent = simbolos[i % simbolos.length];
      c.appendChild(dentro);
      c.style.left = Math.random() * 100 + 'vw';
      c.style.fontSize = 9 + Math.random() * 11 + 'px';
      c.style.color = colores[i % colores.length];
      c.style.animationDuration = 16 + Math.random() * 16 + 's';
      c.style.animationDelay = -Math.random() * 30 + 's';
      dentro.style.animationDuration = 3 + Math.random() * 3 + 's';
      document.body.appendChild(c);
    }
  }

  // ------------------------------------------------------------------ aplicar
  function aplicar() {
    var raiz = document.documentElement;
    var e = actual();
    var franjas = document.querySelectorAll('.franja-epoca');
    var escenas = document.querySelectorAll('[data-escena-epoca]');
    if (!e) {
      delete raiz.dataset.epoca;
      ['--franja-alto', '--senal', '--sobre-senal', '--patron-epoca', '--escena-epoca', '--emoji-epoca', '--epoca-1', '--epoca-2'].forEach(function (v) { raiz.style.removeProperty(v); });
      Array.prototype.forEach.call(franjas, function (f) { f.innerHTML = ''; });
      Array.prototype.forEach.call(escenas, function (f) { f.innerHTML = ''; });
      quitarParticulas();
      return null;
    }
    var g = guirnalda(e);
    raiz.dataset.epoca = e.id;
    raiz.style.setProperty('--franja-alto', g.alto + 'px');
    raiz.style.setProperty('--senal', e.acento);
    raiz.style.setProperty('--sobre-senal', e.sobre);
    raiz.style.setProperty('--epoca-1', e.colores[0]);
    raiz.style.setProperty('--epoca-2', e.colores[1] || e.colores[0]);
    raiz.style.setProperty('--patron-epoca', patron(e));
    raiz.style.setProperty('--emoji-epoca', '"' + e.emoji + '"');
    if (window.Escenas) raiz.style.setProperty('--escena-epoca', Escenas.url(e));
    Array.prototype.forEach.call(franjas, function (f) { f.innerHTML = g.html; });
    Array.prototype.forEach.call(escenas, function (f) { f.innerHTML = window.Escenas ? Escenas.svg(e) : ''; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-emoji-epoca]'), function (el) {
      el.textContent = e.emoji;
      el.title = e.nombre;
    });
    particulas(e);
    return e;
  }

  /** Aviso con confeti el primer día que cada persona ve la época (una vez por año). */
  function bienvenida() {
    var e = actual();
    if (!e || modo() !== 'auto') return;
    var clave = CLAVE_SALUDO + e.id + '_' + new Date().getFullYear() + '_aviso';
    if (U.almacen.leer(clave)) return;
    U.almacen.guardar(clave, true);
    setTimeout(function () {
      if (window.Huevos && Huevos.confeti && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        Huevos.confeti({ colores: e.confeti || e.colores, cantidad: 140, lluvia: true, duracion: 4000 });
      }
      App.aviso(e.emoji + ' ' + e.mensaje);
    }, 1200);
  }

  /** Tarjeta de saludo para «Mi panel» (se puede cerrar). */
  function htmlSaludo() {
    var e = actual();
    if (!e || !e.mensaje) return '';
    if (U.almacen.leer(CLAVE_SALUDO + e.id + '_' + new Date().getFullYear())) return '';
    return '<div class="saludo-epoca"><span class="franja-epoca" aria-hidden="true">' + guirnalda(e).html + '</span>' +
      '<div class="saludo-texto"><span class="saludo-nombre">' + e.emoji + ' ' + U.esc(e.nombre) + '</span>' +
      '<p>' + U.esc(e.mensaje) + '</p></div>' +
      '<div class="saludo-escena" aria-hidden="true">' + (window.Escenas ? Escenas.svg(e) : '') + '</div>' +
      '<button class="btn-icono" data-cerrar-epoca aria-label="Ocultar saludo de temporada"><span class="ms">close</span></button></div>';
  }
  function conectarSaludo(cont) {
    var b = cont.querySelector('[data-cerrar-epoca]');
    if (!b) return;
    b.addEventListener('click', function () {
      var e = actual();
      if (e) U.almacen.guardar(CLAVE_SALUDO + e.id + '_' + new Date().getFullYear(), true);
      var t = b.closest('.saludo-epoca');
      if (t) t.remove();
    });
  }

  /** Selector para el menú de la cuenta. */
  function htmlSelector() {
    var m = modo();
    var hoy = deFecha(new Date());
    var opciones = [['auto', 'Automática' + (hoy ? ' (ahora: ' + hoy.nombre + ')' : ' (ninguna ahora)')], ['apagada', 'Apagada']]
      .concat(todas().map(function (e) { return [e.id, e.emoji + ' ' + e.nombre]; }));
    return '<label class="selector-epoca"><span class="sr-only">Decoración de temporada</span><select id="sel-epoca">' + opciones.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === m ? ' selected' : '') + '>' + U.esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  /** Solo para administradores: alCambiar(valor) guarda en el servidor y devuelve una promesa. */
  function conectarSelector(cont, alCambiar) {
    var s = cont.querySelector('#sel-epoca');
    if (!s) return;
    var anterior = s.value;
    s.addEventListener('change', function () {
      var valor = s.value;
      s.disabled = true;
      Promise.resolve(alCambiar(valor)).then(function () {
        anterior = valor;
      }).catch(function () {
        s.value = anterior;
      }).then(function () { s.disabled = false; });
    });
  }

  function iniciar() {
    aplicar();
    bienvenida();
  }

  return {
    iniciar: iniciar, aplicar: aplicar, establecer: establecer, actual: actual, deFecha: deFecha, todas: todas, pascua: pascua,
    htmlSaludo: htmlSaludo, conectarSaludo: conectarSaludo, htmlSelector: htmlSelector, conectarSelector: conectarSelector,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Epocas;
