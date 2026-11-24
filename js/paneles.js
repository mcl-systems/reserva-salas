/**
 * Páginas: Mi panel, Galería de salas y Panel de control (administradores).
 */
var Paneles = (function () {
  'use strict';

  var est = {
    pestana: 'reportes', periodo: 'mes', desde: '', hasta: '', salaId: '',
    busqueda: '', filtroEstado: 'todas', pagina: 1, orden: 'desc',
    datos: null, claveDatos: '', historial: 'pasadas', capacidad: 0, textoSalas: '',
  };
  var COLORES = ['#d50000', '#e67c73', '#f4511e', '#f6bf26', '#33b679', '#0b8043', '#039be5', '#3f51b5', '#7986cb', '#8e24aa', '#616161'];

  function f24() { return !!App.C.FORMATO_24H; }
  function pct(n) { return Math.round(n * 100) + ' %'; }
  function num(n) { return String(n).replace('.', ','); }
  function cargandoHtml() { return '<div class="pagina"><div class="esqueleto"></div><div class="esqueleto corto"></div></div>'; }
  function kpi(icono, valor, etiqueta, detalle) {
    return '<div class="kpi"><span class="ms kpi-icono">' + icono + '</span><div><b>' + valor + '</b><span>' + U.esc(etiqueta) + '</span>' +
      (detalle ? '<small>' + detalle + '</small>' : '') + '</div></div>';
  }

  function mostrar(pagina, cont) {
    U.$('#principal').scrollTop = 0;
    if (pagina === 'panel') return miPanel(cont);
    if (pagina === 'salas') return galeria(cont);
    if (pagina === 'control') { est.datos = null; return control(cont); }
  }

  // ======================================================================
  // Fila de reserva reutilizable (con acciones según permisos)
  // ======================================================================
  function filaReserva(r, op) {
    op = op || {};
    var s = App.salaPorId(r.salaId) || { id: '', nombre: 'Sala', color: '#039be5' };
    var ini = new Date(r.inicio), fin = new Date(r.fin), ahora = new Date();
    var cancelada = r.estado !== 'confirmada';
    var editable = !cancelada && App.puedeMover(r);
    var cancelable = !cancelada && r.puedeEditar && fin > ahora;
    return '<div class="fila-reserva' + (cancelada ? ' cancelada' : '') + '" data-id="' + U.esc(r.id) + '" style="--c:' + s.color + '">' +
      App.fotoSala(s, 'fr-foto') +
      '<button class="fr-texto" data-accion="ver"><b>' + (r.privada ? '<span class="ms" data-tip="Privada">lock</span>' : '') + (r.serieId ? '<span class="ms" data-tip="' + U.esc(r.recurrencia || 'Se repite') + '">repeat</span>' : '') + U.esc(r.titulo) + '</b>' +
      '<small>' + U.esc(U.capitalizar(op.sinFecha ? '' : U.fechaMedia(ini) + ' · ')) + U.esc(U.rangoHoras(ini, fin, f24())) + ' · ' + U.esc(s.nombre) +
      (op.organizador ? ' · ' + U.esc(r.organizadorNombre) : '') + (cancelada && r.motivoCancelacion ? ' · «' + U.esc(r.motivoCancelacion) + '»' : '') + '</small></button>' +
      '<div class="fr-acciones">' +
      (cancelada ? '<span class="etiqueta">Cancelada</span>' : '') +
      (editable ? '<button class="btn-icono" data-accion="editar" data-tip="Editar"><span class="ms">edit</span></button>' : '') +
      '<button class="btn-icono" data-accion="copiar" data-tip="Copiar y pegar en otro horario"><span class="ms">content_copy</span></button>' +
      (cancelable ? '<button class="btn-icono" data-accion="cancelar" data-tip="Cancelar"><span class="ms">delete</span></button>' : '') +
      '</div></div>';
  }

  function conectarFilas(cont, porId, alCambiar) {
    U.$$('.fila-reserva [data-accion]', cont).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var r = porId[b.closest('.fila-reserva').dataset.id];
        if (!r) return;
        var a = b.dataset.accion;
        if (r.estado === 'confirmada') App.estado.cache[r.id] = r;
        if (a === 'ver') {
          if (r.estado === 'confirmada') {
            App.irA(new Date(r.inicio), 'dia');
            setTimeout(function () {
              var el = document.querySelector('.evento[data-id="' + r.id + '"]');
              if (el) { el.scrollIntoView({ block: 'center' }); App.abrirPopover(r.id, el); }
            }, 500);
          }
        }
        if (a === 'editar') Editor.abrir({ reserva: r });
        if (a === 'copiar') App.copiar(r);
        if (a === 'cancelar') App.cancelarReserva(r).then(function (ok) { if (ok && alCambiar) alCambiar(); });
      });
    });
  }

  // ======================================================================
  // Mi panel
  // ======================================================================
  function miPanel(cont) {
    cont.innerHTML = cargandoHtml();
    var yo = App.estado.usuario;
    var hoy = U.inicioDia(new Date());
    App.cargando(true);
    App.api().listar(U.sumarDias(hoy, -60), U.sumarDias(hoy, 61), { soloMias: true, incluirCanceladas: true }).then(function (lista) {
      App.cargando(false);
      if (App.estado.pagina !== 'panel') return;
      var ahora = new Date();
      var porId = {};
      lista.forEach(function (r) { porId[r.id] = r; });
      var dur = function (r) { return (new Date(r.fin) - new Date(r.inicio)) / 3600000; };
      var conf = lista.filter(function (r) { return r.estado === 'confirmada'; });
      var proximas = conf.filter(function (r) { return new Date(r.fin) > ahora; }).sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); });
      var pasadas = conf.filter(function (r) { return new Date(r.fin) <= ahora; }).sort(function (a, b) { return new Date(b.inicio) - new Date(a.inicio); });
      var canceladas = lista.filter(function (r) { return r.estado !== 'confirmada'; }).sort(function (a, b) { return new Date(b.inicio) - new Date(a.inicio); });
      var mesIni = U.inicioMes(hoy), mesFin = U.sumarMeses(hoy, 1);
      var delMes = conf.filter(function (r) { return new Date(r.inicio) >= mesIni && new Date(r.inicio) < mesFin; });
      var horasMes = delMes.reduce(function (s, r) { return s + dur(r); }, 0);
      var semana7 = proximas.filter(function (r) { return new Date(r.inicio) < U.sumarDias(ahora, 7); }).length;
      var deHoy = proximas.filter(function (r) { return U.mismoDia(new Date(r.inicio), ahora); });
      var conteo = {};
      conf.forEach(function (r) { conteo[r.salaId] = (conteo[r.salaId] || 0) + 1; });
      var favorita = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; })[0];
      var salaFav = favorita ? App.salaPorId(favorita) : null;

      var hora = ahora.getHours();
      var saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
      var nombre = String(yo.nombre).split(' ')[0];
      var html = '<div class="pagina">' +
        '<header class="pagina-cab"><div><h1 class="saludo">' + saludo + ', ' + U.esc(nombre) + '</h1>' +
        '<p>' + (deHoy.length ? 'Hoy tienes ' + deHoy.length + (deHoy.length === 1 ? ' reunión.' : ' reuniones.') : 'No tienes más reuniones hoy.') + '</p></div>' +
        '<div class="cab-acciones">' + (App.esAdmin() ? '<button class="btn btn-borde" data-ir="control"><span class="ms">admin_panel_settings</span>Panel de control</button>' : '') +
        '<button class="btn btn-tonal" data-ir="asistente"><span class="ms ms-relleno">auto_awesome</span>Pedir al asistente</button>' +
        '<button class="btn btn-relleno" data-ir="crear"><span class="ms">add</span>Reservar una sala</button></div></header>' +
        Epocas.htmlSaludo();

      // Rótulo de la próxima reunión
      var sig = proximas[0];
      if (sig) {
        var s = App.salaPorId(sig.salaId) || { nombre: '', color: '#039be5', id: '', ubicacion: '' };
        var ini = new Date(sig.inicio);
        var faltan = ini - ahora;
        var cuando = faltan <= 0 ? 'En curso ahora' : faltan < 3600000 ? 'Empieza en ' + Math.max(1, Math.round(faltan / 60000)) + ' min' :
          faltan < 86400000 ? 'Empieza en ' + Math.round(faltan / 3600000) + ' h' : U.capitalizar(U.relativa(ini));
        var partesHora = U.horaCompacta(ini, f24()).match(/^([\d:]+)\s*(.*)$/) || ['', U.horaCompacta(ini, f24()), ''];
        html += '<section class="rotulo" aria-label="Tu próxima reunión"><div class="rotulo-texto">' +
          '<span class="rotulo-etiqueta"><span class="ms">event_upcoming</span>Tu próxima reunión</span>' +
          '<span class="rotulo-cuando">' + U.esc(cuando) + '</span>' +
          '<div class="rotulo-hora">' + U.esc(partesHora[1]) + '<small>' + U.esc(partesHora[2]) + '</small></div>' +
          '<div class="rotulo-titulo">' + U.esc(sig.titulo) + '</div>' +
          '<div class="rotulo-detalle">' + U.esc(U.capitalizar(U.fechaLarga(ini))) + ', ' + U.esc(U.rangoHoras(ini, new Date(sig.fin), f24())) + '</div>' +
          '<div class="fila-reserva sin-borde rotulo-acciones" data-id="' + U.esc(sig.id) + '">' +
          '<button class="btn btn-claro" data-accion="ver"><span class="ms">calendar_month</span>Ver en el calendario</button>' +
          (App.puedeMover(sig) ? '<button class="btn btn-borde-claro" data-accion="editar"><span class="ms">edit</span>Editar</button>' : '') +
          '<button class="btn btn-borde-claro" data-accion="cancelar">Cancelar</button></div></div>' +
          '<div class="rotulo-foto">' + App.fotoSala(s, 'rotulo-img') +
          '<div class="placa-puerta" style="--c:' + s.color + '"><b>' + U.esc(s.nombre) + '</b><span>' +
          U.esc((s.ubicacion ? s.ubicacion + ', ' : '') + sig.asistentes + ' de ' + s.capacidad + ' personas') + '</span></div></div></section>';
      } else {
        html += '<section class="rotulo vacio-rotulo"><div class="rotulo-texto">' +
          '<span class="rotulo-etiqueta"><span class="ms">event_available</span>Tu agenda está libre</span>' +
          '<div class="rotulo-titulo">No tienes reuniones próximas</div>' +
          '<div class="rotulo-detalle">Reserva una sala en segundos o pídeselo al asistente.</div>' +
          '<div class="rotulo-acciones"><button class="btn btn-claro" data-ir="crear"><span class="ms">add</span>Reservar una sala</button></div></div></section>';
      }

      html += '<section class="kpis">' +
        kpi('event_upcoming', semana7, 'Reuniones en los próximos 7 días') +
        kpi('calendar_month', delMes.length, 'Reuniones este mes') +
        kpi('schedule', num(Math.round(horasMes * 10) / 10) + ' h', 'Horas reservadas este mes') +
        kpi('favorite', salaFav ? U.esc(salaFav.nombre) : '—', 'La sala que más usas', salaFav ? conteo[favorita] + ' reservas' : '') +
        '</section>';
      // Tu semana (barras por día)
      var lunes = U.inicioSemana(hoy);
      var dias = [];
      for (var i = 0; i < 5; i++) {
        var d = U.sumarDias(lunes, i);
        var hs = conf.filter(function (r) { return U.mismoDia(new Date(r.inicio), d); }).reduce(function (sum, r) { return sum + dur(r); }, 0);
        var n = conf.filter(function (r) { return U.mismoDia(new Date(r.inicio), d); }).length;
        dias.push({ d: d, hs: hs, n: n });
      }
      var maxHs = Math.max.apply(null, dias.map(function (x) { return x.hs; }).concat([1]));
      html += '<section class="tarjeta-panel"><h2>Tu semana</h2><p class="tenue">Horas en reuniones por día</p><div class="barras-v">' +
        dias.map(function (x) {
          return '<div class="bv' + (U.mismoDia(x.d, hoy) ? ' hoy' : '') + '" data-tip="' + U.esc(U.capitalizar(U.fechaLarga(x.d)) + ': ' + x.n + ' reuniones, ' + num(Math.round(x.hs * 10) / 10) + ' h') + '">' +
            '<span class="bv-valor">' + (x.hs ? num(Math.round(x.hs * 10) / 10) + ' h' : '') + '</span>' +
            '<span class="bv-barra" style="height:' + Math.max(x.hs / maxHs * 100, x.hs ? 4 : 0) + '%"></span>' +
            '<span class="bv-etq">' + U.DIAS_CORTOS[x.d.getDay()] + '</span></div>';
        }).join('') + '</div></section>';

      // Próximas
      html += '<section class="tarjeta-panel"><div class="tp-cab"><h2>Próximas reuniones</h2><span class="tenue">' + proximas.length + ' en los próximos 60 días</span></div>';
      if (!proximas.length) html += '<p class="tenue">Nada por ahora.</p>';
      var ultimoDia = '';
      proximas.slice(0, 25).forEach(function (r) {
        var k = U.claveDia(new Date(r.inicio));
        if (k !== ultimoDia) { html += '<h3 class="grupo-dia">' + U.esc(U.capitalizar(U.relativa(new Date(r.inicio)))) + (/^el /.test(U.relativa(new Date(r.inicio))) ? '' : ' · ' + U.esc(U.fechaLarga(new Date(r.inicio)))) + '</h3>'; ultimoDia = k; }
        html += filaReserva(r, { sinFecha: true });
      });
      html += '</section>';

      // Historial
      var hist = est.historial === 'canceladas' ? canceladas : pasadas;
      html += '<section class="tarjeta-panel"><div class="tp-cab"><h2>Historial</h2><div class="segmentado">' +
        '<button data-hist="pasadas" aria-pressed="' + (est.historial !== 'canceladas') + '">Pasadas (' + pasadas.length + ')</button>' +
        '<button data-hist="canceladas" aria-pressed="' + (est.historial === 'canceladas') + '">Canceladas (' + canceladas.length + ')</button></div></div>' +
        (hist.length ? hist.slice(0, 20).map(function (r) { return filaReserva(r); }).join('') : '<p class="tenue">Sin registros en los últimos 60 días.</p>') +
        '</section></div>';

      cont.innerHTML = html;
      Epocas.conectarSaludo(cont);
      conectarFilas(cont, porId, function () { miPanel(cont); });
      U.$$('[data-ir]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.dataset.ir === 'crear') Editor.abrir({ fecha: new Date() });
          else if (b.dataset.ir === 'control') App.irPagina('control');
          else App.abrirAsistente();
        });
      });
      U.$$('[data-hist]', cont).forEach(function (b) {
        b.addEventListener('click', function () { est.historial = b.dataset.hist; miPanel(cont); });
      });
    }).catch(function (e) {
      App.cargando(false);
      cont.innerHTML = '<div class="pagina"><div class="vacio"><span class="ms">error</span><p>' + U.esc(e.message) + '</p></div></div>';
    });
  }

  // ======================================================================
  // Galería de salas
  // ======================================================================
  function galeria(cont) {
    var salas = App.estado.salas.filter(function (s) { return s.activa; });
    var texto = Interprete.normalizar(est.textoSalas);
    var filtradas = salas.filter(function (s) {
      if (est.capacidad && s.capacidad < est.capacidad) return false;
      if (!texto) return true;
      return Interprete.normalizar(s.nombre + ' ' + s.ubicacion + ' ' + s.equipamiento + ' ' + (s.descripcion || '')).indexOf(texto) !== -1;
    });
    App.reservasDeHoy().then(function (hoy) {
      if (App.estado.pagina !== 'salas') return;
      var ahora = new Date();
      var html = '<div class="pagina"><header class="pagina-cab"><div><h1>Salas</h1><p>' + salas.length + ' salas disponibles. Elige una para ver su agenda o reservarla.</p></div>' +
        (App.esAdmin() ? '<div class="cab-acciones"><button class="btn btn-tonal" data-admin-salas><span class="ms">settings</span>Administrar salas</button></div>' : '') + '</header>' +
        '<div class="filtros"><label class="buscar"><span class="ms">search</span><input id="buscar-sala" placeholder="Buscar por nombre, lugar o equipo (ej. proyector)" value="' + U.esc(est.textoSalas) + '"></label>' +
        '<div class="segmentado" aria-label="Capacidad mínima">' + [[0, 'Todas'], [4, '4+'], [8, '8+'], [12, '12+'], [30, '30+']].map(function (c) {
          return '<button data-cap="' + c[0] + '" aria-pressed="' + (est.capacidad === c[0]) + '">' + c[1] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="galeria">' + filtradas.map(function (s) {
          var e = App.estadoSala(s, hoy, ahora);
          var equipos = String(s.equipamiento || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
          return '<article class="tarjeta-sala" style="--c:' + s.color + '">' +
            '<div class="ts-foto">' + App.fotoSala(s, 'ts-img') +
            '<span class="ts-estado ' + (e.actual ? 'ocupada' : 'libre') + '"><span class="punto"></span>' + U.esc(U.capitalizar(e.texto)) + '</span></div>' +
            '<div class="ts-cuerpo"><h3><i></i>' + U.esc(s.nombre) + '</h3>' +
            '<p class="tenue">' + (s.ubicacion ? '<span class="ms">location_on</span>' + U.esc(s.ubicacion) : '') + '</p>' +
            '<div class="ts-datos"><span><span class="ms">group</span>' + s.capacidad + ' personas</span><span><span class="ms">schedule</span>' + s.apertura + '–' + s.cierre + '</span></div>' +
            (equipos.length ? '<div class="chips">' + equipos.map(function (x) { return '<span class="chip">' + U.esc(x) + '</span>'; }).join('') + '</div>' : '') +
            (s.descripcion ? '<p class="ts-desc">' + U.esc(s.descripcion) + '</p>' : '') +
            '<div class="ts-acciones"><button class="btn btn-texto btn-pequeno" data-agenda="' + U.esc(s.id) + '">Ver agenda de hoy</button>' +
            '<button class="btn btn-relleno btn-pequeno" data-reservar="' + U.esc(s.id) + '"><span class="ms">add</span>Reservar</button></div></div></article>';
        }).join('') + '</div>' +
        (filtradas.length ? '' : '<div class="vacio"><span class="ms">search_off</span><p>Ninguna sala coincide con la búsqueda.</p></div>') + '</div>';
      cont.innerHTML = html;
      var buscar = U.$('#buscar-sala', cont);
      buscar.addEventListener('input', function () {
        est.textoSalas = buscar.value;
        var pos = buscar.selectionStart;
        galeria(cont);
        setTimeout(function () { var b = U.$('#buscar-sala'); if (b) { b.focus(); b.setSelectionRange(pos, pos); } }, 0);
      });
      U.$$('[data-cap]', cont).forEach(function (b) { b.addEventListener('click', function () { est.capacidad = Number(b.dataset.cap); galeria(cont); }); });
      U.$$('[data-reservar]', cont).forEach(function (b) { b.addEventListener('click', function () { Editor.abrir({ fecha: new Date(), salaId: b.dataset.reservar }); }); });
      U.$$('[data-agenda]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          App.estado.ocultas = App.estado.salas.map(function (s) { return s.id; }).filter(function (id) { return id !== b.dataset.agenda; });
          App.estado.porSalas = true;
          App.irA(new Date(), 'dia');
          App.aviso('Mostrando solo esta sala. Activa las demás en la barra lateral.');
          setTimeout(function () { U.$$('[data-sala]').forEach(function (cb) { cb.checked = App.estado.ocultas.indexOf(cb.dataset.sala) === -1; }); }, 50);
        });
      });
      var adm = U.$('[data-admin-salas]', cont);
      if (adm) adm.addEventListener('click', function () { est.pestana = 'salas'; App.irPagina('control'); });
    });
  }

  // ======================================================================
  // Panel de control
  // ======================================================================
  function rango() {
    var hoy = U.inicioDia(new Date());
    switch (est.periodo) {
      case 'semana': var l = U.inicioSemana(hoy); return [l, U.sumarDias(l, 7)];
      case 'mes': return [U.inicioMes(hoy), U.sumarMeses(hoy, 1)];
      case 'mes_pasado': return [U.sumarMeses(hoy, -1), U.inicioMes(hoy)];
      case '30': return [U.sumarDias(hoy, -29), U.sumarDias(hoy, 1)];
      case '90': return [U.sumarDias(hoy, -89), U.sumarDias(hoy, 1)];
      case 'anio': return [new Date(hoy.getFullYear(), 0, 1), new Date(hoy.getFullYear() + 1, 0, 1)];
      default:
        var a = est.desde ? U.desdeClave(est.desde) : U.inicioMes(hoy);
        var b = est.hasta ? U.sumarDias(U.desdeClave(est.hasta), 1) : U.sumarMeses(hoy, 1);
        return b > a ? [a, b] : [a, U.sumarDias(a, 1)];
    }
  }

  function control(cont) {
    if (!App.esAdmin()) { cont.innerHTML = '<div class="pagina"><div class="vacio"><span class="ms">lock</span><p>Solo los administradores pueden ver el panel de control.</p></div></div>'; return; }
    var pestanas = [['reportes', 'monitoring', 'Reportes'], ['reservas', 'list_alt', 'Reservas'], ['salas', 'meeting_room', 'Salas'], ['usuarios', 'group', 'Usuarios']];
    cont.innerHTML = '<div class="pagina"><header class="pagina-cab"><div><h1>Panel de control</h1><p>Reportes de uso y administración de reservas, salas y usuarios.</p></div></header>' +
      '<nav class="pestanas" role="tablist">' + pestanas.map(function (p) {
        return '<button role="tab" data-pestana="' + p[0] + '" aria-selected="' + (est.pestana === p[0]) + '"><span class="ms">' + p[1] + '</span>' + p[2] + '</button>';
      }).join('') + '</nav><div id="pestana"></div></div>';
    U.$$('[data-pestana]', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        est.pestana = b.dataset.pestana;
        U.$$('[data-pestana]', cont).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pintarPestana();
      });
    });
    pintarPestana();
  }

  function pintarPestana() {
    var cont = U.$('#pestana');
    if (!cont) return;
    if (est.pestana === 'salas') return pestanaSalas(cont);
    if (est.pestana === 'usuarios') return pestanaUsuarios(cont);
    cont.innerHTML = filtrosHtml() + '<div id="pestana-datos">' + cargandoHtml() + '</div>';
    conectarFiltros(cont);
    cargarReporte().then(function (datos) {
      var destino = U.$('#pestana-datos');
      if (!destino) return;
      if (est.pestana === 'reportes') pintarReportes(destino, datos);
      else pintarReservas(destino, datos);
    }).catch(function (e) {
      var destino = U.$('#pestana-datos');
      if (destino) destino.innerHTML = '<div class="vacio"><span class="ms">error</span><p>' + U.esc(e.message) + '</p></div>';
    });
  }

  function cargarReporte() {
    var r = rango();
    var clave = r[0].getTime() + '-' + r[1].getTime();
    if (est.datos && est.claveDatos === clave) return Promise.resolve(est.datos);
    App.cargando(true);
    return App.api().reporte(r[0], r[1]).then(function (d) {
      App.cargando(false);
      est.datos = d;
      est.claveDatos = clave;
      return d;
    }, function (e) { App.cargando(false); throw e; });
  }

  function filtrosHtml() {
    var r = rango();
    var periodos = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['anio', 'Este año']];
    return '<div class="filtros">' +
      '<div class="segmentado envolver">' + periodos.map(function (p) {
        return '<button data-periodo="' + p[0] + '" aria-pressed="' + (est.periodo === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="campo-mini">Desde<input type="date" id="f-desde" value="' + U.claveDia(r[0]) + '"></label>' +
      '<label class="campo-mini">Hasta<input type="date" id="f-hasta" value="' + U.claveDia(U.sumarDias(r[1], -1)) + '"></label>' +
      '<label class="campo-mini">Sala<select id="f-sala"><option value="">Todas las salas</option>' + App.estado.salas.map(function (s) {
        return '<option value="' + U.esc(s.id) + '"' + (est.salaId === s.id ? ' selected' : '') + '>' + U.esc(s.nombre) + '</option>';
      }).join('') + '</select></label>' +
      '<span class="espaciador"></span>' +
      '<button class="btn btn-borde btn-pequeno" id="f-csv" data-tip="Descarga un archivo que se abre en Excel o Google Sheets"><span class="ms">download</span>Exportar CSV</button>' +
      '<button class="btn btn-borde btn-pequeno" id="f-imprimir" data-tip="Imprimir o guardar como PDF"><span class="ms">print</span>Imprimir</button>' +
      '</div>';
  }

  function conectarFiltros(cont) {
    U.$$('[data-periodo]', cont).forEach(function (b) {
      b.addEventListener('click', function () { est.periodo = b.dataset.periodo; est.pagina = 1; pintarPestana(); });
    });
    ['f-desde', 'f-hasta'].forEach(function (id) {
      U.$('#' + id, cont).addEventListener('change', function () {
        est.periodo = 'personalizado';
        est.desde = U.$('#f-desde').value;
        est.hasta = U.$('#f-hasta').value;
        est.pagina = 1;
        pintarPestana();
      });
    });
    U.$('#f-sala', cont).addEventListener('change', function (e) { est.salaId = e.target.value; est.pagina = 1; pintarPestana(); });
    U.$('#f-csv', cont).addEventListener('click', function () {
      if (!est.datos) return;
      var lista = filtrarReservas(est.datos.reservas);
      var r = rango();
      App.descargar('reservas-' + U.claveDia(r[0]) + '-a-' + U.claveDia(U.sumarDias(r[1], -1)) + '.csv', Reportes.csv(lista, App.estado.salas), 'text/csv;charset=utf-8');
      App.aviso('Se descargó el CSV con ' + lista.length + ' reservas');
    });
    U.$('#f-imprimir', cont).addEventListener('click', function () { window.print(); });
  }

  function filtrarReservas(lista) {
    var texto = Interprete.normalizar(est.busqueda);
    return lista.filter(function (r) {
      if (est.salaId && r.salaId !== est.salaId) return false;
      if (est.pestana === 'reservas') {
        if (est.filtroEstado !== 'todas' && r.estado !== est.filtroEstado) return false;
        if (texto) {
          var s = App.salaPorId(r.salaId);
          var todo = Interprete.normalizar(r.titulo + ' ' + r.organizadorNombre + ' ' + r.organizadorEmail + ' ' + (s ? s.nombre : ''));
          if (todo.indexOf(texto) === -1) return false;
        }
      }
      return true;
    });
  }

  // ------------------------------------------------------------- reportes
  function pintarReportes(cont, datos) {
    var r = rango();
    var st = Reportes.calcular({
      reservas: datos.reservas, salas: App.estado.salas, desde: r[0], hasta: r[1],
      finesDeSemana: !!App.estado.config.PERMITIR_FINES_DE_SEMANA, salaId: est.salaId,
    });
    var k = st.kpis;
    var html = '<section class="kpis seis">' +
      kpi('event_available', k.confirmadas, 'Reuniones', k.series ? k.series + ' de series que se repiten' : '') +
      kpi('schedule', num(k.horas) + ' h', 'Horas reservadas', k.confirmadas ? 'Promedio ' + U.duracionTexto(k.duracionPromedio) : '') +
      kpi('donut_large', pct(k.ocupacion), 'Ocupación', 'del horario abierto de las salas') +
      kpi('event_busy', k.canceladas, 'Cancelaciones', pct(k.tasaCancelacion) + ' del total') +
      kpi('group', k.organizadores, 'Personas que reservaron') +
      kpi('chair', pct(k.aprovechamiento), 'Uso de la capacidad', 'asistentes ÷ capacidad de la sala') +
      '</section>';

    if (!k.confirmadas && !k.canceladas) {
      cont.innerHTML = html + '<div class="vacio"><span class="ms">insights</span><p>No hay reservas en este periodo.</p></div>';
      return;
    }

    // Horas por sala
    var maxHoras = Math.max.apply(null, st.porSala.map(function (x) { return x.horas; }).concat([1]));
    html += '<div class="rejilla-2"><section class="tarjeta-panel"><h2>Horas reservadas por sala</h2><p class="tenue">Y su ocupación en el periodo</p><div class="barras-h">' +
      st.porSala.map(function (x) {
        return '<div class="bh" data-tip="' + U.esc(x.sala.nombre + ': ' + x.reservas + ' reuniones, ' + num(x.horas) + ' h, ocupación ' + pct(x.ocupacion) +
          ', ' + num(x.asistentesPromedio) + ' personas en promedio') + '"><span class="bh-etq"><i style="background:' + x.sala.color + '"></i>' + U.esc(x.sala.nombre) + '</span>' +
          '<span class="bh-pista"><span class="bh-barra" style="width:' + (x.horas / maxHoras * 100) + '%"></span></span>' +
          '<span class="bh-valor">' + num(x.horas) + ' h <small>' + pct(x.ocupacion) + '</small></span></div>';
      }).join('') + '</div></section>';

    // Por día de la semana
    var dias = st.porDia.filter(function (d) { return App.estado.config.PERMITIR_FINES_DE_SEMANA || d.dia <= 5; });
    var maxDia = Math.max.apply(null, dias.map(function (d) { return d.reservas; }).concat([1]));
    var nombres = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    html += '<section class="tarjeta-panel"><h2>Reuniones por día de la semana</h2><p class="tenue">Total del periodo</p><div class="barras-v alto">' +
      dias.map(function (d) {
        return '<div class="bv" data-tip="' + U.esc(nombres[d.dia] + ': ' + d.reservas + ' reuniones, ' + num(d.horas) + ' h') + '"><span class="bv-valor">' + d.reservas + '</span>' +
          '<span class="bv-barra" style="height:' + Math.max(d.reservas / maxDia * 100, d.reservas ? 3 : 0) + '%"></span><span class="bv-etq">' + nombres[d.dia] + '</span></div>';
      }).join('') + '</div></section></div>';

    // Mapa de calor
    var salasRango = App.estado.salas.filter(function (s) { return !est.salaId || s.id === est.salaId; });
    var hMin = Math.floor(Math.min.apply(null, salasRango.map(function (s) { return Reglas.aMinutos(s.apertura); })) / 60);
    var hMax = Math.ceil(Math.max.apply(null, salasRango.map(function (s) { return Reglas.aMinutos(s.cierre); })) / 60);
    var maxCalor = 0;
    dias.forEach(function (d) { for (var h = hMin; h < hMax; h++) maxCalor = Math.max(maxCalor, st.calor[d.dia - 1][h]); });
    var nombresLargos = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    html += '<section class="tarjeta-panel"><h2>¿A qué horas se usan más las salas?</h2><p class="tenue">Horas reservadas por franja, sumando todas las semanas del periodo</p>' +
      '<div class="calor-scroll"><div class="calor" style="--cols:' + (hMax - hMin) + '"><span></span>';
    for (var h = hMin; h < hMax; h++) html += '<span class="calor-h">' + U.etiquetaHora(h, f24()).replace(' a. m.', 'a').replace(' p. m.', 'p') + '</span>';
    dias.forEach(function (d) {
      html += '<span class="calor-d">' + nombres[d.dia] + '</span>';
      for (var h2 = hMin; h2 < hMax; h2++) {
        var v = st.calor[d.dia - 1][h2];
        var nivel = v && maxCalor ? Math.max(1, Math.ceil(v / maxCalor * 5)) : 0;
        html += '<span class="calor-c n' + nivel + '" data-tip="' + U.esc(nombresLargos[d.dia] + ' de ' + U.dd(h2) + ':00 a ' + U.dd(h2 + 1) + ':00 · ' + num(Math.round(v * 10) / 10) + ' h reservadas') + '"></span>';
      }
    });
    html += '</div></div><div class="calor-leyenda">Menos <span class="calor-c n0"></span><span class="calor-c n1"></span><span class="calor-c n2"></span>' +
      '<span class="calor-c n3"></span><span class="calor-c n4"></span><span class="calor-c n5"></span> Más</div></section>';

    // Organizadores
    html += '<section class="tarjeta-panel"><h2>Quién reserva más</h2><div class="tabla-scroll"><table class="tabla"><thead><tr><th>Persona</th><th class="num">Reuniones</th>' +
      '<th class="num">Horas</th><th class="num">Canceladas</th></tr></thead><tbody>' +
      st.organizadores.slice(0, 10).map(function (o) {
        return '<tr><td><span class="persona"><span class="avatar mini">' + U.esc(U.iniciales(o.nombre)) + '</span><span><b>' + U.esc(o.nombre) + '</b><small>' + U.esc(o.email) + '</small></span></span></td>' +
          '<td class="num">' + o.reservas + '</td><td class="num">' + num(o.horas) + '</td><td class="num">' + o.canceladas + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    cont.innerHTML = html;
  }

  // ------------------------------------------------------------- reservas
  function pintarReservas(cont, datos) {
    var lista = filtrarReservas(datos.reservas).sort(function (a, b) {
      return est.orden === 'asc' ? new Date(a.inicio) - new Date(b.inicio) : new Date(b.inicio) - new Date(a.inicio);
    });
    var porPagina = 25;
    var paginas = Math.max(1, Math.ceil(lista.length / porPagina));
    est.pagina = Math.min(est.pagina, paginas);
    var visibles = lista.slice((est.pagina - 1) * porPagina, est.pagina * porPagina);
    var porId = {};
    datos.reservas.forEach(function (r) { porId[r.id] = r; });
    var ahora = new Date();

    var html = '<div class="barra-tabla"><label class="buscar"><span class="ms">search</span><input id="b-reservas" placeholder="Buscar por reunión, persona o sala" value="' + U.esc(est.busqueda) + '"></label>' +
      '<div class="segmentado">' + [['todas', 'Todas'], ['confirmada', 'Confirmadas'], ['cancelada', 'Canceladas']].map(function (x) {
        return '<button data-estado="' + x[0] + '" aria-pressed="' + (est.filtroEstado === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div><span class="tenue">' + lista.length + ' reservas</span></div>' +
      '<div class="tabla-scroll"><table class="tabla tabla-reservas"><thead><tr>' +
      '<th><button class="orden" id="orden">Fecha <span class="ms">' + (est.orden === 'asc' ? 'arrow_upward' : 'arrow_downward') + '</span></button></th>' +
      '<th>Horario</th><th>Reunión</th><th>Sala</th><th>Organizador</th><th class="num">Personas</th><th>Estado</th><th></th></tr></thead><tbody>' +
      visibles.map(function (r) {
        var s = App.salaPorId(r.salaId) || { nombre: r.salaId, color: '#999' };
        var ini = new Date(r.inicio), fin = new Date(r.fin);
        var activa = r.estado === 'confirmada';
        var editable = activa && fin > ahora;
        var estadoTxt = !activa ? '<span class="etiqueta">Cancelada</span>' : fin <= ahora ? '<span class="etiqueta">Terminada</span>' :
          ini <= ahora ? '<span class="etiqueta aviso">En curso</span>' : '<span class="etiqueta ok">Confirmada</span>';
        return '<tr class="fila-reserva-tabla' + (activa ? '' : ' cancelada') + '" data-id="' + U.esc(r.id) + '"><td class="nowrap">' + U.esc(U.capitalizar(U.fechaMedia(ini))) + '</td>' +
          '<td class="nowrap">' + U.esc(U.rangoHoras(ini, fin, f24())) + '</td>' +
          '<td>' + (r.privada ? '<span class="ms icono-serie" data-tip="Privada: los demás solo ven «Reservada»">lock</span>' : '') + (r.serieId ? '<span class="ms icono-serie" data-tip="' + U.esc(r.recurrencia || 'Se repite') + '">repeat</span>' : '') + U.esc(r.titulo) +
          (r.motivoCancelacion ? '<small class="bloque tenue">«' + U.esc(r.motivoCancelacion) + '»</small>' : '') + '</td>' +
          '<td class="nowrap"><i class="punto-sala" style="background:' + s.color + '"></i>' + U.esc(s.nombre) + '</td>' +
          '<td>' + U.esc(r.organizadorNombre) + '<small class="bloque tenue">' + U.esc(r.organizadorEmail) + '</small></td>' +
          '<td class="num">' + r.asistentes + '</td><td>' + estadoTxt + '</td>' +
          '<td class="acciones nowrap">' + (activa ? '<button class="btn-icono" data-t="ver" data-tip="Ver en el calendario"><span class="ms">calendar_month</span></button>' : '') +
          (editable ? '<button class="btn-icono" data-t="editar" data-tip="Editar (como administrador)"><span class="ms">edit</span></button>' +
            '<button class="btn-icono" data-t="cancelar" data-tip="Cancelar"><span class="ms">delete</span></button>' : '') +
          '<button class="btn-icono" data-t="copiar" data-tip="Copiar y pegar en otro horario"><span class="ms">content_copy</span></button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (lista.length ? '' : '<div class="vacio"><span class="ms">search_off</span><p>No hay reservas con estos filtros.</p></div>') +
      (paginas > 1 ? '<div class="paginacion"><button class="btn btn-borde btn-pequeno" data-pag="-1"' + (est.pagina === 1 ? ' disabled' : '') + '>Anterior</button>' +
        '<span class="tenue">Página ' + est.pagina + ' de ' + paginas + '</span><button class="btn btn-borde btn-pequeno" data-pag="1"' + (est.pagina === paginas ? ' disabled' : '') + '>Siguiente</button></div>' : '');
    cont.innerHTML = html;

    var buscar = U.$('#b-reservas', cont);
    buscar.addEventListener('input', function () {
      est.busqueda = buscar.value;
      est.pagina = 1;
      var pos = buscar.selectionStart;
      pintarReservas(cont, datos);
      var b = U.$('#b-reservas');
      b.focus();
      b.setSelectionRange(pos, pos);
    });
    U.$$('[data-estado]', cont).forEach(function (b) { b.addEventListener('click', function () { est.filtroEstado = b.dataset.estado; est.pagina = 1; pintarReservas(cont, datos); }); });
    U.$('#orden', cont).addEventListener('click', function () { est.orden = est.orden === 'asc' ? 'desc' : 'asc'; pintarReservas(cont, datos); });
    U.$$('[data-pag]', cont).forEach(function (b) { b.addEventListener('click', function () { est.pagina += Number(b.dataset.pag); pintarReservas(cont, datos); }); });
    U.$$('[data-t]', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        var r = porId[b.closest('tr').dataset.id];
        var a = b.dataset.t;
        if (r.estado === 'confirmada') App.estado.cache[r.id] = Object.assign({}, r, { puedeEditar: true });
        if (a === 'ver') {
          App.irA(new Date(r.inicio), 'dia');
          setTimeout(function () {
            var el = document.querySelector('.evento[data-id="' + r.id + '"]');
            if (el) { el.scrollIntoView({ block: 'center' }); App.abrirPopover(r.id, el); }
          }, 500);
        }
        if (a === 'editar') Editor.abrir({ reserva: App.estado.cache[r.id] });
        if (a === 'copiar') App.copiar(r);
        if (a === 'cancelar') App.cancelarReserva(App.estado.cache[r.id]).then(function (ok) { if (ok) { est.datos = null; pintarPestana(); } });
      });
    });
  }

  // ---------------------------------------------------------------- salas
  function pestanaSalas(cont) {
    var salas = App.estado.salas;
    cont.innerHTML = '<div class="barra-tabla"><p class="tenue">Las salas también se pueden editar directamente en la hoja <b>Salas</b> de Google Sheets.</p>' +
      '<span class="espaciador"></span><button class="btn btn-relleno" id="nueva-sala"><span class="ms">add</span>Agregar sala</button></div>' +
      '<div class="galeria">' + salas.map(function (s) {
        return '<article class="tarjeta-sala' + (s.activa ? '' : ' inactiva') + '" style="--c:' + s.color + '"><div class="ts-foto">' + App.fotoSala(s, 'ts-img') +
          (s.activa ? '' : '<span class="ts-estado ocupada">No disponible</span>') + (s.foto ? '' : '<span class="ts-sinfoto">Sin foto · se muestra una ilustración</span>') + '</div>' +
          '<div class="ts-cuerpo"><h3><i></i>' + U.esc(s.nombre) + '</h3><p class="tenue">' + U.esc(s.ubicacion || '') + '</p>' +
          '<div class="ts-datos"><span><span class="ms">group</span>' + s.capacidad + '</span><span><span class="ms">schedule</span>' + s.apertura + '–' + s.cierre + '</span></div>' +
          '<div class="ts-acciones"><button class="btn btn-tonal btn-pequeno" data-editar-sala="' + U.esc(s.id) + '"><span class="ms">edit</span>Editar</button></div></div></article>';
      }).join('') + '</div>';
    U.$('#nueva-sala', cont).addEventListener('click', function () { abrirSala(null); });
    U.$$('[data-editar-sala]', cont).forEach(function (b) {
      b.addEventListener('click', function () { abrirSala(App.salaPorId(b.dataset.editarSala)); });
    });
  }

  var salaActual = null;
  function abrirSala(s) {
    salaActual = s;
    var fm = U.$('#form-sala');
    U.$('#sala-titulo').textContent = s ? 'Editar sala' : 'Nueva sala';
    fm.nombre.value = s ? s.nombre : '';
    fm.ubicacion.value = s ? s.ubicacion : '';
    fm.capacidad.value = s ? s.capacidad : 8;
    fm.apertura.value = s ? s.apertura : '07:00';
    fm.cierre.value = s ? s.cierre : '19:00';
    fm.equipamiento.value = s ? s.equipamiento : '';
    fm.descripcion.value = s ? s.descripcion || '' : '';
    fm.activa.checked = s ? s.activa : true;
    fm.foto.value = s && s.foto && !/^data:/.test(s.foto) ? s.foto : '';
    fm.dataset.foto = s ? s.foto || '' : '';
    var color = s ? s.color : COLORES[(App.estado.salas.length * 3) % COLORES.length];
    U.$('#colores').innerHTML = COLORES.map(function (c) {
      return '<label class="color" style="--c:' + c + '"><input type="radio" name="color" value="' + c + '"' + (c === color ? ' checked' : '') + ' aria-label="' + c + '"><span></span></label>';
    }).join('');
    if (COLORES.indexOf(color) === -1) U.$('#colores').insertAdjacentHTML('beforeend', '<label class="color" style="--c:' + color + '"><input type="radio" name="color" value="' + color + '" checked><span></span></label>');
    U.$('#sala-errores').hidden = true;
    vistaFoto();
    U.$('#dlg-sala').showModal();
  }

  function vistaFoto() {
    var fm = U.$('#form-sala');
    var url = fm.dataset.foto;
    var img = U.$('#foto-vista');
    var zona = U.$('#foto-zona');
    var color = (U.$('input[name="color"]:checked') || { value: '#039be5' }).value;
    img.src = url || Ilustraciones.sala({ id: 'nueva', color: color, capacidad: Number(fm.capacidad.value) || 8 });
    zona.classList.toggle('con-foto', !!url);
    U.$('#foto-quitar').hidden = !url;
  }

  function reducirImagen(archivo, maximo) {
    return new Promise(function (ok, mal) {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return mal(new Error('Usa una imagen JPG, PNG o WebP.'));
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, maximo / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', 0.85);
        ok({ tipo: 'image/jpeg', base64: dataUrl.split(',')[1], dataUrl: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  function subirArchivo(archivo) {
    var carga = U.$('#foto-carga');
    carga.hidden = false;
    reducirImagen(archivo, App.demo ? 900 : 1600).then(function (img) {
      return App.api().subirFoto({ tipo: img.tipo, base64: img.base64, salaId: salaActual ? salaActual.id : '' });
    }).then(function (r) {
      carga.hidden = true;
      U.$('#form-sala').dataset.foto = r.url;
      U.$('#form-sala').foto.value = /^data:/.test(r.url) ? '' : r.url;
      vistaFoto();
    }).catch(function (e) {
      carga.hidden = true;
      var err = U.$('#sala-errores');
      err.hidden = false;
      err.textContent = e.message;
    });
  }

  function conectarDialogoSala() {
    var dlg = U.$('#dlg-sala'), fm = U.$('#form-sala'), zona = U.$('#foto-zona'), archivo = U.$('#foto-archivo');
    U.$$('[data-cerrar]', fm).forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    zona.addEventListener('click', function () { archivo.click(); });
    zona.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); archivo.click(); } });
    archivo.addEventListener('change', function () { if (archivo.files[0]) subirArchivo(archivo.files[0]); archivo.value = ''; });
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('arrastre'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('arrastre'); });
    zona.addEventListener('drop', function (e) {
      e.preventDefault();
      zona.classList.remove('arrastre');
      if (e.dataTransfer.files[0]) subirArchivo(e.dataTransfer.files[0]);
    });
    fm.foto.addEventListener('change', function () { fm.dataset.foto = fm.foto.value.trim(); vistaFoto(); });
    U.$('#foto-quitar').addEventListener('click', function () { fm.dataset.foto = ''; fm.foto.value = ''; vistaFoto(); });
    U.$('#colores').addEventListener('change', vistaFoto);
    fm.capacidad.addEventListener('input', vistaFoto);
    fm.addEventListener('submit', function (e) {
      e.preventDefault();
      var color = U.$('input[name="color"]:checked', fm);
      var datos = {
        id: salaActual ? salaActual.id : undefined,
        nombre: fm.nombre.value, ubicacion: fm.ubicacion.value, capacidad: Number(fm.capacidad.value),
        apertura: fm.apertura.value, cierre: fm.cierre.value, equipamiento: fm.equipamiento.value, descripcion: fm.descripcion.value,
        color: color ? color.value : '#039be5', activa: fm.activa.checked, foto: fm.dataset.foto || '',
      };
      var boton = U.$('#sala-guardar');
      boton.disabled = true;
      App.cargando(true);
      App.api().guardarSala(datos).then(function (s) {
        App.cargando(false);
        boton.disabled = false;
        dlg.close();
        App.aviso((salaActual ? 'Sala actualizada: ' : 'Sala creada: ') + s.nombre);
        return App.recargarSalas();
      }).then(function () {
        if (App.estado.pagina === 'control') pintarPestana(); else App.dibujar();
      }).catch(function (e2) {
        App.cargando(false);
        boton.disabled = false;
        var err = U.$('#sala-errores');
        err.hidden = false;
        err.textContent = e2.message;
      });
    });
  }

  // ------------------------------------------------------------- usuarios
  function pestanaUsuarios(cont) {
    cont.innerHTML = cargandoHtml();
    App.cargando(true);
    Promise.all([App.api().listarUsuarios(), App.api().presencia().catch(function () { return { presencia: [] }; })]).then(function (res) {
      App.cargando(false);
      if (est.pestana !== 'usuarios' || !U.$('#pestana')) return;
      est.usuarios = res[0];
      if (res[1] && res[1].presencia) est.presenciaInicial = res[1].presencia;
      pintarUsuarios(U.$('#pestana'));
    }).catch(function (e) {
      App.cargando(false);
      cont.innerHTML = '<div class="vacio"><span class="ms">error</span><p>' + U.esc(e.message) + '</p></div>';
    });
  }

  function pintarUsuarios(cont) {
    if (!cont || !est.usuarios) return;
    var presencia = Ayuda.presencia().length ? Ayuda.presencia() : est.presenciaInicial || [];
    var porEmail = {};
    presencia.forEach(function (p) { porEmail[p.email] = p; });
    var yo = App.estado.usuario.email;
    var filtro = est.filtroUsuarios || 'todos';
    var texto = Interprete.normalizar(est.buscarUsuario || '');
    var lista = est.usuarios.map(function (u) { return Object.assign({}, u, { pres: porEmail[u.email] }); });
    var enLinea = lista.filter(function (u) { return u.pres && u.pres.enLinea; });
    var conteo = {
      todos: lista.length, linea: enLinea.length,
      admin: lista.filter(function (u) { return u.rol === 'admin'; }).length,
      inactivos: lista.filter(function (u) { return !u.activo; }).length,
    };
    var visibles = lista.filter(function (u) {
      if (filtro === 'linea' && !(u.pres && u.pres.enLinea)) return false;
      if (filtro === 'admin' && u.rol !== 'admin') return false;
      if (filtro === 'inactivos' && u.activo) return false;
      return !texto || Interprete.normalizar(u.nombre + ' ' + u.email).indexOf(texto) !== -1;
    }).sort(function (a, b) {
      var pa = a.pres ? (a.pres.enLinea ? 2 : 1) : 0, pb = b.pres ? (b.pres.enLinea ? 2 : 1) : 0;
      return pb - pa || (a.rol === 'admin' ? 0 : 1) - (b.rol === 'admin' ? 0 : 1) || a.nombre.localeCompare(b.nombre);
    });
    var PAG = { calendario: 'Calendario', panel: 'Mi panel', salas: 'Salas', control: 'Panel de control' };

    var activoFoco = document.activeElement && document.activeElement.id === 'b-usuarios';
    var posCursor = activoFoco ? document.activeElement.selectionStart : 0;
    cont.innerHTML = '<section class="kpis">' +
      kpi('group', conteo.todos, 'Personas registradas', 'Aparecen al entrar por primera vez') +
      kpi('wifi', '<span class="estado-en-linea si" style="font:inherit">' + conteo.linea + '</span>', 'Conectadas ahora', 'Actividad en los últimos 3 minutos') +
      kpi('shield_person', conteo.admin, 'Administradores') +
      kpi('block', conteo.inactivos, 'Sin acceso', 'Usuarios desactivados') + '</section>' +
      '<div class="barra-tabla"><label class="buscar"><span class="ms">search</span><input id="b-usuarios" placeholder="Buscar por nombre o correo" value="' + U.esc(est.buscarUsuario || '') + '"></label>' +
      '<div class="segmentado">' + [['todos', 'Todos'], ['linea', 'En línea'], ['admin', 'Administradores'], ['inactivos', 'Sin acceso']].map(function (x) {
        return '<button data-fu="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' (' + conteo[x[0]] + ')</button>';
      }).join('') + '</div></div>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Persona</th><th>Ahora</th><th>Rol</th><th>Puede entrar</th>' +
      '<th class="num">Reuniones este mes</th><th class="num">Próximas</th><th>Último acceso</th></tr></thead><tbody>' +
      visibles.map(function (u) {
        var propio = u.email === yo;
        var p = u.pres;
        var ahora = p && p.enLinea
          ? '<span class="estado-en-linea si">En línea</span><small class="bloque tenue">' + U.esc(PAG[p.pagina] || '') + (p.dispositivo ? ' · ' + (p.dispositivo === 'movil' ? 'celular' : 'computadora') : '') + '</small>'
          : p ? '<span class="estado-en-linea">Activo ' + U.esc(Ayuda.haceCuanto(p.ts)) + '</span>' : '<span class="tenue">—</span>';
        return '<tr data-email="' + U.esc(u.email) + '"><td><span class="persona">' +
          (u.foto ? '<img class="avatar mini" src="' + U.esc(u.foto) + '" alt="" referrerpolicy="no-referrer">' : '<span class="avatar mini" style="background:' + Ayuda.colorPersona(u.email) + '">' + U.esc(U.iniciales(u.nombre)) + '</span>') +
          '<span><b>' + U.esc(u.nombre) + (propio ? ' (tú)' : '') + '</b><small>' + U.esc(u.email) + '</small></span></span></td>' +
          '<td>' + ahora + '</td>' +
          '<td><select data-rol aria-label="Rol de ' + U.esc(u.nombre) + '"' + (propio || u.rolPorConfig ? ' disabled' : '') + (u.rolPorConfig ? ' data-tip="Definido en la hoja Config (ADMINS)"' : propio ? ' data-tip="No puedes cambiar tu propio rol"' : '') + '>' +
          '<option value="usuario"' + (u.rol !== 'admin' ? ' selected' : '') + '>Usuario</option><option value="admin"' + (u.rol === 'admin' ? ' selected' : '') + '>Administrador</option></select></td>' +
          '<td><label class="interruptor" aria-label="Puede entrar"><input type="checkbox" data-activo' + (u.activo ? ' checked' : '') + (propio ? ' disabled' : '') + '><span class="pista"></span></label></td>' +
          '<td class="num">' + (u.reservasMes || 0) + '</td><td class="num">' + (u.proximas || 0) + '</td>' +
          '<td class="tenue nowrap">' + (u.ultimoAcceso ? U.esc(U.capitalizar(U.fechaMedia(new Date(u.ultimoAcceso)))) + ' · ' + U.esc(U.horaCompacta(new Date(u.ultimoAcceso), f24())) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (visibles.length ? '' : '<div class="vacio"><span class="ms">person_search</span><p>Nadie coincide con este filtro.</p></div>') +
      '<p class="tenue nota-pie">«En línea» significa que tiene la aplicación abierta y la usó en los últimos 3 minutos. La lista se actualiza sola cada minuto.</p>';

    var buscar = U.$('#b-usuarios', cont);
    buscar.addEventListener('input', function () { est.buscarUsuario = buscar.value; pintarUsuarios(cont); });
    if (activoFoco) { buscar.focus(); buscar.setSelectionRange(posCursor, posCursor); }
    U.$$('[data-fu]', cont).forEach(function (b) { b.addEventListener('click', function () { est.filtroUsuarios = b.dataset.fu; pintarUsuarios(cont); }); });
    U.$$('tr[data-email]', cont).forEach(function (tr) {
      var email = tr.dataset.email;
      var u = est.usuarios.filter(function (x) { return x.email === email; })[0];
      var rol = U.$('[data-rol]', tr), activo = U.$('[data-activo]', tr);
      function guardar(cambio, revertir) {
        App.api().guardarUsuario(Object.assign({ email: email }, cambio)).then(function () {
          Object.assign(u, cambio);
          App.aviso('Cambios guardados para ' + u.nombre);
          pintarUsuarios(cont);
        }).catch(function (e) { revertir(); App.aviso(e.message); });
      }
      rol.addEventListener('change', function () {
        var previo = rol.value === 'admin' ? 'usuario' : 'admin';
        guardar({ rol: rol.value }, function () { rol.value = previo; });
      });
      activo.addEventListener('change', function () {
        guardar({ activo: activo.checked }, function () { activo.checked = !activo.checked; });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', conectarDialogoSala);
  if (document.readyState !== 'loading') setTimeout(conectarDialogoSala, 0);

  function irPestana(nombre) {
    est.pestana = nombre;
    if (App.estado.pagina === 'control') { est.datos = null; control(U.$('#principal')); }
    else App.irPagina('control');
  }

  function alCambiarPresencia() {
    if (App.estado.pagina === 'control' && est.pestana === 'usuarios' && est.usuarios) pintarUsuarios(U.$('#pestana'));
  }

  return { mostrar: mostrar, filaReserva: filaReserva, irPestana: irPestana, alCambiarPresencia: alCambiarPresencia };
})();
