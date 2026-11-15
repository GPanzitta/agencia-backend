import { Publicacion, PUBLICACION_VACIA } from './publicacion.util';
import type { Unidad } from './entities/unidad.entity';
import type { Operacion } from './entities/operacion.entity';
import { PapelVisto, Semaforo, bloqueantesPendientes, papelesDe, semaforo } from './papeles.util';
import { EN_STOCK, costoTotal, diasEnStock, margen, totalGastos } from './unidades.util';

/** Hoy en la Argentina, AAAA-MM-DD. */
export function hoyAr(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export interface VistaUnidad {
  id: string;
  numero: string;
  /** «Toyota Corolla XEI 2.0 CVT». */
  titulo: string;
  dominio: string | null;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  km: number;
  color: string | null;
  combustible: string | null;
  transmision: string | null;
  carroceria: string | null;
  nro_motor: string | null;
  nro_chasis: string | null;
  condicion: string;
  origen: string;
  estado: string;
  moneda: 'ARS' | 'USD';
  /** null para quien no ve la plata del negocio (todo puesto que no sea el dueño). */
  costo_adquisicion: number | null;
  precio_piso: number | null;
  precio_venta: number | null;
  gastos: { id: string; descripcion: string; monto: number; moneda: string; tipo_cambio: number | null; fecha: Date }[];
  total_gastos: number | null;
  costo_total: number | null;
  margen: number | null;
  dias_en_stock: number;
  papeles: PapelVisto[];
  semaforo: Semaforo;
  bloqueantes: string[];
  publicada: boolean;
  fotos: { id: string; url: string; url_miniatura: string; orden: number }[];
  portada: string | null;
  titular_nombre: string | null;
  titular_telefono: string | null;
  titular_documento: string | null;
  descripcion: string | null;
  ubicacion: string | null;
  publicacion: Publicacion;
  notas: string | null;
  fecha_ingreso: string;
  fecha_venta: string | null;
  operacion: { id: string; numero: string; estado: string; cliente_nombre: string } | null;
  acciones: { editar: boolean; gastos: boolean; publicar: boolean; reservar: boolean; mover: boolean };
}

export const tituloDe = (u: { marca: string; modelo: string; version?: string | null }) =>
  [u.marca, u.modelo, u.version].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export function vistaDeUnidad(u: Unidad, operacion: Operacion | undefined, hoy: string): VistaUnidad {
  const gastos = [...(u.gastos ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const fotos = [...(u.fotos ?? [])].sort((a, b) => a.orden - b.orden);
  const paraCostos = { ...u, gastos };
  const enStock = EN_STOCK.includes(u.estado);
  const abierta = enStock || u.estado === 'reservada';
  return {
    id: u.id,
    numero: u.numero,
    titulo: tituloDe(u),
    dominio: u.dominio,
    marca: u.marca,
    modelo: u.modelo,
    version: u.version,
    anio: u.anio,
    km: u.km,
    color: u.color,
    combustible: u.combustible,
    transmision: u.transmision,
    carroceria: u.carroceria,
    nro_motor: u.nro_motor,
    nro_chasis: u.nro_chasis,
    condicion: u.condicion,
    origen: u.origen,
    estado: u.estado,
    moneda: u.moneda,
    costo_adquisicion: Number(u.costo_adquisicion),
    precio_piso: num(u.precio_piso),
    precio_venta: num(u.precio_venta),
    gastos: gastos.map((g) => ({ id: g.id, descripcion: g.descripcion, monto: Number(g.monto), moneda: g.moneda, tipo_cambio: num(g.tipo_cambio), fecha: g.created_at })),
    total_gastos: totalGastos(paraCostos),
    costo_total: costoTotal(paraCostos),
    margen: margen(paraCostos),
    dias_en_stock: diasEnStock(u.fecha_ingreso, u.fecha_venta ?? hoy),
    papeles: papelesDe(u, hoy),
    semaforo: semaforo(u, hoy),
    bloqueantes: bloqueantesPendientes(u, hoy),
    publicada: u.publicada,
    fotos: fotos.map((f) => ({ id: f.id, url: f.url, url_miniatura: f.url_miniatura, orden: f.orden })),
    portada: fotos[0]?.url_miniatura ?? null,
    titular_nombre: u.titular_nombre,
    titular_telefono: u.titular_telefono,
    titular_documento: u.titular_documento,
    descripcion: u.descripcion,
    ubicacion: u.ubicacion,
    publicacion: { ...PUBLICACION_VACIA, ...(u.publicacion ?? {}) },
    notas: u.notas,
    fecha_ingreso: u.fecha_ingreso,
    fecha_venta: u.fecha_venta,
    operacion: operacion ? { id: operacion.id, numero: operacion.numero, estado: operacion.estado, cliente_nombre: operacion.cliente_nombre } : null,
    acciones: {
      editar: abierta,
      gastos: abierta,
      publicar: u.estado === 'disponible' && u.precio_venta !== null,
      reservar: enStock && u.precio_venta !== null,
      mover: enStock,
    },
  };
}

/** El dueño (y el superadmin de la plataforma) ven lo que lleva puesto cada unidad y lo que deja. */
export function veCostos(rol: string | null | undefined): boolean {
  return rol === 'admin' || rol === 'superadmin';
}

/**
 * La misma unidad sin la plata del negocio: lo que se pagó, el piso del dueño,
 * el total de gastos, el costo y el margen. Los renglones de gasto quedan: los
 * carga el mismo personal que alista. Se corta acá, en el backend, y no en la
 * pantalla: lo que viaja en la respuesta se puede leer aunque no se dibuje.
 */
export function sinCostos(v: VistaUnidad): VistaUnidad {
  return { ...v, costo_adquisicion: null, precio_piso: null, total_gastos: null, costo_total: null, margen: null };
}

export function vistaPara<T extends VistaUnidad | VistaUnidad[]>(rol: string | null | undefined, v: T): T {
  if (veCostos(rol)) return v;
  return (Array.isArray(v) ? v.map(sinCostos) : sinCostos(v)) as T;
}
