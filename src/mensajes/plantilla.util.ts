/**
 * Los mensajes al cliente (14/11/2026): texto con `{variables}` entre llaves,
 * igual que en el sistema del que viene este. Puro: sin base ni Nest.
 *
 * La regla que hace que un mensaje editable no quede feo es la de la línea
 * vacía: «Saldo: {saldo}» desaparece entera cuando no hay saldo, sin que la
 * agencia tenga que escribir dos versiones del mismo texto.
 *
 * `renderizarPlantilla` se copia al ERP como espejo para la vista previa de
 * Configuración → Mensajes: si cambia una regla acá, cambia allá.
 */
import { whatsappArgentino } from '../common/whatsapp.util';

/** A quién se le escribe: alguien que consultó, o el comprador de una reserva o venta. */
export type ContextoPlantilla = 'interesado' | 'operacion';
export const CONTEXTOS: readonly ContextoPlantilla[] = ['interesado', 'operacion'];
export type CanalPlantilla = 'whatsapp' | 'email';
export const CANALES: readonly CanalPlantilla[] = ['whatsapp', 'email'];

/** El valor de cada variable ya resuelto a texto. Vacío, `null` y `undefined` son lo mismo. */
export type DatosPlantilla = Record<string, string | null | undefined>;

/** Qué variables puede usar cada contexto: lo que muestran los botones del editor. */
export const VARIABLES_POR_CONTEXTO: Record<ContextoPlantilla, readonly string[]> = {
  interesado: ['cliente', 'auto', 'precio', 'link_auto', 'su_auto', 'cotizacion', 'vendedor', 'agencia', 'direccion', 'telefono', 'link_sitio'],
  operacion: ['cliente', 'auto', 'operacion', 'precio', 'pagado', 'saldo', 'vence', 'vendedor', 'agencia', 'direccion', 'telefono', 'link_sitio'],
};

/** Para qué sirve cada variable, dicho para quien arma el mensaje. */
export const AYUDA_DE_VARIABLE: Record<string, string> = {
  cliente: 'El nombre de la persona', auto: 'El auto, con su año', precio: 'El precio del auto', link_auto: 'La dirección de la publicación en el sitio',
  su_auto: 'El usado que ofrece', cotizacion: 'Lo que se le ofreció por su usado', vendedor: 'Quién lo atiende', agencia: 'El nombre de la agencia',
  direccion: 'La dirección de la agencia', telefono: 'El teléfono de la agencia', link_sitio: 'La dirección del sitio de la agencia',
  operacion: 'El número de la reserva o venta', pagado: 'Lo que ya pagó', saldo: 'Lo que le falta pagar', vence: 'Hasta cuándo se le guarda el auto',
};

const RE_VARIABLE = /\{([a-z_]+)\}/g;

/** Dobles espacios y espacio antes de puntuación que deja una variable vacía en medio de una oración. */
const prolija = (linea: string): string => linea.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?)])/g, '$1').trimEnd();

