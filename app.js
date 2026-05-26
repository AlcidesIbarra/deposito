const API_URL = 'https://deposito.infinityfreeapp.com/api.php'; 

// Estado de simulación inicial para la mesa de trabajo local
let usuarioMock = { usuario: "tester", rol: "deposito" };
let sucursalSeleccionada = 1;
let pedidoSistemaSeleccionado = "1001"; // Guarda el remito activo elegido del Pop-up
let marcaSeleccionada = "TODAS";
let filtoEstadoSeleccionado = "TODOS"; // Filtro de estados ('TODOS', 'BUSCAR', 'PENDIENTES')
let listadoCompletoPedidos = [];
let html5QrcodeScanner = null;
let pedidoIdParaEscanear = null;
let datosCambioPendiente = null; // Almacén transitorio para los motivos de baja
let datosOptimoPendiente = null; // Almacén transitorio para el ajuste de óptimos fijos

document.addEventListener('DOMContentLoaded', () => {
    configurarMenuHamburguesa();
    cargarPedidos();
});

// Control básico del panel de testeo deslizable
function configurarMenuHamburguesa() {
    const burgerBtn = document.getElementById('btn-burger');
    const closeBtn = document.getElementById('btn-close-sidebar');
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay'); 

    if (!burgerBtn || !closeBtn || !sidebar || !overlay) return; 

    burgerBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        overlay.style.display = 'block'; 
        overlay.style.pointerEvents = 'auto'; // Habilita clicks en el velo para cerrar
    });

    closeBtn.addEventListener('click', cerrarMenu);
    overlay.addEventListener('click', cerrarMenu);
}

// 🔐 FUNCIÓN UNIFICADA Y CORREGIDA: Elimina el congelamiento y oscurecido de pantalla
function cerrarMenu() {
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none'; 
        overlay.style.pointerEvents = 'none'; // Los clicks pasan de largo sin trabar
    }
}

function testearCambioRol(nuevoRol) {
    usuarioMock.rol = nuevoRol; 
    
    document.getElementById('btn-rol-deposito').classList.toggle('active', nuevoRol === 'deposito');
    document.getElementById('btn-rol-sucursal').classList.toggle('active', nuevoRol === 'sucursal');
    
    marcaSeleccionada = "TODAS";
    filtoEstadoSeleccionado = "TODOS";
    
    cargarPedidos(); 
    cerrarMenu(); 
}

function testearCambioSucursal(numeroSuc) {
    sucursalSeleccionada = numeroSuc;
    const botones = document.querySelectorAll('.suc-btn-v');
    botones.forEach((btn, index) => {
        btn.classList.toggle('active', (index + 1) === numeroSuc);
    });
    pedidoSistemaSeleccionado = null;
    marcaSeleccionada = "TODAS";
    filtoEstadoSeleccionado = "TODOS";
    
    cargarPedidos();
    cerrarMenu(); 
}

// Carga inicial: Verifica si hay que elegir remito o dibuja la mesa de trabajo
function cargarPedidos() {
    const textoRol = (usuarioMock.rol === 'deposito') ? 'DEPOSITO' : 'SUCURSAL';

    if (!pedidoSistemaSeleccionado) {
        document.getElementById('titulo-pagina').innerText = `📦 MODO: ${textoRol} ➔ Seleccionando Carga`;

        fetch(`${API_URL}?accion=obtener_remitos_disponibles&sucursal=${sucursalSeleccionada}`)
            .then(res => res.json())
            .then(remitos => { abrirModalSeleccionRemito(remitos); })
            .catch(err => console.error("Error trayendo remitos:", err));
        return;
    }

    document.getElementById('titulo-pagina').innerText = `📦 MODO: ${textoRol} ➔ Pedido #${pedidoSistemaSeleccionado} (Suc. ${sucursalSeleccionada})`;

    fetch(`${API_URL}?accion=listar_pedidos&sucursal=${sucursalSeleccionada}&id_pedido_sistema=${pedidoSistemaSeleccionado}`)
        .then(res => {
            if (!res.ok) throw new Error("Error en la respuesta del servidor");
            return res.json();
        })
        .then(pedidos => {
            listadoCompletoPedidos = pedidos;
            generarBotonesDeMarcas(pedidos);
            generarBarraHerramientasInferior(pedidos);
            renderizarTarjetasFiltradas();
        })
        .catch(err => {
            console.error("Error al cargar pedidos:", err);
            const contenedor = document.getElementById('contenedor-tarjetas-productos');
            if (contenedor) contenedor.innerHTML = '<p style="color:red; text-align:center;">Error al conectar con la API.</p>';
        });
}

