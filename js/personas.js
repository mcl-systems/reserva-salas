/**
 * Personas para invitar: directorio de la organización, usuarios del sistema y tus contactos.
 * Se carga una vez al entrar (y se guarda un día en este navegador para abrir más rápido).
 */
var Personas = (function () {
  'use strict';
  var CLAVE = 'rs_personas_v1';
  var datos = { personas: [], frecuentes: [], grupos: [], directorioOrganizacion: false };
  var porEmail = {};
  var cargando = null;

  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function indexar() {
    porEmail = {};
    datos.personas.forEach(function (p) {
      p._n = normalizar(p.nombre);
      p._e = p.email.toLowerCase();
      porEmail[p._e] = p;
    });
  }

  function cargar(api, usuario) {
    var guardado = U.almacen.leer(CLAVE);
    if (guardado && guardado.usuario === usuario && Date.now() - guardado.t < 86400000) {
      datos = guardado.datos;
      indexar();
    }
    if (!api || !api.directorio) return Promise.resolve(datos);
    cargando = api.directorio().then(function (d) {
      datos = { personas: d.personas || [], frecuentes: d.frecuentes || [], grupos: d.grupos || [], directorioOrganizacion: !!d.directorioOrganizacion };
      indexar();
      U.almacen.guardar(CLAVE, { usuario: usuario, t: Date.now(), datos: datos });
      return datos;
    }).catch(function () { return datos; });
    return cargando;
  }

  /** Personas que coinciden con el texto (por nombre o correo, sin importar acentos). */
  function buscar(texto, excluir, max) {
    var q = normalizar(texto).trim();
    excluir = excluir || [];
    if (!q) return [];
    var palabras = q.split(/\s+/);
    var res = [];
    datos.personas.forEach(function (p) {
      if (excluir.indexOf(p._e) !== -1) return;
      var enNombre = palabras.every(function (w) { return p._n.indexOf(w) !== -1; });
      var enCorreo = p._e.indexOf(q) !== -1;
      if (!enNombre && !enCorreo) return;
      // Primero quien empieza por lo escrito, luego tus frecuentes, luego el resto
      var puntos = 0;
      if (p._n.indexOf(q) === 0 || p._e.indexOf(q) === 0) puntos += 10;
      if (p._n.split(' ').some(function (w) { return w.indexOf(palabras[0]) === 0; })) puntos += 5;
      var f = datos.frecuentes.indexOf(p._e);
      if (f !== -1) puntos += 8 - Math.min(f, 7);
      if (p.fuente === 'usuario') puntos += 1;
      res.push({ p: p, puntos: puntos });
    });
    return res.sort(function (a, b) { return b.puntos - a.puntos || a.p.nombre.localeCompare(b.p.nombre, 'es'); })
      .slice(0, max || 8).map(function (x) { return x.p; });
  }

  function persona(email) { return porEmail[String(email || '').toLowerCase()] || null; }
  function nombre(email) { var p = persona(email); return p && p.nombre && p.nombre !== p.email ? p.nombre : ''; }
  function frecuentes(excluir) {
    excluir = excluir || [];
    return datos.frecuentes.filter(function (e) { return excluir.indexOf(e) === -1; })
      .map(function (e) { return persona(e) || { email: e, nombre: e, foto: '' }; });
  }
  function grupos() { return datos.grupos || []; }

  /** Saca todos los correos de un texto pegado («Ana <ana@x.com>, beto@y.com; …»). */
  function correosDe(texto) {
    var m = String(texto || '').match(/[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[a-z]{2,}/gi) || [];
    return m.map(function (c) { return c.toLowerCase(); }).filter(function (c, i, a) { return a.indexOf(c) === i; });
  }

  function avatar(p, clase) {
    var ini = U.iniciales(p.nombre && p.nombre !== p.email ? p.nombre : p.email);
    return p.foto
      ? '<img class="' + (clase || 'ini') + '" src="' + U.esc(p.foto) + '" alt="" referrerpolicy="no-referrer" loading="lazy">'
      : '<span class="' + (clase || 'ini') + '">' + U.esc(ini) + '</span>';
  }

  return {
    cargar: cargar, buscar: buscar, persona: persona, nombre: nombre, frecuentes: frecuentes, grupos: grupos,
    correosDe: correosDe, avatar: avatar, normalizar: normalizar,
    todas: function () { return datos.personas; },
    hayDirectorio: function () { return !!datos.directorioOrganizacion; },
  };
})();
