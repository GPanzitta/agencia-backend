import { Injectable, NotFoundException } from '@nestjs/common';
import { Publicacion, PUBLICACION_VACIA } from './publicacion.util';
import { DataSource, In } from 'typeorm';

import { Company } from '../companies/entities/company.entity';
import { PapelesPublicos, papelesPublicos } from './papeles.util';
import { Unidad } from './entities/unidad.entity';
import { diasEnStock } from './unidades.util';
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
