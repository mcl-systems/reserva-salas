/**
 * Aplicación principal: sesión, datos, páginas, calendario, detalle, copiar/pegar y mover.
 * Expone window.App para editor.js, paneles.js y asistente.js.
 */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var MODO_DEMO = !C.API_URL;
  var CLAVE_TOKEN = 'rs_token';
  var CLAVE_PREF = 'rs_preferencias';
  var PAGINAS = ['calendario', 'panel', 'salas', 'control'];
  var MARCAS = {
    verde: ['#14a38b', '#006a60'], azul: ['#1a73e8', '#0b57d0'], morado: ['#8a63f0', '#6442d6'],
    vino: ['#d1456f', '#a2264b'], naranja: ['#f07c2b', '#a14600'],
  };
  var NOMBRES_PAGINA = { calendario: 'Calendario', panel: 'Mi panel', salas: 'Salas', control: 'Panel de control' };


  var pref = U.almacen.leer(CLAVE_PREF) || {};
  var estado = {
    api: null,
    usuario: null,
    salas: [],
    config: {},
    partes: Reglas.partesIntl(C.ZONA_HORARIA || 'America/El_Salvador'),
    pagina: 'calendario',
    vista: window.innerWidth < 640 ? 'dia' : (pref.vista || 'semana'),
    fecha: U.inicioDia(new Date()),
    ocultas: pref.ocultas || [],
    soloMias: !!pref.soloMias,
    porSalas: window.innerWidth < 640 ? false : pref.porSalas !== false,
    cache: {},          // id → reserva
    rangos: [],         // [[desdeMs, hastaMs]] ya cargados
    token: null,
    portapapeles: null, // reunión copiada
    pegando: false,
    seleccionada: null, // id de la reunión abierta en el detalle
    posicion: null,     // última casilla del calendario bajo el puntero
  };

  function guardarPreferencias() {
    U.almacen.guardar(CLAVE_PREF, {
      vista: estado.vista, ocultas: estado.ocultas, soloMias: estado.soloMias, porSalas: estado.porSalas,
    });
  }

  // ======================================================================
  // Sesión
  // ======================================================================
  function leerToken(t) {
    try {
      var b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var p = JSON.parse(decodeURIComponent(escape(atob(b))));
      return p.exp * 1000 > Date.now() + 60000 ? p : null;
    } catch (e) { return null; }
  }

  function mostrarAcceso(error) {
    U.$('#app').hidden = true;
    U.$('#pantalla-acceso').hidden = false;
    U.$$('[data-org]').forEach(function (e) { e.textContent = C.NOMBRE_ORGANIZACION || ''; });
    var err = U.$('#acceso-error');
    err.hidden = !error || !error.trim();
    err.textContent = error || '';
    if (MODO_DEMO) {
      U.$('#acceso-demo').hidden = false;
      U.$('#boton-google').hidden = true;
      return;
    }
    if (!C.GOOGLE_CLIENT_ID) {
      err.hidden = false;
      err.textContent = 'Falta GOOGLE_CLIENT_ID en web/js/config.js (ver README).';
      return;
    }
    cargarGoogle().then(function () {
      var oscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
      google.accounts.id.renderButton(U.$('#boton-google'), {
        theme: oscuro ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with',
        logo_alignment: 'left', locale: 'es', width: 280,
      });
      if (!error) google.accounts.id.prompt();
    }).catch(function (e) {
      err.hidden = false;
      err.textContent = e.message;
    });
  }

  var promesaGoogle = null;
  function cargarGoogle() {
    if (promesaGoogle) return promesaGoogle;
    promesaGoogle = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () {
        google.accounts.id.initialize({
          client_id: C.GOOGLE_CLIENT_ID,
          callback: function (resp) { alRecibirCredencial(resp.credential); },
          auto_select: true,
          cancel_on_tap_outside: false,
          hd: C.DOMINIO_SUGERIDO || undefined,
          use_fedcm_for_prompt: true,
          itp_support: true,
          context: 'signin',
        });
        ok();
      };
      s.onerror = function () { mal(new Error('No se pudo cargar el acceso con Google. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
    return promesaGoogle;
  }

  var temporizadorRenovar = null;
  function alRecibirCredencial(credencial) {
    var datos = leerToken(credencial);
    if (!datos) return mostrarAcceso('No se pudo validar tu sesión. Intenta de nuevo.');
    estado.token = credencial;
    U.sesion.guardar(CLAVE_TOKEN, credencial);
    clearTimeout(temporizadorRenovar);
    // El token de Google dura 1 hora: se renueva en silencio 5 minutos antes
    temporizadorRenovar = setTimeout(function () {
      if (window.google && google.accounts) google.accounts.id.prompt();
    }, Math.max(datos.exp * 1000 - Date.now() - 5 * 60000, 10000));
    if (!estado.usuario) entrar();
  }

  function alExpirarSesion(mensaje) {
    estado.token = null;
    estado.usuario = null;
    U.sesion.borrar(CLAVE_TOKEN);
    mostrarAcceso(mensaje || 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  function cerrarSesion() {
    if (MODO_DEMO) {
      estado.usuario = null;
      U.sesion.borrar('rs_demo');
      return mostrarAcceso();
    }
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    alExpirarSesion(' ');
  }

  function entrar() {
    cargando(true);
    if (!estado.api) {
      estado.api = MODO_DEMO
        ? new Api.ApiDemo(C.ZONA_HORARIA || 'America/El_Salvador')
        : new Api.ApiGoogle(C.API_URL, function () { return estado.token; }, alExpirarSesion);
    }
    return estado.api.iniciar().then(function (d) {
      cargando(false);
      estado.usuario = d.usuario;
      estado.salas = d.salas;
      estado.config = d.config || {};
      estado.cache = {};
      estado.rangos = [];
      if (MODO_DEMO) U.sesion.guardar('rs_demo', '1');
      U.$('#pantalla-acceso').hidden = true;
      U.$('#app').hidden = false;
      U.$('#chip-demo').hidden = !MODO_DEMO;
      U.$('#nota-calendar').hidden = !estado.config.SINCRONIZAR_CALENDAR;
      U.$$('[data-solo-admin]').forEach(function (e) { e.hidden = !esAdmin(); });
      U.$('#nav-inferior').hidden = false;
      U.$$('[data-org]').forEach(function (e) { e.textContent = estado.config.NOMBRE_ORGANIZACION || C.NOMBRE_ORGANIZACION || ''; });
      pintarCuenta();
      pintarSalas();
      Asistente.iniciar(contextoAsistente());
      leerRuta();
      Ayuda.alEntrar();
      Epocas.establecer(estado.config.EPOCA);
      Epocas.iniciar();
    }).catch(function (e) {
      cargando(false);
      if (e.codigo !== 'auth') mostrarAcceso(e.message);
    });
  }

  function esAdmin() { return !!estado.usuario && estado.usuario.rol === 'admin'; }

  // ======================================================================
  // Datos (caché por rangos)
  // ======================================================================
  function cubierto(d, h) {
    return estado.rangos.some(function (r) { return r[0] <= d && r[1] >= h; });
  }

  function obtenerReservas(desde, hasta, forzar) {
    var d = desde.getTime(), h = hasta.getTime();
    var filtrar = function () {
      return Object.keys(estado.cache).map(function (k) { return estado.cache[k]; }).filter(function (r) {
        return r.estado === 'confirmada' && Reglas.seCruzan(d, h, r.inicio, r.fin);
      });
    };
    if (!forzar && cubierto(d, h)) return Promise.resolve(filtrar());
    cargando(true);
    return estado.api.listar(desde, hasta).then(function (lista) {
      Object.keys(estado.cache).forEach(function (k) {
        var r = estado.cache[k];
        if (Reglas.seCruzan(d, h, r.inicio, r.fin)) delete estado.cache[k];
      });
      lista.forEach(function (r) { estado.cache[r.id] = r; });
      estado.rangos = estado.rangos.filter(function (r) { return !(r[0] >= d && r[1] <= h); });
      estado.rangos.push([d, h]);
      cargando(false);
      return filtrar();
    }).catch(function (e) {
      cargando(false);
      if (e.codigo !== 'auth') aviso(e.message);
      throw e;
    });
  }

  function invalidar() { estado.rangos = []; }

  var contadorCarga = 0;
  function cargando(si) {
    contadorCarga = Math.max(0, contadorCarga + (si ? 1 : -1));
    U.$('#carga').hidden = contadorCarga === 0;
  }

  // ======================================================================
  // Páginas (#calendario, #panel, #salas, #control)
  // ======================================================================
  function leerRuta() {
    var p = location.hash.replace('#', '');
    if (PAGINAS.indexOf(p) === -1 || (p === 'control' && !esAdmin())) p = 'calendario';
    irPagina(p, true);
  }

  function irPagina(p, desdeRuta) {
    if (p === 'control' && !esAdmin()) p = 'panel';
    estado.pagina = p;
    if (!desdeRuta && location.hash !== '#' + p) {
      try { history.replaceState(null, '', '#' + p); } catch (e) { location.hash = p; }
    }
    var app = U.$('#app');
    PAGINAS.forEach(function (x) { app.classList.toggle('pagina-' + x, x === p); });
    U.$$('.nav-lateral a, .nav-inferior a').forEach(function (a) {
      var activo = a.dataset.pagina === p;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = NOMBRES_PAGINA[p] + ' · ' + (C.NOMBRE_APP || 'Reserva de Salas');
    if (p !== 'calendario') salirDePegar();
    cerrarPopover();
    cerrarLateralMovil();
    dibujar();
    // Accesibilidad: llevar el foco al contenido nuevo al cambiar de sección
    if (!desdeRuta || estado.navegado) U.$('#principal').focus({ preventScroll: true });
    estado.navegado = true;
    if (estado.usuario && Ayuda.latido) Ayuda.latido();
  }

  // ======================================================================
  // Calendario
  // ======================================================================
  function finesDeSemana() { return !!estado.config.PERMITIR_FINES_DE_SEMANA; }

  function rangoVisible() {
    var f = estado.fecha;
    if (estado.vista === 'dia') return { desde: f, hasta: U.sumarDias(f, 1), dias: [f] };
    if (estado.vista === 'semana') {
      var lunes = U.inicioSemana(f);
      var n = finesDeSemana() ? 7 : 5;
      var dias = [];
      for (var i = 0; i < n; i++) dias.push(U.sumarDias(lunes, i));
      return { desde: lunes, hasta: U.sumarDias(lunes, 7), dias: dias };
    }
    if (estado.vista === 'mes') {
      var ini = U.inicioSemana(U.inicioMes(f));
      return { desde: ini, hasta: U.sumarDias(ini, 42) };
    }
    return { desde: U.inicioDia(f), hasta: U.sumarDias(f, 31) };
  }

  function tituloPeriodo() {
    var f = estado.fecha;
    if (estado.vista === 'dia') return U.capitalizar(U.fechaLarga(f)) + (f.getFullYear() !== new Date().getFullYear() ? ' de ' + f.getFullYear() : '');
    if (estado.vista === 'semana') {
      var r = rangoVisible();
      var a = r.dias[0], b = r.dias[r.dias.length - 1];
      if (a.getMonth() === b.getMonth()) return U.capitalizar(U.MESES[a.getMonth()]) + ' de ' + a.getFullYear();
      return U.capitalizar(U.MESES_CORTOS[a.getMonth()]) + ' – ' + U.MESES_CORTOS[b.getMonth()] + ' de ' + b.getFullYear();
    }
    if (estado.vista === 'mes') return U.capitalizar(U.MESES[f.getMonth()]) + ' de ' + f.getFullYear();
    return 'Agenda desde ' + U.fechaMedia(f);
  }

  function salasVisibles() {
    return estado.salas.filter(function (s) { return s.activa && estado.ocultas.indexOf(s.id) === -1; });
  }

  function reservasVisibles(lista) {
    return lista.filter(function (r) {
      if (estado.ocultas.indexOf(r.salaId) !== -1) return false;
      if (estado.soloMias && r.organizadorEmail !== estado.usuario.email) return false;
      return true;
    });
  }

  function puedeMover(r) {
    if (!r.puedeEditar) return false;
    var ahora = new Date();
    if (new Date(r.fin) <= ahora) return false;
    return new Date(r.inicio) > ahora || esAdmin();
  }

  var turnoDibujo = 0;
  function dibujar(mantenerScroll) {
    var turno = ++turnoDibujo;
    if (estado.pagina !== 'calendario') {
      U.$('#titulo-periodo').textContent = NOMBRES_PAGINA[estado.pagina];
      return Paneles.mostrar(estado.pagina, U.$('#principal'));
    }
    var r = rangoVisible();
    U.$('#titulo-periodo').textContent = tituloPeriodo();
    U.$$('.vistas button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.vista === estado.vista)); });
    pintarMiniCal();
    return obtenerReservas(r.desde, r.hasta).then(function (lista) {
      if (turno !== turnoDibujo || estado.pagina !== 'calendario') return;
      var op = {
        salas: estado.salas, salasVisibles: salasVisibles(), reservas: reservasVisibles(lista), usuario: estado.usuario,
        dias: r.dias, fecha: estado.fecha, formato24: !!C.FORMATO_24H, zonaHoraria: C.ZONA_HORARIA,
        finesDeSemana: finesDeSemana(), porSalas: estado.porSalas, mantenerScroll: mantenerScroll,
        pegando: estado.pegando && estado.portapapeles ? estado.portapapeles : null,
        puedeMover: puedeMover,
        reservaPorId: function (id) { return estado.cache[id]; },
        alClicEvento: abrirPopover,
        alCrear: function (o) { Editor.abrir({ fecha: o.fecha, inicioMin: o.inicioMin, finMin: o.finMin, salaId: o.salaId, fantasma: o.fantasma }); },
        alMover: moverReserva,
        alPegar: pegarEn,
        alPosar: function (p) { estado.posicion = p; },
        redibujar: function () { dibujar(true); },
        alIrDia: function (d) { irA(d, 'dia'); },
        alAlternarSalas: function () { estado.porSalas = !estado.porSalas; guardarPreferencias(); dibujar(true); },
      };
      Calendario[estado.vista](U.$('#principal'), op);
      pintarEstadoAhora();
    }).catch(function () { /* error ya avisado */ });
  }

  function irA(fecha, vista) {
    if (vista) estado.vista = vista;
    estado.fecha = U.inicioDia(fecha);
    guardarPreferencias();
    cerrarPopover();
    if (estado.pagina !== 'calendario') return irPagina('calendario');
    dibujar();
  }

  function mover(dir) {
    var f = estado.fecha;
    if (estado.vista === 'dia') {
      f = U.sumarDias(f, dir);
      if (!finesDeSemana()) while (f.getDay() === 0 || f.getDay() === 6) f = U.sumarDias(f, dir);
    } else if (estado.vista === 'semana') f = U.sumarDias(f, 7 * dir);
    else if (estado.vista === 'mes') f = U.sumarMeses(f, dir);
    else f = U.sumarDias(f, 30 * dir);
    irA(f);
  }

  // ======================================================================
  // Barra lateral
  // ======================================================================
  var mesMini = null;
  function pintarMiniCal() {
    if (!mesMini || estado.vista !== 'mes') mesMini = U.inicioMes(estado.fecha);
    var cont = U.$('#mini-cal');
    var inicio = U.inicioSemana(mesMini);
    var hoy = U.inicioDia(new Date());
    var r = rangoVisible();
    var html = '<div class="mini-cab"><span>' + U.capitalizar(U.MESES[mesMini.getMonth()]) + ' de ' + mesMini.getFullYear() + '</span>' +
      '<button class="btn-icono" data-mini="-1" aria-label="Mes anterior"><span class="ms">chevron_left</span></button>' +
      '<button class="btn-icono" data-mini="1" aria-label="Mes siguiente"><span class="ms">chevron_right</span></button></div><div class="mini-grid">';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (d) { html += '<span class="dsem">' + d + '</span>'; });
    for (var i = 0; i < 42; i++) {
      var d = U.sumarDias(inicio, i);
      var clases = [];
      if (d.getMonth() !== mesMini.getMonth()) clases.push('fuera');
      if (U.mismoDia(d, hoy)) clases.push('hoy');
      else if (U.mismoDia(d, estado.fecha)) clases.push('sel');
      else if (estado.vista === 'semana' && d >= r.desde && d < r.hasta) clases.push('en-rango');
      html += '<button class="' + clases.join(' ') + '" data-fecha="' + U.claveDia(d) + '" aria-label="' + U.esc(U.fechaLarga(d)) + '">' + d.getDate() + '</button>';
    }
    cont.innerHTML = html + '</div>';
    U.$$('[data-mini]', cont).forEach(function (b) {
      b.addEventListener('click', function () { mesMini = U.sumarMeses(mesMini, Number(b.dataset.mini)); pintarMiniCal(); });
    });
    U.$$('[data-fecha]', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        var d = U.desdeClave(b.dataset.fecha);
        mesMini = U.inicioMes(d);
        irA(d, estado.vista === 'agenda' ? 'dia' : estado.vista);
        cerrarLateralMovil();
      });
    });
  }

  function pintarSalas() {
    U.$('#lista-salas').innerHTML = estado.salas.filter(function (s) { return s.activa; }).map(function (s) {
      return '<li><label class="casilla" style="--c:' + s.color + '" data-tip="' + U.esc(s.ubicacion + (s.equipamiento ? ' · ' + s.equipamiento : '')) + '">' +
        '<input type="checkbox" data-sala="' + U.esc(s.id) + '"' + (estado.ocultas.indexOf(s.id) === -1 ? ' checked' : '') + '>' +
        '<span class="casilla-caja"></span><span class="sala-info"><b>' + U.esc(s.nombre) + '</b>' +
        '<small>' + s.capacidad + ' personas' + (s.ubicacion ? ' · ' + U.esc(s.ubicacion) : '') + '</small></span></label></li>';
    }).join('');
    U.$$('[data-sala]', U.$('#lista-salas')).forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.dataset.sala;
        estado.ocultas = estado.ocultas.filter(function (x) { return x !== id; });
        if (!cb.checked) estado.ocultas.push(id);
        guardarPreferencias();
        dibujar(true);
      });
    });
    U.$('#solo-mias').checked = estado.soloMias;
  }

  function estadoSala(s, lista, ahora) {
    var propias = lista.filter(function (r) { return r.salaId === s.id; })
      .sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); });
    var actual = propias.filter(function (r) { return new Date(r.inicio) <= ahora && new Date(r.fin) > ahora; })[0];
    var siguiente = propias.filter(function (r) { return new Date(r.inicio) > ahora; })[0];
    var texto;
    if (actual) texto = 'ocupada hasta ' + U.horaCompacta(new Date(actual.fin), C.FORMATO_24H);
    else if (siguiente) texto = 'libre hasta ' + U.horaCompacta(new Date(siguiente.inicio), C.FORMATO_24H);
    else texto = 'libre';
    return { actual: actual, siguiente: siguiente, texto: texto };
  }

  function reservasDeHoy() {
    var hoy = U.inicioDia(new Date());
    return obtenerReservas(hoy, U.sumarDias(hoy, 1));
  }

  function pintarEstadoAhora() {
    reservasDeHoy().then(function (lista) {
      var ahora = new Date();
      U.$('#estado-ahora').innerHTML = estado.salas.filter(function (s) { return s.activa; }).map(function (s) {
        var e = estadoSala(s, lista, ahora);
        var detalle = e.actual ? 'Hasta ' + U.horaCompacta(new Date(e.actual.fin), C.FORMATO_24H)
          : e.siguiente ? 'Hasta ' + U.horaCompacta(new Date(e.siguiente.inicio), C.FORMATO_24H) : 'Todo el día';
        return '<li class="placa" style="--c:' + s.color + '" data-tip="' + U.esc(e.actual ? 'En uso: ' + e.actual.titulo : 'Disponible ahora · ' + s.capacidad + ' personas') + '">' +
          '<span><span class="placa-nombre">' + U.esc(s.nombre) + '</span><span class="placa-sub">' + U.esc(detalle).replace(/ (?=[ap]\. m\.| m\.)/g, "&nbsp;") + '</span></span>' +
          '<span class="estado-pill' + (e.actual ? ' ocupada' : '') + '">' + (e.actual ? 'Ocupada' : 'Libre') + '</span></li>';
      }).join('');
    }).catch(function () {});
  }

  function pintarCuenta() {
    var u = estado.usuario;
    var b = U.$('#btn-cuenta');
    b.innerHTML = u.foto ? '<img src="' + U.esc(u.foto) + '" alt="" referrerpolicy="no-referrer">' : U.esc(U.iniciales(u.nombre));
    b.title = u.nombre + '\n' + u.email + (esAdmin() ? '\nAdministrador' : '');
  }

  function abrirMenuCuenta() {
    var u = estado.usuario;
    var m = U.$('#menu-cuenta');
    if (!m.hidden && m.dataset.tipo === 'cuenta') { m.hidden = true; return; }
    m.dataset.tipo = 'cuenta';
    var marca = document.documentElement.dataset.marca;
    var huevos = Huevos.progreso();
    m.innerHTML = '<div class="cuenta-cab"><span class="avatar">' +
      (u.foto ? '<img src="' + U.esc(u.foto) + '" alt="" referrerpolicy="no-referrer">' : U.esc(U.iniciales(u.nombre))) + '</span>' +
      '<b>' + U.esc(u.nombre) + '</b><small>' + U.esc(u.email) + '</small>' +
      '<span class="etiqueta' + (esAdmin() ? ' ok' : '') + '"><span class="ms">' + (esAdmin() ? 'shield_person' : 'person') + '</span>' +
      (esAdmin() ? 'Administrador' : 'Usuario') + '</span></div>' +
      '<button class="menu-item" data-accion="panel"><span class="ms">space_dashboard</span>Mi panel</button>' +
      (esAdmin() ? '<button class="menu-item" data-accion="control"><span class="ms">admin_panel_settings</span>Panel de control</button>' : '') +
      (esAdmin() ? '<button class="menu-item" data-accion="conectados"><span class="ms">group</span>Usuarios conectados</button>' : '') +
      '<button class="menu-item" data-accion="tema"><span class="ms">dark_mode</span>Cambiar tema claro / oscuro</button>' +
      '<div class="menu-item" style="cursor:default"><span class="ms">palette</span>Color de la aplicación</div>' +
      '<div class="colores-marca" role="group" aria-label="Color de la aplicación">' + Object.keys(MARCAS).map(function (k) {
        return '<button data-marca="' + k + '" aria-pressed="' + (k === marca) + '" aria-label="' + k + '" data-tip="' + U.capitalizar(k) + '" style="--a:' + MARCAS[k][0] + ';--b:' + MARCAS[k][1] + '"></button>';
      }).join('') + '</div>' +
      (esAdmin() ? '<div class="menu-item" style="cursor:default"><span class="ms">celebration</span>Decoración de temporada <small class="tenue">· para todos</small></div>' + Epocas.htmlSelector() : '') +
      '<div class="menu-item" style="cursor:default"><span class="ms">match_case</span>Tipo de letra</div>' + Fuentes.html() +
      '<div class="menu-item" style="cursor:default"><span class="ms">format_size</span>Tamaño de letra</div>' + htmlLetra() +
      '<button class="menu-item" data-accion="ayuda"><span class="ms">keyboard</span>Ayuda y atajos de teclado</button>' +
      (Huevos.activos() && huevos.encontrados ? '<button class="menu-item" data-accion="huevos"><span class="ms">egg</span>Huevos de pascua (' + huevos.encontrados + ' de ' + huevos.total + ')</button>' : '') +
      (MODO_DEMO ? '<button class="menu-item" data-accion="rol"><span class="ms">switch_account</span>' +
        (esAdmin() ? 'Ver como usuario normal' : 'Ver como administrador') + ' (demo)</button>' +
        '<button class="menu-item" data-accion="reiniciar"><span class="ms">restart_alt</span>Reiniciar datos de demostración</button>' : '') +
      '<button class="menu-item" data-accion="salir"><span class="ms">logout</span>' + (MODO_DEMO ? 'Salir de la demostración' : 'Cerrar sesión') + '</button>';
    var r = U.$('#btn-cuenta').getBoundingClientRect();
    m.style.top = r.bottom + 8 + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    m.hidden = false;
    conectarLetra(m);
    Fuentes.conectar(m, function () { if (estado.usuario) dibujar(true); });
    Epocas.conectarSelector(m, function (valor) {
      return estado.api.guardarEpoca(valor).then(function () {
        estado.config.EPOCA = valor;
        var e = Epocas.establecer(valor);
        dibujar(true);
        aviso((e ? e.emoji + ' Decoración: ' + e.nombre : 'Decoración de temporada apagada') + '. Se aplica a todas las personas.');
      }).catch(function (err) {
        aviso(err.message || 'No se pudo guardar la decoración.');
        throw err;
      });
    });
    U.$$('[data-marca]', m).forEach(function (b) {
      b.addEventListener('click', function () {
        ponerMarca(b.dataset.marca, true);
        U.$$('[data-marca]', m).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    U.$$('[data-accion]', m).forEach(function (b) {
      b.addEventListener('click', function () {
        m.hidden = true;
        var a = b.dataset.accion;
        if (a === 'salir') cerrarSesion();
        if (a === 'tema') alternarTema();
        if (a === 'panel' || a === 'control') irPagina(a);
        if (a === 'conectados') Paneles.irPestana('usuarios');
        if (a === 'ayuda') Ayuda.mostrarAyuda();
        if (a === 'huevos') Huevos.mostrarColeccion();
        if (a === 'rol') {
          estado.api.cambiarRol();
          entrar().then(function () { aviso(esAdmin() ? 'Ahora ves la aplicación como administrador' : 'Ahora ves la aplicación como usuario normal'); });
        }
        if (a === 'reiniciar') { estado.api.reiniciar(); entrar().then(function () { aviso('Datos de demostración reiniciados'); }); }
      });
    });
  }

  var LETRAS = [['normal', 'Normal'], ['grande', 'Grande'], ['muy-grande', 'Muy grande']];
  function htmlLetra() {
    var actual = document.documentElement.dataset.letra || 'normal';
    return '<div class="tam-letra" role="group" aria-label="Tamaño de letra">' + LETRAS.map(function (l) {
      return '<button type="button" data-letra="' + l[0] + '" aria-pressed="' + (l[0] === actual) + '" aria-label="Letra ' + l[1].toLowerCase() + '" data-tip="' + l[1] + '">A</button>';
    }).join('') + '</div>';
  }
  function conectarLetra(cont) {
    U.$$('.tam-letra [data-letra]', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        ponerLetra(b.dataset.letra, true);
        U.$$('.tam-letra [data-letra]', cont).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
  }
  function ponerLetra(valor, guardar) {
    if (valor === 'normal' || !valor) delete document.documentElement.dataset.letra;
    else document.documentElement.dataset.letra = valor;
    if (guardar) { U.almacen.guardar('rs_letra', valor); if (estado.usuario) dibujar(true); }
  }

  function ponerMarca(nombre, guardar) {
    if (!MARCAS[nombre]) nombre = 'verde';
    document.documentElement.dataset.marca = nombre;
    if (guardar) U.almacen.guardar('rs_marca', nombre);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim() || '#f8fafd');
  }

  function alternarTema() {
    var raiz = document.documentElement;
    var oscuroAhora = raiz.dataset.tema ? raiz.dataset.tema === 'oscuro' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    raiz.dataset.tema = oscuroAhora ? 'claro' : 'oscuro';
    U.almacen.guardar('rs_tema', raiz.dataset.tema);
  }

  // ======================================================================
  // Fotos de salas
  // ======================================================================
  var fotosRespaldo = {};
  function fotoSala(sala, clase) {
    var src = sala.foto || Ilustraciones.sala(sala);
    return '<img class="' + (clase || 'foto-sala') + '" src="' + U.esc(src) + '" alt="' + U.esc('Foto de ' + sala.nombre) +
      '" loading="lazy" referrerpolicy="no-referrer" data-foto-sala="' + U.esc(sala.id) + '">';
  }
  // Si la foto de Drive no carga por su enlace, se pide al script; si tampoco, se usa la ilustración
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.dataset.fotoSala || img.dataset.respaldo) return;
    img.dataset.respaldo = '1';
    var sala = salaPorId(img.dataset.fotoSala);
    if (!sala) return;
    var m = String(sala.foto || '').match(/googleusercontent\.com\/d\/([\w-]+)/);
    if (m && !MODO_DEMO && estado.api.foto) {
      var id = m[1];
      var p = fotosRespaldo[id] || (fotosRespaldo[id] = estado.api.foto(id).then(function (r) { return r.dataUrl; }));
      p.then(function (url) { img.src = url; }).catch(function () { img.src = Ilustraciones.sala(sala); });
    } else {
      img.src = Ilustraciones.sala(sala);
    }
  }, true);

  // ======================================================================
  // Detalle de una reunión
  // ======================================================================
  function salaPorId(id) { return Reglas.buscarSala(estado.salas, id); }

  function abrirPopover(id, ancla) {
    var r = estado.cache[id];
    if (!r) return;
    estado.seleccionada = id;
    var s = salaPorId(r.salaId) || { id: '', nombre: 'Sala', color: '#039be5', ubicacion: '', capacidad: '' };
    var ini = new Date(r.inicio), fin = new Date(r.fin);
    var ahora = new Date();
    var editable = puedeMover(r);
    var cancelable = r.puedeEditar && fin > ahora;
    var propia = r.organizadorEmail === estado.usuario.email;
    var p = U.$('#popover');
    if (r.oculta) {
      p.innerHTML =
        '<div class="pop-foto">' + fotoSala(s, 'pop-img') +
        '<div class="pop-acciones"><button class="btn-icono" data-p="cerrar" data-tip="Cerrar"><span class="ms">close</span></button></div></div>' +
        '<div class="pop-fila"><span class="cuadro" style="--c:' + s.color + '"></span><div>' +
        '<h3 class="pop-titulo">Reservada</h3>' +
        '<div class="pop-sub">' + U.esc(U.capitalizar(U.fechaLarga(ini))) + ' · ' + U.esc(U.rangoHoras(ini, fin, C.FORMATO_24H)) + '</div>' +
        '<span class="etiqueta privada"><span class="ms">lock</span>Reunión privada</span></div></div>' +
        '<div class="pop-fila"><span class="ms">meeting_room</span><div>' + U.esc(s.nombre) +
        '<div class="pop-sub">' + U.esc(s.ubicacion || '') + '</div></div></div>' +
        '<div class="pop-permiso"><span class="ms">visibility_off</span>Los detalles de esta reunión solo los ven quien la organizó, sus invitados y los administradores.</div>';
      p.hidden = false;
      posicionar(p, ancla);
      p.querySelector('[data-p="cerrar"]').addEventListener('click', cerrarPopover);
      p.querySelector('[data-p="cerrar"]').focus({ preventScroll: true });
      return;
    }
    p.innerHTML =
      '<div class="pop-foto">' + fotoSala(s, 'pop-img') +
      '<div class="pop-acciones">' +
      (editable ? '<button class="btn-icono" data-p="editar" data-tip="Editar"><span class="ms">edit</span></button>' : '') +
      '<button class="btn-icono" data-p="copiar" data-tip="Copiar para pegar en otro horario (Ctrl+C)"><span class="ms">content_copy</span></button>' +
      (cancelable ? '<button class="btn-icono" data-p="cancelar" data-tip="Cancelar reserva"><span class="ms">delete</span></button>' : '') +
      (r.puedeEditar ? '<button class="btn-icono" data-p="ics" data-tip="Descargar para mi calendario (.ics)"><span class="ms">download</span></button>' : '') +
      '<button class="btn-icono" data-p="cerrar" data-tip="Cerrar"><span class="ms">close</span></button></div></div>' +
      '<div class="pop-fila"><span class="cuadro" style="--c:' + s.color + '"></span><div>' +
      '<h3 class="pop-titulo">' + U.esc(r.titulo) + '</h3>' +
      '<div class="pop-sub">' + U.esc(U.capitalizar(U.fechaLarga(ini))) + ' · ' + U.esc(U.rangoHoras(ini, fin, C.FORMATO_24H)) + '</div>' +
      (r.privada ? '<span class="etiqueta privada" data-tip="Los demás solo ven «Reservada»"><span class="ms">lock</span>Privada</span>' : '') +
      (!propia && Reglas.esInvitado(r, estado.usuario) ? '<span class="etiqueta"><span class="ms">mail</span>Te invitaron</span>' : '') +
      (r.enCalendar ? '<span class="etiqueta ok"><span class="ms">event_available</span>En Google Calendar</span>' : '') +
      (ini <= ahora && fin > ahora ? '<span class="etiqueta"><span class="ms">radio_button_checked</span>En curso</span>' : '') +
      '</div></div>' +
      (r.recurrencia ? '<div class="pop-fila"><span class="ms">repeat</span><div>' + U.esc(r.recurrencia) + '</div></div>' : '') +
      '<div class="pop-fila"><span class="ms">meeting_room</span><div>' + U.esc(s.nombre) +
      '<div class="pop-sub">' + U.esc(s.ubicacion || '') + (s.ubicacion ? ' · ' : '') + r.asistentes + ' de ' + s.capacidad + ' personas</div></div></div>' +
      '<div class="pop-fila"><span class="ms">person</span><div>' + U.esc(r.organizadorNombre) + (propia ? ' (tú)' : '') +
      '<div class="pop-sub">Organizador · ' + U.esc(r.organizadorEmail) + '</div></div></div>' +
      (r.invitados && r.invitados.length ? '<div class="pop-fila"><span class="ms">group</span><div class="pop-desc">' + r.invitados.map(U.esc).join('\n') + '</div></div>' : '') +
      (r.descripcion ? '<div class="pop-fila"><span class="ms">notes</span><div class="pop-desc">' + U.esc(r.descripcion) + '</div></div>' : '') +
      (!r.puedeEditar
        ? '<div class="pop-permiso"><span class="ms">lock</span>Solo ' + U.esc(r.organizadorNombre) + ' o un administrador puede cambiar o cancelar esta reunión. Puedes copiarla para crear una parecida.</div>'
        : !propia ? '<div class="pop-permiso admin"><span class="ms">shield_person</span>Como administrador puedes modificar o cancelar esta reunión.</div>' : '');
    p.hidden = false;
    posicionar(p, ancla);

    U.$$('[data-p]', p).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.p;
        if (a === 'cerrar') cerrarPopover();
        if (a === 'editar') { cerrarPopover(); Editor.abrir({ reserva: r }); }
        if (a === 'copiar') { cerrarPopover(); copiar(r); }
        if (a === 'ics') descargarIcs(r, s);
        if (a === 'cancelar') { cerrarPopover(); cancelarReserva(r); }
      });
    });
    var primero = p.querySelector('.pop-acciones button');
    if (primero) primero.focus({ preventScroll: true });
  }

  function posicionar(p, ancla) {
    if (window.innerWidth <= 640 || !ancla) { p.style.top = ''; p.style.left = ''; return; }
    var r = ancla.getBoundingClientRect();
    var w = p.offsetWidth, h = p.offsetHeight;
    var left = r.right + 12;
    if (left + w > window.innerWidth - 8) left = r.left - w - 12;
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    var top = Math.min(Math.max(8, r.top), window.innerHeight - h - 8);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  function cerrarPopover() {
    U.$('#popover').hidden = true;
    estado.seleccionada = null;
  }

  function descargar(nombre, contenido, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function descargarIcs(r, s) {
    var f = function (d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var e = function (t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); };
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reserva de salas//ES', 'BEGIN:VEVENT',
      'UID:' + r.id + '@reserva-salas', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(r.inicio), 'DTEND:' + f(r.fin),
      'SUMMARY:' + e(r.titulo), 'LOCATION:' + e(s.nombre + (s.ubicacion ? ' - ' + s.ubicacion : '')),
      'DESCRIPTION:' + e(r.descripcion), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    descargar((r.titulo || 'reunion').replace(/[^\w\- áéíóúñ]/gi, '').slice(0, 40) + '.ics', ics, 'text/calendar');
  }

  // ======================================================================
  // Confirmaciones (diálogo propio, más claro que confirm())
  // ======================================================================
  /**
   * @param {{titulo, texto, icono?, opciones?: [{valor, texto, detalle}], botones: [{texto, valor, clase}]}} o
   * @return {Promise<{boton, opcion}>}
   */
  function confirmar(o) {
    var dlg = U.$('#dlg-confirmar');
    U.$('#conf-icono').textContent = o.icono || 'help';
    U.$('#conf-titulo').textContent = o.titulo;
    U.$('#conf-texto').innerHTML = o.texto || '';
    U.$('#conf-opciones').innerHTML = (o.opciones || []).map(function (op, i) {
      return '<label class="conf-opcion"><input type="radio" name="conf-opcion" value="' + U.esc(op.valor) + '"' + (i === 0 ? ' checked' : '') + '>' +
        '<span><b>' + U.esc(op.texto) + '</b>' + (op.detalle ? '<small>' + U.esc(op.detalle) + '</small>' : '') + '</span></label>';
    }).join('');
    var pie = U.$('#conf-botones');
    pie.innerHTML = '<span class="espaciador"></span>';
    return new Promise(function (resolver) {
      var resuelto = false;
      function terminar(valor) {
        if (resuelto) return;
        resuelto = true;
        var sel = U.$('input[name="conf-opcion"]:checked', dlg);
        if (dlg.open) dlg.close();
        resolver({ boton: valor, opcion: sel ? sel.value : null });
      }
      o.botones.forEach(function (b) {
        var boton = U.el('<button type="button" class="btn ' + (b.clase || 'btn-texto') + '">' + U.esc(b.texto) + '</button>');
        boton.addEventListener('click', function () { terminar(b.valor); });
        pie.appendChild(boton);
      });
      dlg.addEventListener('close', function () { terminar(null); }, { once: true });
      dlg.showModal();
      var ultimo = pie.querySelector('button:last-child');
      if (ultimo) ultimo.focus();
    });
  }

  function cancelarReserva(r) {
    var opciones = r.serieId ? [
      { valor: 'una', texto: 'Solo esta reunión', detalle: U.capitalizar(U.fechaLarga(new Date(r.inicio))) },
      { valor: 'serie', texto: 'Esta y las siguientes', detalle: r.recurrencia || 'Todas las fechas siguientes de la serie' },
    ] : null;
    var ajena = r.organizadorEmail !== estado.usuario.email;
    return confirmar({
      icono: 'event_busy',
      titulo: '¿Cancelar «' + r.titulo + '»?',
      texto: 'La sala quedará libre' + (r.enCalendar ? ' y se quitará el evento de Google Calendar' : '') + '.' +
        (ajena ? '<br><b>Esta reunión es de ' + U.esc(r.organizadorNombre) + '.</b>' : ''),
      opciones: opciones,
      botones: [{ texto: 'No, mantener', valor: false }, { texto: 'Sí, cancelar', valor: true, clase: 'btn-peligro' }],
    }).then(function (res) {
      if (!res.boton) return false;
      cargando(true);
      return estado.api.cancelar(r.id, '', res.opcion || 'una').then(function (x) {
        cargando(false);
        delete estado.cache[r.id];
        invalidar();
        dibujar(true);
        aviso(x.canceladas > 1 ? 'Se cancelaron ' + x.canceladas + ' reuniones de la serie' : 'Reserva cancelada');
        return true;
      }).catch(function (e) {
        cargando(false);
        aviso(e.message);
        return false;
      });
    });
  }

  // ======================================================================
  // Mover (arrastrar) con deshacer
  // ======================================================================
  function moverReserva(r, destino) {
    var original = { id: r.id, inicio: r.inicio, fin: r.fin, salaId: r.salaId };
    var cambio = { id: r.id, inicio: destino.inicio.toISOString(), fin: destino.fin.toISOString(), salaId: destino.salaId };
    cargando(true);
    estado.api.actualizar(cambio).then(function (nueva) {
      cargando(false);
      estado.cache[nueva.id] = nueva;
      invalidar();
      dibujar(true);
      var s = salaPorId(nueva.salaId);
      aviso('Movida a ' + U.relativa(new Date(nueva.inicio)) + ', ' + U.rangoHoras(new Date(nueva.inicio), new Date(nueva.fin), C.FORMATO_24H) +
        (destino.salaId !== original.salaId ? ' · ' + s.nombre : '') + (r.serieId ? ' (solo esta fecha)' : ''), 'Deshacer', function () {
        estado.api.actualizar(original).then(function (x) { estado.cache[x.id] = x; invalidar(); dibujar(true); aviso('Cambio deshecho'); })
          .catch(function (e) { aviso(e.message); });
      });
    }).catch(function (e) {
      cargando(false);
      aviso(e.detalles && e.detalles.length ? e.detalles[0] : e.message);
      dibujar(true);
    });
  }

  // ======================================================================
  // Copiar y pegar
  // ======================================================================
  function copiar(r) {
    if (r.oculta) { aviso('Es una reunión privada: no se puede copiar.'); return; }
    var s = salaPorId(r.salaId);
    estado.portapapeles = {
      titulo: r.titulo, salaId: r.salaId, asistentes: r.asistentes, invitados: (r.invitados || []).slice(),
      descripcion: r.descripcion || '', duracionMin: Math.round((new Date(r.fin) - new Date(r.inicio)) / 60000),
      inicioMin: U.minutosDelDia(new Date(r.inicio)), color: s ? s.color : '#039be5', privada: !!r.privada,
    };
    U.sesion.guardar('rs_portapapeles', JSON.stringify(estado.portapapeles));
    entrarAPegar();
  }

  function entrarAPegar() {
    if (!estado.portapapeles) return;
    if (estado.pagina !== 'calendario') irPagina('calendario');
    if (estado.vista === 'agenda') estado.vista = 'semana';
    estado.pegando = true;
    U.$('#app').classList.add('modo-pegar');
    U.$('#banner-pegar-texto').innerHTML = 'Copiaste <b>«' + U.esc(estado.portapapeles.titulo) + '»</b> (' +
      U.duracionTexto(estado.portapapeles.duracionMin) + '). Haz clic en el calendario donde quieras pegarla.';
    U.$('#banner-pegar').hidden = false;
    dibujar(true);
  }

  function salirDePegar() {
    if (!estado.pegando) return;
    estado.pegando = false;
    U.$('#app').classList.remove('modo-pegar');
    U.$('#banner-pegar').hidden = true;
    if (estado.pagina === 'calendario') dibujar(true);
  }

  function pegarEn(o) {
    var c = estado.portapapeles;
    if (!c) return;
    var ini = o.inicioMin === null || o.inicioMin === undefined ? c.inicioMin : o.inicioMin;
    salirDePegar();
    Editor.abrir({
      modo: 'pegar', fecha: o.fecha, inicioMin: ini, finMin: Math.min(ini + c.duracionMin, 1440),
      salaId: o.salaId || c.salaId, titulo: c.titulo, asistentes: c.asistentes, invitados: c.invitados, descripcion: c.descripcion,
      privada: c.privada,
    });
  }

  // ======================================================================
  // Avisos y ayudas
  // ======================================================================
  var temporizadorAviso = null;
  function aviso(texto, accion, alAccion) {
    var s = U.$('#snackbar');
    s.innerHTML = '<span>' + U.esc(texto) + '</span><button class="btn btn-texto">' + U.esc(accion || '') + '</button>' +
      '<button class="btn-icono" aria-label="Cerrar" style="color:inherit"><span class="ms">close</span></button>';
    s.hidden = false;
    var botones = s.querySelectorAll('button');
    botones[0].onclick = function () { s.hidden = true; if (alAccion) alAccion(); };
    botones[1].onclick = function () { s.hidden = true; };
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { s.hidden = true; }, accion ? 9000 : 5000);
  }

  // Globos de ayuda para cualquier elemento con data-tip
  (function () {
    var tip = U.$('#tip'), objetivo = null, t = null;
    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el === objetivo) return;
      objetivo = el;
      clearTimeout(t);
      tip.hidden = true;
      if (!el || e.pointerType === 'touch') return;
      t = setTimeout(function () {
        tip.textContent = el.getAttribute('data-tip');
        tip.hidden = false;
        var r = el.getBoundingClientRect();
        var w = tip.offsetWidth, h = tip.offsetHeight;
        var top = r.bottom + 8;
        if (top + h > window.innerHeight - 8) top = r.top - h - 8;
        tip.style.top = top + 'px';
        tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      }, 350);
    });
    document.addEventListener('pointerdown', function () { clearTimeout(t); tip.hidden = true; });
  })();

  // ======================================================================
  // Asistente
  // ======================================================================
  /**
   * Personas conocidas (para que el asistente entienda «invita a María»): organizadores vistos
   * en el calendario, acumulados en este navegador. No incluye reuniones privadas ocultas.
   */
  function directorio() {
    var guardado = U.almacen.leer('rs_directorio') || {};
    var cambio = false;
    Object.keys(estado.cache).forEach(function (k) {
      var r = estado.cache[k];
      if (!r.oculta && r.organizadorEmail && r.organizadorNombre && guardado[r.organizadorEmail] !== r.organizadorNombre) {
        guardado[r.organizadorEmail] = r.organizadorNombre;
        cambio = true;
      }
    });
    if (cambio) U.almacen.guardar('rs_directorio', guardado);
    var yo = estado.usuario ? estado.usuario.email : '';
    return Object.keys(guardado).filter(function (e) { return e !== yo; }).map(function (e) { return { email: e, nombre: guardado[e] }; });
  }

  function contextoAsistente() {
    return {
      api: function () { return estado.api; },
      usuario: function () { return estado.usuario; },
      salas: function () { return estado.salas.filter(function (s) { return s.activa; }); },
      config: function () { return estado.config; },
      partes: estado.partes,
      formato24: !!C.FORMATO_24H,
      demo: MODO_DEMO,
      obtenerReservas: obtenerReservas,
      alCambiar: function (r) { if (r) estado.cache[r.id] = r; invalidar(); dibujar(true); },
      abrirEditor: function (d) { Editor.abrir(d); },
      directorio: directorio,
      irA: function (fecha, vista) { irA(fecha, vista || 'dia'); if (window.innerWidth <= 900) alternarAsistente(false); },
      verReserva: function (r) {
        estado.cache[r.id] = r;
        irA(new Date(r.inicio), 'dia');
        if (window.innerWidth <= 900) alternarAsistente(false);
        setTimeout(function () {
          var el = document.querySelector('.evento[data-id="' + r.id + '"]');
          if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); abrirPopover(r.id, el); }
        }, 450);
      },
    };
  }

  function alternarAsistente(forzar) {
    var panel = U.$('#asistente');
    var abrir = forzar === undefined ? panel.hidden : forzar;
    panel.hidden = !abrir;
    U.$('#app').classList.toggle('con-asistente', abrir);
    U.$('#btn-asistente').setAttribute('aria-pressed', String(abrir));
    if (abrir) setTimeout(function () { U.$('#asistente-texto').focus(); }, 50);
    if (estado.pagina === 'calendario' && estado.vista !== 'mes') setTimeout(function () { dibujar(true); }, 0);
  }

  // ======================================================================
  // Barra lateral móvil
  // ======================================================================
  function alternarLateral() {
    var app = U.$('#app');
    if (window.innerWidth <= 900) {
      var abierto = !app.classList.contains('lateral-abierto');
      app.classList.toggle('lateral-abierto', abierto);
      app.classList.remove('sin-lateral');
      U.$('#velo-lateral').hidden = !abierto;
    } else {
      app.classList.toggle('sin-lateral');
      setTimeout(function () { dibujar(true); }, 220);
    }
  }
  function cerrarLateralMovil() {
    if (window.innerWidth > 900) return;
    U.$('#app').classList.remove('lateral-abierto');
    U.$('#velo-lateral').hidden = true;
  }

  function crearAhora() {
    cerrarLateralMovil();
    Editor.abrir({ fecha: estado.fecha < U.inicioDia(new Date()) || estado.pagina !== 'calendario' ? new Date() : estado.fecha });
  }

  // ======================================================================
  // Eventos globales
  // ======================================================================
  function conectar() {
    U.$('#btn-hoy').addEventListener('click', function () { irA(new Date()); });
    U.$('#btn-anterior').addEventListener('click', function () { mover(-1); });
    U.$('#btn-siguiente').addEventListener('click', function () { mover(1); });
    U.$('#marca').addEventListener('click', function (e) {
      e.preventDefault();
      if (Huevos.clicLogo()) return;
      if (estado.pagina !== 'calendario') irPagina('calendario'); else irA(new Date());
    });
    U.$$('.vistas button').forEach(function (b) { b.addEventListener('click', function () { irA(estado.fecha, b.dataset.vista); }); });
    U.$$('.nav-lateral a').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); irPagina(a.dataset.pagina); });
    });
    window.addEventListener('hashchange', function () { if (estado.usuario) leerRuta(); });
    U.$('#btn-crear').addEventListener('click', crearAhora);
    U.$('#btn-menu').addEventListener('click', alternarLateral);
    U.$('#velo-lateral').addEventListener('click', cerrarLateralMovil);
    U.$('#btn-cuenta').addEventListener('click', function (e) { e.stopPropagation(); abrirMenuCuenta(); });
    U.$('#btn-asistente').addEventListener('click', function () { alternarAsistente(); });
    U.$('#asistente-cerrar').addEventListener('click', function () { alternarAsistente(false); });
    U.$('#solo-mias').addEventListener('change', function (e) { estado.soloMias = e.target.checked; guardarPreferencias(); dibujar(true); });
    U.$('#btn-entrar-demo').addEventListener('click', function () { entrar(); });
    U.$('#banner-pegar-salir').addEventListener('click', salirDePegar);

    var fab = U.el('<button class="fab-crear" aria-label="Crear reserva"><span class="ms">add</span></button>');
    fab.addEventListener('click', crearAhora);
    U.$('#app').appendChild(fab);

    document.addEventListener('click', function (e) {
      var p = U.$('#popover');
      if (!p.hidden && !p.contains(e.target) && !e.target.closest('.evento, .chip-ev, .agenda-ev, .item-mini, .fila-reserva, dialog')) cerrarPopover();
      var m = U.$('#menu-cuenta');
      if (!m.hidden && !m.contains(e.target)) m.hidden = true;
    });

    document.addEventListener('keydown', function (e) {
      if (U.$('#app').hidden) return;
      var t = e.target;
      var escribiendo = t.closest('input, textarea, select, dialog[open], [contenteditable]');
      if (e.key === 'Escape') {
        if (estado.pegando) { salirDePegar(); return; }
        cerrarPopover(); U.$('#menu-cuenta').hidden = true; cerrarLateralMovil(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        Ayuda.abrirBuscador();
        return;
      }
      if (escribiendo) return;
      if (e.key === '?') { e.preventDefault(); Ayuda.mostrarAyuda(); return; }
      if (Huevos.enSecuencia() && /^[ab]$/i.test(e.key)) return;
      // Copiar / pegar reuniones
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        var tecla = e.key.toLowerCase();
        if (tecla === 'c' && estado.seleccionada && estado.cache[estado.seleccionada] && !estado.cache[estado.seleccionada].oculta) {
          e.preventDefault();
          var r = estado.cache[estado.seleccionada];
          cerrarPopover();
          copiar(r);
          return;
        }
        if (tecla === 'v' && estado.portapapeles && estado.pagina === 'calendario') {
          e.preventDefault();
          if (estado.posicion) pegarEn({ fecha: estado.posicion.fecha, inicioMin: estado.posicion.minuto, salaId: estado.posicion.salaId });
          else entrarAPegar();
          return;
        }
        return;
      }
      if (e.altKey) return;
      var acciones = {
        t: function () { irA(new Date()); }, d: function () { irA(estado.fecha, 'dia'); }, w: function () { irA(estado.fecha, 'semana'); },
        m: function () { irA(estado.fecha, 'mes'); }, a: function () { irA(estado.fecha, 'agenda'); },
        c: crearAhora,
        n: function () { if (estado.pagina === 'calendario') mover(1); }, j: function () { if (estado.pagina === 'calendario') mover(1); },
        p: function () { if (estado.pagina === 'calendario') mover(-1); }, k: function () { if (estado.pagina === 'calendario') mover(-1); },
        '/': function () { alternarAsistente(true); },
      };
      var fn = acciones[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    });

    var anchoPrevio = window.innerWidth;
    window.addEventListener('resize', function () {
      cerrarPopover();
      if ((anchoPrevio > 900) !== (window.innerWidth > 900)) {
        U.$('#app').classList.remove('lateral-abierto', 'sin-lateral');
        U.$('#velo-lateral').hidden = true;
      }
      anchoPrevio = window.innerWidth;
    });

    // Reloj: línea roja cada minuto, recarga de datos cada 5 minutos o al volver a la pestaña
    var minutos = 0;
    setInterval(function () {
      if (!estado.usuario || estado.pagina !== 'calendario') return;
      minutos++;
      Calendario.actualizarLineaAhora(U.$('#principal'));
      if (minutos % 5 === 0 && !document.querySelector('dialog[open]') && !estado.pegando) { invalidar(); dibujar(true); } else pintarEstadoAhora();
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && estado.usuario && !document.querySelector('dialog[open]') && !estado.pegando && estado.pagina === 'calendario') {
        invalidar(); dibujar(true);
      }
    });
  }

  // ======================================================================
  // API para los demás módulos
  // ======================================================================
  window.App = {
    C: C,
    estado: estado,
    demo: MODO_DEMO,
    api: function () { return estado.api; },
    esAdmin: esAdmin,
    obtenerReservas: obtenerReservas,
    invalidar: invalidar,
    dibujar: dibujar,
    irA: irA,
    irPagina: irPagina,
    aviso: aviso,
    cargando: cargando,
    confirmar: confirmar,
    salaPorId: salaPorId,
    fotoSala: fotoSala,
    estadoSala: estadoSala,
    reservasDeHoy: reservasDeHoy,
    abrirPopover: abrirPopover,
    cancelarReserva: cancelarReserva,
    copiar: copiar,
    descargar: descargar,
    puedeMover: puedeMover,
    recargarSalas: function () {
      return estado.api.iniciar().then(function (d) { estado.salas = d.salas; pintarSalas(); });
    },
    abrirAsistente: function () { alternarAsistente(true); },
    alternarTema: alternarTema,
    htmlLetra: htmlLetra,
    conectarLetra: conectarLetra,
    alReservar: function (r) { Huevos.alReservar(r); },
  };

  // ======================================================================
  // Arranque
  // ======================================================================
  function arrancar() {
    var tema = U.almacen.leer('rs_tema');
    if (tema) document.documentElement.dataset.tema = tema;
    ponerMarca(U.almacen.leer('rs_marca') || C.COLOR_MARCA || 'verde');
    ponerLetra(U.almacen.leer('rs_letra') || 'normal');
    Epocas.aplicar();
    U.$$('[data-nombre-app]').forEach(function (e) { e.textContent = C.NOMBRE_APP || 'Reserva de Salas'; });
    document.title = C.NOMBRE_APP || 'Reserva de Salas';
    try { estado.portapapeles = JSON.parse(U.sesion.leer('rs_portapapeles') || 'null'); } catch (e) { /* nada */ }
    conectar();
    Editor.iniciar();
    Ayuda.iniciar();
    Huevos.iniciar();

    var params = new URLSearchParams(location.search);
    if (MODO_DEMO) {
      if (params.has('demo') || U.sesion.leer('rs_demo')) return entrar();
      return mostrarAcceso();
    }
    var guardado = U.sesion.leer(CLAVE_TOKEN);
    if (guardado && leerToken(guardado)) {
      alRecibirCredencial(guardado);
      cargarGoogle().catch(function () {});
    } else {
      mostrarAcceso();
    }
  }

  arrancar();
})();
