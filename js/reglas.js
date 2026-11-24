/**
 * Reglas de negocio de las reservas.
 *
 * Este archivo se usa SIN CAMBIOS en tres lugares:
 *   - el navegador  (web/js/reglas.js)     → validación instantánea en pantalla
 *   - Apps Script   (apps-script/Reglas.gs) → validación definitiva en el servidor
 *   - Node          (tests/)                → pruebas automáticas
 * Si lo modificas, copia el contenido a apps-script/Reglas.gs
 * (la prueba "reglas sincronizadas" falla si quedan distintos).
 */
var Reglas = (function () {
  'use strict';

  var PREDETERMINADOS = {
    DURACION_MINIMA_MIN: 15,
    DURACION_MAXIMA_MIN: 480,
    DIAS_ANTICIPACION_MAX: 90,
    PERMITIR_FINES_DE_SEMANA: false,
  };

  var DIAS_SEMANA = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  function config(c) {
    var r = {};
    Object.keys(PREDETERMINADOS).forEach(function (k) {
      r[k] = c && c[k] !== undefined && c[k] !== '' ? c[k] : PREDETERMINADOS[k];
    });
    r.DURACION_MINIMA_MIN = Number(r.DURACION_MINIMA_MIN);
    r.DURACION_MAXIMA_MIN = Number(r.DURACION_MAXIMA_MIN);
    r.DIAS_ANTICIPACION_MAX = Number(r.DIAS_ANTICIPACION_MAX);
    r.PERMITIR_FINES_DE_SEMANA = aBooleano(r.PERMITIR_FINES_DE_SEMANA);
    return r;
  }

  function aBooleano(v) {
    if (typeof v === 'boolean') return v;
    return /^(1|true|si|sí|yes|verdadero)$/i.test(String(v).trim());
  }

  function ms(x) {
    if (x instanceof Date) return x.getTime();
    if (typeof x === 'number') return x;
    return new Date(x).getTime();
  }

  function aMinutos(hhmm) {
    var p = String(hhmm || '0:0').split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  function formatoHora(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function seCruzan(aIni, aFin, bIni, bFin) {
    // Intervalos semiabiertos [inicio, fin): 9-10 y 10-11 NO se cruzan.
    return ms(aIni) < ms(bFin) && ms(aFin) > ms(bIni);
  }

  function minusculas(s) {
    return String(s || '').trim().toLowerCase();
  }

  /** Devuelve una función Date → {fecha:'yyyy-MM-dd', hora:'HH:mm', dia:1..7 (lunes=1)} */
  function partesIntl(zonaHoraria) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    });
    return function (fecha) {
      var o = {};
      f.formatToParts(new Date(ms(fecha))).forEach(function (p) { o[p.type] = p.value; });
      var hora = o.hour === '24' ? '00' : o.hour;
      return { fecha: o.year + '-' + o.month + '-' + o.day, hora: hora + ':' + o.minute, dia: DIAS_SEMANA[o.weekday] };
    };
  }

  function buscarSala(salas, salaId) {
    for (var i = 0; i < salas.length; i++) if (String(salas[i].id) === String(salaId)) return salas[i];
    return null;
  }

  function buscarChoque(salaId, inicio, fin, reservas, excluirId) {
    var choque = null;
    for (var i = 0; i < reservas.length; i++) {
      var r = reservas[i];
      if (r.estado !== 'confirmada' || String(r.salaId) !== String(salaId)) continue;
      if (excluirId && String(r.id) === String(excluirId)) continue;
      if (seCruzan(inicio, fin, r.inicio, r.fin) && (!choque || ms(r.inicio) < ms(choque.inicio))) choque = r;
    }
    return choque;
  }

  /**
   * Valida una reserva nueva o editada.
   * @param {Object} r   {id?, salaId, titulo, inicio, fin, asistentes}
   * @param {Object} ctx {salas, reservas, ahora, config, partes, original?}
   * @return {string[]} lista de errores (vacía si todo está bien)
   */
  function validar(r, ctx) {
    var cfg = config(ctx.config);
    var errores = [];
    var ini = ms(r.inicio), fin = ms(r.fin);

    if (!r.titulo || !String(r.titulo).trim()) errores.push('Escribe un título para la reunión.');
    if (String(r.titulo || '').length > 150) errores.push('El título no puede pasar de 150 caracteres.');
    if (isNaN(ini) || isNaN(fin)) {
      errores.push('La fecha o la hora no son válidas.');
      return errores;
    }
    if (fin <= ini) {
      errores.push('La hora de fin debe ser posterior a la de inicio.');
      return errores;
    }

    var duracion = (fin - ini) / 60000;
    if (duracion < cfg.DURACION_MINIMA_MIN) {
      errores.push('La reunión debe durar al menos ' + cfg.DURACION_MINIMA_MIN + ' minutos.');
    }
    if (duracion > cfg.DURACION_MAXIMA_MIN) {
      errores.push('La reunión no puede durar más de ' + Math.round(cfg.DURACION_MAXIMA_MIN / 60) + ' horas.');
    }

    var pi = ctx.partes(ini), pf = ctx.partes(fin);
    var mismoDia = pi.fecha === pf.fecha;
    if (!mismoDia) errores.push('La reunión debe empezar y terminar el mismo día.');
    if (!cfg.PERMITIR_FINES_DE_SEMANA && pi.dia >= 6) errores.push('No se permiten reservas en sábado ni domingo.');

    // Solo se revisa "ya pasó" si cambió la hora de inicio (así se puede alargar una reunión en curso)
    var inicioCambio = !ctx.original || ms(ctx.original.inicio) !== ini;
    var ahora = ms(ctx.ahora || Date.now());
    if (inicioCambio) {
      if (ini < ahora - 60000) errores.push('Ese horario ya pasó. Elige una hora futura.');
      if (ini > ahora + cfg.DIAS_ANTICIPACION_MAX * 86400000) {
        errores.push('Solo se puede reservar con hasta ' + cfg.DIAS_ANTICIPACION_MAX + ' días de anticipación.');
      }
    }

    var sala = buscarSala(ctx.salas || [], r.salaId);
    if (!sala) {
      errores.push('Elige una sala.');
      return errores;
    }
    if (!aBooleano(sala.activa)) errores.push(sala.nombre + ' no está disponible para reservas.');

    var asistentes = Number(r.asistentes || 1);
    if (!(asistentes >= 1) || Math.floor(asistentes) !== asistentes) {
      errores.push('El número de asistentes debe ser un entero mayor que cero.');
    } else if (asistentes > Number(sala.capacidad)) {
      errores.push(sala.nombre + ' tiene capacidad para ' + sala.capacidad + ' personas.');
    }

    if (!mismoDia || aMinutos(pi.hora) < aMinutos(sala.apertura) || aMinutos(pf.hora) > aMinutos(sala.cierre)) {
      errores.push(sala.nombre + ' solo se puede reservar de ' + sala.apertura + ' a ' + sala.cierre + '.');
    }

    var choque = buscarChoque(r.salaId, ini, fin, ctx.reservas || [], r.id);
    if (choque) {
      errores.push(
        sala.nombre + ' ya está ocupada de ' + ctx.partes(choque.inicio).hora + ' a ' +
        ctx.partes(choque.fin).hora + ' («' + choque.titulo + '»).'
      );
    }
    return errores;
  }

  /** Salas activas, con capacidad, abiertas y libres en ese rango. La más pequeña que sirve va primero. */
  function salasDisponibles(salas, reservas, inicio, fin, asistentes, partes) {
    var pi = partes(inicio), pf = partes(fin);
    return salas
      .filter(function (s) {
        return aBooleano(s.activa) &&
          Number(s.capacidad) >= Number(asistentes || 1) &&
          pi.fecha === pf.fecha &&
          aMinutos(pi.hora) >= aMinutos(s.apertura) &&
          aMinutos(pf.hora) <= aMinutos(s.cierre) &&
          !buscarChoque(s.id, inicio, fin, reservas);
      })
      .sort(function (a, b) { return Number(a.capacidad) - Number(b.capacidad) || String(a.nombre).localeCompare(b.nombre); });
  }

  /**
   * Huecos libres de una sala en un día, a partir de una hora mínima.
   * @param {Function} combinar (fecha 'yyyy-MM-dd', minutos) → timestamp
   * @return {Array<{inicio:number, fin:number}>}
   */
  function huecosLibres(sala, reservas, fecha, combinar, desdeMs, duracionMin) {
    var abre = combinar(fecha, aMinutos(sala.apertura));
    var cierra = combinar(fecha, aMinutos(sala.cierre));
    var cursor = Math.max(abre, desdeMs || abre);
    var resto = cursor % (15 * 60000);
    if (resto) cursor += 15 * 60000 - resto;
    var ocupadas = reservas
      .filter(function (r) {
        return r.estado === 'confirmada' && String(r.salaId) === String(sala.id) && seCruzan(abre, cierra, r.inicio, r.fin);
      })
      .sort(function (a, b) { return ms(a.inicio) - ms(b.inicio); });
    var huecos = [];
    ocupadas.forEach(function (r) {
      if (ms(r.inicio) > cursor) huecos.push({ inicio: cursor, fin: ms(r.inicio) });
      cursor = Math.max(cursor, ms(r.fin));
    });
    if (cursor < cierra) huecos.push({ inicio: cursor, fin: cierra });
    var minimo = (duracionMin || 15) * 60000;
    return huecos.filter(function (h) { return h.fin - h.inicio >= minimo; });
  }

  function puedeModificar(reserva, usuario) {
    if (!usuario) return false;
    return usuario.rol === 'admin' || minusculas(usuario.email) === minusculas(reserva.organizadorEmail);
  }

  /** ¿Es una de las personas invitadas a la reunión? */
  function esInvitado(reserva, usuario) {
    if (!usuario || !usuario.email) return false;
    var yo = minusculas(usuario.email);
    return (reserva.invitados || []).some(function (c) { return minusculas(c) === yo; });
  }

  /** Organizador, administradores e invitados ven todos los detalles. */
  function puedeVerDetalles(reserva, usuario) {
    return puedeModificar(reserva, usuario) || esInvitado(reserva, usuario);
  }

  /**
   * Versión que ven las demás personas de una reserva privada:
   * solo la sala y el horario, para saber que está ocupada.
   */
  function versionOculta(reserva) {
    return {
      id: reserva.id, salaId: reserva.salaId, inicio: reserva.inicio, fin: reserva.fin, estado: reserva.estado,
      titulo: 'Reservada', descripcion: '', invitados: [], asistentes: 0,
      organizadorEmail: '', organizadorNombre: '', serieId: '', recurrencia: '',
      privada: true, oculta: true, puedeEditar: false, enCalendar: false, motivoCancelacion: '',
    };
  }

  return {
    PREDETERMINADOS: PREDETERMINADOS,
    config: config,
    aBooleano: aBooleano,
    aMinutos: aMinutos,
    formatoHora: formatoHora,
    seCruzan: seCruzan,
    partesIntl: partesIntl,
    buscarSala: buscarSala,
    buscarChoque: buscarChoque,
    validar: validar,
    salasDisponibles: salasDisponibles,
    huecosLibres: huecosLibres,
    puedeModificar: puedeModificar,
    esInvitado: esInvitado,
    puedeVerDetalles: puedeVerDetalles,
    versionOculta: versionOculta,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Reglas;
