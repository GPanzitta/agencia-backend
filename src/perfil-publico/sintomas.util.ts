/** Zonas del despiece que una causa puede marcar (heredado del catálogo de piezas). */
export const TIPOS_PIEZA = [
  'amortiguador', 'bisagra', 'blocapuerta', 'bomba-desagote', 'botonera', 'burlete', 'capacitor-alta', 'compresor',
  'control-remoto', 'correa', 'diodo-alta', 'electrovalvula', 'estante', 'filtro', 'flex', 'forzador',
  'fuente', 'fusible', 'lampara', 'magnetron', 'manguera', 'manija', 'membrana', 'mica',
  'microswitch', 'modulo-wifi', 'motor', 'motor-plato', 'motor-ventilador', 'pantalla', 'parlante', 'perilla',
  'pie', 'placa-main', 'plaqueta', 'plato', 'presostato', 'receptor-ir', 'rele', 'resistencia',
  'rodamiento', 't-con', 'termostato', 'timer', 'tira-led', 'transformador-alta',
] as const;
export type TipoPieza = (typeof TIPOS_PIEZA)[number];

/**
 * Síntoma → causas posibles, por equipo (spec 2026-10-11 síntomas). Lo carga
 * el taller en ERP › Sitio web y lo muestra la consola de la portada. Un mismo
 * síntoma puede venir de piezas distintas: por eso cada uno tiene varias
 * causas, y cada causa los repuestos publicados que el taller eligió.
 *
 * Se guarda en `perfil_publico.sintomas`. `null` = nunca se tocó: se ve la
 * lista de fábrica (la que tenía escrita el portal hasta el 11/10/2026).
 */
export const EQUIPOS_SINTOMA = ['lavarropas', 'heladera', 'microondas', 'televisor', 'aire'] as const;
export type EquipoSintoma = (typeof EQUIPOS_SINTOMA)[number];

/** El nombre se guarda para que el ERP lo muestre sin otra consulta; el portal relee el repuesto. */
export interface RepuestoElegido {
  id: string;
  nombre: string;
}

export interface CausaSintoma {
  causa: string;
  senal: string;
  tiempo: string;
  /** Zona del despiece que se marca en el dibujo; null si el equipo no tiene dibujo. */
  tipo: TipoPieza | null;
  repuestos: RepuestoElegido[];
}

export interface SintomaConfig {
  equipo: EquipoSintoma;
  sintoma: string;
  causas: CausaSintoma[];
}

export const TOPES_SINTOMAS = {
  sintomas: 60, causas: 4, repuestos: 6, sintoma: 80, causa: 60, senal: 200, tiempo: 30,
} as const;

const c = (causa: string, senal: string, tipo: TipoPieza | null, tiempo: string): CausaSintoma =>
  ({ causa, senal, tiempo, tipo, repuestos: [] });
const s = (equipo: EquipoSintoma, sintoma: string, ...causas: CausaSintoma[]): SintomaConfig =>
  ({ equipo, sintoma, causas });

