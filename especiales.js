const API_URL = 'http://localhost:50/deposito/api.php';

// Estado operativo en memoria
let sucursalActiva = 1;
let listaTemporalSucursal = []; // El "carrito" especial antes de cruzarse
let productosCatalogoCompleto = []; // Guardamos los artículos de depósito para buscar rápido
let productoSeleccionadoActual = null; // Guarda el ítem elegido del desplegable

document.addEventListener('DOMContentLoaded', () => {
    inicializarBuscadorEspecial();
    recuperarListaTemporal();
});

// Configura las escuchas del teclado para el autocomplete predictivo
function inicializarBuscadorEspecial() {
    const inputBusqueda = document.getElementById('input-busqueda-pred');
    const sugerenciasBox = document.getElementById('sugerencias-box');

    // Escucha cada tecla que el operario digita
    inputBusqueda.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        if (query.length < 2) {
            sugerenciasBox.style.display = 'none';
            return;
        }

        // Si no bajamos el catálogo aún, lo solicitamos a la API
        if (productosCatalogoCompleto.length === 0) {
            fetch(`${API_URL}?accion=obtener_catalogo_completo`)
                .then(res => res.json())
                .then(productos => {
                    productosCatalogoCompleto = productos;
                    filtrarYMostrarSugerencias(query);
                });
        } else {
            filtrarYMostrarSugerencias(query);
        }
    });

    // Cierra el desplegable si el usuario hace clic en cualquier otro sector libre
    document.addEventListener('click', (e) => {
        if (e.target !== inputBusqueda) sugerenciasBox.style.display = 'none';
    });
}