function abrirModalSeleccionRemito(remitos) {
    const contenedorBotones = document.getElementById('remitos-botones-box');
    contenedorBotones.innerHTML = '';

    if (remitos.length === 0) {
        contenedorBotones.innerHTML = '<p style="font-size:0.85rem; color:#666; padding:15px 0;">No se encontraron pedidos cargados hoy para esta sucursal.</p>';
        document.getElementById('remitos-modal').style.display = 'flex';
        return;
    }

    remitos.forEach(remito => {
        let estiloBoton = 'border-left: 5px solid #2563eb;';
        let textoExtra = '';
        let funcionClick = `intentarAgarrarRemito('${remito.id_pedido_sistema}')`;

        if (remito.preparado_por && remito.preparado_por !== usuarioMock.usuario) {
            estiloBoton = 'border-left: 5px solid #dc3545; background-color: #fef2f2; color: #666; cursor: not-allowed;';
            textoExtra = `<br><span style="color:#dc3545; font-size:0.7rem; font-weight:bold;">🔒 En preparación por: ${remito.preparado_por}</span>`;
            if (usuarioMock.rol === 'deposito') {
                funcionClick = `mostrarToast('Acción Denegada: Este remito lo está armando ${remito.preparado_por}', 'danger')`;
            } else {
                funcionClick = `seleccionarRemitoActivo('${remito.id_pedido_sistema}')`;
            }
        } else if (remito.preparado_por === usuarioMock.usuario) {
            estiloBoton = 'border-left: 5px solid #28a745; background-color: #f3fbf5;';
            textoExtra = `<br><span style="color:#28a745; font-size:0.7rem; font-weight:bold;">✅ Tu pedido activo</span>`;
            funcionClick = `seleccionarRemitoActivo('${remito.id_pedido_sistema}')`;
        }

        contenedorBotones.innerHTML += `
            <button class="btn-motivo-select" style="${estiloBoton}" onclick="${funcionClick}">
                📄 Pedido de Carga #${remito.id_pedido_sistema} ${textoExtra}
            </button>
        `;
    });

    document.getElementById('remitos-modal').style.display = 'flex';
}

function seleccionarRemitoActivo(idRemito) {
    pedidoSistemaSeleccionado = idRemito;
    const modalRemitos = document.getElementById('remitos-modal');
    if (modalRemitos) modalRemitos.style.display = 'none';
    mostrarToast(`Cargando Pedido #${idRemito}...`, "success");
    cargarPedidos();
}

function generarBotonesDeMarcas(pedidos) {
    const contenedorMarcas = document.getElementById('bar-marcas');
    if (!contenedorMarcas) return;
    contenedorMarcas.innerHTML = '';
    const marcasUnicas = new Set();
    pedidos.forEach(p => { if (p.marca) marcasUnicas.add(p.marca); });

    marcasUnicas.forEach(marca => {
        const productosDeEstaMarca = pedidos.filter(p => p.marca === marca);
        const marcaCompletamenteLista = productosDeEstaMarca.every(p => parseInt(p.preparado) === 1 || parseInt(p.enviado) === 1);
        let claseBoton = 'marca-filter-btn';
        if (marcaCompletamenteLista) claseBoton += ' completada';
        if (marcaSeleccionada === marca) claseBoton += ' active';
        contenedorMarcas.innerHTML += `<button class="${claseBoton}" onclick="filtrarGlobal('${marca}', filtoEstadoSeleccionado)">${marca}</button>`;
    });
}

function generarBarraHerramientasInferior(pedidos) {
    const contenedorFiltros = document.getElementById('panel-filtros-estados');
    if (!contenedorFiltros) return; 
    
    contenedorFiltros.innerHTML = '';
    const cantBuscar = pedidos.filter(p => parseInt(p.falta_estante) === 1 && parseInt(p.enviado) === 0).length;
    const cantPendientes = pedidos.filter(p => parseInt(p.preparado) === 0 && parseInt(p.enviado) === 0).length;

    contenedorFiltros.innerHTML = `
        <select class="select-filter-bottom" style="flex:1; border-color:#007bff; color:#007bff; height:38px;" onchange="filtrarGlobal(marcaSeleccionada, this.value)">
            <option value="TODOS" ${filtoEstadoSeleccionado === 'TODOS' ? 'selected' : ''}>👁️ Todos</option>
            <option value="BUSCAR" ${filtoEstadoSeleccionado === 'BUSCAR' ? 'selected' : ''}>🚨 Buscar (${cantBuscar})</option>
            <option value="PENDIENTES" ${filtoEstadoSeleccionado === 'PENDIENTES' ? 'selected' : ''}>📦 Pendientes (${cantPendientes})</option>
        </select>
        <button class="btn-acciones-inferior" onclick="abrirMenuAccionesFlotante()">⚙️ Opciones</button>
    `;
}

