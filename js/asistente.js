/**
 * Asistente de chat: entiende peticiones en español, pregunta lo que falta,
 * propone alternativas y SIEMPRE pide confirmación antes de reservar o cancelar.
 */
var Asistente = (function () {
  'use strict';

  var ctx = null;
  var borrador = null;       // reserva en preparación
  var pendienteCancelar = null;
  var pendienteCambio = null;  // {tipo:'mover'|'editar', reserva, datos} esperando confirmación
  var esperandoDestino = null; // reunión que se quiere mover, falta saber a dónde
  var ultimaLista = [];        // reuniones mostradas en la última lista («la segunda»)
  var foco = null;             // la última reunión de la que se habló («hazla privada»)
  var conectado = false;
  var historial = [];
  var posHistorial = 0;

  /** Dictado por voz con el reconocimiento del navegador (Chrome, Edge, Safari). */
  function iniciarVoz(texto, form) {
    var Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
    var boton = U.$('#asistente-voz');
    if (!Reconocimiento || !boton) return;
    boton.hidden = false;
    var rec = null, escuchando = false;
    function parar() {
      escuchando = false;
      boton.classList.remove('escuchando');
      boton.setAttribute('aria-label', 'Dictar por voz');
      boton.querySelector('.ms').textContent = 'mic';
    }
    boton.addEventListener('click', function () {
      if (escuchando && rec) { rec.stop(); return; }
      rec = new Reconocimiento();
      rec.lang = 'es-SV';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      var final = '';
      rec.onresult = function (ev) {
        var parcial = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
          else parcial += ev.results[i][0].transcript;
        }
        texto.value = (final + parcial).trim();
      };
      rec.onerror = function (ev) {
        parar();
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') App.aviso('Permite el micrófono en el navegador para dictar.');
        else if (ev.error !== 'aborted' && ev.error !== 'no-speech') App.aviso('No pude escucharte. Intenta de nuevo.');
      };
      rec.onend = function () {
        parar();
        if (texto.value.trim()) form.requestSubmit();
      };
      try {
        rec.start();
        escuchando = true;
        boton.classList.add('escuchando');
        boton.setAttribute('aria-label', 'Dejar de escuchar');
        boton.querySelector('.ms').textContent = 'graphic_eq';
        texto.value = '';
        texto.placeholder = 'Te escucho…';
        setTimeout(function () { texto.placeholder = 'Escribe lo que necesitas…'; }, 6000);
      } catch (e) { parar(); }
    });
  }

  var STOP = { para: 1, reunion: 1, reuniones: 1, cancela: 1, cancelar: 1, mi: 1, mis: 1, la: 1, el: 1, de: 1, del: 1, que: 1,
    tengo: 1, sala: 1, una: 1, uno: 1, con: 1, las: 1, los: 1, hoy: 1, manana: 1, junta: 1, reserva: 1, elimina: 1, borra: 1,
    proxima: 1, siguiente: 1, anula: 1, quita: 1, libera: 1, por: 1, favor: 1, mueve: 1, muevela: 1, pasa: 1, pasala: 1, cambia: 1,
    cambiala: 1, posponla: 1, adelanta: 1, adelantala: 1, atrasa: 1, atrasala: 1, invita: 1, agrega: 1, titulo: 1, nombre: 1, hazla: 1,
    ponla: 1, privada: 1, publica: 1, hora: 1, horas: 1, minutos: 1, media: 1, tarde: 1, temprano: 1, antes: 1, despues: 1, cancelala: 1,
    reprograma: 1, reprogramala: 1, primera: 1, segunda: 1, tercera: 1, ultima: 1, lunes: 1, martes: 1, miercoles: 1, jueves: 1, viernes: 1,
    manana_: 1, porfavor: 1, ahora: 1, ahorita: 1 };

  // ------------------------------------------------------------------ DOM
  function zona() { return U.$('#asistente-mensajes'); }
  function abajo() { var z = zona(); z.scrollTop = z.scrollHeight; }
  function p(t) { return '<p>' + t + '</p>'; }
  function b(t) { return '<b>' + U.esc(t) + '</b>'; }

  var conversacion = []; // últimos turnos, para que la IA entienda «esa», «la otra», «mejor el jueves»
  function recordar(rol, texto) {
    texto = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!texto) return;
    conversacion.push({ rol: rol, texto: texto });
    if (conversacion.length > 8) conversacion.shift();
  }

  function msgUsuario(texto) {
    zona().appendChild(U.el('<div class="msg msg-usuario">' + U.esc(texto) + '</div>'));
    recordar('usuario', texto);
    abajo();
  }

  /**
   * @param {string} html
   * @param {{sugerencias?: string[], tarjeta?: Object}} op
   */
  function msgBot(html, op) {
    op = op || {};
    var nodo = U.el('<div class="msg msg-bot"><span class="ms ms-relleno brillo">auto_awesome</span><div class="contenido">' + html + '</div></div>');
    var cont = nodo.querySelector('.contenido');
    if (op.tarjeta) cont.appendChild(op.tarjeta);
    if (op.lista) cont.appendChild(op.lista);
    if (op.sugerencias && op.sugerencias.length) {
      var s = U.el('<div class="sugerencias"></div>');
      op.sugerencias.forEach(function (texto) {
        var boton = U.el('<button type="button" class="sugerencia">' + U.esc(texto) + '</button>');
        boton.addEventListener('click', function () { enviar(texto); });
        s.appendChild(boton);
      });
      cont.appendChild(s);
    }
    if (op.ia || usoIA) cont.appendChild(U.el('<span class="sello-ia" title="Respuesta interpretada con IA (Gemini)"><span class="ms ms-relleno">auto_awesome</span>IA</span>'));
    zona().appendChild(nodo);
    recordar('asistente', cont.innerText || cont.textContent);
    abajo();
    return nodo;
  }

  function escribiendo() {
    var n = U.el('<div class="msg msg-bot"><span class="ms ms-relleno brillo">auto_awesome</span><div class="contenido escribiendo"><span></span><span></span><span></span></div></div>');
    zona().appendChild(n);
    abajo();
    return function () { n.remove(); };
  }

  function tarjeta(color, titulo, subtitulo, filas, acciones) {
    var t = U.el('<div class="tarjeta"><div class="tarjeta-cab" style="--c:' + color + '"><b>' + U.esc(titulo) + '</b><small>' +
      U.esc(subtitulo) + '</small></div><div class="tarjeta-filas">' +
      filas.map(function (f) { return '<div><span class="ms">' + f[0] + '</span><span>' + f[1] + '</span></div>'; }).join('') +
      '</div><div class="tarjeta-acciones"></div></div>');
    var zonaAcc = t.querySelector('.tarjeta-acciones');
    (acciones || []).forEach(function (a) {
      var boton = U.el('<button type="button" class="btn btn-pequeno ' + (a.clase || 'btn-texto') + '">' + U.esc(a.texto) + '</button>');
      boton.addEventListener('click', function () { if (!t.classList.contains('hecha')) a.fn(t); });
      zonaAcc.appendChild(boton);
    });
    return t;
  }

  function listaReservas(reservas, alElegir, textoBoton) {
    ultimaLista = reservas.slice();
    var l = U.el('<div class="lista-mini' + (reservas.length > 1 ? ' numerada' : '') + '"></div>');
    var yo = ctx.usuario();
    reservas.forEach(function (r, i) {
      var s = sala(r.salaId) || { color: '#039be5', nombre: '' };
      var ini = new Date(r.inicio), fin = new Date(r.fin);
      var invitado = r.organizadorEmail !== yo.email && Reglas.esInvitado(r, yo);
      var item = U.el('<button type="button" class="item-mini" style="--c:' + s.color + '">' +
        (reservas.length > 1 ? '<span class="num" aria-hidden="true">' + (i + 1) + '</span>' : '') +
        '<span><b>' + (r.privada ? '<span class="ms ev-icono" aria-label="Privada">lock</span>' : '') + U.esc(r.titulo) + '</b>' +
        '<small>' + U.esc(U.capitalizar(U.fechaMedia(ini))) + ' · ' + U.esc(U.rangoHoras(ini, fin, ctx.formato24)) + ' · ' + U.esc(s.nombre) +
        (invitado ? ' · te invitó ' + U.esc(String(r.organizadorNombre).split(' ')[0]) : '') +
        '</small></span>' + (textoBoton ? '<span class="btn btn-texto btn-pequeno">' + U.esc(textoBoton) + '</span>' : '<span class="ms">chevron_right</span>') + '</button>');
      item.addEventListener('click', function () { foco = r; alElegir(r); });
      l.appendChild(item);
    });
    return l;
  }

  // ------------------------------------------------------------- utilidades
  function sala(id) { return Reglas.buscarSala(ctx.salas(), id); }
  function hora(d) { return U.horaCompacta(d, ctx.formato24); }
  function textoHoraSugerida(min) {
    var d = new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
    if (ctx.formato24) return 'a las ' + U.hhmm(d);
    var h = d.getHours() % 12 || 12;
    return 'a las ' + h + (d.getMinutes() ? ':' + U.dd(d.getMinutes()) : '') + (d.getHours() < 12 ? ' am' : ' pm');
  }
  function combinarMs(fecha, min) { return U.combinar(fecha, U.minutosAHhmm(min)).getTime(); }
  function primerNombre() { return String(ctx.usuario().nombre || '').split(/[\s(]/)[0] || ''; }
  function proximoHabil(desde) {
    var d = U.sumarDias(desde, 1);
    if (!ctx.config().PERMITIR_FINES_DE_SEMANA) while (d.getDay() === 0 || d.getDay() === 6) d = U.sumarDias(d, 1);
    return d;
  }

  // ------------------------------------------------------------- principal
  function iniciar(contexto) {
    ctx = contexto;
    U.$('#asistente-modo').textContent = ctx.config().IA_DISPONIBLE
      ? 'Con IA · siempre confirma antes de reservar'
      : 'Siempre confirma antes de reservar';
    if (!conectado) {
      conectado = true;
      var form = U.$('#asistente-form'), texto = U.$('#asistente-texto');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = texto.value.trim();
        if (!v) return;
        texto.value = '';
        texto.style.height = '';
        if (historial[historial.length - 1] !== v) historial.push(v);
        if (historial.length > 30) historial.shift();
        posHistorial = historial.length;
        enviar(v);
      });
      texto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); return; }
        // Flecha arriba/abajo: recorrer lo que ya escribiste (como en una terminal)
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && historial.length && (!texto.value || texto.dataset.historial)) {
          e.preventDefault();
          posHistorial = Math.max(0, Math.min(historial.length, posHistorial + (e.key === 'ArrowUp' ? -1 : 1)));
          texto.value = historial[posHistorial] || '';
          texto.dataset.historial = texto.value ? '1' : '';
        }
      });
      texto.addEventListener('input', function () { texto.dataset.historial = ''; });
      iniciarVoz(texto, form);
      texto.addEventListener('input', function () {
        texto.style.height = 'auto';
        texto.style.height = Math.min(texto.scrollHeight, 140) + 'px';
      });
      U.$('#asistente-limpiar').addEventListener('click', reiniciar);
    }
    reiniciar();
  }

  function reiniciar() {
    zona().innerHTML = '';
    conversacion = [];
    borrador = null;
    pendienteCancelar = null;
    pendienteCambio = null;
    esperandoDestino = null;
    ultimaLista = [];
    foco = null;
    var manana = U.relativa(proximoHabil(new Date()));
    var h = new Date().getHours();
    var saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    var tarde = h >= 16;
    msgBot(p(saludo + (primerNombre() ? ', ' + U.esc(primerNombre()) : '') + '. Puedo <b>reservar</b>, <b>mover</b> o <b>cancelar</b> reuniones, ' +
      'decirte <b>qué salas están libres</b> y <b>quién tiene una sala</b>.') +
      p('Escríbeme como le escribirías a un colega' + (window.SpeechRecognition || window.webkitSpeechRecognition ? ', o díctame con el micrófono' : '') + ':'), {
      sugerencias: [
        tarde ? 'Reserva una sala ' + manana + ' a primera hora para 6' : 'Necesito una sala ahorita para 4 personas',
        '¿Qué salas están libres ' + manana + ' en la tarde?',
        'Mis reuniones de esta semana',
        '¿Qué salas tienen proyector?',
      ],
    });
  }

  function enviar(texto) {
    msgUsuario(texto);
    var fin = escribiendo();
    var inicio = Date.now();
    return procesar(texto).catch(function (e) {
      return { error: e };
    }).then(function (res) {
      var espera = Math.max(0, 350 - (Date.now() - inicio));
      setTimeout(function () {
        fin();
        if (res && res.error) {
          msgBot(p(U.esc(res.error.message || 'Algo salió mal. Intenta de nuevo.')));
        } else if (res && res.mostrar) {
          res.mostrar();
        }
        usoIA = false;
      }, espera);
    });
  }

  /** Devuelve {mostrar: fn} para pintar la respuesta después del indicador "escribiendo". */
  function procesar(texto) {
    var especial = window.Huevos && Huevos.responder(texto);
    if (especial) return Promise.resolve(responder(especial));
    var salas = ctx.salas();
    var r = Interprete.interpretar(texto, {
      ahora: new Date(), salas: salas, directorio: ctx.directorio ? ctx.directorio() : [],
      borrador: borrador || (pendienteCancelar || pendienteCambio ? {} : null),
    });
    r._texto = texto;
    // Esperando a dónde mover una reunión: «al jueves», «a las 4», «a la sala creativa»
    var tn = Interprete.normalizar(texto);
    var rel = tn.match(/\b(\d+|una|media|dos|tres) (horas?|minutos) (mas tarde|despues|antes|mas temprano)\b/);
    var traeDestino = r.fecha || r.horaInicio || r.salaId || rel || /\botra sala\b/.test(tn);
    if ((esperandoDestino || (pendienteCambio && pendienteCambio.tipo === 'mover')) && traeDestino &&
        ['reservar', 'modificar', 'otro', 'disponibilidad'].indexOf(r.intencion) !== -1) {
      var objetivo = esperandoDestino || pendienteCambio.reserva;
      var delta = null;
      if (rel) {
        var n = rel[1] === 'una' ? 1 : rel[1] === 'media' ? 0.5 : rel[1] === 'dos' ? 2 : rel[1] === 'tres' ? 3 : Number(rel[1]);
        delta = n * (/hora/.test(rel[2]) ? 60 : 1) * (/antes|temprano/.test(rel[3]) ? -1 : 1);
      }
      return Promise.resolve(prepararMovimiento(objetivo, {
        fecha: r.fecha, horaInicio: r.horaInicio, horaFin: r.horaFin, salaId: r.salaId, duracionMin: r.duracionMin,
        otraSala: /\botra sala\b/.test(tn) && !r.salaId,
      }, delta));
    }
    if (borrador && borrador.conflictosSerie && /\b(solo las|las libres|las disponibles|omite|omitir)\b/.test(Interprete.normalizar(texto))) {
      r.intencion = 'confirmar';
      borrador.omitirConflictos = true;
    }
    if (r.intencion === 'otro' && borrador && (r.titulo || r.invitados.length)) r.intencion = 'modificar';

    var palabrasTexto = texto.trim().split(/\s+/).length;
    var necesitaIA = ctx.config().IA_DISPONIBLE && (r.intencion === 'otro' ||
      ((r.intencion === 'reservar' || r.intencion === 'modificar') && !r.fecha && !r.horaInicio && !r.salaId && !r.asistentes) ||
      (r.intencion === 'reservar' && palabrasTexto >= 14 && (!r.fecha || !r.horaInicio)) ||
      (r.intencion === 'mover' && !(r.destino && (r.destino.fecha || r.destino.horaInicio || r.destino.salaId)) && !r.desplazamientoMin && palabrasTexto >= 6) ||
      /\?$/.test(texto.trim()) && r.intencion === 'disponibilidad' && !r.fecha && !r.salaId && palabrasTexto >= 10);
    var paso = necesitaIA
      ? ctx.api().interpretar(texto, { borrador: borrador, historial: conversacion.slice(0, -1) }).then(function (ia) {
        return ia && ia.disponible ? fusionarIA(r, ia.resultado) : r;
      }).catch(function () { return r; })
      : Promise.resolve(r);

    return paso.then(function (r2) {
      usoIA = !!r2._ia;
      // Un tema nuevo cierra el borrador anterior (para que no se arrastre la sala o la hora)
      if (['info', 'quien', 'proximo_libre', 'listar', 'cancelar', 'mover', 'editar', 'ayuda', 'recomendar', 'resumen', 'buscar_horario', 'conversar'].indexOf(r2.intencion) !== -1) {
        borrador = null;
        if (r2.intencion !== 'mover') esperandoDestino = null;
      }
      switch (r2.intencion) {
        case 'saludo': return responder(p('¡Hola! ¿Qué necesitas?'), { sugerencias: ['¿Qué puedes hacer?', '¿Qué salas están libres ahorita?', 'Mis reuniones de hoy'] });
        case 'hora': return responder(p('Son las ' + U.esc(hora(new Date())) + ' del ' + U.esc(U.fechaLarga(new Date())) + '.'));
        case 'mover': return flujoMover(r2, texto);
        case 'editar': return flujoEditar(r2, texto);
        case 'info': return flujoInfo(r2);
        case 'quien': return flujoQuien(r2);
        case 'proximo_libre': return flujoProximoLibre(r2);
        case 'duplicar': return flujoDuplicar(r2);
        case 'recomendar': return flujoRecomendar(r2);
        case 'resumen': return flujoResumen(r2);
        case 'buscar_horario': return flujoBuscarHorario(r2);
        case 'conversar': return responder(p(U.esc(r2.respuesta || '').replace(/\n/g, '<br>')), { sugerencias: (r2.sugerencias || []).slice(0, 3), ia: true });
        case 'gracias': return responder(p('¡Con gusto! Aquí estoy si necesitas otra sala.'));
        case 'ayuda': return ayuda();
        case 'confirmar': return confirmarPendiente();
        case 'negar': return descartar();
        case 'cancelar': return flujoCancelar(r2, texto);
        case 'listar': return flujoListar(r2);
        case 'disponibilidad': return flujoDisponibilidad(r2);
        case 'reservar': return flujoReservar(r2, false);
        case 'modificar': return flujoReservar(r2, true);
        default:
          return responder(p('No entendí bien. Prueba con algo como:') +
            '<ul><li>«Reserva la sala creativa el jueves de 9 a 10»</li><li>«¿Qué salas están libres mañana a las 3?»</li>' +
            '<li>«Mueve mi reunión de mañana al viernes»</li><li>«¿Quién tiene el auditorio?»</li></ul>',
          { sugerencias: ['¿Qué puedes hacer?'] });
      }
    });
  }

  function responder(html, op) { return { mostrar: function () { msgBot(html, op); } }; }
  var usoIA = false; // el mensaje actual se interpretó con IA

  function fusionarIA(local, ia) {
    var r = Object.assign({}, local, { _ia: true });
    if (local.intencion === 'otro' && ia.intencion) r.intencion = ia.intencion === 'reservar' && borrador ? 'modificar' : ia.intencion;
    ['fecha', 'horaInicio', 'horaFin', 'asistentes', 'titulo', 'duracionMin'].forEach(function (k) {
      if (ia[k] !== null && ia[k] !== undefined && ia[k] !== '') r[k] = ia[k];
    });
    if (ia.salaId && sala(ia.salaId)) r.salaId = ia.salaId;
    if (ia.invitados && ia.invitados.length) r.invitados = ia.invitados;
    if (r.horaInicio && !r.horaFin && r.duracionMin) {
      r.horaFin = U.minutosAHhmm(Math.min(1439, Reglas.aMinutos(r.horaInicio) + Number(r.duracionMin)));
    }
    if (ia.intencion === 'conversar' && ia.respuesta) { r.intencion = 'conversar'; r.respuesta = ia.respuesta; r.sugerencias = ia.sugerencias || []; }
    else if (local.intencion !== 'otro' && ia.intencion && ia.intencion !== local.intencion && ia.intencion !== 'otro') {
      // La IA entendió otra cosa (frase larga o ambigua): manda la IA
      r.intencion = ia.intencion === 'reservar' && borrador ? 'modificar' : ia.intencion;
    }
    if (ia.origen || ia.destino) {
      r.origen = Object.assign({ texto: ia.origen && ia.origen.titulo ? ia.origen.titulo : '' }, r.origen || {}, limpio(ia.origen));
      r.destino = Object.assign({}, r.destino || {}, limpio(ia.destino));
      if (r.destino.salaId && !sala(r.destino.salaId)) r.destino.salaId = null;
    }
    if (ia.desplazamientoMin) r.desplazamientoMin = ia.desplazamientoMin;
    // La numeración de la IA es la de la agenda que vio en el servidor, no la de la última lista: se usa el origen
    if (ia.origen && r.referencia === undefined) r.referencia = null;
    if (ia.cambios) r.cambios = Object.assign({}, r.cambios || {}, limpio(ia.cambios));
    if (ia.equipo && ia.equipo.length && !(r.equipo && r.equipo.length)) {
      r.equipo = Interprete.interpretar('salas con ' + ia.equipo.join(' '), { salas: [] }).equipo || [];
    }
    if (ia.proposito && !(r.proposito && r.proposito.length)) r.proposito = Interprete.interpretar(ia.proposito, { salas: [] }).proposito || [];
    if (r.intencion === 'mover' && !r.destino) {
      r.origen = { texto: '' };
      r.destino = { fecha: ia.fecha || null, horaInicio: ia.horaInicio || null, horaFin: ia.horaFin || null, salaId: ia.salaId || null, duracionMin: null };
    }
    if (!r.invitados) r.invitados = [];
    return r;
  }
  function limpio(o) {
    var x = {};
    Object.keys(o || {}).forEach(function (k) { if (o[k] !== null && o[k] !== undefined && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) x[k] = o[k]; });
    return x;
  }

  function ayuda() {
    return responder(
      p('Esto es lo que puedo hacer:') +
      '<ul><li><b>Reservar</b>: «Agenda una reunión de planificación el jueves de 9 a 10:30 para 8 personas»</li>' +
      '<li><b>Elegir sala por ti</b>: si no dices cuál, uso la más pequeña que esté libre y quepan todos</li>' +
      '<li><b>Disponibilidad</b>: «¿Qué salas están libres mañana a las 3?» o «¿Está libre el auditorio el viernes?»</li>' +
      '<li><b>Tus reuniones</b>: «Mis reuniones de esta semana»</li>' +
      '<li><b>Mover</b>: «Mueve mi reunión de mañana al jueves a las 4», «Posponla una hora», «Pásala a la sala ejecutiva»</li>' +
      '<li><b>Cambiar</b>: «Invita a María a mi reunión del viernes», «Hazla privada», «Cambia el título a "Cierre de mes"»</li>' +
      '<li><b>Cancelar</b>: «Cancela mi reunión de mañana a las 10» o, después de una lista, «cancela la segunda»</li>' +
      '<li><b>Repetir</b>: «Otra igual el viernes»</li>' +
      '<li><b>Salas</b>: «¿Qué salas tienen proyector?», «¿Cuántos caben en el auditorio?», «¿Quién tiene la sala creativa?», «¿Cuándo está libre la cabina?»</li>' +
      '<li><b>Invitar</b>: escribe correos o nombres de personas que ya usan el sistema</li></ul>' +
      p('Entiendo cosas como «ahorita», «en 20 minutos», «a primera hora» o «después del almuerzo». Antes de reservar, mover o cancelar siempre te pido confirmación.'),
      { sugerencias: ['Mis reuniones de hoy', '¿Qué salas tienen proyector?'] });
  }

  function descartar() {
    var habia = borrador || pendienteCancelar || pendienteCambio || esperandoDestino;
    borrador = null;
    pendienteCancelar = null;
    pendienteCambio = null;
    esperandoDestino = null;
    U.$$('.tarjeta:not(.hecha)', zona()).forEach(function (t) { t.classList.add('hecha'); });
    return responder(p(habia ? 'Listo, lo descarté. ¿Algo más?' : 'De acuerdo.'));
  }

  // --------------------------------------------------------------- reservar
  function flujoReservar(r, esModificacion) {
    var b = esModificacion && borrador ? Object.assign({}, borrador) : {
      titulo: null, salaId: null, salaFija: false, fecha: null, horaInicio: null, horaFin: null, duracionMin: null,
      asistentes: null, invitados: [],
    };
    pendienteCancelar = null;
    pendienteCambio = null;
    esperandoDestino = null;
    if (r.titulo) b.titulo = r.titulo;
    if (r.fecha) { b.fecha = r.fecha; b.fechaAsumida = false; }
    if (r.asistentes) b.asistentes = r.asistentes;
    if (r.salaId) { b.salaId = r.salaId; b.salaFija = true; }
    if (r.recurrencia) b.recurrencia = r.recurrencia;
    if (/\b(no (se )?repit|sin repetir|solo (esta|una) vez|una sola vez)\b/.test(Interprete.normalizar(r._texto || ''))) b.recurrencia = null;
    var textoNorm = Interprete.normalizar(r._texto || '');
    if (/\b(no privad[ao]s?|publica|que (la )?vean todos)\b/.test(textoNorm)) b.privada = false;
    else if (/\b(privad[ao]s?|confidencial(es)?|en privado)\b/.test(textoNorm)) b.privada = true;
    if (r.invitados && r.invitados.length) {
      b.invitados = b.invitados.concat(r.invitados).filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    if (r.personasAmbiguas && r.personasAmbiguas.length) {
      borrador = b;
      var amb = r.personasAmbiguas[0];
      return responder(p('Conozco a varias personas llamadas <b>' + U.esc(U.capitalizar(amb.nombre)) + '</b>. ¿A quién invito?'),
        { sugerencias: amb.opciones.map(function (c) { return 'Invita a ' + c; }) });
    }
    if (r.horaInicio) {
      var duracionPrevia = b.horaInicio && b.horaFin ? Reglas.aMinutos(b.horaFin) - Reglas.aMinutos(b.horaInicio) : null;
      b.horaInicio = r.horaInicio;
      b.horaFin = r.horaFin || null;
      b.duracionMin = r.duracionMin || b.duracionMin || duracionPrevia;
    } else if (r.duracionMin) {
      b.duracionMin = r.duracionMin;
      b.horaFin = null;
    }
    if (r.salaId === null && esModificacion && (r.asistentes || r.horaInicio || r.fecha) && !b.salaFija) b.salaId = null;
    if (r.proposito && r.proposito.length) b.proposito = r.proposito;
    borrador = b;
    return obtenerHabitos().then(function (h) {
      if (r.comoSiempre && !esModificacion) {
        var palabras = Interprete.normalizar(r.titulo || r._texto || '').split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; });
        var base = h.frecuentes.filter(function (f) {
          var t = Interprete.normalizar(f.titulo);
          return palabras.some(function (w) { return t.indexOf(w) !== -1; });
        })[0] || h.frecuentes[0];
        if (base) return duplicarDesde(base.ultima, r, 'como siempre');
      }
      // Lo usual para esta persona, si no lo dijo
      if (!b.asistentes && h.asistentes) { b.asistentesSugeridos = h.asistentes; }
      if (!b.horaFin && !b.duracionMin && h.duracion && h.duracion !== 60) { b.duracionMin = h.duracion; b.duracionHabitual = true; }
      if (!b.salaFija && h.salaFavorita) b.salaPreferidaSuave = h.salaFavorita;
      return completar(b, r);
    });
  }

  function completar(b, r) {
    var ahora = new Date();
    var cfg = ctx.config();

    if (!b.fecha && b.recurrencia && b.recurrencia.dias && b.recurrencia.dias.length) {
      var objetivo = b.recurrencia.dias[0] % 7;
      var d0 = U.inicioDia(ahora);
      for (var k = 0; k < 8; k++) {
        var cand = U.sumarDias(d0, k);
        if (cand.getDay() === objetivo && (!b.horaInicio || U.combinar(U.claveDia(cand), b.horaInicio) > ahora)) { b.fecha = U.claveDia(cand); break; }
      }
    }
    if (!b.fecha && b.horaInicio) {
      var hoy = U.claveDia(ahora);
      b.fecha = U.combinar(hoy, b.horaInicio) > ahora ? hoy : U.claveDia(proximoHabil(ahora));
      b.fechaAsumida = true;
    }
    if (!b.fecha) {
      var dHabil = proximoHabil(ahora);
      return responder(p('¿Para qué día?'), { sugerencias: ['Hoy', U.capitalizar(U.relativa(dHabil)), 'El ' + U.DIAS[proximoHabil(dHabil).getDay()]] });
    }
    var dia = U.desdeClave(b.fecha);
    if (!cfg.PERMITIR_FINES_DE_SEMANA && (dia.getDay() === 0 || dia.getDay() === 6)) {
      b.fecha = null;
      return responder(p('Las salas no se reservan en fin de semana. ¿Qué otro día te sirve?'),
        { sugerencias: [U.capitalizar(U.relativa(proximoHabil(dia)))] });
    }

    var asistentes = b.asistentes || b.asistentesSugeridos || 2;
    return ctx.obtenerReservas(dia, U.sumarDias(dia, 1)).then(function (lista) {
      if (!b.horaInicio) {
        var sug = huecosSugeridos(b, lista, asistentes, r.parteDelDia);
        return responder(p('¿A qué hora ' + U.esc(U.relativa(dia)) + '?' + (sug.length ? ' Estos horarios tienen sala libre:' : '')),
          { sugerencias: sug });
      }
      var iniMin = Reglas.aMinutos(b.horaInicio);
      var finMin = b.horaFin ? Reglas.aMinutos(b.horaFin) : iniMin + (Number(b.duracionMin) || 60);
      if (finMin <= iniMin) finMin = iniMin + 60;
      b.horaFin = U.minutosAHhmm(Math.min(finMin, 1439));
      var inicio = U.combinar(b.fecha, b.horaInicio), fin = U.combinar(b.fecha, b.horaFin);
      var salas = ctx.salas();
      if (b.recurrencia) return completarSerie(b, inicio, fin, asistentes, salas, cfg);

      if (!b.salaFija) {
        var libres = Reglas.salasDisponibles(salas, lista, inicio, fin, asistentes, ctx.partes);
        if (!libres.length) {
          b.salaId = null;
          var alternativas = horasAlternativas(lista, b, asistentes, finMin - iniMin);
          return responder(
            p('No hay ninguna sala libre ' + U.esc(U.relativa(dia)) + ' de ' + U.esc(U.rangoHoras(inicio, fin, ctx.formato24)) +
              ' para ' + asistentes + ' personas.') + (alternativas.length ? p('Estos horarios sí tienen sala:') : p('Prueba otro día.')),
            { sugerencias: alternativas });
        }
        var preferida = b.salaPreferida && libres.filter(function (s) { return s.id === b.salaPreferida; })[0];
        b.motivoSala = '';
        if (!preferida && b.proposito && b.proposito.length) {
          var conEquipo = libres.map(function (s) { return { s: s, e: encajaProposito(s, b.proposito) }; })
            .filter(function (x) { return x.e.puntos > 0; })
            .sort(function (a, c) { return c.e.puntos - a.e.puntos || a.s.capacidad - c.s.capacidad; })[0];
          if (conEquipo) { preferida = conEquipo.s; b.motivoSala = conEquipo.e.motivos[0]; }
        }
        if (!preferida && b.salaPreferidaSuave) {
          var fav = libres.filter(function (s) { return s.id === b.salaPreferidaSuave; })[0];
          // la favorita, solo si no desperdicia mucho espacio
          if (fav && fav.capacidad <= Math.max(asistentes * 3, libres[0].capacidad * 2)) { preferida = fav; b.motivoSala = 'la que más usas'; }
        }
        b.salaId = preferida ? preferida.id : libres[0].id;
        b.otras = libres.filter(function (s) { return s.id !== b.salaId; }).slice(0, 3).map(function (s) { return s.id; });
      }

      var reserva = {
        titulo: b.titulo || 'Reunión', salaId: b.salaId, inicio: inicio.toISOString(), fin: fin.toISOString(),
        asistentes: asistentes, invitados: b.invitados, recurrencia: b.recurrencia || null, privada: !!b.privada,
      };
      var errores = Reglas.validar(reserva, { salas: salas, reservas: lista, ahora: new Date(), config: cfg, partes: ctx.partes });
      if (errores.length) {
        var otrasSalas = Reglas.salasDisponibles(salas, lista, inicio, fin, asistentes, ctx.partes)
          .filter(function (s) { return s.id !== b.salaId; }).slice(0, 3);
        var horas = b.salaFija ? horasAlternativas(lista, b, asistentes, finMin - iniMin, b.salaId) : [];
        var sugerencias = otrasSalas.map(function (s) { return 'En ' + s.nombre; }).concat(horas);
        return responder(
          p('Así no se puede:') + '<ul>' + errores.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>' +
          (sugerencias.length ? p('Alternativas:') : ''), { sugerencias: sugerencias });
      }
      b.choquePropio = choquePropio(lista, inicio, fin, null);
      return { mostrar: function () { mostrarConfirmacion(b, reserva); } };
    });
  }

  /** ¿Ya tienes otra reunión (tuya o a la que te invitaron) a esa hora? */
  function choquePropio(lista, inicio, fin, excepto) {
    var yo = ctx.usuario();
    return lista.filter(function (x) {
      return x.estado === 'confirmada' && x.id !== excepto && !x.oculta &&
        (x.organizadorEmail === yo.email || Reglas.esInvitado(x, yo)) && Reglas.seCruzan(inicio, fin, x.inicio, x.fin);
    })[0] || null;
  }

  /** Series: revisa todas las fechas, elige la sala con menos choques y avisa cuáles se omitirán. */
  function completarSerie(b, inicio, fin, asistentes, salas, cfg) {
    var fechas = Recurrencia.expandir(inicio, fin, b.recurrencia);
    var ultima = fechas[fechas.length - 1].fin;
    var hasta = new Date(Math.min(U.sumarDias(ultima, 1).getTime(), U.sumarDias(inicio, 95).getTime()));
    return ctx.obtenerReservas(U.inicioDia(inicio), hasta).then(function (todas) {
      var candidatas = b.salaFija ? [sala(b.salaId)] : Reglas.salasDisponibles(salas, [], inicio, fin, asistentes, ctx.partes);
      if (!candidatas.length || !candidatas[0]) {
        return responder(p('No hay salas para ' + asistentes + ' personas abiertas en ese horario.'));
      }
      var puntuadas = candidatas.map(function (s) {
        var choques = fechas.filter(function (x) { return Reglas.buscarChoque(s.id, x.inicio, x.fin, todas); });
        return { s: s, choques: choques };
      }).sort(function (a, c) { return a.choques.length - c.choques.length || a.s.capacidad - c.s.capacidad; });
      var mejor = puntuadas[0];
      b.salaId = mejor.s.id;
      b.otras = b.salaFija ? [] : puntuadas.slice(1, 4).filter(function (x) { return x.choques.length <= mejor.choques.length; }).map(function (x) { return x.s.id; });
      var reserva = {
        titulo: b.titulo || 'Reunión', salaId: b.salaId, inicio: inicio.toISOString(), fin: fin.toISOString(),
        asistentes: asistentes, invitados: b.invitados, recurrencia: b.recurrencia, privada: !!b.privada,
      };
      var errores = Reglas.validar(reserva, { salas: salas, reservas: [], ahora: new Date(), config: cfg, partes: ctx.partes });
      if (errores.length) {
        return responder(p('Así no se puede:') + '<ul>' + errores.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>');
      }
      if (mejor.choques.length === fechas.length) {
        return responder(p('Todas las fechas de esa serie chocan con otras reuniones en <b>' + U.esc(mejor.s.nombre) + '</b>. Prueba otra hora.'),
          { sugerencias: ['A las 8 am', 'A las 11 am', 'A las 2 pm'] });
      }
      b.conflictosSerie = mejor.choques.length > 0;
      b.omitirConflictos = mejor.choques.length > 0;
      return { mostrar: function () { mostrarConfirmacion(b, reserva, mejor.choques); } };
    });
  }

  function huecosSugeridos(b, lista, asistentes, parte) {
    var salas = b.salaFija ? [sala(b.salaId)] : ctx.salas().filter(function (s) { return s.capacidad >= asistentes; });
    var duracion = Number(b.duracionMin) || 60;
    var desde = Math.max(Date.now(), U.desdeClave(b.fecha).getTime());
    var opciones = {};
    salas.forEach(function (s) {
      if (!s) return;
      Reglas.huecosLibres(s, lista, b.fecha, combinarMs, desde, duracion).forEach(function (h) {
        for (var t = h.inicio; t + duracion * 60000 <= h.fin; t += 30 * 60000) {
          var m = U.minutosDelDia(new Date(t));
          if (m % 30) continue;
          if (parte === 'manana' && m >= 12 * 60) continue;
          if (parte === 'tarde' && m < 12 * 60) continue;
          opciones[m] = true;
        }
      });
    });
    var mins = Object.keys(opciones).map(Number).sort(function (a, b2) { return a - b2; });
    // Repartir sugerencias a lo largo del día
    var elegidos = [];
    var paso = Math.max(1, Math.floor(mins.length / 4));
    for (var i = 0; i < mins.length && elegidos.length < 4; i += paso) elegidos.push(mins[i]);
    return elegidos.map(function (m) { return U.capitalizar(textoHoraSugerida(m)); });
  }

  function horasAlternativas(lista, b, asistentes, duracion, soloSalaId) {
    var objetivo = Reglas.aMinutos(b.horaInicio);
    var salas = soloSalaId ? [sala(soloSalaId)] : ctx.salas().filter(function (s) { return s.capacidad >= asistentes; });
    var desde = Math.max(Date.now(), U.desdeClave(b.fecha).getTime());
    var candidatos = {};
    salas.forEach(function (s) {
      Reglas.huecosLibres(s, lista, b.fecha, combinarMs, desde, duracion).forEach(function (h) {
        for (var t = h.inicio; t + duracion * 60000 <= h.fin; t += 15 * 60000) {
          var m = U.minutosDelDia(new Date(t));
          if (m % 30 === 0) candidatos[m] = Math.abs(m - objetivo);
        }
      });
    });
    return Object.keys(candidatos).map(Number)
      .sort(function (a, c) { return candidatos[a] - candidatos[c]; })
      .slice(0, 3).sort(function (a, c) { return a - c; })
      .map(function (m) { return U.capitalizar(textoHoraSugerida(m)); });
  }

  function mostrarConfirmacion(b, reserva, choques) {
    var s = sala(reserva.salaId);
    var ini = new Date(reserva.inicio), fin = new Date(reserva.fin);
    var dur = (fin - ini) / 60000;
    var filas = [
      ['schedule', U.esc(U.rangoHoras(ini, fin, ctx.formato24)) + ' <span style="color:var(--texto-3)">(' + U.duracionTexto(dur) + (b.duracionHabitual ? ', lo que suelen durar tus reuniones' : '') + ')</span>'],
      ['meeting_room', U.esc(s.nombre) + (s.ubicacion ? ' · ' + U.esc(s.ubicacion) : '') +
        (!b.salaFija ? ' <span style="color:var(--texto-3)">· elegida por mí' + (b.motivoSala ? ': ' + U.esc(b.motivoSala) : '') + '</span>' : '')],
      ['group', reserva.asistentes + ' personas' + (b.asistentes ? '' : b.asistentesSugeridos ? ' <span style="color:var(--texto-3)">(lo usual en tus reuniones)</span>' : ' <span style="color:var(--texto-3)">(dime si son más)</span>')],
    ];
    if (reserva.recurrencia) {
      var fechas = Recurrencia.expandir(reserva.inicio, reserva.fin, reserva.recurrencia);
      filas.push(['repeat', U.esc(Recurrencia.describir(reserva.recurrencia, reserva.inicio)) + ' <span style="color:var(--texto-3)">(' + fechas.length + ' reuniones)</span>']);
      if (choques && choques.length) {
        filas.push(['warning', '<span style="color:var(--peligro)">' + choques.length + (choques.length === 1 ? ' fecha está ocupada' : ' fechas están ocupadas') +
          ' (' + choques.slice(0, 3).map(function (x) { return U.esc(U.fechaMedia(x.inicio)); }).join(', ') + (choques.length > 3 ? '…' : '') +
          '): reservaré solo las ' + (fechas.length - choques.length) + ' libres</span>']);
      }
    }
    if (b.choquePropio) {
      filas.push(['event_busy', '<span style="color:var(--peligro)">A esa hora ya tienes «' + U.esc(b.choquePropio.titulo) + '» (' +
        U.esc(U.rangoHoras(new Date(b.choquePropio.inicio), new Date(b.choquePropio.fin), ctx.formato24)) + ')</span>']);
    }
    if (reserva.invitados.length) filas.push(['mail', reserva.invitados.map(U.esc).join(', ')]);
    if (reserva.privada) filas.push(['lock', 'Privada: los demás solo verán «Reservada»']);
    if (ctx.config().SINCRONIZAR_CALENDAR) filas.push(['event_available', 'Se agregará a Google Calendar']);

    var rel = U.relativa(ini);
    var subtitulo = U.capitalizar(U.fechaLarga(ini)) + (/^(hoy|mañana|pasado mañana)$/.test(rel) ? ' · ' + rel : '') +
      (b.fechaAsumida ? ' (asumí este día)' : '');
    var t = tarjeta(s.color, reserva.titulo, subtitulo, filas, [
      { texto: 'Confirmar', clase: 'btn-relleno', fn: function () { enviar('Sí, confirmo'); } },
      { texto: 'Editar detalles', clase: 'btn-tonal', fn: function (tj) { tj.classList.add('hecha'); abrirEnEditor(b, reserva); } },
      { texto: 'Descartar', fn: function () { enviar('No, descártalo'); } },
    ]);
    var sugerencias = (b.otras || []).map(function (id) { return 'En ' + sala(id).nombre; });
    msgBot(p('¿Reservo esto?' + (b.titulo ? '' : ' Si quieres un título, escribe por ejemplo: <i>título: Revisión de presupuesto</i>.')),
      { tarjeta: t, sugerencias: sugerencias });
  }

  function abrirEnEditor(b, reserva) {
    var ini = new Date(reserva.inicio), fin = new Date(reserva.fin);
    ctx.abrirEditor({
      fecha: U.inicioDia(ini), inicioMin: U.minutosDelDia(ini), finMin: U.minutosDelDia(fin), salaId: reserva.salaId,
      titulo: b.titulo || '', asistentes: reserva.asistentes, invitados: reserva.invitados, privada: !!reserva.privada,
    });
    borrador = null;
    msgBot(p('Abrí el formulario con esos datos para que ajustes lo que quieras.'));
  }

  function confirmarPendiente() {
    if (pendienteCancelar) return ejecutarCancelacion(pendienteCancelar);
    if (pendienteCambio) return ejecutarCambio(pendienteCambio);
    if (!borrador || !borrador.salaId || !borrador.horaInicio || !borrador.fecha) {
      return responder(p('No tengo nada pendiente por confirmar. ¿Qué quieres reservar?'));
    }
    var b2 = borrador;
    var datos = {
      titulo: b2.titulo || 'Reunión', salaId: b2.salaId,
      inicio: U.combinar(b2.fecha, b2.horaInicio).toISOString(), fin: U.combinar(b2.fecha, b2.horaFin).toISOString(),
      asistentes: b2.asistentes || b2.asistentesSugeridos || 2, invitados: b2.invitados || [], descripcion: 'Creada con el asistente.',
      privada: !!b2.privada,
    };
    if (b2.recurrencia) { datos.recurrencia = b2.recurrencia; datos.omitirConflictos = !!b2.omitirConflictos; }
    return ctx.api().crear(datos).then(function (r) {
      borrador = null;
      foco = r;
      App.alReservar(r);
      ctx.alCambiar(r);
      return {
        mostrar: function () {
          U.$$('.tarjeta:not(.hecha)', zona()).forEach(function (t) { t.classList.add('hecha'); });
          var s = sala(r.salaId);
          var t = tarjeta(s.color, '✓ ' + r.titulo, r.serie && r.serie.creadas > 1 ? r.serie.creadas + ' reuniones reservadas' +
            (r.serie.omitidas ? ' (' + r.serie.omitidas + ' omitidas)' : '') : 'Reservada', [
            ['schedule', U.esc(U.capitalizar(U.relativa(new Date(r.inicio)))) + ', ' + U.esc(U.rangoHoras(new Date(r.inicio), new Date(r.fin), ctx.formato24))],
            ['meeting_room', U.esc(s.nombre)],
          ].concat(r.enCalendar ? [['event_available', 'Invitación enviada por Google Calendar']] : []), [
            { texto: 'Ver en el calendario', clase: 'btn-tonal', fn: function () { ctx.verReserva(r); } },
            { texto: 'Deshacer', fn: function (tj) { tj.classList.add('hecha'); ejecutarCancelacion(r, true, 'serie').then(function (x) { x.mostrar(); }); } },
          ]);
          msgBot(p('¡Listo! Tu sala está reservada.'), { tarjeta: t, sugerencias: ['Otra igual la próxima semana', 'Hazla privada', 'Mis reuniones de esta semana'] });
        },
      };
    }).catch(function (e) {
      if (e.codigo === 'conflictos_serie' && e.detalles) {
        b2.conflictosSerie = true;
        var x = e.detalles;
        return responder(p(U.esc(e.message)) + '<ul>' + x.conflictos.slice(0, 5).map(function (c) {
          return '<li><b>' + U.esc(U.capitalizar(U.fechaMedia(new Date(c.inicio)))) + '</b>: ' + U.esc(c.motivo) + '</li>';
        }).join('') + '</ul>' + (x.disponibles ? p('¿Reservo solo las ' + x.disponibles + ' fechas libres?') : p('Prueba otro horario u otra sala.')),
        { sugerencias: x.disponibles ? ['Sí, solo las libres', 'No'] : [] });
      }
      var errores = Array.isArray(e.detalles) ? e.detalles : [e.message];
      ctx.alCambiar();
      return responder(p('No se pudo reservar:') + '<ul>' + errores.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>' +
        p('Dime otra hora u otra sala y lo intento de nuevo.'));
    });
  }

  // ---------------------------------------------------------- disponibilidad
  function flujoDisponibilidad(r) {
    var dia = r.fecha ? U.desdeClave(r.fecha) : U.inicioDia(new Date());
    var asistentes = r.asistentes || 1;
    var salas = ctx.salas();
    return ctx.obtenerReservas(dia, U.sumarDias(dia, 1)).then(function (lista) {
      var clave = U.claveDia(dia);
      if (r.horaInicio) {
        var inicio = U.combinar(clave, r.horaInicio);
        var fin = r.horaFin ? U.combinar(clave, r.horaFin) : new Date(inicio.getTime() + (r.duracionMin || 60) * 60000);
        var candidatas = r.salaId ? salas.filter(function (s) { return s.id === r.salaId; }) : salas;
        var libres = Reglas.salasDisponibles(candidatas, lista, inicio, fin, asistentes, ctx.partes);
        var cuando = U.relativa(dia) + ' de ' + U.rangoHoras(inicio, fin, ctx.formato24);
        if (r.salaId) {
          var s = sala(r.salaId);
          if (libres.length) {
            borrador = { titulo: null, salaId: s.id, salaFija: true, fecha: clave, horaInicio: U.hhmm(inicio), horaFin: U.hhmm(fin), asistentes: r.asistentes, invitados: [] };
            return responder(p('Sí, ' + b(s.nombre) + ' está libre ' + U.esc(cuando) + '. ¿La reservo?'), { sugerencias: ['Sí, resérvala', 'No'] });
          }
          var choque = Reglas.buscarChoque(s.id, inicio, fin, lista);
          return responder(p(b(s.nombre) + ' no está disponible ' + U.esc(cuando) +
            (choque ? ': está ocupada de ' + U.esc(U.rangoHoras(new Date(choque.inicio), new Date(choque.fin), ctx.formato24)) + '.' : '.')));
        }
        if (!libres.length) return responder(p('No hay salas libres ' + U.esc(cuando) + ' para ' + asistentes + ' personas.'));
        var l = U.el('<div class="lista-mini"></div>');
        libres.forEach(function (s) {
          var item = U.el('<button type="button" class="item-mini" style="--c:' + s.color + '"><span><b>' + U.esc(s.nombre) + '</b><small>' +
            s.capacidad + ' personas' + (s.ubicacion ? ' · ' + U.esc(s.ubicacion) : '') + '</small></span><span class="btn btn-texto btn-pequeno">Reservar</span></button>');
          item.addEventListener('click', function () {
            borrador = { titulo: null, salaId: s.id, salaFija: true, fecha: clave, horaInicio: U.hhmm(inicio), horaFin: U.hhmm(fin), asistentes: r.asistentes, invitados: [] };
            enviar('Reservar ' + s.nombre);
          });
          l.appendChild(item);
        });
        return { mostrar: function () { msgBot(p(libres.length + (libres.length === 1 ? ' sala libre ' : ' salas libres ') + U.esc(cuando) + ':'), { lista: l }); } };
      }

      // Sin hora: huecos libres del día por sala
      var desde = Math.max(Date.now(), dia.getTime());
      var filas = (r.salaId ? salas.filter(function (s) { return s.id === r.salaId; }) : salas.filter(function (s) { return s.capacidad >= asistentes; }))
        .map(function (s) {
          var huecos = Reglas.huecosLibres(s, lista, clave, combinarMs, desde, 30).filter(function (h) {
            var m = U.minutosDelDia(new Date(h.inicio));
            if (r.parteDelDia === 'manana') return m < 12 * 60;
            if (r.parteDelDia === 'tarde') return U.minutosDelDia(new Date(h.fin)) > 12 * 60;
            return true;
          });
          return { s: s, huecos: huecos };
        }).filter(function (x) { return x.huecos.length; });
      if (!filas.length) return responder(p('No quedan espacios libres ' + U.esc(U.relativa(dia)) + '.'));
      var html = p('Espacios libres ' + U.esc(U.relativa(dia)) + (r.parteDelDia ? (r.parteDelDia === 'manana' ? ' en la mañana' : ' en la tarde') : '') + ':') + '<ul>' +
        filas.map(function (x) {
          return '<li><b>' + U.esc(x.s.nombre) + '</b>: ' + x.huecos.slice(0, 3).map(function (h) {
            return U.esc(U.rangoHoras(new Date(h.inicio), new Date(h.fin), ctx.formato24));
          }).join(', ') + '</li>';
        }).join('') + '</ul>';
      var primerHueco = Math.min.apply(null, filas.map(function (x) { return x.huecos[0].inicio; }));
      var minuto = Math.ceil(U.minutosDelDia(new Date(primerHueco)) / 30) * 30;
      return responder(html, { sugerencias: ['Reserva ' + U.relativa(dia) + ' ' + textoHoraSugerida(minuto)] });
    });
  }

  // ------------------------------------------------------------------ listar
  function flujoListar(r) {
    var hoy = U.inicioDia(new Date());
    var desde, hasta, titulo;
    if (r.periodo === 'semana') { desde = U.inicioSemana(hoy); hasta = U.sumarDias(desde, 7); titulo = 'esta semana'; }
    else if (r.periodo === 'proxima_semana') { desde = U.sumarDias(U.inicioSemana(hoy), 7); hasta = U.sumarDias(desde, 7); titulo = 'la próxima semana'; }
    else if (r.fecha) { desde = U.desdeClave(r.fecha); hasta = U.sumarDias(desde, 1); titulo = U.relativa(desde); }
    else { desde = hoy; hasta = U.sumarDias(hoy, 14); titulo = 'los próximos 14 días'; }
    return ctx.obtenerReservas(desde, hasta).then(function (lista) {
      var yo = ctx.usuario();
      var soloInvitaciones = /\b(invitaron|invitaciones|me invitaron)\b/.test(Interprete.normalizar(r._texto || ''));
      var mias = lista.filter(function (x) {
        if (x.oculta || x.estado !== 'confirmada' || new Date(x.fin) <= new Date()) return false;
        var propia = x.organizadorEmail === yo.email, invitado = Reglas.esInvitado(x, yo);
        return soloInvitaciones ? invitado && !propia : propia || invitado;
      }).sort(function (a, c) { return new Date(a.inicio) - new Date(c.inicio); });
      if (!mias.length) {
        return responder(p(soloInvitaciones ? 'No tienes invitaciones pendientes ' + U.esc(titulo) + '.' : 'No tienes reuniones pendientes ' + U.esc(titulo) + '.'),
          { sugerencias: ['Reservar una sala'] });
      }
      var horas = mias.reduce(function (t, x) { return t + (new Date(x.fin) - new Date(x.inicio)) / 3600000; }, 0);
      return {
        mostrar: function () {
          msgBot(p((soloInvitaciones ? 'Te invitaron a ' : 'Tienes ') + mias.length + (mias.length === 1 ? ' reunión ' : ' reuniones ') + U.esc(titulo) +
            (mias.length > 1 ? ' <span class="tenue">(' + U.esc(String(Math.round(horas * 10) / 10).replace('.', ',')) + ' h en total)</span>' : '') + ':'),
            { lista: listaReservas(mias.slice(0, 12), function (x) { ctx.verReserva(x); }),
              sugerencias: mias.length > 1 ? ['Mueve la primera una hora más tarde', 'Cancela la última'] : [] });
        },
      };
    });
  }

  // ---------------------------------------------------------------- cancelar
  function flujoCancelar(r, texto) {
    borrador = null;
    var ahora = new Date();
    return ctx.obtenerReservas(U.inicioDia(ahora), U.sumarDias(ahora, 90)).then(function (lista) {
      var yo = ctx.usuario();
      var mias = lista.filter(function (x) { return x.puedeEditar && x.organizadorEmail === yo.email && new Date(x.fin) > ahora; })
        .sort(function (a, c) { return new Date(a.inicio) - new Date(c.inicio); });
      var cand = mias;
      var ref = referenciaDe(r);
      if (ref) return { mostrar: function () { pedirConfirmacionCancelar(ref); } };
      var sinCriterios = !r.fecha && !r.horaInicio && !r.salaId && !/\b(proxima|siguiente)\b/.test(Interprete.normalizar(texto));
      if (sinCriterios && foco && /\b(cancelala|cancelalo|eliminala|borrala|anulala|esa|esta)\b/.test(Interprete.normalizar(texto))) {
        var f = mias.filter(function (x) { return x.id === foco.id; })[0];
        if (f) return { mostrar: function () { pedirConfirmacionCancelar(f); } };
      }
      if (r.fecha) cand = cand.filter(function (x) { return U.claveDia(new Date(x.inicio)) === r.fecha; });
      if (r.horaInicio) cand = cand.filter(function (x) { return Math.abs(U.minutosDelDia(new Date(x.inicio)) - Reglas.aMinutos(r.horaInicio)) <= 30; });
      if (r.salaId) cand = cand.filter(function (x) { return x.salaId === r.salaId; });
      var palabras = Interprete.normalizar(texto).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; });
      if (palabras.length) {
        var porTitulo = cand.filter(function (x) {
          var t = Interprete.normalizar(x.titulo);
          return palabras.some(function (w) { return t.indexOf(w) !== -1; });
        });
        if (porTitulo.length) cand = porTitulo;
      }
      if (/\b(proxima|siguiente)\b/.test(Interprete.normalizar(texto)) && cand.length) cand = [cand[0]];

      if (!cand.length) {
        if (!mias.length) return responder(p('No tienes reuniones próximas para cancelar.'));
        return {
          mostrar: function () {
            msgBot(p('No encontré una reunión tuya que coincida. Estas son tus próximas:'),
              { lista: listaReservas(mias.slice(0, 5), pedirConfirmacionCancelar, 'Cancelar') });
          },
        };
      }
      if (cand.length === 1) return { mostrar: function () { pedirConfirmacionCancelar(cand[0]); } };
      return {
        mostrar: function () {
          msgBot(p('Encontré ' + cand.length + ' reuniones. ¿Cuál cancelo?'), { lista: listaReservas(cand.slice(0, 6), pedirConfirmacionCancelar, 'Cancelar') });
        },
      };
    });
  }

  function pedirConfirmacionCancelar(r) {
    pendienteCancelar = r;
    pendienteCambio = null;
    foco = r;
    var s = sala(r.salaId) || { color: '#039be5', nombre: '' };
    var ini = new Date(r.inicio);
    var t = tarjeta(s.color, r.titulo, U.capitalizar(U.relativa(ini)), [
      ['schedule', U.esc(U.rangoHoras(ini, new Date(r.fin), ctx.formato24))],
      ['meeting_room', U.esc(s.nombre)],
    ], [
      { texto: 'Sí, cancelar', clase: 'btn-relleno', fn: function () { enviar('Sí, cancélala'); } },
      { texto: 'No', fn: function () { enviar('No'); } },
    ]);
    msgBot(p('¿Cancelo esta reunión? La sala quedará libre.'), { tarjeta: t });
  }

  function ejecutarCancelacion(r, esDeshacer, alcance) {
    pendienteCancelar = null;
    return ctx.api().cancelar(r.id, '', alcance || 'una').then(function (x) {
      ctx.alCambiar();
      return {
        mostrar: function () {
          U.$$('.tarjeta:not(.hecha)', zona()).forEach(function (t) { t.classList.add('hecha'); });
          msgBot(p(esDeshacer ? 'Deshecho: ' + (x && x.canceladas > 1 ? 'se cancelaron las ' + x.canceladas + ' reuniones.' : 'la reserva se canceló.')
            : 'Listo, cancelé ' + b(r.titulo) + '. La sala quedó libre.'));
        },
      };
    }).catch(function (e) { return responder(p(U.esc(e.message))); });
  }

  // =================================================================== v2.6
  /** «la segunda» de la última lista mostrada. */
  function referenciaDe(r) {
    var i = r.referencia !== undefined && r.referencia !== null ? r.referencia : r.origen && r.origen.referencia;
    if (i === null || i === undefined || !ultimaLista.length) return null;
    return ultimaLista[i < 0 ? ultimaLista.length + i : i] || null;
  }

  /**
   * Encuentra una reunión propia (o que puedes editar) según fecha, hora, sala, título,
   * una referencia a la lista anterior o la reunión de la que se venía hablando.
   * Devuelve una promesa con {reserva} o con {mostrar} (si hay que preguntar).
   */
  function buscarReunion(criterios, texto, verbo, alElegir) {
    var ahora = new Date();
    return ctx.obtenerReservas(U.inicioDia(ahora), U.sumarDias(ahora, 90)).then(function (lista) {
      var yo = ctx.usuario();
      var mias = lista.filter(function (x) {
        return x.puedeEditar && x.estado === 'confirmada' && new Date(x.fin) > ahora &&
          (x.organizadorEmail === yo.email || yo.rol === 'admin' && foco && foco.id === x.id);
      }).sort(function (a, c) { return new Date(a.inicio) - new Date(c.inicio); });
      var ref = referenciaDe(criterios);
      if (ref) {
        var r0 = lista.filter(function (x) { return x.id === ref.id; })[0] || ref;
        if (!r0.puedeEditar) return responder(p('Esa reunión no es tuya: solo quien la organizó o un administrador puede cambiarla.'));
        return { reserva: r0 };
      }
      var cand = mias;
      if (criterios.fecha) cand = cand.filter(function (x) { return U.claveDia(new Date(x.inicio)) === criterios.fecha; });
      if (criterios.horaInicio) cand = cand.filter(function (x) { return Math.abs(U.minutosDelDia(new Date(x.inicio)) - Reglas.aMinutos(criterios.horaInicio)) <= 30; });
      if (criterios.salaId) cand = cand.filter(function (x) { return x.salaId === criterios.salaId; });
      var palabras = Interprete.normalizar(texto).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; });
      if (palabras.length) {
        var porTitulo = cand.filter(function (x) {
          var t = Interprete.normalizar(x.titulo);
          return palabras.some(function (w) { return t.indexOf(w) !== -1; });
        });
        if (porTitulo.length) cand = porTitulo;
      }
      var sinCriterios = !criterios.fecha && !criterios.horaInicio && !criterios.salaId && cand.length === mias.length;
      if (sinCriterios && foco) {
        var enFoco = lista.filter(function (x) { return x.id === foco.id && x.puedeEditar && new Date(x.fin) > ahora; })[0];
        if (enFoco) return { reserva: enFoco };
      }
      if (/\b(proxima|siguiente)\b/.test(Interprete.normalizar(texto)) && cand.length) cand = [cand[0]];
      if (cand.length === 1) return { reserva: cand[0] };
      if (!mias.length) return responder(p('No tienes reuniones próximas para ' + verbo + '.'));
      var opciones = (cand.length ? cand : mias).slice(0, 6);
      return {
        mostrar: function () {
          msgBot(p(cand.length ? '¿Cuál de estas quieres ' + verbo + '?' : 'No encontré una reunión tuya que coincida. ¿Es alguna de estas?'),
            { lista: listaReservas(opciones, alElegir, U.capitalizar(verbo)) });
        },
      };
    });
  }

  // ------------------------------------------------------------------ mover
  function flujoMover(r, texto) {
    borrador = null;
    pendienteCancelar = null;
    var o = r.origen || {};
    return buscarReunion({ fecha: o.fecha, horaInicio: o.horaInicio, salaId: o.salaId, referencia: r.referencia, origen: o }, o.texto || texto, 'mover',
      function (elegida) {
        foco = elegida;
        var x = prepararMovimiento(elegida, r.destino || {}, r.desplazamientoMin);
        if (x && x.then) x.then(function (y) { y.mostrar(); }); else x.mostrar();
      }).then(function (res) {
      if (!res.reserva) return res;
      foco = res.reserva;
      return prepararMovimiento(res.reserva, r.destino || {}, r.desplazamientoMin);
    });
  }

  /** Calcula el nuevo horario/sala, valida y muestra «antes → después» para confirmar. */
  function prepararMovimiento(original, destino, desplazamiento) {
    var ini0 = new Date(original.inicio), fin0 = new Date(original.fin);
    var dur = (fin0 - ini0) / 60000;
    var fecha = destino.fecha || U.claveDia(ini0);
    var iniMin = destino.horaInicio ? Reglas.aMinutos(destino.horaInicio) : U.minutosDelDia(ini0);
    if (desplazamiento) iniMin += desplazamiento;
    var nuevaDur = destino.horaFin ? Reglas.aMinutos(destino.horaFin) - iniMin : destino.duracionMin || dur;
    if (nuevaDur <= 0) nuevaDur = dur;
    var salaFija = !!destino.salaId;
    var salaId = destino.salaId || original.salaId;
    if (!destino.fecha && !destino.horaInicio && !destino.salaId && !desplazamiento && !destino.duracionMin && !destino.otraSala) {
      esperandoDestino = original;
      pendienteCambio = null;
      var s0 = sala(original.salaId) || { color: '#039be5', nombre: '' };
      return Promise.resolve(responder(p('¿A dónde muevo ' + b(original.titulo) + ' (' + U.esc(U.relativa(ini0)) + ', ' +
        U.esc(U.rangoHoras(ini0, fin0, ctx.formato24)) + ', ' + U.esc(s0.nombre) + ')? Dime el día, la hora o la sala.'),
        { sugerencias: ['Una hora más tarde', 'Al ' + U.DIAS[proximoHabil(ini0).getDay()] + ' a la misma hora', 'A otra sala'] }));
    }
    esperandoDestino = null;
    var inicio = U.combinar(fecha, U.minutosAHhmm(Math.max(0, Math.min(iniMin, 1425))));
    var fin = new Date(inicio.getTime() + nuevaDur * 60000);
    var dia = U.inicioDia(inicio);
    return ctx.obtenerReservas(dia, U.sumarDias(dia, 1)).then(function (lista) {
      var cfg = ctx.config();
      var cambiada = Object.assign({}, original, { inicio: inicio.toISOString(), fin: fin.toISOString(), salaId: salaId });
      if (destino.otraSala) {
        var libresOtra = Reglas.salasDisponibles(ctx.salas(), lista.filter(function (x) { return x.id !== original.id; }), inicio, fin, original.asistentes, ctx.partes)
          .filter(function (x) { return x.id !== original.salaId; });
        if (!libresOtra.length) return responder(p('No hay otra sala libre a esa hora para ' + original.asistentes + ' personas.'));
        cambiada.salaId = libresOtra[0].id;
        salaFija = true;
      }
      var errores = Reglas.validar(cambiada, { salas: ctx.salas(), reservas: lista, ahora: new Date(), config: cfg, partes: ctx.partes, original: original });
      var nota = '';
      if (errores.length && !salaFija) {
        // La sala original está ocupada a esa hora: buscar otra donde quepan
        var otras = Reglas.salasDisponibles(ctx.salas(), lista.filter(function (x) { return x.id !== original.id; }), inicio, fin, original.asistentes, ctx.partes);
        if (otras.length) {
          cambiada.salaId = otras[0].id;
          var errores2 = Reglas.validar(cambiada, { salas: ctx.salas(), reservas: lista, ahora: new Date(), config: cfg, partes: ctx.partes, original: original });
          if (!errores2.length) {
            nota = (sala(original.salaId) || {}).nombre + ' está ocupada a esa hora, así que te propongo ' + otras[0].nombre + '.';
            errores = [];
          }
        }
      }
      if (errores.length) {
        pendienteCambio = null;
        esperandoDestino = original;
        var alternativas = horasAlternativas(lista.filter(function (x) { return x.id !== original.id; }),
          { fecha: fecha, horaInicio: U.minutosAHhmm(iniMin) }, original.asistentes, nuevaDur, salaFija ? salaId : null);
        return responder(p('No puedo moverla ahí:') + '<ul>' + errores.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>' +
          (alternativas.length ? p('Ese día estos horarios sí tienen sala:') : p('Dime otro día u hora.')), { sugerencias: alternativas });
      }
      var propio = choquePropio(lista, inicio, fin, original.id);
      var datos = { id: original.id, inicio: cambiada.inicio, fin: cambiada.fin, salaId: cambiada.salaId };
      pendienteCambio = { tipo: 'mover', reserva: original, datos: datos };
      return { mostrar: function () { tarjetaCambio(original, cambiada, nota, propio); } };
    });
  }

  function tarjetaCambio(original, cambiada, nota, propio, cambiosTexto) {
    var s0 = sala(original.salaId) || { color: '#039be5', nombre: '' }, s1 = sala(cambiada.salaId) || s0;
    var i0 = new Date(original.inicio), f0 = new Date(original.fin), i1 = new Date(cambiada.inicio), f1 = new Date(cambiada.fin);
    var texto = function (i, f, s) { return U.capitalizar(U.fechaMedia(i)) + ', ' + U.rangoHoras(i, f, ctx.formato24) + ' · ' + s.nombre; };
    var filas = cambiosTexto ? cambiosTexto.map(function (c) { return c; }) : [
      ['history', '<span class="tachado">' + U.esc(texto(i0, f0, s0)) + '</span>'],
      ['arrow_forward', '<b>' + U.esc(texto(i1, f1, s1)) + '</b>'],
    ];
    if (original.serieId && !cambiosTexto) filas.push(['repeat', 'Solo cambia esta fecha de la serie']);
    if (propio) filas.push(['event_busy', '<span style="color:var(--peligro)">A esa hora ya tienes «' + U.esc(propio.titulo) + '»</span>']);
    if (original.invitados && original.invitados.length && ctx.config().SINCRONIZAR_CALENDAR) filas.push(['mail', 'Google Calendar avisará a los invitados']);
    var t = tarjeta(s1.color, original.titulo, cambiosTexto ? 'Cambios' : 'Mover reunión', filas, [
      { texto: 'Confirmar', clase: 'btn-relleno', fn: function () { enviar('Sí, confirmo'); } },
      { texto: 'Descartar', fn: function () { enviar('No, descártalo'); } },
    ]);
    msgBot(p((nota ? U.esc(nota) + ' ' : '') + '¿Hago este cambio?'), { tarjeta: t });
  }

  function ejecutarCambio(c) {
    pendienteCambio = null;
    return ctx.api().actualizar(c.datos).then(function (r) {
      foco = r;
      ctx.alCambiar(r);
      return {
        mostrar: function () {
          U.$$('.tarjeta:not(.hecha)', zona()).forEach(function (t) { t.classList.add('hecha'); });
          var s = sala(r.salaId) || { color: '#039be5', nombre: '' };
          var t = tarjeta(s.color, '✓ ' + r.titulo, c.tipo === 'mover' ? 'Movida' : 'Actualizada', [
            ['schedule', U.esc(U.capitalizar(U.relativa(new Date(r.inicio)))) + ', ' + U.esc(U.rangoHoras(new Date(r.inicio), new Date(r.fin), ctx.formato24))],
            ['meeting_room', U.esc(s.nombre)],
          ].concat(r.privada ? [['lock', 'Privada']] : []).concat(r.invitados && r.invitados.length ? [['group', r.invitados.map(U.esc).join(', ')]] : []), [
            { texto: 'Ver en el calendario', clase: 'btn-tonal', fn: function () { ctx.verReserva(r); } },
          ]);
          msgBot(p('Listo, ' + (c.tipo === 'mover' ? 'la moví.' : 'guardé los cambios.')), { tarjeta: t });
        },
      };
    }).catch(function (e) {
      var errores = Array.isArray(e.detalles) ? e.detalles : [e.message];
      return responder(p('No se pudo:') + '<ul>' + errores.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>');
    });
  }

  // ----------------------------------------------------------------- editar
  function flujoEditar(r, texto) {
    borrador = null;
    pendienteCancelar = null;
    if (r.personasAmbiguas && r.personasAmbiguas.length) {
      var amb = r.personasAmbiguas[0];
      return responder(p('Conozco a varias personas llamadas ' + b(U.capitalizar(amb.nombre)) + '. ¿A quién te refieres?'),
        { sugerencias: amb.opciones.map(function (c) { return 'Invita a ' + c + ' a esa reunión'; }) });
    }
    var cambios = r.cambios || {};
    if (!Object.keys(cambios).length) return responder(p('¿Qué quieres cambiar? Puedo invitar personas, cambiar el título, el número de personas o hacerla privada.'));
    var o = r.origen || {};
    return buscarReunion({ fecha: o.fecha || r.fecha, horaInicio: o.horaInicio || r.horaInicio, salaId: o.salaId || r.salaId, referencia: r.referencia },
      o.texto || texto, 'cambiar', function (elegida) {
      foco = elegida;
      prepararEdicion(elegida, cambios).mostrar();
    }).then(function (res) {
      if (!res.reserva) return res;
      foco = res.reserva;
      return prepararEdicion(res.reserva, cambios);
    });
  }

  function prepararEdicion(original, cambios) {
    var datos = { id: original.id };
    var filas = [];
    if (cambios.titulo) { datos.titulo = cambios.titulo; filas.push(['title', 'Título: <span class="tachado">' + U.esc(original.titulo) + '</span> → <b>' + U.esc(cambios.titulo) + '</b>']); }
    if (cambios.privada !== undefined && cambios.privada !== !!original.privada) {
      datos.privada = cambios.privada;
      filas.push([cambios.privada ? 'lock' : 'lock_open', cambios.privada ? '<b>Privada</b>: los demás solo verán «Reservada»' : '<b>Ya no será privada</b>: todos verán el título']);
    }
    if (cambios.asistentes) {
      var s = sala(original.salaId);
      if (s && cambios.asistentes > s.capacidad) {
        return responder(p(U.esc(s.nombre) + ' es para ' + s.capacidad + ' personas y serían ' + cambios.asistentes + '. ¿La muevo a una sala más grande?'),
          { sugerencias: ctx.salas().filter(function (x) { return x.capacidad >= cambios.asistentes; }).slice(0, 3).map(function (x) { return 'Pásala a ' + x.nombre; }) });
      }
      datos.asistentes = cambios.asistentes;
      filas.push(['group', 'Personas: ' + original.asistentes + ' → <b>' + cambios.asistentes + '</b>']);
    }
    var actuales = (original.invitados || []).slice();
    if (cambios.invitados) {
      var nuevos = cambios.invitados.filter(function (c) { return actuales.indexOf(c) === -1 && c !== original.organizadorEmail; });
      if (nuevos.length) { datos.invitados = actuales.concat(nuevos); filas.push(['person_add', 'Invitar: <b>' + nuevos.map(U.esc).join(', ') + '</b>']); }
    }
    if (cambios.quitarInvitados) {
      var quitar = cambios.quitarInvitados.filter(function (c) { return actuales.indexOf(c) !== -1; });
      if (quitar.length) {
        datos.invitados = (datos.invitados || actuales).filter(function (c) { return quitar.indexOf(c) === -1; });
        filas.push(['person_remove', 'Quitar: <b>' + quitar.map(U.esc).join(', ') + '</b>']);
      }
    }
    if (!filas.length) return responder(p(b(original.titulo) + ' ya está así; no hay nada que cambiar.'));
    pendienteCambio = { tipo: 'editar', reserva: original, datos: datos };
    return { mostrar: function () { tarjetaCambio(original, original, '', null, filas); } };
  }

  // ------------------------------------------------------------------ salas
  function flujoInfo(r) {
    var salas = ctx.salas();
    if (r.salaId) {
      var s = sala(r.salaId);
      var ahora = new Date();
      return ctx.obtenerReservas(U.inicioDia(ahora), U.sumarDias(U.inicioDia(ahora), 1)).then(function (lista) {
        var actual = lista.filter(function (x) { return x.salaId === s.id && x.estado === 'confirmada' && new Date(x.inicio) <= ahora && new Date(x.fin) > ahora; })[0];
        var filas = [
          ['group', 'Hasta ' + s.capacidad + ' personas'],
          s.ubicacion ? ['location_on', U.esc(s.ubicacion)] : null,
          ['schedule', 'Abre de ' + U.esc(U.rangoHoras(U.combinar(U.claveDia(ahora), s.apertura), U.combinar(U.claveDia(ahora), s.cierre), ctx.formato24))],
          s.equipamiento ? ['devices', U.esc(s.equipamiento)] : null,
          s.descripcion ? ['info', U.esc(s.descripcion)] : null,
          [actual ? 'do_not_disturb_on' : 'check_circle', actual ? 'Ocupada ahora hasta las ' + U.esc(hora(new Date(actual.fin))) : 'Libre ahora'],
        ].filter(Boolean);
        var t = tarjeta(s.color, s.nombre, 'Información de la sala', filas, [
          { texto: 'Reservar', clase: 'btn-relleno', fn: function () { enviar('Reserva ' + s.nombre); } },
          { texto: '¿Cuándo está libre?', clase: 'btn-tonal', fn: function () { enviar('¿Cuándo está libre ' + s.nombre + '?'); } },
        ]);
        return { mostrar: function () { msgBot('', { tarjeta: t }); } };
      });
    }
    var lista = salas;
    var titulo = 'Estas son las ' + salas.length + ' salas:';
    if (r.equipo && r.equipo.length) {
      lista = salas.filter(function (s) {
        var eq = Interprete.normalizar((s.equipamiento || '') + ' ' + (s.descripcion || ''));
        return r.equipo.every(function (e) { return e.palabras.some(function (w) { return eq.indexOf(Interprete.normalizar(w)) !== -1; }); });
      });
      var nombreEq = r.equipo.map(function (e) { return e.clave; }).join(' y ');
      if (!lista.length) return Promise.resolve(responder(p('Ninguna sala tiene ' + U.esc(nombreEq) + ' registrado. Un administrador puede agregarlo en el equipamiento de cada sala.')));
      titulo = (lista.length === 1 ? 'Esta sala tiene ' : 'Estas salas tienen ') + U.esc(nombreEq) + ':';
    }
    if (r.asistentes) lista = lista.filter(function (s) { return s.capacidad >= r.asistentes; });
    lista = lista.slice().sort(function (a, c) { return a.capacidad - c.capacidad; });
    var l = U.el('<div class="lista-mini"></div>');
    lista.forEach(function (s) {
      var item = U.el('<button type="button" class="item-mini" style="--c:' + s.color + '"><span><b>' + U.esc(s.nombre) + '</b><small>' +
        s.capacidad + ' personas' + (s.ubicacion ? ' · ' + U.esc(s.ubicacion) : '') + (s.equipamiento ? ' · ' + U.esc(s.equipamiento) : '') +
        '</small></span><span class="ms">chevron_right</span></button>');
      item.addEventListener('click', function () { enviar('Información de ' + s.nombre); });
      l.appendChild(item);
    });
    return Promise.resolve({ mostrar: function () { msgBot(p(titulo), { lista: l }); } });
  }

  function flujoQuien(r) {
    var fecha = r.fecha || U.claveDia(new Date());
    var momento = r.horaInicio ? U.combinar(fecha, r.horaInicio) : new Date();
    var dia = U.desdeClave(fecha);
    return ctx.obtenerReservas(dia, U.sumarDias(dia, 1)).then(function (lista) {
      var activas = lista.filter(function (x) { return x.estado === 'confirmada' && new Date(x.inicio) <= momento && new Date(x.fin) > momento; });
      var cuando = r.ahora ? 'ahora' : U.relativa(dia) + ' a las ' + hora(momento);
      var describir = function (x) {
        var s = sala(x.salaId) || { nombre: '' };
        var rango = U.rangoHoras(new Date(x.inicio), new Date(x.fin), ctx.formato24);
        if (x.oculta) return b(s.nombre) + ' está reservada (reunión privada) de ' + U.esc(rango) + '.';
        return b(s.nombre) + ' la tiene ' + b(x.organizadorNombre) + ' para «' + U.esc(x.titulo) + '», de ' + U.esc(rango) + '.';
      };
      if (r.salaId) {
        var s = sala(r.salaId);
        var x = activas.filter(function (a) { return a.salaId === r.salaId; })[0];
        if (x) return responder(p(describir(x)), { sugerencias: ['¿Cuándo está libre ' + s.nombre + '?'] });
        var siguiente = lista.filter(function (a) { return a.salaId === r.salaId && a.estado === 'confirmada' && new Date(a.inicio) > momento; })
          .sort(function (a, c) { return new Date(a.inicio) - new Date(c.inicio); })[0];
        return responder(p(b(s.nombre) + ' está libre ' + U.esc(cuando) + (siguiente ? ' hasta las ' + U.esc(hora(new Date(siguiente.inicio))).replace(/\.$/, '') + '.' : ' el resto del día.')),
          { sugerencias: ['Reserva ' + s.nombre + ' ' + (r.ahora ? 'ahorita' : U.relativa(dia) + ' ' + textoHoraSugerida(U.minutosDelDia(momento)))] });
      }
      if (!activas.length) return responder(p('No hay ninguna sala ocupada ' + U.esc(cuando) + '.'));
      return responder(p('Ocupadas ' + U.esc(cuando) + ':') + '<ul>' + activas.map(function (a) { return '<li>' + describir(a) + '</li>'; }).join('') + '</ul>');
    });
  }

  /** Busca el primer espacio libre en los próximos días hábiles. */
  function flujoProximoLibre(r) {
    var asistentes = r.asistentes || 1;
    var duracion = r.duracionMin || 60;
    var salas = r.salaId ? [sala(r.salaId)] : ctx.salas().filter(function (s) { return s.capacidad >= asistentes; });
    if (!salas.length || !salas[0]) return Promise.resolve(responder(p('No hay salas para ' + asistentes + ' personas.')));
    var desde = r.fecha ? U.desdeClave(r.fecha) : U.inicioDia(new Date());
    return ctx.obtenerReservas(desde, U.sumarDias(desde, 15)).then(function (lista) {
      var opciones = [];
      for (var i = 0; i < 15 && opciones.length < 4; i++) {
        var d = U.sumarDias(desde, i);
        if (!ctx.config().PERMITIR_FINES_DE_SEMANA && (d.getDay() === 0 || d.getDay() === 6)) continue;
        var clave = U.claveDia(d);
        var minimo = Math.max(Date.now(), d.getTime());
        var mejor = null;
        salas.forEach(function (s) {
          Reglas.huecosLibres(s, lista, clave, combinarMs, minimo, duracion).forEach(function (h) {
            var ini = Math.ceil(h.inicio / (15 * 60000)) * 15 * 60000;
            var m = U.minutosDelDia(new Date(ini));
            if (r.parteDelDia === 'manana' && m >= 12 * 60) return;
            if (r.parteDelDia === 'tarde' && m < 12 * 60) return;
            if (ini + duracion * 60000 > h.fin) return;
            if (!mejor || ini < mejor.ini || (ini === mejor.ini && s.capacidad < mejor.s.capacidad)) mejor = { ini: ini, fin: h.fin, s: s };
          });
        });
        if (mejor) opciones.push(mejor);
      }
      if (!opciones.length) return responder(p('No encontré espacios libres en las próximas dos semanas.'));
      var quien = r.salaId ? b(salas[0].nombre) + ' está libre' : 'Hay sala libre';
      var primera = opciones[0];
      var texto = p(quien + ' desde ' + b(U.relativa(new Date(primera.ini)) + ' a las ' + hora(new Date(primera.ini))) +
        (r.salaId ? '' : ' (' + U.esc(primera.s.nombre) + ')') + ' hasta las ' + U.esc(hora(new Date(primera.fin))).replace(/\.$/, '') + '.') +
        (opciones.length > 1 ? p('Otras opciones:') + '<ul>' + opciones.slice(1).map(function (o) {
          return '<li>' + U.esc(U.capitalizar(U.relativa(new Date(o.ini)))) + ' desde las ' + U.esc(hora(new Date(o.ini))) + (r.salaId ? '' : ' · ' + U.esc(o.s.nombre)) + '</li>';
        }).join('') + '</ul>' : '');
      return responder(texto, {
        sugerencias: opciones.slice(0, 3).map(function (o) {
          return 'Reserva ' + o.s.nombre + ' ' + U.relativa(new Date(o.ini)) + ' ' + textoHoraSugerida(U.minutosDelDia(new Date(o.ini))) +
            (asistentes > 1 ? ' para ' + asistentes : '');
        }),
      });
    });
  }

  /** «Otra igual el viernes»: copia la última reunión de la que se habló. */
  function flujoDuplicar(r) {
    var base = referenciaDe(r) || foco;
    var conseguir = base ? Promise.resolve(base) : ctx.obtenerReservas(U.sumarDias(new Date(), -30), U.sumarDias(new Date(), 30)).then(function (lista) {
      var yo = ctx.usuario().email;
      var mias = lista.filter(function (x) { return x.organizadorEmail === yo && x.estado === 'confirmada'; })
        .sort(function (a, c) { return Math.abs(new Date(a.inicio) - Date.now()) - Math.abs(new Date(c.inicio) - Date.now()); });
      return mias[0] || null;
    });
    return conseguir.then(function (x) {
      if (!x) return responder(p('No sé qué reunión repetir. Dime cuál, por ejemplo: «otra igual que mi reunión de hoy a las 3».'));
      return duplicarDesde(x, r);
    });
  }

  /** Prepara una reserva copiando otra (título, sala, personas, invitados, duración, privacidad). */
  function duplicarDesde(x, r, como) {
    {
      if (x.oculta) return responder(p('No puedo copiar una reunión privada de otra persona.'));
      var ini = new Date(x.inicio), fin = new Date(x.fin);
      var periodo = /\b(proxima|siguiente|que viene) semana\b/.test(Interprete.normalizar(r._texto || ''));
      var fecha = r.fecha || (periodo ? U.claveDia(U.sumarDias(ini, 7)) : null);
      borrador = {
        titulo: x.titulo, salaId: x.salaId, salaFija: false, fecha: fecha,
        horaInicio: r.horaInicio || U.hhmm(ini), horaFin: r.horaInicio ? null : U.hhmm(fin),
        duracionMin: (fin - ini) / 60000, asistentes: x.asistentes, invitados: (x.invitados || []).slice(), privada: !!x.privada,
      };
      // Intenta conservar la misma sala
      borrador.salaPreferida = x.salaId;
      borrador.comoSiempre = como || '';
      if (!fecha) {
        var d1 = proximoHabil(new Date());
        return responder(p('¿Para qué día ' + (como ? 'reservo ' + b(x.titulo) + ' como siempre' : 'repito ' + b(x.titulo)) + ' (' + U.esc(U.rangoHoras(ini, fin, ctx.formato24)) + ', ' + U.esc((sala(x.salaId) || {}).nombre || '') + ')?'),
          { sugerencias: [U.capitalizar(U.relativa(d1)), 'El ' + U.DIAS[proximoHabil(d1).getDay()], 'El ' + U.fechaLarga(U.sumarDias(U.inicioDia(ini), 7))] });
      }
      return completar(borrador, r);
    }
  }

  // =================================================================== v2.8
  var cacheHabitos = null;
  /**
   * Lo que suele hacer esta persona (últimos 60 días y próximos 30): cuántas personas,
   * cuánto duran sus reuniones, su sala favorita y sus reuniones frecuentes.
   */
  function obtenerHabitos() {
    if (cacheHabitos && Date.now() - cacheHabitos.t < 10 * 60000) return Promise.resolve(cacheHabitos.h);
    var hoy = U.inicioDia(new Date());
    return ctx.obtenerReservas(U.sumarDias(hoy, -60), U.sumarDias(hoy, 30)).then(function (lista) {
      var yo = ctx.usuario().email;
      var mias = lista.filter(function (x) { return x.organizadorEmail === yo && x.estado === 'confirmada'; });
      var h = { total: mias.length, asistentes: null, duracion: null, salaFavorita: null, frecuentes: [] };
      // Las series (una daily de 15 minutos repetida 20 veces) no deben dominar lo «usual»
      var sueltas = mias.filter(function (x) { return !x.serieId; });
      if (sueltas.length >= 3) {
        var personas = sueltas.map(function (x) { return x.asistentes; }).sort(function (a, c) { return a - c; });
        h.asistentes = personas[Math.floor(personas.length / 2)];
        var duraciones = sueltas.map(function (x) { return Math.round((new Date(x.fin) - new Date(x.inicio)) / 900000) * 15; });
        var d = moda(duraciones);
        // Solo si de verdad es un patrón (al menos la mitad de sus reuniones) y es razonable
        if (d >= 30 && duraciones.filter(function (x) { return x === d; }).length >= sueltas.length / 2) h.duracion = d;
        h.salaFavorita = moda(sueltas.map(function (x) { return x.salaId; }));
      }
      var porTitulo = {};
      mias.forEach(function (x) {
        var k = Interprete.normalizar(x.titulo);
        if (!porTitulo[k]) porTitulo[k] = { titulo: x.titulo, veces: 0, ultima: x };
        porTitulo[k].veces++;
        if (new Date(x.inicio) > new Date(porTitulo[k].ultima.inicio) && new Date(x.inicio) <= new Date()) porTitulo[k].ultima = x;
      });
      h.frecuentes = Object.keys(porTitulo).map(function (k) { return porTitulo[k]; }).sort(function (a, c) { return c.veces - a.veces; });
      cacheHabitos = { t: Date.now(), h: h };
      return h;
    });
  }
  function moda(lista) {
    var c = {}, mejor = null;
    lista.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (mejor === null || c[v] > c[mejor]) mejor = v; });
    return mejor === null ? null : isNaN(Number(mejor)) ? mejor : Number(mejor);
  }

  /** Puntaje de una sala según el propósito de la reunión («para presentar», «videollamada»…). */
  function encajaProposito(s, proposito) {
    var eq = Interprete.normalizar((s.equipamiento || '') + ' ' + (s.descripcion || ''));
    var puntos = 0, motivos = [];
    (proposito || []).forEach(function (p) {
      if (p.pequena) { if (s.capacidad <= 4) { puntos += 30; motivos.push('es pequeña, ' + p.motivo); } return; }
      var tiene = p.palabras.filter(function (w) { return eq.indexOf(Interprete.normalizar(w)) !== -1; });
      if (tiene.length) {
        puntos += 40;
        var equipo = (s.equipamiento || '').split(/,\s*/).filter(function (e) { return p.palabras.some(function (w) { return Interprete.normalizar(e).indexOf(Interprete.normalizar(w)) !== -1; }); });
        motivos.push('tiene ' + (equipo.join(' y ') || tiene[0]).toLowerCase() + ' ' + p.motivo);
      }
    });
    return { puntos: puntos, motivos: motivos };
  }

  // -------------------------------------------------------------- recomendar
  function flujoRecomendar(r) {
    var salas = ctx.salas();
    var conHora = r.fecha && r.horaInicio;
    var dia = r.fecha ? U.desdeClave(r.fecha) : U.inicioDia(new Date());
    return Promise.all([obtenerHabitos(), ctx.obtenerReservas(dia, U.sumarDias(dia, 1))]).then(function (x) {
      var h = x[0], lista = x[1];
      var pequena = (r.proposito || []).some(function (q) { return q.pequena; });
      var asistentes = r.asistentes || (pequena ? 2 : h.asistentes) || null;
      var inicio = conHora ? U.combinar(r.fecha, r.horaInicio) : null;
      var fin = conHora ? (r.horaFin ? U.combinar(r.fecha, r.horaFin) : new Date(inicio.getTime() + (r.duracionMin || h.duracion || 60) * 60000)) : null;
      var puntuadas = salas.map(function (s) {
        var puntos = 0, motivos = [];
        if (asistentes) {
          if (s.capacidad < asistentes) return null;
          if (s.capacidad <= asistentes * 2) { puntos += 30; motivos.push('caben bien ' + asistentes + ' personas (hasta ' + s.capacidad + ')'); }
          else if (s.capacidad <= asistentes * 4) puntos += 12;
          else motivos.push('es grande para ' + asistentes + ' personas');
        }
        var p = encajaProposito(s, r.proposito);
        puntos += p.puntos;
        motivos = motivos.concat(p.motivos);
        var libre = null;
        if (conHora) {
          libre = Reglas.salasDisponibles([s], lista, inicio, fin, asistentes || 1, ctx.partes).length > 0;
          puntos += libre ? 50 : -100;
          motivos.push(libre ? 'está libre ' + U.relativa(dia) + ' de ' + U.rangoHoras(inicio, fin, ctx.formato24) : 'está ocupada a esa hora');
        }
        if (h.salaFavorita === s.id) { puntos += 8; motivos.push('es la que más usas'); }
        return { s: s, puntos: puntos - s.capacidad / 100, motivos: motivos, libre: libre };
      }).filter(Boolean).sort(function (a, c) { return c.puntos - a.puntos; });
      if (!puntuadas.length) return responder(p('Ninguna sala tiene capacidad para ' + asistentes + ' personas.'));
      var top = puntuadas.slice(0, 3);
      var l = U.el('<div class="lista-mini recomendaciones"></div>');
      top.forEach(function (o, i) {
        var item = U.el('<button type="button" class="item-mini" style="--c:' + o.s.color + '"><span><b>' + (i === 0 ? '★ ' : '') + U.esc(o.s.nombre) + '</b>' +
          '<small>' + U.esc(U.capitalizar(o.motivos.join(' · ') || (o.s.capacidad + ' personas'))) + '</small></span>' +
          '<span class="btn btn-texto btn-pequeno">' + (conHora && o.libre === false ? 'Ver' : 'Reservar') + '</span></button>');
        item.addEventListener('click', function () {
          if (conHora && o.libre !== false) {
            borrador = { titulo: null, salaId: o.s.id, salaFija: true, fecha: r.fecha, horaInicio: U.hhmm(inicio), horaFin: U.hhmm(fin), asistentes: asistentes, invitados: r.invitados || [] };
            enviar('Reservar ' + o.s.nombre);
          } else enviar(conHora ? 'Información de ' + o.s.nombre : '¿Cuándo está libre ' + o.s.nombre + '?');
        });
        l.appendChild(item);
      });
      var mejor = top[0];
      var intro = 'Te recomiendo ' + b(mejor.s.nombre) + (mejor.motivos.length ? ': ' + U.esc(mejor.motivos[0]) + '.' : '.') +
        (top.length > 1 ? ' Otras opciones:' : '');
      return { mostrar: function () { msgBot(p(intro), { lista: l, sugerencias: conHora ? [] : ['¿Cuándo está libre ' + mejor.s.nombre + '?'] }); } };
    });
  }

  // ----------------------------------------------------------------- resumen
  function flujoResumen(r) {
    var hoy = U.inicioDia(new Date());
    var desde, hasta, titulo;
    if (r.periodo === 'proxima_semana') { desde = U.sumarDias(U.inicioSemana(hoy), 7); hasta = U.sumarDias(desde, 7); titulo = 'la próxima semana'; }
    else if (r.fecha) { desde = U.desdeClave(r.fecha); hasta = U.sumarDias(desde, 1); titulo = U.relativa(desde); }
    else { desde = U.inicioSemana(hoy); hasta = U.sumarDias(desde, 7); titulo = 'esta semana'; }
    return ctx.obtenerReservas(desde, hasta).then(function (lista) {
      var yo = ctx.usuario();
      var mias = lista.filter(function (x) {
        return x.estado === 'confirmada' && !x.oculta && (x.organizadorEmail === yo.email || Reglas.esInvitado(x, yo));
      }).sort(function (a, c) { return new Date(a.inicio) - new Date(c.inicio); });
      if (!mias.length) return responder(p('No tienes reuniones ' + U.esc(titulo) + '. Tienes la agenda libre.'), { sugerencias: ['Reservar una sala'] });
      var horas = function (x) { return (new Date(x.fin) - new Date(x.inicio)) / 3600000; };
      var total = mias.reduce(function (t, x) { return t + horas(x); }, 0);
      var porDia = {};
      for (var d = new Date(desde); d < hasta; d = U.sumarDias(d, 1)) {
        if (ctx.config().PERMITIR_FINES_DE_SEMANA || (d.getDay() !== 0 && d.getDay() !== 6)) porDia[U.claveDia(d)] = 0;
      }
      mias.forEach(function (x) { var k = U.claveDia(new Date(x.inicio)); if (porDia[k] !== undefined) porDia[k] += horas(x); });
      var dias = Object.keys(porDia);
      var ocupado = dias.slice().sort(function (a, c) { return porDia[c] - porDia[a]; })[0];
      var futuros = dias.filter(function (k) { return U.desdeClave(k) >= hoy; });
      var libre = (futuros.length ? futuros : dias).slice().sort(function (a, c) { return porDia[a] - porDia[c]; })[0];
      var cruces = [];
      for (var i = 0; i < mias.length; i++) {
        for (var j = i + 1; j < mias.length; j++) {
          if (Reglas.seCruzan(mias[i].inicio, mias[i].fin, mias[j].inicio, mias[j].fin)) cruces.push([mias[i], mias[j]]);
        }
      }
      var proxima = mias.filter(function (x) { return new Date(x.inicio) > new Date(); })[0];
      var fmt = function (n) { return String(Math.round(n * 10) / 10).replace('.', ','); };
      var filas = [
        ['event', mias.length + (mias.length === 1 ? ' reunión' : ' reuniones') + ', ' + fmt(total) + ' h en total' +
          (dias.length > 1 ? ' <span class="tenue">(' + Math.round(total / (dias.length * 8) * 100) + ' % de tu jornada)</span>' : '')],
      ];
      if (dias.length > 1) {
        filas.push(['trending_up', 'Día más ocupado: <b>' + U.esc(U.capitalizar(U.fechaLarga(U.desdeClave(ocupado)))) + '</b> (' + fmt(porDia[ocupado]) + ' h)']);
        filas.push(['self_improvement', 'Día más libre: <b>' + U.esc(U.capitalizar(U.fechaLarga(U.desdeClave(libre)))) + '</b> (' + fmt(porDia[libre]) + ' h)']);
      }
      if (proxima) filas.push(['schedule', 'Próxima: «' + U.esc(proxima.titulo) + '», ' + U.esc(U.relativa(new Date(proxima.inicio))) + ' a las ' + U.esc(hora(new Date(proxima.inicio)))]);
      cruces.slice(0, 3).forEach(function (c) {
        filas.push(['warning', '<span style="color:var(--peligro)">Se cruzan «' + U.esc(c[0].titulo) + '» y «' + U.esc(c[1].titulo) + '» (' + U.esc(U.fechaMedia(new Date(c[1].inicio))) + ')</span>']);
      });
      var t = tarjeta(getComputedStyle(document.documentElement).getPropertyValue('--primario').trim() || '#0b6b57', 'Tu resumen', U.capitalizar(titulo), filas, []);
      var sug = [];
      if (cruces.length) sug.push('Mueve «' + cruces[0][1].titulo + '» una hora más tarde');
      if (dias.length > 1) sug.push('Mis reuniones del ' + U.DIAS[U.desdeClave(ocupado).getDay()]);
      return { mostrar: function () { msgBot('', { tarjeta: t, sugerencias: sug }); } };
    });
  }

  // ------------------------------------------------------- horario en común
  function flujoBuscarHorario(r) {
    var personas = (r.invitados || []).slice();
    if (r.personasAmbiguas && r.personasAmbiguas.length) {
      var amb = r.personasAmbiguas[0];
      return Promise.resolve(responder(p('Conozco a varias personas llamadas <b>' + U.esc(U.capitalizar(amb.nombre)) + '</b>. ¿Con quién?'),
        { sugerencias: amb.opciones.map(function (c) { return '¿Cuándo puedo reunirme con ' + c + '?'; }) }));
    }
    if (!personas.length) {
      return Promise.resolve(responder(p('¿Con quién quieres reunirte? Escribe su nombre (si ya usa el sistema) o su correo.'),
        { sugerencias: ['¿Cuándo puedo reunirme con ana@empresa.com esta semana?'] }));
    }
    var hoy = U.inicioDia(new Date());
    var desde, hasta;
    if (r.fecha) { desde = U.desdeClave(r.fecha); hasta = U.sumarDias(desde, 1); }
    else if (r.periodo === 'proxima_semana') { desde = U.sumarDias(U.inicioSemana(hoy), 7); hasta = U.sumarDias(desde, 5); }
    else if (r.periodo === 'semana') { desde = hoy; hasta = U.sumarDias(U.inicioSemana(hoy), 5); }
    else { desde = hoy; hasta = U.sumarDias(hoy, 8); }
    var duracion = r.duracionMin || 60;
    var asistentes = Math.max(r.asistentes || 0, personas.length + 1);
    var yo = ctx.usuario();
    var todos = [yo.email].concat(personas);
    var nombres = {};
    (ctx.directorio ? ctx.directorio() : []).forEach(function (x) { nombres[x.email] = String(x.nombre).split(' ')[0]; });
    return ctx.obtenerReservas(desde, hasta).then(function (lista) {
      var activas = lista.filter(function (x) { return x.estado === 'confirmada' && !x.oculta; });
      var ocupada = function (email, ini, fin) {
        return activas.some(function (x) {
          var participa = x.organizadorEmail === email || (x.invitados || []).some(function (c) { return String(c).toLowerCase() === email; });
          return participa && Reglas.seCruzan(ini, fin, x.inicio, x.fin);
        });
      };
      var opciones = [];
      for (var d = new Date(desde); d < hasta && opciones.length < 4; d = U.sumarDias(d, 1)) {
        if (!ctx.config().PERMITIR_FINES_DE_SEMANA && (d.getDay() === 0 || d.getDay() === 6)) continue;
        var clave = U.claveDia(d), enEsteDia = 0;
        for (var m = 8 * 60; m + duracion <= 17 * 60 && enEsteDia < 2; m += 30) {
          if (r.parteDelDia === 'manana' && m >= 12 * 60) break;
          if (r.parteDelDia === 'tarde' && m < 13 * 60) continue;
          if (m >= 12 * 60 && m < 13 * 60) continue; // la hora del almuerzo
          var ini = U.combinar(clave, U.minutosAHhmm(m)), fin = new Date(ini.getTime() + duracion * 60000);
          if (ini < new Date()) continue;
          if (todos.some(function (e) { return ocupada(e, ini, fin); })) continue;
          var salas = Reglas.salasDisponibles(ctx.salas(), lista, ini, fin, asistentes, ctx.partes);
          if (!salas.length) continue;
          opciones.push({ ini: ini, fin: fin, sala: salas[0] });
          enEsteDia++;
          m += 90; // la siguiente opción del mismo día, un poco más tarde
        }
      }
      var quienes = personas.map(function (e) { return nombres[e] || e; });
      var lista2 = quienes.length > 1 ? quienes.slice(0, -1).join(', ') + ' y ' + quienes[quienes.length - 1] : quienes[0];
      if (!opciones.length) return responder(p('No encontré un horario en que estén libres tú y ' + U.esc(lista2) + ' y haya sala. Prueba con otro rango, por ejemplo «la próxima semana».'));
      var html = p('Les queda libre a ti y a ' + b(lista2) + ':') + '<ul>' + opciones.map(function (o) {
        return '<li><b>' + U.esc(U.capitalizar(U.relativa(o.ini))) + '</b>, ' + U.esc(U.rangoHoras(o.ini, o.fin, ctx.formato24)) + ' · ' + U.esc(o.sala.nombre) + '</li>';
      }).join('') + '</ul>' + '<p class="tenue">Revisé las reuniones registradas en este sistema; si usan otros calendarios, confírmalo con ellos.</p>';
      return responder(html, {
        sugerencias: opciones.slice(0, 3).map(function (o) {
          return 'Reserva ' + o.sala.nombre + ' ' + U.relativa(o.ini) + ' ' + textoHoraSugerida(U.minutosDelDia(o.ini)) +
            (duracion !== 60 ? ' por ' + duracion + ' minutos' : '') + ' con ' + personas.join(' y ');
        }),
      });
    });
  }

  return { iniciar: iniciar, reiniciar: reiniciar, enviar: enviar };
})();
