import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { PeriodoDto } from '../unidades/dto/operaciones.dtos';
import { Operacion } from '../unidades/entities/operacion.entity';
import { EstadoUnidad, Unidad } from '../unidades/entities/unidad.entity';
import { semaforo } from '../unidades/papeles.util';
import { EN_STOCK, costoTotal, diasEnStock } from '../unidades/unidades.util';
import { hoyAr, tituloDe } from '../unidades/unidades.vista';
import {
  FilaDeStock,
  FilaDeVenta,
  FilaOrigen,
  FilaVendedor,
  ResumenStock,
  ResumenVentas,
  Riesgo,
  Tramo,
  antiguedadDeStock,
  margenDeStock,
  masParados,
  porcentaje,
  porOrigen,
  porVendedor,
  resumenDeStock,
  resumenDeVentas,
  riesgosDe,
} from './margen.util';

/** Un auto parado, con lo que tiene puesto: es la lista de «esto no rota». */
export interface UnidadParada {
  id: string;
  numero: string;
  titulo: string;
  dominio: string | null;
  estado: string;
  moneda: 'ARS' | 'USD';
  dias: number;
  costo: number;
  precio: number | null;
  margen: number | null;
  margen_pct: number | null;
}

/** Todo lo que devuelve el tablero de rentabilidad. */
export interface VistaMargen {
  desde: string;
  hasta: string;
  stock: ResumenStock;
  ventas: ResumenVentas;
  por_origen: FilaOrigen[];
  por_vendedor: FilaVendedor[];
  antiguedad: Tramo[];
  riesgos: Riesgo[];
  mas_parados: UnidadParada[];
}

/**
 * El tablero de rentabilidad (23/11/2026): lo que deja cada auto, lo que se
 * está comiendo el margen y qué capital no rota. Sólo el dueño: son los costos
 * y los márgenes del negocio.
 *
 * No escribe nada y no inventa supuestos: usa el costo real (compra o toma más
 * alistaje), el piso del dueño en consignación, el precio de la reserva como
 * precio esperado y la comisión que quedó cargada en la venta.
 */
@Injectable()
export class MargenService {
  constructor(private readonly dataSource: DataSource) {}

  async tablero(dto: PeriodoDto, companyId: string | null | undefined): Promise<VistaMargen> {
    if (!companyId) throw new ForbiddenException('Este tablero es de una agencia: entrá con un usuario de la agencia.');
    const hoy = hoyAr();
    const desde = dto.desde ?? `${hoy.slice(0, 8)}01`;
    const hasta = dto.hasta ?? hoy;
    if (desde > hasta) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'El período termina antes de empezar.');
    const em = this.dataSource.manager;

    // ── La playa: todo lo que sigue en stock, con su costo y su precio esperado.
    const abiertas: EstadoUnidad[] = [...EN_STOCK, 'reservada'];
    const unidades = await em.find(Unidad, {
      where: { companyId, estado: In(abiertas) },
      relations: { gastos: true },
    });
    const reservas = unidades.length
      ? await em.find(Operacion, {
        where: { unidadId: In(unidades.map((u) => u.id)), estado: 'reservada' },
        select: { id: true, unidadId: true, precio: true },
      })
      : [];
    // Si está reservada, el precio acordado es el que va a entrar: la lista ya no dice nada.
    const comprometido = new Map(reservas.map((o) => [o.unidadId, Number(o.precio)]));

    const enStock: FilaDeStock[] = unidades.map((u) => ({
      id: u.id,
      numero: u.numero,
      titulo: tituloDe(u),
      dominio: u.dominio,
      origen: u.origen,
      estado: u.estado,
      moneda: u.moneda,
      costo: costoTotal(u),
      piso: u.origen === 'consignacion' ? Number(u.precio_piso ?? 0) : 0,
      precio: comprometido.get(u.id) ?? (u.precio_venta === null ? null : Number(u.precio_venta)),
      dias: diasEnStock(u.fecha_ingreso, hoy),
      papeles_en_rojo: semaforo(u, hoy) === 'rojo',
      reservada: u.estado === 'reservada',
    }));

    // ── Las ventas cerradas del período: lo que dejaron de verdad.
    const vendidas = await em.createQueryBuilder(Operacion, 'o')
      .where('o.company_id = :c', { c: companyId })
      .andWhere(`o.estado = 'vendida'`)
      .andWhere(`(o.cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN :desde AND :hasta`, { desde, hasta })
      .orderBy('o.cerrada_at', 'DESC')
      .take(1000)
      .getMany();

    const idsVendidas = [...new Set(vendidas.map((o) => o.unidadId))];
    const cerradas = idsVendidas.length
      ? await em.find(Unidad, { where: { id: In(idsVendidas), companyId }, relations: { gastos: true } })
      : [];
    const porId = new Map(cerradas.map((u) => [u.id, u]));

    const ventas: FilaDeVenta[] = [];
    for (const o of vendidas) {
      const u = porId.get(o.unidadId);
      // Una operación cuyo auto ya no existe no entra en la cuenta: no hay costo contra el cual medirla.
      if (!u) continue;
      ventas.push({
        id: o.id,
        numero: o.numero,
        vendedorId: o.vendedorId,
        moneda: u.moneda,
        precio: Number(o.precio),
        lista: u.precio_venta === null ? null : Number(u.precio_venta),
        costo: costoTotal(u),
        piso: u.origen === 'consignacion' ? Number(u.precio_piso ?? 0) : 0,
        comision: o.comision === null ? 0 : Number(o.comision),
        dias: diasEnStock(u.fecha_ingreso, u.fecha_venta ?? hoy),
        origen: u.origen,
      });
    }

    const personas = await em.find(User, { where: { companyId }, select: { id: true, nombre: true } });
    const nombres = new Map(personas.map((p) => [p.id, p.nombre]));

    return {
      desde,
      hasta,
      stock: resumenDeStock(enStock),
      ventas: resumenDeVentas(ventas),
      por_origen: porOrigen(ventas),
      por_vendedor: porVendedor(ventas, nombres),
      antiguedad: antiguedadDeStock(enStock),
      riesgos: riesgosDe(enStock),
      mas_parados: masParados(enStock).map(parada),
    };
  }
}

function parada(f: FilaDeStock): UnidadParada {
  const margen = margenDeStock(f);
  return {
    id: f.id, numero: f.numero, titulo: f.titulo, dominio: f.dominio, estado: f.estado,
    moneda: f.moneda, dias: f.dias, costo: f.costo, precio: f.precio, margen,
    margen_pct: margen === null || f.precio === null ? null : porcentaje(margen, f.precio),
  };
}
