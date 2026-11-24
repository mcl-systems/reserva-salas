/**
 * Ilustración automática para salas sin fotografía (SVG generado según el tipo y color de la sala).
 */
var Ilustraciones = (function () {
  'use strict';
  var cache = {};

  function mezclar(hex, blanco) {
    var c = String(hex || '#039be5').replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var f = function (v) { return Math.round(v + (255 - v) * blanco); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function silla(x, y, color, escala) {
    var s = escala || 1;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><rect x="-9" y="-16" width="18" height="14" rx="4" fill="' + color + '"/>' +
      '<rect x="-11" y="-3" width="22" height="7" rx="3" fill="' + color + '" opacity=".85"/></g>';
  }

  function sala(s) {
    var clave = s.id + s.color + s.capacidad;
    if (cache[clave]) return cache[clave];
    var color = s.color || '#039be5';
    var pared = mezclar(color, 0.86), paredOscura = mezclar(color, 0.74), piso = mezclar(color, 0.6), mueble = mezclar(color, 0.25);
    var capacidad = Number(s.capacidad) || 6;
    var dentro = '';
    // Pared, ventana y piso
    dentro += '<rect width="400" height="250" fill="' + pared + '"/>' +
      '<rect y="150" width="400" height="100" fill="' + piso + '"/>' +
      '<rect y="146" width="400" height="6" fill="' + paredOscura + '"/>' +
      '<rect x="24" y="26" width="92" height="92" rx="6" fill="#fff" opacity=".75"/>' +
      '<path d="M70 26v92M24 72h92" stroke="' + paredOscura + '" stroke-width="4"/>' +
      '<circle cx="356" cy="40" r="10" fill="#fff" opacity=".6"/>';

    if (capacidad <= 3) {
      // Cabina: escritorio y monitor
      dentro += '<rect x="230" y="60" width="96" height="62" rx="6" fill="' + mueble + '"/><rect x="236" y="66" width="84" height="50" rx="3" fill="' + mezclar(color, 0.5) + '"/>' +
        '<rect x="274" y="122" width="8" height="18" fill="' + mueble + '"/><rect x="180" y="140" width="190" height="12" rx="4" fill="' + mueble + '"/>' +
        '<rect x="190" y="152" width="8" height="60" fill="' + mueble + '"/><rect x="352" y="152" width="8" height="60" fill="' + mueble + '"/>' +
        silla(250, 214, color, 1.5);
    } else if (capacidad >= 50) {
      // Auditorio: escenario, pantalla y filas
      dentro += '<rect x="150" y="30" width="200" height="96" rx="6" fill="' + mueble + '"/><rect x="158" y="38" width="184" height="80" rx="3" fill="#fff" opacity=".85"/>' +
        '<path d="M176 100l34-30 26 20 30-36 52 46z" fill="' + mezclar(color, 0.45) + '"/>' +
        '<rect x="120" y="134" width="260" height="16" rx="4" fill="' + mueble + '"/>';
      for (var fila = 0; fila < 3; fila++) {
        for (var col = 0; col < 9; col++) {
          dentro += silla(40 + col * 42 + (fila % 2) * 10, 182 + fila * 26, mezclar(color, 0.1 + fila * 0.12), 1 - fila * 0.05);
        }
      }
    } else {
      // Sala de reuniones: mesa con sillas y pantalla
      dentro += '<rect x="196" y="36" width="140" height="84" rx="6" fill="' + mueble + '"/><rect x="203" y="43" width="126" height="70" rx="3" fill="' + mezclar(color, 0.5) + '"/>' +
        '<rect x="248" y="120" width="36" height="8" fill="' + mueble + '"/>';
      var sillas = Math.min(10, Math.max(4, Math.round(capacidad / 2) * 2));
      var porLado = sillas / 2;
      var ancho = 60 + porLado * 34;
      var x0 = 200 - ancho / 2 + 24;
      for (var i = 0; i < porLado; i++) dentro += silla(x0 + i * 34 + 6, 176, mezclar(color, 0.15), 1);
      dentro += '<ellipse cx="200" cy="232" rx="' + (ancho / 2 + 20) + '" ry="10" fill="#000" opacity=".08"/>' +
        '<rect x="' + (200 - ancho / 2) + '" y="182" width="' + ancho + '" height="34" rx="17" fill="' + mueble + '"/>' +
        '<rect x="' + (200 - ancho / 2 + 6) + '" y="186" width="' + (ancho - 12) + '" height="10" rx="5" fill="#fff" opacity=".18"/>';
      for (var j = 0; j < porLado; j++) dentro += silla(x0 + j * 34 + 6, 246, mezclar(color, 0.05), 1.05);
      dentro += '<path d="M40 150c0-26 10-40 16-40s16 14 16 40z" fill="' + mezclar(color, 0.35) + '"/><rect x="46" y="146" width="20" height="16" rx="3" fill="' + mueble + '"/>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">' + dentro + '</svg>';
    return (cache[clave] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  return { sala: sala };
})();
