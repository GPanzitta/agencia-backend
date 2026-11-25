import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { bloquearNumeracion, ordenarPorCorrelativo, siguienteCorrelativo } from '../common/numeracion.util';
import { FotosAlmacen } from '../orden-fotos/fotos.almacen';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { OrigenMovimiento, SignoMovimiento } from '../wallets/entities/wallet-movement.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { OperacionPago } from './entities/operacion-pago.entity';
import { EstadoOperacion, FotoDeOperacion, Operacion } from './entities/operacion.entity';
import { Unidad } from './entities/unidad.entity';
import { AnularDto, CerrarDto, ComisionDto, ListarOperacionesDto, PagoDto, PeriodoDto, ReservarDto } from './dto/operaciones.dtos';
import { PorMoneda, comisionSugerida, resumenPorVendedor } from './comisiones.util';
import { AccionOperacion, cuenta, problemaDelPago, puede, reservaVencida } from './operaciones.util';
import { bloqueantesPendientes } from './papeles.util';
import { EN_STOCK, convertir } from './unidades.util';
import { UnidadesService } from './unidades.service';
import { hoyAr, tituloDe } from './unidades.vista';

export interface VistaOperacion {
  id: string;
  numero: string;
  estado: EstadoOperacion;
  unidad: { id: string; numero: string; titulo: string; dominio: string | null; anio: number };
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_documento: string | null;
  precio: number;
  moneda: 'ARS' | 'USD';
  pagos: {
    id: string; medio: string; monto: number; moneda: string; tipo_cambio: number | null;
    /** El pago llevado a la moneda de la operación. */
    equivalente: number;
    billetera: string | null;
    toma: { id: string; numero: string; titulo: string } | null;
    detalle: string | null; fecha: Date;
  }[];
  pagado: number;
  saldo: number;
  saldada: boolean;
  reserva_vence: string | null;
  vencida: boolean;
  vendedor: { id: string; nombre: string } | null;
  comision: number | null;
  /** Lo que le tocaría al vendedor con su porcentaje; `null` si no tiene uno cargado. */
  comision_sugerida: number | null;
  comision_pagada_at: Date | null;
  /** Los papeles de la unidad que hoy impiden cerrar la venta. */
  bloqueantes: string[];
  /** Fotos y comprobantes almacenados en esta Orden de Venta (OV). */
  fotos: FotoDeOperacion[];
  notas: string | null;
  anulada_motivo: string | null;
  created_at: Date;
  cerrada_at: Date | null;
  acciones: Record<AccionOperacion, boolean>;
}

export interface VistaComisiones {
  desde: string;
  hasta: string;
  vendedores: {
    id: string | null; nombre: string; pct: number | null;
    ventas: number; vendido: PorMoneda; comision: PorMoneda; pendiente: PorMoneda;
    operaciones: { id: string; numero: string; unidad_id: string; unidad: string; cliente: string; cerrada_at: Date | null; precio: number; moneda: 'ARS' | 'USD'; comision: number | null; pagada_at: Date | null }[];
  }[];
}

const VISTAS: Record<string, EstadoOperacion[] | undefined> = {
  reservas: ['reservada'], vendidas: ['vendida'], anuladas: ['anulada'], todas: undefined,
};
const limpio = (v: string | null | undefined) => (v ?? '').trim() || null;

/**
 * La venta de una unidad (diseño del 12/11/2026): reserva con seña, pagos
 * mixtos en dos monedas, usado en parte de pago que entra solo al stock,
 * cierre sólo con la cuenta saldada y los papeles en regla, y anulación que
 * deshace todo lo que la operación movió.
 */