function filtrarYMostrarSugerencias(query) {
    const sugerenciasBox = document.getElementById('sugerencias-box');
    sugerenciasBox.innerHTML = '';

    // Filtrado inteligente por descripción, código interno o barra
    const filtrados = productosCatalogoCompleto.filter(p => {
        return p.descripcion.toLowerCase().includes(query) || 
               p.codigo_interno.toLowerCase().includes(query) || 
               (p.codigo_barras && p.codigo_barras.toLowerCase().includes(query));
    }).slice(0, 6); // Limitamos a 6 filas para que entre cómodo en celulares

    if (filtrados.length === 0) {
        sugerenciasBox.style.display = 'none';
        return;
    }

    filtrados.forEach(p => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <div>
                <span style="font-weight:bold;">[${p.marca}]</span> ${p.descripcion}
                <div class="suggestion-meta">Cod: ${p.codigo_interno}</div>
            </div>
            <div style="font-weight:bold; color:#2563eb;">DEP: ${p.stock}</div>
        `;
        
        div.onclick = () => seleccionarProductoDelCatalogo(p);
        sugerenciasBox.appendChild(div);
    });

    sugerenciasBox.style.display = 'block';
}
function seleccionarProductoDelCatalogo(producto) {
    productoSeleccionadoActual = producto;
    document.getElementById('input-busqueda-pred').value = `[${producto.marca}] ${producto.descripcion}`;
    document.getElementById('sugerencias-box').style.display = 'none';
    
    // Enfoca de manera automática el cuadro de cantidad para agilizar el tipeo
    setTimeout(() => { document.getElementById('input-cantidad-especial').select(); }, 50);
}

function agregarProductoAListaTemporal() {
    const inputCant = document.getElementById('input-cantidad-especial');
    const cantidad = parseInt(inputCant.value) || 0;

    if (!productoSeleccionadoActual) {
        alert("Operación inválida: Primero debes escribir y seleccionar un artículo de la lista desplegable.");
        return;
    }
    if (cantidad <= 0) {
        alert("Por favor, digita una cantidad mayor a cero.");
        return;
    }

    // Buscamos si el artículo ya estaba cargado en el carrito para no duplicar renglones
    const itemExistente = listaTemporalSucursal.find(item => item.codigo_interno === productoSeleccionadoActual.codigo_interno);

    if (itemExistente) {
        // Si ya existía en este remito temporal, le sumamos las unidades nuevas
        itemExistente.cantidad_pedida += cantidad;
    } else {
        // Si es nuevo, lo empujamos como objeto limpio a la matriz
        listaTemporalSucursal.push({
            codigo_interno: productoSeleccionadoActual.codigo_interno,
            descripcion: productoSeleccionadoActual.descripcion,
            marca: productoSeleccionadoActual.marca,
            codigo_barras: productoSeleccionadoActual.codigo_barras,
            cantidad_pedida: cantidad,
            cruzado_sistema: 0 // Bandera visual por defecto
        });
    }

    // Guardamos copia de seguridad local por si se apaga el celular
    localStorage.setItem(`pedido_esp_suc_${sucursalActiva}`, JSON.stringify(listaTemporalSucursal));

    // Reseteamos el buscador para cargar el próximo artículo
    document.getElementById('input-busqueda-pred').value = '';
    inputCant.value = '1';
    productoSeleccionadoActual = null;

    dibujarTablaTemporal();
    document.getElementById('input-busqueda-pred').focus();
}

function recuperarListaTemporal() {
    const guardado = localStorage.getItem(`pedido_esp_suc_${sucursalActiva}`);
    if (guardado) {
        listaTemporalSucursal = JSON.parse(guardado);
    }
    // Ejecutamos un cruce de fondo inmediato en caso de que el otro sistema ya haya cargado datos
    evaluarCruceConSistemaGeneral();
}
function evaluarCruceConSistemaGeneral() {
    // Consultamos la API diaria de pedidos normales
    fetch(`${API_URL}?accion=listar_pedidos&sucursal=${sucursalActiva}`)
        .then(res => res.json())
        .then(pedidosSistema => {
            
            // Recorremos nuestro carrito especial buscando coincidencias
            listaTemporalSucursal.forEach(item => {
                const matchSistema = pedidosSistema.find(p => p.codigo_interno === item.codigo_interno);
                
                if (matchSistema) {
                    // 🚨 REGLA EXIGIDA: Si ya existe en el otro sistema, lo marcamos en rojo
                    item.cruzado_sistema = 1;
                    
                    // 🛡️ PROTECCIÓN DE STOCK: Tomamos de forma automática el valor más alto
                    const cantSistema = parseInt(matchSistema.cantidad_enviar) || 0;
                    if (cantSistema > item.cantidad_pedida) {
                        item.cantidad_pedida = cantSistema;
                    }
                } else {
                    item.cruzado_sistema = 0;
                }
            });

            dibujarTablaTemporal();
        });
}

function dibujarTablaTemporal() {
    const contenedor = document.getElementById('tabla-especiales-container');
    contenedor.innerHTML = '';

    document.getElementById('contador-items').innerText = `${listaTemporalSucursal.length} productos`;

    if (listaTemporalSucursal.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; color:#666; padding:30px;">Tu lista de pedidos especiales está vacía.</p>';
        return;
    }

    listaTemporalSucursal.forEach((item, index) => {
        // Si tiene la bandera activada, le inyectamos la clase de realce rojo del CSS
        let rowClass = 'row-item-especial';
        let cartelAlerta = '';
        
        if (item.cruzado_sistema === 1) {
            rowClass += ' cruzado-sistema';
            cartelAlerta = `<span style="color:#ef4444; font-weight:bold; font-size:0.7rem; display:block; margin-top:2px;">⚠️ Combinado con Sistema General (Cantidad Máxima Fijada)</span>`;
        }

        contenedor.innerHTML += `
            <div class="${rowClass}">
                <div class="item-title">[${item.marca}] ${item.descripcion}</div>
                <div class="item-meta">Cod: ${item.codigo_interno} | CB: ${item.codigo_barras ? item.codigo_barras : '---'}${cartelAlerta}</div>
                <div class="item-qty-zone">
                    <span>Cantidad: <strong>${item.cantidad_pedida} u.</strong></span>
                    <button class="btn-delete-row" onclick="removerItemIndividual(${index})">🗑️</button>
                </div>
            </div>
        `;
    });
}
function removerItemIndividual(index) {
    listaTemporalSucursal.splice(index, 1);
    localStorage.setItem(`pedido_esp_suc_${sucursalActiva}`, JSON.stringify(listaTemporalSucursal));
    dibujarTablaTemporal();
}

function limpiarListaTemporalCompleta() {
    if (confirm("¿Estás seguro de que quieres borrar todos los artículos de esta precarga?")) {
        listaTemporalSucursal = [];
        localStorage.removeItem(`pedido_esp_suc_${sucursalActiva}`);
        dibujarTablaTemporal();
    }
}

// 💾 ENVÍO MAESTRO: Junta la precarga especial con el sistema diario
function guardarYCombinarPedidoEspecial() {
    if (listaTemporalSucursal.length === 0) {
        alert("Operación inválida: No hay productos cargados en tu lista para enviar.");
        return;
    }

    const payload = {
        id_sucursal: sucursalActiva,
        productos: listaTemporalSucursal
    };

    fetch(`${API_URL}?accion=procesar_merge_especial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            alert("¡Excelente! Tus pedidos especiales han sido combinados y guardados con éxito en la base de datos.");
            // Vaciamos el remito temporal local ya que impactó en la base general
            listaTemporalSucursal = [];
            localStorage.removeItem(`pedido_esp_suc_${sucursalActiva}`);
            
            // Redireccionamos al operario a la pantalla principal
            window.location.href = 'index.html';
        } else {
            alert("Hubo un desajuste al guardar: " + res.message);
        }
    })
    .catch(err => console.error("Error en Merge:", err));
}
