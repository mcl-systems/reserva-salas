/**
 * Tipografía elegible por cada persona.
 * Se carga en <head> (después de config.js) para aplicar la letra antes de pintar la página
 * y así evitar el parpadeo. Solo descarga de Google Fonts la familia elegida; las muestras
 * del selector («Aa») usan un subconjunto mínimo con el parámetro text=.
 */
(function () {
  var CLAVE = 'rs_fuente';
  // id, nombre visible, descripción, familia de texto, familia de títulos, consulta de Google Fonts
  var OPCIONES = [
    { id: 'moderna', nombre: 'Moderna', desc: 'Figtree: limpia y clara', texto: 'Figtree', titulos: 'Figtree', q: 'Figtree:wght@400;500;600;700;800' },
    { id: 'redondeada', nombre: 'Redondeada', desc: 'Nunito: suave y amigable', texto: 'Nunito', titulos: 'Nunito', q: 'Nunito:wght@400;500;600;700;800' },
    { id: 'amplia', nombre: 'Amplia', desc: 'Lexend: letras anchas, fácil de leer', texto: 'Lexend', titulos: 'Lexend', q: 'Lexend:wght@400;500;600;700;800' },
    { id: 'google', nombre: 'Google', desc: 'Roboto: la de Google Calendar', texto: 'Roboto', titulos: 'Roboto', q: 'Roboto:wght@400;500;700;800' },
    { id: 'legible', nombre: 'Alta legibilidad', desc: 'Atkinson: pensada para baja visión', texto: 'Atkinson Hyperlegible Next', titulos: 'Atkinson Hyperlegible Next', q: 'Atkinson+Hyperlegible+Next:wght@400;500;700;800' },
    { id: 'letrero', nombre: 'Letrero', desc: 'Títulos altos y angostos, como un rótulo', texto: 'Atkinson Hyperlegible Next', titulos: 'Big Shoulders Display', q: 'Atkinson+Hyperlegible+Next:wght@400;500;700&family=Big+Shoulders+Display:wght@600;700;800' },
  ];
  var RESPALDO = ", 'Segoe UI', system-ui, -apple-system, Arial, sans-serif";

  function buscar(id) {
    for (var i = 0; i < OPCIONES.length; i++) if (OPCIONES[i].id === id) return OPCIONES[i];
    return null;
  }
  function predeterminada() {
    var c = window.APP_CONFIG || {};
    return buscar(c.FUENTE) ? c.FUENTE : 'moderna';
  }
  function leer() {
    try { var v = JSON.parse(localStorage.getItem(CLAVE)); return buscar(v) ? v : null; } catch (e) { return null; }
  }
  function enlace(id, href) {
    var l = document.getElementById(id);
    if (!l) { l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; document.head.appendChild(l); }
    if (l.getAttribute('href') !== href) l.href = href;
  }

  function aplicar(id, guardar) {
    var o = buscar(id) || buscar(predeterminada());
    enlace('fuente-actual', 'https://fonts.googleapis.com/css2?family=' + o.q + '&display=swap');
    var raiz = document.documentElement;
    raiz.dataset.fuente = o.id;
    raiz.style.setProperty('--fuente-texto', "'" + o.texto + "'" + RESPALDO);
    raiz.style.setProperty('--fuente-display', "'" + o.titulos + "'" + RESPALDO);
    if (guardar) { try { localStorage.setItem(CLAVE, JSON.stringify(o.id)); } catch (e) { /* sin almacenamiento */ } }
    return o.id;
  }

  // Carga un subconjunto diminuto de todas las familias, solo para las muestras del selector.
  function cargarMuestras() {
    var fams = [];
    OPCIONES.forEach(function (o) {
      var f = o.titulos.replace(/ /g, '+') + ':wght@700';
      if (fams.indexOf(f) < 0) fams.push(f);
    });
    enlace('fuente-muestras', 'https://fonts.googleapis.com/css2?family=' + fams.join('&family=') + '&text=Aa&display=swap');
  }

  function html() {
    var actual = document.documentElement.dataset.fuente;
    return '<div class="elegir-fuente" role="radiogroup" aria-label="Tipo de letra">' + OPCIONES.map(function (o) {
      return '<button type="button" role="radio" data-fuente="' + o.id + '" aria-checked="' + (o.id === actual) + '" data-tip="' + o.desc + '">' +
        '<span class="muestra" style="font-family:\'' + o.titulos + '\'' + RESPALDO + '">Aa</span><span class="nombre">' + o.nombre + '</span></button>';
    }).join('') + '</div>';
  }
  function conectar(cont, alCambiar) {
    cargarMuestras();
    var botones = cont.querySelectorAll('.elegir-fuente [data-fuente]');
    Array.prototype.forEach.call(botones, function (b) {
      b.addEventListener('click', function () {
        aplicar(b.dataset.fuente, true);
        Array.prototype.forEach.call(botones, function (x) { x.setAttribute('aria-checked', String(x === b)); });
        if (alCambiar) alCambiar(b.dataset.fuente);
      });
    });
  }

  aplicar(leer() || predeterminada());

  window.Fuentes = { OPCIONES: OPCIONES, aplicar: aplicar, html: html, conectar: conectar, actual: function () { return document.documentElement.dataset.fuente; } };
})();
