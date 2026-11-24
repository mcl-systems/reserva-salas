/**
 * Ayudas de uso: buscador universal (Ctrl+K), atajos de teclado (?), recorrido de bienvenida,
 * usuarios conectados (administradores), aviso sin conexión y consejos descartables.
 */
var Ayuda = (function () {
  'use strict';

  var CLAVE_BIENVENIDA = 'rs_bienvenida_v1';
  var CLAVE_CONSEJOS = 'rs_consejos_ocultos';
  var presencia = [];
  var temporizadorLatido = null;

  function f24() { return !!App.C.FORMATO_24H; }
  function nombreApp() { return App.C.NOMBRE_APP || 'Reserva de Salas'; }

  // ======================================================================
  // Buscador universal
  // ======================================================================
  var resultados = [];
  var indice = 0;
  var misReuniones = null;

  function abrirBuscador() {
    var dlg = U.$('#dlg-buscar');
    if (dlg.open) return;
    U.$('#buscar-texto').value = '';
    pintarResultados('');
    dlg.showModal();
    U.$('#buscar-texto').focus();
    // Precargar mis reuniones de los próximos 60 días para buscarlas por título
    var hoy = U.inicioDia(new Date());
    App.api().listar(U.sumarDias(hoy, -7), U.sumarDias(hoy, 60), { soloMias: true }).then(function (l) {
      misReuniones = l;
      if (dlg.open) pintarResultados(U.$('#buscar-texto').value);
    }).catch(function () {});
  }

  function acciones() {
    var lista = [
      { grupo: 'Acciones', icono: 'add', texto: 'Crear una reserva', detalle: 'Atajo: C', fn: function () { Editor.abrir({ fecha: new Date() }); } },
      { grupo: 'Acciones', icono: 'auto_awesome', texto: 'Pedir una sala al asistente', detalle: 'Atajo: /', fn: function () { App.abrirAsistente(); } },
      { grupo: 'Acciones', icono: 'today', texto: 'Ir a hoy', detalle: 'Atajo: T', fn: function () { App.irA(new Date()); } },
      { grupo: 'Ir a', icono: 'calendar_month', texto: 'Calendario', fn: function () { App.irPagina('calendario'); } },
      { grupo: 'Ir a', icono: 'space_dashboard', texto: 'Mi panel', detalle: 'Resumen de tus reuniones', fn: function () { App.irPagina('panel'); } },
      { grupo: 'Ir a', icono: 'meeting_room', texto: 'Salas', detalle: 'Fotos, capacidad y disponibilidad', fn: function () { App.irPagina('salas'); } },
      { grupo: 'Acciones', icono: 'dark_mode', texto: 'Cambiar tema claro / oscuro', fn: function () { App.alternarTema(); } },
      { grupo: 'Acciones', icono: 'keyboard', texto: 'Ver atajos de teclado', detalle: 'Atajo: ?', fn: mostrarAyuda },
    ];
    if (App.esAdmin()) {
      lista.splice(6, 0,
        { grupo: 'Ir a', icono: 'admin_panel_settings', texto: 'Panel de control', detalle: 'Reportes, reservas, salas y usuarios', fn: function () { App.irPagina('control'); } },
        { grupo: 'Ir a', icono: 'monitoring', texto: 'Reportes de uso', fn: function () { Paneles.irPestana('reportes'); } },
        { grupo: 'Ir a', icono: 'group', texto: 'Usuarios y quién está conectado', fn: function () { Paneles.irPestana('usuarios'); } });
    }
    return lista;
  }

  function pintarResultados(texto) {
    var q = Interprete.normalizar(texto);
    var coincide = function (t) { return !q || Interprete.normalizar(t).indexOf(q) !== -1; };
    resultados = [];
    acciones().forEach(function (a) { if (coincide(a.texto + ' ' + (a.detalle || ''))) resultados.push(a); });
    App.estado.salas.filter(function (s) { return s.activa; }).forEach(function (s) {
      if (!coincide(s.nombre + ' ' + s.ubicacion + ' ' + s.equipamiento)) return;
      resultados.push({
        grupo: 'Salas', color: s.color, texto: 'Reservar ' + s.nombre, detalle: s.capacidad + ' personas' + (s.ubicacion ? ' · ' + s.ubicacion : ''),
        fn: function () { Editor.abrir({ fecha: new Date(), salaId: s.id }); },
      });
    });
    if (q) {
      var vistas = {};
      var reuniones = (misReuniones || []).concat(Object.keys(App.estado.cache).map(function (k) { return App.estado.cache[k]; }));
      reuniones.filter(function (r) {
        if (vistas[r.id] || r.estado !== 'confirmada' || r.oculta) return false;
        vistas[r.id] = true;
        return coincide(r.titulo + ' ' + r.organizadorNombre);
      }).sort(function (a, b) { return Math.abs(new Date(a.inicio) - Date.now()) - Math.abs(new Date(b.inicio) - Date.now()); })
        .slice(0, 8).forEach(function (r) {
          var s = App.salaPorId(r.salaId) || { color: '#999', nombre: '' };
          resultados.push({
            grupo: 'Reuniones', color: s.color, texto: r.titulo,
            detalle: U.capitalizar(U.fechaMedia(new Date(r.inicio))) + ' · ' + U.rangoHoras(new Date(r.inicio), new Date(r.fin), f24()) + ' · ' + s.nombre,
            fn: function () {
              App.estado.cache[r.id] = r;
              App.irA(new Date(r.inicio), 'dia');
              setTimeout(function () {
                var el = document.querySelector('.evento[data-id="' + r.id + '"]');
                if (el) { el.scrollIntoView({ block: 'center' }); App.abrirPopover(r.id, el); }
              }, 450);
            },
          });
        });
      if (window.Huevos && Huevos.buscar) {
        var extra = Huevos.buscar(q);
        if (extra) resultados.unshift(extra);
      }
    }
    indice = 0;
    var ul = U.$('#buscar-resultados');
    if (!resultados.length) {
      ul.innerHTML = '<li class="buscar-vacio">No encontré nada con «' + U.esc(texto) + '». Prueba con el nombre de una reunión o una sala.</li>';
      return;
    }
    var grupo = '', html = '';
    resultados.forEach(function (r, i) {
      if (r.grupo !== grupo) { grupo = r.grupo; html += '<li class="buscar-grupo" role="presentation">' + U.esc(grupo) + '</li>'; }
      html += '<li class="buscar-item" role="option" id="res-' + i + '" data-i="' + i + '" aria-selected="' + (i === 0) + '">' +
        (r.color ? '<i style="--c:' + r.color + '"></i>' : '<span class="ms">' + r.icono + '</span>') +
        '<span class="txt"><b>' + U.esc(r.texto) + '</b>' + (r.detalle ? '<small>' + U.esc(r.detalle) + '</small>' : '') + '</span></li>';
    });
    ul.innerHTML = html;
    U.$$('.buscar-item', ul).forEach(function (li) {
      li.addEventListener('click', function () { ejecutar(Number(li.dataset.i)); });
      li.addEventListener('pointermove', function () { seleccionar(Number(li.dataset.i)); });
    });
    U.$('#buscar-texto').setAttribute('aria-activedescendant', 'res-0');
  }

  function seleccionar(i) {
    if (!resultados.length) return;
    indice = (i + resultados.length) % resultados.length;
    U.$$('.buscar-item').forEach(function (li) { li.setAttribute('aria-selected', String(Number(li.dataset.i) === indice)); });
    var el = U.$('#res-' + indice);
    if (el) el.scrollIntoView({ block: 'nearest' });
    U.$('#buscar-texto').setAttribute('aria-activedescendant', 'res-' + indice);
  }

  function ejecutar(i) {
    var r = resultados[i];
    if (!r) return;
    U.$('#dlg-buscar').close();
    setTimeout(r.fn, 30);
  }

  // ======================================================================
  // Ayuda y atajos
  // ======================================================================
  function mostrarAyuda() {
    var k = function (t) { return t.split('+').map(function (x) { return '<kbd>' + U.esc(x) + '</kbd>'; }).join(''); };
    var filas = [
      ['General', [['Buscar reuniones, salas y acciones', 'Ctrl+K'], ['Abrir el asistente', '/'], ['Ver esta ayuda', '?'], ['Cerrar o cancelar', 'Esc']]],
      ['Calendario', [['Crear una reserva', 'C'], ['Ir a hoy', 'T'], ['Vista día / semana / mes / agenda', 'D W M A'], ['Siguiente / anterior', 'N P']]],
      ['Reuniones', [['Copiar la reunión abierta', 'Ctrl+C'], ['Pegar donde está el puntero', 'Ctrl+V'], ['Mover (solo las tuyas)', 'Arrastrar'], ['Cambiar duración', 'Estirar borde']]],
    ];
    U.$('#ayuda-cuerpo').innerHTML = '<div class="ayuda-rejilla">' + filas.map(function (g) {
      return '<h3>' + g[0] + '</h3>' + g[1].map(function (f) {
        var teclas = /^[A-Z] [A-Z]/.test(f[1]) ? f[1].split(' ').map(k).join('') : /^(Arrastrar|Estirar)/.test(f[1]) ? '<small class="tenue">' + f[1] + '</small>' : k(f[1]);
        return '<div class="ayuda-fila"><span>' + U.esc(f[0]) + '</span><span>' + teclas + '</span></div>';
      }).join('');
    }).join('') + '</div><h3 class="ayuda-sub">Tipo de letra</h3>' + Fuentes.html() + '<h3 class="ayuda-sub">Tamaño de letra</h3>' + App.htmlLetra() + '<div class="ayuda-acciones">' +
      '<button class="btn btn-tonal btn-pequeno" id="ayuda-recorrido"><span class="ms">tour</span>Ver el recorrido de bienvenida</button>' +
      '<button class="btn btn-borde btn-pequeno" id="ayuda-consejos"><span class="ms">lightbulb</span>Mostrar consejos en la barra lateral</button></div>';
    App.conectarLetra(U.$('#ayuda-cuerpo'));
    Fuentes.conectar(U.$('#ayuda-cuerpo'), function () { App.dibujar(true); });
    U.$('#ayuda-recorrido').addEventListener('click', function () { U.$('#dlg-ayuda').close(); bienvenida(true); });
    U.$('#ayuda-consejos').addEventListener('click', function () {
      U.almacen.borrar(CLAVE_CONSEJOS);
      U.$('#consejos').hidden = false;
      U.$('#dlg-ayuda').close();
      App.irPagina('calendario');
    });
    U.$('#dlg-ayuda').showModal();
  }

  // ======================================================================
  // Recorrido de bienvenida
  // ======================================================================
  function pasos() {
    var p = [
      { icono: 'meeting_room', titulo: 'Bienvenido a ' + nombreApp(), texto: 'Aquí reservas salas de reunión de ' + (App.estado.config.NOMBRE_ORGANIZACION || App.C.NOMBRE_ORGANIZACION || 'tu organización') + ' sin choques de horario. Tus reservas llegan a tu Google Calendar.' },
      { icono: 'touch_app', titulo: 'Reserva en segundos', texto: 'Arrastra sobre el calendario en el horario que quieras, o usa el botón «Crear». Te mostramos al instante qué salas están libres.' },
      { icono: 'auto_awesome', titulo: 'O pídeselo al asistente', texto: 'Escribe como hablas: «sala para 6 mañana a las 3» o «todos los lunes a las 9». Siempre te pide confirmación antes de reservar.' },
      { icono: 'space_dashboard', titulo: 'Tu panel', texto: 'En «Mi panel» ves tu próxima reunión, tu semana y tu historial. Solo tú (o un administrador) puede cambiar tus reuniones.' },
    ];
    if (App.esAdmin()) p.push({ icono: 'admin_panel_settings', titulo: 'Eres administrador', texto: 'El botón «Panel de control» de arriba te lleva a los reportes, a todas las reservas, a las salas (con fotos) y a los usuarios conectados.' });
    return p;
  }

  function bienvenida(forzar) {
    if (!forzar && U.almacen.leer(CLAVE_BIENVENIDA)) return;
    var lista = pasos(), i = 0;
    var dlg = U.$('#dlg-bienvenida');
    function pintar() {
      var p = lista[i];
      var burbujas = '<span class="burbuja" style="width:160px;height:160px;left:-40px;top:-50px"></span><span class="burbuja" style="width:90px;height:90px;right:30px;bottom:-30px"></span>';
      U.$('#bienvenida-ilustracion').innerHTML = burbujas + '<span class="ms">' + p.icono + '</span>';
      U.$('#bienvenida-titulo').textContent = p.titulo;
      U.$('#bienvenida-texto').textContent = p.texto;
      U.$('#bienvenida-puntos').innerHTML = lista.map(function (_, j) { return '<span' + (j === i ? ' class="activo"' : '') + '></span>'; }).join('');
      U.$('#bienvenida-atras').hidden = i === 0;
      U.$('#bienvenida-siguiente').textContent = i === lista.length - 1 ? 'Empezar' : 'Siguiente';
    }
    function cerrar() { U.almacen.guardar(CLAVE_BIENVENIDA, true); if (dlg.open) dlg.close(); }
    U.$('#bienvenida-siguiente').onclick = function () { if (i < lista.length - 1) { i++; pintar(); } else cerrar(); };
    U.$('#bienvenida-atras').onclick = function () { if (i > 0) { i--; pintar(); } };
    U.$('#bienvenida-omitir').onclick = cerrar;
    dlg.onclose = function () { U.almacen.guardar(CLAVE_BIENVENIDA, true); };
    pintar();
    dlg.showModal();
    U.$('#bienvenida-siguiente').focus();
  }

  // ======================================================================
  // Usuarios conectados
  // ======================================================================
  var PAGINAS = { calendario: 'Calendario', panel: 'Mi panel', salas: 'Salas', control: 'Panel de control' };

  function haceCuanto(ts) {
    var min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    return 'hace ' + Math.round(min / 60) + ' h';
  }

  function latido() {
    if (!App.estado.usuario || document.hidden) return;
    App.api().latido({ pagina: App.estado.pagina, dispositivo: window.innerWidth < 640 ? 'movil' : 'computadora' }).then(function (r) {
      if (r && r.presencia) { presencia = r.presencia; pintarPresencia(); }
    }).catch(function () {});
  }

  function iniciarLatido() {
    clearInterval(temporizadorLatido);
    latido();
    temporizadorLatido = setInterval(latido, 60000);
  }

  function enLinea() { return presencia.filter(function (p) { return p.enLinea; }); }

  function avatarHtml(p) {
    return p.foto ? '<img src="' + U.esc(p.foto) + '" alt="" referrerpolicy="no-referrer">' : U.esc(U.iniciales(p.nombre));
  }

  function pintarPresencia() {
    var activos = enLinea();
    var boton = U.$('#btn-en-linea');
    if (!App.esAdmin()) { boton.hidden = true; return; }
    boton.hidden = false;
    U.$('#pila-avatares').innerHTML = activos.slice(0, 3).map(function (p) {
      return '<span class="avatar" style="background:' + colorPersona(p.email) + '">' + avatarHtml(p) + '</span>';
    }).join('');
    U.$('#txt-en-linea').textContent = activos.length + ' en línea';
    boton.setAttribute('aria-label', activos.length + ' usuarios conectados');
    boton.setAttribute('data-tip', activos.length === 1 ? 'Solo tú estás conectado' : activos.map(function (p) { return p.nombre; }).join(', '));
    if (window.Paneles && Paneles.alCambiarPresencia) Paneles.alCambiarPresencia(presencia);
  }

  function colorPersona(email) {
    var colores = ['#7b61c9', '#1e8e3e', '#d93025', '#e37400', '#1a73e8', '#a142f4', '#00796b', '#c5221f'];
    var h = 0;
    String(email).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    return colores[h % colores.length];
  }

  function abrirPresencia() {
    var m = U.$('#menu-cuenta');
    if (!m.hidden && m.dataset.tipo === 'presencia') { m.hidden = true; return; }
    var activos = enLinea();
    var recientes = presencia.filter(function (p) { return !p.enLinea; });
    var item = function (p) {
      var yo = p.email === App.estado.usuario.email;
      return '<div class="presencia-item' + (p.enLinea ? ' activo' : '') + '"><span class="avatar" style="background:' + colorPersona(p.email) + '">' + avatarHtml(p) +
        '<span class="estado-punto"></span></span><span><b>' + U.esc(p.nombre) + (yo ? ' (tú)' : '') + (p.rol === 'admin' ? ' · admin' : '') + '</b>' +
        '<small>' + (p.enLinea ? 'En ' + U.esc(PAGINAS[p.pagina] || 'la aplicación') : 'Activo ' + haceCuanto(p.ts)) +
        (p.dispositivo ? ' · ' + (p.dispositivo === 'movil' ? 'celular' : 'computadora') : '') +
        (p.enLinea && p.desde ? ' · conectado ' + haceCuanto(p.desde).replace('hace ', 'hace ') : '') + '</small></span></div>';
    };
    m.dataset.tipo = 'presencia';
    m.innerHTML = '<div class="presencia-cab"><b>' + activos.length + (activos.length === 1 ? ' persona conectada' : ' personas conectadas') + '</b>' +
      '<small>Se actualiza cada minuto</small></div><div class="presencia-lista">' +
      (activos.length ? '<div class="presencia-titulo">En línea ahora</div>' + activos.map(item).join('') : '') +
      (recientes.length ? '<div class="presencia-titulo">Activos recientemente</div>' + recientes.map(item).join('') : '') +
      '</div><button class="menu-item" id="ver-usuarios"><span class="ms">group</span>Ver todos los usuarios</button>';
    var r = U.$('#btn-en-linea').getBoundingClientRect();
    m.style.top = r.bottom + 8 + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    m.hidden = false;
    U.$('#ver-usuarios').addEventListener('click', function () { m.hidden = true; Paneles.irPestana('usuarios'); });
  }

  // ======================================================================
  // Iniciar
  // ======================================================================
  function iniciar() {
    var input = U.$('#buscar-texto');
    input.addEventListener('input', function () { pintarResultados(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); seleccionar(indice + 1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); seleccionar(indice - 1); }
      if (e.key === 'Enter') { e.preventDefault(); ejecutar(indice); }
    });
    U.$('#dlg-buscar').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
    U.$('#btn-buscar').addEventListener('click', abrirBuscador);
    U.$('#btn-ayuda').addEventListener('click', mostrarAyuda);
    U.$$('#dlg-ayuda [data-cerrar], #dlg-huevos [data-cerrar]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });
    U.$('#btn-en-linea').addEventListener('click', function (e) { e.stopPropagation(); abrirPresencia(); });

    // Consejos que se pueden ocultar
    if (U.almacen.leer(CLAVE_CONSEJOS)) U.$('#consejos').hidden = true;
    U.$('#consejos-cerrar').addEventListener('click', function () {
      U.almacen.guardar(CLAVE_CONSEJOS, true);
      U.$('#consejos').hidden = true;
      App.aviso('Consejos ocultos. Puedes verlos de nuevo con la tecla ?');
    });

    // Sin conexión
    function red() { U.$('#banner-red').hidden = navigator.onLine !== false; }
    window.addEventListener('online', function () { red(); App.aviso('Conexión recuperada'); App.invalidar(); App.dibujar(true); });
    window.addEventListener('offline', red);
    red();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) latido(); });
  }

  function alEntrar() {
    iniciarLatido();
    setTimeout(function () { if (!document.querySelector('dialog[open]')) bienvenida(false); }, 600);
  }

  return {
    iniciar: iniciar, alEntrar: alEntrar, abrirBuscador: abrirBuscador, mostrarAyuda: mostrarAyuda, bienvenida: bienvenida,
    presencia: function () { return presencia; }, colorPersona: colorPersona, haceCuanto: haceCuanto, latido: latido,
  };
})();
