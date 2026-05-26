<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

$host = "localhost"; 
$db_name = "deposito_v2"; 
$username = "root"; 
$password = "root"; // ⚠️ Recuerda dejarlo vacío '' si phpMyAdmin no te pide contraseña

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(["error" => "Conexión fallida: " . $e->getMessage()]);
    exit();
}

$accion = isset($_GET['accion']) ? $_GET['accion'] : '';

// --- PROCESAMIENTO DE PETICIONES POST ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $id_pedido = isset($data['id_pedido']) ? intval($data['id_pedido']) : 0;
    
    // Validación de seguridad para ítems ya enviados
    if ($id_pedido > 0 && in_array($accion, ['actualizar_cantidad', 'toggle_preparado', 'toggle_falta', 'solicitar_auditoria'])) {
        $check = $conn->prepare("SELECT enviado FROM pedidos WHERE id = :id");
        $check->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        $check->execute();
        $ped = $check->fetch(PDO::FETCH_ASSOC);
        if ($ped && intval($ped['enviado']) === 1) {
            echo json_encode(["success" => false, "message" => "Acción Denegada: Este ítem ya fue enviado."]);
            exit();
        }
    }

    if ($accion === 'actualizar_cantidad') {
        $checkArmado = $conn->prepare("SELECT preparado FROM pedidos WHERE id = :id");
        $checkArmado->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        $checkArmado->execute();
        $pedArmado = $checkArmado->fetch(PDO::FETCH_ASSOC);
        if ($pedArmado && intval($pedArmado['preparado']) === 1) {
            echo json_encode(["success" => false, "message" => "Acción Denegada: El bulto ya fue armado en depósito."]);
            exit();
        }
        $stmt = $conn->prepare("UPDATE pedidos SET cantidad = :cant WHERE id = :id");
        $stmt->bindParam(':cant', $data['cantidad'], PDO::PARAM_INT);
        $stmt->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        echo json_encode(["success" => $stmt->execute()]);
    }
    elseif ($accion === 'toggle_preparado') {
        $stmt = $conn->prepare("UPDATE pedidos SET preparado = :val WHERE id = :id");
        $stmt->bindParam(':val', $data['valor'], PDO::PARAM_INT);
        $stmt->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        echo json_encode(["success" => $stmt->execute()]);
    }
    elseif ($accion === 'toggle_falta') {
        $stmt = $conn->prepare("UPDATE pedidos SET falta_estante = :val WHERE id = :id");
        $stmt->bindParam(':val', $data['valor'], PDO::PARAM_INT);
        $stmt->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        echo json_encode(["success" => $stmt->execute()]);
    }
    /* ========================================================
       🔍 ACCIÓN AÑADIDA: CONTROL DETALLADO DE AUDITORÍAS
       ======================================================== */
         elseif ($accion === 'solicitar_auditoria') {
        $tipo = isset($data['tipo']) ? $data['tipo'] : 'deposito';
        $valor = isset($data['valor']) ? intval($data['valor']) : 1;
        $columna = ($tipo === 'sucursal') ? 'auditoria_sucursal' : 'auditoria_deposito';
        
        $id_pedido = intval($data['id_pedido']);
        // 🔍 CAPTURA CORREGIDA: Leemos el valor exacto enviado por el formulario
        $conf = isset($data['cantidad_contada']) ? intval($data['cantidad_contada']) : 0;
        $obs = isset($data['comentarios']) ? $data['comentarios'] : null;

        // Traemos la cantidad esperada original guardada en el remito
        $stmtCant = $conn->prepare("SELECT cantidad FROM pedidos WHERE id = :id");
        $stmtCant->execute([':id' => $id_pedido]);
        $filaPedido = $stmtCant->fetch(PDO::FETCH_ASSOC);
        
        $cantEsperada = $filaPedido ? intval($filaPedido['cantidad']) : 0;
        $cantContada = intval($conf);

        // Cálculo matemático real (Ej: 23 - 24 = -1)
        $diferencia = $cantContada - $cantEsperada;

        // Actualizamos la fila guardando el desglose numérico completo
        $sql = "UPDATE pedidos SET 
                $columna = :val, 
                cant_conformes = :conf, 
                auditoria_diferencia = :dif,
                observaciones_auditoria = :obs 
                WHERE id = :id";
                
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':val', $valor, PDO::PARAM_INT);
        $stmt->bindParam(':conf', $cantContada, PDO::PARAM_INT);
        $stmt->bindParam(':dif', $diferencia, PDO::PARAM_INT);
        $stmt->bindParam(':obs', $obs, PDO::PARAM_STR);
        $stmt->bindParam(':id', $id_pedido, PDO::PARAM_INT);
        
        echo json_encode(["success" => $stmt->execute()]);
        exit();
    }


    elseif ($accion === 'guardar_stock_optimo') {
        $id_sucursal = intval($data['id_sucursal']);
        $producto_id = intval($data['producto_id']); 
        $optimo = intval($data['stock_optimo']);
        
        $sql = "INSERT INTO stock_optimo_sucursales (sucursal_id, producto_id, stock_optimo) 
                VALUES (:suc, :prod, :opt) 
                ON DUPLICATE KEY UPDATE stock_optimo = :opt2";
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':suc', $id_sucursal, PDO::PARAM_INT); 
        $stmt->bindParam(':prod', $producto_id, PDO::PARAM_INT); 
        $stmt->bindParam(':opt', $optimo, PDO::PARAM_INT); 
        $stmt->bindParam(':opt2', $optimo, PDO::PARAM_INT);
        echo json_encode(["success" => $stmt->execute()]);
    }
    elseif ($accion === 'despachar_pedido_parcial') {
        $id_sucursal = intval($data['id_sucursal']);
        $id_pedido_sistema = $data['id_pedido_sistema'];
        $stmt = $conn->prepare("UPDATE pedidos SET enviado = 1 WHERE sucursal_id = :suc AND id_pedido_sistema = :remito AND (preparado = 1 OR falta_estante = 1)");
        $stmt->execute([':suc' => $id_sucursal, ':remito' => $id_pedido_sistema]);
        echo json_encode(["success" => true]);
    }
        elseif ($accion === 'despachar_control_sucursal') {
        $id_sucursal = intval($data['id_sucursal']);
        $dni = isset($data['dni']) ? $data['dni'] : '';
        $apellido = isset($data['apellido']) ? $data['apellido'] : '';
        $firma_base64 = isset($data['firma']) ? $data['firma'] : '';

        // Actualizamos todos los pedidos YA PREPARADOS de esa sucursal marcándolos como entregados
        $sql = "UPDATE pedidos SET 
                entregado = 1, 
                recibido_dni = :dni, 
                recibido_apellido = :ape, 
                recibido_firma = :firma 
                WHERE sucursal_id = :suc AND preparado = 1 AND enviado = 0";
                
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':dni', $dni, PDO::PARAM_STR);
        $stmt->bindParam(':ape', $apellido, PDO::PARAM_STR);
        $stmt->bindParam(':firma', $firma_base64, PDO::PARAM_STR);
        $stmt->bindParam(':suc', $id_sucursal, PDO::PARAM_INT);
        
        echo json_encode(["success" => $stmt->execute()]);
        exit();
    }
        elseif ($accion === 'guardar_control_salida') {
        $id_pedido_sistema = isset($data['id_pedido_sistema']) ? $data['id_pedido_sistema'] : '';
        $sucursal_id = intval($data['sucursal_id']);
        $items_marcados = isset($data['items_marcados']) ? $data['items_marcados'] : []; // Array de IDs con valor 1 o 0

        // 1. Reseteamos temporalmente el control de salida para los artículos de este remito específico
        $reset = $conn->prepare("UPDATE pedidos SET control_salida = 0 WHERE id_pedido_sistema = :remito AND sucursal_id = :suc");
        $reset->execute([':remito' => $id_pedido_sistema, ':suc' => $sucursal_id]);

        // 2. Si hay ítems chequeados con el checkbox, los encendemos individualmente en MySQL
        if (!empty($items_marcados)) {
            // Creamos una lista de marcadores (?, ?, ?) según la cantidad de IDs recibidos
            $placeholders = implode(',', array_fill(0, count($items_marcados), '?'));
            $sql = "UPDATE pedidos SET control_salida = 1 WHERE id IN ($placeholders)";
            $stmt = $conn->prepare($sql);
            $stmt->execute($items_marcados);
        }

        echo json_encode(["success" => true]);
        exit();
    }


    elseif ($accion === 'bloquear_remito_operario') {
        $id_sucursal = intval($data['id_sucursal']);
        $id_pedido_sistema = $data['id_pedido_sistema'];
        $operario = $data['operario'];
        
        $check = $conn->prepare("SELECT preparado_por FROM pedidos WHERE sucursal_id = :suc AND id_pedido_sistema = :remito AND preparado_por IS NOT NULL LIMIT 1");
        $check->execute([':suc' => $id_sucursal, ':remito' => $id_pedido_sistema]);
        $yaAsignado = $check->fetchColumn();
        
        if ($yaAsignado && $yaAsignado !== $operario) {
            echo json_encode(["success" => false, "message" => "El operario '$yaAsignado' agarró este pedido primero."]);
            exit();
        }
        $stmt = $conn->prepare("UPDATE pedidos SET preparado_por = :ope WHERE sucursal_id = :suc AND id_pedido_sistema = :remito");
        $stmt->execute([':ope' => $operario, ':suc' => $id_sucursal, ':remito' => $id_pedido_sistema]);
        echo json_encode(["success" => true]);
    }
    elseif ($accion === 'liberar_remito_operario') {
        $id_sucursal = intval($data['id_sucursal']);
        $id_pedido_sistema = $data['id_pedido_sistema'];
        $stmt = $conn->prepare("UPDATE pedidos SET preparado_por = NULL WHERE sucursal_id = :suc AND id_pedido_sistema = :remito");
        $stmt->execute([':suc' => $id_sucursal, ':remito' => $id_pedido_sistema]);
        echo json_encode(["success" => true]);
    }
    exit();
}

