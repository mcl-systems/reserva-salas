/**
 * Formulario de reserva: crear, editar, pegar, con repetición y disponibilidad de salas en vivo.
 */
var Editor = (function () {
  'use strict';

  var ed = { reserva: null, invitados: [], fantasma: null, turno: 0, salaElegida: null, modo: 'crear', diasSemana: [] };
  var LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var NOMBRES_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  function f() { return U.$('#form-reserva'); }
  function C() { return App.C; }

  function opcionesHora(select, desdeMin, hastaMin, base) {
    var html = '';
    for (var m = desdeMin; m <= hastaMin; m += 15) {
      var d = new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60);
      var etiqueta = m === 1440 ? (C().FORMATO_24H ? '24:00' : '12 a. m.') : U.horaCompacta(d, C().FORMATO_24H);
      if (base !== undefined) etiqueta += ' (' + U.duracionTexto(m - base) + ')';
      html += '<option value="' + m + '">' + etiqueta + '</option>';
    }
    select.innerHTML = html;
  }

  // ------------------------------------------------------------- repetición
  function fechaActual() { return U.desdeClave(f().fecha.value || U.claveDia(new Date())); }

  function pintarOpcionesRepetir() {
    var d = fechaActual();
    var iso = d.getDay() || 7;
    var sel = U.$('#sel-repetir');
    var previo = sel.value || 'nunca';
    sel.innerHTML = [
      ['nunca', 'No se repite'],
      ['habiles', 'Todos los días hábiles (lunes a viernes)'],
      ['semanal', 'Cada semana el ' + NOMBRES_DIA[iso]],
      ['quincenal', 'Cada 2 semanas el ' + NOMBRES_DIA[iso]],
      ['mensual', 'Cada mes el día ' + d.getDate()],
      ['personalizado', 'Personalizado…'],
    ].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    sel.value = previo;
  }

  function pintarDiasSemana() {
    var cont = U.$('#dias-semana');
    cont.innerHTML = LETRAS.map(function (l, i) {
      var d = i + 1;
      return '<button type="button" data-dia="' + d + '" aria-pressed="' + (ed.diasSemana.indexOf(d) !== -1) + '" aria-label="' + NOMBRES_DIA[d] + '">' + l + '</button>';
    }).join('');
    U.$$('button', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        var d = Number(b.dataset.dia);
        var i = ed.diasSemana.indexOf(d);
        if (i === -1) ed.diasSemana.push(d); else if (ed.diasSemana.length > 1) ed.diasSemana.splice(i, 1);
        pintarDiasSemana();
        actualizarResumenRepetir();
      });
    });
  }

  function leerRecurrencia() {
    var v = U.$('#sel-repetir').value;
    if (ed.reserva || v === 'nunca') return null;
    var iso = fechaActual().getDay() || 7;
    var termina = f().termina.value;
    var base = { termina: termina, veces: Number(f().veces.value) || 10, hasta: f().hasta.value };
    if (v !== 'personalizado') { base.termina = 'veces'; base.veces = { habiles: 20, semanal: 10, quincenal: 6, mensual: 6 }[v]; }
    if (v === 'habiles') return Object.assign(base, { frecuencia: 'habiles' });
    if (v === 'semanal') return Object.assign(base, { frecuencia: 'semanal', intervalo: 1, dias: [iso] });
    if (v === 'quincenal') return Object.assign(base, { frecuencia: 'semanal', intervalo: 2, dias: [iso] });
    if (v === 'mensual') return Object.assign(base, { frecuencia: 'mensual', intervalo: 1 });
    var frecuencia = f().frecuencia.value;
    return Object.assign(base, {
      frecuencia: frecuencia, intervalo: Number(f().intervalo.value) || 1,
      dias: frecuencia === 'semanal' ? ed.diasSemana.slice() : [],
    });
  }

  function actualizarResumenRepetir() {
    var v = U.$('#sel-repetir').value;
    U.$('#repetir-personalizado').hidden = v !== 'personalizado';
    U.$('#dias-semana').hidden = f().frecuencia.value !== 'semanal';
    var porFecha = f().termina.value === 'fecha';
    f().veces.hidden = porFecha;
    U.$('#txt-veces').hidden = porFecha;
    f().hasta.hidden = !porFecha;
    var regla = leerRecurrencia();
    var res = U.$('#repetir-resumen');
    if (!regla) { res.textContent = ''; res.hidden = true; return; }
    var d = leerFormulario();
    var fechas = Recurrencia.expandir(d.inicio, d.fin, regla);
    res.hidden = false;
    res.innerHTML = '<span class="ms">info</span><span>' + U.esc(Recurrencia.describir(regla, d.inicio)) + '. Se crearán <b>' + fechas.length +
      ' reuniones</b>, del ' + U.esc(U.fechaMedia(fechas[0].inicio)) + ' al ' + U.esc(U.fechaMedia(fechas[fechas.length - 1].inicio)) + '.</span>';
  }

  // ------------------------------------------------------------------ abrir
  /**
   * datos: {reserva} para editar · {modo:'pegar', ...} · {fecha, inicioMin, finMin, salaId, titulo, asistentes, invitados, descripcion}
   */
  function abrir(datos) {
    datos = datos || {};
    U.$('#popover').hidden = true;
    var form = f();
    var r = datos.reserva || null;
    var yo = App.estado.usuario;
    ed.reserva = r;
    ed.fantasma = datos.fantasma || null;
    ed.modo = r ? 'editar' : datos.modo || 'crear';
    var ini = r ? new Date(r.inicio) : null, fin = r ? new Date(r.fin) : null;
    var fecha = r ? U.inicioDia(ini) : U.inicioDia(datos.fecha || new Date());
    var inicioMin = r ? U.minutosDelDia(ini) : (datos.inicioMin !== undefined ? datos.inicioMin : 9 * 60);
    var finMin = r ? U.minutosDelDia(fin) || 1440 : (datos.finMin !== undefined ? datos.finMin : inicioMin + 60);

    // Si es hoy y la hora ya pasó, sugerir la siguiente media hora
    if (!r && U.mismoDia(fecha, new Date()) && inicioMin < U.minutosDelDia(new Date()) && datos.inicioMin === undefined) {
      inicioMin = Math.ceil((U.minutosDelDia(new Date()) + 1) / 30) * 30;
      finMin = inicioMin + 60;
    }

    form.titulo.value = r ? r.titulo : (datos.titulo || '');
    form.fecha.value = U.claveDia(fecha);
    form.fecha.min = r ? '' : U.claveDia(new Date());
    opcionesHora(form.horaInicio, 0, 1425);
    form.horaInicio.value = String(Math.min(inicioMin, 1425));
    actualizarOpcionesFin(Math.max(finMin, inicioMin + 15));
    form.asistentes.value = r ? r.asistentes : (datos.asistentes || 2);
    form.descripcion.value = r ? r.descripcion : (datos.descripcion || '');
    ed.invitados = (r ? r.invitados : datos.invitados || []).slice();
    pintarInvitados();
    cerrarSugerencias();
    form.privada.checked = !!(r ? r.privada : datos.privada);
    pintarPrivada();
    ed.salaElegida = r ? r.salaId : (datos.salaId || null);

    // Repetición: solo al crear
    U.$('#fila-repetir').hidden = !!r;
    U.$('#sel-repetir').value = 'nunca';
    ed.diasSemana = [fecha.getDay() || 7];
    form.intervalo.value = 1;
    form.frecuencia.value = 'semanal';
    form.termina.value = 'veces';
    form.veces.value = 10;
    form.hasta.value = U.claveDia(U.sumarDias(fecha, 56));
    pintarOpcionesRepetir();
    pintarDiasSemana();
    actualizarResumenRepetir();

    // Avisos
    U.$('#fila-serie').hidden = !(r && r.serieId);
    if (r && r.serieId) U.$('#nota-serie').textContent = 'Forma parte de una serie (' + (r.recurrencia || 'se repite') + '). Los cambios se aplican solo a esta fecha.';
    var aviso = U.$('#dlg-aviso');
    if (r && r.organizadorEmail !== yo.email) {
      aviso.hidden = false;
      aviso.className = 'aviso-dlg admin';
      aviso.innerHTML = '<span class="ms">shield_person</span>Estás modificando como administrador la reunión de <b>' + U.esc(r.organizadorNombre) + '</b>. Seguirá a su nombre.';
    } else if (ed.modo === 'pegar') {
      aviso.hidden = false;
      aviso.className = 'aviso-dlg';
      aviso.innerHTML = '<span class="ms">content_paste</span>Pegando una copia. Revisa la sala y el horario y guarda.';
    } else {
      aviso.hidden = true;
    }

    U.$('#dlg-titulo').textContent = r ? 'Editar reserva' : ed.modo === 'pegar' ? 'Pegar reunión' : 'Nueva reserva';
    U.$('#dlg-eliminar').hidden = !r || !(new Date(r.fin) > new Date());
    U.$('#dlg-guardar').textContent = r ? 'Guardar cambios' : 'Reservar';
    mostrarErrores([]);
    var dlg = U.$('#dlg-reserva');
    if (!dlg.open) dlg.showModal();
    setTimeout(function () { (form.titulo.value ? form.horaInicio : form.titulo).focus(); }, 30);
    refrescarSalas();
  }

  function actualizarOpcionesFin(valor) {
    var form = f();
    var ini = Number(form.horaInicio.value);
    opcionesHora(form.horaFin, ini + 15, 1440, ini);
    form.horaFin.value = String(Math.min(Math.max(valor, ini + 15), 1440));
    var dur = Number(form.horaFin.value) - ini;
    U.$$('#chips-duracion button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.min) === dur)); });
  }

  function leerFormulario() {
    var form = f();
    var fecha = form.fecha.value || U.claveDia(new Date());
    var ini = U.combinar(fecha, U.minutosAHhmm(Number(form.horaInicio.value)));
    var finMin = Number(form.horaFin.value);
    var fin = finMin >= 1440 ? U.sumarDias(U.desdeClave(fecha), 1) : U.combinar(fecha, U.minutosAHhmm(finMin));
    var sel = U.$('input[name="sala"]:checked', U.$('#selector-salas'));
    return {
      id: ed.reserva ? ed.reserva.id : undefined,
      titulo: form.titulo.value.trim(),
      salaId: sel ? sel.value : '',
      inicio: ini.toISOString(),
      fin: fin.toISOString(),
      asistentes: Number(form.asistentes.value || 1),
      descripcion: form.descripcion.value.trim(),
      invitados: ed.invitados.slice(),
      privada: form.privada.checked,
    };
  }

  function pintarPrivada() {
    var on = f().privada.checked;
    U.$('#icono-privada').textContent = on ? 'lock' : 'lock_open';
    U.$('.fila-privada').classList.toggle('activa', on);
  }

  // -------------------------------------------------------- salas en vivo
  function refrescarSalas() {
    var d = leerFormulario();
    var turno = ++ed.turno;
    var dia = fechaActual();
    App.obtenerReservas(dia, U.sumarDias(dia, 1)).then(function (lista) {
      if (turno !== ed.turno) return;
      var partes = App.estado.partes;
      var opciones = App.estado.salas.filter(function (s) { return s.activa || (ed.reserva && ed.reserva.salaId === s.id); }).map(function (s) {
        var choque = Reglas.buscarChoque(s.id, d.inicio, d.fin, lista, d.id);
        var pi = partes(d.inicio), pf = partes(d.fin);
        var fuera = pi.fecha !== pf.fecha || Reglas.aMinutos(pi.hora) < Reglas.aMinutos(s.apertura) || Reglas.aMinutos(pf.hora) > Reglas.aMinutos(s.cierre);
        var txt, clase = 'libre', disponible = true;
        if (choque) { txt = 'Ocupada ' + U.rangoHoras(new Date(choque.inicio), new Date(choque.fin), C().FORMATO_24H); clase = 'ocupada'; disponible = false; }
        else if (fuera) { txt = 'Abre ' + s.apertura + '–' + s.cierre; clase = 'no'; disponible = false; }
        else if (d.asistentes > s.capacidad) { txt = 'Máx. ' + s.capacidad + ' personas'; clase = 'no'; disponible = false; }
        else txt = 'Disponible';
        return { s: s, txt: txt, clase: clase, disponible: disponible };
      });
      var elegida = ed.salaElegida;
      if (!elegida || !opciones.some(function (o) { return o.s.id === elegida; })) {
        var libres = opciones.filter(function (o) { return o.disponible; }).sort(function (a, b) { return a.s.capacidad - b.s.capacidad; });
        elegida = libres.length ? libres[0].s.id : '';
        ed.salaElegida = elegida || null;
      }
      U.$('#selector-salas').innerHTML = opciones.map(function (o) {
        return '<label class="op-sala' + (o.disponible ? '' : ' no-disponible') + '" style="--c:' + o.s.color + '">' +
          '<input type="radio" name="sala" value="' + U.esc(o.s.id) + '"' + (o.s.id === elegida ? ' checked' : '') + '>' +
          App.fotoSala(o.s, 'op-foto') +
          '<span class="op-texto"><b>' + U.esc(o.s.nombre) + '</b><small>' + o.s.capacidad + ' personas' +
          (o.s.ubicacion ? ' · ' + U.esc(o.s.ubicacion) : '') + '</small>' +
          '<span class="estado ' + o.clase + '">' + U.esc(o.txt) + '</span></span></label>';
      }).join('');
      U.$$('input[name="sala"]', U.$('#selector-salas')).forEach(function (i) {
        i.addEventListener('change', function () { ed.salaElegida = i.value; mostrarErrores([]); });
      });
    }).catch(function () {});
  }

  // -------------------------------------------------------------- invitados
  function pintarInvitados() {
    var cont = U.$('#invitados');
    U.$$('.chip-inv', cont).forEach(function (c) { c.remove(); });
    var input = U.$('#invitado-texto');
    ed.invitados.forEach(function (correo, i) {
      var p = Personas.persona(correo) || { email: correo, nombre: correo, foto: '' };
      var visible = Personas.nombre(correo) || correo;
      var chip = U.el('<span class="chip-inv" title="' + U.esc(correo) + '">' + Personas.avatar(p) + U.esc(visible) +
        '<button type="button" aria-label="Quitar a ' + U.esc(visible) + '"><span class="ms">close</span></button></span>');
      chip.querySelector('button').addEventListener('click', function () { ed.invitados.splice(i, 1); pintarInvitados(); input.focus(); });
      cont.insertBefore(chip, input);
    });
    input.placeholder = ed.invitados.length ? 'Agregar a alguien más' : 'Agregar invitados: escribe un nombre o correo';
  }

  /** Si los invitados (más quien organiza) ya no caben en el número de personas, lo sube solo. */
  function ajustarPersonas() {
    var form = f();
    var necesarias = ed.invitados.length + 1;
    if (Number(form.asistentes.value || 0) < necesarias) {
      form.asistentes.value = necesarias;
      form.asistentes.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Agrega lo escrito o pegado: uno o varios correos (también «Nombre <correo>» copiado de Gmail/Outlook)
   * o un nombre de alguien del directorio. Devuelve lo que no se pudo reconocer.
   */
  function agregarInvitado(texto) {
    texto = String(texto || '').trim();
    if (!texto) return [];
    var correos = Personas.correosDe(texto);
    if (!correos.length) {
      var encontradas = Personas.buscar(texto, ed.invitados, 2);
      if (encontradas.length === 1 || (encontradas.length && Personas.normalizar(encontradas[0].nombre) === Personas.normalizar(texto))) {
        correos = [encontradas[0].email];
      } else {
        return [texto];
      }
    }
    correos.forEach(function (c) { if (ed.invitados.indexOf(c) === -1) ed.invitados.push(c); });
    pintarInvitados();
    ajustarPersonas();
    return [];
  }

  // ------------------------------------------------- sugerencias de personas
  var sug = { abierta: false, opciones: [], activa: -1 };
  function abrirSugerencias() {
    var input = U.$('#invitado-texto');
    var panel = U.$('#sugerencias-inv');
    var q = input.value.trim();
    var opciones = [];
    var html = '';
    var fila = function (tipo, p, extra) {
      var i = opciones.length;
      opciones.push({ tipo: tipo, p: p });
      return '<div class="sug" role="option" id="sug-' + i + '" data-i="' + i + '" aria-selected="false">' + (extra || '') + '</div>';
    };
    var filaPersona = function (p) {
      var nom = p.nombre && p.nombre !== p.email ? p.nombre : '';
      return fila('persona', p, Personas.avatar(p, 'sug-foto') + '<span class="sug-texto"><b>' + U.esc(nom || p.email) + '</b>' +
        (nom ? '<small>' + U.esc(p.email) + '</small>' : '') + '</span>' +
        (p.fuente === 'contacto' ? '<span class="sug-etq">externo</span>' : ''));
    };
    if (!q) {
      var frec = Personas.frecuentes(ed.invitados).slice(0, 5);
      var grupos = Personas.grupos().filter(function (g) { return g.invitados.some(function (c) { return ed.invitados.indexOf(c) === -1; }); }).slice(0, 3);
      if (grupos.length) {
        html += '<div class="sug-titulo">Invitar al mismo grupo de</div>';
        grupos.forEach(function (g) {
          var nombres = g.invitados.map(function (c) { return (Personas.nombre(c) || c).split(/[ @]/)[0]; });
          html += fila('grupo', g, '<span class="sug-foto grupo"><span class="ms">groups</span></span><span class="sug-texto"><b>«' + U.esc(g.titulo) + '»</b>' +
            '<small>' + U.esc(nombres.slice(0, 4).join(', ') + (nombres.length > 4 ? ' y ' + (nombres.length - 4) + ' más' : '')) + '</small></span>' +
            '<span class="sug-etq">' + g.invitados.length + ' personas</span>');
        });
      }
      if (frec.length) {
        html += '<div class="sug-titulo">Invitas seguido a</div>';
        frec.forEach(function (p) { html += filaPersona(p); });
      }
      if (!html) { cerrarSugerencias(); return; }
    } else {
      var encontradas = Personas.buscar(q, ed.invitados, 7);
      encontradas.forEach(function (p) { html += filaPersona(p); });
      var correos = Personas.correosDe(q);
      if (correos.length === 1 && !Personas.persona(correos[0]) && ed.invitados.indexOf(correos[0]) === -1) {
        html += fila('correo', { email: correos[0], nombre: correos[0] }, '<span class="sug-foto"><span class="ms">mail</span></span><span class="sug-texto"><b>Invitar a ' + U.esc(correos[0]) + '</b></span>');
      }
      if (!html) {
        html = '<div class="sug-vacio">' + (q.indexOf('@') === -1 ? 'No encuentro a «' + U.esc(q) + '». Escribe su correo completo.' : 'Sigue escribiendo el correo…') + '</div>';
      }
    }
    panel.innerHTML = html;
    sug.opciones = opciones;
    sug.activa = opciones.length && q ? 0 : -1;
    sug.abierta = true;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    marcarActiva();
    // Dentro del formulario que se desplaza: que la lista quede a la vista
    requestAnimationFrame(function () { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  }
  function cerrarSugerencias() {
    sug.abierta = false;
    sug.activa = -1;
    var panel = U.$('#sugerencias-inv');
    panel.hidden = true;
    var input = U.$('#invitado-texto');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function marcarActiva() {
    var input = U.$('#invitado-texto');
    U.$$('#sugerencias-inv .sug').forEach(function (el) {
      var activa = Number(el.dataset.i) === sug.activa;
      el.setAttribute('aria-selected', String(activa));
      el.classList.toggle('activa', activa);
      if (activa) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    });
    if (sug.activa < 0) input.removeAttribute('aria-activedescendant');
  }
  function elegirSugerencia(i) {
    var o = sug.opciones[i];
    if (!o) return;
    var input = U.$('#invitado-texto');
    if (o.tipo === 'grupo') o.p.invitados.forEach(function (c) { if (ed.invitados.indexOf(c) === -1) ed.invitados.push(c); });
    else if (ed.invitados.indexOf(o.p.email) === -1) ed.invitados.push(o.p.email);
    input.value = '';
    pintarInvitados();
    ajustarPersonas();
    mostrarErrores([]);
    abrirSugerencias();
    input.focus();
  }

  function mostrarErrores(errores, extraHtml) {
    var cont = U.$('#dlg-errores');
    cont.hidden = !errores.length && !extraHtml;
    cont.innerHTML = (errores.length === 1 ? U.esc(errores[0]) :
      errores.length ? '<ul>' + errores.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>' : '') + (extraHtml || '');
    if (!cont.hidden) cont.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ----------------------------------------------------------------- guardar
  function guardar(ev, omitirConflictos) {
    if (ev) ev.preventDefault();
    var pendiente = U.$('#invitado-texto').value.trim();
    if (pendiente) {
      var malos = agregarInvitado(pendiente);
      if (malos.length) return mostrarErrores(['No encuentro a «' + malos.join(', ') + '». Elige de la lista o escribe su correo completo.']);
      U.$('#invitado-texto').value = '';
    }
    cerrarSugerencias();
    var d = leerFormulario();
    var recurrencia = leerRecurrencia();
    var cache = App.estado.cache;
    var lista = Object.keys(cache).map(function (k) { return cache[k]; });
    // Una sola reunión: se valida aquí al instante. Una serie: el servidor revisa todas las fechas
    // y responde cuáles chocan, para ofrecer reservar solo las libres.
    var errores = Reglas.validar(d, {
      salas: App.estado.salas, reservas: recurrencia ? [] : lista, ahora: new Date(), config: App.estado.config, partes: App.estado.partes,
      original: ed.reserva,
    });
    if (errores.length) return mostrarErrores(errores);
    if (recurrencia) { d.recurrencia = recurrencia; d.omitirConflictos = !!omitirConflictos; }

    var boton = U.$('#dlg-guardar');
    boton.disabled = true;
    App.cargando(true);
    var api = App.api();
    var promesa = ed.reserva ? api.actualizar(d) : api.crear(d);
    promesa.then(function (r) {
      App.cargando(false);
      boton.disabled = false;
      App.estado.cache[r.id] = r;
      App.invalidar();
      var esNueva = !ed.reserva;
      cerrar();
      if (esNueva) App.alReservar(r);
      var s = App.salaPorId(r.salaId);
      var texto;
      if (r.serie && r.serie.creadas > 1) {
        texto = 'Se reservaron ' + r.serie.creadas + ' reuniones en ' + s.nombre + (r.serie.omitidas ? ' (' + r.serie.omitidas + ' fechas omitidas por choque)' : '');
      } else {
        texto = (esNueva ? 'Reservaste ' : 'Guardado: ') + s.nombre + ', ' + U.relativa(new Date(r.inicio)) + ' ' + U.horaCompacta(new Date(r.inicio), C().FORMATO_24H);
      }
      App.aviso(texto, esNueva ? 'Deshacer' : '', esNueva ? function () {
        App.api().cancelar(r.id, 'Deshecho', 'serie').then(function () { App.invalidar(); App.dibujar(true); App.aviso('Reserva deshecha'); })
          .catch(function (e) { App.aviso(e.message); });
      } : null);
      if (App.estado.pagina === 'calendario') App.irA(new Date(r.inicio));
      else App.dibujar();
    }).catch(function (e) {
      App.cargando(false);
      boton.disabled = false;
      if (e.codigo === 'conflictos_serie' && e.detalles) {
        var x = e.detalles;
        var lista2 = x.conflictos.slice(0, 6).map(function (c) {
          return '<li><b>' + U.esc(U.capitalizar(U.fechaMedia(new Date(c.inicio)))) + '</b>: ' + U.esc(c.motivo) + '</li>';
        }).join('') + (x.conflictos.length > 6 ? '<li>… y ' + (x.conflictos.length - 6) + ' más</li>' : '');
        mostrarErrores([], '<b>' + U.esc(e.message) + '</b><ul>' + lista2 + '</ul>' + (x.disponibles ? '<div class="alternativas">' +
          '<button type="button" class="btn btn-relleno btn-pequeno" id="crear-disponibles">Reservar solo las ' + x.disponibles + ' fechas libres</button></div>' : ''));
        var b = U.$('#crear-disponibles');
        if (b) b.addEventListener('click', function () { guardar(null, true); });
      } else {
        mostrarErrores(e.detalles && e.detalles.length ? e.detalles : [e.message]);
      }
      App.invalidar();
      refrescarSalas();
    });
  }

  function cerrar() {
    var dlg = U.$('#dlg-reserva');
    if (dlg.open) dlg.close();
    if (ed.fantasma) { ed.fantasma.remove(); ed.fantasma = null; }
  }

  // ----------------------------------------------------------------- iniciar
  function iniciar() {
    var form = f();
    form.addEventListener('submit', guardar);
    form.privada.addEventListener('change', pintarPrivada);
    U.$$('[data-cerrar]', form).forEach(function (b) { b.addEventListener('click', cerrar); });
    U.$('#dlg-reserva').addEventListener('close', function () { if (ed.fantasma) { ed.fantasma.remove(); ed.fantasma = null; } });
    U.$('#dlg-reserva').addEventListener('click', function (e) { if (e.target === e.currentTarget) cerrar(); });
    form.horaInicio.addEventListener('focus', function () { form.horaInicio.dataset.previo = form.horaInicio.value; });
    form.horaInicio.addEventListener('change', function () {
      var durAnterior = Number(form.horaFin.value) - Number(form.horaInicio.dataset.previo || form.horaInicio.value);
      actualizarOpcionesFin(Number(form.horaInicio.value) + Math.max(durAnterior, 15));
      form.horaInicio.dataset.previo = form.horaInicio.value;
      refrescarSalas();
      actualizarResumenRepetir();
    });
    form.horaFin.addEventListener('change', function () { actualizarOpcionesFin(Number(form.horaFin.value)); refrescarSalas(); });
    U.$$('#chips-duracion button').forEach(function (b) {
      b.addEventListener('click', function () {
        actualizarOpcionesFin(Number(form.horaInicio.value) + Number(b.dataset.min));
        refrescarSalas();
      });
    });
    form.fecha.addEventListener('change', function () {
      ed.diasSemana = [fechaActual().getDay() || 7];
      pintarOpcionesRepetir();
      pintarDiasSemana();
      actualizarResumenRepetir();
      refrescarSalas();
    });
    form.asistentes.addEventListener('input', refrescarSalas);
    ['repetir', 'frecuencia', 'intervalo', 'termina', 'veces', 'hasta'].forEach(function (n) {
      form[n].addEventListener('input', actualizarResumenRepetir);
      form[n].addEventListener('change', actualizarResumenRepetir);
    });

    var inv = U.$('#invitado-texto');
    var panelSug = U.$('#sugerencias-inv');
    inv.addEventListener('input', abrirSugerencias);
    inv.addEventListener('focus', abrirSugerencias);
    inv.addEventListener('keydown', function (e) {
      if (sug.abierta && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && sug.opciones.length) {
        e.preventDefault();
        sug.activa = (sug.activa + (e.key === 'ArrowDown' ? 1 : -1) + sug.opciones.length) % sug.opciones.length;
        marcarActiva();
        return;
      }
      if (e.key === 'Escape' && sug.abierta) { e.preventDefault(); e.stopPropagation(); cerrarSugerencias(); return; }
      var texto = inv.value.trim();
      // Enter o Tab: la sugerencia marcada; si no hay, lo escrito
      if ((e.key === 'Enter' || (e.key === 'Tab' && texto)) && sug.abierta && sug.activa >= 0) {
        e.preventDefault();
        elegirSugerencia(sug.activa);
        return;
      }
      // Coma, punto y coma o Enter cierran un correo; el espacio solo si ya es un correo completo (los nombres llevan espacios)
      var cierra = e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && texto) ||
        (e.key === ' ' && Personas.correosDe(texto).length === 1 && texto.indexOf(' ') === -1);
      if (cierra && texto) {
        e.preventDefault();
        var malos = agregarInvitado(texto);
        inv.value = malos.join(', ');
        mostrarErrores(malos.length ? ['No encuentro a «' + malos.join(', ') + '». Elige de la lista o escribe su correo completo.'] : []);
        abrirSugerencias();
      } else if (e.key === 'Backspace' && !inv.value && ed.invitados.length) {
        ed.invitados.pop();
        pintarInvitados();
        abrirSugerencias();
      }
    });
    // Pegar una lista de correos (de Gmail, Outlook o una hoja de cálculo) los agrega todos de una vez
    inv.addEventListener('paste', function (e) {
      var texto = (e.clipboardData || window.clipboardData).getData('text');
      if (Personas.correosDe(texto).length > 1) {
        e.preventDefault();
        agregarInvitado(texto);
        inv.value = '';
        abrirSugerencias();
        App.aviso(Personas.correosDe(texto).length + ' invitados agregados');
      }
    });
    inv.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === inv) return;
        cerrarSugerencias();
        if (inv.value.trim() && Personas.correosDe(inv.value).length) { var malos = agregarInvitado(inv.value); inv.value = malos.join(', '); }
      }, 150);
    });
    // mousedown (no click) para que el campo no pierda el foco antes de elegir
    panelSug.addEventListener('mousedown', function (e) {
      var el = e.target.closest('.sug');
      if (!el) return;
      e.preventDefault();
      elegirSugerencia(Number(el.dataset.i));
    });
    U.$('#invitados').addEventListener('click', function (e) { if (e.target.id === 'invitados') inv.focus(); });
    U.$('#dlg-eliminar').addEventListener('click', function () {
      var r = ed.reserva;
      if (!r) return;
      cerrar();
      App.cancelarReserva(r);
    });
  }

  return { iniciar: iniciar, abrir: abrir, cerrar: cerrar };
})();
