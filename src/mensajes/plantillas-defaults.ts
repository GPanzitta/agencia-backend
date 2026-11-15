/**
 * SOPORTE DE MIGRACIONES. El módulo de mensajes ya no existe; este archivo
 * queda sólo porque la migración 1788100000000-MensajesPlantillas importa
 * `plantillasPorDefecto` y el historial de migraciones no se toca. Nada del
 * código de la aplicación lo usa.
 */
type ContextoPlantilla = 'orden' | 'turno' | 'cliente';
type CanalPlantilla = 'whatsapp' | 'email';
type TipoDocumento = 'presupuesto' | 'remito_recepcion' | 'acta_entrega' | 'certificado_garantia';

export const CLAVES_SISTEMA = [
  // Avisos que dispara una persona desde la OS.
  'os_listo',
  'os_rechazada',
  'os_presupuesto',
  'os_seguimiento',
  // Avisos que detecta y redacta la revisión diaria (bandeja de Avisos).
  'presupuesto_por_vencer',
  'presupuesto_vencido',
  'sin_retirar',
  'sin_retirar_rechazada',
  'nps',
  // Agenda.
  'turno_confirmado_taller',
  'turno_confirmado_domicilio',
  'turno_manana_taller',
  'turno_manana_domicilio',
  'turno_en_camino',
  'turno_fallido',
  // Correos (16/09/2026): mismas variables, con asunto.
  'email_listo',
  'email_presupuesto',
  'email_seguimiento',
] as const;

export type ClaveSistema = (typeof CLAVES_SISTEMA)[number];

export interface PlantillaPorDefecto {
  clave: ClaveSistema;
  nombre: string;
  texto: string;
  contexto: ContextoPlantilla;
  /** Cuándo lo manda el sistema. Se muestra bajo el nombre en Configuración → Mensajes. */
  cuando: string;
  /** Por defecto WhatsApp; las de correo llevan asunto. */
  canal?: CanalPlantilla;
  asunto?: string;
  /** Correos de orden: los documentos en PDF que el modal tilda solos (spec 2026-10-07 §3.3). */
  adjuntos_sugeridos?: TipoDocumento[];
}

const L = (...lineas: string[]): string => lineas.join('\n');

/** La cabecera común de casi todos los avisos de orden. */
const CABECERA = 'Hola {cliente}! Te escribimos por tu {equipo} (orden {orden}).';

