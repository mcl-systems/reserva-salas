/**
 * Ilustraciones de temporada (SVG dibujado a mano, sin imágenes externas).
 * Escenas.svg(id, epoca) → '<svg …>' de 240 × 150. Se usan en la pantalla de acceso,
 * en el saludo de «Mi panel» y, reducidas, en la esquina del calendario.
 */
var Escenas = (function () {
  'use strict';
  var n = 0;
  function uid(p) { n += 1; return p + n; }

  function marco(contenido, titulo) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150" role="img" aria-label="' + titulo + '">' + contenido + '</svg>';
  }
  function corazon(cx, cy, s, color, extra) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" d="M0 .35C-.55-.05-.3-.55 0-.25C.3-.55.55-.05 0 .35Z" fill="' + color + '"' + (extra || '') + '/>';
  }
  function estrella(cx, cy, r, color) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + color + '"/>';
  }
  function estallido(cx, cy, r, color, rayos) {
    var s = '';
    rayos = rayos || 12;
    for (var i = 0; i < rayos; i++) {
      var a = i * 2 * Math.PI / rayos;
      var x1 = cx + r * 0.35 * Math.cos(a), y1 = cy + r * 0.35 * Math.sin(a), x2 = cx + r * Math.cos(a), y2 = cy + r * Math.sin(a);
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="' + (cx + (r + 5) * Math.cos(a)).toFixed(1) + '" cy="' + (cy + (r + 5) * Math.sin(a)).toFixed(1) + '" r="2" fill="' + color + '"/>';
    }
    return s;
  }
  function flor(cx, cy, r, petalo, centro) {
    var s = '';
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      s += '<circle cx="' + (cx + r * Math.cos(a)).toFixed(1) + '" cy="' + (cy + r * Math.sin(a)).toFixed(1) + '" r="' + (r * 0.75).toFixed(1) + '" fill="' + petalo + '"/>';
    }
    return s + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.6).toFixed(1) + '" fill="' + centro + '"/>';
  }
  function murcielago(cx, cy, k) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + k + ')" d="M-18 0Q-12-8-6-2L-3-7L0-3L3-7L6-2Q12-8 18 0Q10 0 6 6Q3 2 0 5Q-3 2-6 6Q-10 0-18 0Z" fill="#4a148c"/>';
  }
  function sombra(cx, ancho) { return '<ellipse cx="' + cx + '" cy="142" rx="' + ancho + '" ry="6" fill="#000" opacity=".08"/>'; }

  var DIBUJOS = {
    navidad: function () {
      var adornos = [[108, 56, '#d32f2f'], [132, 70, '#fbc02d'], [100, 82, '#1976d2'], [140, 96, '#d32f2f'], [96, 108, '#fbc02d'], [124, 104, '#1976d2'], [116, 76, '#ffffff']];
      return sombra(120, 100) +
        '<ellipse cx="120" cy="140" rx="104" ry="9" fill="#e3eef6"/>' +
        '<rect x="112" y="118" width="16" height="20" rx="2" fill="#8d5a3b"/>' +
        '<polygon points="120,24 152,64 88,64" fill="#3c9a48"/><polygon points="120,42 162,92 78,92" fill="#2e8b3e"/><polygon points="120,62 172,124 68,124" fill="#257a34"/>' +
        '<path d="M92 62Q120 74 150 58M84 90Q120 104 158 86M76 120Q120 134 166 116" stroke="#fff3c4" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        adornos.map(function (a) { return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="4.5" fill="' + a[2] + '" stroke="rgba(0,0,0,.15)"/>'; }).join('') +
        estrella(120, 20, 11, '#fbc02d') +
        '<rect x="150" y="110" width="36" height="30" rx="3" fill="#d32f2f"/><rect x="164" y="110" width="8" height="30" fill="#fbc02d"/><rect x="150" y="121" width="36" height="7" fill="#fbc02d"/>' +
        '<ellipse cx="162" cy="108" rx="7" ry="4" fill="#fbc02d"/><ellipse cx="174" cy="108" rx="7" ry="4" fill="#fbc02d"/>' +
        '<rect x="52" y="118" width="30" height="22" rx="3" fill="#1976d2"/><rect x="63" y="118" width="7" height="22" fill="#fff"/>' +
        '<ellipse cx="61" cy="116" rx="6" ry="3.5" fill="#fff"/><ellipse cx="72" cy="116" rx="6" ry="3.5" fill="#fff"/>' +
        '<rect x="190" y="124" width="22" height="16" rx="2" fill="#2e7d32"/><rect x="199" y="124" width="5" height="16" fill="#d32f2f"/>' +
        [[30, 30], [210, 26], [46, 70], [200, 70], [24, 104], [222, 100]].map(function (c) { return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="3" fill="#bcd6ea"/>'; }).join('');
    },
    'anio-nuevo': function () {
      var hoy = new Date();
      var anio = hoy.getMonth() === 11 ? hoy.getFullYear() + 1 : hoy.getFullYear();
      return estallido(62, 48, 30, '#f2c14e') + estallido(178, 40, 26, '#e5487a', 10) + estallido(124, 26, 16, '#26a69a', 8) +
        '<text x="120" y="128" text-anchor="middle" font-family="Big Shoulders Display, Figtree, Arial Narrow, sans-serif" font-weight="800" font-size="52" fill="#1d2b36">' + anio + '</text>' +
        '<rect x="62" y="134" width="116" height="5" rx="2.5" fill="#f2c14e"/>' +
        [[30, 100, '#f2c14e'], [210, 96, '#26a69a'], [44, 130, '#e5487a'], [200, 128, '#f2c14e']].map(function (c) { return estrella(c[0], c[1], 6, c[2]); }).join('');
    },
    amistad: function () {
      return sombra(120, 60) +
        '<rect x="72" y="66" width="96" height="66" rx="6" fill="#fff" stroke="#e5487a" stroke-width="3"/>' +
        '<path d="M72 70L120 106L168 70" fill="none" stroke="#e5487a" stroke-width="3" stroke-linejoin="round"/>' +
        corazon(120, 104, 30, '#e5487a') +
        corazon(60, 46, 34, '#ff8fb1') + corazon(186, 40, 26, '#c2185b') + corazon(150, 24, 16, '#ff8fb1') + corazon(40, 104, 14, '#c2185b') + corazon(204, 104, 18, '#ff8fb1');
    },
    'semana-santa': function () {
      var alfombra = '';
      var colores = ['#6a3d9a', '#fbc02d', '#4f7f3a', '#e53935', '#1e88e5'];
      for (var i = 0; i < 9; i++) {
        var x = 16 + i * 24;
        alfombra += '<polygon points="' + x + ',130 ' + (x + 12) + ',118 ' + (x + 24) + ',130 ' + (x + 12) + ',142" fill="' + colores[i % colores.length] + '"/>' +
          '<circle cx="' + (x + 12) + '" cy="130" r="3" fill="#fff"/>';
      }
      var palma = function (x, espejo) {
        var s = '<g transform="translate(' + x + ' 0)' + (espejo ? ' scale(-1 1)' : '') + '"><path d="M0 116Q6 70 26 30" stroke="#4f7f3a" stroke-width="3" fill="none"/>';
        for (var k = 0; k < 7; k++) {
          var t = k / 7, px = 6 + t * 18, py = 100 - t * 66;
          s += '<path d="M' + px.toFixed(1) + ' ' + py.toFixed(1) + 'q-16 -2 -22 8M' + px.toFixed(1) + ' ' + py.toFixed(1) + 'q14 -8 22 -2" stroke="#6aa84f" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
        }
        return s + '</g>';
      };
      return '<rect x="10" y="116" width="220" height="28" rx="4" fill="#f3e6cf"/>' + alfombra +
        '<rect x="92" y="54" width="56" height="62" fill="#f7f1e6" stroke="#c9b3e6" stroke-width="2"/>' +
        '<polygon points="88,56 120,30 152,56" fill="#c9b3e6"/><rect x="116" y="14" width="8" height="18" fill="#6a3d9a"/><rect x="112" y="19" width="16" height="5" fill="#6a3d9a"/>' +
        '<path d="M110 116V92a10 10 0 0 1 20 0v24Z" fill="#6a3d9a"/><circle cx="120" cy="72" r="6" fill="#fbc02d"/>' +
        palma(34, false) + palma(206, true);
    },
    'dia-cruz': function () {
      var cadena = function (x1, y1, x2, y2, c) {
        var s = '', pasos = 8;
        for (var i = 0; i < pasos; i++) {
          var t = i / pasos, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * 18;
          s += '<rect x="' + (x - 3).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" width="7" height="9" rx="2" fill="' + c[i % c.length] + '"/>';
        }
        return s;
      };
      var cols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
      return sombra(120, 96) +
        '<rect x="113" y="16" width="14" height="108" rx="3" fill="#a1683a"/><rect x="82" y="40" width="76" height="13" rx="3" fill="#a1683a"/>' +
        cadena(84, 46, 24, 86, cols) + cadena(156, 46, 216, 86, cols.slice().reverse()) +
        '<path d="M60 136a24 24 0 0 1 48 0Z" fill="#43a047"/><path d="M64 136a20 20 0 0 1 40 0Z" fill="#ef5350"/>' +
        [74, 84, 94].map(function (x) { return '<ellipse cx="' + x + '" cy="128" rx="1.6" ry="2.6" fill="#1d2b36"/>'; }).join('') +
        '<ellipse cx="146" cy="128" rx="18" ry="11" fill="#ffb300"/><path d="M146 117q4-8 10-6" stroke="#43a047" stroke-width="3" fill="none"/>' +
        '<circle cx="178" cy="128" r="11" fill="#8d6e63"/><circle cx="174" cy="125" r="2" fill="#5d4037"/>' +
        '<path d="M28 132q14 10 30-6" stroke="#fdd835" stroke-width="8" fill="none" stroke-linecap="round"/>';
    },
    madres: function () {
      var flores = [[100, 50, '#ec407a'], [130, 40, '#f8bbd0'], [150, 62, '#ec407a'], [86, 72, '#f48fb1'], [120, 66, '#ff8a65']];
      return sombra(120, 50) +
        flores.map(function (f) { return '<path d="M' + f[0] + ' ' + f[1] + 'Q' + (f[0] + 120) / 2 + ' 95 120 104" stroke="#689f38" stroke-width="2.5" fill="none"/>'; }).join('') +
        '<ellipse cx="96" cy="88" rx="10" ry="5" fill="#8bc34a" transform="rotate(-30 96 88)"/><ellipse cx="146" cy="86" rx="10" ry="5" fill="#8bc34a" transform="rotate(30 146 86)"/>' +
        flores.map(function (f) { return flor(f[0], f[1], 8, f[2], '#fff3c4'); }).join('') +
        '<path d="M98 100H142L134 140H106Z" fill="#7e57c2"/><rect x="96" y="98" width="48" height="8" rx="3" fill="#9575cd"/>' +
        corazon(120, 122, 16, '#f8bbd0') + corazon(196, 44, 22, '#ec407a') + corazon(42, 56, 18, '#f48fb1') + corazon(204, 104, 12, '#f8bbd0');
    },
    padres: function () {
      return sombra(120, 80) +
        '<path d="M86 24h28l-6 12 10 70-18 22-18-22 10-70Z" fill="#1565c0"/>' +
        '<path d="M92 58l22-10M90 78l26-12M92 98l22-10" stroke="#90caf9" stroke-width="4"/>' +
        '<path d="M86 24h28l-6 12H92Z" fill="#0d47a1"/>' +
        '<rect x="140" y="84" width="46" height="52" rx="6" fill="#ffffff" stroke="#37474f" stroke-width="3"/>' +
        '<path d="M186 96a12 12 0 0 1 0 26" stroke="#37474f" stroke-width="5" fill="none"/>' +
        '<text x="163" y="116" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="12" fill="#1565c0">PAPÁ</text>' +
        '<path d="M154 76q-6-8 0-16q6-8 0-16M168 76q-6-8 0-16q6-8 0-16" stroke="#90a4ae" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        estrella(46, 40, 10, '#90caf9') + estrella(204, 34, 7, '#1565c0');
    },
    maestro: function () {
      return sombra(118, 76) +
        '<rect x="58" y="116" width="116" height="20" rx="3" fill="#2e7d32"/><rect x="58" y="116" width="116" height="5" fill="#1b5e20"/>' +
        '<rect x="66" y="96" width="104" height="20" rx="3" fill="#c62828"/><rect x="66" y="96" width="104" height="5" fill="#8e0000"/>' +
        '<rect x="74" y="78" width="88" height="18" rx="3" fill="#f9a825"/><rect x="74" y="78" width="88" height="4" fill="#c17900"/>' +
        '<path d="M118 76c-22 2-26-30-6-32c6 0 6 4 10 4s4-4 10-4c20 2 16 34-6 32c-4 0-4-2-8 0Z" fill="#e53935"/>' +
        '<path d="M120 44q2-12 8-14" stroke="#5d4037" stroke-width="3" fill="none"/><ellipse cx="132" cy="34" rx="9" ry="4" fill="#43a047" transform="rotate(-25 132 34)"/>' +
        '<g transform="rotate(-35 190 70)"><rect x="176" y="40" width="12" height="60" fill="#fdd835"/><rect x="176" y="34" width="12" height="8" fill="#f48fb1"/><polygon points="176,100 188,100 182,114" fill="#ffe0b2"/><polygon points="180,108 184,108 182,114" fill="#37474f"/></g>' +
        '<text x="44" y="60" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="22" fill="#c62828">A+</text>';
    },
    agostinas: function () {
      var cx = 120, cy = 64, r = 46, s = '';
      var cols = ['#ff7043', '#ffca28', '#26a69a', '#ab47bc'];
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + r * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r * Math.sin(a)).toFixed(1) + '" stroke="#90a4ae" stroke-width="2"/>';
      }
      for (var k = 0; k < 8; k++) {
        var b = k * Math.PI / 4 + Math.PI / 8;
        var gx = cx + r * Math.cos(b), gy = cy + r * Math.sin(b);
        s += '<line x1="' + gx.toFixed(1) + '" y1="' + gy.toFixed(1) + '" x2="' + gx.toFixed(1) + '" y2="' + (gy + 6).toFixed(1) + '" stroke="#546e7a" stroke-width="2"/>' +
          '<rect x="' + (gx - 7).toFixed(1) + '" y="' + (gy + 6).toFixed(1) + '" width="14" height="10" rx="3" fill="' + cols[k % 4] + '"/>';
      }
      var bandera = '';
      for (var j = 0; j < 10; j++) bandera += '<polygon points="' + (4 + j * 24) + ',6 ' + (24 + j * 24) + ',6 ' + (14 + j * 24) + ',20" fill="' + cols[j % 4] + '"/>';
      return '<path d="M0 6Q120 18 240 6" stroke="#90a4ae" fill="none"/>' + bandera + sombra(120, 70) +
        '<path d="M120 64L82 140M120 64L158 140M92 120H148" stroke="#546e7a" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#78909c" stroke-width="4"/>' + s +
        '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#ff7043"/>' +
        '<path d="M188 140v-28l14-10 14 10v28Z" fill="#ffca28"/><path d="M186 104l16-14 16 14" fill="#ff7043"/>' +
        '<circle cx="32" cy="104" r="10" fill="#ab47bc"/><path d="M32 114v26" stroke="#90a4ae" stroke-width="2"/><circle cx="48" cy="96" r="8" fill="#26a69a"/><path d="M48 104v36" stroke="#90a4ae" stroke-width="2"/>';
    },
    patrias: function () {
      var c = uid('bandera');
      var ola = 'M70 30C95 20 115 40 140 30S180 20 196 28V94C180 86 160 104 140 96S95 86 70 96Z';
      return sombra(70, 30) +
        '<rect x="64" y="22" width="6" height="120" rx="3" fill="#8d6e63"/><circle cx="67" cy="20" r="5" fill="#fbc02d"/>' +
        '<clipPath id="' + c + '"><path d="' + ola + '"/></clipPath>' +
        '<g clip-path="url(#' + c + ')"><rect x="60" y="0" width="150" height="47" fill="#0f47af"/><rect x="60" y="47" width="150" height="24" fill="#fff"/>' +
        '<rect x="60" y="71" width="150" height="50" fill="#0f47af"/></g>' +
        '<path d="' + ola + '" fill="none" stroke="#0b3a8f" stroke-width="1.5"/>' +
        '<circle cx="134" cy="59" r="7" fill="none" stroke="#c9a227" stroke-width="2"/><polygon points="134,53 139,62 129,62" fill="#2e7d32"/>' +
        '<text x="160" y="132" text-anchor="middle" font-family="Big Shoulders Display, Figtree, Arial Narrow, sans-serif" font-weight="800" font-size="20" fill="#0f47af">15 de septiembre</text>' +
        estrella(212, 40, 8, '#0f47af') + estrella(30, 46, 6, '#5b8def') + estrella(28, 110, 8, '#0f47af');
    },
    calabiuza: function () {
      var ayote = function (cx, cy, r, cara) {
        return '<ellipse cx="' + (cx - r * 0.5) + '" cy="' + cy + '" rx="' + (r * 0.6) + '" ry="' + (r * 0.85) + '" fill="#e65100"/>' +
          '<ellipse cx="' + (cx + r * 0.5) + '" cy="' + cy + '" rx="' + (r * 0.6) + '" ry="' + (r * 0.85) + '" fill="#e65100"/>' +
          '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (r * 0.62) + '" ry="' + (r * 0.9) + '" fill="#ef6c00"/>' +
          '<rect x="' + (cx - 3) + '" y="' + (cy - r * 0.95 - 8) + '" width="6" height="10" rx="2" fill="#558b2f"/>' +
          (cara ? '<polygon points="' + (cx - r * 0.45) + ',' + (cy - r * 0.15) + ' ' + (cx - r * 0.2) + ',' + (cy - r * 0.15) + ' ' + (cx - r * 0.32) + ',' + (cy - r * 0.4) + '" fill="#3e2000"/>' +
            '<polygon points="' + (cx + r * 0.2) + ',' + (cy - r * 0.15) + ' ' + (cx + r * 0.45) + ',' + (cy - r * 0.15) + ' ' + (cx + r * 0.32) + ',' + (cy - r * 0.4) + '" fill="#3e2000"/>' +
            '<path d="M' + (cx - r * 0.5) + ' ' + (cy + r * 0.2) + 'l' + (r * 0.2) + ' ' + (r * 0.18) + 'l' + (r * 0.2) + ' -' + (r * 0.18) + 'l' + (r * 0.2) + ' ' + (r * 0.18) + 'l' + (r * 0.2) + ' -' + (r * 0.18) + 'l' + (r * 0.2) + ' ' + (r * 0.18) + '" stroke="#3e2000" stroke-width="3.5" fill="none" stroke-linejoin="round"/>' : '');
      };
      var vela = function (x, h) {
        return '<rect x="' + (x - 5) + '" y="' + (138 - h) + '" width="10" height="' + h + '" rx="2" fill="#fff8e1" stroke="#d7ccc8"/>' +
          '<path d="M' + x + ' ' + (126 - h) + 'q6 7 0 12q-6-5 0-12Z" fill="#ffb300"/><circle cx="' + x + '" cy="' + (134 - h) + '" r="9" fill="#ffd54f" opacity=".25"/>';
      };
      var cempasuchil = function (cx, cy) { return flor(cx, cy, 5, '#ffa000', '#e65100'); };
      return sombra(120, 104) + ayote(84, 108, 30, true) + ayote(156, 116, 22, true) +
        vela(30, 34) + vela(46, 24) + vela(204, 30) +
        cempasuchil(196, 132) + cempasuchil(214, 128) + cempasuchil(120, 136) + cempasuchil(62, 140) +
        '<circle cx="52" cy="34" r="16" fill="#fff3c4"/><circle cx="47" cy="30" r="3" fill="#ffe082"/><circle cx="57" cy="40" r="2" fill="#ffe082"/>' +
        murcielago(170, 30, 1.1) + murcielago(204, 50, 0.8);
    },
  };

  /** Escena genérica para las épocas propias de la organización (confeti + emoji). */
  function generica(e) {
    var cols = e.colores || ['#0b6b57', '#ffc533'];
    var s = '';
    for (var i = 0; i < 22; i++) {
      var x = 14 + (i * 53) % 212, y = 12 + (i * 37) % 120, c = cols[i % cols.length];
      s += i % 3 ? '<rect x="' + x + '" y="' + y + '" width="7" height="12" rx="2" fill="' + c + '" transform="rotate(' + (i * 29 % 90 - 45) + ' ' + x + ' ' + y + ')"/>'
        : '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + c + '"/>';
    }
    return s + '<circle cx="120" cy="76" r="44" fill="' + cols[0] + '"/><circle cx="120" cy="76" r="36" fill="#fff"/>' +
      '<text x="120" y="92" text-anchor="middle" font-size="44">' + (e.emoji || '🎉') + '</text>';
  }

  function svg(e) {
    if (!e) return '';
    var dibujo = DIBUJOS[e.id] ? DIBUJOS[e.id](e) : generica(e);
    return marco(dibujo, e.nombre);
  }

  /** Versión como imagen de fondo (para usar en CSS). */
  function url(e) {
    var s = svg(e).replace('<svg ', '<svg width="240" height="150" ');
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }

  return { svg: svg, url: url, tiene: function (id) { return !!DIBUJOS[id]; } };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Escenas;