function filtrarGlobal(marca, estado) {
    marcaSeleccionada = marca; 
    filtoEstadoSeleccionado = estado;
    generarBotonesDeMarcas(listadoCompletoPedidos); 
    generarBarraHerramientasInferior(listadoCompletoPedidos); 
    renderizarTarjetasFiltradas();
}


function renderizarTarjetasFiltradas() {
    const contenedor = document.getElementById('contenedor-tarjetas-productos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    let filtrados = listadoCompletoPedidos;

    if (marcaSeleccionada !== "TODAS") {
        filtrados = filtrados.filter(p => p.marca === marcaSeleccionada);
    }

    if (filtoEstadoSeleccionado === "BUSCAR") {
        filtrados = filtrados.filter(p => parseInt(p.falta_estante) === 1 && parseInt(p.enviado) === 0);
    } else if (filtoEstadoSeleccionado === "PENDIENTES") {
        filtrados = filtrados.filter(p => parseInt(p.preparado) === 0 && parseInt(p.enviado) === 0);
    }

    if (filtrados.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; padding:30px; color:#666;">No hay productos para mostrar con estos filtros.</p>';
        return;
    }

    filtrados.forEach(p => {
        const esPreparado = parseInt(p.preparado) === 1;
        const esFalta = parseInt(p.falta_estante) === 1;
        
        const audSucursal = p.auditoria_sucursal ? parseInt(p.auditoria_sucursal) === 1 : false;
        const audDeposito = p.auditoria_deposito ? parseInt(p.auditoria_deposito) === 1 : false;
        const esAuditoria = (usuarioMock.rol === 'sucursal') ? audSucursal : audDeposito;

        // Resguardos lógicos alineados a las insignias (badges) de tu CSS
        const stockDep = p.stock_deposito || 45; 
        const stockSuc = p.stock_sucursal || 5;
        const stockOpt = p.stock_optimo || 15;

        // 🎨 NUEVA LÓGICA DE ALERTAS: Evalúa las diferencias de stock calculadas por api.php
        let htmlAlertaDiferencia = '';
        if (esAuditoria) {
            const dif = parseInt(p.auditoria_diferencia || 0);
            if (dif === 0) {
                htmlAlertaDiferencia = `<span class="badge" style="background-color: #22c55e; color: white; margin-left: 4px; font-size: 0.65rem; padding: 1px 3px; display: inline-block; vertical-align: middle;">OK</span>`;
            } else if (dif < 0) {
                htmlAlertaDiferencia = `<span class="badge" style="background-color: #dc3545; color: white; margin-left: 4px; font-size: 0.65rem; padding: 1px 3px; display: inline-block; vertical-align: middle;">${dif}</span>`;
            } else if (dif > 0) {
                htmlAlertaDiferencia = `<span class="badge" style="background-color: #f97316; color: white; margin-left: 4px; font-size: 0.65rem; padding: 1px 3px; display: inline-block; vertical-align: middle;">+${dif}</span>`;
            }
        }

        // 🎨 DINAMISMO PERIMETRAL: Si está auditado, forzamos que adopte el contorno verde de listo
        let claseBordeDinamico = '';
        if (esAuditoria) {
            claseBordeDinamico = 'preparado'; 
        } else if (esFalta) {
            claseBordeDinamico = 'falta';
        } else if (esPreparado) {
            claseBordeDinamico = 'preparado';
        }

        // 🔄 SINCRONIZACIÓN DE CANTIDADES EN TIEMPO REAL:
        // Si el artículo ya está auditado, muestra en el casillero blanco las unidades contadas (ej: 22).
        // Si aún no se auditó, muestra la cantidad esperada original del remito (ej: 20).
        const cantidadAMostrar = esAuditoria ? (parseInt(p.cant_conformes) || 0) : parseInt(p.cantidad);

        contenedor.innerHTML += `
            <div class="card ${claseBordeDinamico}">
                <!-- Títulos e Información Superior -->
                <h4 class="card-title"><strong>[${p.marca || 'Sin Marca'}]</strong> ${p.nombre}</h4>
                <p class="card-meta">Cod: PROD-${p.id} | CB: ${p.codigo_barras}</p>
                
                <!-- Fila de Datos Alineada Transversal -->
                <div class="card-row-data">
                    <div class="inline-stocks-group">
                        <span class="badge bg-deposito">DEP: ${stockDep}</span>
                        <!-- Inyectamos el badge matemático al lado de SUC -->
                        <span class="badge bg-sucursal" style="display: inline-flex; align-items: center;">
                            SUC: ${stockSuc}${htmlAlertaDiferencia}
                        </span>
                        <span class="badge bg-optimo">OPT: ${stockOpt}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="unidades-preparar-text">Preparar:</span>
                        <!-- Corregido: value ahora lee cantidadAMostrar en vez de p.cantidad fijo -->
                        <input type="number" 
                               class="input-cantidad" 
                               value="${cantidadAMostrar}" 
                               min="0"
                               onchange="cambiarCantidadPedido(${p.id}, this.value)" 
                               style="width: 45px; text-align: center; font-weight: bold; border-radius: 4px; border: 1px solid #cbd5e1; height: 26px;">
                    </div>
                </div>

                <!-- Botonera de Acciones en Cuadrícula -->
                <div class="actions-grid">
                    <button class="btn-action btn-audit ${esAuditoria ? 'active' : ''}" onclick="toggleAuditoria(${p.id}, '${usuarioMock.rol}')">
                        ${esAuditoria ? '✅ Audit.' : 'Audit.'}
                    </button>
                    <button class="btn-action btn-missing ${esFalta ? 'active' : ''}" onclick="toggleFaltaEstante(${p.id}, ${esFalta ? 0 : 1})">Buscar</button>
                    <button class="btn-action btn-ready ${esPreparado ? 'active' : ''}" onclick="togglePreparado(${p.id}, ${esPreparado ? 0 : 1})">Preparado</button>
                    <button class="btn-action btn-scan" onclick="abrirEscanerParaItem(${p.id})">Scan</button>
                </div>
            </div>
        `;
    });
}



function intentarAgarrarRemito(idRemito) {
    fetch(`${API_URL}?accion=bloquear_remito_operario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_sucursal: sucursalSeleccionada,
            id_pedido_sistema: idRemito,
            operario: usuarioMock.usuario
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            seleccionarRemitoActivo(idRemito);
        } else {
            mostrarToast(data.message || "No se pudo tomar el remito", "danger");
        }
    })
    .catch(err => {
        console.error("Error al bloquear remito:", err);
        mostrarToast("Falla de comunicación con el servidor", "danger");
    });
}

// 🔍 FUNCIÓN CORREGIDA: Se comunica de forma limpia con tu api.php
function toggleAuditoria(idPedido, tipoRol, nuevoValor) {
    const pedido = listadoCompletoPedidos.find(p => p.id == idPedido);
    if (!pedido) {
        console.error("No se encontró el pedido localmente con ID:", idPedido);
        return;
    }

    const params = new URLSearchParams({
        id: idPedido,
        nombre: pedido.nombre,
        marca: pedido.marca || 'Sin Marca',
        codigo: `PROD-${pedido.id}`,
        cb: pedido.codigo_barras,
        cantidad: pedido.cantidad,
        sucursal: sucursalSeleccionada,
        remito: pedidoSistemaSeleccionado,
        rol: tipoRol,
        aud_suc: pedido.auditoria_sucursal || 0, 
        aud_dep: pedido.auditoria_deposito || 0  
    });

    window.location.href = `auditoria.html?${params.toString()}`;
}

// 🚨 ESTADO BUSCAR / FALTA: Cambia el estado de falta en estante de un producto
function toggleFaltaEstante(idPedido, nuevoValor) {
    fetch(`${API_URL}?accion=toggle_falta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_pedido: idPedido,
            valor: nuevoValor
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            mostrarToast(nuevoValor === 1 ? "Producto marcado para buscar" : "Falta removida", "warning");
            cargarPedidos(); // Refresca las tarjetas y actualiza el borde a rojo si corresponde
        } else {
            mostrarToast(data.message || "Error al actualizar falta", "danger");
        }
    })
    .catch(err => console.error("Error en toggleFaltaEstante:", err));
}

