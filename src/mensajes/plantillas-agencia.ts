import { CanalPlantilla, ContextoPlantilla } from './plantilla.util';

/**
 * Los mensajes con los que arranca cada agencia. Tienen `clave`: son los del
 * sistema, se pueden reescribir pero no borrar, y «Volver al original» los deja
 * como están acá. Cada variable opcional va en su propia línea, que desaparece
 * sola cuando no hay dato.
 */
export interface PlantillaDeFabrica {
  clave: string;
  nombre: string;
  contexto: ContextoPlantilla;
  canal: CanalPlantilla;
  asunto?: string;
  texto: string;
}

export const PLANTILLAS_DE_FABRICA: PlantillaDeFabrica[] = [
  // ─── A quien consultó ───────────────────────────────────────────────────
  { clave: 'int_respuesta', nombre: 'Respuesta a su consulta', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, te escribo de {agencia} por tu consulta.

El {auto} sigue disponible.
Precio: {precio}
Acá lo podés ver con fotos y todos los datos: {link_auto}

¿Querés venir a verlo? Decime qué día te queda bien.` },
  { clave: 'int_visita', nombre: 'Coordinar la visita', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, soy {vendedor} de {agencia}.

Te espero para ver el {auto}.
Estamos en {direccion}.

Si se te complica el horario avisame y lo cambiamos.` },
  { clave: 'int_cotizacion', nombre: 'Cotización de su usado', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, ya miramos tu {su_auto}.

Te lo tomamos en {cotizacion}.
El valor es con el auto visto y los papeles al día.

Lo podés entregar en parte de pago por el {auto}.
¿Cuándo podés traerlo para revisarlo?` },
  { clave: 'int_ingreso', nombre: 'Entró un auto como el que buscaba', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, te escribo de {agencia}.

Entró un auto como el que estabas buscando: {auto}.
Precio: {precio}
Miralo acá: {link_auto}

Si te interesa, te lo muestro cuando quieras.` },
  { clave: 'int_seguimiento', nombre: 'Volver a contactar', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, soy {vendedor} de {agencia}.

Quería saber si seguís buscando auto.
Todo el stock actualizado está acá: {link_sitio}

Cualquier cosa escribime.` },
  { clave: 'int_bajo_precio', nombre: 'Bajó de precio el auto que buscaba', contexto: 'interesado', canal: 'whatsapp', texto:
`Hola {cliente}, te escribo de {agencia}.

Bajamos el precio del {auto}.
Nuevo precio: {precio}
Miralo acá: {link_auto}

Si querés aprovecharlo, avisame y coordinamos para que lo veas.` },
  { clave: 'int_respuesta_mail', nombre: 'Respuesta a su consulta', contexto: 'interesado', canal: 'email', asunto: 'Tu consulta en {agencia}', texto:
`Hola {cliente}:

Gracias por escribirnos. El {auto} sigue disponible.
Precio: {precio}
Publicación con fotos y todos los datos: {link_auto}

Si querés venir a verlo, respondé este correo o llamanos al {telefono}.
Estamos en {direccion}.

{vendedor}
{agencia}` },

  // ─── A quien reservó o compró ───────────────────────────────────────────
  { clave: 'op_reserva', nombre: 'Reserva confirmada', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, te confirmo la reserva del {auto} ({operacion}).

Recibimos: {pagado}
Saldo: {saldo}
Te lo guardamos hasta el {vence}.

Cualquier duda escribime. {vendedor}, {agencia}.` },
  { clave: 'op_por_vencer', nombre: 'La reserva está por vencer', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, te escribo de {agencia} por la reserva del {auto}.

Lo tenemos guardado hasta el {vence}.
Saldo: {saldo}

¿Coordinamos el pago y la entrega?` },
  { clave: 'op_saldo', nombre: 'Recordar el saldo', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, te paso cómo está la operación {operacion} del {auto}.

Precio: {precio}
Ya pagaste: {pagado}
Saldo: {saldo}

Avisame cómo lo querés completar.` },
  { clave: 'op_entrega', nombre: 'Coordinar la entrega', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, tu {auto} ya está listo para entregar.

Te esperamos en {direccion}.
Traé tu DNI. Decime qué día y a qué hora te queda bien.` },
  { clave: 'op_gracias', nombre: 'Gracias por la compra', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, gracias por confiar en {agencia}.

Que disfrutes el {auto}. Si necesitás algo, acá estamos.
Y si conocés a alguien que esté buscando auto, este es nuestro stock: {link_sitio}` },
  { clave: 'op_transferencia', nombre: 'Papeles y transferencia listos', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, te escribo de {agencia} por la documentación del {auto} ({operacion}).

Ya están listos los papeles de la transferencia para retirar.
Estamos en {direccion}. Avisame qué día pasás.` },
  { clave: 'op_resena', nombre: 'Pedir reseña y recomendación', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, ¿cómo venís disfrutando el {auto}?

Si tuviste una buena experiencia en {agencia}, nos ayuda muchísimo tu recomendación. Y si algún conocido busca auto, acá está nuestro stock actualizado: {link_sitio}

¡Gracias de parte de todo el equipo!` },
  { clave: 'op_postventa_service', nombre: 'Seguimiento postventa y renovación', contexto: 'operacion', canal: 'whatsapp', texto:
`Hola {cliente}, soy {vendedor} de {agencia}.

Paso a saludarte y saber cómo anda el {auto}. Acordate de revisar el próximo service y vencimiento de VTV.
Cuando tengas ganas de cambiarlo por un modelo más nuevo, te lo tomamos en parte de pago: {link_sitio}` },
  { clave: 'op_reserva_mail', nombre: 'Reserva confirmada', contexto: 'operacion', canal: 'email', asunto: 'Tu reserva en {agencia}: {auto}', texto:
`Hola {cliente}:

Te confirmamos la reserva del {auto}.
Número de operación: {operacion}
Precio: {precio}
Recibimos: {pagado}
Saldo: {saldo}
Te lo guardamos hasta el {vence}.

Para coordinar el pago del saldo y la entrega, respondé este correo o llamanos al {telefono}.
Estamos en {direccion}.

{vendedor}
{agencia}` },
];