// --- PROCESAMIENTO DE PETICIONES GET ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    
    if ($accion === 'obtener_remitos_disponibles') {
        $sucursal = isset($_GET['sucursal']) ? intval($_GET['sucursal']) : 0;
        
        $stmt = $conn->prepare("SELECT id_pedido_sistema, preparado_por 
                                FROM pedidos 
                                WHERE sucursal_id = :suc 
                                GROUP BY id_pedido_sistema, preparado_por");
        $stmt->execute([':suc' => $sucursal]);
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);
        exit();
    }
    
       // 2. Listar ítems de un remito específico (Une datos con la tabla productos)
    if ($accion === 'listar_pedidos') {
        $sucursal = isset($_GET['sucursal']) ? intval($_GET['sucursal']) : 0;
        $id_pedido_sistema = isset($_GET['id_pedido_sistema']) ? $_GET['id_pedido_sistema'] : '';
        
        // 🔍 CORRECCIÓN AQUÍ: Añadimos p.cant_conformes y p.auditoria_diferencia al SELECT
        $stmt = $conn->prepare("SELECT p.id, p.id_pedido_sistema, p.cantidad, p.preparado, p.enviado, p.falta_estante, 
                                       p.preparado_por, p.auditoria_sucursal, p.auditoria_deposito, 
                                       p.cant_conformes, p.auditoria_diferencia,
                                       prod.nombre, prod.marca, prod.codigo_barras
                                FROM pedidos p
                                JOIN productos prod ON p.producto_id = prod.id
                                WHERE p.sucursal_id = :suc AND p.id_pedido_sistema = :remito");
        $stmt->execute([':suc' => $sucursal, ':remito' => $id_pedido_sistema]);
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);
        exit();
    }

}
?>
