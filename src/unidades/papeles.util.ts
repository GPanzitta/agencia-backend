import type { CondicionUnidad, EstadoPapel, OrigenUnidad, Papel } from './entities/unidad.entity';

/**
 * Los papeles de una unidad y cuáles frenan la venta (diseño del 12/11/2026).
 * Fuente: requisitos de transferencia de argentina.gob.ar relevados ese día.
 * El libre deuda NO bloquea: las fuentes se contradicen; confirmarlo con un gestor.
 */
export interface TipoDePapel {
  tipo: string;
  nombre: string;
  /** Frena la venta de un usado si no está. */
  bloquea: boolean;
  /** Sólo aplica con este origen. */
  soloOrigen?: OrigenUnidad;
  vence?: boolean;
}

export const TIPOS_DE_PAPEL: TipoDePapel[] = [
  { tipo: 'titulo', nombre: 'Título o CAT', bloquea: true },
  { tipo: 'cedula', nombre: 'Cédula', bloquea: true },
  { tipo: 'form_08', nombre: 'Formulario 08 firmado', bloquea: true },
  { tipo: 'informe_dominio', nombre: 'Informe de dominio', bloquea: true, vence: true },
  { tipo: 'verificacion_policial', nombre: 'Verificación policial (form. 12)', bloquea: true, vence: true },
  { tipo: 'libre_deuda', nombre: 'Libre deuda de patentes y multas (form. 13)', bloquea: false },
  { tipo: 'vtv', nombre: 'VTV / RTO', bloquea: false, vence: true },
  { tipo: 'denuncia_venta', nombre: 'Denuncia de venta del titular', bloquea: false },
  { tipo: 'contrato_consignacion', nombre: 'Contrato de consignación', bloquea: true, soloOrigen: 'consignacion' },
  { tipo: 'transferencia_registro', nombre: 'Transferencia en Registro Automotor y cédula nueva', bloquea: false },
];

export const ESTADOS_DE_PAPEL: EstadoPapel[] = ['falta', 'en_tramite', 'ok'];

export interface PapelVisto {
  tipo: string;
  nombre: string;
  estado: EstadoPapel;
  vence: string | null;
  nota: string | null;
  bloquea: boolean;
  vencido: boolean;
}

export type Semaforo = 'rojo' | 'amarillo' | 'verde';

interface UnidadConPapeles {
  origen: OrigenUnidad;
  condicion: CondicionUnidad;
  papeles?: Record<string, Papel> | null;
}

/** La lista completa para esta unidad, con lo que falta en «falta». Un 0 km no tiene bloqueantes de transferencia. */
export function papelesDe(u: UnidadConPapeles, hoy: string): PapelVisto[] {
  return TIPOS_DE_PAPEL
    .filter((t) => !t.soloOrigen || t.soloOrigen === u.origen)
    .map((t) => {
      const p = u.papeles?.[t.tipo];
      const vence = t.vence ? p?.vence ?? null : null;
      const estado = p?.estado ?? 'falta';
      return {
        tipo: t.tipo,
        nombre: t.nombre,
        estado,
        vence,
        nota: p?.nota ?? null,
        bloquea: t.bloquea && (u.condicion === 'usado' || !!t.soloOrigen),
        vencido: estado === 'ok' && !!vence && vence < hoy,
      };
    });
}

/** Un papel sirve para vender si está y no venció. */
const alDia = (p: PapelVisto) => p.estado === 'ok' && !p.vencido;

/** Los nombres de los papeles que hoy impiden cerrar la venta. */
export function bloqueantesPendientes(u: UnidadConPapeles, hoy: string): string[] {
  return papelesDe(u, hoy).filter((p) => p.bloquea && !alDia(p)).map((p) => p.nombre);
}

export function semaforo(u: UnidadConPapeles, hoy: string): Semaforo {
  const lista = papelesDe(u, hoy);
  if (lista.some((p) => p.bloquea && (p.estado === 'falta' || p.vencido))) return 'rojo';
  if (lista.some((p) => !alDia(p))) return 'amarillo';
  return 'verde';
}

export function tipoDePapelValido(tipo: string, origen: OrigenUnidad): boolean {
  return TIPOS_DE_PAPEL.some((t) => t.tipo === tipo && (!t.soloOrigen || t.soloOrigen === origen));
}

/** Lo que ve quien mira el auto en el sitio (13/11/2026): sólo los papeles que le importan al comprador. */
export interface PapelPublico {
  tipo: string;
  nombre: string;
  estado: 'al_dia' | 'en_tramite' | 'pendiente';
}

export interface PapelesPublicos {
  /** Todos los que se muestran están al día. */
  al_dia: boolean;
  items: PapelPublico[];
}

/** Con las palabras del comprador; los internos (denuncia de venta, contrato de consignación) no salen. */
const NOMBRES_PUBLICOS: Record<string, string> = {
  titulo: 'Título',
  cedula: 'Cédula',
  form_08: 'Formulario 08 firmado',
  informe_dominio: 'Informe de dominio',
  verificacion_policial: 'Verificación policial',
  libre_deuda: 'Libre deuda de patentes y multas',
  vtv: 'VTV vigente',
};

/** Un 0 km no tiene papeles de transferencia que mostrar: devuelve `null`. */
export function papelesPublicos(u: UnidadConPapeles, hoy: string): PapelesPublicos | null {
  if (u.condicion !== 'usado') return null;
  const items = papelesDe(u, hoy)
    .filter((p) => NOMBRES_PUBLICOS[p.tipo])
    .map((p): PapelPublico => ({
      tipo: p.tipo,
      nombre: NOMBRES_PUBLICOS[p.tipo],
      estado: alDia(p) ? 'al_dia' : p.estado === 'en_tramite' ? 'en_tramite' : 'pendiente',
    }));
  return { al_dia: items.every((i) => i.estado === 'al_dia'), items };
}