// ✅ ESTADO PREPARADO: Cambia el estado de bulto listo en depósito
function togglePreparado(idPedido, nuevoValor) {
    fetch(`${API_URL}?accion=toggle_preparado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_pedido: idPedido,
            valor: nuevoValor
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            mostrarToast(nuevoValor === 1 ? "Producto marcado como preparado" : "Estado preparado removido", "success");
            cargarPedidos(); // Refresca las tarjetas y cambia el borde lateral a verde
        } else {
            mostrarToast(data.message || "Error al actualizar preparado", "danger");
        }
    })
    .catch(err => console.error("Error en togglePreparado:", err));
}

// 🔢 CANTIDAD: Permite modificar el número de unidades directamente desde el recuadro
function cambiarCantidadPedido(idPedido, nuevaCantidad) {
    if (isNaN(nuevaCantidad) || nuevaCantidad < 0) {
        mostrarToast("Cantidad inválida", "danger");
        return;
    }

    fetch(`${API_URL}?accion=actualizar_cantidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_pedido: idPedido,
            cantidad: parseInt(nuevaCantidad)
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            mostrarToast("Cantidad actualizada", "success");
            // No recargamos todo con cargarPedidos() para no perder el foco del input mientras el usuario escribe
            const pedidoModificado = listadoCompletoPedidos.find(p => p.id == idPedido);
            if (pedidoModificado) pedidoModificado.cantidad = nuevaCantidad;
        } else {
            mostrarToast(data.message || "Acción denegada", "danger");
            cargarPedidos(); // Revierte el cambio visual si el servidor lo rebotó (por ejemplo, si ya fue enviado)
        }
    })
    .catch(err => console.error("Error en cambiarCantidadPedido:", err));
}

