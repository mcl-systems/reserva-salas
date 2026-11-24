/** Utilidades de fechas, formato y DOM. */
var U = (function () {
  'use strict';

  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

  function dd(n) { return (n < 10 ? '0' : '') + n; }
  function inicioDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function sumarDias(d, n) { var x = inicioDia(d); x.setDate(x.getDate() + n); return x; }
  function sumarMeses(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function inicioSemana(d) { var x = inicioDia(d); var dia = x.getDay() || 7; return sumarDias(x, 1 - dia); } // lunes
  function inicioMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function mismoDia(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function claveDia(d) { return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()); }
  function desdeClave(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function combinar(fechaClave, hhmm) {
    var p = fechaClave.split('-'), h = String(hhmm).split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +h[0], +(h[1] || 0));
  }
  function minutosDelDia(d) { return d.getHours() * 60 + d.getMinutes(); }
  function hhmm(d) { return dd(d.getHours()) + ':' + dd(d.getMinutes()); }
  function minutosAHhmm(m) { return dd(Math.floor(m / 60)) + ':' + dd(m % 60); }

  function hora(d, formato24) {
    var h = d.getHours(), m = d.getMinutes();
    if (formato24) return h + ':' + dd(m);
    var sufijo = h < 12 ? 'a. m.' : 'p. m.';
    var h12 = h % 12 || 12;
    return h12 + (m ? ':' + dd(m) : '') + ' ' + sufijo;
  }
  function horaCompacta(d, formato24) {
    var h = d.getHours(), m = d.getMinutes();
    if (formato24) return h + ':' + dd(m);
    return (h % 12 || 12) + (m ? ':' + dd(m) : '') + (h < 12 ? ' a. m.' : ' p. m.');
  }
  function etiquetaHora(h, formato24) {
    if (formato24) return dd(h) + ':00';
    if (h === 0) return '12 a. m.';
    if (h === 12) return '12 p. m.';
    return (h % 12) + (h < 12 ? ' a. m.' : ' p. m.');
  }
  function rangoHoras(ini, fin, formato24) {
    var a = horaCompacta(ini, formato24), b = horaCompacta(fin, formato24);
    if (!formato24 && (ini.getHours() < 12) === (fin.getHours() < 12)) a = a.replace(/ [ap]\. m\.$/, '');
    return a + ' – ' + b;
  }
  function fechaLarga(d) { return DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fechaMedia(d) { return DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MESES_CORTOS[d.getMonth()]; }
  function relativa(d) {
    var hoy = inicioDia(new Date());
    var diff = Math.round((inicioDia(d) - hoy) / 86400000);
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'mañana';
    if (diff === 2) return 'pasado mañana';
    if (diff > 0 && diff < 7) return 'el ' + DIAS[d.getDay()];
    return 'el ' + fechaLarga(d);
  }
  function duracionTexto(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + ' h ' + m + ' min';
    if (h) return h + (h === 1 ? ' hora' : ' horas');
    return m + ' min';
  }
  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function iniciales(nombre) {
    var partes = String(nombre || '?').split('@')[0].replace(/\([^)]*\)/g, ' ').split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
    return (partes.slice(0, 2).map(function (p) { return p[0]; }).join('') || '?').toUpperCase();
  }
  function colorTexto(hex) {
    var c = String(hex || '#039be5').replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1f1f1f' : '#ffffff';
  }
  var almacen = {
    leer: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    guardar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    borrar: function (k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  var sesion = {
    leer: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    guardar: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } },
    borrar: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* nada */ } },
  };

  return {
    DIAS: DIAS, DIAS_CORTOS: DIAS_CORTOS, MESES: MESES, MESES_CORTOS: MESES_CORTOS,
    dd: dd, inicioDia: inicioDia, sumarDias: sumarDias, sumarMeses: sumarMeses, inicioSemana: inicioSemana,
    inicioMes: inicioMes, mismoDia: mismoDia, claveDia: claveDia, desdeClave: desdeClave, combinar: combinar,
    minutosDelDia: minutosDelDia, hhmm: hhmm, minutosAHhmm: minutosAHhmm, hora: hora, horaCompacta: horaCompacta,
    etiquetaHora: etiquetaHora, rangoHoras: rangoHoras, fechaLarga: fechaLarga, fechaMedia: fechaMedia, relativa: relativa,
    duracionTexto: duracionTexto, capitalizar: capitalizar, esc: esc, $: $, $$: $$, el: el, iniciales: iniciales,
    colorTexto: colorTexto, almacen: almacen, sesion: sesion,
  };
})();