export function plantillasPorDefecto(): PlantillaPorDefecto[] {
  return [
    // ─── Correos ───────────────────────────────────────────────────────────
    {
      clave: 'email_listo',
      nombre: 'Correo: equipo listo para retirar',
      contexto: 'orden',
      canal: 'email',
      cuando: 'Botón "Correo" en la OS o en la ficha del cliente, con la orden en Listo para retirar.',
      asunto: 'Tu {equipo} está listo para retirar · Orden {orden}',
      texto: L(
        'Hola {cliente}!',
        '',
        'Tu {equipo} (orden {orden}) ya está reparado y listo para retirar en {taller}.',
        'Al retirarlo se abona el saldo de {saldo}.',
        '',
        'Podés ver el detalle de la reparación acá: {link_portal}',
        '',
        'Gracias por confiar en nosotros.',
        '{taller}',
      ),
    },
    {
      clave: 'email_presupuesto',
      nombre: 'Correo: presupuesto para aprobar',
      contexto: 'orden',
      canal: 'email',
      cuando: 'Botón "Correo" con la orden presupuestada.',
      asunto: 'Presupuesto de tu {equipo} · Orden {orden}',
      adjuntos_sugeridos: ['presupuesto'],
      texto: L(
        'Hola {cliente}!',
        '',
        'Ya revisamos tu {equipo} (orden {orden}).',
        'El presupuesto de la reparación es de {monto}.',
        'Podés ver el detalle y aprobarlo acá: {link_portal}',
        '(válido hasta el {vence})',
        '',
        'Cualquier duda, respondé este correo.',
        '{taller}',
      ),
    },
    {
      clave: 'email_seguimiento',
      nombre: 'Correo: seguimiento al cliente',
      contexto: 'cliente',
      canal: 'email',
      cuando: 'Botón "Correo" en la ficha del cliente (sin orden): reactivación, novedades, consulta.',
      asunto: '¿Cómo anda tu equipo? · {taller}',
      texto: L(
        'Hola {cliente}!',
        '',
        'Te escribimos desde {taller} para saber cómo anda el equipo que te reparamos y recordarte que seguimos a tu disposición.',
        '',
        'Si necesitás una revisión o tenés otro equipo para arreglar, respondé este correo y lo coordinamos.',
        '',
        'Saludos,',
        '{taller}',
      ),
    },
    {
      clave: 'os_listo',
      nombre: 'Orden lista para retirar',
      contexto: 'orden',
      cuando: 'Botón "Avisar por WhatsApp" con la orden en Listo para retirar.',
      texto: L(
        CABECERA,
        '',
        '¡Ya está listo para retirar! 🎉',
        'Al retirarlo se abona el saldo de {saldo}.',
        'Acordate de traer el comprobante de la orden.',
      ),
    },
    {
      clave: 'os_rechazada',
      nombre: 'Presupuesto rechazado: pasar a retirar',
      contexto: 'orden',
      cuando: 'Botón "Avisar por WhatsApp" con la orden rechazada.',
      texto: L(
        CABECERA,
        '',
        'Como quedó sin aprobar, el equipo te espera para que lo retires cuando puedas.',
        'Acordate de traer el comprobante de la orden.',
      ),
    },
    {
      clave: 'os_presupuesto',
      nombre: 'Presupuesto para aprobar',
      contexto: 'orden',
      cuando: 'Al emitir el presupuesto, y desde el botón con la orden presupuestada.',
      texto: L(
        CABECERA,
        '',
        'El presupuesto de la reparación es de {monto}.',
        'Podés ver el detalle y aprobarlo acá: {link_portal}',
        '(válido hasta el {vence})',
      ),
    },
    {
      clave: 'os_seguimiento',
      nombre: 'Seguimiento de la reparación',
      contexto: 'orden',
      cuando: 'Botón "Avisar por WhatsApp" en cualquier otro estado.',
      texto: L(
        CABECERA,
        '',
        'Podés seguir el estado de la reparación acá: {link_portal}',
      ),
    },
    {
      clave: 'presupuesto_por_vencer',
      nombre: 'Presupuesto por vencer',
      contexto: 'orden',
      cuando: 'Revisión diaria: faltan menos de 48 h para que venza y el cliente no respondió.',
      texto: L(
        CABECERA,
        '',
        'Te recordamos que el presupuesto de {monto} vence el {vence}.',
        'Si querés que avancemos, podés aprobarlo acá: {link_portal}',
        'Cualquier duda, respondenos este mensaje.',
      ),
    },
    {
      clave: 'presupuesto_vencido',
      nombre: 'Presupuesto vencido',
      contexto: 'orden',
      cuando: 'Revisión diaria: el presupuesto venció sin respuesta.',
      texto: L(
        CABECERA,
        '',
        'El presupuesto que te pasamos venció, así que los precios pueden haber cambiado.',
        'Si todavía te interesa la reparación, avisanos y lo recotizamos sin cargo.',
        'También podés ver el estado acá: {link_portal}',
      ),
    },
    {
      clave: 'sin_retirar',
      nombre: 'Equipo reparado sin retirar',
      contexto: 'orden',
      cuando: 'Revisión diaria: hace más de 7 días que está listo y nadie lo pasó a buscar.',
      texto: L(
        CABECERA,
        '',
        '¡El equipo está reparado y listo para retirar!',
        'Al retirarlo se abona el saldo de {saldo}.',
        'Acordate de traer el comprobante de la orden. ¡Te esperamos!',
      ),
    },
    {
      clave: 'sin_retirar_rechazada',
      nombre: 'Equipo sin reparar sin retirar',
      contexto: 'orden',
      cuando: 'Revisión diaria: mismo caso, pero el presupuesto se rechazó y el equipo sigue acá.',
      texto: L(
        CABECERA,
        '',
        'El equipo sigue acá esperando que lo retires (quedó sin reparar).',
        'Acordate de traer el comprobante de la orden. ¡Te esperamos!',
      ),
    },
    {
      clave: 'nps',
      nombre: 'Encuesta de satisfacción',
      contexto: 'orden',
      cuando: 'Revisión diaria: 48 h después de entregar una orden reparada.',
      texto: L(
        'Hola {cliente}! Gracias por confiarnos tu {equipo}.',
        '',
        '¿Nos contás cómo salió todo? Es un minuto y nos ayuda muchísimo a mejorar:',
        '{link_portal}',
      ),
    },
    {
      clave: 'turno_confirmado_taller',
      nombre: 'Turno confirmado (en el taller)',
      contexto: 'turno',
      cuando: 'Al confirmar un turno de recepción o retiro en el local.',
      texto: 'Hola {cliente}! Te confirmamos el turno en el taller el {fecha} {franja}. Cualquier cambio, avisanos por acá.',
    },
    {
      clave: 'turno_confirmado_domicilio',
      nombre: 'Visita confirmada (a domicilio)',
      contexto: 'turno',
      cuando: 'Al confirmar un retiro, una entrega o una visita técnica a domicilio.',
      texto: L(
        'Hola {cliente}! Te confirmamos la visita el {fecha} {franja}.',
        'Dirección: {direccion}',
        'Cualquier cambio, avisanos por acá.',
      ),
    },
    {
      clave: 'turno_manana_taller',
      nombre: 'Recordatorio de turno (en el taller)',
      contexto: 'turno',
      cuando: 'La víspera de un turno confirmado en el local.',
      texto: 'Hola {cliente}! Te recordamos que mañana {franja} te esperamos en el taller.',
    },
    {
      clave: 'turno_manana_domicilio',
      nombre: 'Recordatorio de visita (a domicilio)',
      contexto: 'turno',
      cuando: 'La víspera de una visita confirmada a domicilio.',
      texto: L(
        'Hola {cliente}! Te recordamos que mañana {franja} pasamos por tu domicilio.',
        'Dirección: {direccion}',
        '¿Está todo bien con ese horario?',
      ),
    },
    {
      clave: 'turno_en_camino',
      nombre: 'El chofer salió',
      contexto: 'turno',
      cuando: 'Al arrancar la ruta del día, para cada parada.',
      texto: 'Hola {cliente}! Ya salimos para tu domicilio. Llegamos dentro del horario acordado.',
    },
    {
      clave: 'turno_fallido',
      nombre: 'Visita fallida',
      contexto: 'turno',
      cuando: 'Al marcar una visita como fallida: hay que reprogramar.',
      texto: L(
        'Hola {cliente}! Pasamos el {fecha} {franja} y no te encontramos.',
        'Dirección: {direccion}',
        '¿Qué día te queda cómodo para reprogramar?',
      ),
    },
  ];
}
