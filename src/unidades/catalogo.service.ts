import { Injectable, NotFoundException } from '@nestjs/common';
import { Publicacion, PUBLICACION_VACIA } from './publicacion.util';
import { DataSource, In } from 'typeorm';

import { Company } from '../companies/entities/company.entity';
import { Interesado } from '../interesados/interesado.entity';
import { ETAPAS_ACTIVAS, coincide } from '../interesados/interesados.util';
import { PapelesPublicos, papelesDe, papelesPublicos } from './papeles.util';
import { Operacion } from './entities/operacion.entity';
import { cuenta } from './operaciones.util';
import { Unidad } from './entities/unidad.entity';
import { costoTotal, diasEnStock } from './unidades.util';
import { hoyAr, tituloDe } from './unidades.vista';

/** Lo que ve cualquiera en el sitio. Nunca lleva costo, piso, margen, titular, papeles ni notas. */
export interface UnidadPublica {
  id: string;
  titulo: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  km: number;
  color: string | null;
  combustible: string | null;
  transmision: string | null;
  carroceria: string | null;
  condicion: string;
  reservada: boolean;
  nuevo_ingreso: boolean;
  moneda: string;
  precio: number;
  descripcion: string | null;
  /** Dónde está el auto, si la agencia lo cargó. */
  ubicacion: string | null;
  /** Equipamiento, características, colores y opciones de compra que armó la agencia. */
  publicacion: Publicacion;
  /** Cómo están los papeles, para el comprador. `null` en un 0 km. */
  papeles: PapelesPublicos | null;
  /** Con qué condiciones se puede simular la cuota de este auto. `null` si la agencia no lo financia. */
  financiacion: { anticipo_minimo_pct: number; plazos: number[]; tna: number } | null;
  /** La seña con la que se reserva desde el sitio; `null` si la agencia no toma reservas o el auto ya está reservado. */
  reserva: { monto: number; moneda: 'ARS' | 'USD'; horas: number; dias: number; en_curso: boolean } | null;
  portada: string | null;
  fotos: { url: string; url_miniatura: string }[];
}

export interface FiltrosCatalogo {
  marca?: string;
  carroceria?: string;
  combustible?: string;
  transmision?: string;
  condicion?: string;
  q?: string;
}

const DIAS_NUEVO_INGRESO = 10;

/** El catálogo público de la agencia: sólo las unidades publicadas, disponibles o reservadas. */
@Injectable()
export class CatalogoService {
  constructor(private readonly dataSource: DataSource) {}

  async listar(companyId: string, f: FiltrosCatalogo): Promise<{ unidades: UnidadPublica[]; marcas: string[] }> {
    const todas = await this.publicadas(companyId);
    const igual = (a: string | null, b?: string) => !b || (a ?? '').toLowerCase() === b.toLowerCase();
    const q = (f.q ?? '').trim().toLowerCase();
    const unidades = todas.filter((u) =>
      igual(u.marca, f.marca) && igual(u.carroceria, f.carroceria) && igual(u.combustible, f.combustible)
      && igual(u.transmision, f.transmision) && igual(u.condicion, f.condicion)
      && (!q || `${u.titulo} ${u.anio}`.toLowerCase().includes(q)));
    return { unidades, marcas: [...new Set(todas.map((u) => u.marca))].sort((a, b) => a.localeCompare(b)) };
  }

  async obtener(companyId: string, id: string): Promise<UnidadPublica> {
    const u = (await this.publicadas(companyId, id))[0];
    if (!u) throw new NotFoundException('Esa unidad ya no está publicada.');
    return u;
  }

  /**
   * Estado en tiempo real para el propietario que dejó su vehículo en consignación:
   * muestra estado operativo, precio publicado, piso acordado, gastos de alistaje,
   * estado de papeles y cuántos interesados consultaron o buscan un auto así.
   */
  async consignacion(companyId: string, id: string) {
    const em = this.dataSource.manager;
    const u = await em.findOne(Unidad, {
      where: { id, companyId, origen: 'consignacion' },
      relations: { fotos: true, gastos: true },
    });
    if (!u) throw new NotFoundException('No encontramos esa unidad en consignación.');
    const hoy = hoyAr();
    const fotos = [...(u.fotos ?? [])].sort((a, b) => a.orden - b.orden);
    const gastos = costoTotal(u);
    const piso = u.precio_piso !== null ? Number(u.precio_piso) : null;
    const neto = piso !== null ? Math.max(0, Math.round((piso - gastos) * 100) / 100) : null;

    const activos = await em.find(Interesado, {
      where: { companyId, etapa: In(ETAPAS_ACTIVAS) },
      take: 500,
    });
    const consultaron = activos.filter((i) => i.unidadId === u.id).length;
    const coinciden = activos.filter((i) => i.unidadId !== u.id && coincide(i, u)).length;

    return {
      id: u.id,
      numero: u.numero,
      titulo: tituloDe(u),
      marca: u.marca,
      modelo: u.modelo,
      version: u.version,
      anio: u.anio,
      km: u.km,
      dominio: u.dominio,
      estado: u.estado,
      publicada: u.publicada,
      ubicacion: u.ubicacion,
      moneda: u.moneda,
      precio_piso: piso,
      precio_publicado: u.precio_venta !== null ? Number(u.precio_venta) : null,
      total_gastos: gastos,
      neto_estimado: neto,
      dias_en_gestion: diasEnStock(u.fecha_ingreso, hoy),
      fecha_ingreso: u.fecha_ingreso,
      fecha_venta: u.fecha_venta,
      titular_nombre: u.titular_nombre,
      portada: fotos[0]?.url ?? null,
      papeles: papelesDe(u, hoy).map((p) => ({ tipo: p.tipo, nombre: p.nombre, estado: p.estado })),
      actividad: {
        consultas_directas: consultaron,
        compradores_en_cartera: coinciden,
      },
    };
  }