// 📷 Iniciar escáner para un ítem específico
function abrirEscanerParaItem(idPedido) {
    pedidoIdParaEscanear = idPedido;
    
    const modal = document.getElementById('scanner-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';

    // Inicializamos la librería sobre el div "reader" de tu HTML
    html5QrcodeScanner = new Html5Qrcode("reader");
    
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 150 }, // Caja de enfoque adaptada para códigos de barra largos
        aspectRatio: 1.0 
    };

    // Encendemos la cámara trasera del celular (environment)
    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess, 
        onScanFailure
    ).catch(err => {
        console.error("Error al iniciar la cámara:", err);
        mostrarToast("No se pudo acceder a la cámara", "danger");
        cerrarEscaner();
    });
}


// 🎯 Función que procesa la lectura de la cámara trasera
function onScanSuccess(decodedText, decodedResult) {
    const pedidoActual = listadoCompletoPedidos.find(p => p.id == pedidoIdParaEscanear);
    
    if (!pedidoActual) {
        cerrarEscaner();
        return;
    }

    // Apagamos la cámara de inmediato para no saturar el lente leyendo códigos en bucle
    html5QrcodeScanner.stop().then(() => {
        
        // Comparamos el código leído con el código de barras registrado
        if (decodedText.trim() === pedidoActual.codigo_barras.trim()) {
            
            // 🟢 MUESTRA TOAST VERDE DE ÉXITO en medio de la pantalla
            const toastExito = document.getElementById('toast-scan-exito');
            if (toastExito) {
                toastExito.style.opacity = '1';
                toastExito.style.transform = 'translate(-50%, -50%) scale(1)';
            }

            // Impactamos la base de datos marcando bulto listo (preparado = 1)
            togglePreparado(pedidoActual.id, 1);
            cerrarEscaner();

            // Desvanecer el cartel automáticamente después de 1.8 segundos
            setTimeout(() => {
                if (toastExito) toastExito.style.opacity = '0';
            }, 1800);

        } else {
            
            // 🔴 MUESTRA TOAST ROJO DE ERROR en medio de la pantalla
            const toastError = document.getElementById('toast-scan-error');
            const txtDetalle = document.getElementById('txt-scan-error-detalle');
            
            if (txtDetalle) {
                txtDetalle.innerText = `Leído: ${decodedText}\nSe esperaba el código de:\n${pedidoActual.nombre}`;
            }
            if (toastError) {
                toastError.style.opacity = '1';
                toastError.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            
            cerrarEscaner();

            // Mantenemos el error en pantalla 2.5 segundos para que el operario lea y se desvanece solo
            setTimeout(() => {
                if (toastError) {
                    toastError.style.opacity = '0';
                    toastError.style.transform = 'translate(-50%, -50%) scale(0.9)';
                }
            }, 2500);
        }
    }).catch(err => console.error("Error al detener el lente de la cámara:", err));
}


// Función silenciosa para fallas de lectura por segundo (pestañeos de cámara)
function onScanFailure(error) {
    // No ponemos alertas aquí porque la cámara tira "failures" constantemente hasta que enfoca bien
}

// ✕ Cerrar el modal y apagar la cámara manualmente
function cerrarEscaner() {
    document.getElementById('scanner-modal').style.display = 'none';
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(err => console.error(err));
    }
    pedidoIdParaEscanear = null;
}

