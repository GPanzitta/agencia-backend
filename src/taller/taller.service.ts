import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { bloquearNumeracion, ordenarPorCorrelativo, siguienteCorrelativo } from '../common/numeracion.util';
import { FotosAlmacen } from '../orden-fotos/fotos.almacen';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { UnidadGasto } from '../unidades/entities/unidad-gasto.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { hoyAr, tituloDe } from '../unidades/unidades.vista';
import { OrdenAlistajeRepuesto } from './entities/orden-alistaje-repuesto.entity';
import {
  ClienteExternoTaller,
  EstadoOrdenAlistaje,
  FotoOrdenAlistaje,
  ItemChecklistAlistaje,
  OrdenAlistaje,
  PrioridadOrdenAlistaje,
  TipoOrigenOrdenTaller,
  VehiculoExternoTaller,
} from './entities/orden-alistaje.entity';
import {
  EstadoOrdenCompraTaller,
  ItemOrdenCompraTaller,
  OrdenCompraTaller,
} from './entities/orden-compra-taller.entity';
import { CategoriaRepuestoAuto, FotoRepuestoAuto, RepuestoAuto } from './entities/repuesto-auto.entity';
import {
  AgregarRepuestoOrdenDto,
  AjustarStockRepuestoDto,
  CambiarEstadoOrdenAlistajeDto,
  CrearOrdenAlistajeDto,
  CrearOrdenCompraTallerDto,
  CrearRepuestoAutoDto,
  EditarOrdenAlistajeDto,
  EditarRepuestoAutoDto,
  RecibirOrdenCompraTallerDto,
} from './taller.dtos';
import { calcularTotalesOrden, checklistInicial, puedeMoverOrdenA } from './taller.util';

const limpio = (v: string | null | undefined) => (v ?? '').trim() || null;

export interface VistaRepuestoAuto {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: CategoriaRepuestoAuto;
  marca: string | null;
  compatibilidad: string | null;
  ubicacion: string | null;
  unidad_medida: string;
  stock: number;
  stock_minimo: number;
  bajo_stock: boolean;
  moneda: 'ARS' | 'USD';
  costo: number;
  proveedor: string | null;
  portada: string | null;
  fotos: FotoRepuestoAuto[];
  updated_at: Date;
}

export interface VistaOrdenCompraTaller {
  id: string;
  numero: string;
  orden_id: string | null;
  orden_numero: string | null;
  unidad_titulo: string | null;
  proveedor: string;
  numero_remito: string | null;
  estado: EstadoOrdenCompraTaller;
  moneda: 'ARS' | 'USD';
  monto_total: number;
  items: ItemOrdenCompraTaller[];
  notas: string | null;
  created_at: Date;
  recibida_at: Date | null;
}

export interface VistaOrdenAlistaje {
  id: string;
  numero: string;
  tipo_origen: TipoOrigenOrdenTaller;
  estado: EstadoOrdenAlistaje;
  prioridad: PrioridadOrdenAlistaje;
  sector: string;
  responsable: string | null;
  cliente: ClienteExternoTaller | null;
  unidad: {
    id: string | null;
    numero: string;
    titulo: string;
    dominio: string | null;
    anio: number;
    km: number;
    color: string | null;
    moneda: 'ARS' | 'USD';
    estado: string;
  };
  falla_motivo: string;
  diagnostico: string | null;
  trabajo_realizado: string | null;
  km_ingreso: number | null;
  moneda: 'ARS' | 'USD';
  costo_mano_obra: number;
  tipo_cambio: number | null;
  total_repuestos: number;
  total_orden: number;
  gasto_imputado: boolean;
  checklist: ItemChecklistAlistaje[];
  checklist_progreso: { total: number; ok: number; reparar: number; pendiente: number };
  repuestos: {
    id: string;
    repuesto_id: string | null;
    codigo: string | null;
    nombre: string;
    portada: string | null;
    cantidad: number;
    stock_actual: number | null;
    moneda: 'ARS' | 'USD';
    costo_unitario: number;
    subtotal: number;
    ingresado: boolean;
    consumido: boolean;
    compra_id: string | null;
    compra_numero: string | null;
    compra_estado: string | null;
  }[];
  compras: VistaOrdenCompraTaller[];
  fotos: FotoOrdenAlistaje[];
  bitacora: { fecha: string; texto: string; autor: string | null }[];
  created_at: Date;
  finalizada_at: Date | null;
}

