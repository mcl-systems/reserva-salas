/**
 * Reuniones que se repiten.
 * Igual que reglas.js, este archivo se usa SIN CAMBIOS en el navegador y en Apps Script
 * (apps-script/Recurrencia.gs). Las fechas se calculan en la hora local del entorno.
 *
 * Regla:
 *   { frecuencia: 'diaria' | 'habiles' | 'semanal' | 'mensual',
 *     intervalo: 1,                  // cada N días / semanas / meses
 *     dias: [1, 3],                  // solo semanal: 1 = lunes … 7 = domingo
 *     termina: 'veces' | 'fecha',
 *     veces: 10,                     // si termina = 'veces'
 *     hasta: '2026-12-31' }          // si termina = 'fecha'
 */
var Recurrencia = (function () {
  'use strict';

  var MAXIMO = 52;
  var NOMBRES = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  function ms(x) { return x instanceof Date ? x.getTime() : typeof x === 'number' ? x : new Date(x).getTime(); }
  function diaIso(d) { return d.getDay() || 7; }
  function enFecha(base, y, m, dia) { return new Date(y, m, dia, base.getHours(), base.getMinutes(), base.getSeconds()); }
  function sumarDias(base, n) { return enFecha(base, base.getFullYear(), base.getMonth(), base.getDate() + n); }
  function finDelDia(texto) {
    var p = String(texto).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 23, 59, 59).getTime();
  }

  function normalizar(regla) {
    if (!regla || !regla.frecuencia || regla.frecuencia === 'nunca') return null;
    var r = {
      frecuencia: regla.frecuencia,
      intervalo: Math.max(1, Math.min(12, Number(regla.intervalo) || 1)),
      dias: (regla.dias || []).map(Number).filter(function (d) { return d >= 1 && d <= 7; })
        .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort(),
      termina: regla.termina === 'fecha' ? 'fecha' : 'veces',
      veces: Math.max(1, Math.min(MAXIMO, Number(regla.veces) || 10)),
      hasta: regla.hasta || null,
    };
    if (['diaria', 'habiles', 'semanal', 'mensual'].indexOf(r.frecuencia) === -1) return null;
    if (r.termina === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.hasta))) r.termina = 'veces';
    return r;
  }

  /**
   * Devuelve las fechas de la serie, empezando por la primera reunión.
   * @return {Array<{inicio: Date, fin: Date}>}
   */
  function expandir(inicio, fin, regla, maximo) {
    var ini = new Date(ms(inicio));
    var duracion = ms(fin) - ms(inicio);
    var r = normalizar(regla);
    if (!r) return [{ inicio: ini, fin: new Date(ini.getTime() + duracion) }];

    var tope = Math.min(maximo || MAXIMO, r.termina === 'veces' ? r.veces : MAXIMO);
    var limite = r.termina === 'fecha' ? finDelDia(r.hasta) : Infinity;
    var fechas = [];
    function agregar(d) {
      if (isNaN(d.getTime()) || d.getTime() < ini.getTime() || d.getTime() > limite || fechas.length >= tope) return false;
      fechas.push(d);
      return true;
    }
    var vueltas = 0;

    if (r.frecuencia === 'diaria') {
      for (var k = 0; fechas.length < tope && vueltas++ < 800; k += r.intervalo) {
        var d1 = sumarDias(ini, k);
        if (d1.getTime() > limite) break;
        agregar(d1);
      }
    } else if (r.frecuencia === 'habiles') {
      for (var j = 0; fechas.length < tope && vueltas++ < 800; j++) {
        var d2 = sumarDias(ini, j);
        if (d2.getTime() > limite) break;
        if (diaIso(d2) <= 5) agregar(d2);
      }
    } else if (r.frecuencia === 'semanal') {
      var dias = r.dias.length ? r.dias : [diaIso(ini)];
      var lunes = sumarDias(ini, 1 - diaIso(ini));
      var terminado = false;
      for (var s = 0; !terminado && fechas.length < tope && vueltas++ < 400; s += r.intervalo) {
        for (var i = 0; i < dias.length; i++) {
          var d3 = sumarDias(lunes, s * 7 + dias[i] - 1);
          if (d3.getTime() > limite) { terminado = true; break; }
          agregar(d3);
        }
      }
    } else if (r.frecuencia === 'mensual') {
      var dia = ini.getDate();
      for (var m = 0; fechas.length < tope && vueltas++ < 200; m += r.intervalo) {
        var d4 = enFecha(ini, ini.getFullYear(), ini.getMonth() + m, dia);
        if (d4.getDate() !== dia) continue; // el mes no tiene ese día (ej. 31)
        if (d4.getTime() > limite) break;
        agregar(d4);
      }
    }
    return fechas.map(function (d) { return { inicio: d, fin: new Date(d.getTime() + duracion) }; });
  }

  function lista(nombres) {
    if (nombres.length <= 1) return nombres.join('');
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }

  /** Texto legible: "Cada semana el lunes y el miércoles · 10 veces" */
  function describir(regla, inicio) {
    var r = normalizar(regla);
    if (!r) return 'No se repite';
    var cada = r.intervalo === 1;
    var texto;
    if (r.frecuencia === 'diaria') texto = cada ? 'Todos los días' : 'Cada ' + r.intervalo + ' días';
    else if (r.frecuencia === 'habiles') texto = 'Todos los días hábiles (lunes a viernes)';
    else if (r.frecuencia === 'semanal') {
      var dias = r.dias.length ? r.dias : [inicio ? diaIso(new Date(ms(inicio))) : 1];
      texto = (cada ? 'Cada semana' : 'Cada ' + r.intervalo + ' semanas') + ' el ' +
        lista(dias.map(function (d) { return NOMBRES[d]; })).replace(/ y /, ' y el ');
    } else {
      var dia = inicio ? new Date(ms(inicio)).getDate() : null;
      texto = (cada ? 'Cada mes' : 'Cada ' + r.intervalo + ' meses') + (dia ? ' el día ' + dia : '');
    }
    if (r.termina === 'fecha') {
      var p = String(r.hasta).split('-');
      texto += ' · hasta el ' + Number(p[2]) + '/' + Number(p[1]) + '/' + p[0];
    } else {
      texto += ' · ' + r.veces + (r.veces === 1 ? ' vez' : ' veces');
    }
    return texto;
  }

  return { MAXIMO: MAXIMO, normalizar: normalizar, expandir: expandir, describir: describir };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Recurrencia;
