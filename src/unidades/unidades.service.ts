import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { bloquearNumeracion, ordenarPorCorrelativo, siguienteCorrelativo } from '../common/numeracion.util';
import { exigirCupo } from '../abono/cupo-abono';
import { bajarPagina } from '../competencia/descarga';
import { extraerUnidades } from '../competencia/lector.util';
import { FotosAlmacen } from '../orden-fotos/fotos.almacen';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { Operacion } from './entities/operacion.entity';
import { UnidadFoto } from './entities/unidad-foto.entity';
import { UnidadGasto } from './entities/unidad-gasto.entity';
import { EstadoUnidad, Moneda, OrigenUnidad, Unidad } from './entities/unidad.entity';
import { CambiarEstadoDto, CrearUnidadDto, DatosDelAutoDto, EditarUnidadDto, GastoDto, ListarUnidadesDto, PapelDto, PublicacionDto, PublicarDto } from './dto/unidades.dtos';
import { normalizarPublicacion } from './publicacion.util';
import { tipoDePapelValido } from './papeles.util';
import { EN_STOCK, normalizarDominio, problemaDelAlta, problemaDelImporte, puedePasarA } from './unidades.util';
import { VistaUnidad, hoyAr, tituloDe, vistaDeUnidad } from './unidades.vista';

export const MAXIMO_FOTOS_UNIDAD = 20;
const ABIERTAS: EstadoUnidad[] = [...EN_STOCK, 'reservada'];
const VISTAS: Record<string, EstadoUnidad[] | undefined> = {
  stock: ABIERTAS,
  disponibles: ['disponible'],
  reservadas: ['reservada'],
  vendidas: ['vendida'],
  cerradas: ['devuelta', 'baja'],
  todas: undefined,
};
const limpio = (v: string | null | undefined) => (v ?? '').trim() || null;

/** Los datos para dar de alta una unidad, venga del alta manual o de una toma en parte de pago. */
export interface NuevaUnidad {
  auto: DatosDelAutoDto;
  origen: OrigenUnidad;
  condicion: 'usado' | '0km';
  moneda: Moneda;
  costo_adquisicion: number;
  precio_piso?: number | null;
  precio_venta?: number | null;
  titular_nombre?: string | null;
  titular_telefono?: string | null;
  titular_documento?: string | null;
  ubicacion?: string | null;
  notas?: string | null;
  operacionOrigenId?: string | null;
}

/**
 * El stock de la agencia (diseño del 12/11/2026): alta por compra o consignación,
 * alistaje con gastos imputados, papeles, fotos y publicación en el sitio.
 * Reservar y vender es cosa de `OperacionesService`.
 */
@Injectable()
export class UnidadesService {
  constructor(private readonly dataSource: DataSource, private readonly almacen: FotosAlmacen) {}

  async listar(dto: ListarUnidadesDto): Promise<VistaUnidad[]> {
    const estados = VISTAS[dto.vista ?? 'stock'];
    const unidades = await this.dataSource.manager.find(Unidad, {
      where: estados ? { estado: In(estados) } : {},
      relations: { gastos: true, fotos: true },
      order: { fecha_ingreso: 'DESC', created_at: 'DESC' },
      take: 500,
    });
    const q = (dto.q ?? '').trim().toLowerCase();
    const filtradas = q
      ? unidades.filter((u) => `${tituloDe(u)} ${u.dominio ?? ''} ${u.numero} ${u.anio}`.toLowerCase().includes(q))
      : unidades;
    return this.vistas(this.dataSource.manager, filtradas);
  }

  async obtener(id: string, em: EntityManager = this.dataSource.manager): Promise<VistaUnidad> {
    const u = await em.findOne(Unidad, { where: { id }, relations: { gastos: true, fotos: true } });
    if (!u) throw new NotFoundException('No encontramos esa unidad.');
    return (await this.vistas(em, [u]))[0];
  }