@Injectable()
export class TallerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly almacen: FotosAlmacen,
  ) {}

  // ─── Pañol de Repuestos e Insumos Automotrices ─────────────────────────────

  async listarRepuestos(q?: string, categoria?: string, soloBajoStock?: boolean): Promise<VistaRepuestoAuto[]> {
    const lista = await this.dataSource.manager.find(RepuestoAuto, {
      where: { activo: true },
      order: { nombre: 'ASC' },
      take: 500,
    });
    const texto = (q ?? '').trim().toLowerCase();
    return lista
      .map((r) => this.vistaRepuesto(r))
      .filter((r) => {
        if (categoria && r.categoria !== categoria) return false;
        if (soloBajoStock && !r.bajo_stock) return false;
        if (texto) {
          const buscable = `${r.codigo ?? ''} ${r.nombre} ${r.marca ?? ''} ${r.compatibilidad ?? ''} ${r.ubicacion ?? ''}`.toLowerCase();
          if (!buscable.includes(texto)) return false;
        }
        return true;
      });
  }

  async crearRepuesto(dto: CrearRepuestoAutoDto, user: User): Promise<VistaRepuestoAuto> {
    const em = this.dataSource.manager;
    const guardado = await em.save(
      RepuestoAuto,
      em.create(RepuestoAuto, {
        nombre: dto.nombre.trim(),
        codigo: limpio(dto.codigo)?.toUpperCase() ?? null,
        categoria: (dto.categoria ?? 'filtros_fluidos') as CategoriaRepuestoAuto,
        marca: limpio(dto.marca),
        compatibilidad: limpio(dto.compatibilidad),
        ubicacion: limpio(dto.ubicacion),
        unidad_medida: limpio(dto.unidad_medida) ?? 'un',
        stock: Number(dto.stock ?? 0),
        stock_minimo: Number(dto.stock_minimo ?? 1),
        moneda: dto.moneda ?? 'ARS',
        costo: Number(dto.costo ?? 0),
        proveedor: limpio(dto.proveedor),
        activo: true,
        companyId: user.companyId,
      }),
    );
    return this.vistaRepuesto(guardado);
  }

  async editarRepuesto(id: string, dto: EditarRepuestoAutoDto): Promise<VistaRepuestoAuto> {
    const em = this.dataSource.manager;
    const r = await em.findOne(RepuestoAuto, { where: { id, activo: true } });
    if (!r) throw new NotFoundException('No encontramos ese repuesto en el pañol.');
    const cambios: Partial<RepuestoAuto> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.codigo !== undefined) cambios.codigo = limpio(dto.codigo)?.toUpperCase() ?? null;
    if (dto.categoria !== undefined) cambios.categoria = dto.categoria as CategoriaRepuestoAuto;
    if (dto.marca !== undefined) cambios.marca = limpio(dto.marca);
    if (dto.compatibilidad !== undefined) cambios.compatibilidad = limpio(dto.compatibilidad);
    if (dto.ubicacion !== undefined) cambios.ubicacion = limpio(dto.ubicacion);
    if (dto.stock !== undefined) cambios.stock = Math.max(0, Number(dto.stock));
    if (dto.stock_minimo !== undefined) cambios.stock_minimo = Math.max(0, Number(dto.stock_minimo));
    if (dto.moneda !== undefined) cambios.moneda = dto.moneda;
    if (dto.costo !== undefined) cambios.costo = Math.max(0, Number(dto.costo));
    if (dto.proveedor !== undefined) cambios.proveedor = limpio(dto.proveedor);
    if (Object.keys(cambios).length) await em.update(RepuestoAuto, { id: r.id }, cambios);
    const actualizado = await em.findOneOrFail(RepuestoAuto, { where: { id: r.id } });
    return this.vistaRepuesto(actualizado);
  }

  async ajustarStockRepuesto(id: string, dto: AjustarStockRepuestoDto): Promise<VistaRepuestoAuto> {
    return this.dataSource.transaction(async (em) => {
      const r = await em.findOne(RepuestoAuto, { where: { id, activo: true }, lock: { mode: 'pessimistic_write' } });
      if (!r) throw new NotFoundException('No encontramos ese repuesto.');
      const nuevo = Math.round((Number(r.stock) + Number(dto.delta)) * 100) / 100;
      if (nuevo < 0) {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', `No alcanza el stock de «${r.nombre}» (hay ${Number(r.stock)} ${r.unidad_medida}).`);
      }
      await em.update(RepuestoAuto, { id: r.id }, { stock: nuevo });
      const act = await em.findOneOrFail(RepuestoAuto, { where: { id: r.id } });
      return this.vistaRepuesto(act);
    });
  }

  async borrarRepuesto(id: string): Promise<{ ok: true }> {
    const em = this.dataSource.manager;
    const r = await em.findOne(RepuestoAuto, { where: { id, activo: true } });
    if (!r) throw new NotFoundException('No encontramos ese repuesto.');
    await em.update(RepuestoAuto, { id: r.id }, { activo: false });
    return { ok: true };
  }

  async subirFotosRepuesto(id: string, archivos: Buffer[]): Promise<VistaRepuestoAuto> {
    if (!archivos.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Elegí al menos una foto para el repuesto.');
    const em = this.dataSource.manager;
    const r = await em.findOne(RepuestoAuto, { where: { id, activo: true } });
    if (!r) throw new NotFoundException('No encontramos ese repuesto en el pañol.');
    const actuales = r.fotos ?? [];
    const lugar = Math.max(0, 8 - actuales.length);
    if (lugar <= 0) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Un repuesto admite hasta 8 fotos.');
    const comprimidas = await Promise.all(archivos.slice(0, lugar).map((a) => comprimirFoto(a)));
    const nuevas: FotoRepuestoAuto[] = [];
    for (const f of comprimidas) {
      const u = await this.almacen.guardarEn(`repuestos/${r.id}`, f);
      nuevas.push({
        id: randomUUID(),
        url: u.url,
        url_miniatura: u.url_miniatura,
        fecha: new Date().toISOString(),
      });
    }
    await em.update(RepuestoAuto, { id: r.id }, { fotos: [...actuales, ...nuevas] });
    const act = await em.findOneOrFail(RepuestoAuto, { where: { id: r.id } });
    return this.vistaRepuesto(act);
  }

  async borrarFotoRepuesto(id: string, fotoId: string): Promise<VistaRepuestoAuto> {
    const em = this.dataSource.manager;
    const r = await em.findOne(RepuestoAuto, { where: { id, activo: true } });
    if (!r) throw new NotFoundException('No encontramos ese repuesto.');
    const actuales = r.fotos ?? [];
    const elegida = actuales.find((f) => f.id === fotoId);
    if (!elegida) throw new NotFoundException('Esa foto no pertenece a este repuesto.');
    await em.update(RepuestoAuto, { id: r.id }, { fotos: actuales.filter((f) => f.id !== fotoId) });
    await this.almacen.borrar([elegida.url, elegida.url_miniatura]).catch(() => undefined);
    const act = await em.findOneOrFail(RepuestoAuto, { where: { id: r.id } });
    return this.vistaRepuesto(act);
  }

  // ─── Órdenes de Alistaje y Taller (OA-2026-XXXX) ──────────────────────────

  async listarOrdenes(vista?: string, unidadId?: string): Promise<VistaOrdenAlistaje[]> {
    const em = this.dataSource.manager;
    const activas: EstadoOrdenAlistaje[] = ['recibida', 'diagnostico', 'en_trabajo', 'control_calidad'];
    const estados =
      vista === 'listas'
        ? (['lista'] as EstadoOrdenAlistaje[])
        : vista === 'anuladas'
          ? (['anulada'] as EstadoOrdenAlistaje[])
          : vista === 'todas'
            ? undefined
            : activas;

    const ordenes = await em.find(OrdenAlistaje, {
      where: {
        ...(estados ? { estado: In(estados) } : {}),
        ...(unidadId ? { unidadId } : {}),
      },
      relations: { repuestos: true },
      order: { created_at: 'DESC' },
      take: 300,
    });
    return this.vistasOrdenes(em, ordenes);
  }

  async obtenerOrden(id: string, em: EntityManager = this.dataSource.manager): Promise<VistaOrdenAlistaje> {
    const o = await em.findOne(OrdenAlistaje, { where: { id }, relations: { repuestos: true } });
    if (!o) throw new NotFoundException('No encontramos esa Orden de Alistaje.');
    return (await this.vistasOrdenes(em, [o]))[0];
  }

  async crearOrden(dto: CrearOrdenAlistajeDto, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const esCliente = dto.tipo_origen === 'cliente' || (!dto.unidad_id && !!dto.cliente);
      let u: Unidad | null = null;
      let clienteExterno: ClienteExternoTaller | null = null;
      let vehiculoExterno: VehiculoExternoTaller | null = null;

      if (esCliente) {
        if (!dto.cliente?.nombre?.trim()) {
          throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá el nombre del cliente dueño del vehículo.');
        }
        if (!dto.vehiculo?.marca?.trim() || !dto.vehiculo?.modelo?.trim() || !dto.vehiculo?.anio) {
          throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá Marca, Modelo y Año del vehículo del cliente.');
        }
        clienteExterno = {
          nombre: dto.cliente.nombre.trim(),
          telefono: limpio(dto.cliente.telefono),
          documento: limpio(dto.cliente.documento),
          email: limpio(dto.cliente.email),
        };
        vehiculoExterno = {
          dominio: limpio(dto.vehiculo.dominio)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
          marca: dto.vehiculo.marca.trim(),
          modelo: dto.vehiculo.modelo.trim(),
          version: limpio(dto.vehiculo.version),
          anio: Number(dto.vehiculo.anio),
          km: Number(dto.vehiculo.km ?? 0),
          color: limpio(dto.vehiculo.color),
          combustible: limpio(dto.vehiculo.combustible),
          transmision: limpio(dto.vehiculo.transmision),
        };
      } else {
        if (!dto.unidad_id) {
          throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Elegí una unidad del stock o seleccioná «Auto de un cliente externo».');
        }
        u = await em.findOne(Unidad, { where: { id: dto.unidad_id } });
        if (!u) throw new NotFoundException('No encontramos la unidad para abrir la orden.');
      }

      const numero = await this.generarNumeroOrden(em, user.companyId);
      const sector = limpio(dto.sector) ?? (esCliente ? 'Service y reparación a cliente' : 'Service y alistaje de ingreso');
      const responsable = limpio(dto.responsable);
      const creada = await em.save(
        OrdenAlistaje,
        em.create(OrdenAlistaje, {
          numero,
          tipo_origen: esCliente ? 'cliente' : 'stock',
          unidadId: u?.id ?? null,
          cliente_externo: clienteExterno,
          vehiculo_externo: vehiculoExterno,
          estado: 'recibida',
          prioridad: dto.prioridad ?? 'normal',
          sector,
          responsable,
          falla_motivo: dto.falla_motivo.trim(),
          km_ingreso: u ? u.km : (vehiculoExterno?.km ?? 0),
          moneda: dto.moneda ?? 'ARS',
          costo_mano_obra: 0,
          checklist: checklistInicial(),
          fotos: [],
          bitacora: [
            {
              fecha: new Date().toISOString(),
              texto: esCliente
                ? `Orden de taller abierta para cliente ${clienteExterno?.nombre} (${vehiculoExterno?.marca} ${vehiculoExterno?.modelo} ${vehiculoExterno?.anio})${responsable ? ` · asignada a ${responsable}` : ''}.`
                : `Orden de alistaje abierta (${sector})${responsable ? ` · asignada a ${responsable}` : ''}.`,
              autor: user.nombre ?? null,
            },
          ],
          autorId: user.id,
          companyId: user.companyId,
        }),
      );
      if (u && u.estado === 'ingreso') {
        await em.update(Unidad, { id: u.id }, { estado: 'alistaje', ubicacion: `En taller (${sector})` });
      }
      return this.obtenerOrden(creada.id, em);
    });
  }

  async editarOrden(id: string, dto: EditarOrdenAlistajeDto, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const o = await this.ordenAbierta(em, id);
      const cambios: Partial<OrdenAlistaje> = {};
      if (dto.sector !== undefined) cambios.sector = limpio(dto.sector) ?? o.sector;
      if (dto.responsable !== undefined) cambios.responsable = limpio(dto.responsable);
      if (dto.prioridad !== undefined) cambios.prioridad = dto.prioridad;
      if (dto.falla_motivo !== undefined && dto.falla_motivo.trim()) cambios.falla_motivo = dto.falla_motivo.trim();
      if (dto.diagnostico !== undefined) cambios.diagnostico = limpio(dto.diagnostico);
      if (dto.trabajo_realizado !== undefined) cambios.trabajo_realizado = limpio(dto.trabajo_realizado);
      if (dto.moneda !== undefined) cambios.moneda = dto.moneda;
      if (dto.costo_mano_obra !== undefined) cambios.costo_mano_obra = Math.max(0, Number(dto.costo_mano_obra));
      if (dto.tipo_cambio !== undefined) cambios.tipo_cambio = dto.tipo_cambio ? Number(dto.tipo_cambio) : null;

      if (dto.checklist !== undefined) {
        const mapa = new Map(dto.checklist.map((c) => [c.clave, c]));
        const actual = o.checklist?.length ? o.checklist : checklistInicial();
        cambios.checklist = actual.map((item) => {
          const nuevo = mapa.get(item.clave);
          if (!nuevo) return item;
          return {
            ...item,
            estado: nuevo.estado,
            observacion: limpio(nuevo.observacion),
          };
        });
      }

      if (Object.keys(cambios).length) {
        cambios.bitacora = [
          ...(o.bitacora ?? []),
          { fecha: new Date().toISOString(), texto: 'Ficha técnica y checklist actualizados.', autor: user.nombre ?? null },
        ];
        await em.update(OrdenAlistaje, { id: o.id }, cambios);
      }
      return this.obtenerOrden(o.id, em);
    });
  }

  async agregarRepuestoAOrden(id: string, dto: AgregarRepuestoOrdenDto, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const o = await this.ordenAbierta(em, id);
      let repuesto: RepuestoAuto | null = null;
      let ingresado = true;
      let consumido = true;

      if (dto.repuesto_id) {
        repuesto = await em.findOne(RepuestoAuto, {
          where: { id: dto.repuesto_id, activo: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!repuesto) throw new NotFoundException('No encontramos ese repuesto en el pañol.');
        const alcanza = Number(repuesto.stock) >= Number(dto.cantidad);
        const quiereConsumir = dto.consumir_ahora !== false;
        if (alcanza && quiereConsumir) {
          const nuevoStock = Math.round((Number(repuesto.stock) - Number(dto.cantidad)) * 100) / 100;
          await em.update(RepuestoAuto, { id: repuesto.id }, { stock: nuevoStock });
          ingresado = true;
          consumido = true;
        } else if (alcanza && !quiereConsumir) {
          // Está en el pañol pero todavía no se consumió/colocó
          ingresado = true;
          consumido = false;
        } else {
          // No alcanza el stock en pañol: queda Pendiente para generar Orden de Compra (OC)
          ingresado = false;
          consumido = false;
        }
      } else {
        // Repuesto libre: si pide consumir_ahora === false, queda pendiente de compra
        ingresado = dto.consumir_ahora !== false;
        consumido = dto.consumir_ahora !== false;
      }

      const nombre = repuesto ? repuesto.nombre : limpio(dto.nombre);
      if (!nombre) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Indicá el repuesto del pañol o escribí su descripción.');
      const codigo = repuesto ? repuesto.codigo : limpio(dto.codigo)?.toUpperCase() ?? null;
      const moneda = dto.moneda ?? repuesto?.moneda ?? o.moneda;
      const costoUnitario = dto.costo_unitario !== undefined ? Number(dto.costo_unitario) : Number(repuesto?.costo ?? 0);

      await em.save(
        OrdenAlistajeRepuesto,
        em.create(OrdenAlistajeRepuesto, {
          ordenId: o.id,
          repuestoId: repuesto?.id ?? null,
          codigo,
          nombre,
          cantidad: Number(dto.cantidad),
          moneda,
          costo_unitario: costoUnitario,
          ingresado,
          consumido,
          compraId: null,
        }),
      );

      const estadoDetalle = consumido
        ? ' (consumido y descontado del pañol)'
        : ingresado
          ? ' (en pañol, pendiente de colocar/consumir)'
          : ' (pendiente de compra / sin stock)';

      const bitacora = [
        ...(o.bitacora ?? []),
        {
          fecha: new Date().toISOString(),
          texto: `Repuesto pedido en la orden: ${nombre} ×${dto.cantidad}${estadoDetalle}.`,
          autor: user.nombre ?? null,
        },
      ];
      await em.update(OrdenAlistaje, { id: o.id }, {
        bitacora,
        ...(o.estado === 'recibida' ? { estado: 'en_trabajo' as EstadoOrdenAlistaje } : {}),
      });
      return this.obtenerOrden(o.id, em);
    });
  }

  /** Consume un renglón que estaba Pendiente o En pañol: descuenta la cantidad del stock físico del repuesto. */
  async consumirRepuestoDeOrden(id: string, renglonId: string, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const o = await this.ordenAbierta(em, id);
      const renglon = await em.findOne(OrdenAlistajeRepuesto, { where: { id: renglonId, ordenId: o.id } });
      if (!renglon) throw new NotFoundException('Ese repuesto no pertenece a esta orden.');
      if (renglon.consumido) return this.obtenerOrden(o.id, em);

      if (renglon.repuestoId) {
        const rep = await em.findOne(RepuestoAuto, {
          where: { id: renglon.repuestoId, activo: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!rep) throw new NotFoundException('No encontramos el repuesto en el pañol.');
        if (Number(rep.stock) < Number(renglon.cantidad)) {
          throw new ErrorDeNegocio(
            'DATOS_INVALIDOS',
            `Todavía no hay stock suficiente de «${rep.nombre}» en el pañol (hay ${Number(rep.stock)} y se necesitan ${Number(renglon.cantidad)}). Recibí primero la Orden de Compra o ajustá el stock.`,
          );
        }
        const nuevoStock = Math.round((Number(rep.stock) - Number(renglon.cantidad)) * 100) / 100;
        await em.update(RepuestoAuto, { id: rep.id }, { stock: nuevoStock });
      }

      await em.update(OrdenAlistajeRepuesto, { id: renglon.id }, { ingresado: true, consumido: true });
      await em.update(OrdenAlistaje, { id: o.id }, {
        bitacora: [
          ...(o.bitacora ?? []),
          {
            fecha: new Date().toISOString(),
            texto: `Insumo / repuesto consumido en la orden: «${renglon.nombre}» ×${Number(renglon.cantidad)} (descontado del stock).`,
            autor: user.nombre ?? null,
          },
        ],
      });
      return this.obtenerOrden(o.id, em);
    });
  }

  async quitarRepuestoDeOrden(id: string, renglonId: string, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const o = await this.ordenAbierta(em, id);
      const renglon = await em.findOne(OrdenAlistajeRepuesto, { where: { id: renglonId, ordenId: o.id } });
      if (!renglon) throw new NotFoundException('Ese repuesto no pertenece a esta orden.');
      // Sólo se devuelve al stock si ya había sido consumido/descontado
      if (renglon.repuestoId && renglon.consumido) {
        const rep = await em.findOne(RepuestoAuto, {
          where: { id: renglon.repuestoId },
          lock: { mode: 'pessimistic_write' },
        });
        if (rep) {
          const devuelto = Math.round((Number(rep.stock) + Number(renglon.cantidad)) * 100) / 100;
          await em.update(RepuestoAuto, { id: rep.id }, { stock: devuelto });
        }
      }
      await em.delete(OrdenAlistajeRepuesto, { id: renglon.id });
      await em.update(OrdenAlistaje, { id: o.id }, {
        bitacora: [
          ...(o.bitacora ?? []),
          {
            fecha: new Date().toISOString(),
            texto: `Se quitó el repuesto «${renglon.nombre}» ×${Number(renglon.cantidad)}${renglon.repuestoId && renglon.consumido ? ' (devuelto al pañol)' : ''}.`,
            autor: user.nombre ?? null,
          },
        ],
      });
      return this.obtenerOrden(o.id, em);
    });
  }

  async cambiarEstadoOrden(id: string, dto: CambiarEstadoOrdenAlistajeDto, user: User): Promise<VistaOrdenAlistaje> {
    return this.dataSource.transaction(async (em) => {
      const o = await this.ordenAbierta(em, id);
      if (!puedeMoverOrdenA(o.estado, dto.estado)) {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', `La orden ${o.numero} está en «${o.estado}» y no puede pasar a «${dto.estado}».`);
      }
      const repuestos = await em.find(OrdenAlistajeRepuesto, { where: { ordenId: o.id } });
      const u = o.unidadId ? await em.findOne(Unidad, { where: { id: o.unidadId } }) : null;

      const tc = dto.tipo_cambio ?? (o.tipo_cambio ? Number(o.tipo_cambio) : null);
      const totales = calcularTotalesOrden(o.moneda, o.costo_mano_obra, tc, repuestos);

      let gastoUnidadId = o.gastoUnidadId;
      // Si se anula, devolvemos al stock sólo los repuestos del pañol que ya habían sido consumidos
      if (dto.estado === 'anulada') {
        for (const r of repuestos) {
          if (r.repuestoId && r.consumido) {
            const rep = await em.findOne(RepuestoAuto, { where: { id: r.repuestoId }, lock: { mode: 'pessimistic_write' } });
            if (rep) {
              await em.update(RepuestoAuto, { id: rep.id }, { stock: Math.round((Number(rep.stock) + Number(r.cantidad)) * 100) / 100 });
            }
          }
        }
      }

      // Si se pasa a «lista», consumimos automáticamente cualquier repuesto que haya quedado "En pañol" sin tildar
      if (dto.estado === 'lista') {
        for (const r of repuestos) {
          if (!r.consumido && r.repuestoId) {
            const rep = await em.findOne(RepuestoAuto, { where: { id: r.repuestoId }, lock: { mode: 'pessimistic_write' } });
            if (rep && Number(rep.stock) >= Number(r.cantidad)) {
              await em.update(RepuestoAuto, { id: rep.id }, { stock: Math.round((Number(rep.stock) - Number(r.cantidad)) * 100) / 100 });
              await em.update(OrdenAlistajeRepuesto, { id: r.id }, { ingresado: true, consumido: true });
            }
          }
        }
      }

      // Si es una unidad del stock y se cierra como «lista», imputamos automáticamente el costo total
      // como un UnidadGasto en la ficha del vehículo. Si es de un cliente externo, no toca el stock.
      if (u && dto.estado === 'lista' && totales.total_orden > 0 && !gastoUnidadId) {
        if (o.moneda !== u.moneda && !(tc && tc > 0)) {
          throw new ErrorDeNegocio(
            'DATOS_INVALIDOS',
            `La orden está en ${o.moneda} y la unidad ${u.numero} está en ${u.moneda}: indicá el tipo de cambio del dólar para imputar el gasto al costo del auto.`,
          );
        }
        const detalleRep = repuestos.length
          ? ` (${repuestos.map((r) => `${r.nombre} ×${Number(r.cantidad)}`).join(', ')})`
          : '';
        const descripcionGasto = `Orden de Taller ${o.numero} · ${o.sector}: ${o.trabajo_realizado || o.falla_motivo}${detalleRep}`.slice(0, 200);
        const gasto = await em.save(
          UnidadGasto,
          em.create(UnidadGasto, {
            unidadId: u.id,
            descripcion: descripcionGasto,
            monto: totales.total_orden,
            moneda: o.moneda,
            tipo_cambio: o.moneda === u.moneda ? null : tc,
            autorId: user.id,
          }),
        );
        gastoUnidadId = gasto.id;
      }

      if (u && dto.estado === 'lista' && dto.pasar_unidad_a_disponible && ['ingreso', 'alistaje'].includes(u.estado)) {
        await em.update(Unidad, { id: u.id }, { estado: 'disponible', ubicacion: 'En salón' });
      } else if (u && ['diagnostico', 'en_trabajo', 'control_calidad'].includes(dto.estado) && u.estado === 'ingreso') {
        await em.update(Unidad, { id: u.id }, { estado: 'alistaje' });
      }

      const notaExtra = limpio(dto.nota) ? ` · ${limpio(dto.nota)}` : '';
      const bitacora = [
        ...(o.bitacora ?? []),
        {
          fecha: new Date().toISOString(),
          texto: `Pasó a etapa «${dto.estado.toUpperCase()}»${notaExtra}${dto.estado === 'lista' && u && gastoUnidadId ? ` · Gasto imputado a ${u.numero}` : ''}.`,
          autor: user.nombre ?? null,
        },
      ];

      await em.update(OrdenAlistaje, { id: o.id }, {
        estado: dto.estado,
        ...(tc ? { tipo_cambio: tc } : {}),
        ...(gastoUnidadId ? { gastoUnidadId } : {}),
        ...(dto.estado === 'lista' ? { finalizada_at: new Date() } : {}),
        bitacora,
      });

      return this.obtenerOrden(o.id, em);
    });
  }

  async subirFotosOrden(
    id: string,
    archivos: Buffer[],
    notaRaw: string | undefined,
    etapaRaw: string | undefined,
    user: User,
  ): Promise<VistaOrdenAlistaje> {
    if (!archivos.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Elegí al menos una foto para subir.');
    const em = this.dataSource.manager;
    const o = await em.findOne(OrdenAlistaje, { where: { id } });
    if (!o) throw new NotFoundException('No encontramos esa Orden de Alistaje.');
    const actuales = o.fotos ?? [];
    const lugar = Math.max(0, 20 - actuales.length);
    if (lugar <= 0) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Una Orden de Alistaje admite hasta 20 fotos.');
    const comprimidas = await Promise.all(archivos.slice(0, lugar).map((a) => comprimirFoto(a)));
    const nota = limpio(notaRaw)?.slice(0, 300) ?? null;
    const etapa = limpio(etapaRaw)?.slice(0, 40) ?? o.estado;
    const nuevas: FotoOrdenAlistaje[] = [];
    for (const f of comprimidas) {
      const u = await this.almacen.guardarEn(`taller/${o.id}`, f);
      nuevas.push({
        id: randomUUID(),
        url: u.url,
        url_miniatura: u.url_miniatura,
        etapa,
        nota,
        autor: user.nombre ?? null,
        fecha: new Date().toISOString(),
      });
    }
    await em.update(OrdenAlistaje, { id: o.id }, {
      fotos: [...actuales, ...nuevas],
      bitacora: [
        ...(o.bitacora ?? []),
        { fecha: new Date().toISOString(), texto: `Se subieron ${nuevas.length} foto(s) en etapa «${etapa}».`, autor: user.nombre ?? null },
      ],
    });
    return this.obtenerOrden(o.id);
  }

  async borrarFotoOrden(id: string, fotoId: string): Promise<VistaOrdenAlistaje> {
    const em = this.dataSource.manager;
    const o = await em.findOne(OrdenAlistaje, { where: { id } });
    if (!o) throw new NotFoundException('No encontramos esa Orden de Alistaje.');
    const actuales = o.fotos ?? [];
    const elegida = actuales.find((f) => f.id === fotoId);
    if (!elegida) throw new NotFoundException('Esa foto no pertenece a esta orden.');
    await em.update(OrdenAlistaje, { id: o.id }, { fotos: actuales.filter((f) => f.id !== fotoId) });
    await this.almacen.borrar([elegida.url, elegida.url_miniatura]).catch(() => undefined);
    return this.obtenerOrden(o.id);
  }

  // ─── Órdenes de Compra de Repuestos (OC-2026-XXXX) ─────────────────────────

  async listarCompras(ordenId?: string, estado?: string): Promise<VistaOrdenCompraTaller[]> {
    const em = this.dataSource.manager;
    const compras = await em.find(OrdenCompraTaller, {
      where: {
        ...(ordenId ? { ordenId } : {}),
        ...(estado && ['pendiente', 'recibida', 'cancelada'].includes(estado) ? { estado: estado as EstadoOrdenCompraTaller } : {}),
      },
      order: { created_at: 'DESC' },
      take: 300,
    });
    return this.vistasCompras(em, compras);
  }

  async crearCompra(dto: CrearOrdenCompraTallerDto, user: User): Promise<VistaOrdenCompraTaller> {
    if (!dto.items?.length) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Agregá al menos un repuesto o insumo a la Orden de Compra.');
    }
    return this.dataSource.transaction(async (em) => {
      let orden: OrdenAlistaje | null = null;
      if (dto.orden_id) {
        orden = await em.findOne(OrdenAlistaje, { where: { id: dto.orden_id } });
        if (!orden) throw new NotFoundException('No encontramos la Orden de Taller a la que querés atar la compra.');
      }

      const numero = await this.generarNumeroCompra(em, user.companyId);
      const items: ItemOrdenCompraTaller[] = dto.items.map((it) => ({
        id: randomUUID(),
        repuesto_id: it.repuesto_id ?? null,
        renglon_orden_id: it.renglon_orden_id ?? null,
        codigo: limpio(it.codigo)?.toUpperCase() ?? null,
        nombre: it.nombre.trim(),
        cantidad_pedida: Number(it.cantidad_pedida),
        cantidad_recibida: 0,
        costo_unitario: Number(it.costo_unitario),
      }));
      const montoTotal = Math.round(items.reduce((acc, it) => acc + it.cantidad_pedida * it.costo_unitario, 0) * 100) / 100;

      const creada = await em.save(
        OrdenCompraTaller,
        em.create(OrdenCompraTaller, {
          numero,
          ordenId: orden?.id ?? null,
          proveedor: dto.proveedor.trim(),
          numero_remito: limpio(dto.numero_remito),
          estado: 'pendiente',
          moneda: dto.moneda ?? orden?.moneda ?? 'ARS',
          monto_total: montoTotal,
          items,
          notas: limpio(dto.notas),
          autorId: user.id,
          companyId: user.companyId,
        }),
      );

      // Vincular los renglones de la orden de taller a esta OC
      if (orden) {
        for (const it of items) {
          if (it.renglon_orden_id) {
            await em.update(OrdenAlistajeRepuesto, { id: it.renglon_orden_id, ordenId: orden.id }, { compraId: creada.id });
          }
        }
        await em.update(OrdenAlistaje, { id: orden.id }, {
          bitacora: [
            ...(orden.bitacora ?? []),
            {
              fecha: new Date().toISOString(),
              texto: `Se emitió la Orden de Compra ${creada.numero} a «${creada.proveedor}» por ${items.length} ítem(s).`,
              autor: user.nombre ?? null,
            },
          ],
        });
      }

      return (await this.vistasCompras(em, [creada]))[0];
    });
  }

  /**
   * Recibe una Orden de Compra (OC):
   * 1. Ingresa los repuestos al stock del pañol (`RepuestoAuto.stock += cantidad`),
   * 2. Si está atada a una Orden de Taller (`ordenId`), marca sus renglones como `ingresado = true`
   *    y, si `consumir_en_orden !== false`, los consume inmediatamente en la orden descontando ese stock.
   */
  async recibirCompra(id: string, dto: RecibirOrdenCompraTallerDto, user: User): Promise<VistaOrdenCompraTaller> {
    return this.dataSource.transaction(async (em) => {
      const oc = await em.findOne(OrdenCompraTaller, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!oc) throw new NotFoundException('No encontramos esa Orden de Compra.');
      if (oc.estado !== 'pendiente') {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', `La Orden de Compra ${oc.numero} ya está ${oc.estado}.`);
      }

      const consumirDirecto = dto.consumir_en_orden !== false && !!oc.ordenId;
      const itemsActualizados: ItemOrdenCompraTaller[] = [];

      for (const it of oc.items ?? []) {
        const cant = Number(it.cantidad_pedida);
        let repId = it.repuesto_id;

        if (repId) {
          const rep = await em.findOne(RepuestoAuto, { where: { id: repId }, lock: { mode: 'pessimistic_write' } });
          if (rep) {
            // Sube el stock por la compra recibida
            const stockConIngreso = Math.round((Number(rep.stock) + cant) * 100) / 100;
            await em.update(RepuestoAuto, { id: rep.id }, {
              stock: stockConIngreso,
              ...(it.costo_unitario > 0 ? { costo: it.costo_unitario } : {}),
            });
          }
        } else {
          // Si no existía en el pañol, lo creamos automáticamente en el catálogo del pañol con ese stock
          const nuevoRep = await em.save(
            RepuestoAuto,
            em.create(RepuestoAuto, {
              codigo: it.codigo,
              nombre: it.nombre,
              categoria: 'otro',
              unidad_medida: 'un',
              stock: cant,
              stock_minimo: 1,
              moneda: oc.moneda,
              costo: it.costo_unitario,
              proveedor: oc.proveedor,
              activo: true,
              companyId: user.companyId,
            }),
          );
          repId = nuevoRep.id;
        }

        // Si había un renglón en la Orden de Taller vinculado
        if (oc.ordenId) {
          const renglon = it.renglon_orden_id
            ? await em.findOne(OrdenAlistajeRepuesto, { where: { id: it.renglon_orden_id, ordenId: oc.ordenId } })
            : await em.findOne(OrdenAlistajeRepuesto, { where: { ordenId: oc.ordenId, compraId: oc.id, nombre: it.nombre } });

          if (renglon) {
            if (consumirDirecto && !renglon.consumido) {
              // Lo descontamos del pañol porque se consume en la orden
              if (repId) {
                const rep = await em.findOne(RepuestoAuto, { where: { id: repId }, lock: { mode: 'pessimistic_write' } });
                if (rep && Number(rep.stock) >= Number(renglon.cantidad)) {
                  await em.update(RepuestoAuto, { id: rep.id }, {
                    stock: Math.round((Number(rep.stock) - Number(renglon.cantidad)) * 100) / 100,
                  });
                }
              }
              await em.update(OrdenAlistajeRepuesto, { id: renglon.id }, {
                repuestoId: repId,
                ingresado: true,
                consumido: true,
                costo_unitario: it.costo_unitario > 0 ? it.costo_unitario : renglon.costo_unitario,
              });
            } else {
              await em.update(OrdenAlistajeRepuesto, { id: renglon.id }, {
                repuestoId: repId,
                ingresado: true,
                costo_unitario: it.costo_unitario > 0 ? it.costo_unitario : renglon.costo_unitario,
              });
            }
          }
        }

        itemsActualizados.push({
          ...it,
          repuesto_id: repId,
          cantidad_recibida: cant,
        });
      }

      await em.update(OrdenCompraTaller, { id: oc.id }, {
        estado: 'recibida',
        recibida_at: new Date(),
        ...(dto.numero_remito ? { numero_remito: limpio(dto.numero_remito) } : {}),
        items: itemsActualizados,
      });

      if (oc.ordenId) {
        const orden = await em.findOne(OrdenAlistaje, { where: { id: oc.ordenId } });
        if (orden) {
          await em.update(OrdenAlistaje, { id: orden.id }, {
            bitacora: [
              ...(orden.bitacora ?? []),
              {
                fecha: new Date().toISOString(),
                texto: `Llegó la Orden de Compra ${oc.numero} (${oc.proveedor})${consumirDirecto ? ': repuestos ingresados y consumidos en la orden' : ': repuestos disponibles en pañol'}.`,
                autor: user.nombre ?? null,
              },
            ],
          });
        }
      }

      const actualizada = await em.findOneOrFail(OrdenCompraTaller, { where: { id: oc.id } });
      return (await this.vistasCompras(em, [actualizada]))[0];
    });
  }

  async cancelarCompra(id: string, user: User): Promise<VistaOrdenCompraTaller> {
    return this.dataSource.transaction(async (em) => {
      const oc = await em.findOne(OrdenCompraTaller, { where: { id } });
      if (!oc) throw new NotFoundException('No encontramos esa Orden de Compra.');
      if (oc.estado !== 'pendiente') {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', `La Orden de Compra ${oc.numero} ya está ${oc.estado}.`);
      }
      await em.update(OrdenCompraTaller, { id: oc.id }, { estado: 'cancelada' });
      if (oc.ordenId) {
        await em.update(OrdenAlistajeRepuesto, { ordenId: oc.ordenId, compraId: oc.id }, { compraId: null });
        const orden = await em.findOne(OrdenAlistaje, { where: { id: oc.ordenId } });
        if (orden) {
          await em.update(OrdenAlistaje, { id: orden.id }, {
            bitacora: [
              ...(orden.bitacora ?? []),
              { fecha: new Date().toISOString(), texto: `Se canceló la Orden de Compra ${oc.numero}.`, autor: user.nombre ?? null },
            ],
          });
        }
      }
      const act = await em.findOneOrFail(OrdenCompraTaller, { where: { id: oc.id } });
      return (await this.vistasCompras(em, [act]))[0];
    });
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private vistaRepuesto(r: RepuestoAuto): VistaRepuestoAuto {
    const stock = Number(r.stock);
    const min = Number(r.stock_minimo);
    const fotos = r.fotos ?? [];
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      categoria: r.categoria,
      marca: r.marca,
      compatibilidad: r.compatibilidad,
      ubicacion: r.ubicacion,
      unidad_medida: r.unidad_medida,
      stock,
      stock_minimo: min,
      bajo_stock: stock <= min,
      moneda: r.moneda,
      costo: Number(r.costo),
      proveedor: r.proveedor,
      portada: fotos[0]?.url_miniatura ?? fotos[0]?.url ?? null,
      fotos,
      updated_at: r.updated_at,
    };
  }

  private async generarNumeroCompra(em: EntityManager, companyId?: string): Promise<string> {
    const prefix = `OC-${hoyAr().slice(0, 4)}-`;
    await bloquearNumeracion(em, `numero_orden_compra_taller:${companyId ?? 'sin-empresa'}:${prefix}`);
    const qb = em.getRepository(OrdenCompraTaller).createQueryBuilder('oc').where('oc.numero LIKE :prefix', { prefix: `${prefix}%` });
    if (companyId) qb.andWhere('oc.company_id = :companyId', { companyId });
    const ultimo = await ordenarPorCorrelativo(qb, 'oc.numero').getOne();
    return siguienteCorrelativo(prefix, ultimo?.numero);
  }

  private async vistasCompras(em: EntityManager, compras: OrdenCompraTaller[]): Promise<VistaOrdenCompraTaller[]> {
    if (!compras.length) return [];
    const idsOrden = [...new Set(compras.map((c) => c.ordenId).filter((id): id is string => !!id))];
    const ordenes = idsOrden.length ? await em.find(OrdenAlistaje, { where: { id: In(idsOrden) } }) : [];
    const idsUnidad = [...new Set(ordenes.map((o) => o.unidadId).filter((id): id is string => !!id))];
    const unidades = idsUnidad.length ? await em.find(Unidad, { where: { id: In(idsUnidad) } }) : [];
    const mapaO = new Map(ordenes.map((o) => [o.id, o]));
    const mapaU = new Map(unidades.map((u) => [u.id, u]));

    return compras.map((c) => {
      const o = c.ordenId ? mapaO.get(c.ordenId) : undefined;
      const u = o?.unidadId ? mapaU.get(o.unidadId) : undefined;
      const ve = o?.vehiculo_externo;
      const unidadTitulo = u
        ? `${tituloDe(u)} (${u.numero})`
        : ve
          ? `${ve.marca} ${ve.modelo} (${o?.cliente_externo?.nombre ?? 'Cliente'})`
          : null;
      return {
        id: c.id,
        numero: c.numero,
        orden_id: c.ordenId,
        orden_numero: o?.numero ?? null,
        unidad_titulo: unidadTitulo,
        proveedor: c.proveedor,
        numero_remito: c.numero_remito,
        estado: c.estado,
        moneda: c.moneda,
        monto_total: Number(c.monto_total),
        items: c.items ?? [],
        notas: c.notas,
        created_at: c.created_at,
        recibida_at: c.recibida_at,
      };
    });
  }

  private async ordenAbierta(em: EntityManager, id: string): Promise<OrdenAlistaje> {
    const o = await em.findOne(OrdenAlistaje, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!o) throw new NotFoundException('No encontramos esa Orden de Alistaje.');
    if (o.estado === 'lista' || o.estado === 'anulada') {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', `La orden ${o.numero} ya está ${o.estado}: no admite modificaciones.`);
    }
    return o;
  }

  private async generarNumeroOrden(em: EntityManager, companyId?: string): Promise<string> {
    const prefix = `OA-${hoyAr().slice(0, 4)}-`;
    await bloquearNumeracion(em, `numero_orden_alistaje:${companyId ?? 'sin-empresa'}:${prefix}`);
    const qb = em.getRepository(OrdenAlistaje).createQueryBuilder('o').where('o.numero LIKE :prefix', { prefix: `${prefix}%` });
    if (companyId) qb.andWhere('o.company_id = :companyId', { companyId });
    const ultimo = await ordenarPorCorrelativo(qb, 'o.numero').getOne();
    return siguienteCorrelativo(prefix, ultimo?.numero);
  }

  private async vistasOrdenes(em: EntityManager, ordenes: OrdenAlistaje[]): Promise<VistaOrdenAlistaje[]> {
    if (!ordenes.length) return [];
    const idsOrden = ordenes.map((o) => o.id);
    const idsUnidad = [...new Set(ordenes.map((o) => o.unidadId).filter((id): id is string => !!id))];
    const idsRepuesto = [
      ...new Set(
        ordenes.flatMap((o) => (o.repuestos ?? []).map((r) => r.repuestoId)).filter((id): id is string => !!id),
      ),
    ];
    const [unidades, repuestosCat, compras] = await Promise.all([
      idsUnidad.length ? em.find(Unidad, { where: { id: In(idsUnidad) } }) : [],
      idsRepuesto.length ? em.find(RepuestoAuto, { where: { id: In(idsRepuesto) } }) : [],
      em.find(OrdenCompraTaller, { where: { ordenId: In(idsOrden) }, order: { created_at: 'DESC' } }),
    ]);
    const mapaU = new Map(unidades.map((u) => [u.id, u]));
    const mapaRep = new Map(repuestosCat.map((r) => [r.id, r]));
    const vistasOc = await this.vistasCompras(em, compras);
    const mapaOc = new Map(vistasOc.map((c) => [c.id, c]));

    return ordenes.map((o) => {
      const u = o.unidadId ? mapaU.get(o.unidadId) : undefined;
      const ve = o.vehiculo_externo;
      const esCliente = o.tipo_origen === 'cliente' || (!u && !!ve);
      const reps = [...(o.repuestos ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const totales = calcularTotalesOrden(o.moneda, o.costo_mano_obra, o.tipo_cambio, reps);
      const cl = o.checklist?.length ? o.checklist : checklistInicial();
      const tituloExterno = ve ? [ve.marca, ve.modelo, ve.version].filter(Boolean).join(' ') : 'Vehículo de cliente';
      const comprasDeEstaOrden = vistasOc.filter((c) => c.orden_id === o.id);
      return {
        id: o.id,
        numero: o.numero,
        tipo_origen: esCliente ? 'cliente' : 'stock',
        estado: o.estado,
        prioridad: o.prioridad,
        sector: o.sector,
        responsable: o.responsable,
        cliente: o.cliente_externo ?? null,
        unidad: {
          id: o.unidadId ?? null,
          numero: u?.numero ?? 'CLIENTE',
          titulo: u ? tituloDe(u) : tituloExterno,
          dominio: u ? u.dominio : (ve?.dominio ?? null),
          anio: u ? u.anio : (ve?.anio ?? 0),
          km: u ? u.km : (ve?.km ?? 0),
          color: u ? u.color : (ve?.color ?? null),
          moneda: u?.moneda ?? o.moneda,
          estado: u?.estado ?? 'cliente_externo',
        },
        falla_motivo: o.falla_motivo,
        diagnostico: o.diagnostico,
        trabajo_realizado: o.trabajo_realizado,
        km_ingreso: o.km_ingreso,
        moneda: o.moneda,
        costo_mano_obra: totales.mano_obra,
        tipo_cambio: o.tipo_cambio === null ? null : Number(o.tipo_cambio),
        total_repuestos: totales.total_repuestos,
        total_orden: totales.total_orden,
        gasto_imputado: !!o.gastoUnidadId,
        checklist: cl,
        checklist_progreso: {
          total: cl.length,
          ok: cl.filter((i) => i.estado === 'ok').length,
          reparar: cl.filter((i) => i.estado === 'reparar').length,
          pendiente: cl.filter((i) => i.estado === 'pendiente').length,
        },
        repuestos: reps.map((r) => {
          const cant = Number(r.cantidad);
          const cu = Number(r.costo_unitario);
          const cat = r.repuestoId ? mapaRep.get(r.repuestoId) : undefined;
          const oc = r.compraId ? mapaOc.get(r.compraId) : undefined;
          return {
            id: r.id,
            repuesto_id: r.repuestoId,
            codigo: r.codigo,
            nombre: r.nombre,
            portada: cat?.fotos?.[0]?.url_miniatura ?? cat?.fotos?.[0]?.url ?? null,
            cantidad: cant,
            stock_actual: cat ? Number(cat.stock) : null,
            moneda: r.moneda,
            costo_unitario: cu,
            subtotal: Math.round(cant * cu * 100) / 100,
            ingresado: r.ingresado ?? true,
            consumido: r.consumido ?? true,
            compra_id: r.compraId ?? null,
            compra_numero: oc?.numero ?? null,
            compra_estado: oc?.estado ?? null,
          };
        }),
        compras: comprasDeEstaOrden,
        fotos: o.fotos ?? [],
        bitacora: o.bitacora ?? [],
        created_at: o.created_at,
        finalizada_at: o.finalizada_at,
      };
    });
  }
}
