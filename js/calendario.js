/**
 * Dibujo de las vistas del calendario (día por salas, semana, mes y agenda).
 * No guarda estado: recibe datos y funciones de respuesta desde app.js.
 */
var Calendario = (function () {
  'use strict';

  var SNAP = 15; // minutos

  function alto() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-hora')) || 48;
  }

  function mapaSalas(salas) {
    var m = {};
    salas.forEach(function (s) { m[s.id] = s; });
    return m;
  }

  /** Reparte en columnas las reuniones que se cruzan (como Google Calendar). */
  function disponer(eventos) {
    eventos.sort(function (a, b) { return a.ini - b.ini || b.fin - a.fin; });
    var grupo = [], finGrupo = -Infinity;
    function cerrar() {
      var cols = [];
      grupo.forEach(function (e) {
        var i = cols.findIndex(function (f) { return f <= e.ini; });
        if (i === -1) { i = cols.length; cols.push(0); }
        cols[i] = e.fin;
        e.col = i;
      });
      grupo.forEach(function (e) { e.ncols = cols.length; });
    }
    eventos.forEach(function (e) {
      if (grupo.length && e.ini >= finGrupo) { cerrar(); grupo = []; finGrupo = -Infinity; }
      grupo.push(e);
      finGrupo = Math.max(finGrupo, e.fin);
    });
    if (grupo.length) cerrar();
    return eventos;
  }

  function htmlEvento(r, sala, op, ini, fin, pos) {
    var duracion = (fin - ini) / 60000;
    var propio = r.organizadorEmail === op.usuario.email;
    var px = alto();
    var top = (U.minutosDelDia(ini)) * px / 60;
    var h = Math.max(duracion * px / 60 - 2, 18);
    var izq = (pos.col / pos.ncols) * 100;
    var ancho = (1 / pos.ncols) * 100;
    var clases = ['evento', propio ? 'propio' : 'ajeno'];
    var movible = op.puedeMover && op.puedeMover(r);
    if (duracion <= 40) clases.push('corto');
    if (r.oculta) clases.push('oculta');
    if (fin < new Date()) clases.push('pasado');
    var rango = U.rangoHoras(ini, fin, op.formato24);
    return '<div class="' + clases.join(' ') + '" data-id="' + U.esc(r.id) + '" tabindex="0" role="button"' +
      (movible ? ' data-movible="1" title="Arrastra para mover · estira el borde inferior para cambiar la duración"' : '') + ' ' +
      'aria-label="' + U.esc(r.titulo + ', ' + rango + ', ' + (sala ? sala.nombre : '')) + '" ' +
      'style="top:' + top + 'px;height:' + h + 'px;left:calc(' + izq + '% + 1px);width:calc(' + ancho + '% - 6px);' +
      '--c:' + (sala ? sala.color : '#039be5') + ';--ct:' + U.colorTexto(sala ? sala.color : '#039be5') + '">' +
      '<span class="ev-titulo">' + (r.privada ? '<span class="ms ev-icono" aria-label="Privada">lock</span>' : '') +
      (r.serieId ? '<span class="ms ev-icono" aria-label="Se repite">repeat</span>' : '') +
      U.esc(r.titulo) + (duracion <= 40 ? ', ' : '') + '</span>' +
      '<span class="ev-hora">' + U.esc(rango) + '</span>' +
      (op.mostrarSala !== false && sala ? '<span class="ev-sala">' + U.esc(sala.nombre) + '</span>' : '') +
      (movible ? '<span class="ev-asa" aria-hidden="true"></span>' : '') +
      '</div>';
  }

  function zonaCorta(tz) {
    try {
      var p = new Intl.DateTimeFormat('es', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      var z = p.filter(function (x) { return x.type === 'timeZoneName'; })[0];
      return z ? z.value : '';
    } catch (e) { return ''; }
  }

  /**
   * Cuadrícula horaria genérica.
   * columnas: [{fecha: Date, salaId?: string, abre: min, cierra: min, cabecera: html}]
   */
  function renderCuadricula(contenedor, columnas, op, extraCabecera, claseExtra) {
    var px = alto();
    var salas = mapaSalas(op.salas);
    var ahora = new Date();
    var hoy = U.inicioDia(ahora);

    var html = '<div class="semana ' + (claseExtra || '') + '" style="--dias:' + columnas.length + '">' + (extraCabecera || '') +
      '<div class="semana-scroll"><div class="semana-cab"><div class="zona">' + U.esc(zonaCorta(op.zonaHoraria)) + '</div>' +
      columnas.map(function (c) { return c.cabecera; }).join('') + '</div><div class="semana-grid"><div class="horas">';
    for (var h = 0; h < 24; h++) html += '<div class="hora-etq"><span>' + U.etiquetaHora(h, op.formato24) + '</span></div>';
    html += '</div>';

    columnas.forEach(function (c, idx) {
      var pasado = c.fecha < hoy;
      var esHoy = U.mismoDia(c.fecha, ahora);
      html += '<div class="columna' + (pasado ? ' pasado' : '') + (esHoy && columnas.length > 1 && !c.salaId ? ' hoy-col' : '') +
        '" data-idx="' + idx + '" style="height:' + 24 * px + 'px">';
      if (c.abre > 0) html += '<div class="cerrado" style="top:0;height:' + c.abre * px / 60 + 'px"></div>';
      if (c.cierra < 1440) html += '<div class="cerrado" style="top:' + c.cierra * px / 60 + 'px;bottom:0"></div>';

      var inicioCol = c.fecha, finCol = U.sumarDias(c.fecha, 1);
      var eventos = op.reservas
        .filter(function (r) {
          return (!c.salaId || r.salaId === c.salaId) && Reglas.seCruzan(inicioCol, finCol, r.inicio, r.fin);
        })
        .map(function (r) {
          var ini = new Date(Math.max(new Date(r.inicio), inicioCol));
          var fin = new Date(Math.min(new Date(r.fin), finCol));
          return { r: r, ini: ini.getTime(), fin: fin.getTime() };
        });
      disponer(eventos).forEach(function (e) {
        html += htmlEvento(e.r, salas[e.r.salaId], Object.assign({}, op, { mostrarSala: !c.salaId }), new Date(e.ini), new Date(e.fin), e);
      });
      if (U.mismoDia(c.fecha, ahora)) {
        html += '<div class="linea-ahora" style="top:' + U.minutosDelDia(ahora) * px / 60 + 'px"><span class="hora-ahora">' +
          U.esc(U.horaCompacta(ahora, op.formato24)) + '</span></div>';
      }
      html += '</div>';
    });
    html += '</div></div></div>';

    var previo = contenedor.querySelector('.semana-scroll');
    var scrollPrevio = previo ? previo.scrollTop : null;
    contenedor.innerHTML = html;
    var scroll = contenedor.querySelector('.semana-scroll');

    if (scrollPrevio !== null && op.mantenerScroll) {
      scroll.scrollTop = scrollPrevio;
    } else {
      var minAbre = Math.min.apply(null, columnas.map(function (c) { return c.abre; }));
      var objetivo = Math.max(0, minAbre - 30);
      var hayHoy = columnas.some(function (c) { return U.mismoDia(c.fecha, ahora); });
      var visibles = (scroll.clientHeight - 90) / px * 60; // minutos que caben en pantalla
      // Desde la apertura; si "ahora" quedaría fuera de la vista, bajar hasta mostrarlo
      if (hayHoy && U.minutosDelDia(ahora) > objetivo + visibles - 60) objetivo = U.minutosDelDia(ahora) - visibles / 2;
      scroll.scrollTop = objetivo * px / 60;
    }

    conectarEventos(contenedor, op, columnas);
    conectarCreacion(contenedor, columnas, op);
  }

  function conectarEventos(contenedor, op, columnas) {
    var px = alto();
    U.$$('.evento[data-id]', contenedor).forEach(function (el) {
      var id = el.getAttribute('data-id');
      var recienArrastrado = false;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (recienArrastrado) return;
        op.alClicEvento(id, el);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op.alClicEvento(id, el); }
      });
      el.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        if (op.pegando || !columnas || el.dataset.movible !== '1' || e.button !== 0 || e.pointerType === 'touch') return;
        var r = op.reservaPorId(id);
        if (!r) return;
        var modo = e.target.classList.contains('ev-asa') ? 'estirar' : 'mover';
        var x0 = e.clientX, y0 = e.clientY;
        var ini0 = new Date(r.inicio), fin0 = new Date(r.fin), dur = fin0 - ini0;
        var colOriginal = el.parentElement;
        var activo = false, destino = null;

        function mover(ev) {
          if (!activo && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6) return;
          if (!activo) {
            activo = true;
            el.classList.add('arrastrando');
            el.style.pointerEvents = 'none';
            document.body.classList.add(modo === 'mover' ? 'cursor-mover' : 'cursor-estirar');
          }
          var delta = Math.round((ev.clientY - y0) / px * 60 / SNAP) * SNAP;
          var col = colOriginal;
          if (modo === 'mover') {
            var bajo = document.elementFromPoint(ev.clientX, ev.clientY);
            var c2 = bajo && bajo.closest ? bajo.closest('.columna') : null;
            if (c2 && contenedor.contains(c2)) col = c2;
          }
          var c = columnas[Number(col.getAttribute('data-idx'))];
          var nuevoIni, nuevoFin;
          if (modo === 'mover') {
            var m = Math.max(0, Math.min(1440 - dur / 60000, U.minutosDelDia(ini0) + delta));
            nuevoIni = U.combinar(U.claveDia(c.fecha), U.minutosAHhmm(m));
            nuevoFin = new Date(nuevoIni.getTime() + dur);
          } else {
            var mf = Math.max(U.minutosDelDia(ini0) + SNAP, Math.min(1440, (U.minutosDelDia(fin0) || 1440) + delta));
            nuevoIni = ini0;
            nuevoFin = mf >= 1440 ? U.sumarDias(ini0, 1) : U.combinar(U.claveDia(ini0), U.minutosAHhmm(mf));
          }
          if (col !== el.parentElement) col.appendChild(el);
          el.style.top = U.minutosDelDia(nuevoIni) * px / 60 + 'px';
          el.style.height = Math.max((nuevoFin - nuevoIni) / 60000 * px / 60 - 2, 18) + 'px';
          el.style.left = '1px';
          el.style.width = 'calc(100% - 6px)';
          var etiqueta = el.querySelector('.ev-hora');
          if (etiqueta) etiqueta.textContent = U.rangoHoras(nuevoIni, nuevoFin, op.formato24);
          destino = { inicio: nuevoIni, fin: nuevoFin, salaId: c.salaId || r.salaId };
        }
        function soltar() {
          document.removeEventListener('pointermove', mover);
          document.removeEventListener('pointerup', soltar);
          document.removeEventListener('pointercancel', soltar);
          document.body.classList.remove('cursor-mover', 'cursor-estirar');
          if (!activo) return;
          recienArrastrado = true;
          setTimeout(function () { recienArrastrado = false; }, 50);
          el.style.pointerEvents = '';
          el.classList.remove('arrastrando');
          var cambio = destino && (destino.inicio - ini0 !== 0 || destino.fin - fin0 !== 0 || destino.salaId !== r.salaId);
          if (cambio) op.alMover(r, destino);
          else op.redibujar();
        }
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', soltar);
      });
    });
  }

  /** Clic o arrastre sobre la cuadrícula para crear una reserva. */
  function conectarCreacion(contenedor, columnas, op) {
    var px = alto();
    U.$$('.columna', contenedor).forEach(function (col) {
      var c = columnas[Number(col.getAttribute('data-idx'))];
      var vistaPrevia = null;
      function minutoEn(y) {
        var rect = col.getBoundingClientRect();
        return Math.max(0, Math.min(1440, Math.floor(((y - rect.top) / px * 60) / SNAP) * SNAP));
      }
      col.addEventListener('pointermove', function (e) {
        var m = minutoEn(e.clientY);
        if (op.alPosar) op.alPosar({ fecha: c.fecha, minuto: m, salaId: c.salaId });
        if (!op.pegando) return;
        var dur = op.pegando.duracionMin;
        var ini = Math.min(m, 1440 - dur);
        if (!vistaPrevia) {
          vistaPrevia = document.createElement('div');
          vistaPrevia.className = 'evento fantasma pegar';
          vistaPrevia.style.left = '1px';
          vistaPrevia.style.width = 'calc(100% - 6px)';
          col.appendChild(vistaPrevia);
        }
        vistaPrevia.style.top = ini * px / 60 + 'px';
        vistaPrevia.style.height = Math.max(dur * px / 60 - 2, 18) + 'px';
        vistaPrevia.innerHTML = '<span class="ev-titulo">' + U.esc(op.pegando.titulo) + '</span><span class="ev-hora">' +
          U.esc(U.rangoHoras(U.combinar(U.claveDia(c.fecha), U.minutosAHhmm(ini)), U.combinar(U.claveDia(c.fecha), U.minutosAHhmm(Math.min(ini + dur, 1439))), op.formato24)) + '</span>';
      });
      col.addEventListener('pointerleave', function () { if (vistaPrevia) { vistaPrevia.remove(); vistaPrevia = null; } });
      col.addEventListener('pointerdown', function (e) {
        if (op.pegando && e.button === 0) {
          e.preventDefault();
          var dur = op.pegando.duracionMin;
          op.alPegar({ fecha: c.fecha, inicioMin: Math.min(minutoEn(e.clientY), 1440 - dur), salaId: c.salaId });
          return;
        }
        if (e.button !== 0 || e.target.closest('.evento')) return;
        var rect = col.getBoundingClientRect();
        var y0 = e.clientY;
        var minuto = function (y) { return Math.max(0, Math.min(1440, Math.round(((y - rect.top) / px * 60) / SNAP) * SNAP)); };
        var inicio = Math.floor(((y0 - rect.top) / px * 60) / 30) * 30;
        var fantasma = null, movido = false, esTactil = e.pointerType === 'touch';

        function mover(ev) {
          if (esTactil) return;
          if (Math.abs(ev.clientY - y0) < 6 && !movido) return;
          movido = true;
          var a = minuto(y0), b = minuto(ev.clientY);
          var ini = Math.min(a, b), fin = Math.max(a, b, ini + SNAP);
          if (!fantasma) {
            fantasma = document.createElement('div');
            fantasma.className = 'evento fantasma';
            fantasma.style.left = '1px';
            fantasma.style.width = 'calc(100% - 6px)';
            col.appendChild(fantasma);
          }
          fantasma.style.top = ini * px / 60 + 'px';
          fantasma.style.height = Math.max((fin - ini) * px / 60 - 2, 16) + 'px';
          fantasma.innerHTML = '<span class="ev-titulo">(Sin título)</span><span class="ev-hora">' +
            U.rangoHoras(U.combinar(U.claveDia(c.fecha), U.minutosAHhmm(ini)), U.combinar(U.claveDia(c.fecha), U.minutosAHhmm(Math.min(fin, 1439))), op.formato24) + '</span>';
          fantasma.dataset.ini = ini;
          fantasma.dataset.fin = fin;
        }
        function soltar(ev) {
          document.removeEventListener('pointermove', mover);
          document.removeEventListener('pointerup', soltar);
          document.removeEventListener('pointercancel', cancelar);
          if (esTactil && Math.abs(ev.clientY - y0) > 10) return; // fue desplazamiento
          var ini = movido && fantasma ? Number(fantasma.dataset.ini) : inicio;
          var fin = movido && fantasma ? Number(fantasma.dataset.fin) : Math.min(inicio + 60, 1440);
          op.alCrear({ fecha: c.fecha, inicioMin: ini, finMin: fin, salaId: c.salaId, fantasma: fantasma });
        }
        function cancelar() {
          document.removeEventListener('pointermove', mover);
          document.removeEventListener('pointerup', soltar);
          document.removeEventListener('pointercancel', cancelar);
          if (fantasma) fantasma.remove();
        }
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', cancelar);
      });
    });
  }

  function horarioGlobal(salas) {
    if (!salas.length) return { abre: 7 * 60, cierra: 19 * 60 };
    return {
      abre: Math.min.apply(null, salas.map(function (s) { return Reglas.aMinutos(s.apertura); })),
      cierra: Math.max.apply(null, salas.map(function (s) { return Reglas.aMinutos(s.cierre); })),
    };
  }

  function cabeceraDia(d, extra) {
    var hoy = U.inicioDia(new Date());
    var clase = 'dia-cab' + (U.mismoDia(d, hoy) ? ' hoy' : d < hoy ? ' pasado' : '');
    return '<div class="' + clase + '"><span class="dia-nombre">' + U.DIAS_CORTOS[d.getDay()] + '</span>' +
      '<button class="dia-num" data-ir-dia="' + U.claveDia(d) + '" aria-label="' + U.esc(U.fechaLarga(d)) + '">' + d.getDate() + '</button>' +
      (extra || '') + '</div>';
  }

  // ------------------------------------------------------------------ Vistas
  function semana(contenedor, op) {
    var hg = horarioGlobal(op.salasVisibles);
    var columnas = op.dias.map(function (d) {
      return { fecha: d, abre: hg.abre, cierra: hg.cierra, cabecera: cabeceraDia(d) };
    });
    renderCuadricula(contenedor, columnas, op);
    conectarIrDia(contenedor, op);
  }

  function dia(contenedor, op) {
    var d = op.dias[0];
    var hoy = U.inicioDia(new Date());
    var resumen = op.reservas.filter(function (r) { return Reglas.seCruzan(d, U.sumarDias(d, 1), r.inicio, r.fin); }).length;
    var cab = '<div class="dia-encabezado">' +
      '<div class="dia-cab' + (U.mismoDia(d, hoy) ? ' hoy' : '') + '"><span class="dia-nombre">' + U.DIAS_CORTOS[d.getDay()] + '</span>' +
      '<span class="dia-num" style="display:block">' + d.getDate() + '</span></div>' +
      '<p>' + (resumen ? resumen + (resumen === 1 ? ' reunión' : ' reuniones') : 'Sin reuniones') + '</p>' +
      '<button class="btn btn-borde btn-pequeno alternar-salas" id="alternar-salas">' +
      '<span class="ms">' + (op.porSalas ? 'view_agenda' : 'view_column') + '</span>' + (op.porSalas ? 'Ver todo junto' : 'Ver por sala') + '</button></div>';

    var columnas;
    if (op.porSalas && op.salasVisibles.length) {
      columnas = op.salasVisibles.map(function (s) {
        return {
          fecha: d, salaId: s.id, abre: Reglas.aMinutos(s.apertura), cierra: Reglas.aMinutos(s.cierre),
          cabecera: '<div class="sala-cab" style="--c:' + s.color + '"><b><i></i>' + U.esc(s.nombre) + '</b>' +
            '<small>' + s.capacidad + ' personas</small></div>',
        };
      });
    } else {
      var hg = horarioGlobal(op.salasVisibles);
      columnas = [{ fecha: d, abre: hg.abre, cierra: hg.cierra, cabecera: '<div class="sala-cab"></div>' }];
    }
    renderCuadricula(contenedor, columnas, op, cab, op.porSalas ? 'vista-dia-salas' : 'vista-dia');
    var boton = contenedor.querySelector('#alternar-salas');
    if (boton) boton.addEventListener('click', op.alAlternarSalas);
  }

  function conectarIrDia(contenedor, op) {
    U.$$('[data-ir-dia]', contenedor).forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); op.alIrDia(U.desdeClave(b.getAttribute('data-ir-dia'))); });
    });
  }

  function mes(contenedor, op) {
    var salas = mapaSalas(op.salas);
    var primero = U.inicioMes(op.fecha);
    var inicio = U.inicioSemana(primero);
    var ultimo = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
    var semanas = Math.ceil((U.sumarDias(ultimo, 1) - inicio) / (7 * 86400000));
    var diasSemana = op.finesDeSemana ? 7 : 5;
    var hoy = U.inicioDia(new Date());

    var porDia = {};
    op.reservas.forEach(function (r) {
      var k = U.claveDia(new Date(r.inicio));
      (porDia[k] = porDia[k] || []).push(r);
    });

    var html = '<div class="mes" style="--dias:' + diasSemana + '"><div class="mes-cab">';
    for (var i = 0; i < diasSemana; i++) html += '<div>' + U.DIAS_CORTOS[(i + 1) % 7] + '</div>';
    html += '</div><div class="mes-grid dias-' + diasSemana + '" style="grid-template-rows:repeat(' + semanas + ',1fr)">';
    for (var s = 0; s < semanas; s++) {
      for (var j = 0; j < diasSemana; j++) {
        var d = U.sumarDias(inicio, s * 7 + j);
        var k = U.claveDia(d);
        var lista = (porDia[k] || []).sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); });
        var clase = 'mes-celda' + (d.getMonth() !== primero.getMonth() ? ' fuera' : '') + (U.mismoDia(d, hoy) ? ' hoy' : '');
        html += '<div class="' + clase + '" data-dia="' + k + '"><button class="num" data-ir-dia="' + k + '">' +
          (d.getDate() === 1 ? d.getDate() + ' ' + U.MESES_CORTOS[d.getMonth()] : d.getDate()) + '</button>';
        var max = op.maxPorCelda || 3;
        lista.slice(0, lista.length > max ? max - 1 : max).forEach(function (r) {
          var sala = salas[r.salaId] || { color: '#039be5' };
          var propio = r.organizadorEmail === op.usuario.email;
          html += '<button class="chip-ev' + (propio ? ' propio' : '') + (r.oculta ? ' oculta' : '') + '" data-id="' + U.esc(r.id) + '" style="--c:' + sala.color +
            ';--ct:' + U.colorTexto(sala.color) + '"><i></i><span class="h">' + U.horaCompacta(new Date(r.inicio), op.formato24) +
            '</span><span class="t">' + (r.privada ? '<span class="ms ev-icono" aria-label="Privada">lock</span>' : '') + U.esc(r.titulo) + '</span></button>';
        });
        if (lista.length > max) html += '<button class="mas" data-ir-dia="' + k + '">' + (lista.length - max + 1) + ' más</button>';
        html += '</div>';
      }
    }
    html += '</div></div>';
    contenedor.innerHTML = html;

    U.$$('.chip-ev', contenedor).forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); op.alClicEvento(b.getAttribute('data-id'), b); });
    });
    conectarIrDia(contenedor, op);
    U.$$('.mes-celda', contenedor).forEach(function (celda) {
      celda.addEventListener('click', function (e) {
        if (op.pegando) { op.alPegar({ fecha: U.desdeClave(celda.getAttribute('data-dia')), inicioMin: null }); return; }
        if (e.target !== celda) return;
        op.alCrear({ fecha: U.desdeClave(celda.getAttribute('data-dia')), inicioMin: 9 * 60, finMin: 10 * 60 });
      });
    });
  }

  function agenda(contenedor, op) {
    var salas = mapaSalas(op.salas);
    var hoy = U.inicioDia(new Date());
    var porDia = {};
    op.reservas.slice().sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); }).forEach(function (r) {
      var k = U.claveDia(new Date(r.inicio));
      (porDia[k] = porDia[k] || []).push(r);
    });
    var claves = Object.keys(porDia).sort();
    if (!claves.length) {
      contenedor.innerHTML = '<div class="agenda"><div class="vacio"><span class="ms">event_available</span>' +
        '<p>No hay reservas en los próximos 30 días con los filtros actuales.</p>' +
        '<button class="btn btn-tonal" id="agenda-crear"><span class="ms">add</span>Crear reserva</button></div></div>';
      contenedor.querySelector('#agenda-crear').addEventListener('click', function () {
        op.alCrear({ fecha: op.fecha, inicioMin: 9 * 60, finMin: 10 * 60 });
      });
      return;
    }
    var html = '<div class="agenda">';
    claves.forEach(function (k) {
      var d = U.desdeClave(k);
      html += '<div class="agenda-dia' + (U.mismoDia(d, hoy) ? ' hoy' : '') + '"><div class="agenda-fecha">' +
        '<span class="n">' + d.getDate() + '</span><span class="d">' + U.MESES_CORTOS[d.getMonth()] + ', ' +
        U.DIAS_CORTOS[d.getDay()].toLowerCase() + '</span></div><div>';
      porDia[k].forEach(function (r) {
        var s = salas[r.salaId] || { color: '#039be5', nombre: '' };
        html += '<button class="agenda-ev" data-id="' + U.esc(r.id) + '" style="--c:' + s.color + '"><i></i>' +
          '<span class="h">' + U.esc(U.rangoHoras(new Date(r.inicio), new Date(r.fin), op.formato24)) + '</span>' +
          '<span class="t"><b>' + (r.privada ? '<span class="ms ev-icono" aria-label="Privada">lock</span>' : '') + U.esc(r.titulo) + '</b><small>' + U.esc(s.nombre) + ' · ' + U.esc(r.oculta ? 'Reunión privada' : r.organizadorNombre) + '</small></span></button>';
      });
      html += '</div></div>';
    });
    contenedor.innerHTML = html + '</div>';
    U.$$('.agenda-ev', contenedor).forEach(function (b) {
      b.addEventListener('click', function () { op.alClicEvento(b.getAttribute('data-id'), b); });
    });
  }

  /** Mueve la línea roja de "ahora" sin redibujar todo. */
  function actualizarLineaAhora(contenedor) {
    var px = alto();
    var ahora = new Date();
    U.$$('.linea-ahora', contenedor).forEach(function (l) {
      l.style.top = U.minutosDelDia(ahora) * px / 60 + 'px';
      var etq = l.querySelector('.hora-ahora');
      if (etq) etq.textContent = U.horaCompacta(ahora, App.C.FORMATO_24H);
    });
  }

  return { semana: semana, dia: dia, mes: mes, agenda: agenda, disponer: disponer, actualizarLineaAhora: actualizarLineaAhora };
})();