  /**
   * Descarga y analiza una URL externa para extraer vehículos y prellenar el importador
   * de stock en 30 segundos.
   */
  async leerSitioExterno(direccion: string) {
    const limpia = (direccion ?? '').trim();
    if (!/^https?:\/\/.+\..+/i.test(limpia)) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Pegá la dirección completa de la página, con https:// adelante.');
    }
    const { html, url } = await bajarPagina(limpia);
    const extraidas = extraerUnidades(html, url);
    return extraidas.slice(0, 80).map((u, idx) => {
      const marca = u.marca || u.titulo.split(/\s+/)[0] || 'Marca';
      const resto = u.titulo.replace(new RegExp(`^${marca}\\s*`, 'i'), '').trim();
      const partes = resto.split(/\s+/);
      const modelo = partes[0] || u.titulo;
      const version = partes.slice(1).join(' ') || u.detalle || null;
      return {
        dominio: `IM${String(idx + 1).padStart(3, '0')}AA`,
        marca: marca.slice(0, 60),
        modelo: modelo.slice(0, 80),
        version: version ? version.slice(0, 120) : null,
        anio: u.anio ?? new Date().getFullYear() - 3,
        km: u.km ?? 50000,
        moneda: u.moneda,
        precio_venta: u.precio,
      };
    });
  }

  async crear(dto: CrearUnidadDto, user: User): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.alta(em, {
        auto: dto,
        origen: dto.origen,
        condicion: dto.condicion ?? 'usado',
        moneda: dto.moneda ?? 'USD',
        costo_adquisicion: dto.origen === 'consignacion' ? 0 : Number(dto.costo_adquisicion ?? 0),
        precio_piso: dto.precio_piso,
        precio_venta: dto.precio_venta,
        titular_nombre: dto.titular_nombre,
        titular_telefono: dto.titular_telefono,
        titular_documento: dto.titular_documento,
        ubicacion: dto.ubicacion,
        notas: dto.notas,
      }, user);
      return this.obtener(u.id, em);
    });
  }

  /** El alta en sí, dentro de la transacción del que llama. La usa también la toma en parte de pago. */
  async alta(em: EntityManager, n: NuevaUnidad, user: User): Promise<Unidad> {
    const dominio = normalizarDominio(n.auto.dominio);
    const problema = problemaDelAlta({ ...n, dominio });
    if (problema) throw new ErrorDeNegocio('ALTA_UNIDAD_INVALIDA', problema);
    if (dominio) await this.exigirDominioLibre(em, dominio);
    // El plan gratis tiene un tope de unidades en stock. La toma en parte de pago no se frena:
    // cortaría una venta que ya se está cobrando.
    if (user.companyId && n.origen !== 'toma') await exigirCupo(em, user.companyId);
    const numero = await this.generarNumero(em, user.companyId);
    return em.save(Unidad, em.create(Unidad, {
      numero,
      dominio,
      marca: n.auto.marca.trim(),
      modelo: n.auto.modelo.trim(),
      version: limpio(n.auto.version),
      anio: n.auto.anio,
      km: n.auto.km ?? 0,
      color: limpio(n.auto.color),
      combustible: n.auto.combustible ?? null,
      transmision: n.auto.transmision ?? null,
      carroceria: n.auto.carroceria ?? null,
      nro_motor: limpio(n.auto.nro_motor),
      nro_chasis: limpio(n.auto.nro_chasis),
      condicion: n.condicion,
      origen: n.origen,
      estado: 'ingreso',
      moneda: n.moneda,
      costo_adquisicion: n.costo_adquisicion,
      precio_piso: n.origen === 'consignacion' ? n.precio_piso ?? null : null,
      precio_venta: n.precio_venta ?? null,
      titular_nombre: limpio(n.titular_nombre),
      titular_telefono: limpio(n.titular_telefono),
      titular_documento: limpio(n.titular_documento),
      ubicacion: limpio(n.ubicacion),
      notas: limpio(n.notas),
      operacionOrigenId: n.operacionOrigenId ?? null,
      papeles: {},
      fecha_ingreso: hoyAr(),
      autorId: user.id,
      companyId: user.companyId,
    }));
  }

  async editar(id: string, dto: EditarUnidadDto): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      const cambios: Partial<Unidad> = {};
      if (dto.dominio !== undefined) {
        const dominio = normalizarDominio(dto.dominio);
        const problema = problemaDelAlta({ origen: u.origen, condicion: u.condicion, dominio, titular_nombre: dto.titular_nombre ?? u.titular_nombre });
        if (problema) throw new ErrorDeNegocio('ALTA_UNIDAD_INVALIDA', problema);
        if (dominio && dominio !== u.dominio) await this.exigirDominioLibre(em, dominio);
        cambios.dominio = dominio;
      }
      for (const k of ['marca', 'modelo'] as const) {
        if (dto[k] !== undefined) {
          if (!dto[k]!.trim()) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'La marca y el modelo no pueden quedar vacíos.');
          cambios[k] = dto[k]!.trim();
        }
      }
      for (const k of ['version', 'color', 'nro_motor', 'nro_chasis', 'titular_nombre', 'titular_telefono', 'titular_documento', 'descripcion', 'ubicacion', 'notas'] as const) {
        if (dto[k] !== undefined) cambios[k] = limpio(dto[k]);
      }
      for (const k of ['anio', 'km', 'combustible', 'transmision', 'carroceria', 'precio_venta'] as const) {
        if (dto[k] !== undefined) (cambios as Record<string, unknown>)[k] = dto[k];
      }
      if (dto.costo_adquisicion !== undefined) {
        if (u.origen === 'consignacion' && dto.costo_adquisicion > 0) {
          throw new ErrorDeNegocio('ALTA_UNIDAD_INVALIDA', 'En consignación la agencia no paga la unidad: cargá el precio piso.');
        }
        cambios.costo_adquisicion = dto.costo_adquisicion;
      }
      if (dto.precio_piso !== undefined) {
        if (u.origen !== 'consignacion') throw new ErrorDeNegocio('ALTA_UNIDAD_INVALIDA', 'El precio piso es sólo para consignación.');
        cambios.precio_piso = dto.precio_piso;
      }
      if (u.estado === 'reservada' && (cambios.precio_venta !== undefined || cambios.costo_adquisicion !== undefined)) {
        throw new ErrorDeNegocio('UNIDAD_RESERVADA', 'La unidad está reservada: el precio acordado está en la operación y no se cambia desde acá.');
      }
      if (Object.keys(cambios).length) await em.update(Unidad, { id: u.id }, cambios);
      return this.obtener(u.id, em);
    });
  }

  async cambiarEstado(id: string, dto: CambiarEstadoDto): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      if (!puedePasarA(u.estado, dto.estado, u.origen)) {
        throw new ErrorDeNegocio('ESTADO_UNIDAD_INVALIDO', `La unidad ${u.numero} está «${u.estado}»: no puede pasar a «${dto.estado}» desde acá.`);
      }
      const cierra = dto.estado === 'baja' || dto.estado === 'devuelta';
      const motivo = (dto.motivo ?? '').trim();
      if (cierra && !motivo) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Decí por qué sale del stock.');
      await em.update(Unidad, { id: u.id }, {
        estado: dto.estado,
        // Lo que no está disponible no se muestra en el sitio.
        publicada: dto.estado === 'disponible' ? u.publicada : false,
        notas: cierra ? [u.notas, `${dto.estado === 'baja' ? 'Baja' : 'Devuelta al dueño'}: ${motivo}`].filter(Boolean).join('\n') : u.notas,
      });
      return this.obtener(u.id, em);
    });
  }

  async publicar(id: string, dto: PublicarDto): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      if (dto.publicada) {
        if (u.estado !== 'disponible') throw new ErrorDeNegocio('UNIDAD_NO_PUBLICABLE', 'Sólo se publica una unidad disponible: pasala a «disponible» primero.');
        if (u.precio_venta === null) throw new ErrorDeNegocio('UNIDAD_NO_PUBLICABLE', 'Cargale el precio de venta antes de publicarla.');
      }
      await em.update(Unidad, { id: u.id }, { publicada: dto.publicada });
      return this.obtener(u.id, em);
    });
  }

  /** Guarda cómo se muestra el auto en el sitio. Los autos que se ofrecen al lado tienen que ser de la misma agencia. */
  async guardarPublicacion(id: string, dto: PublicacionDto): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      const p = normalizarPublicacion(dto);
      const pedidas = p.relacionadas.filter((r) => r !== u.id);
      const propias = pedidas.length ? await em.find(Unidad, { where: { id: In(pedidas), companyId: u.companyId }, select: { id: true } }) : [];
      p.relacionadas = pedidas.filter((r) => propias.some((x) => x.id === r));
      await em.update(Unidad, { id: u.id }, { publicacion: p as never });
      return this.obtener(u.id, em);
    });
  }

  async agregarGasto(id: string, dto: GastoDto, user: User): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      const descripcion = dto.descripcion.trim();
      if (!descripcion) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Decí en qué se gastó.');
      const problema = problemaDelImporte(dto, u.moneda);
      if (problema) throw new ErrorDeNegocio('IMPORTE_INVALIDO', problema);
      await em.save(UnidadGasto, em.create(UnidadGasto, {
        unidadId: u.id, descripcion, monto: dto.monto, moneda: dto.moneda,
        tipo_cambio: dto.moneda === u.moneda ? null : dto.tipo_cambio ?? null, autorId: user.id,
      }));
      if (u.estado === 'ingreso') await em.update(Unidad, { id: u.id }, { estado: 'alistaje' });
      return this.obtener(u.id, em);
    });
  }

  async quitarGasto(id: string, gastoId: string): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      const r = await em.delete(UnidadGasto, { id: gastoId, unidadId: u.id });
      if (!r.affected) throw new NotFoundException('Ese gasto no es de esta unidad.');
      return this.obtener(u.id, em);
    });
  }

  async actualizarPapel(id: string, tipo: string, dto: PapelDto): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const u = await this.abierta(em, id);
      if (!tipoDePapelValido(tipo, u.origen)) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Ese papel no corresponde a esta unidad.');
      const papeles = { ...(u.papeles ?? {}), [tipo]: { estado: dto.estado, vence: dto.vence ?? null, nota: limpio(dto.nota) } };
      await em.update(Unidad, { id: u.id }, { papeles });
      return this.obtener(u.id, em);
    });
  }

  async subirFoto(id: string, archivo: Buffer, user: User): Promise<VistaUnidad> {
    const u = await this.abierta(this.dataSource.manager, id, false);
    const existentes = await this.dataSource.manager.find(UnidadFoto, { where: { unidadId: u.id }, order: { orden: 'DESC' } });
    if (existentes.length >= MAXIMO_FOTOS_UNIDAD) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', `Una unidad admite hasta ${MAXIMO_FOTOS_UNIDAD} fotos: quitá alguna.`);
    }
    const comprimida = await comprimirFoto(archivo);
    const ubicacion = await this.almacen.guardarEn(`unidades/${u.id}`, comprimida);
    await this.dataSource.manager.save(UnidadFoto, this.dataSource.manager.create(UnidadFoto, {
      unidadId: u.id, url: ubicacion.url, url_miniatura: ubicacion.url_miniatura, orden: (existentes[0]?.orden ?? -1) + 1, autorId: user.id,
    }));
    return this.obtener(u.id);
  }

  /** La pone primera: es la que se ve en la lista y en el sitio. */
  async fotoDePortada(id: string, fotoId: string): Promise<VistaUnidad> {
    return this.dataSource.transaction(async (em) => {
      const fotos = await em.find(UnidadFoto, { where: { unidadId: id }, order: { orden: 'ASC' } });
      const elegida = fotos.find((f) => f.id === fotoId);
      if (!elegida) throw new NotFoundException('Esa foto no es de esta unidad.');
      const orden = [elegida, ...fotos.filter((f) => f.id !== fotoId)];
      for (let i = 0; i < orden.length; i++) {
        if (orden[i].orden !== i) await em.update(UnidadFoto, { id: orden[i].id }, { orden: i });
      }
      return this.obtener(id, em);
    });
  }

  async borrarFoto(id: string, fotoId: string): Promise<VistaUnidad> {
    const em = this.dataSource.manager;
    const foto = await em.findOne(UnidadFoto, { where: { id: fotoId, unidadId: id } });
    if (!foto) throw new NotFoundException('Esa foto no es de esta unidad.');
    await em.delete(UnidadFoto, { id: foto.id });
    await this.almacen.borrar([foto.url, foto.url_miniatura]).catch(() => undefined);
    return this.obtener(id);
  }

  /** Los números del tablero: qué hay, cuánto vale y cuánto tarda en irse. */
  async resumen() {
    const hoy = hoyAr();
    const todas = await this.listar({ vista: 'todas' });
    const stock = todas.filter((u) => ABIERTAS.includes(u.estado as EstadoUnidad));
    const delMes = todas.filter((u) => u.estado === 'vendida' && (u.fecha_venta ?? '').slice(0, 7) === hoy.slice(0, 7));
    const porMoneda = (lista: VistaUnidad[], valor: (u: VistaUnidad) => number) => ({
      ARS: Math.round(lista.filter((u) => u.moneda === 'ARS').reduce((s, u) => s + valor(u), 0) * 100) / 100,
      USD: Math.round(lista.filter((u) => u.moneda === 'USD').reduce((s, u) => s + valor(u), 0) * 100) / 100,
    });
    return {
      en_stock: stock.length,
      disponibles: stock.filter((u) => u.estado === 'disponible').length,
      reservadas: stock.filter((u) => u.estado === 'reservada').length,
      publicadas: stock.filter((u) => u.publicada).length,
      papeles_en_rojo: stock.filter((u) => u.semaforo === 'rojo').length,
      dias_promedio: stock.length ? Math.round(stock.reduce((s, u) => s + u.dias_en_stock, 0) / stock.length) : 0,
      mas_de_60_dias: stock.filter((u) => u.dias_en_stock > 60).length,
      valor_stock: porMoneda(stock, (u) => u.costo_total ?? 0),
      vendidas_mes: delMes.length,
      margen_mes: porMoneda(delMes, (u) => u.margen ?? 0),
    };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  /** La unidad, bloqueada para escribir, si todavía se puede tocar (en stock o reservada). */
  async abierta(em: EntityManager, id: string, bloquear = true): Promise<Unidad> {
    const u = await em.findOne(Unidad, { where: { id }, ...(bloquear ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!u) throw new NotFoundException('No encontramos esa unidad.');
    if (!ABIERTAS.includes(u.estado)) {
      throw new ErrorDeNegocio('UNIDAD_CERRADA', `La unidad ${u.numero} ya salió del stock (${u.estado}): no se cambia desde acá.`);
    }
    return u;
  }

  private async exigirDominioLibre(em: EntityManager, dominio: string): Promise<void> {
    const otra = await em.findOne(Unidad, { where: { dominio, estado: In(ABIERTAS) } });
    if (otra) throw new ErrorDeNegocio('DOMINIO_EN_STOCK', `El dominio ${dominio} ya está en stock: es la unidad ${otra.numero}.`);
  }

  private async generarNumero(em: EntityManager, companyId?: string): Promise<string> {
    const prefix = 'U-';
    await bloquearNumeracion(em, `numero_unidad:${companyId ?? 'sin-empresa'}`);
    const qb = em.getRepository(Unidad).createQueryBuilder('u').where('u.numero LIKE :prefix', { prefix: `${prefix}%` });
    if (companyId) qb.andWhere('u.company_id = :companyId', { companyId });
    const ultimo = await ordenarPorCorrelativo(qb, 'u.numero').getOne();
    return siguienteCorrelativo(prefix, ultimo?.numero);
  }

  private async vistas(em: EntityManager, unidades: Unidad[]): Promise<VistaUnidad[]> {
    const ids = unidades.map((u) => u.id);
    const vivas = ids.length ? await em.find(Operacion, { where: { unidadId: In(ids), estado: In(['reservada', 'vendida']) } }) : [];
    const porUnidad = new Map(vivas.map((o) => [o.unidadId, o]));
    const hoy = hoyAr();
    return unidades.map((u) => vistaDeUnidad(u, porUnidad.get(u.id), hoy));
  }
}