export function renderizarPlantilla(texto: string, datos: DatosPlantilla): string {
  const lineas = (texto ?? '').split('\n').map((linea) => {
    let tieneVariables = false;
    let todasVacias = true;
    const rendida = linea.replace(RE_VARIABLE, (crudo, nombre: string) => {
      if (!(nombre in datos)) {
        // Desconocida: queda tal cual para que el error se vea en la vista previa. Y salva la línea.
        todasVacias = false;
        return crudo;
      }
      tieneVariables = true;
      const valor = datos[nombre];
      const resuelto = valor === null || valor === undefined ? '' : String(valor);
      if (resuelto !== '') todasVacias = false;
      return resuelto;
    });
    // Una línea SIN variables se conserva siempre (incluida la vacía que separa párrafos).
    return tieneVariables && todasVacias ? null : prolija(rendida);
  });
  return lineas.filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Las variables que el texto usa y el contexto no tiene: se avisan al guardar. */
export function variablesDesconocidas(texto: string, contexto: ContextoPlantilla): string[] {
  const permitidas = VARIABLES_POR_CONTEXTO[contexto];
  return [...new Set([...(texto ?? '').matchAll(RE_VARIABLE)].map((m) => m[1]).filter((v) => !permitidas.includes(v)))];
}

/** dd/mm/aaaa. Una fecha 'aaaa-mm-dd' se da vuelta a mano: `new Date` la leería en UTC y restaría un día. */
export function fechaCorta(valor: Date | string): string {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/');
  const d = new Date(valor);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** «US$ 15.900» o «$ 21.500.000», sin centavos. */
export function plata(valor: number | string | null | undefined, moneda: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return `${moneda === 'USD' ? 'US$' : '$'} ${Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

/** Teléfono listo para `wa.me`: el E.164 argentino (54 9 área número) o, si no se reconoce, sólo dígitos con 54 adelante. */
export function normalizarTelefono(tel: string | null | undefined): string | null {
  const digitos = whatsappArgentino(tel);
  if (!digitos) return null;
  return digitos.startsWith('54') ? digitos : `54${digitos}`;
}

/** El sitio de una agencia: su subdominio sobre la dirección del portal (https://agencia.fgautos.com). */
export function sitioDeAgencia(portalUrl: string, slug: string | null | undefined): string {
  if (!slug) return '';
  try {
    const u = new URL(portalUrl);
    u.hostname = `${slug}.${u.hostname.replace(/^www\./, '')}`;
    return u.toString().replace(/\/+$/, '');
  } catch { return ''; }
}

export interface AgenciaParaPlantilla { name?: string | null; direccion?: string | null; telefono?: string | null; slug?: string | null }
export interface AutoParaPlantilla { id: string; marca: string; modelo: string; version?: string | null; anio: number; precio_venta?: number | string | null; moneda?: string | null; publicada?: boolean }

const tituloDeAuto = (a: AutoParaPlantilla | null | undefined) => (a ? [a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(' ') : '');

function datosDeAgencia(agencia: AgenciaParaPlantilla | null, portalUrl: string): DatosPlantilla {
  return { agencia: agencia?.name ?? '', direccion: agencia?.direccion ?? '', telefono: agencia?.telefono ?? '', link_sitio: sitioDeAgencia(portalUrl, agencia?.slug) };
}

export interface InteresadoParaPlantilla {
  nombre: string; tiene_usado?: string | null; cotizacion_valor?: number | string | null; cotizacion_moneda?: string | null;
}

export function datosDeInteresado(i: InteresadoParaPlantilla, auto: AutoParaPlantilla | null, vendedor: string | null, agencia: AgenciaParaPlantilla | null, portalUrl: string): DatosPlantilla {
  const sitio = sitioDeAgencia(portalUrl, agencia?.slug);
  return {
    cliente: i.nombre.trim().split(/\s+/)[0] ?? '',
    auto: tituloDeAuto(auto),
    precio: auto ? plata(auto.precio_venta, auto.moneda) : '',
    // Sólo si el auto está publicado: un enlace que da «no encontrado» es peor que no mandarlo.
    link_auto: auto?.publicada && sitio ? `${sitio}/autos/${auto.id}` : '',
    su_auto: i.tiene_usado ?? '',
    cotizacion: plata(i.cotizacion_valor, i.cotizacion_moneda),
    vendedor: vendedor ?? '',
    ...datosDeAgencia(agencia, portalUrl),
  };
}

export interface OperacionParaPlantilla {
  numero: string; cliente_nombre: string; precio: number | string; moneda: string; reserva_vence?: string | null; estado: string; pagado: number;
}

export function datosDeOperacion(o: OperacionParaPlantilla, auto: AutoParaPlantilla | null, vendedor: string | null, agencia: AgenciaParaPlantilla | null, portalUrl: string): DatosPlantilla {
  const saldo = Math.max(0, Number(o.precio) - o.pagado);
  return {
    cliente: o.cliente_nombre.trim().split(/\s+/)[0] ?? '',
    auto: tituloDeAuto(auto),
    operacion: o.numero,
    precio: plata(o.precio, o.moneda),
    pagado: o.pagado > 0 ? plata(o.pagado, o.moneda) : '',
    saldo: saldo > 0.5 ? plata(saldo, o.moneda) : '',
    // La fecha de la reserva sólo tiene sentido mientras es una reserva.
    vence: o.estado === 'reservada' && o.reserva_vence ? fechaCorta(o.reserva_vence) : '',
    vendedor: vendedor ?? '',
    ...datosDeAgencia(agencia, portalUrl),
  };
}