// ✕ Acción del botón del Pop-up de error: Cierra el cartel y reinicia la cámara para reintentar
function reanudarEscaneoDespuesDeError() {
    document.getElementById('scan-error-modal').style.display = 'none';
    if (pedidoIdParaEscanear) {
        abrirEscanerParaItem(pedidoIdParaEscanear);
    }
}



// Funciones utilitarias básicas para la interfaz
function mostrarToast(mensaje, tipo = "success") {
    console.log(`[TOAST - ${tipo.toUpperCase()}]: ${mensaje}`);
}

function abrirMenuAccionesFlotante() {
    const modal = document.getElementById('acciones-remito-modal');
    if (modal) modal.style.display = 'flex';
}

function cerrarMenuAccionesFlotante() {
    const modal = document.getElementById('acciones-remito-modal');
    if (modal) modal.style.display = 'none';
}

function cerrarModalSeleccionRemito() {
    const modal = document.getElementById('remitos-modal');
    if (modal) modal.style.display = 'none';
}

// ⚙️ ¡AQUÍ ESTÁ LA FUNCIÓN QUE FALTABA! Levanta el modal para reescribir el stock óptimo
function abrirModalOptimo(idSucursal, codigoInterno, descripcionProducto, valorActual) {
    datosOptimoPendiente = { id_sucursal: idSucursal, codigo_interno: codigoInterno };
    document.getElementById('optimo-modal-titulo').innerText = `OPT - ${descripcionProducto}`;
    const input = document.getElementById('input-optimo-modal');
    if (input) {
        input.value = valorActual;
    }
    document.getElementById('optimo-modal').style.display = 'flex';
    setTimeout(() => { if(input) input.select(); }, 50);
}
function cerrarModalOptimo() {
    document.getElementById('optimo-modal').style.display = 'none';
    datosOptimoPendiente = null;
}

function intentarAgarrarRemito(idRemito) {
    if (usuarioMock.rol === 'sucursal') { seleccionarRemitoActivo(idRemito); return; }
    fetch(`${API_URL}?accion=bloquear_remito_operario`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_sucursal: sucursalSeleccionada, id_pedido_sistema: idRemito, operario: usuarioMock.usuario })
    })
        .then(res => res.json()).then(res => { if (res.success) { seleccionarRemitoActivo(idRemito); } else { mostrarToast(res.message, "danger"); cargarPedidos(); } });
}

function abrirMenuAccionesFlotante() { document.getElementById('acciones-remito-modal').style.display = 'flex'; }
function cerrarMenuAccionesFlotante() { document.getElementById('acciones-remito-modal').style.display = 'none'; }
function ejecutarAccionDesdeMenu(tipoAccion) { cerrarMenuAccionesFlotante(); if (tipoAccion === 'ENVIAR') { verificarYEnviarPedido(); } else if (tipoAccion === 'LIBERAR') { abrirPopUpConfirmarLiberacion(); } }
function abrirPopUpConfirmarLiberacion() { if (!pedidoSistemaSeleccionado) return; document.getElementById('confirmar-liberacion-modal').style.display = 'flex'; }
function cerrarModalConfirmarLiberacion() { document.getElementById('confirmar-liberacion-modal').style.display = 'none'; }

function ejecutarLiberacionBaseDeDatos() {
    document.getElementById('confirmar-liberacion-modal').style.display = 'none';
    fetch(`${API_URL}?accion=liberar_remito_operario`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_sucursal: sucursalSeleccionada, id_pedido_sistema: pedidoSistemaSeleccionado, operario: usuarioMock.usuario })
    })
        .then(res => res.json()).then(res => {
            if (res.success) {
                mostrarToast(`Pedido #${pedidoSistemaSeleccionado} liberado y restablecido.`, "success");
                pedidoSistemaSeleccionado = null; filtoEstadoSeleccionado = "TODOS"; cargarPedidos();
            } else { mostrarToast(res.message, "danger"); }
        })
        .catch(err => console.error("Error al liberar remito:", err));
}

function validarYReducirCantidad(idPedido, inputElement) {
    const maximoOriginal = parseInt(inputElement.getAttribute('data-max')); let valorNuevo = parseInt(inputElement.value);
    if (valorNuevo > maximoOriginal) { mostrarToast("No puedes incrementar las unidades fijadas.", "danger"); inputElement.value = maximoOriginal; return; }
    if (valorNuevo < 0) valorNuevo = 0;
    if (valorNuevo < maximoOriginal) { datosCambioPendiente = { id: idPedido, cantidad: valorNuevo, input: inputElement }; document.getElementById('motivos-modal').style.display = 'flex'; }
    else { actualizarCantidad(idPedido, valorNuevo); }
}

