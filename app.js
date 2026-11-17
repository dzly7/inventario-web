/*
 * app.js — Lógica del Sistema de Inventario.
 * Los productos se guardan en el navegador con localStorage, así la aplicación
 * funciona igual en XAMPP (localhost) y en GitHub Pages, que solo sirve archivos estáticos.
 */
(function () {
  'use strict';

  // =========================================================
  // 1. Almacenamiento
  // =========================================================
  const CLAVE = 'inventario-web:datos:v1';
  const LIMITES = { nombreMin: 2, nombreMax: 60, categoriaMin: 2, categoriaMax: 40, descripcionMax: 200, cantidadMax: 99999 };
  const STOCK_BAJO = 10;

  const DATOS_EJEMPLO = [
    { nombre: 'Lápiz', categoria: 'Papelería', descripcion: 'Lápiz de grafito número 2', cantidad: 120 },
    { nombre: 'Cuaderno', categoria: 'Papelería', descripcion: 'Cuaderno profesional de cuadro chico, 100 hojas', cantidad: 50 },
    { nombre: 'Borrador', categoria: 'Papelería', descripcion: 'Goma blanca de migajón', cantidad: 35 },
    { nombre: 'Regla', categoria: 'Papelería', descripcion: 'Regla de plástico de 30 cm', cantidad: 40 }
  ];

  let almacenDisponible = true;
  let memoria = null;        // respaldo si el navegador no permite localStorage
  let avisoAlmacen = null;   // mensaje para mostrar al usuario si algo falló

  function ahora() { return new Date().toISOString(); }

  function crearDatosEjemplo() {
    const fecha = ahora();
    return {
      siguienteId: DATOS_EJEMPLO.length + 1,
      productos: DATOS_EJEMPLO.map(function (p, i) {
        return Object.assign({ id: i + 1, creado: fecha, actualizado: fecha }, p);
      })
    };
  }

  function probarAlmacen() {
    try {
      const k = CLAVE + ':prueba';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function esProductoValido(p) {
    return p && Number.isInteger(p.id) && p.id > 0 &&
      typeof p.nombre === 'string' && typeof p.categoria === 'string' &&
      Number.isInteger(p.cantidad) && p.cantidad >= 0;
  }

  function leer() {
    if (!almacenDisponible) {
      if (!memoria) memoria = crearDatosEjemplo();
      return memoria;
    }
    const crudo = localStorage.getItem(CLAVE);
    if (crudo === null) {
      const nuevos = crearDatosEjemplo();
      escribir(nuevos);
      return nuevos;
    }
    try {
      const datos = JSON.parse(crudo);
      if (!datos || !Array.isArray(datos.productos)) throw new Error('estructura');
      const productos = datos.productos.filter(esProductoValido);
      const maxId = productos.reduce(function (m, p) { return Math.max(m, p.id); }, 0);
      const siguienteId = Number.isInteger(datos.siguienteId) && datos.siguienteId > maxId ? datos.siguienteId : maxId + 1;
      if (productos.length !== datos.productos.length) {
        avisoAlmacen = 'Se encontraron registros dañados y se omitieron. El resto del inventario está a salvo.';
        escribir({ siguienteId: siguienteId, productos: productos });
      }
      return { siguienteId: siguienteId, productos: productos };
    } catch (e) {
      // Datos corruptos: se respaldan y se vuelve a empezar con los de ejemplo.
      try { localStorage.setItem(CLAVE + ':respaldo-danado', crudo); } catch (e2) { /* sin espacio */ }
      avisoAlmacen = 'Los datos guardados estaban dañados. Se guardó un respaldo y se cargaron los productos de ejemplo.';
      const nuevos = crearDatosEjemplo();
      escribir(nuevos);
      return nuevos;
    }
  }

  function escribir(datos) {
    if (!almacenDisponible) { memoria = datos; return; }
    try {
      localStorage.setItem(CLAVE, JSON.stringify(datos));
    } catch (e) {
      // Por ejemplo, almacenamiento lleno.
      throw new Error('No se pudo guardar en este navegador porque el almacenamiento está lleno o bloqueado.');
    }
  }

  // =========================================================
  // 2. Utilidades de texto
  // =========================================================
  function limpiar(texto) {
    return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  // Para comparar nombres sin importar mayúsculas, acentos ni espacios extra.
  function claveComparacion(texto) {
    return limpiar(texto).toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function escaparHTML(texto) {
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatoNumero(n) { return Number(n).toLocaleString('es-MX'); }

  function formatoFecha(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // =========================================================
  // 3. Operaciones del inventario (agregar, modificar, eliminar)
  // =========================================================
  const Inventario = {
    todos: function () {
      return leer().productos.slice().sort(function (a, b) { return a.id - b.id; });
    },

    buscar: function (id) {
      return leer().productos.find(function (p) { return p.id === id; }) || null;
    },

    categorias: function () {
      const vistas = {};
      leer().productos.forEach(function (p) {
        const k = claveComparacion(p.categoria);
        if (!vistas[k]) vistas[k] = p.categoria;
      });
      return Object.values(vistas).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    /**
     * Revisa los datos del formulario. Regresa { valido, errores, limpio }.
     * idActual: id del producto que se está modificando (null si es nuevo).
     */
    validar: function (entrada, idActual) {
      const errores = {};
      const nombre = limpiar(entrada.nombre);
      const categoria = limpiar(entrada.categoria);
      const descripcion = limpiar(entrada.descripcion);
      const cantidadTexto = String(entrada.cantidad == null ? '' : entrada.cantidad).trim();

      // Nombre
      if (!nombre) errores.nombre = 'Escribe el nombre del producto.';
      else if (nombre.length < LIMITES.nombreMin) errores.nombre = 'El nombre debe tener al menos ' + LIMITES.nombreMin + ' caracteres.';
      else if (nombre.length > LIMITES.nombreMax) errores.nombre = 'El nombre no puede pasar de ' + LIMITES.nombreMax + ' caracteres.';
      else if (!/[a-záéíóúüñ]/i.test(nombre)) errores.nombre = 'El nombre debe incluir al menos una letra.';
      else {
        const k = claveComparacion(nombre);
        const repetido = leer().productos.find(function (p) {
          return claveComparacion(p.nombre) === k && p.id !== idActual;
        });
        if (repetido) errores.nombre = 'Ya existe un producto llamado "' + repetido.nombre + '" (ID ' + repetido.id + '). Modifica ese registro o usa otro nombre.';
      }

      // Categoría
      if (!categoria) errores.categoria = 'Escribe la categoría del producto.';
      else if (categoria.length < LIMITES.categoriaMin) errores.categoria = 'La categoría debe tener al menos ' + LIMITES.categoriaMin + ' caracteres.';
      else if (categoria.length > LIMITES.categoriaMax) errores.categoria = 'La categoría no puede pasar de ' + LIMITES.categoriaMax + ' caracteres.';
      else if (!/[a-záéíóúüñ]/i.test(categoria)) errores.categoria = 'La categoría debe incluir al menos una letra.';

      // Descripción (opcional)
      if (descripcion.length > LIMITES.descripcionMax) errores.descripcion = 'La descripción no puede pasar de ' + LIMITES.descripcionMax + ' caracteres.';

      // Cantidad
      let cantidad = null;
      if (cantidadTexto === '') errores.cantidad = 'Escribe la cantidad en existencia. Si no hay piezas, escribe 0.';
      else if (/^-/.test(cantidadTexto)) errores.cantidad = 'La cantidad no puede ser negativa.';
      else if (/[.,]/.test(cantidadTexto)) errores.cantidad = 'La cantidad debe ser un número entero, sin decimales.';
      else if (!/^\d+$/.test(cantidadTexto)) errores.cantidad = 'La cantidad solo puede llevar números.';
      else {
        cantidad = parseInt(cantidadTexto, 10);
        if (cantidad > LIMITES.cantidadMax) errores.cantidad = 'La cantidad máxima permitida es ' + formatoNumero(LIMITES.cantidadMax) + '.';
      }

      // Si la categoría coincide con una existente (ignorando acentos/mayúsculas), se usa la forma ya registrada.
      let categoriaFinal = categoria;
      const kc = claveComparacion(categoria);
      Inventario.categorias().forEach(function (c) { if (claveComparacion(c) === kc) categoriaFinal = c; });

      return {
        valido: Object.keys(errores).length === 0,
        errores: errores,
        limpio: { nombre: nombre, categoria: categoriaFinal, descripcion: descripcion, cantidad: cantidad }
      };
    },

    agregar: function (entrada) {
      const r = Inventario.validar(entrada, null);
      if (!r.valido) return r;
      const datos = leer();
      const fecha = ahora();
      const producto = Object.assign({ id: datos.siguienteId, creado: fecha, actualizado: fecha }, r.limpio);
      datos.productos.push(producto);
      datos.siguienteId += 1;
      escribir(datos);
      r.producto = producto;
      return r;
    },

    modificar: function (id, entrada) {
      const datos = leer();
      const indice = datos.productos.findIndex(function (p) { return p.id === id; });
      if (indice === -1) {
        return { valido: false, errores: { general: 'El producto con ID ' + id + ' ya no existe. Pudo haberse eliminado en otra pestaña.' } };
      }
      const r = Inventario.validar(entrada, id);
      if (!r.valido) return r;
      const anterior = datos.productos[indice];
      const sinCambios = ['nombre', 'categoria', 'descripcion', 'cantidad'].every(function (k) {
        return String(anterior[k] == null ? '' : anterior[k]) === String(r.limpio[k]);
      });
      r.sinCambios = sinCambios;
      if (!sinCambios) {
        datos.productos[indice] = Object.assign({}, anterior, r.limpio, { actualizado: ahora() });
        escribir(datos);
      }
      r.producto = datos.productos[indice];
      return r;
    },

    eliminar: function (id) {
      const datos = leer();
      const indice = datos.productos.findIndex(function (p) { return p.id === id; });
      if (indice === -1) return null;
      const eliminado = datos.productos.splice(indice, 1)[0];
      escribir(datos);
      return eliminado;
    },

    // Para "Deshacer": regresa el producto con su mismo ID.
    restaurar: function (producto) {
      const datos = leer();
      if (datos.productos.some(function (p) { return p.id === producto.id; })) return false;
      const k = claveComparacion(producto.nombre);
      if (datos.productos.some(function (p) { return claveComparacion(p.nombre) === k; })) return false;
      datos.productos.push(producto);
      escribir(datos);
      return true;
    },

    reiniciar: function () { escribir(crearDatosEjemplo()); }
  };

  // =========================================================
  // 4. Elementos de interfaz compartidos
  // =========================================================
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  let temporizadorToast = null;
  function toast(mensaje, accion) {
    let zona = $('.toast-zona');
    if (!zona) {
      zona = document.createElement('div');
      zona.className = 'toast-zona';
      zona.setAttribute('role', 'status');
      zona.setAttribute('aria-live', 'polite');
      document.body.appendChild(zona);
    }
    zona.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'toast';
    const texto = document.createElement('span');
    texto.textContent = mensaje;
    t.appendChild(texto);
    if (accion) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton boton--chico';
      b.textContent = accion.texto;
      b.addEventListener('click', function () { zona.innerHTML = ''; accion.alHacer(); });
      t.appendChild(b);
    }
    zona.appendChild(t);
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () { zona.innerHTML = ''; }, accion ? 8000 : 4000);
  }

  // Diálogo de confirmación con <dialog>; si el navegador no lo soporta usa confirm().
  function confirmar(opciones) {
    return new Promise(function (resolver) {
      const dlg = document.createElement('dialog');
      if (typeof dlg.showModal !== 'function') { resolver(window.confirm(opciones.titulo + '\n\n' + opciones.mensaje)); return; }
      dlg.setAttribute('aria-labelledby', 'dlg-titulo');
      dlg.innerHTML =
        '<h2 id="dlg-titulo"></h2><p></p>' +
        '<div class="botones-formulario">' +
        '<button type="button" class="boton boton--borde" value="no"></button>' +
        '<button type="button" class="boton boton--peligro" value="si"></button></div>';
      $('h2', dlg).textContent = opciones.titulo;
      $('p', dlg).textContent = opciones.mensaje;
      const [btnNo, btnSi] = dlg.querySelectorAll('button');
      btnNo.textContent = opciones.cancelar || 'Cancelar';
      btnSi.textContent = opciones.aceptar || 'Aceptar';
      function cerrar(valor) { dlg.close(); dlg.remove(); resolver(valor); }
      btnNo.addEventListener('click', function () { cerrar(false); });
      btnSi.addEventListener('click', function () { cerrar(true); });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(false); });
      document.body.appendChild(dlg);
      dlg.showModal();
      btnNo.focus(); // la opción segura queda enfocada
    });
  }

  function mostrarAvisoAlmacen() {
    const caja = $('#aviso-almacen');
    if (!caja) return;
    const mensajes = [];
    if (!almacenDisponible) mensajes.push('Este navegador no permite guardar datos (modo privado o bloqueado). Puedes usar la aplicación, pero los cambios se perderán al cerrar la página.');
    if (avisoAlmacen) mensajes.push(avisoAlmacen);
    if (mensajes.length) { caja.textContent = mensajes.join(' '); caja.hidden = false; }
  }

  // =========================================================
  // 5. Páginas
  // =========================================================

  // ---------- Inicio ----------
  function paginaInicio() {
    function pintar() {
      const productos = Inventario.todos();
      const piezas = productos.reduce(function (s, p) { return s + p.cantidad; }, 0);
      const bajos = productos.filter(function (p) { return p.cantidad > 0 && p.cantidad <= STOCK_BAJO; });
      const agotados = productos.filter(function (p) { return p.cantidad === 0; });

      $('#total-productos').textContent = formatoNumero(productos.length);
      $('#total-piezas').textContent = formatoNumero(piezas);
      $('#total-categorias').textContent = formatoNumero(Inventario.categorias().length);
      const ddRevisar = $('#total-revisar');
      ddRevisar.textContent = formatoNumero(bajos.length + agotados.length);
      ddRevisar.classList.toggle('alerta', bajos.length + agotados.length > 0);

      const lista = $('#lista-revisar');
      lista.innerHTML = '';
      const revisar = agotados.concat(bajos);
      if (!revisar.length) {
        lista.innerHTML = '<li class="vacio">Todo en orden: ningún producto tiene ' + STOCK_BAJO + ' piezas o menos.</li>';
      } else {
        revisar.forEach(function (p) {
          const li = document.createElement('li');
          li.innerHTML = '<a href="agregar.html?id=' + p.id + '">' + escaparHTML(p.nombre) + '</a> ' +
            (p.cantidad === 0 ? 'está agotado.' : 'tiene solo ' + formatoNumero(p.cantidad) + (p.cantidad === 1 ? ' pieza.' : ' piezas.'));
          lista.appendChild(li);
        });
      }
    }

    pintar();
    window.addEventListener('storage', function (e) { if (e.key === CLAVE) pintar(); });

    $('#btn-reiniciar').addEventListener('click', function () {
      confirmar({
        titulo: 'Restaurar productos de ejemplo',
        mensaje: 'Se borrará el inventario actual y se cargarán los 4 productos de ejemplo. Esta acción no se puede deshacer.',
        aceptar: 'Restaurar ejemplo',
        cancelar: 'Conservar mi inventario'
      }).then(function (si) {
        if (!si) return;
        try { Inventario.reiniciar(); pintar(); toast('Se restauraron los productos de ejemplo.'); }
        catch (e) { toast(e.message); }
      });
    });
  }

  // ---------- Productos ----------
  function paginaProductos() {
    const cuerpo = $('#cuerpo-tabla');
    const buscador = $('#buscar');
    const conteo = $('#conteo');
    const btnExportar = $('#btn-exportar');
    const parametros = new URLSearchParams(location.search);
    let idResaltado = parseInt(parametros.get('id'), 10) || null;

    function filtrar(productos) {
      const q = claveComparacion(buscador.value);
      if (!q) return productos;
      return productos.filter(function (p) {
        return claveComparacion(p.nombre + ' ' + p.categoria + ' ' + (p.descripcion || '')).indexOf(q) !== -1 || String(p.id) === q;
      });
    }

    function pintar() {
      const todos = Inventario.todos();
      const visibles = filtrar(todos);
      cuerpo.innerHTML = '';

      btnExportar.disabled = todos.length === 0;
      btnExportar.title = todos.length === 0 ? 'Agrega al menos un producto para generar el reporte.' : '';

      if (!todos.length) {
        conteo.textContent = '';
        cuerpo.innerHTML = '<tr><td colspan="5"><div class="estado-vacio"><strong>Todavía no hay productos en el inventario.</strong>' +
          'Registra el primero para empezar a llevar el control.<br><a class="boton boton--principal" href="agregar.html">Agregar producto</a></div></td></tr>';
        return;
      }

      if (!visibles.length) {
        conteo.textContent = 'Ningún producto coincide con "' + limpiar(buscador.value) + '".';
        cuerpo.innerHTML = '<tr><td colspan="5"><div class="estado-vacio"><strong>Sin resultados.</strong>' +
          'Revisa cómo lo escribiste o busca por categoría.<br><button type="button" class="boton boton--borde" id="limpiar-busqueda">Limpiar búsqueda</button></div></td></tr>';
        $('#limpiar-busqueda').addEventListener('click', function () { buscador.value = ''; pintar(); buscador.focus(); });
        return;
      }

      conteo.textContent = visibles.length === todos.length
        ? 'Mostrando ' + todos.length + (todos.length === 1 ? ' producto.' : ' productos.')
        : 'Mostrando ' + visibles.length + ' de ' + todos.length + ' productos.';

      visibles.forEach(function (p) {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        if (p.id === idResaltado) tr.className = 'recien';
        let etiqueta = '';
        if (p.cantidad === 0) etiqueta = '<span class="etiqueta etiqueta--agotado">Agotado</span>';
        else if (p.cantidad <= STOCK_BAJO) etiqueta = '<span class="etiqueta etiqueta--bajo">Stock bajo</span>';
        tr.innerHTML =
          '<td class="id">' + p.id + '</td>' +
          '<td><span class="nombre-producto">' + escaparHTML(p.nombre) + '</span>' +
            (p.descripcion ? '<span class="descripcion-producto">' + escaparHTML(p.descripcion) + '</span>' : '') + '</td>' +
          '<td>' + escaparHTML(p.categoria) + '</td>' +
          '<td class="num">' + formatoNumero(p.cantidad) + etiqueta + '</td>' +
          '<td class="col-acciones"><div class="acciones">' +
            '<a class="boton boton--borde boton--chico" href="agregar.html?id=' + p.id + '" aria-label="Modificar ' + escaparHTML(p.nombre) + '">Modificar</a>' +
            '<button type="button" class="boton boton--texto-rojo boton--chico" data-eliminar="' + p.id + '" aria-label="Eliminar ' + escaparHTML(p.nombre) + '">Eliminar</button>' +
          '</div></td>';
        cuerpo.appendChild(tr);
      });
      idResaltado = null;
    }

    cuerpo.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-eliminar]');
      if (!btn) return;
      const id = parseInt(btn.dataset.eliminar, 10);
      const producto = Inventario.buscar(id);
      if (!producto) { toast('Ese producto ya no existe. La lista se actualizó.'); pintar(); return; }
      confirmar({
        titulo: 'Eliminar producto',
        mensaje: '¿Eliminar "' + producto.nombre + '" (' + formatoNumero(producto.cantidad) + ' en existencia) del inventario?',
        aceptar: 'Eliminar producto',
        cancelar: 'Conservar'
      }).then(function (si) {
        if (!si) { btn.focus(); return; }
        let eliminado;
        try { eliminado = Inventario.eliminar(id); } catch (err) { toast(err.message); return; }
        pintar();
        if (!eliminado) { toast('Ese producto ya había sido eliminado.'); return; }
        buscador.focus();
        toast('Producto eliminado: ' + eliminado.nombre + '.', {
          texto: 'Deshacer',
          alHacer: function () {
            if (Inventario.restaurar(eliminado)) { idResaltado = eliminado.id; pintar(); toast('Se recuperó ' + eliminado.nombre + '.'); }
            else toast('No se pudo recuperar: ya existe un producto con ese nombre.');
          }
        });
      });
    });

    buscador.addEventListener('input', pintar);

    btnExportar.addEventListener('click', function () {
      const productos = Inventario.todos();
      if (!productos.length) { toast('No hay productos para exportar.'); return; }
      const fecha = new Date();
      const filas = [
        ['Reporte de inventario'],
        ['Generado el ' + fecha.toLocaleString('es-MX')],
        [],
        ['ID', 'Producto', 'Categoría', 'Descripción', 'Existencia', 'Estado', 'Última modificación']
      ];
      productos.forEach(function (p) {
        filas.push([
          p.id, p.nombre, p.categoria, p.descripcion || '', p.cantidad,
          p.cantidad === 0 ? 'Agotado' : (p.cantidad <= STOCK_BAJO ? 'Stock bajo' : 'Disponible'),
          formatoFecha(p.actualizado)
        ]);
      });
      filas.push([]);
      filas.push(['', 'Total de productos', '', '', productos.length]);
      filas.push(['', 'Total de piezas', '', '', productos.reduce(function (s, p) { return s + p.cantidad; }, 0)]);

      const archivo = window.XLSX_LITE.workbook(filas, {
        sheetName: 'Inventario', titleRow: 0, headerRow: 3, lastDataRow: 4 + productos.length, widths: [7, 24, 16, 42, 12, 13, 22]
      });
      const yyyy = fecha.getFullYear(), mm = String(fecha.getMonth() + 1).padStart(2, '0'), dd = String(fecha.getDate()).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(archivo);
      a.download = 'reporte-inventario-' + yyyy + '-' + mm + '-' + dd + '.xlsx';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Reporte exportado con ' + productos.length + (productos.length === 1 ? ' producto.' : ' productos.'));
    });

    window.addEventListener('storage', function (e) { if (e.key === CLAVE) pintar(); });

    pintar();

    // Mensaje después de guardar en el formulario
    const ok = parametros.get('ok');
    const mensajes = { agregado: 'Producto agregado.', modificado: 'Cambios guardados.', 'sin-cambios': 'No había cambios que guardar.' };
    if (mensajes[ok]) toast(mensajes[ok]);
    if (ok || parametros.get('id')) history.replaceState(null, '', location.pathname);
  }

  // ---------- Formulario (agregar / modificar) ----------
  function paginaFormulario() {
    const form = $('#form-producto');
    const parametros = new URLSearchParams(location.search);
    const textoId = parametros.get('id');
    const modoEdicion = textoId !== null;
    const id = modoEdicion && /^\d+$/.test(textoId) ? parseInt(textoId, 10) : null;
    const campos = ['nombre', 'categoria', 'descripcion', 'cantidad'];
    let enviando = false;

    // Lista de categorías existentes para autocompletar
    const lista = $('#lista-categorias');
    Inventario.categorias().forEach(function (c) {
      const o = document.createElement('option'); o.value = c; lista.appendChild(o);
    });

    // Modo modificar
    if (modoEdicion) {
      const producto = id ? Inventario.buscar(id) : null;
      if (!producto) {
        form.hidden = true;
        $('#no-encontrado').hidden = false;
        $('#no-encontrado-id').textContent = textoId || '(vacío)';
        document.title = 'Producto no encontrado | Sistema de Inventario';
        $('#titulo-formulario').textContent = 'Producto no encontrado';
        $('#entrada-formulario').textContent = '';
        return;
      }
      document.title = 'Modificar producto | Sistema de Inventario';
      $('#titulo-formulario').textContent = 'Modificar producto';
      $('#entrada-formulario').textContent = 'Estás modificando el producto con ID ' + producto.id + '. Registrado el ' + formatoFecha(producto.creado) + '.';
      $('#btn-guardar-texto').textContent = 'Guardar cambios';
      form.nombre.value = producto.nombre;
      form.categoria.value = producto.categoria;
      form.descripcion.value = producto.descripcion || '';
      form.cantidad.value = producto.cantidad;
      // en modo edición la opción de "otro" no aplica
      const otro = $('#agregar-otro'); if (otro) otro.closest('.campo').hidden = true;
    }

    // Contador de caracteres de la descripción
    const contador = $('#contador-descripcion');
    function actualizarContador() {
      const n = form.descripcion.value.length;
      contador.textContent = n + ' / ' + LIMITES.descripcionMax;
      contador.classList.toggle('excedido', n > LIMITES.descripcionMax);
    }
    form.descripcion.addEventListener('input', actualizarContador);
    actualizarContador();

    function mostrarErrores(errores) {
      campos.forEach(function (c) {
        const contenedor = form[c].closest('.campo');
        const msj = $('#error-' + c);
        const hay = Boolean(errores[c]);
        contenedor.classList.toggle('con-error', hay);
        form[c].setAttribute('aria-invalid', hay ? 'true' : 'false');
        msj.textContent = errores[c] || '';
      });
      const resumen = $('#resumen-errores');
      const lista = $('ul', resumen);
      lista.innerHTML = '';
      const claves = Object.keys(errores);
      if (!claves.length) { resumen.hidden = true; return; }
      claves.forEach(function (c) {
        const li = document.createElement('li');
        if (form[c]) {
          const a = document.createElement('a');
          a.href = '#' + c; a.textContent = errores[c];
          a.addEventListener('click', function (e) { e.preventDefault(); form[c].focus(); });
          li.appendChild(a);
        } else li.textContent = errores[c];
        lista.appendChild(li);
      });
      resumen.hidden = false;
      resumen.focus();
    }

    // Validación al salir de cada campo (solo de ese campo)
    campos.forEach(function (c) {
      form[c].addEventListener('blur', function () {
        if (!form[c].value && !form[c].closest('.campo').classList.contains('con-error')) return;
        const r = Inventario.validar(leerFormulario(), id);
        const contenedor = form[c].closest('.campo');
        contenedor.classList.toggle('con-error', Boolean(r.errores[c]));
        form[c].setAttribute('aria-invalid', r.errores[c] ? 'true' : 'false');
        $('#error-' + c).textContent = r.errores[c] || '';
      });
    });

    // Evita que se escriban letras, signos o "e" en la cantidad
    form.cantidad.addEventListener('keydown', function (e) {
      if (['e', 'E', '+', '-', '.', ','].indexOf(e.key) !== -1) e.preventDefault();
    });

    function leerFormulario() {
      return {
        nombre: form.nombre.value,
        categoria: form.categoria.value,
        descripcion: form.descripcion.value,
        // si el navegador marca el número como inválido (p. ej. "1e5"), value llega vacío; se toma el texto crudo
        cantidad: form.cantidad.validity && form.cantidad.validity.badInput ? 'x' : form.cantidad.value
      };
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enviando) return;          // evita guardar dos veces por doble clic
      enviando = true;
      const boton = $('#btn-guardar');
      boton.disabled = true;

      let r;
      try {
        r = modoEdicion ? Inventario.modificar(id, leerFormulario()) : Inventario.agregar(leerFormulario());
      } catch (err) {
        r = { valido: false, errores: { general: err.message } };
      }

      if (!r.valido) {
        mostrarErrores(r.errores);
        enviando = false;
        boton.disabled = false;
        return;
      }

      if (!modoEdicion && $('#agregar-otro') && $('#agregar-otro').checked) {
        // Guardar y seguir capturando
        const categoria = r.producto.categoria;
        form.reset();
        form.categoria.value = categoria;
        if (!lista.querySelector('option[value="' + CSS.escape(categoria) + '"]')) {
          const o = document.createElement('option'); o.value = categoria; lista.appendChild(o);
        }
        $('#agregar-otro').checked = true;
        mostrarErrores({});
        actualizarContador();
        toast('Producto agregado: ' + r.producto.nombre + ' (ID ' + r.producto.id + ').');
        form.nombre.focus();
        enviando = false;
        boton.disabled = false;
        return;
      }

      const ok = modoEdicion ? (r.sinCambios ? 'sin-cambios' : 'modificado') : 'agregado';
      location.href = 'productos.html?ok=' + ok + '&id=' + r.producto.id;
    });
  }

  // =========================================================
  // 6. Arranque
  // =========================================================
  document.addEventListener('DOMContentLoaded', function () {
    almacenDisponible = probarAlmacen();
    leer();                      // crea los datos de ejemplo la primera vez
    mostrarAvisoAlmacen();

    const pagina = document.body.dataset.pagina;
    if (pagina === 'inicio') paginaInicio();
    else if (pagina === 'productos') paginaProductos();
    else if (pagina === 'formulario') paginaFormulario();
  });

  // Se expone para pruebas desde la consola.
  window.Inventario = Inventario;
})();
