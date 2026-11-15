/**
 * Los códigos de error que el ERP sabe traducir.
 *
 * El código es el contrato entre backend y ERP: el `message` que viaja al lado
 * es respaldo para el log y para el caso en que el ERP todavía no mapeó ese
 * código. Agregar un código acá y no mapearlo en el ERP no rompe nada — cae en
 * el default honesto.
 *
 * Se ordenan por módulo. El primero es el único que ya existía en el código
 * antes de esta etapa (wallet-ledger.service.ts), y se conserva TAL CUAL
 * porque el modal de anulación de pagos del ERP ya lo lee.
 */
export const CODIGOS_ERROR = [
  // ─── Caja y billeteras ────────────────────────────────────────────────────
  'DESTINO_REQUERIDO',
  'CAJA_CERRADA',
  'CAJA_YA_ABIERTA',
  'FONDOS_INSUFICIENTES',
  'MONTOS_APERTURA_FALTANTES',
  // PLA-03: el asiento ya tiene su reversa (anular dos veces el mismo pago o
  // gasto). Viaja con 409: la anulación anterior ya devolvió la plata.
  'MOVIMIENTO_YA_REVERTIDO',

  // ─── Órdenes de reparación ────────────────────────────────────────────────
  'ACCION_INVALIDA_PARA_ESTADO',
  'DIAGNOSTICO_REQUERIDO',
  'MONTO_PRESUPUESTO_REQUERIDO',
  'PRESUPUESTO_VENCIDO',
  'COBRO_SIN_BILLETERA',
  'SIN_RESPALDO_DE_COMPRA',

  // El técnico declaró un sku que no existe en el catálogo (T8, resolverEnSitio):
  // se valida ANTES de mover el primer movimiento de stock, no a mitad de camino.
  'REPUESTO_INEXISTENTE',

  // ─── Agenda y rutas ───────────────────────────────────────────────────────
  'CUPO_COMPLETO',
  'DIA_NO_LABORABLE',
  'RUTA_SIN_BILLETERA',
  'PARADAS_SIN_MARCAR',
  // ORD-05: sacar de la ruta una parada ya marcada o cobrada borraba el
  // efectivo de la rendición.
  'PARADA_YA_MARCADA',
  // ORD-04/ORD-09: cumplir o fallar un turno que ya no está vivo (cancelado,
  // ya cumplido), o cumplir a mano uno que se cierra desde la ruta o la OS.
  'TURNO_NO_VIGENTE',
  // Spec 2026-10-21 §12: el cliente pide turno de retiro desde el link y ya
  // tiene uno vigente (solicitado o confirmado). Cambiarlo es por WhatsApp.
  'TURNO_YA_PEDIDO',
  // Lo que el chofer declara cobrar en la puerta no es lo que el backend va a
  // asentar. Viaja con `{ a_cobrar, declarado, costo_visitas }` para que el
  // ERP muestre el monto correcto y recargue la ruta.
  'COBRO_NO_COINCIDE',
  // D2: la billetera del medio (transferencia o MP de la empresa, efectivo de
  // la ruta) no está configurada o está desactivada. Viaja con
  // `{ medio, motivo: 'sin_configurar' | 'inactiva', billetera? }`. Se revisa
  // antes de tocar el turno; nunca se cae en la billetera de la ruta.
  'MEDIO_SIN_BILLETERA',
  // D2: la billetera de MP o la de transferencias no puede ser la caja de una
  // ruta, se asigne primero una u otra. Viaja con
  // `{ reservada_para: 'mercado_pago' | 'transferencia', billetera, ruta_abierta?: { id, fecha } }`.
  'RUTA_BILLETERA_RESERVADA',
  // #41: la billetera de cobros de MP o la de transferencias de la empresa no
  // se desactiva ni se borra. Viaja con
  // `{ uso: 'mercado_pago' | 'transferencia', billetera }` para que el ERP
  // lleve a la pantalla donde se cambia cada una.
  'BILLETERA_EN_USO',

  // ─── Mensajes al cliente ──────────────────────────────────────────────────
  // Los del sistema no se borran ni cambian de clave/contexto: si se pudieran,
  // el aviso automático que los busca por clave se quedaría sin texto.
  'PLANTILLA_DEL_SISTEMA',
  'PLANTILLA_NO_ENCONTRADA',

  // ─── Pañol y compras (C) ──────────────────────────────────────────────────
  // STOCK_NO_EDITABLE existe porque el whitelist global rechazaría el request
  // entero con un mensaje genérico; con código propio el ERP ofrece el botón
  // "Ajustar stock" en vez de "revisá los datos".
  'STOCK_NO_EDITABLE',
  'MOTIVO_REQUERIDO',
  'REPUESTO_EN_USO',
  'REPUESTO_DUPLICADO',
  'OC_NO_EDITABLE',
  'OC_SIN_FALTANTE',
  'DEVOLUCION_EXCEDE_RECIBIDO',
  'EXCESO_NO_CONFIRMADO',

  // El neto de la factura no coincide con los renglones recibidos (en pesos).
  // Como el pago contra entrega sale de la factura, se frena salvo que el
  // operario confirme la diferencia con `factura_difiere`; `extra` trae neto,
  // renglones, moneda y tipo_cambio para que el ERP arme el aviso.
  'FACTURA_DIFIERE',

  // El pañol no puede entregar lo que no tiene: una salida que dejaría el
  // stock en negativo se rechaza y se corrige con un ajuste con motivo, que
  // además deja escrito por qué había una diferencia (Ruling 5 de C3).
  'STOCK_INSUFICIENTE',

  // Rediagnosticar no puede sacar de la orden un repuesto que ya está en el
  // pañol o que ya se usó: primero hay que devolverlo (Ruling 1 de C3).
  'REPUESTO_YA_INGRESADO',

  // ─── Identificación y catálogo (C5) ───────────────────────────────────────
  // CODIGO_EN_USO y SINONIMO_EN_USO viajan con 409 (ConflictoDeNegocio): no es
  // un dato mal cargado, es un dato que ya está en otro lado, y el ERP tiene
  // que poder ofrecer "ir a ese repuesto" en vez de "revisá los datos".
  'CODIGO_EN_USO',        // el código, nº de parte o alias ya lo tiene otro repuesto
  'SINONIMO_EN_USO',      // el término ya pertenece a otro grupo
  'FUSION_INVALIDA',      // fusionar con uno mismo, con un inexistente o con uno ya fusionado
  'REPUESTO_FUSIONADO',   // se operó sobre un perdedor de fusión; el ganador viaja en extra

  // ─── Sesión ───────────────────────────────────────────────────────────────
  // Separados de SIN_PERMISO a propósito: "tu sesión venció" y "tu puesto no
  // puede hacer esto" se resuelven de maneras distintas (una se arregla
  // volviendo a entrar, la otra pidiéndole el cambio de rol a un encargado).
  'SESION_VENCIDA',
  'CREDENCIALES_INVALIDAS',
  'USUARIO_DADO_DE_BAJA', // CLI-04: 401 del login o de cualquier request de un empleado dado de baja
  'CLAVE_ACTUAL_INCORRECTA', // SEG-54: el cambio de clave con la actual mal
  'CLAVE_REPETIDA',          // SEG-54: la nueva es igual a la actual
  'DEBE_CAMBIAR_CLAVE',      // SEG-54: 403 de cualquier request con la clave provisoria del reseteo sin cambiar
  'EMAIL_EN_USO',         // CLI-24: el correo ya es de otro usuario (de este u otro taller)
  'CLIENTE_POSIBLE_DUPLICADO', // CLI-03: 409 del alta de cliente, con `candidatos`; se reenvía con `forzar: true`
  'DEMASIADOS_INTENTOS',  // 429 del límite de pedidos (throttler); el portal dice «esperá un minuto»
  'PAGO_SIN_ASENTAR',     // PLA-19: devolver una venta con un pago de MP sin asentar; trae `pago_sin_aplicar_id`

  // ─── Validación de formularios ────────────────────────────────────────────
  'DATOS_INVALIDOS',

  // ─── Desguace (T9) ────────────────────────────────────────────────────────
  'DESGUACE_ORIGEN_INVALIDO',
  'DESGUACE_CERRADO',
  'DESGUACE_SIN_PIEZAS',
  'PIEZA_YA_USADA',

  // ─── Tienda de repuestos (T1) ─────────────────────────────────────────────
  // Publicar exige precio, categoría y foto: el ERP lee `faltan` del payload y
  // marca en la ficha cuál de los tres falta, en vez de un 400 sin destino.
  'PUBLICACION_INCOMPLETA',

  // ─── Carrito de la tienda (T2) ─────────────────────────────────────────────
  // El repuesto ya no está publicado (o se dio de baja) cuando el cliente
  // intenta agregarlo o cambiarle la cantidad.
  'NO_DISPONIBLE',

  // ─── Checkout y ventas de la tienda (T2) ───────────────────────────────────
  // El checkout revalida todo del lado del servidor (spec T2 §6): entre que el
  // cliente vio el carrito y apretó comprar, el catálogo pudo cambiar.
  'PRECIO_CAMBIO',              // el precio actual ya no es el que el cliente vio en el carrito
  'SIN_DISPONIBLE',             // ya no hay stock para completar la cantidad pedida
  'VENTA_VENCIDA',              // la reserva de la venta venció sin pagarse
  'ACCION_INVALIDA_PARA_VENTA', // la transición de estado que se pidió no es válida para la venta
  // La venta ya se guardó (commit hecho) pero Mercado Pago no devolvió una
  // preferencia de pago: la reserva sigue viva y el cliente reintenta el pago
  // desde su página de seguimiento (número y token viajan en `extra`).
  'PAGO_MP_NO_DISPONIBLE',
  // El botón de arrepentimiento no pudo avisarle al taller (correo sin
  // configurar o caído): 503, el comprador reintenta o escribe por WhatsApp.
  'ARREPENTIMIENTO_NO_DISPONIBLE',
  // El cliente volvió a su página de seguimiento a pagar (rediseño §8.2) pero
  // la venta ya no admite pago online: cambió de estado, paga en el local, o
  // la reserva venció.
  'VENTA_NO_PAGABLE',
  // El taller corre Mercado Pago en modo demo (`SIMULADO`) o todavía no cargó
  // el token: no hay preferencia real que crear.
  'TALLER_SIMULADO',

  // ─── Segunda vida (09/11/2026) ────────────────────────────────────────────
  'ALTA_SEGUNDA_VIDA_INVALIDA',
  'ORDEN_NO_CEDIBLE',
  'ORDEN_YA_CEDIDA',
  'SEGUNDA_VIDA_CERRADO',

  // ─── Herramientas e instrumental (11/11/2026) ─────────────────────────────
  'HERRAMIENTA_NO_DISPONIBLE', // prestada, en service o de baja para esa acción
  'HERRAMIENTA_VENCIDA',       // el control (service o calibración) venció: no se presta
  'TECNICO_INVALIDO',          // se presta sólo a técnicos activos

  // ─── Agencia: unidades y operaciones (12/11/2026) ──────────────────────────
  'ALTA_UNIDAD_INVALIDA',
  'DOMINIO_EN_STOCK',          // ese dominio ya está en stock en otra unidad
  'UNIDAD_CERRADA',            // vendida, devuelta o de baja: no se toca
  'UNIDAD_RESERVADA',          // el precio acordado vive en la operación
  'ESTADO_UNIDAD_INVALIDO',
  'UNIDAD_NO_PUBLICABLE',
  'UNIDAD_NO_RESERVABLE',
  'IMPORTE_INVALIDO',          // monto en cero, o en otra moneda sin tipo de cambio
  'OPERACION_CERRADA',         // vendida o anulada: no admite pagos ni cambios
  'PAGO_INVALIDO',
  'SALDO_PENDIENTE',           // no se cierra una venta que no está cobrada
  'PAPELES_BLOQUEANTES',       // faltan papeles que frenan la transferencia
  'TOMA_NO_REVERSIBLE',        // el usado que se tomó ya se vendió o se reservó

  // ─── Equipos vendidos (09/11/2026) ─────────────────────────────────────────
  'VENTA_SIN_ENTREGAR',
  'SERIE_VACIA',
  'UNIDAD_DE_OTRA_VENTA',
  'UNIDADES_DE_MAS',
  'SERIE_REPETIDA',
  'SERIE_YA_VENDIDA',

  // ─── Venta de mostrador (spec 2026-10-02 §8) ──────────────────────────────
  'VENTA_SIN_RENGLONES',      // una venta de mostrador sin renglones
  'VENTA_SIN_COBRO',          // el mostrador no vende a cuenta: cobro > 0 obligatorio
  'DESCUENTO_EXCEDIDO',       // el precio baja de la lista más que el tope del rol (extra: maximo)
  'COBRO_EXCEDE_SALDO',       // lo que se quiere cobrar pasa el saldo (extra: saldo)
  'DEVOLUCION_EXCEDE',        // más unidades que las devolvibles, o más plata que lo cobrado (extra: queda | maximo)
  'DEVOLUCION_SIN_BILLETERA', // un reintegro > 0 sin billetera de salida
  'PAGO_YA_RESUELTO',         // el pago de MP sin aplicar ya se resolvió
  // ─── Tienda: capa comercial (spec 2026-10-07 tienda §8) ──────────────────
  'ENVIO_SIN_COBERTURA',         // checkout/cotizar con envío a un CP sin zona (extra: cp)
  'CP_INVALIDO',                 // envío con un CP que no se puede normalizar
  'TRANSFERENCIA_NO_DISPONIBLE', // transferencia elegida con la opción apagada o incompleta
  'COMPROBANTE_NO_ADMITIDO',     // la venta no es una transferencia pendiente, o venció
  'COMPROBANTE_FORMATO',         // los bytes no son JPG, PNG, WebP ni PDF
  'COMPROBANTE_PESO',            // el comprobante pasa los 10 MB (extra: tope)
  'TRANSFERENCIA_INCOMPLETA',    // habilitar sin CBU/alias, titular o caja (extra: faltan)
  'ZONA_RANGO_INVALIDO',         // rangos fuera de 1000–9999 o invertidos
  // ─── Tienda: banners de la portada (spec 2026-10-08 tienda portada §4) ────
  'BANNER_LINK_INVALIDO',        // el link no es vacío, una ruta interna (/...) ni una dirección https://
  'BANNER_IMAGEN_FORMATO',       // los bytes no son JPG, PNG ni WebP (o la imagen está rota)
  'BANNER_IMAGEN_PESO',          // la imagen pasa los 5 MB (extra: tope)
  'BANNER_MAXIMO',               // el taller ya tiene 8 banners (extra: tope)
  'BANNER_PRODUCTO_INVALIDO',    // el repuesto del banner no es un publicado de esta empresa
  'BANNER_VIDEO_SOLO_ARMADO',    // un banner de imagen terminada no lleva video
  'BANNER_TITULO_REQUERIDO',     // un banner armado sin título
  // ─── Pedidos web de servicio (spec 2026-10-09) ────────────────────────────
  'SOLICITUD_YA_ATENDIDA',       // aceptar o rechazar un pedido que ya no está `nuevo` (409, extra: estado)
  'SOLICITUD_FOTO_FORMATO',      // una foto cuyos bytes no son JPG, PNG, WebP ni HEIC, o que no se puede leer
  'SOLICITUD_FOTO_PESO',         // una foto pasa los 10 MB (extra: tope)
  'SOLICITUD_FOTOS_MAXIMO',      // más de 4 fotos (extra: tope)
  'SOLICITUD_FALTA_DIRECCION',   // aceptar como visita/retiro sin dirección y ciudad
  'RECLAMO_YA_ENVIADO',          // spec 2026-10-21 §13: ya hay un reclamo de garantía de esa orden sin resolver
  'GARANTIA_NO_VIGENTE',         // reclamar una orden sin garantía o con la garantía vencida
  'SALDO_NO_PAGABLE_ONLINE',     // spec 2026-10-21 §14: la orden no está lista, es B2B, no hay saldo, ya se pagó o el taller no tiene MP (extra: motivo)
  'ORDEN_NO_ATENDIBLE',          // spec 2026-10-21 §15: marcar atendida una opinión que no es baja o que ya se atendió


  // ─── Mercado Libre (M1) ────────────────────────────────────────────────────
  'ML_NO_CONECTADO',       // el taller no conectó su cuenta (ni modo demo)
  'ML_REAUTORIZAR',        // el refresh falló: token revocado, hay que volver a conectar
  'TALLER_YA_EXISTE',      // alta pública con el nombre de otro taller
  'CORREO_YA_REGISTRADO',  // alta pública con el correo de una cuenta confirmada
  'CUENTA_SIN_CONFIRMAR',  // login de una cuenta que no confirmó el correo
  'CONFIRMACION_INVALIDA', // link de confirmación vencido o adulterado
  'RECUPERACION_INVALIDA', // link para cambiar la clave vencido, usado o adulterado
  'MP_NO_DISPONIBLE',      // la plataforma sin MP_CLIENT_*, o MP no responde al conectar
  'MP_OAUTH_INVALIDO',     // conexión OAuth de MP inválida, vencida, repetida o de otra sesión
  'ML_NO_DISPONIBLE',      // ML no responde / 5xx / timeout, o GUSMAT sin ML_CLIENT_*
  'ML_CATEGORIA_INVALIDA', // la categoría elegida no es hoja o no permite publicar
  'ML_NO_LISTO',           // publicar sin cumplir el validador de M1 (extra: faltan, motivos)
  'ML_YA_PUBLICADA',       // ya hay una publicación viva para ese repuesto
  'ML_PUBLICACION_CERRADA',// pausar/reactivar/actualizar una cerrada: en ML no se reabre
  'ML_RECHAZO',            // ML rechazó un alta o cambio; acompaña a ultimo_error, no viaja por HTTP en M2

  // ─── Correos a clientes (16/09/2026) ──────────────────────────────────────
  'CORREO_NO_CONFIGURADO', // el taller no cargó MAIL_HOST/MAIL_USER/MAIL_PASS en el servidor
  'CORREO_FALLIDO',        // el servidor SMTP rechazó el envío (extra: detalle); quedó registrado como fallido

  // ─── Correos con adjuntos (spec 2026-10-07 §7) ────────────────────────────
  'ARCHIVO_NO_PDF',          // lo subido no es un PDF: extensión, mimetype o bytes que no empiezan con %PDF-
  'DOCUMENTO_NO_DISPONIBLE', // ese documento no corresponde al estado de la orden (extra: tipo)
  'ADJUNTO_INVALIDO',        // una foto o un PDF no es de la orden, o no se pudo bajar del almacén (extra: nombre)
  'ADJUNTOS_EXCEDIDOS',      // más de 20 MB o de 15 archivos (extra: total, tope, motivo 'peso' | 'cantidad')

  // ─── Pericia técnica (Legales, 16/10/2026) ────────────────────────────────
  'PERICIA_INCOMPLETA',     // finalizar sin objeto, operaciones, causa o conclusión (extra: faltan)
  'PERICIA_NO_FINALIZADA',  // 409: el PDF de una pericia en borrador (o que todavía no existe)
  'FOTO_AJENA',             // la pericia elige una foto que no es de esa orden (extra: url)

  // ─── Opiniones de Google (S1c-b) ──────────────────────────────────────────
  // La fuente rechazó la consulta: Place ID inválido, clave sin permiso o
  // Google caído. El ERP lo muestra tal cual al lado del botón "Probar".
  'OPINIONES_NO_DISPONIBLES',
  
  // ─── Abono (spec 2026-10-28 §7)
  'TALLER_SOLO_LECTURA',
  'TOPE_PLAN_GRATIS',
  'ABONO_NO_DISPONIBLE',

  // ─── Genéricos del filtro ─────────────────────────────────────────────────
  'NO_ENCONTRADO',
  'SIN_PERMISO',
  'CONFLICTO',
  'SOLICITUD_RECHAZADA',
  'ARCHIVO_DEMASIADO_GRANDE', // 413: el archivo subido supera el límite del endpoint
  'ERROR_INTERNO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];
