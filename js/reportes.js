/**
 * Cálculo de estadísticas para los paneles (sin dependencias del DOM, se prueba en Node).
 */
var Reportes = (function () {
  'use strict';

  function ms(x) { return x instanceof Date ? x.getTime() : new Date(x).getTime(); }
  function horas(r, desde, hasta) {
    var a = Math.max(ms(r.inicio), desde), b = Math.min(ms(r.fin), hasta);
    return Math.max(0, b - a) / 3600000;
  }
  function redondear(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  /** Horas que las salas estuvieron abiertas en el rango (base para la ocupación). */
  function horasDisponibles(sala, desde, hasta, finesDeSemana) {
    var total = 0;
    var horasDia = (Reglas.aMinutos(sala.cierre) - Reglas.aMinutos(sala.apertura)) / 60;
    var d = new Date(desde);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    for (var i = 0; d.getTime() < hasta && i < 800; i++) {
      var dia = d.getDay();
      if (finesDeSemana || (dia !== 0 && dia !== 6)) total += horasDia;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return total;
  }

  /**
   * @param {{reservas, salas, desde, hasta, finesDeSemana?, salaId?}} o
   */
  function calcular(o) {
    var desde = ms(o.desde), hasta = ms(o.hasta);
    var salas = o.salas.filter(function (s) { return !o.salaId || s.id === o.salaId; });
    var idsSalas = salas.map(function (s) { return s.id; });
    var todas = o.reservas.filter(function (r) { return idsSalas.indexOf(r.salaId) !== -1; });
    var confirmadas = todas.filter(function (r) { return r.estado === 'confirmada'; });
    var canceladas = todas.filter(function (r) { return r.estado === 'cancelada'; });

    var totalHoras = 0;
    var porSala = {};
    salas.forEach(function (s) { porSala[s.id] = { sala: s, reservas: 0, horas: 0, asistentes: 0, aprovechamiento: 0 }; });
    var porDia = [1, 2, 3, 4, 5, 6, 7].map(function (d) { return { dia: d, reservas: 0, horas: 0 }; });
    var calor = [];
    for (var di = 0; di < 7; di++) { calor.push([]); for (var h = 0; h < 24; h++) calor[di].push(0); }
    var organizadores = {};

    confirmadas.forEach(function (r) {
      var hs = horas(r, desde, hasta);
      totalHoras += hs;
      var ps = porSala[r.salaId];
      ps.reservas++;
      ps.horas += hs;
      ps.asistentes += Number(r.asistentes || 1);
      ps.aprovechamiento += Math.min(1, Number(r.asistentes || 1) / Number(ps.sala.capacidad || 1));
      var ini = new Date(r.inicio);
      var dIso = ini.getDay() || 7;
      porDia[dIso - 1].reservas++;
      porDia[dIso - 1].horas += hs;
      // Mapa de calor: minutos ocupados en cada franja de una hora
      for (var t = Math.max(ms(r.inicio), desde); t < Math.min(ms(r.fin), hasta);) {
        var d = new Date(t);
        var finHora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
        var tramo = Math.min(finHora, ms(r.fin)) - t;
        calor[(d.getDay() || 7) - 1][d.getHours()] += tramo / 3600000;
        t += tramo;
      }
      var k = String(r.organizadorEmail).toLowerCase();
      var org = organizadores[k] || (organizadores[k] = { email: k, nombre: r.organizadorNombre || k, reservas: 0, horas: 0, canceladas: 0 });
      org.reservas++;
      org.horas += hs;
    });
    canceladas.forEach(function (r) {
      var k = String(r.organizadorEmail).toLowerCase();
      var org = organizadores[k] || (organizadores[k] = { email: k, nombre: r.organizadorNombre || k, reservas: 0, horas: 0, canceladas: 0 });
      org.canceladas++;
    });

    var disponibles = 0;
    var listaSalas = salas.map(function (s) {
      var x = porSala[s.id];
      var disp = horasDisponibles(s, desde, hasta, o.finesDeSemana);
      if (s.activa !== false) disponibles += disp;
      return {
        sala: s,
        reservas: x.reservas,
        horas: redondear(x.horas, 1),
        ocupacion: disp ? x.horas / disp : 0,
        asistentesPromedio: x.reservas ? redondear(x.asistentes / x.reservas, 1) : 0,
        aprovechamiento: x.reservas ? x.aprovechamiento / x.reservas : 0,
      };
    }).sort(function (a, b) { return b.horas - a.horas || a.sala.nombre.localeCompare(b.sala.nombre); });

    var aprovechamiento = confirmadas.length
      ? listaSalas.reduce(function (s, x) { return s + x.aprovechamiento * x.reservas; }, 0) / confirmadas.length
      : 0;

    return {
      kpis: {
        confirmadas: confirmadas.length,
        canceladas: canceladas.length,
        tasaCancelacion: todas.length ? canceladas.length / todas.length : 0,
        horas: redondear(totalHoras, 1),
        ocupacion: disponibles ? totalHoras / disponibles : 0,
        organizadores: Object.keys(organizadores).filter(function (k) { return organizadores[k].reservas > 0; }).length,
        aprovechamiento: aprovechamiento,
        duracionPromedio: confirmadas.length ? Math.round(totalHoras * 60 / confirmadas.length) : 0,
        series: confirmadas.filter(function (r) { return r.serieId; }).length,
      },
      porSala: listaSalas,
      porDia: porDia.map(function (d) { return { dia: d.dia, reservas: d.reservas, horas: redondear(d.horas, 1) }; }),
      calor: calor,
      organizadores: Object.keys(organizadores).map(function (k) {
        var x = organizadores[k];
        return { email: x.email, nombre: x.nombre, reservas: x.reservas, horas: redondear(x.horas, 1), canceladas: x.canceladas };
      }).sort(function (a, b) { return b.horas - a.horas || b.reservas - a.reservas; }),
    };
  }

  /** CSV para Excel en español (separador ;, con BOM para respetar tildes). */
  function csv(reservas, salas) {
    function campo(v) {
      var s = String(v === undefined || v === null ? '' : v);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function dd(n) { return (n < 10 ? '0' : '') + n; }
    function fecha(d) { return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()); }
    function hora(d) { return dd(d.getHours()) + ':' + dd(d.getMinutes()); }
    var nombres = {};
    salas.forEach(function (s) { nombres[s.id] = s.nombre; });
    var filas = [['Fecha', 'Inicio', 'Fin', 'Horas', 'Sala', 'Título', 'Organizador', 'Correo', 'Asistentes', 'Estado', 'Repetición', 'Privada', 'Motivo de cancelación']];
    reservas.forEach(function (r) {
      var i = new Date(r.inicio), f = new Date(r.fin);
      filas.push([
        fecha(i), hora(i), hora(f), String(redondear((f - i) / 3600000, 2)).replace('.', ','), nombres[r.salaId] || r.salaId,
        r.titulo, r.organizadorNombre, r.organizadorEmail, r.asistentes, r.estado, r.recurrencia || '', r.privada ? 'Sí' : '', r.motivoCancelacion || '',
      ]);
    });
    return '﻿' + filas.map(function (f) { return f.map(campo).join(';'); }).join('\r\n');
  }

  return { calcular: calcular, csv: csv, horasDisponibles: horasDisponibles };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Reportes;