function seleccionarMotivo(motivo) { if (!datosCambioPendiente) return; actualizarCantidad(datosCambioPendiente.id, datosCambioPendiente.cantidad); mostrarToast(`Baja por: ${motivo}`, "success"); document.getElementById('motivos-modal').style.display = 'none'; datosCambioPendiente = null; }
function cerrarModalMotivos() { document.getElementById('motivos-modal').style.display = 'none'; if (datosCambioPendiente) datosCambioPendiente.input.value = datosCambioPendiente.input.getAttribute('data-max'); datosCambioPendiente = null; }
function confirmarGuardadoOptimo() { if (!datosOptimoPendiente) return; const nuevoValor = parseInt(document.getElementById('input-optimo-modal').value) || 0; guardarOptimoFijo(datosOptimoPendiente.id_sucursal, datosOptimoPendiente.codigo_interno, nuevoValor); mostrarToast("Stock óptimo actualizado", "success"); document.getElementById('optimo-modal').style.display = 'none'; datosOptimoPendiente = null; }
function verificarYEnviarPedido() { if (!pedidoSistemaSeleccionado) { mostrarToast("No hay ningún pedido seleccionado.", "danger"); return; } const productosIncompletos = listadoCompletoPedidos.filter(p => p.preparado == 0 && p.falta_estante == 0 && p.enviado == 0); if (productosIncompletos.length > 0) { document.getElementById('confirmar-envio-modal').style.display = 'flex'; } else { procesarEnvioFinal(false); } }

function procesarEnvioFinal(forzarConIncompletos) {
    document.getElementById('confirmar-envio-modal').style.display = 'none';
    fetch(`${API_URL}?accion=despachar_pedido_parcial`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_sucursal: sucursalSeleccionada, id_pedido_sistema: pedidoSistemaSeleccionado }) })
        .then(res => res.json()).then(res => {
            if (res.success) {
                const rolActual = usuarioMock.rol === 'deposito' ? 'DEPOSITO' : 'SUCURSAL';
                const mensaje = forzarConIncompletos ? `Despacho parcial enviado para el Pedido #${pedidoSistemaSeleccionado}.` : `¡Todo el pedido de ${rolActual} fue completado y despachado con éxito!`;
                mostrarToast(mensaje, forzarConIncompletos ? "warning" : "success");
                pedidoSistemaSeleccionado = null; filtoEstadoSeleccionado = "TODOS"; cargarPedidos();
            }
        });
}

function cerrarModalConfirmarEnvio() { document.getElementById('confirmar-envio-modal').style.display = 'none'; }
function cerrarModalSeleccionRemito() { document.getElementById('remitos-modal').style.display = 'none'; }
function toggleAuditoria(idPedido, zonaReporte, estadoActual) { const nuevoEstado = estadoActual == 1 ? 0 : 1; 
    fetch(`${API_URL}?accion=solicitar_auditoria`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id_pedido: idPedido, tipo: zonaReporte, valor: nuevoEstado }) 
    }).then(res => res.json()).then(res => { 
        if (res.success || res) { 
            mostrarToast(nuevoEstado == 1 ? `Auditoría pedida` : "Auditoría cancelada", "warning"); 
            cargarPedidos(); } }); }

function toggleEstado(idPedido, endpoint, valorActual) {
    const nuevoValor = valorActual == 1 ? 0 : 1;
    fetch(`${API_URL}?accion=${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_pedido: idPedido, valor: nuevoValor }) })
        .then(res => res.json()).then(res => {
            if (res.success || res) {
                if (nuevoValor === 1) {
                    const endpointOpuesto = (endpoint === 'toggle_preparado') ? 'toggle_falta' : 'toggle_preparado';
                    fetch(`${API_URL}?accion=${endpointOpuesto}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_pedido: idPedido, valor: 0 }) }).then(() => { mostrarToast("Estado actualizado", "success"); cargarPedidos(); });
                } else { cargarPedidos(); }
            }
        });
}

