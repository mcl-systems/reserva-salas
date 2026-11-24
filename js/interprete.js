/**
 * Intérprete de español natural para el asistente de reservas.
 * Funciona 100 % en el navegador, sin claves ni servicios externos.
 *
 *   Interprete.interpretar("reserva la sala creativa mañana a las 3 para 6 personas", {ahora, salas})
 *   → { intencion:'reservar', fecha:'2026-11-24', horaInicio:'15:00', horaFin:'16:00',
 *       duracionMin:60, asistentes:6, salaId:'S2', titulo:null, invitados:[] }
 */
var Interprete = (function () {
  'use strict';

  var DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  var MESES = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
    septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11,
  };
  var NUMEROS = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50,
    sesenta: 60, ochenta: 80, cien: 100,
  };
  var NUM = '(\\d{1,3}|' + Object.keys(NUMEROS).sort(function (a, b) { return b.length - a.length; }).join('|') + ')';
  var HORA = '(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\\s*[:.h]\\s*(\\d{2}))?' +
    '(?:\\s+y\\s+(media|cuarto|\\d{2}))?(?:\\s*(am|pm|a\\.\\s?m\\.?|p\\.\\s?m\\.?|hrs?|horas)(?![a-z]))?';
  var MERIDIANO = '(?:\\s+(?:de|en|por)\\s+la\\s+(manana|tarde|noche)|\\s+(?:del\\s+)?(mediodia))?';

  function normalizar(t) {
    return String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** Abreviaturas y modismos frecuentes en chat («q», «xfa», «pa», «ahorita»…). */
  var INFORMAL = [
    [/\bq\b/g, 'que'], [/\b(xq|pq|porq)\b/g, 'porque'], [/\b(xfa|xfavor|porfa|porfis|pls|plis)\b/g, 'porfavor'], [/\bx\b/g, 'por'], [/\bd\b/g, 'de'],
    [/\bpa\b(?! ?\.)/g, 'para'], [/\btmb\b|\btb\b/g, 'tambien'], [/\breu\b/g, 'reunion'], [/\bmnn\b|\bmñn\b|\bmanna\b|\bmaniana\b/g, 'manana'],
    [/\bhr\b/g, 'hora'], [/\bmins?\b/g, 'minutos'],
    [/\bdspues\b|\bdsps\b/g, 'despues'], [/\bsla\b/g, 'sala'], [/\bsalaa+\b/g, 'sala'],
    [/\bresevar\b|\breserbar\b|\bresrvar\b/g, 'reservar'], [/\breserba\b|\breseva\b/g, 'reserva'],
  ];
  function limpiar(t) {
    INFORMAL.forEach(function (par) { t = t.replace(par[0], par[1]); });
    return t.replace(/\s+/g, ' ').trim();
  }
  /** Aplica las mismas sustituciones palabra por palabra al texto original (así los índices coinciden). */
  function limpiarOriginal(original) {
    var enComillas = false;
    return original.split(' ').map(function (w) {
      var abre = /^["“«']/.test(w), cierra = /["”»']([,.;:!?]*)$/.test(w);
      var dentro = enComillas || abre;
      if (abre && !cierra) enComillas = true;
      if (cierra && !abre) enComillas = false;
      if (dentro) return w;
      var fin = (w.match(/[,.;:!?]+$/) || [''])[0];
      var base = w.slice(0, w.length - fin.length);
      // Solo palabras sueltas en minúscula (así no se toca «Proyecto X», correos ni direcciones)
      if (!/^[a-zñáéíóú]+$/.test(base)) return w;
      var n = normalizar(base), l = limpiar(n);
      return l !== n ? l + fin : w;
    }).join(' ');
  }

  /** Distancia de edición (para tolerar errores de dedo en los nombres de sala). */
  function distancia(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var actual = [i];
      for (j = 1; j <= b.length; j++) {
        actual[j] = Math.min(prev[j] + 1, actual[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = actual;
    }
    return prev[b.length];
  }

  function aNumero(s) {
    if (s === undefined || s === null || s === '') return null;
    if (/^\d+$/.test(s)) return Number(s);
    return NUMEROS[s] !== undefined ? NUMEROS[s] : null;
  }

  function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }
  function fechaTexto(d) { return d.getFullYear() + '-' + dosDigitos(d.getMonth() + 1) + '-' + dosDigitos(d.getDate()); }
  function sumarDias(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function minutosATexto(m) { return dosDigitos(Math.floor(m / 60)) + ':' + dosDigitos(m % 60); }

  // ------------------------------------------------------------------ fechas
  function extraerFecha(t, ahora) {
    var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    var m;
    if (/\bpasado manana\b/.test(t)) return { fecha: fechaTexto(sumarDias(hoy, 2)), texto: 'pasado mañana' };
    if (/\bhoy\b|\besta (tarde|manana|noche)\b/.test(t)) return { fecha: fechaTexto(hoy), texto: 'hoy' };
    if (/\bmanana\b/.test(t.replace(/\b(de|en|por) la manana\b/g, ' '))) {
      return { fecha: fechaTexto(sumarDias(hoy, 1)), texto: 'mañana' };
    }
    if ((m = t.match(new RegExp('\\b(?:dentro de|en) ' + NUM + ' dias?\\b')))) {
      return { fecha: fechaTexto(sumarDias(hoy, aNumero(m[1]))) };
    }
    if ((m = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: (?:de )?(\d{4}))?\b/))) {
      return { fecha: fechaFutura(hoy, Number(m[1]), MESES[m[2]], m[3] && Number(m[3])) };
    }
    if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/))) {
      var anio = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : null;
      return { fecha: fechaFutura(hoy, Number(m[1]), Number(m[2]) - 1, anio) };
    }
    if ((m = t.match(/\b(?:(este|esta|el|proximo|siguiente) )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: (proximo|que viene|de la (?:otra|proxima|siguiente) semana))?\b/))) {
      var objetivo = DIAS[m[2]];
      if (/otra|proxima|siguiente/.test(m[3] || '')) {
        // "el martes de la próxima semana": ese día dentro de la semana siguiente (lunes a domingo)
        var isoHoy = hoy.getDay() || 7, isoObj = objetivo || 7;
        return { fecha: fechaTexto(sumarDias(hoy, 8 - isoHoy + isoObj - 1)) };
      }
      var diff = (objetivo - hoy.getDay() + 7) % 7;
      if (diff === 0 && m[1] !== 'este' && m[1] !== 'esta') diff = 7;
      return { fecha: fechaTexto(sumarDias(hoy, diff)) };
    }
    if ((m = t.match(/\b(?:el|para el|del) (\d{1,2})\b(?!\s*(?::|personas|asistentes|participantes|horas?|minutos|min\b|y media|de la|am|pm))/))) {
      var dia = Number(m[1]);
      if (dia >= 1 && dia <= 31) return { fecha: fechaFutura(hoy, dia, null, null) };
    }
    return null;
  }

  function fechaFutura(hoy, dia, mes, anio) {
    var d;
    if (mes === null || mes === undefined) {
      d = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
      if (d < hoy) d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
    } else {
      d = new Date(anio || hoy.getFullYear(), mes, dia);
      if (!anio && d < hoy) d = new Date(hoy.getFullYear() + 1, mes, dia);
    }
    return fechaTexto(d);
  }

  // ------------------------------------------------------------------- horas
  function horaAMinutos(hs, ms, fraccion, sufijo, parte, mediodia) {
    var h = aNumero(hs);
    if (h === null || h > 23) return null;
    var min = ms ? Number(ms) : 0;
    if (fraccion === 'media') min = 30;
    else if (fraccion === 'cuarto') min = 15;
    else if (fraccion && /^\d{2}$/.test(fraccion)) min = Number(fraccion);
    if (min > 59) return null;
    sufijo = (sufijo || '').replace(/[\s.]/g, '');
    var explicito = false;
    if (sufijo === 'pm' || parte === 'tarde' || parte === 'noche') {
      if (h < 12) h += 12;
      explicito = true;
    } else if (sufijo === 'am' || parte === 'manana') {
      if (h === 12) h = 0;
      explicito = true;
    } else if (mediodia) {
      explicito = true;
    }
    // Sin "am/pm": de 1 a 6 se entiende de la tarde (horario de oficina)
    if (!explicito && h >= 1 && h <= 6) h += 12;
    return h * 60 + min;
  }

  function extraerHoras(t) {
    var m;
    var rango = new RegExp(
      '(?:de|desde|entre)(?: las?)? ' + HORA + MERIDIANO + ' (?:a|hasta|y)(?: las?)? ' + HORA + MERIDIANO
    );
    if ((m = t.match(rango))) {
      var parteFin = m[11] || m[5];
      var sufFin = m[10];
      var fin = horaAMinutos(m[7], m[8], m[9], sufFin, parteFin, m[12]);
      var parteIni = m[5] || (aNumero(m[1]) <= aNumero(m[7]) ? m[11] : null);
      var sufIni = m[4] || (/^(pm)$/.test(sufFin || '') && aNumero(m[1]) < aNumero(m[7]) ? sufFin : '');
      var ini = horaAMinutos(m[1], m[2], m[3], sufIni, parteIni, m[6]);
      if (ini !== null && fin !== null) {
        if (fin <= ini && fin + 12 * 60 > ini && fin < 12 * 60) fin += 12 * 60; // "de 11 a 1" → 11:00-13:00
        if (fin > ini) return { inicio: ini, fin: fin };
      }
    }
    var simple = new RegExp('(?:a las?|a eso de las?|alas|para las?|desde las?|tipo|como a las?|@)\\s*' + HORA + MERIDIANO);
    if ((m = t.match(simple))) {
      var v = horaAMinutos(m[1], m[2], m[3], m[4], m[5], m[6]);
      if (v !== null) return { inicio: v };
    }
    var suelta = new RegExp('\\b(\\d{1,2})(?:\\s*[:.h]\\s*(\\d{2}))\\b|\\b(\\d{1,2})\\s*(am|pm|a\\.\\s?m\\.?|p\\.\\s?m\\.?)(?![a-z])');
    if ((m = t.match(suelta))) {
      var v2 = m[1] ? horaAMinutos(m[1], m[2], null, '', null) : horaAMinutos(m[3], null, null, m[4], null);
      if (v2 !== null) return { inicio: v2 };
    }
    var conParte = t.match(/\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) (?:de|en|por) la (manana|tarde|noche)\b/);
    if (conParte) {
      var v3 = horaAMinutos(conParte[1], null, null, '', conParte[2]);
      if (v3 !== null) return { inicio: v3 };
    }
    if (/\b(?:al |a )?medio ?dia\b/.test(t)) return { inicio: 12 * 60 };
    return horaDeOficina(t);
  }

  /** «a primera hora», «después del almuerzo», «toda la tarde»… */
  function horaDeOficina(t) {
    if (/\btodo el dia\b/.test(t)) return { inicio: 8 * 60, fin: 17 * 60 };
    if (/\btoda la manana\b/.test(t)) return { inicio: 8 * 60, fin: 12 * 60 };
    if (/\btoda la tarde\b/.test(t)) return { inicio: 13 * 60, fin: 17 * 60 };
    if (/\b(a primera hora|primera hora|bien temprano|tempranito|temprano)\b/.test(t)) return { inicio: 8 * 60 };
    if (/\ba media manana\b/.test(t)) return { inicio: 10 * 60 };
    if (/\bantes del almuerzo\b/.test(t)) return { inicio: 11 * 60 };
    if (/\b(despues del almuerzo|despues de almorzar|despues de comer)\b/.test(t)) return { inicio: 13 * 60 };
    if (/\ba la hora del almuerzo\b|\bpara almorzar\b/.test(t)) return { inicio: 12 * 60 };
    if (/\ba media tarde\b/.test(t)) return { inicio: 15 * 60 };
    if (/\b(al final del dia|al final de la tarde|a ultima hora|antes de salir)\b/.test(t)) return { inicio: 16 * 60 };
    return null;
  }

  /** «ahorita», «ya», «en 20 minutos», «dentro de una hora» → minutos desde la medianoche de hoy. */
  var RELATIVA = new RegExp('\\b(?:en|dentro de) (?:(?:unos?|unas) )?(' + NUM.slice(1, -1) + '|media) (minutos?|horas?)\\b');
  function horaRelativa(t, ahora) {
    var m = t.match(RELATIVA);
    var base = ahora.getHours() * 60 + ahora.getMinutes();
    if (m) {
      var n = m[1] === 'media' ? 0.5 : aNumero(m[1]);
      if (n !== null) {
        var mins = /hora/.test(m[2]) ? n * 60 : n;
        return { inicio: Math.ceil((base + mins) / 5) * 5, texto: m[0] };
      }
    }
    if (/\b(ahorita|ahora mismo|ahora|ya mismo|en este momento|de inmediato|inmediatamente)\b/.test(t)) {
      return { inicio: Math.ceil((base + 1) / 15) * 15, ahora: true };
    }
    return null;
  }

  function extraerDuracion(t) {
    var m;
    if (/\bhora y media\b/.test(t)) return 90;
    if (/\bmedia hora\b/.test(t)) return 30;
    if ((m = t.match(new RegExp('\\b' + NUM + ' horas? y media\\b')))) return aNumero(m[1]) * 60 + 30;
    var reHoras = new RegExp('\\b' + NUM + ' ?(horas?|hrs?|h)\\b(?! de la)', 'g');
    while ((m = reHoras.exec(t))) {
      var prev = t.slice(0, m.index).trim().split(' ').pop();
      if (!/^(las?|a|de|desde|hasta|y|en|unas)$/.test(prev)) return aNumero(m[1]) * 60;
    }
    if ((m = t.match(new RegExp('\\b' + NUM + ' ?(minutos|min|mins)\\b')))) return aNumero(m[1]);
    return null;
  }

  function extraerAsistentes(t) {
    var m = t.match(new RegExp('\\b(?:para|somos|seremos|con|de|unas|unos)? ?' + NUM + ' (personas|asistentes|participantes|invitados|personas?|gente|pax|integrantes|colaboradores|miembros)\\b'));
    if (m) return aNumero(m[1]);
    m = t.match(new RegExp('\\b(?:somos|seremos) ' + NUM + '\\b'));
    if (m) return aNumero(m[1]);
    // "sala para 4", "reunión de 10" (sin la palabra personas)
    m = t.match(new RegExp('\\b(?:sala|salon|espacio|lugar|reunion|junta|cupo|capacidad) (?:para|de) ' + NUM +
      '\\b(?!\\s*(?::|\\.\\d|am\\b|pm\\b|a\\.|p\\.|de la|y media|y cuarto|horas?|hrs?|minutos|min\\b|de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)))'));
    if (m && /^(un|una|uno)$/.test(m[1])) return null; // «una sala para una videollamada»
    return m && aNumero(m[1]) <= 500 ? aNumero(m[1]) : null;
  }

  // -------------------------------------------------------------------- sala
  var GENERICAS = { sala: 1, salon: 1, de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, y: 1 };

  function extraerSala(t, salas) {
    var mejor = null, mejorPuntos = 0;
    (salas || []).forEach(function (s) {
      var nombre = normalizar(s.nombre);
      var puntos = 0;
      if (t.indexOf(nombre) !== -1) puntos = 100 + nombre.length;
      else {
        nombre.split(/[^a-z0-9]+/).forEach(function (p) {
          if (!p || GENERICAS[p]) return;
          if (/^\d+$/.test(p)) {
            if (new RegExp('\\b' + p + '\\b').test(t) && puntos > 0) puntos += 5;
            return;
          }
          if (p.length >= 4 && new RegExp('\\b' + p.slice(0, Math.max(4, p.length - 2))).test(t)) puntos += p.length;
        });
        // números: "cabina 1" vs "cabina 2"
        var numeros = nombre.match(/\d+/g);
        if (numeros && puntos > 0) {
          var mencionado = t.match(new RegExp('\\b' + nombre.replace(/\s*\d+.*/, '').split(' ').pop() + ' (\\d+)\\b'));
          if (mencionado && numeros.indexOf(mencionado[1]) === -1) puntos = 0;
        }
      }
      if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = s; }
    });
    if (mejor) return mejor.id;
    // Sin coincidencia exacta: tolera una o dos letras cambiadas («ejecutiba», «auditoreo»)
    var palabras = t.split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 5; });
    (salas || []).forEach(function (s) {
      normalizar(s.nombre).split(/[^a-z0-9]+/).forEach(function (p) {
        if (p.length < 5 || GENERICAS[p]) return;
        palabras.forEach(function (w) {
          var d = distancia(w, p);
          var limite = p.length >= 8 ? 2 : 1;
          if (d <= limite && (!mejor || d < mejorPuntos)) { mejor = s; mejorPuntos = d; }
        });
      });
    });
    return mejor ? mejor.id : null;
  }

  /** Personas del directorio mencionadas por nombre («con María», «invita a Carlos Ruiz»). */
  function extraerPersonas(t, directorio) {
    var encontradas = [], ambiguas = [];
    if (!directorio || !directorio.length) return { emails: [], ambiguas: [] };
    var zona = t.match(/\b(?:con|invita(?:r|ndo)?(?: a)?|agrega(?:r)?(?: a)?|anade(?: a)?|incluye(?: a)?|suma(?: a)?|quita(?: a)?|saca(?: a)?|elimina(?: a)?)\s+(.+)$/);
    if (!zona) return { emails: [], ambiguas: [] };
    var texto = ' ' + zona[1] + ' ';
    var personas = directorio.map(function (p) {
      var n = normalizar(p.nombre);
      return { email: String(p.email).toLowerCase(), completo: n, nombre: n.split(' ')[0] };
    });
    // Primero los nombres completos, después los nombres de pila
    personas.forEach(function (p) {
      if (p.completo.indexOf(' ') !== -1 && texto.indexOf(' ' + p.completo + ' ') !== -1 && encontradas.indexOf(p.email) === -1) {
        encontradas.push(p.email);
        texto = texto.replace(' ' + p.completo + ' ', ' _ ');
      }
    });
    var vistos = {};
    personas.forEach(function (p) {
      if (p.nombre.length < 3 || vistos[p.nombre]) return;
      vistos[p.nombre] = true;
      if (!new RegExp('[ ,]' + p.nombre + '[ ,]').test(texto)) return;
      var mismos = personas.filter(function (x) { return x.nombre === p.nombre; });
      if (mismos.length === 1) { if (encontradas.indexOf(p.email) === -1) encontradas.push(p.email); }
      else ambiguas.push({ nombre: p.nombre, opciones: mismos.map(function (x) { return x.email; }) });
    });
    return { emails: encontradas, ambiguas: ambiguas };
  }

  // ------------------------------------------------------------------ título
  var TIPOS = 'reunion|junta|capacitacion|entrevista|presentacion|llamada|sesion|taller|clase|demo|demostracion|revision|' +
    'planificacion|planeacion|retrospectiva|comite|consejo|asesoria|tutoria|defensa|conferencia|seminario|charla|' +
    'videollamada|kickoff|standup|daily|evaluacion|induccion|onboarding|lluvia de ideas|brainstorming|almuerzo|desayuno';
  var SEMANA = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
  var CORTE = '(?=\\s+(?:con|y|invitando a|invita a)\\s+[a-z0-9._%+-]+@|\\s+(?:(?:el|este|esta|proximo|para el) (?:' + SEMANA + '|\\d|proximo|dia|siguiente)|hoy|manana|pasado|' +
    'a las?|a la una|al medio|de las?|desde|entre|en (?:la|el) (?:sala|salon|auditorio|cabina|tarde|manana|noche)|en el|en sala|' +
    'en (?:la )?cabina|para (?:las?|\\d|manana|hoy|pasado|' + SEMANA + ')|con \\d|por (?:una|dos|tres|\\d|media|la)|que dure|' +
    'durante|somos|seremos|cada|todos los|todas las|hasta|semanal(?:mente)?|mensual(?:mente)?|diariamente|como siempre|como de costumbre|lo de siempre|' + SEMANA + '|\\d)\\b|[,.;:!?]|$)';

  function extraerTitulo(original, t) {
    var m = original.match(/["“«']([^"”»']{2,80})["”»']/);
    if (m) return capitalizar(m[1].trim());
    var re = new RegExp('\\b(' + TIPOS + ')\\b((?:\\s+(?:de|del|con|sobre|para|semanal|mensual|general|del equipo|de equipo)(?:\\s+[a-z0-9]+)*?)?)' + CORTE);
    m = t.match(re);
    if (m) {
      var inicio = m.index, fin = m.index + m[0].length;
      var texto = original.slice(inicio, fin).trim().replace(/\s+(de|con|sobre|para|del)$/i, '');
      if (texto.split(' ').length <= 9) return capitalizar(texto);
    }
    m = t.match(new RegExp('\\b(?:tema|motivo|asunto|titulo|sobre)\\s*:?\\s+(?:el |la |los |las )?([a-z0-9][a-z0-9 ]{2,60}?)' + CORTE));
    if (m) return capitalizar(original.substr(t.indexOf(m[1], m.index), m[1].length).trim());
    return null;
  }

  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function extraerInvitados(original) {
    var m = original.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g);
    return m ? m.map(function (x) { return x.toLowerCase(); }) : [];
  }

  // -------------------------------------------------------------- repetición
  function extraerRecurrencia(t, ahora) {
    var r = null, m;
    var nombres = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
    var iso = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
    if (/\b(todos los dias habiles|cada dia habil|de lunes a viernes|entre semana|diariamente|todos los dias laborales)\b/.test(t)) r = { frecuencia: 'habiles' };
    else if (/\b(todos los dias|cada dia|diario)\b/.test(t)) r = { frecuencia: 'diaria', intervalo: 1 };
    else if ((m = t.match(new RegExp('\\b(?:todos los|cada) ' + nombres + '((?:(?:,| y) (?:los )?' + nombres + ')*)')))) {
      var dias = [iso[m[1]]];
      (m[2].match(new RegExp(nombres, 'g')) || []).forEach(function (d) { dias.push(iso[d]); });
      r = { frecuencia: 'semanal', intervalo: 1, dias: dias };
    } else if (/\b(cada (2|dos) semanas|cada quince dias|cada 15 dias|quincenal(mente)?)\b/.test(t)) r = { frecuencia: 'semanal', intervalo: 2 };
    else if (/\b(cada semana|semanal(mente)?|todas las semanas)\b/.test(t)) r = { frecuencia: 'semanal', intervalo: 1 };
    else if (/\b(cada mes|mensual(mente)?|todos los meses)\b/.test(t)) r = { frecuencia: 'mensual', intervalo: 1 };
    if (!r) return null;
    r.termina = 'veces';
    r.veces = { habiles: 10, diaria: 10, semanal: 8, mensual: 6 }[r.frecuencia];
    if ((m = t.match(new RegExp('\\b(?:durante|por) (?:las? |los )?(?:proxim[oa]s )?' + NUM + ' (semanas?|meses|mes|dias?)\\b')))) {
      var n = aNumero(m[1]);
      var porSemana = r.frecuencia === 'semanal' ? (r.dias ? r.dias.length : 1) / r.intervalo : r.frecuencia === 'habiles' ? 5 : r.frecuencia === 'diaria' ? 7 : 0;
      if (/semana/.test(m[2])) r.veces = Math.max(1, Math.round(n * (porSemana || 1)));
      else if (/mes/.test(m[2])) r.veces = r.frecuencia === 'mensual' ? n : Math.max(1, Math.round(n * 4.3 * (porSemana || 1)));
      else r.veces = n;
    } else if ((m = t.match(new RegExp('\\b' + NUM + ' (veces|sesiones|reuniones|ocasiones)\\b')))) {
      r.veces = aNumero(m[1]);
    } else if ((m = t.match(/\bhasta (?:el )?(.+)$/))) {
      var f = extraerFecha(m[1], ahora) || extraerFecha('el ' + m[1], ahora);
      if (f) { r.termina = 'fecha'; r.hasta = f.fecha; }
    } else if (/\bhasta fin de (ano|año)\b/.test(t)) {
      r.termina = 'fecha'; r.hasta = ahora.getFullYear() + '-12-31';
    }
    r.veces = Math.min(52, Math.max(1, r.veces));
    return r;
  }

  // --------------------------------------------------------------- intención
  var VERBO_MOVER = /\b(mueve(la|lo|las)?|mover(la|lo)?|muevan|pasa(la|lo)|pasar(la|lo)|pasa (?=(?:la|mi|el|esa) (?!tarde|manana|noche))|cambia(la|lo|r)? (?:de |la |mi |el |esa |esta )?(?:reunion|reserva|junta|hora|horario|fecha|dia|sala)|cambiala|cambialo|reprograma(r|la|lo)?|reagenda(r|la|lo)?|pospon(er|la|lo|gamos)?|posterga(r|la|lo)?|aplaza(r|la|lo)?|adelanta(r|la|lo)?|atrasa(r|la|lo)?|retrasa(r|la|lo)?|corre(la|lo)|recorre(la|lo|r)?)\b/;
  var VERBO_INVITAR = /\b(invita(r|le|les)?|agrega(r|le)?|anade|anadir|suma(r|le)?|incluye|incluir|mete(le)?)\b/;
  var VERBO_QUITAR_PERSONA = /\b(quita(r|le)?|saca(r|le)?|elimina(r)?|borra(r)?|desinvita(r)?)\b(?=.*(@|\b(?:de|del) (?:la |mi |esa )?(?:reunion|reserva|junta|lista)))/;

  function detectarIntencion(t, tieneBorrador, ctx) {
    if (tieneBorrador && /^(si|sip|sii+|simon|confirmo|confirmar|confirmalo|confirmada|dale|ok|okay|okey|vale|perfecto|correcto|de acuerdo|hazlo|adelante|listo|claro|exacto|asi esta bien|esta bien|me parece bien|va|vaya|sale|ya)\b/.test(t)) {
      return 'confirmar';
    }
    if (tieneBorrador && /^(no|nop|nel|mejor no|olvidalo|dejalo|cancela eso|no gracias|descarta(lo)?)\b/.test(t)) return 'negar';
    // «sí» / «no» sueltos sin nada pendiente
    if (/^(si|ok|dale|va|vaya|listo)[.!]*$/.test(t)) return 'confirmar';
    if (/^(no|nop|nel|no gracias|nada|olvidalo)[.!]*$/.test(t)) return 'negar';
    // Repetir una reunión ya hecha
    if (/\b(otra igual|una igual|la misma|igual que la (anterior|ultima)|repite (la|mi) (ultima|anterior|reunion)|duplica(la|r)?|copia(la|r)? (para|al|el))\b/.test(t)) return 'duplicar';
    // Cambios a una reunión que ya existe (con borrador en curso, son cambios al borrador)
    if (!tieneBorrador) {
      if (VERBO_QUITAR_PERSONA.test(t) && !/\b(reunion|reserva) de (las?|manana|hoy)\b/.test(t.split(/\b(de|del) (la |mi )?(reunion|reserva|junta)/)[0] || '')) return 'editar';
      if (VERBO_INVITAR.test(t) && (/@/.test(t) || /\b(a mi|a la|a esa) (reunion|reserva|junta)\b/.test(t) || (ctx && ctx.personas && ctx.personas.emails.length))) {
        if (!/\b(reserva|reservar|reservame|agenda|agendar|agendame|crea|programa)\b/.test(t)) return 'editar';
      }
      if (/\b(cambia|cambiale|ponle|pon|renombra)\b.*\b(titulo|nombre|asunto)\b/.test(t)) return 'editar';
      if (/\b(hazla|ponla|hacela|vuelvela|que sea|marcala como|haz (mi|la) reunion)\b.*\b(privada|publica|normal)\b/.test(t)) return 'editar';
      if (/\b(ahora somos|ya somos|seremos|cambia (a|el numero de)) /.test(t) && /\b(mi|la) (reunion|reserva)\b/.test(t)) return 'editar';
      if (VERBO_MOVER.test(t)) return 'mover';
    }
    if (/\b(recomienda(s|me)?|recomendarias|recomiendan|sugiere(s|me)?|sugerencia|que sala (me )?(conviene|sirve|recomiendas|uso|elijo)|cual sala (es mejor|me conviene|me sirve|uso)|cual es la mejor sala|mejor sala|en que sala (hago|hacemos|puedo hacer)|donde (hago|hacemos|puedo hacer) (la|una|mi))\b/.test(t)) return 'recomendar';
    if (/\b(resume(n|me)?|resumen|cuantas horas (tengo|paso|de reunion)|cuanto tiempo (paso|tengo|estoy) en reuniones|dia mas (ocupado|libre|tranquilo|cargado)|como (esta|viene|se ve) mi (semana|dia|agenda)|que tan ocupad[oa]|estadisticas|se me cruzan|reuniones (que se )?cruzad|tengo (reuniones )?que se cruzan|choques en mi agenda)\b/.test(t)) return 'resumen';
    if (/\b(cuando (podemos|puedo|nos podemos|podriamos) reunir(nos|me)?|busca(me)? (un )?(horario|hueco|espacio|momento)|encuentra(me)? (un )?(horario|hueco|espacio|momento)|horario en comun|(todos|ambos) (estemos|esten|estamos) libres|coincid(a|amos|imos|ir) (todos|con))\b/.test(t)) return 'buscar_horario';
    if (/\b(quien (tiene|ocupa|esta (en|usando)|reservo|uso|usa)|de quien es|quien la tiene|que (hay|reunion hay) en)\b/.test(t)) return 'quien';
    if (/\b(cuando (esta|estara|queda|hay|tengo|puedo)|proximo (espacio|hueco|horario|momento) (libre|disponible)|primer (espacio|hueco|horario|momento) (libre|disponible)|siguiente (espacio|hueco|horario) libre|cuando puedo (reservar|usar|ocupar))\b/.test(t) &&
        /\b(libre|disponible|desocupad|reservar|usar|ocupar|espacio|hueco)\b/.test(t)) return 'proximo_libre';
    if (/\b(cuantas? personas (caben|entran|le caben)|capacidad (de|del)|donde (queda|esta|se encuentra)|como llego|que (tiene|equipo|equipamiento|incluye)|tiene (proyector|pantalla|tv|television|tele|videoconferencia|pizarra|pizarron|microfono|camara|sonido|bocinas|aire)|(salas?|cual|cuales) (con|que tengan?|que tienen) |informacion (?:de|del|sobre)|info (?:de|del)|lista de salas|que salas (hay|existen|tienen)|cuantas salas|todas las salas|describe(me)? la)\b/.test(t) &&
        !/\b(libre|libres|disponible|disponibles|desocupad)/.test(t)) return 'info';
    if (/\b(cancela|cancelar|cancelame|anula|anular|elimina|eliminar|borra|borrar|quita|quitar|libera|liberar)\b/.test(t)) return 'cancelar';
    if (/\b(mis (reuniones|reservas|juntas|eventos|citas)|que (reuniones|reservas|juntas) tengo|tengo (alguna |algo|reuniones|reservas|pendiente)|mi agenda|que tengo|a que (reuniones )?me invitaron|mis invitaciones|que me toca)\b/.test(t)) return 'listar';
    var verboReservar = /\b(reserva|reservar|reservame|reservamos|resérvame|agenda|agendar|agendame|agendemos|programa|programar|programame|aparta|apartar|apartame|crea|crear|creame|organiza|organizar|bloquea|bloquear|separa|separar|necesito (una |la |el )?(sala|salon|espacio|lugar)|quiero (una |la |el )?(sala|salon|reservar|agendar)|ocupo (una |la )?sala|me (puedes |podrias )?(reservar|agendar|apartar))\b/.test(t);
    if (/\b(libre|libres|disponible|disponibles|desocupad[ao]s?|ocupad[ao]s?)\b|\bhay (alguna |una )?sala\b|\bque salas?\b|\bcuales? salas?\b|\besta (libre|ocupad)/.test(t) && !verboReservar) {
      return 'disponibilidad';
    }
    if (verboReservar) return 'reservar';
    if (/\b(ayuda|que puedes hacer|que sabes hacer|como funciona|como te uso|instrucciones|comandos)\b/.test(t)) return 'ayuda';
    if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos|que onda|quiubo|ey)\b/.test(t)) return 'saludo';
    if (/^(gracias|muchas gracias|mil gracias|genial|excelente|super|chivo|chivisimo|buenisimo|perfecto gracias|ok gracias)\b/.test(t)) return 'gracias';
    if (/\b(que hora es|que dia es hoy|que fecha es hoy|a cuanto estamos)\b/.test(t)) return 'hora';
    return 'otro';
  }

  var ORDINALES = { primera: 0, primer: 0, '1ra': 0, segunda: 1, '2da': 1, tercera: 2, '3ra': 2, cuarta: 3, quinta: 4, sexta: 5 };
  /** «la primera», «la segunda», «la 3», «la última» → índice en la última lista mostrada. */
  function extraerReferencia(t) {
    var m = t.match(/\b(?:la|el|esa|numero|opcion|#) ?(primera|primer|1ra|segunda|2da|tercera|3ra|cuarta|quinta|sexta|ultima|\d)\b(?! (?:personas|horas?|minutos|de la|am|pm|y media))/);
    if (!m) return null;
    if (m[1] === 'ultima') return -1;
    if (/^\d$/.test(m[1])) return Number(m[1]) - 1;
    return ORDINALES[m[1]];
  }

  /**
   * Para «mueve mi reunión de mañana a las 3 al jueves a las 4»: separa lo que describe
   * la reunión de origen («de mañana a las 3») del destino («al jueves a las 4»).
   */
  function separarMovimiento(t) {
    var verbo = t.match(VERBO_MOVER);
    var desde = verbo ? verbo.index + verbo[0].length : 0;
    var resto = t.slice(desde);
    var DEST = '(?=(?:el |la |las? )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy|pasado|proxim|siguiente|otro|\\d|una\\b|dos\\b|tres\\b|cuatro\\b|cinco\\b|seis\\b|siete\\b|ocho\\b|nueve\\b|diez\\b|once\\b|doce\\b|medio ?dia|sala|salon|auditorio|cabina|primera hora|la tarde|la manana))';
    var fuerte = new RegExp('\\s(?:para|al|hacia|a)\\s' + DEST, 'g');
    var cortes = [], m;
    while ((m = fuerte.exec(resto))) cortes.push({ i: m.index, fuerte: /^\s(para|al|hacia)\s/.test(m[0]) });
    if (!cortes.length) {
      var sinDesplazamiento = t.replace(new RegExp('\\b(?:' + NUM.slice(1, -1) + '|media|una) (?:horas?|minutos?)\\b|\\bhora y media\\b', 'g'), ' ');
      return { origen: sinDesplazamiento, destino: '', sinDestino: true };
    }
    // Prefiere el último «para/al»; si no hay, el primer «a»
    var fuertes = cortes.filter(function (c) { return c.fuerte; });
    var corte = fuertes.length ? fuertes[fuertes.length - 1] : cortes[0];
    return { origen: t.slice(0, desde) + resto.slice(0, corte.i), destino: resto.slice(corte.i) };
  }

  /** «posponla una hora», «adelántala 30 minutos» → minutos (+/-). */
  function extraerDesplazamiento(t) {
    var m = t.match(new RegExp('\\b(pospon\\w*|posterga\\w*|atrasa\\w*|retrasa\\w*|corre\\w*|recorre\\w*|aplaza\\w*|mueve\\w*|adelanta\\w*)\\b.*?\\b(?:(' + NUM.slice(1, -1) + '|media|una) (horas?|minutos?)|(hora y media))\\b'));
    if (!m) return null;
    var mins = m[5] ? 90 : (m[2] === 'media' ? 0.5 : aNumero(m[2])) * (/hora/.test(m[3]) ? 60 : 1);
    if (!mins) return null;
    if (/\b(antes|mas temprano)\b/.test(t) || /^adelanta/.test(m[1])) mins = -mins;
    return mins;
  }

  /** Cambios a una reunión existente: título, privacidad, asistentes, invitados. */
  function extraerCambios(original, t, personas) {
    var c = {};
    var tit = null;
    if (/(t[ií]tulo|nombre|asunto)/i.test(original)) {
      tit = original.match(/["“«']([^"”»']{2,80})["”»']/) || original.match(/(?:t[ií]tulo|nombre|asunto)\b.*\s(?:a|por|:|como|que diga)\s+(.{2,80})$/i);
    }
    if (tit) c.titulo = capitalizar(tit[1].trim().replace(/[.!]+$/, ''));
    if (/\b(privada|confidencial|en privado)\b/.test(t) && !/\b(no privada|publica|normal)\b/.test(t)) c.privada = true;
    if (/\b(publica|normal|no privada|que la vean todos|quitale lo privado)\b/.test(t)) c.privada = false;
    var n = t.match(new RegExp('\\b(?:ahora somos|ya somos|seremos|somos|para) ' + NUM + '\\b'));
    if (n && /\b(somos|seremos|personas)\b/.test(t)) c.asistentes = aNumero(n[1]);
    var correos = extraerInvitados(original).concat(personas ? personas.emails : []);
    if (correos.length) {
      if (VERBO_QUITAR_PERSONA.test(t) || /\b(quita|saca|elimina|borra|desinvita)\b/.test(t)) c.quitarInvitados = correos;
      else c.invitados = correos;
    }
    return c;
  }

  function parteDelDia(t) {
    var m = t.match(/\b(?:en|por|de) la (manana|tarde)\b|\besta (manana|tarde)\b/);
    return m ? m[1] || m[2] : null;
  }

  /**
   * @param {string} texto
   * @param {{ahora: Date, salas: Array, borrador?: Object}} ctx
   */
  function interpretar(texto, ctx) {
    ctx = ctx || {};
    var ahora = ctx.ahora || new Date();
    var original = limpiarOriginal(String(texto || '').normalize('NFC').replace(/\s+/g, ' ').trim());
    var t = normalizar(original);
    var personas = extraerPersonas(t, ctx.directorio);

    var intencion = detectarIntencion(t, !!ctx.borrador, { personas: personas });
    if (intencion === 'mover') return interpretarMovimiento(original, t, ctx, ahora, personas);
    var recurrencia = extraerRecurrencia(t, ahora);
    // La fecha final de una repetición ("hasta el 15 de diciembre") no es la fecha de la reunión
    var tSinHasta = recurrencia && recurrencia.termina === 'fecha' ? t.replace(/\bhasta (?:el )?.+$/, ' ') : t;
    var relativa = horaRelativa(t, ahora);
    var tSinRelativa = relativa && relativa.texto ? t.replace(relativa.texto, ' ') : t;
    var fecha = extraerFecha(tSinHasta, ahora);
    var horas = extraerHoras(tSinRelativa) || (relativa ? { inicio: relativa.inicio } : null);
    if (relativa && !fecha) fecha = { fecha: fechaTexto(ahora) };
    var duracion = extraerDuracion(tSinRelativa);
    var res = {
      intencion: intencion,
      fecha: fecha ? fecha.fecha : null,
      horaInicio: horas ? minutosATexto(horas.inicio) : null,
      horaFin: horas && horas.fin ? minutosATexto(horas.fin) : null,
      duracionMin: horas && horas.fin ? horas.fin - horas.inicio : duracion,
      asistentes: extraerAsistentes(t),
      salaId: extraerSala(t, ctx.salas),
      titulo: intencion === 'reservar' || intencion === 'otro' ? extraerTitulo(original, t) : null,
      invitados: extraerInvitados(original).concat(personas.emails).filter(function (x, i, a) { return a.indexOf(x) === i; }),
      personasAmbiguas: personas.ambiguas,
      ahora: !!(relativa && relativa.ahora),
      proposito: extraerProposito(t),
      comoSiempre: /\b(como siempre|lo de siempre|lo usual|como de costumbre|la de siempre|la misma de siempre|como la ultima vez)\b/.test(t),
      referencia: extraerReferencia(t),
      recurrencia: recurrencia,
      // Parte del día sin hora ("el jueves en la tarde")
      parteDelDia: horas ? null : parteDelDia(t),
      periodo: /\b(proxima semana|semana que viene|siguiente semana)\b/.test(t) ? 'proxima_semana'
        : /\b(esta semana|la semana)\b/.test(t) ? 'semana' : null,
    };
    if (res.horaInicio && !res.horaFin && res.duracionMin) {
      res.horaFin = minutosATexto(Math.min(23 * 60 + 59, horas.inicio + res.duracionMin));
    }
    if (intencion === 'editar') res.cambios = extraerCambios(original, t, personas);
    if (intencion === 'info') res.equipo = extraerEquipo(t);
    if (intencion === 'quien' && !res.horaInicio && !res.fecha) { res.fecha = fechaTexto(ahora); res.horaInicio = minutosATexto(ahora.getHours() * 60 + ahora.getMinutes()); res.ahora = true; }
    // "Sí, pero a las 4" no es confirmar: es cambiar el borrador
    if (intencion === 'confirmar' && (res.fecha || res.horaInicio || res.salaId || res.asistentes || res.duracionMin || res.recurrencia)) {
      res.intencion = 'modificar';
    }
    // Si el mensaje trae datos de una reunión pero ningún verbo, es para modificar el borrador o reservar
    if (intencion === 'otro' && (res.fecha || res.horaInicio || res.salaId || res.asistentes || res.recurrencia)) {
      res.intencion = ctx.borrador ? 'modificar' : 'reservar';
    }
    if (ctx.borrador && intencion === 'reservar' && !/\b(otra|nueva|ademas|necesito una|quiero una|una sala)\b/.test(t) &&
        !(res.fecha && res.horaInicio && res.salaId)) {
      res.intencion = 'modificar';
    }
    return res;
  }

  /** Para qué es la reunión → qué equipo conviene que tenga la sala. */
  var PROPOSITOS = [
    [/\b(presentacion|presentar|exposicion|exponer|pitch|demo|demostracion|cliente|clientes|informe|resultados)\b/, ['proyector', 'pantalla'], 'para presentar'],
    [/\b(videollamada|videoconferencia|virtual|zoom|meet|teams|remot[oa]s?|hibrida|en linea|online)\b/, ['videoconferencia'], 'para conectarse a distancia'],
    [/\b(lluvia de ideas|brainstorm\w*|taller|planificacion|planeacion|retrospectiva|retro|disenar|diseno|ideacion)\b/, ['pizarra'], 'para trabajar en pizarra'],
    [/\b(capacitacion|charla|conferencia|evento|seminario|asamblea|graduacion|induccion|curso)\b/, ['proyector', 'sonido'], 'para dar una charla'],
  ];
  function extraerProposito(t) {
    var res = [];
    PROPOSITOS.forEach(function (p) {
      if (p[0].test(t)) res.push({ claves: p[1], motivo: p[2], palabras: [].concat.apply([], p[1].map(function (k) { return EQUIPOS[k]; })) });
    });
    if (/\b(entrevista|llamada|uno a uno|1 a 1|1:1|one on one|privado|a solas)\b/.test(t)) res.push({ pequena: true, motivo: 'para una conversación corta' });
    return res;
  }

  /** Equipo que se busca en las salas («con proyector», «que tenga videoconferencia»). */
  var EQUIPOS = {
    proyector: ['proyector', 'canon', 'cañon'], pantalla: ['pantalla', 'tv', 'tele', 'television', 'monitor'],
    videoconferencia: ['videoconferencia', 'videollamada', 'zoom', 'meet', 'teams', 'camara'], pizarra: ['pizarra', 'pizarron'],
    sonido: ['sonido', 'microfono', 'bocinas', 'audio'], escenario: ['escenario'],
  };
  function extraerEquipo(t) {
    return Object.keys(EQUIPOS).filter(function (k) { return EQUIPOS[k].some(function (w) { return new RegExp('\\b' + w).test(t); }); })
      .map(function (k) { return { clave: k, palabras: EQUIPOS[k] }; });
  }

  function interpretarMovimiento(original, t, ctx, ahora, personas) {
    var partes = separarMovimiento(t);
    var origenT = partes.origen.replace(/\bde las?\b/g, 'a las').replace(/\bde la una\b/g, 'a la una');
    var fo = extraerFecha(origenT, ahora), ho = extraerHoras(origenT);
    var fd = partes.sinDestino ? null : extraerFecha(partes.destino, ahora);
    var hd = partes.sinDestino ? null : extraerHoras(partes.destino);
    var desplazamiento = extraerDesplazamiento(t);
    var res = {
      intencion: 'mover',
      origen: {
        fecha: fo ? fo.fecha : null, horaInicio: ho ? minutosATexto(ho.inicio) : null,
        salaId: extraerSala(partes.origen, ctx.salas), texto: partes.origen, referencia: extraerReferencia(partes.origen),
      },
      destino: {
        fecha: fd ? fd.fecha : null, horaInicio: hd ? minutosATexto(hd.inicio) : null, horaFin: hd && hd.fin ? minutosATexto(hd.fin) : null,
        salaId: partes.sinDestino ? null : extraerSala(partes.destino, ctx.salas),
        duracionMin: partes.sinDestino ? null : extraerDuracion(partes.destino),
      },
      desplazamientoMin: desplazamiento,
      referencia: extraerReferencia(t),
      invitados: [], personasAmbiguas: personas.ambiguas,
    };
    // «posponla para mañana» sin hora: conserva la hora original. «mueve la de las 3 a las 4»: misma fecha.
    if (!res.destino.fecha && !res.destino.horaInicio && !res.destino.salaId && !desplazamiento) {
      // Sin destino claro: quizá todo el texto es destino («cámbiala al jueves»)
      var f2 = extraerFecha(partes.destino || t, ahora), h2 = extraerHoras(partes.destino || '');
      if (f2) res.destino.fecha = f2.fecha;
      if (h2) res.destino.horaInicio = minutosATexto(h2.inicio);
    }
    return res;
  }

  return {
    interpretar: interpretar,
    limpiar: limpiar,
    distancia: distancia,
    normalizar: normalizar,
    _privado: { extraerFecha: extraerFecha, extraerHoras: extraerHoras, extraerTitulo: extraerTitulo, minutosATexto: minutosATexto },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Interprete;