@Injectable()
export class OperacionesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unidades: UnidadesService,
    private readonly ledger: WalletLedgerService,
    private readonly almacen: FotosAlmacen,
  ) {}

  async listar(dto: ListarOperacionesDto): Promise<VistaOperacion[]> {
    const estados = VISTAS[dto.vista ?? 'reservas'];
    const ops = await this.dataSource.manager.find(Operacion, {
      where: estados ? { estado: In(estados) } : {},
      relations: { pagos: true },
      order: { created_at: 'DESC' },
      take: 300,
    });
    return this.vistas(this.dataSource.manager, ops);
  }

  async obtener(id: string, em: EntityManager = this.dataSource.manager): Promise<VistaOperacion> {
    const o = await em.findOne(Operacion, { where: { id }, relations: { pagos: true } });
    if (!o) throw new NotFoundException('No encontramos esa operación.');
    return (await this.vistas(em, [o]))[0];
  }

  async reservar(dto: ReservarDto, user: User): Promise<VistaOperacion> {
    return this.dataSource.transaction((em) => this.reservarEn(em, dto, user));
  }

  /** La reserva dentro de una transacción que ya está abierta (la usa la reserva del sitio). */
  async reservarEn(em: EntityManager, dto: ReservarDto, user: User): Promise<VistaOperacion> {
    {
      const u = await this.unidades.abierta(em, dto.unidad_id);
      if (!EN_STOCK.includes(u.estado)) {
        throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', `La unidad ${u.numero} ya está reservada.`);
      }
      const precio = Number(dto.precio ?? u.precio_venta ?? 0);
      if (!(precio > 0)) throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', 'La unidad no tiene precio: cargalo o decí el precio acordado.');
      const cliente = dto.cliente_nombre.trim();
      if (!cliente) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Decí quién la reserva.');
      if (dto.reserva_vence && dto.reserva_vence < hoyAr()) {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', 'El vencimiento de la reserva ya pasó.');
      }
      const numero = await this.generarNumero(em, user.companyId);
      const op = await em.save(Operacion, em.create(Operacion, {
        numero,
        unidadId: u.id,
        estado: 'reservada',
        cliente_nombre: cliente,
        cliente_telefono: limpio(dto.cliente_telefono),
        cliente_documento: limpio(dto.cliente_documento),
        precio,
        moneda: u.moneda,
        reserva_vence: dto.reserva_vence ?? null,
        vendedorId: dto.vendedor_id ?? user.id,
        notas: limpio(dto.notas),
        autorId: user.id,
        companyId: user.companyId,
      }));
      await em.update(Unidad, { id: u.id }, { estado: 'reservada' });
      if (dto.sena) await this.asentarPago(em, { ...op, pagos: [] }, dto.sena, user);
      return this.obtener(op.id, em);
    }
  }

  async agregarPago(id: string, dto: PagoDto, user: User): Promise<VistaOperacion> {
    return this.dataSource.transaction(async (em) => {
      const op = await this.paraAccion(em, id, 'pagar');
      await this.asentarPago(em, op, dto, user);
      return this.obtener(op.id, em);
    });
  }

  async quitarPago(id: string, pagoId: string, user: User): Promise<VistaOperacion> {
    return this.dataSource.transaction(async (em) => {
      const op = await this.paraAccion(em, id, 'pagar');
      const pago = (op.pagos ?? []).find((p) => p.id === pagoId);
      if (!pago) throw new NotFoundException('Ese pago no es de esta operación.');
      await this.revertirPago(em, op, pago, user);
      await em.delete(OperacionPago, { id: pago.id });
      return this.obtener(op.id, em);
    });
  }

  /** Cierra la venta: la cuenta tiene que estar saldada y los papeles que frenan la transferencia, en regla. */
  async cerrar(id: string, dto: CerrarDto): Promise<VistaOperacion> {
    return this.dataSource.transaction(async (em) => {
      const op = await this.paraAccion(em, id, 'cerrar');
      const c = cuenta(op.precio, op.moneda, op.pagos ?? []);
      if (!c.saldada) {
        throw new ErrorDeNegocio('SALDO_PENDIENTE', `Faltan cobrar ${c.saldo.toFixed(2)} ${op.moneda}: la venta no se cierra con saldo pendiente.`, { saldo: c.saldo });
      }
      const u = await em.findOne(Unidad, { where: { id: op.unidadId }, lock: { mode: 'pessimistic_write' } });
      if (!u) throw new NotFoundException('No encontramos la unidad de la operación.');
      const faltan = bloqueantesPendientes(u, hoyAr());
      if (faltan.length) {
        throw new ErrorDeNegocio('PAPELES_BLOQUEANTES', `No se puede entregar: falta ${faltan.join(', ')}.`, { faltan });
      }
      // Sin comisión cargada a mano, vale el porcentaje del vendedor.
      const vendedor = op.vendedorId ? await em.findOne(User, { where: { id: op.vendedorId }, select: { id: true, comision_pct: true } }) : null;
      const comision = dto.comision ?? op.comision ?? comisionSugerida(op.precio, vendedor?.comision_pct);
      await em.update(Operacion, { id: op.id }, { estado: 'vendida', cerrada_at: new Date(), comision: comision ?? null });
      await em.update(Unidad, { id: u.id }, { estado: 'vendida', fecha_venta: hoyAr(), publicada: false });
      return this.obtener(op.id, em);
    });
  }

  /** Cae la reserva: se deshacen los cobros y la toma, y la unidad vuelve a estar disponible. */
  async anular(id: string, dto: AnularDto, user: User): Promise<VistaOperacion> {
    return this.dataSource.transaction(async (em) => {
      const op = await this.paraAccion(em, id, 'anular');
      const motivo = dto.motivo.trim();
      if (!motivo) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Decí por qué se cae la operación.');
      for (const pago of op.pagos ?? []) await this.revertirPago(em, op, pago, user);
      await em.update(Operacion, { id: op.id }, { estado: 'anulada', anulada_at: new Date(), anulada_motivo: motivo });
      await em.update(Unidad, { id: op.unidadId, estado: 'reservada' }, { estado: 'disponible' });
      return this.obtener(op.id, em);
    });
  }

  /** Sube fotos / comprobantes directamente a la Orden de Venta (OV), igual que las fotos de una OS en Taller. */
  async subirFotos(
    id: string,
    archivos: Buffer[],
    notaRaw: string | undefined,
    etapaRaw: string | undefined,
    user: User,
  ): Promise<VistaOperacion> {
    if (!archivos.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Elegí al menos una foto para subir a la OV.');
    const em = this.dataSource.manager;
    const op = await em.findOne(Operacion, { where: { id } });
    if (!op) throw new NotFoundException('No encontramos esa operación.');
    const actuales = op.fotos ?? [];
    const lugar = Math.max(0, 20 - actuales.length);
    if (lugar <= 0) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Una Orden de Venta admite hasta 20 fotos: quitá alguna.');
    }
    const comprimidas = await Promise.all(archivos.slice(0, lugar).map((a) => comprimirFoto(a)));
    const nota = limpio(notaRaw)?.slice(0, 300) ?? null;
    const etapa = limpio(etapaRaw)?.slice(0, 40) ?? (op.estado === 'vendida' ? 'entrega' : 'reserva');
    const nuevas: FotoDeOperacion[] = [];
    for (const f of comprimidas) {
      const u = await this.almacen.guardarEn(`operaciones/${op.id}`, f);
      nuevas.push({
        id: randomUUID(),
        url: u.url,
        url_miniatura: u.url_miniatura,
        nota,
        etapa,
        autor: user.nombre ?? null,
        fecha: new Date().toISOString(),
      });
    }
    await em.update(Operacion, { id: op.id }, { fotos: [...actuales, ...nuevas] });
    return this.obtener(op.id);
  }

  async borrarFoto(id: string, fotoId: string): Promise<VistaOperacion> {
    const em = this.dataSource.manager;
    const op = await em.findOne(Operacion, { where: { id } });
    if (!op) throw new NotFoundException('No encontramos esa operación.');
    const actuales = op.fotos ?? [];
    const elegida = actuales.find((f) => f.id === fotoId);
    if (!elegida) throw new NotFoundException('Esa foto no pertenece a esta operación.');
    await em.update(Operacion, { id: op.id }, { fotos: actuales.filter((f) => f.id !== fotoId) });
    await this.almacen.borrar([elegida.url, elegida.url_miniatura]).catch(() => undefined);
    return this.obtener(op.id);
  }

  // ─── Comisiones (13/11/2026) ──────────────────────────────────────────────

  /**
   * Las ventas cerradas de un período, por vendedor. El dueño ve a todos; un
   * vendedor, sólo lo suyo. Sin fechas, el mes en curso.
   */
  async comisiones(dto: PeriodoDto, user: User, soloPropias: boolean): Promise<VistaComisiones> {
    const em = this.dataSource.manager;
    const hoy = hoyAr();
    const desde = dto.desde ?? `${hoy.slice(0, 8)}01`;
    const hasta = dto.hasta ?? hoy;
    const ops = await em.createQueryBuilder(Operacion, 'o')
      .where('o.company_id = :c', { c: user.companyId })
      .andWhere(`o.estado = 'vendida'`)
      .andWhere(`(o.cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN :desde AND :hasta`, { desde, hasta })
      .andWhere(soloPropias ? 'o.vendedor_id = :v' : '1 = 1', { v: user.id })
      .orderBy('o.cerrada_at', 'DESC').take(1000).getMany();
    const personas = await em.find(User, {
      where: soloPropias ? { id: user.id } : { companyId: user.companyId, activo: true },
      select: { id: true, nombre: true, comision_pct: true },
      order: { nombre: 'ASC' },
    });
    const idsUnidad = [...new Set(ops.map((o) => o.unidadId))];
    const unidades = idsUnidad.length ? await em.find(Unidad, { where: { id: In(idsUnidad) } }) : [];
    const u = new Map(unidades.map((x) => [x.id, x]));
    const venta = (o: Operacion, vendedorId: string | null) => ({
      id: o.id, vendedorId, precio: Number(o.precio), moneda: o.moneda,
      comision: o.comision === null ? null : Number(o.comision), pagada: !!o.comision_pagada_at,
    });
    const resumen = resumenPorVendedor(ops.map((o) => venta(o, o.vendedorId)));
    const vacio = () => ({ ventas: 0, vendido: { ARS: 0, USD: 0 }, comision: { ARS: 0, USD: 0 }, pendiente: { ARS: 0, USD: 0 } });
    const fila = (o: Operacion) => {
      const unidad = u.get(o.unidadId);
      return {
        id: o.id, numero: o.numero, unidad_id: o.unidadId,
        unidad: unidad ? `${tituloDe(unidad)} ${unidad.anio}` : '',
        cliente: o.cliente_nombre, cerrada_at: o.cerrada_at, precio: Number(o.precio), moneda: o.moneda,
        comision: o.comision === null ? null : Number(o.comision), pagada_at: o.comision_pagada_at ?? null,
      };
    };
    const vendedores: VistaComisiones['vendedores'] = personas.map((p) => ({
      id: p.id, nombre: p.nombre,
      pct: p.comision_pct === null || p.comision_pct === undefined ? null : Number(p.comision_pct),
      ...(resumen.get(p.id) ?? vacio()),
      operaciones: ops.filter((o) => o.vendedorId === p.id).map(fila),
    }));
    // Ventas de alguien que ya no está activo, o sin vendedor: no se pierden de la cuenta.
    const conocidos = new Set(personas.map((p) => p.id));
    const sueltas = ops.filter((o) => !o.vendedorId || !conocidos.has(o.vendedorId));
    if (sueltas.length && !soloPropias) {
      const r = resumenPorVendedor(sueltas.map((o) => venta(o, null)));
      vendedores.push({ id: null, nombre: 'Sin vendedor', pct: null, ...(r.get('') ?? vacio()), operaciones: sueltas.map(fila) });
    }
    return { desde, hasta, vendedores };
  }

  /** Corrige la comisión de una venta cerrada o la marca como pagada (o vuelve a dejarla pendiente). */
  async ajustarComision(id: string, dto: ComisionDto): Promise<VistaOperacion> {
    const em = this.dataSource.manager;
    const op = await em.findOne(Operacion, { where: { id } });
    if (!op) throw new NotFoundException('No encontramos esa operación.');
    if (op.estado !== 'vendida') throw new ErrorDeNegocio('DATOS_INVALIDOS', 'La comisión se liquida cuando la venta está cerrada.');
    const comision = dto.comision ?? (op.comision === null ? null : Number(op.comision));
    if (dto.pagada && !(Number(comision) > 0)) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Esta venta no tiene comisión cargada: poné el importe antes de marcarla como pagada.');
    if (dto.comision !== undefined && op.comision_pagada_at && dto.pagada !== false) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Esta comisión ya figura como pagada: para cambiar el importe, primero marcala como pendiente.');
    }
    await em.update(Operacion, { id: op.id }, {
      ...(dto.comision !== undefined ? { comision: dto.comision } : {}),
      ...(dto.pagada === true ? { comision_pagada_at: new Date() } : dto.pagada === false ? { comision_pagada_at: null } : {}),
    });
    return this.obtener(op.id);
  }

  /** El porcentaje fijo de un vendedor de esta agencia. */
  async porcentajeDe(vendedorId: string, pct: number | null, user: User): Promise<{ id: string; pct: number | null }> {
    const em = this.dataSource.manager;
    const v = await em.findOne(User, { where: { id: vendedorId, companyId: user.companyId }, select: { id: true } });
    if (!v) throw new NotFoundException('Esa persona no es de esta agencia.');
    await em.update(User, { id: v.id }, { comision_pct: pct && pct > 0 ? pct : null });
    return { id: v.id, pct: pct && pct > 0 ? pct : null };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private async paraAccion(em: EntityManager, id: string, accion: AccionOperacion): Promise<Operacion> {
    const op = await em.findOne(Operacion, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!op) throw new NotFoundException('No encontramos esa operación.');
    if (!puede(accion, op.estado)) {
      throw new ErrorDeNegocio('OPERACION_CERRADA', `La operación ${op.numero} está ${op.estado}: ya no se cambia.`);
    }
    op.pagos = await em.find(OperacionPago, { where: { operacionId: op.id }, order: { created_at: 'ASC' } });
    return op;
  }

  private async asentarPago(em: EntityManager, op: Operacion, dto: PagoDto, user: User): Promise<void> {
    const problema = problemaDelPago(dto, op.precio, op.moneda, op.pagos ?? []);
    if (problema) throw new ErrorDeNegocio('PAGO_INVALIDO', problema);
    const esUsado = dto.medio === 'usado';
    if (esUsado && !dto.toma) throw new ErrorDeNegocio('PAGO_INVALIDO', 'Cargá los datos del auto que se toma en parte de pago.');
    if (!esUsado && dto.toma) throw new ErrorDeNegocio('PAGO_INVALIDO', 'Los datos de un auto van sólo con el medio «usado».');
    if (esUsado && dto.wallet_id) throw new ErrorDeNegocio('PAGO_INVALIDO', 'Un usado en parte de pago no entra a ninguna billetera.');

    if (dto.wallet_id) {
      const caja = await em.findOne(Wallet, { where: { id: dto.wallet_id } });
      if (!caja) throw new NotFoundException('No encontramos esa caja.');
      if (caja.moneda !== dto.moneda) {
        throw new ErrorDeNegocio('PAGO_INVALIDO', `La caja «${caja.name}» es de ${caja.moneda === 'USD' ? 'dólares' : 'pesos'} y el pago está en ${dto.moneda === 'USD' ? 'dólares' : 'pesos'}: elegí una caja de esa moneda.`);
      }
    }

    let tomaId: string | null = null;
    if (esUsado) {
      const toma = await this.unidades.alta(em, {
        auto: dto.toma!,
        origen: 'toma',
        condicion: 'usado',
        moneda: dto.moneda,
        costo_adquisicion: Number(dto.monto),
        titular_nombre: op.cliente_nombre,
        titular_telefono: op.cliente_telefono,
        titular_documento: op.cliente_documento,
        operacionOrigenId: op.id,
        notas: `Tomada en parte de pago en la operación ${op.numero}.`,
      }, user);
      tomaId = toma.id;
    }
    await em.save(OperacionPago, em.create(OperacionPago, {
      operacionId: op.id,
      medio: dto.medio,
      monto: dto.monto,
      moneda: dto.moneda,
      tipo_cambio: dto.moneda === op.moneda ? null : dto.tipo_cambio ?? null,
      walletId: dto.wallet_id ?? null,
      unidadTomaId: tomaId,
      detalle: limpio(dto.detalle),
      autorId: user.id,
    }));
    if (dto.wallet_id) {
      await this.ledger.registrar({
        walletId: dto.wallet_id,
        signo: SignoMovimiento.INGRESO,
        monto: Number(dto.monto),
        origen: OrigenMovimiento.VENTA,
        origen_id: op.id,
        concepto: `Operación ${op.numero} · ${dto.medio} ${dto.moneda} · ${op.cliente_nombre}`.slice(0, 250),
        empleadoId: user.id,
        companyId: user.companyId,
      }, em);
    }
  }

  /** Deshace lo que el pago movió: la plata sale de la billetera y el usado tomado sale del stock. */
  private async revertirPago(em: EntityManager, op: Operacion, pago: OperacionPago, user: User): Promise<void> {
    if (pago.unidadTomaId) {
      const toma = await em.findOne(Unidad, { where: { id: pago.unidadTomaId }, lock: { mode: 'pessimistic_write' } });
      if (toma && (toma.estado === 'reservada' || toma.estado === 'vendida')) {
        throw new ErrorDeNegocio('TOMA_NO_REVERSIBLE', `El usado que se tomó (${toma.numero}) ya está ${toma.estado}: no se puede devolver al cliente.`);
      }
      if (toma && EN_STOCK.includes(toma.estado)) {
        await em.update(Unidad, { id: toma.id }, {
          estado: 'devuelta', publicada: false,
          notas: [toma.notas, `Se deshizo la toma: operación ${op.numero}.`].filter(Boolean).join('\n'),
        });
      }
    }
    if (pago.walletId) {
      await this.ledger.registrar({
        walletId: pago.walletId,
        signo: SignoMovimiento.EGRESO,
        monto: Number(pago.monto),
        origen: OrigenMovimiento.ANULACION_PAGO,
        origen_id: op.id,
        concepto: `Devolución · operación ${op.numero} · ${pago.medio} ${pago.moneda}`.slice(0, 250),
        empleadoId: user.id,
        companyId: user.companyId,
        permitirNegativo: true,
      }, em);
    }
  }

  private async generarNumero(em: EntityManager, companyId?: string): Promise<string> {
    const prefix = `OP-${hoyAr().slice(0, 4)}-`;
    await bloquearNumeracion(em, `numero_operacion:${companyId ?? 'sin-empresa'}:${prefix}`);
    const qb = em.getRepository(Operacion).createQueryBuilder('o').where('o.numero LIKE :prefix', { prefix: `${prefix}%` });
    if (companyId) qb.andWhere('o.company_id = :companyId', { companyId });
    const ultimo = await ordenarPorCorrelativo(qb, 'o.numero').getOne();
    return siguienteCorrelativo(prefix, ultimo?.numero);
  }

  private async vistas(em: EntityManager, ops: Operacion[]): Promise<VistaOperacion[]> {
    const unicos = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))];
    const pagos = ops.flatMap((o) => o.pagos ?? []);
    const idsUnidad = unicos([...ops.map((o) => o.unidadId), ...pagos.map((p) => p.unidadTomaId)]);
    const idsWallet = unicos(pagos.map((p) => p.walletId));
    const idsVendedor = unicos(ops.map((o) => o.vendedorId));
    const [unidades, wallets, vendedores] = await Promise.all([
      idsUnidad.length ? em.find(Unidad, { where: { id: In(idsUnidad) } }) : [],
      idsWallet.length ? em.find(Wallet, { where: { id: In(idsWallet) }, select: { id: true, name: true } }) : [],
      idsVendedor.length ? em.find(User, { where: { id: In(idsVendedor) }, select: { id: true, nombre: true, comision_pct: true } }) : [],
    ]);
    const u = new Map(unidades.map((x) => [x.id, x]));
    const w = new Map(wallets.map((x) => [x.id, x]));
    const v = new Map(vendedores.map((x) => [x.id, x]));
    const hoy = hoyAr();

    return ops.map((o) => {
      const unidad = u.get(o.unidadId);
      const lista = [...(o.pagos ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const c = cuenta(o.precio, o.moneda, lista);
      const vendedor = o.vendedorId ? v.get(o.vendedorId) : undefined;
      const viva = o.estado === 'reservada';
      return {
        id: o.id,
        numero: o.numero,
        estado: o.estado,
        unidad: {
          id: o.unidadId,
          numero: unidad?.numero ?? '',
          titulo: unidad ? tituloDe(unidad) : '',
          dominio: unidad?.dominio ?? null,
          anio: unidad?.anio ?? 0,
        },
        cliente_nombre: o.cliente_nombre,
        cliente_telefono: o.cliente_telefono,
        cliente_documento: o.cliente_documento,
        precio: Number(o.precio),
        moneda: o.moneda,
        pagos: lista.map((p) => {
          const toma = p.unidadTomaId ? u.get(p.unidadTomaId) : undefined;
          return {
            id: p.id,
            medio: p.medio,
            monto: Number(p.monto),
            moneda: p.moneda,
            tipo_cambio: p.tipo_cambio === null ? null : Number(p.tipo_cambio),
            equivalente: convertir(p, o.moneda) ?? 0,
            billetera: p.walletId ? w.get(p.walletId)?.name ?? null : null,
            toma: toma ? { id: toma.id, numero: toma.numero, titulo: tituloDe(toma) } : null,
            detalle: p.detalle,
            fecha: p.created_at,
          };
        }),
        pagado: c.pagado,
        saldo: c.saldo,
        saldada: c.saldada,
        reserva_vence: o.reserva_vence,
        vencida: reservaVencida(o.estado, o.reserva_vence, hoy),
        vendedor: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
        comision: o.comision === null ? null : Number(o.comision),
        comision_sugerida: comisionSugerida(o.precio, vendedor?.comision_pct),
        comision_pagada_at: o.comision_pagada_at ?? null,
        bloqueantes: viva && unidad ? bloqueantesPendientes(unidad, hoy) : [],
        fotos: o.fotos ?? [],
        notas: o.notas,
        anulada_motivo: o.anulada_motivo,
        created_at: o.created_at,
        cerrada_at: o.cerrada_at,
        acciones: { pagar: viva && !c.saldada, cerrar: viva, anular: viva },
      };
    });
  }
}
