/**
 * Cliente de la API.
 *  - ApiGoogle: habla con Apps Script (Google Sheets) usando el ID token de Google.
 *  - ApiDemo:   simula el backend en el navegador (modo demostración), con las MISMAS reglas.
 */
var Api = (function () {
  'use strict';

  function ErrorApi(mensaje, codigo, detalles) {
    var e = new Error(mensaje);
    e.codigo = codigo || 'validacion';
    e.detalles = detalles || null;
    return e;
  }

  // ------------------------------------------------------------------ Google
  function ApiGoogle(url, obtenerToken, alExpirarSesion) {
    this.url = url;
    this.obtenerToken = obtenerToken;
    this.alExpirarSesion = alExpirarSesion;
    this.demo = false;
  }
  ApiGoogle.prototype.llamar = function (accion, datos) {
    var self = this;
    return fetch(this.url, {
      method: 'POST',
      // text/plain evita la verificación CORS previa, que Apps Script no soporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: accion, token: this.obtenerToken(), datos: datos || {} }),
      redirect: 'follow',
    })
      .then(function (r) {
        if (!r.ok) throw ErrorApi('El servidor respondió ' + r.status + '. Revisa la URL de la API.', 'red');
        return r.json();
      }, function () {
        throw ErrorApi('No hay conexión con el servidor. Revisa tu internet.', 'red');
      })
      .then(function (j) {
        if (!j.ok) {
          if (j.codigo === 'auth' && self.alExpirarSesion) self.alExpirarSesion(j.error);
          throw ErrorApi(j.error, j.codigo, j.detalles);
        }
        return j.datos;
      });
  };
  var iso = function (d) { return (d instanceof Date ? d : new Date(d)).toISOString(); };
  ApiGoogle.prototype.iniciar = function () { return this.llamar('iniciar'); };
  ApiGoogle.prototype.listar = function (desde, hasta, op) { return this.llamar('listar', Object.assign({ desde: iso(desde), hasta: iso(hasta) }, op || {})); };
  ApiGoogle.prototype.crear = function (d) { return this.llamar('crear', d); };
  ApiGoogle.prototype.actualizar = function (d) { return this.llamar('actualizar', d); };
  ApiGoogle.prototype.cancelar = function (id, motivo, alcance) { return this.llamar('cancelar', { id: id, motivo: motivo || '', alcance: alcance || 'una' }); };
  ApiGoogle.prototype.interpretar = function (texto, contexto) { return this.llamar('interpretar', { texto: texto, contexto: contexto }); };
  ApiGoogle.prototype.reporte = function (desde, hasta) { return this.llamar('reporte', { desde: iso(desde), hasta: iso(hasta) }); };
  ApiGoogle.prototype.guardarSala = function (d) { return this.llamar('guardarSala', d); };
  ApiGoogle.prototype.subirFoto = function (d) { return this.llamar('subirFoto', d); };
  ApiGoogle.prototype.foto = function (id) { return this.llamar('foto', { id: id }); };
  ApiGoogle.prototype.listarUsuarios = function () { return this.llamar('listarUsuarios'); };
  ApiGoogle.prototype.guardarUsuario = function (d) { return this.llamar('guardarUsuario', d); };
  ApiGoogle.prototype.guardarEpoca = function (epoca) { return this.llamar('guardarEpoca', { epoca: epoca }); };
  ApiGoogle.prototype.latido = function (d) { return this.llamar('latido', d); };
  ApiGoogle.prototype.presencia = function () { return this.llamar('presencia'); };

  // -------------------------------------------------------------------- Demo
  var CLAVE = 'reserva-salas-demo-v4';
  var SALAS_BASE = [
    { id: 'S1', nombre: 'Sala Ejecutiva', ubicacion: 'Edificio A · 3er piso', capacidad: 12, equipamiento: 'Pantalla 75", Videoconferencia, Pizarra', apertura: '07:00', cierre: '19:00', color: '#039be5', activa: true, descripcion: 'Sala para juntas directivas con videoconferencia.' },
    { id: 'S2', nombre: 'Sala Creativa', ubicacion: 'Edificio A · 2º piso', capacidad: 8, equipamiento: 'Pizarra, TV, Post-its', apertura: '07:00', cierre: '19:00', color: '#33b679', activa: true, descripcion: 'Espacio informal para lluvias de ideas.' },
    { id: 'S3', nombre: 'Sala de Capacitación', ubicacion: 'Edificio B · planta baja', capacidad: 30, equipamiento: 'Proyector, Micrófono', apertura: '07:00', cierre: '19:00', color: '#f6bf26', activa: true, descripcion: '' },
    { id: 'S4', nombre: 'Cabina 1', ubicacion: 'Edificio A · 2º piso', capacidad: 2, equipamiento: 'Monitor, Cámara web', apertura: '07:00', cierre: '19:00', color: '#8e24aa', activa: true, descripcion: 'Para llamadas privadas.' },
    { id: 'S5', nombre: 'Auditorio', ubicacion: 'Edificio C', capacidad: 80, equipamiento: 'Proyector, Sonido, Escenario', apertura: '07:00', cierre: '21:00', color: '#e67c73', activa: true, descripcion: '' },
  ];
  var GENTE = [
    ['alex.rivera@demo.com', 'Alex Rivera'], ['maria.lopez@demo.com', 'María López'], ['carlos.ruiz@demo.com', 'Carlos Ruiz'],
    ['ana.martinez@demo.com', 'Ana Martínez'], ['jorge.hernandez@demo.com', 'Jorge Hernández'], ['sofia.castro@demo.com', 'Sofía Castro'],
  ];
  var TITULOS = ['Reunión de equipo', 'Revisión de presupuesto', 'Entrevista', 'Llamada con cliente', 'Planificación', 'Taller de UX',
    'Comité de dirección', 'Seguimiento de proyecto', 'Capacitación', 'Demo de producto', 'Retrospectiva', 'Lluvia de ideas',
    'Reunión con proveedores', 'Inducción', 'Revisión de contrato'];

  function aleatorio(semilla) {
    var s = semilla;
    return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  function semilla() {
    var lunes = U.inicioSemana(new Date());
    var azar = aleatorio(Number(U.claveDia(lunes).replace(/-/g, '')));
    var ahora = new Date();
    var lista = [];
    var n = 1;
    function agregar(dia, salaId, hi, hf, titulo, org, asistentes, extra) {
      var ini = U.combinar(dia, hi), fin = U.combinar(dia, hf);
      var choque = lista.some(function (r) { return r.salaId === salaId && r.estado === 'confirmada' && Reglas.seCruzan(ini, fin, r.inicio, r.fin); });
      if (choque) return null;
      var r = Object.assign({
        id: 'D' + n++, salaId: salaId, titulo: titulo, descripcion: org === 0 ? 'Agenda compartida por correo.' : '',
        inicio: ini.toISOString(), fin: fin.toISOString(), asistentes: asistentes, invitados: [],
        organizadorEmail: GENTE[org][0], organizadorNombre: GENTE[org][1], estado: 'confirmada', enCalendar: true,
        serieId: '', recurrencia: '', creada: new Date(ini.getTime() - 3 * 86400000).toISOString(),
      }, extra || {});
      lista.push(r);
      return r;
    }
    // Serie semanal del comité (lunes 9:00) durante 10 semanas
    var textoSerie = 'Cada semana el lunes · 10 veces';
    for (var w = -7; w <= 2; w++) {
      agregar(U.claveDia(U.sumarDias(lunes, w * 7)), 'S1', '09:00', '10:30', 'Comité de dirección', 1, 9, { serieId: 'SR-COMITE', recurrencia: textoSerie });
    }
    // Daily de tu equipo (Alex) en la Sala Creativa, días hábiles
    for (var d0 = -14; d0 <= 11; d0++) {
      var dDaily = U.sumarDias(lunes, d0);
      if (dDaily.getDay() === 0 || dDaily.getDay() === 6) continue;
      agregar(U.claveDia(dDaily), 'S2', '08:30', '08:45', 'Daily del equipo', 0, 6, { serieId: 'SR-DAILY', recurrencia: 'Todos los días hábiles (lunes a viernes) · 20 veces' });
    }
    // Reuniones privadas: solo el organizador, los invitados y los administradores ven los datos
    var dPriv = function (n) { return U.claveDia(U.sumarDias(lunes, n)); };
    agregar(dPriv(1), 'S4', '16:00', '16:30', '1:1 con Sofía', 0, 2,
      { privada: true, invitados: [GENTE[5][0]], descripcion: 'Conversación sobre su plan de carrera.' });
    agregar(dPriv(2), 'S4', '10:00', '11:00', 'Entrevista confidencial', 1, 2,
      { privada: true, invitados: [GENTE[0][0]], descripcion: 'Candidata a gerencia. Llevar el perfil impreso.' });
    agregar(dPriv(3), 'S1', '14:00', '15:00', 'Revisión salarial', 4, 3,
      { privada: true, invitados: [GENTE[3][0]], descripcion: 'Ajustes del próximo año.' });
    agregar(dPriv(10), 'S1', '11:00', '12:00', 'Negociación con proveedor', 2, 4, { privada: true });

    // Historial y próximas semanas al azar
    var salas = ['S1', 'S2', 'S3', 'S4', 'S5'];
    for (var dia = -56; dia <= 18; dia++) {
      var fecha = U.sumarDias(lunes, dia);
      if (fecha.getDay() === 0 || fecha.getDay() === 6) continue;
      var clave = U.claveDia(fecha);
      salas.forEach(function (s) {
        var cuantas = Math.floor(azar() * (s === 'S5' ? 1.6 : s === 'S4' ? 3.4 : 3));
        for (var k = 0; k < cuantas; k++) {
          var hora = 8 + Math.floor(azar() * 9);
          var dur = s === 'S4' ? 0.5 : [1, 1, 1.5, 2, 0.5][Math.floor(azar() * 5)];
          if (s === 'S3' && azar() > 0.6) dur = 3;
          var hi = U.minutosAHhmm(hora * 60), hf = U.minutosAHhmm(Math.min(hora * 60 + dur * 60, 18 * 60 + 30));
          var org = Math.floor(azar() * GENTE.length);
          var cap = { S1: 12, S2: 8, S3: 30, S4: 2, S5: 80 }[s];
          var r = agregar(clave, s, hi, hf, TITULOS[Math.floor(azar() * TITULOS.length)], org, Math.max(1, Math.round(cap * (0.3 + azar() * 0.7))));
          if (r && azar() < 0.08 && new Date(r.fin) > U.sumarDias(ahora, -60)) {
            r.estado = 'cancelada';
            r.motivoCancelacion = ['Se pospuso', 'Cliente canceló', 'Cambio de agenda'][Math.floor(azar() * 3)];
          }
        }
      });
    }
    return lista;
  }

  function ApiDemo(zonaHoraria) {
    this.demo = true;
    this.partes = Reglas.partesIntl(zonaHoraria);
    var guardado = U.almacen.leer(CLAVE);
    var lunes = U.claveDia(U.inicioSemana(new Date()));
    if (guardado && guardado.semana === lunes) {
      this.reservas = guardado.reservas;
      this.salas = guardado.salas;
      this.usuarios = guardado.usuarios;
      this.rol = guardado.rol || 'admin';
      this.epoca = guardado.epoca || '';
    } else {
      this.reservas = semilla();
      this.salas = JSON.parse(JSON.stringify(SALAS_BASE));
      this.usuarios = GENTE.map(function (g, i) {
        return { email: g[0], nombre: g[1], foto: '', rol: i === 0 ? 'admin' : 'usuario', activo: true, ultimoAcceso: new Date(Date.now() - i * 7200000).toISOString() };
      });
      this.rol = 'admin';
    }
    this.guardar();
  }
  ApiDemo.prototype.yo = function () {
    return { email: GENTE[0][0], nombre: GENTE[0][1], foto: '', rol: this.rol };
  };
  ApiDemo.prototype.guardar = function () {
    U.almacen.guardar(CLAVE, {
      semana: U.claveDia(U.inicioSemana(new Date())), reservas: this.reservas, salas: this.salas, usuarios: this.usuarios, rol: this.rol,
      epoca: this.epoca || '',
    });
  };
  ApiDemo.prototype.espera = function (valor) {
    return new Promise(function (ok) { setTimeout(function () { ok(JSON.parse(JSON.stringify(valor))); }, 160); });
  };
  ApiDemo.prototype.fallo = function (mensaje, codigo, detalles) {
    return new Promise(function (_, mal) { setTimeout(function () { mal(ErrorApi(mensaje, codigo || 'validacion', detalles)); }, 160); });
  };
  // Igual que reservaPublica_ en Code.gs: lo privado se oculta antes de entregarlo
  ApiDemo.prototype.publica = function (r) {
    var yo = this.yo();
    var propia = Reglas.puedeModificar(r, yo);
    var conDetalles = Reglas.puedeVerDetalles(r, yo);
    if (r.privada && !conDetalles) return Reglas.versionOculta(r);
    var copia = Object.assign({}, r, { puedeEditar: propia, privada: !!r.privada });
    if (!conDetalles) { copia.descripcion = ''; copia.invitados = []; }
    if (!propia) copia.motivoCancelacion = '';
    return copia;
  };
  ApiDemo.prototype.iniciar = function () {
    return this.espera({
      usuario: this.yo(),
      salas: this.salas.filter(function (s) { return s.activa; }).concat(this.rol === 'admin' ? this.salas.filter(function (s) { return !s.activa; }) : []),
      config: {
        NOMBRE_ORGANIZACION: (window.APP_CONFIG && APP_CONFIG.NOMBRE_ORGANIZACION) || 'Demostración',
        DURACION_MINIMA_MIN: 15, DURACION_MAXIMA_MIN: 480, DIAS_ANTICIPACION_MAX: 90,
        PERMITIR_FINES_DE_SEMANA: false, SINCRONIZAR_CALENDAR: true, IA_DISPONIBLE: false,
        EPOCA: this.epoca || (window.APP_CONFIG && APP_CONFIG.EPOCA) || 'auto',
      },
      version: 'demo',
    });
  };
  ApiDemo.prototype.listar = function (desde, hasta, op) {
    op = op || {};
    var self = this, yo = this.yo();
    return this.espera(this.reservas.filter(function (r) {
      if (r.estado !== 'confirmada' && !(op.incluirCanceladas && op.soloMias)) return false;
      if (op.soloMias && r.organizadorEmail !== yo.email) return false;
      return Reglas.seCruzan(desde, hasta, r.inicio, r.fin);
    }).map(function (r) { return self.publica(r); }));
  };
  ApiDemo.prototype.validar = function (r, original, extra) {
    return Reglas.validar(r, {
      salas: this.salas, reservas: this.reservas.concat(extra || []), ahora: new Date(), partes: this.partes,
      config: { PERMITIR_FINES_DE_SEMANA: false }, original: original,
    });
  };
  ApiDemo.prototype.crear = function (d) {
    var yo = this.yo(), self = this;
    var base = {
      salaId: d.salaId, titulo: String(d.titulo || '').trim(), descripcion: d.descripcion || '', asistentes: Number(d.asistentes || 1),
      invitados: d.invitados || [], organizadorEmail: yo.email, organizadorNombre: yo.nombre, estado: 'confirmada', enCalendar: true,
      privada: !!d.privada,
    };
    var ocurrencias = Recurrencia.expandir(d.inicio, d.fin, d.recurrencia);
    var esSerie = ocurrencias.length > 1;
    var serieId = esSerie ? 'SR' + Date.now().toString(36) : '';
    var texto = esSerie ? Recurrencia.describir(d.recurrencia, d.inicio) : '';
    var aceptadas = [], conflictos = [];
    ocurrencias.forEach(function (o, i) {
      var r = Object.assign({}, base, {
        id: 'D' + Date.now().toString(36) + i, inicio: o.inicio.toISOString(), fin: o.fin.toISOString(),
        serieId: serieId, recurrencia: texto, creada: new Date().toISOString(),
      });
      var errores = self.validar(r, null, aceptadas);
      if (errores.length) conflictos.push({ inicio: r.inicio, motivo: errores[0], errores: errores });
      else aceptadas.push(r);
    });
    if (!esSerie && conflictos.length) return this.fallo(conflictos[0].errores.join(' '), 'validacion', conflictos[0].errores);
    var resumen = conflictos.map(function (c) { return { inicio: c.inicio, motivo: c.motivo }; });
    if (!aceptadas.length) return this.fallo('Ninguna de las ' + ocurrencias.length + ' fechas está disponible.', 'conflictos_serie', { total: ocurrencias.length, disponibles: 0, conflictos: resumen });
    if (conflictos.length && !d.omitirConflictos) {
      return this.fallo(conflictos.length + ' de ' + ocurrencias.length + ' fechas no están disponibles.', 'conflictos_serie',
        { total: ocurrencias.length, disponibles: aceptadas.length, conflictos: resumen });
    }
    this.reservas = this.reservas.concat(aceptadas);
    this.guardar();
    var primera = this.publica(aceptadas[0]);
    primera.serie = { creadas: aceptadas.length, omitidas: conflictos.length };
    return this.espera(primera);
  };
  ApiDemo.prototype.actualizar = function (d) {
    var yo = this.yo();
    var original = this.reservas.filter(function (x) { return x.id === d.id; })[0];
    if (!original) return this.fallo('La reserva no existe.');
    if (!Reglas.puedeModificar(original, yo)) return this.fallo('Solo el organizador o un administrador puede modificar esta reserva.', 'prohibido');
    if (new Date(original.fin) <= new Date()) return this.fallo('La reunión ya terminó; no se puede modificar.');
    if (new Date(original.inicio) <= new Date() && yo.rol !== 'admin') return this.fallo('La reunión ya empezó; solo un administrador puede modificarla.');
    var cambios = {};
    ['salaId', 'titulo', 'descripcion', 'inicio', 'fin', 'asistentes', 'invitados', 'privada'].forEach(function (k) { if (d[k] !== undefined) cambios[k] = d[k]; });
    var cambiada = Object.assign({}, original, cambios);
    var errores = this.validar(cambiada, original);
    if (errores.length) return this.fallo(errores.join(' '), 'validacion', errores);
    Object.assign(original, cambiada);
    this.guardar();
    return this.espera(this.publica(original));
  };
  ApiDemo.prototype.cancelar = function (id, motivo, alcance) {
    var yo = this.yo();
    var r = this.reservas.filter(function (x) { return x.id === id; })[0];
    if (!r) return this.fallo('La reserva no existe.');
    if (!Reglas.puedeModificar(r, yo)) return this.fallo('Solo el organizador o un administrador puede cancelar esta reserva.', 'prohibido');
    if (r.estado !== 'confirmada') return this.fallo('Esta reserva ya estaba cancelada.');
    var objetivo = [r];
    if (alcance === 'serie' && r.serieId) {
      objetivo = this.reservas.filter(function (x) {
        return x.serieId === r.serieId && x.estado === 'confirmada' && new Date(x.inicio) >= new Date(r.inicio) && Reglas.puedeModificar(x, yo);
      });
    }
    objetivo.forEach(function (x) { x.estado = 'cancelada'; x.motivoCancelacion = motivo || ''; x.canceladaPor = yo.email; });
    this.guardar();
    return this.espera({ id: id, estado: 'cancelada', canceladas: objetivo.length });
  };
  ApiDemo.prototype.interpretar = function () { return this.espera({ disponible: false }); };

  // --- Administración (demo) ---
  ApiDemo.prototype.esAdmin = function () { return this.rol === 'admin'; };
  ApiDemo.prototype.reporte = function (desde, hasta) {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    var lista = this.reservas.filter(function (r) { return Reglas.seCruzan(desde, hasta, r.inicio, r.fin); })
      .sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); });
    var self = this;
    return this.espera({ reservas: lista.map(function (r) { return self.publica(r); }), salas: this.salas, generado: new Date().toISOString() });
  };
  ApiDemo.prototype.guardarSala = function (d) {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    var errores = [];
    var nombre = String(d.nombre || '').trim();
    if (!nombre) errores.push('Escribe un nombre de sala.');
    if (!(Number(d.capacidad) >= 1)) errores.push('La capacidad debe ser un número mayor que cero.');
    if (Reglas.aMinutos(d.cierre) <= Reglas.aMinutos(d.apertura)) errores.push('La hora de cierre debe ser posterior a la de apertura.');
    var repetido = this.salas.some(function (s) { return s.nombre.toLowerCase() === nombre.toLowerCase() && s.id !== d.id; });
    if (repetido) errores.push('Ya existe una sala con ese nombre.');
    if (errores.length) return this.fallo(errores.join(' '), 'validacion', errores);
    var datos = {
      nombre: nombre, ubicacion: d.ubicacion || '', capacidad: Number(d.capacidad), equipamiento: d.equipamiento || '',
      apertura: d.apertura, cierre: d.cierre, color: d.color || '#039be5', activa: d.activa !== false, descripcion: d.descripcion || '', foto: d.foto || '',
    };
    var sala;
    if (d.id) {
      sala = this.salas.filter(function (s) { return s.id === d.id; })[0];
      Object.assign(sala, datos);
    } else {
      var num = Math.max.apply(null, [0].concat(this.salas.map(function (s) { return Number(s.id.replace(/\D/g, '')) || 0; })));
      sala = Object.assign({ id: 'S' + (num + 1) }, datos);
      this.salas.push(sala);
    }
    this.guardar();
    return this.espera(sala);
  };
  ApiDemo.prototype.subirFoto = function (d) {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    return this.espera({ id: 'demo', url: 'data:' + d.tipo + ';base64,' + d.base64 });
  };
  ApiDemo.prototype.foto = function () { return this.fallo('Foto no disponible'); };
  ApiDemo.prototype.listarUsuarios = function () {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    var reservas = this.reservas, ahora = new Date(), inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    return this.espera(this.usuarios.map(function (u) {
      var suyas = reservas.filter(function (r) { return r.organizadorEmail === u.email && r.estado === 'confirmada'; });
      return Object.assign({}, u, {
        reservasMes: suyas.filter(function (r) { return new Date(r.inicio) >= inicioMes; }).length,
        proximas: suyas.filter(function (r) { return new Date(r.inicio) > ahora; }).length,
      });
    }));
  };
  // En la demo la época «de la organización» se guarda en este navegador
  ApiDemo.prototype.guardarEpoca = function (epoca) {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    this.epoca = epoca;
    this.guardar();
    return this.espera({ epoca: epoca });
  };
  ApiDemo.prototype.guardarUsuario = function (d) {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    if (d.email === this.yo().email && (d.rol === 'usuario' || d.activo === false)) {
      return this.fallo('No puedes quitarte a ti mismo el rol de administrador ni desactivarte.');
    }
    var u = this.usuarios.filter(function (x) { return x.email === d.email; })[0];
    if (!u) return this.fallo('El usuario no existe.');
    if (d.rol) u.rol = d.rol;
    if (typeof d.activo === 'boolean') u.activo = d.activo;
    this.guardar();
    return this.espera(u);
  };
  // Presencia simulada: algunas personas "conectadas" para mostrar cómo se ve
  ApiDemo.prototype.presenciaDemo = function (datos) {
    var ahora = Date.now(), yo = this.yo();
    this.miPagina = (datos && datos.pagina) || this.miPagina || 'calendario';
    var otros = [
      [GENTE[1], 'calendario', 'computadora', 40 * 1000, 52 * 60000],
      [GENTE[2], 'panel', 'movil', 75 * 1000, 18 * 60000],
      [GENTE[5], 'salas', 'computadora', 20 * 1000, 6 * 60000],
      [GENTE[3], 'calendario', 'movil', 9 * 60000, 40 * 60000],
    ];
    var lista = [{ email: yo.email, nombre: yo.nombre, foto: '', rol: yo.rol, pagina: this.miPagina, dispositivo: window.innerWidth < 640 ? 'movil' : 'computadora', desde: ahora - 25 * 60000, ts: ahora, enLinea: true }]
      .concat(otros.map(function (o) {
        return { email: o[0][0], nombre: o[0][1], foto: '', rol: 'usuario', pagina: o[1], dispositivo: o[2], desde: ahora - o[4], ts: ahora - o[3], enLinea: o[3] < 3 * 60000 };
      }));
    return lista;
  };
  ApiDemo.prototype.latido = function (d) {
    if (!this.esAdmin()) { this.miPagina = d && d.pagina; return this.espera({ ok: true }); }
    return this.espera({ ok: true, presencia: this.presenciaDemo(d), ahora: Date.now() });
  };
  ApiDemo.prototype.presencia = function () {
    if (!this.esAdmin()) return this.fallo('Solo los administradores pueden hacer esto.', 'prohibido');
    return this.espera({ presencia: this.presenciaDemo(), ahora: Date.now() });
  };
  // Solo demo: cambiar de rol para probar los permisos
  ApiDemo.prototype.cambiarRol = function () { this.rol = this.rol === 'admin' ? 'usuario' : 'admin'; this.guardar(); };
  ApiDemo.prototype.reiniciar = function () { U.almacen.borrar(CLAVE); var n = new ApiDemo(); Object.assign(this, n); };

  return { ApiGoogle: ApiGoogle, ApiDemo: ApiDemo };
})();
