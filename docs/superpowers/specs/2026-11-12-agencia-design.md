# Agencia: réplica del Taller para compra y venta de autos (Argentina)

Fecha: 12/11/2026. Decidido por Claude con el «arrancá directo» del dueño; todo lo de
abajo es propuesta corregible, no algo que el dueño haya confirmado punto por punto.

## Qué es y por qué
Un producto hermano del Taller (backend NestJS, ERP Angular, sitio Next) para una agencia
argentina que compra, toma, recibe en consignación y vende autos. Se reaprovecha la base
(multiempresa, usuarios, clientes, cajas y billeteras, gastos, proveedores, agenda, avisos,
auditoría, PDF, Mercado Pago, Mercado Libre, sitio editable) y se reemplaza el corazón:
en vez de la orden de reparación, **la unidad** (un auto, un solo ejemplar) y **la operación**.

## Referencias relevadas (12/11/2026)
MOBU, AcuGestión, SIVEC, deConcesionarias, DeAutos.io, Pilot, DealerCenter, vAuto, Kavak.
De ahí salen: estados de la unidad, toma que entra sola al stock, consignación con precio
piso, pesos y dólares con tipo de cambio por movimiento, papeles con «bloqueantes» que no
dejan vender, gastos imputados a la unidad, reserva con vencimiento, días en stock y margen.
Estética: tabla densa en escritorio, tarjeta con foto en celular, chip de estado y semáforo
de papeles; sitio con tarjeta foto + marca/modelo + año·km·caja + precio y WhatsApp.

## Enfoques
1. **Repos nuevos clonados del Taller (elegido).** Aísla del cliente en producción (GUSMAT),
   deja evolucionar el rubro sin miedo. Costo: los arreglos de la base hay que portarlos a mano.
2. Un «rubro» más dentro del Taller. Un solo código, pero cada cambio de autos arriesga al
   cliente que ya opera y obliga a esconder medio sistema por configuración.
3. Empezar de cero. Se pierde un año de base probada.

## Reglas (primera etapa)
- **Unidad**: número U-0001, dominio, marca, modelo, versión, año, km, color, combustible,
  caja, carrocería, condición (usado / 0 km), origen (compra / toma / consignación),
  estado (ingreso, alistaje, disponible, reservada, vendida, devuelta, baja).
- **Plata en dos monedas**: cada unidad tiene una moneda (la del precio). Un gasto o un pago
  en la otra moneda lleva su tipo de cambio, y se convierte con ese, no con el de hoy.
- **Costo de la unidad** = lo pagado o reconocido al tomarla + gastos de alistaje.
  En consignación el costo de adquisición es cero y existe un **precio piso** para el dueño.
- **Margen** = precio − costo (propia) o precio − piso − gastos (consignación).
- **Papeles**: título, cédula, formulario 08, informe de dominio, verificación policial
  (form. 12), libre deuda (form. 13), VTV, denuncia de venta, contrato de consignación.
  Bloquean la venta de un usado: título, cédula, 08, informe de dominio y verificación;
  en consignación, además, el contrato. Semáforo: rojo si falta un bloqueante, amarillo si
  hay algo en trámite, faltante no bloqueante o vencido, verde si está todo.
  (El libre deuda no bloquea: las fuentes se contradicen. A confirmar con un gestor.)
- **Operación**: reserva con seña y vencimiento; pagos mixtos (efectivo, transferencia,
  cheque, crédito, usado en parte de pago). El usado en parte de pago crea su propia unidad
  con origen «toma». No se cierra la venta con saldo pendiente ni con papeles bloqueantes.
  Anular una reserva devuelve la unidad a disponible y revierte los asientos de billetera.
- **Sitio**: sólo se ven las unidades publicadas y disponibles o reservadas; nunca el costo.

## Tanda de la demo (12/11/2026)
El dueño aclaró que es un producto para vender a muchas agencias. Se sumó lo que una agencia espera ver:
- **Vendedor sin costos**: sólo el dueño recibe costo, piso, total de gastos y margen; se corta en el backend.
- **Interesados**: etapas nuevo, contactado, visita, negociando, ganado, perdido; temperatura; próxima fecha para hablarle; seguimiento con notas. Cruce con el stock por tipo, marca y tope de precio (el tope sólo filtra en la misma moneda). La consulta del sitio entra sola, sin duplicar por teléfono.
- **Recibo de seña y boleto de compraventa** con los datos ya cargados. El boleto es un modelo: lo revisa el abogado o el gestor de cada agencia.
- **Moneda por caja**: un pago sólo entra a una caja de su moneda.

## Tanda 2: vender a muchas (12/11/2026)
- **Un sitio, muchas agencias.** Cada agencia tiene una dirección propia (`perez.dominio`). El sitio lee el subdominio y se lo pasa al backend en la cabecera `x-agencia`; catálogo, perfil y consultas salen de esa agencia. Sin subdominio se comporta como antes.
- **Plan gratis por unidades en stock**, no por órdenes al mes: es lo que crece con el tamaño de la agencia. El tope y el precio son los del Taller y los decide el dueño.
- **Sólo lectura** (abono vencido): no entra stock ni reservas nuevas, pero se puede terminar lo empezado.
- **Primeros pasos** propios de una agencia, en la pantalla de stock.
- Enfoques descartados: un despliegue por agencia (no escala a cientos) y la agencia en la ruta (`/a/perez`, peor para el posicionamiento y para un dominio propio después).

## Fuera de esta etapa
Publicación en Mercado Libre Autos, financiación propia con
cuotas, comisiones por regla, peritaje con mapa de daños, crear el puesto vendedor
(hoy es «mostrador» con el rótulo «Vendedor») y borrar del código los módulos del Taller que sobran
(por ahora sólo se ocultan del menú).

## Entorno
Puertos 3200 (API), 4400 (ERP), 3201 (sitio). Base `agencia_local` en el Postgres local
(5434). Sin remoto de git: no se puede subir nada por accidente.