let escanerBloqueadoPorError = false;
function abrirEscaner(idPedido, codigoBarrasEsperado) { if (!codigoBarrasEsperado || codigoBarrasEsperado === '---') { mostrarToast("Producto sin código.", "danger"); return; } pedidoIdParaEscanear = idPedido; escanerBloqueadoPorError = false; document.getElementById('scanner-modal').style.display = 'flex'; html5QrcodeScanner = new Html5Qrcode("reader"); html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 12, qrbox: { width: 260, height: 140 } }, (decodedText) => { if (escanerBloqueadoPorError) return; const leido = decodedText.trim(); const esperado = codigoBarrasEsperado.trim(); if (leido === esperado) { mostrarToast("¡Verificación Exitosa!", "success"); toggleEstado(pedidoIdParaEscanear, 'toggle_preparado', 0); setTimeout(() => { cerrarEscaner(); }, 300); } else { escanerBloqueadoPorError = true; const msgPanel = document.getElementById('scan-error-mensaje'); msgPanel.innerHTML = `Código incorrecto.<br><b>Esperado:</b> ${esperado}<br><b>Leído:</b> <span style="color:#dc3545">${leido}</span>`; document.getElementById('scan-error-modal').style.display = 'flex'; } }, (error) => { }).catch(err => { mostrarToast("Error de cámara.", "danger"); cerrarEscaner(); }); }
function reanudarEscaneoDespuesDeError() { document.getElementById('scan-error-modal').style.display = 'none'; escanerBloqueadoPorError = false; }
function cerrarEscaner() { document.getElementById('scanner-modal').style.display = 'none'; document.getElementById('scan-error-modal').style.display = 'none'; escanerBloqueadoPorError = false; if (html5QrcodeScanner) { html5QrcodeScanner.stop().then(() => { html5QrcodeScanner = null; }); } }

function mostrarToast(mensaje, tipo = "success") {
    const viejoToast = document.getElementById('system-toast'); if (viejoToast) viejoToast.remove();
    const toast = document.createElement('div'); toast.id = 'system-toast'; toast.className = `toast-popup ${tipo}`; toast.innerText = mensaje; document.body.appendChild(toast);
    let temporizador = setTimeout(() => { removerToastGlobal(); }, 3000);
    function removerToastGlobal() { const elemento = document.getElementById('system-toast'); if (elemento) elemento.remove(); clearTimeout(temporizador); document.removeEventListener('click', removerToastGlobal); }
    setTimeout(() => { document.addEventListener('click', removerToastGlobal); }, 0);
}

function actualizarCantidad(idPedido, nuevaCant) { fetch(`${API_URL}?accion=actualizar_cantidad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_pedido: idPedido, cantidad: nuevaCant }) }).then(res => res.json()).then(res => { if (res.success) { cargarPedidos(); } else if (res.message) { mostrarToast(res.message, "danger"); cargarPedidos(); } }); }
function guardarOptimoFijo(idSucursal, codigoInterno, nuevoOptimo) { enviarPost('guardar_stock_optimo', { id_sucursal: idSucursal, codigo_interno: codigoInterno, stock_optimo: nuevoOptimo }); }
function enviarPost(endpoint, datos) { fetch(`${API_URL}?accion=${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }).then(res => res.json()).then(res => { if (res.success || res) cargarPedidos(); }); }

// 🔍 Redirección limpia desde el menú lateral hacia auditoria.html
// 🔍 Redirección limpia desde el menú lateral hacia auditoria.html
function irAAuditoriaDesdeMenu() {
    if (!pedidoSistemaSeleccionado) {
        alert("Por favor, selecciona primero un Pedido de Carga en la pantalla principal para poder auditarlo.");
        cerrarMenu();
        return;
    }

    const primerProducto = (listadoCompletoPedidos && listadoCompletoPedidos.length > 0) ? listadoCompletoPedidos[0] : null;

    const params = new URLSearchParams({
        id: primerProducto ? primerProducto.id : 1,
        nombre: primerProducto ? primerProducto.nombre : 'Carga General',
        marca: primerProducto ? (primerProducto.marca || 'Varias') : 'MARCA ALFA',
        codigo: `PROD-${primerProducto ? primerProducto.id : 1}`,
        cb: primerProducto ? primerProducto.codigo_barras : '7790000000012',
        cantidad: primerProducto ? primerProducto.cantidad : 5,
        sucursal: sucursalSeleccionada,
        remito: pedidoSistemaSeleccionado,
        rol: usuarioMock.rol,
        aud_suc: primerProducto ? (primerProducto.auditoria_sucursal || 0) : 0,
        aud_dep: primerProducto ? (primerProducto.auditoria_deposito || 0) : 0
    });

    window.location.href = `auditoria.html?${params.toString()}`;
}