export const SINTOMAS_POR_DEFECTO: SintomaConfig[] = [
  s('lavarropas', 'No desagota', c('Bomba de desagote', 'Suele estar trabada por un objeto o quemada.', 'bomba-desagote', '24–48 h')),
  s('lavarropas', 'No centrifuga o hace ruido', c('Rulemanes', 'Ruido fuerte al centrifugar o el tambor gira flojo.', 'rodamiento', '2–4 días')),
  s('lavarropas', 'No enciende', c('Placa de control', 'Muchas veces es una protección quemada por un pico de tensión.', 'plaqueta', '2–5 días')),
  s('lavarropas', 'Pierde agua por adelante', c('Burlete de la puerta', 'El agua aparece abajo, del lado del frente.', 'burlete', '24–48 h')),
  s('lavarropas', 'No carga agua', c('Electroválvula', 'Arranca el programa pero no entra agua.', 'electrovalvula', '24–48 h')),
  s('lavarropas', 'El motor suena pero el tambor no gira', c('Correa', 'Se escucha el motor y el tambor queda quieto.', 'correa', 'En el día')),
  s('heladera', 'No enfría', c('Termostato', 'Si el motor arranca y para enseguida, suele ser el termostato.', 'termostato', '24–72 h')),
  s('heladera', 'Hace hielo atrás y abajo no enfría', c('Resistencia de descongelado', 'El freezer se llena de hielo y el aire no baja.', 'resistencia', '24–48 h')),
  s('heladera', 'No sopla o hace ruido el ventilador', c('Forzador', 'El ruido viene de atrás del freezer.', 'forzador', '24–48 h')),
  s('heladera', 'El motor arranca y se corta', c('Relé de arranque', 'Hace «clic» atrás, abajo, cada pocos minutos.', 'rele', '24–48 h')),
  s('heladera', 'Pierde frío por la puerta', c('Burlete', 'La goma de la puerta no cierra parejo.', 'burlete', '24–48 h')),
  s('microondas', 'No calienta', c('Magnetrón', 'Prende la luz y gira el plato, pero no calienta.', 'magnetron', '24–48 h')),
  s('microondas', 'El plato no gira', c('Motor del plato', 'Se escucha zumbar pero el plato no se mueve.', 'motor-plato', '24 h')),
  s('microondas', 'Hace chispas adentro', c('Mica', 'La placa de mica del costado está quemada.', 'mica', 'En el día')),
  s('microondas', 'No enciende', c('Fusible', 'No prende nada, ni el reloj.', 'fusible', 'En el día')),
  s('microondas', 'No arranca con la puerta cerrada', c('Microswitch de puerta', 'Al cerrar la puerta no reconoce que está cerrada.', 'microswitch', '24 h')),
  s('televisor', 'Hay sonido pero no imagen', c('Tiras LED', 'Con una linterna sobre la pantalla se ve la imagen.', 'tira-led', '48–72 h')),
  s('televisor', 'No enciende', c('Fuente de alimentación', 'La luz de standby no prende o parpadea.', 'fuente', '48–72 h')),
  s('televisor', 'Líneas o imagen partida', c('Placa T-con', 'Líneas fijas verticales u horizontales.', 't-con', 'A evaluar')),
  s('televisor', 'Se reinicia solo', c('Placa principal', 'Se apaga y vuelve a prender sin que lo toqués.', 'placa-main', '48–72 h')),
  s('aire', 'No enfría', c('Falta de gas', 'Sale aire, pero templado.', null, 'En el día')),
  s('aire', 'Gotea adentro', c('Desagote tapado', 'La bandeja de la unidad de adentro rebalsa.', null, 'En el día')),
  s('aire', 'La unidad de afuera no arranca', c('Capacitor', 'Prende la de adentro, pero la de afuera no.', null, '24–48 h')),
];

/** Lo guardado o, si el taller nunca lo tocó, la lista de fábrica (copia: nadie pisa el default). */
export function sintomasVigentes(guardados: SintomaConfig[] | null | undefined): SintomaConfig[] {
  return guardados ?? structuredClone(SINTOMAS_POR_DEFECTO);
}

/** Los ids de repuestos que hay que releer, sin repetidos. */
export function idsDeRepuestos(sintomas: SintomaConfig[]): string[] {
  return [...new Set(sintomas.flatMap((x) => x.causas.flatMap((k) => k.repuestos.map((r) => r.id))))];
}

/**
 * Lo que ve el portal: cada repuesto elegido reemplazado por su vista de la
 * tienda. El que se despublicó o se borró se cae en silencio (no se le
 * muestra al cliente un repuesto que no puede comprar); un síntoma que se
 * queda sin causas tampoco sale.
 */
export function sintomasPublicos<P>(sintomas: SintomaConfig[], vistas: Map<string, P>) {
  return sintomas
    .filter((x) => x.causas.length > 0)
    .map((x) => ({
      equipo: x.equipo,
      sintoma: x.sintoma,
      causas: x.causas.map((k) => ({
        causa: k.causa,
        senal: k.senal,
        tiempo: k.tiempo,
        tipo: k.tipo,
        repuestos: k.repuestos.map((r) => vistas.get(r.id)).filter((v): v is P => v !== undefined),
      })),
    }));
}