  /**
   * Estado en vivo de una Orden de Venta (OV) para el comprador cuando escanea el
   * código QR de su constancia de OV (como el seguimiento de orden de servicio en Taller).
   */
  async ordenDeVentaPublica(companyId: string, id: string) {
    const em = this.dataSource.manager;
    const op = await em.findOne(Operacion, {
      where: { id, companyId },
      relations: { pagos: true },
    });
    if (!op) throw new NotFoundException('No encontramos esa Orden de Venta.');
    const u = await em.findOne(Unidad, {
      where: { id: op.unidadId, companyId },
      relations: { fotos: true },
    });
    if (!u) throw new NotFoundException('No encontramos el vehículo de esa operación.');
    const hoy = hoyAr();
    const fotosUnidad = [...(u.fotos ?? [])].sort((a, b) => a.orden - b.orden);
    const c = cuenta(op.precio, op.moneda, op.pagos ?? []);
    const todosPapeles = papelesDe(u, hoy);
    const transf = todosPapeles.find((p) => p.tipo === 'transferencia_registro');

    return {
      id: op.id,
      numero: op.numero,
      estado: op.estado,
      cliente_nombre: op.cliente_nombre,
      precio: Number(op.precio),
      moneda: op.moneda,
      pagado: c.pagado,
      saldo: c.saldo,
      saldada: c.saldada,
      reserva_vence: op.reserva_vence,
      created_at: op.created_at,
      cerrada_at: op.cerrada_at,
      auto: {
        id: u.id,
        numero: u.numero,
        titulo: tituloDe(u),
        anio: u.anio,
        km: u.km,
        dominio: u.dominio,
        color: u.color,
        portada: fotosUnidad[0]?.url ?? null,
      },
      papeles: papelesPublicos(u, hoy),
      transferencia: {
        estado: transf?.estado ?? 'falta',
        nota: transf?.nota ?? null,
      },
      fotos_ov: (op.fotos ?? []).map((f) => ({
        id: f.id,
        url: f.url,
        url_miniatura: f.url_miniatura,
        nota: f.nota,
        etapa: f.etapa,
        fecha: f.fecha,
      })),
    };
  }

  /** La tasa depende de la moneda del auto; sin tasa para esa moneda, no se simula. */
  private financiacionPara(fin: Company['sitio_financiacion'], moneda: string): UnidadPublica['financiacion'] {
    const tna = fin ? (moneda === 'ARS' ? fin.tna_ars : fin.tna_usd) : null;
    if (!fin || tna === null || tna === undefined || !fin.plazos?.length) return null;
    return { anticipo_minimo_pct: fin.anticipo_minimo_pct, plazos: fin.plazos, tna };
  }

  /** Sin usuario no hay empresa en el contexto: el filtro por empresa va a mano, con la del sitio que se mira. */
  private async publicadas(companyId: string, id?: string): Promise<UnidadPublica[]> {
    const unidades = await this.dataSource.manager.find(Unidad, {
      where: { companyId, publicada: true, estado: In(['disponible', 'reservada']), ...(id ? { id } : {}) },
      relations: { fotos: true },
      order: { fecha_ingreso: 'DESC', created_at: 'DESC' },
      take: 300,
    });
    const hoy = hoyAr();
    // La agencia puede elegir no mostrar los papeles en su sitio.
    const empresa = await this.dataSource.manager.findOne(Company, { where: { id: companyId }, select: { id: true, sitio_muestra_papeles: true, sitio_financiacion: true, sitio_reserva: true } });
    const res = empresa?.sitio_reserva ?? null;
    // Los autos que alguien está reservando en este momento desde el sitio.
    const enCurso = new Set<string>(res ? (await this.dataSource.query(
      `SELECT "unidad_id" FROM "reservas_web" WHERE "company_id" = $1 AND "estado" = 'pendiente' AND "vence_at" > now()`, [companyId],
    )).map((f: { unidad_id: string }) => f.unidad_id) : []);
    const fin = empresa?.sitio_financiacion ?? null;
    const conPapeles = empresa?.sitio_muestra_papeles ?? true;
    return unidades.filter((u) => u.precio_venta !== null).map((u) => {
      const fotos = [...(u.fotos ?? [])].sort((a, b) => a.orden - b.orden);
      return {
        id: u.id,
        titulo: tituloDe(u),
        marca: u.marca,
        modelo: u.modelo,
        version: u.version,
        anio: u.anio,
        km: u.km,
        color: u.color,
        combustible: u.combustible,
        transmision: u.transmision,
        carroceria: u.carroceria,
        condicion: u.condicion,
        reservada: u.estado === 'reservada',
        nuevo_ingreso: diasEnStock(u.fecha_ingreso, hoy) <= DIAS_NUEVO_INGRESO,
        moneda: u.moneda,
        precio: Number(u.precio_venta),
        descripcion: u.descripcion,
        ubicacion: u.ubicacion,
        publicacion: { ...PUBLICACION_VACIA, ...(u.publicacion ?? {}) },
        papeles: conPapeles ? papelesPublicos(u, hoy) : null,
        financiacion: this.financiacionPara(fin, u.moneda),
        reserva: res && u.estado === 'disponible' ? { monto: Number(res.monto), moneda: res.moneda, horas: res.horas, dias: res.dias, en_curso: enCurso.has(u.id) } : null,
        portada: fotos[0]?.url ?? null,
        fotos: fotos.map((x) => ({ url: x.url, url_miniatura: x.url_miniatura })),
      };
    });
  }
}
