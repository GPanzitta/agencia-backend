import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, LessThan } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { Company } from '../companies/entities/company.entity';
import { Operacion } from '../unidades/entities/operacion.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { OperacionesService } from '../unidades/operaciones.service';
import { PapelesPublicos, papelesPublicos } from '../unidades/papeles.util';
import { hoyAr, tituloDe } from '../unidades/unidades.vista';
import { InteresadosService } from './interesados.service';
import { ConfirmarReservaDto, PedirReservaDto, RechazarReservaDto } from './reservas-web.dtos';
import { Interesado } from './interesado.entity';
import { EstadoReservaWeb, ReservaWeb } from './reserva-web.entity';
import { estadoVigente, soloDigitos, sumarDias } from './reservas-web.util';

/** Lo que ve el cliente en la página de su reserva. Nunca lleva datos internos. */
export interface ReservaPublica {
  estado: EstadoReservaWeb;
  nombre: string;
  auto: { id: string; titulo: string; anio: number };
  monto: number;
  moneda: 'ARS' | 'USD';
  /** Adónde transferir: sólo mientras está pendiente. */
  alias: string | null;
  titular: string | null;
  vence_at: Date;
  /** Hasta cuándo se le guarda el auto, ya confirmada. AAAA-MM-DD. */
  guardado_hasta: string | null;
  /** Seguimiento postventa de papeles y transferencia en Registro Automotor. */
  papeles: PapelesPublicos | null;
  transferencia: {
    estado: 'falta' | 'en_tramite' | 'ok';
    nota: string | null;
    vendida: boolean;
  } | null;
}

export interface VistaReservaWeb {
  id: string;
  estado: EstadoReservaWeb;
  unidad: { id: string; numero: string; titulo: string; anio: number; moneda: 'ARS' | 'USD'; disponible: boolean };
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_documento: string | null;
  monto: number;
  moneda: 'ARS' | 'USD';
  vence_at: Date;
  dias: number;
  operacion: { id: string; numero: string } | null;
  motivo: string | null;
  created_at: Date;
}

/** Lo que le queda pendiente al vendedor mientras la seña no se confirmó. */
const PENDIENTE_SENA = 'Confirmar la seña de la reserva del sitio';

const formato = (monto: number, moneda: string) => `${moneda === 'USD' ? 'US$' : '$'} ${Number(monto).toLocaleString('es-AR')}`;

/**
 * La reserva desde el sitio (13/11/2026): el cliente pide el auto y transfiere
 * la seña; la agencia confirma cuando la ve acreditada y recién ahí la unidad
 * queda reservada, con su operación y la seña asentada. Un pedido sin pagar no
 * saca el auto de la venta: sólo frena otro pedido por el sitio, y por pocas horas.
 */
@Injectable()
export class ReservasWebService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly operaciones: OperacionesService,
    private readonly interesados: InteresadosService,
  ) {}

  async pedir(dto: PedirReservaDto, companyId: string): Promise<{ token: string | null }> {
    // Un bot completa el campo trampa: se le contesta que sí y no se guarda nada.
    if ((dto.sitio_web ?? '').trim()) return { token: null };
    const pedido = await this.dataSource.transaction(async (em) => {
      const empresa = await em.findOne(Company, { where: { id: companyId }, select: { id: true, sitio_reserva: true } });
      const cfg = empresa?.sitio_reserva;
      if (!cfg) throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', 'Esta agencia no toma reservas desde el sitio: escribinos y lo coordinamos.');
      const u = await em.findOne(Unidad, { where: { id: dto.unidad_id, companyId, publicada: true }, lock: { mode: 'pessimistic_write' } });
      if (!u || u.estado !== 'disponible') throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', 'Este auto ya no está disponible para reservar.');
      // Los pedidos a los que se les pasó el plazo dejan de frenar.
      await em.update(ReservaWeb, { companyId, estado: 'pendiente', vence_at: LessThan(new Date()) }, { estado: 'vencida' });
      const telefono = soloDigitos(dto.telefono);
      const pendientes = await em.find(ReservaWeb, { where: { companyId, estado: 'pendiente' }, take: 500 });
      const delAuto = pendientes.find((p) => p.unidadId === u.id);
      if (delAuto) {
        // Volvió a pedir el mismo auto: se le muestra su pedido, no se abre otro.
        if (soloDigitos(delAuto.cliente_telefono) === telefono) return { reserva: delAuto, nueva: false, u };
        throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', 'Otra persona está reservando este auto en este momento. Si no confirma la seña, vuelve a quedar libre: escribinos y te avisamos.');
      }
      if (pendientes.filter((p) => soloDigitos(p.cliente_telefono) === telefono).length >= 2) {
        throw new ErrorDeNegocio('UNIDAD_NO_RESERVABLE', 'Ya tenés dos reservas esperando la seña: confirmá una antes de pedir otra.');
      }
      const reserva = await em.save(ReservaWeb, em.create(ReservaWeb, {
        unidadId: u.id,
        estado: 'pendiente',
        cliente_nombre: dto.nombre.trim(),
        cliente_telefono: dto.telefono.trim(),
        cliente_documento: (dto.documento ?? '').trim() || null,
        monto: cfg.monto,
        moneda: cfg.moneda,
        vence_at: new Date(Date.now() + cfg.horas * 3600 * 1000),
        dias: cfg.dias,
        companyId,
      }));
      return { reserva: await em.findOneOrFail(ReservaWeb, { where: { id: reserva.id } }), nueva: true, u };
    });
    if (pedido.nueva) {
      // Queda también como interesado, para que el vendedor lo siga.
      await this.interesados.consultaWeb(
        { asunto: 'consulta', nombre: dto.nombre, telefono: dto.telefono, unidad_id: pedido.u.id } as never,
        companyId, [],
        { encabezado: `Pide reservar desde el sitio (seña de ${formato(pedido.reserva.monto, pedido.reserva.moneda)})`, pendiente: PENDIENTE_SENA },
      );
    }
    return { token: pedido.reserva.token };
  }

  async publica(token: string, companyId: string): Promise<ReservaPublica> {
    const em = this.dataSource.manager;
    const r = await em.findOne(ReservaWeb, { where: { token, companyId } });
    if (!r) throw new NotFoundException('No encontramos esa reserva.');
    const [u, empresa, op] = await Promise.all([
      em.findOne(Unidad, { where: { id: r.unidadId } }),
      em.findOne(Company, { where: { id: companyId }, select: { id: true, sitio_reserva: true } }),
      r.operacionId ? em.findOne(Operacion, { where: { id: r.operacionId }, select: { id: true, reserva_vence: true, estado: true } }) : null,
    ]);
    const estado = estadoVigente(r.estado, r.vence_at);
    const pendiente = estado === 'pendiente';
    const hoy = hoyAr();
    const tr = u?.papeles?.transferencia_registro;
    return {
      estado,
      nombre: r.cliente_nombre,
      auto: { id: r.unidadId, titulo: u ? tituloDe(u) : '', anio: u?.anio ?? 0 },
      monto: Number(r.monto),
      moneda: r.moneda,
      alias: pendiente ? empresa?.sitio_reserva?.alias ?? null : null,
      titular: pendiente ? empresa?.sitio_reserva?.titular ?? null : null,
      vence_at: r.vence_at,
      guardado_hasta: estado === 'confirmada' ? op?.reserva_vence ?? null : null,
      papeles: estado === 'confirmada' && u ? papelesPublicos(u, hoy) : null,
      transferencia: estado === 'confirmada' && u
        ? {
            estado: tr?.estado ?? 'falta',
            nota: tr?.nota ?? null,
            vendida: u.estado === 'vendida',
          }
        : null,
    };
  }

  /** Los pedidos del sitio: primero los que esperan la seña. */
  async listar(user: User): Promise<VistaReservaWeb[]> {
    const lista = await this.dataSource.manager.find(ReservaWeb, { where: { companyId: user.companyId }, order: { created_at: 'DESC' }, take: 100 });
    const vistas = await this.vistas(lista);
    const orden = (v: VistaReservaWeb) => (v.estado === 'pendiente' ? 0 : 1);
    return vistas.sort((a, b) => orden(a) - orden(b));
  }

  /** Llegó la seña: nace la operación con la seña asentada y la unidad queda reservada. */
  async confirmar(id: string, dto: ConfirmarReservaDto, user: User): Promise<VistaReservaWeb> {
    await this.dataSource.transaction(async (em) => {
      const r = await em.findOne(ReservaWeb, { where: { id, companyId: user.companyId }, lock: { mode: 'pessimistic_write' } });
      if (!r) throw new NotFoundException('No encontramos ese pedido de reserva.');
      // Una transferencia que llegó tarde se puede confirmar igual, si el auto sigue libre.
      if (r.estado !== 'pendiente' && r.estado !== 'vencida') {
        throw new ErrorDeNegocio('DATOS_INVALIDOS', `Este pedido ya está ${r.estado === 'confirmada' ? 'confirmado' : 'rechazado'}.`);
      }
      const op = await this.operaciones.reservarEn(em, {
        unidad_id: r.unidadId,
        cliente_nombre: r.cliente_nombre,
        cliente_telefono: r.cliente_telefono,
        cliente_documento: r.cliente_documento ?? undefined,
        reserva_vence: sumarDias(hoyAr(), r.dias),
        notas: 'Reserva pedida desde el sitio, con seña por transferencia.',
        sena: {
          medio: 'transferencia', monto: Number(r.monto), moneda: r.moneda,
          tipo_cambio: dto.tipo_cambio, wallet_id: dto.wallet_id, detalle: 'Seña de la reserva del sitio',
        },
      }, user);
      await em.update(ReservaWeb, { id: r.id }, { estado: 'confirmada', operacionId: op.id, motivo: null });
      await this.avisarAlSeguimiento(em, r, `Se confirmó la seña de ${formato(r.monto, r.moneda)}: quedó reservado (${op.numero}).`, 'Coordinar el saldo y la entrega');
    });
    return this.una(id);
  }

  async rechazar(id: string, dto: RechazarReservaDto, user: User): Promise<VistaReservaWeb> {
    const em = this.dataSource.manager;
    const r = await em.findOne(ReservaWeb, { where: { id, companyId: user.companyId } });
    if (!r) throw new NotFoundException('No encontramos ese pedido de reserva.');
    if (r.estado !== 'pendiente' && r.estado !== 'vencida') throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Este pedido ya está resuelto.');
    await em.update(ReservaWeb, { id: r.id }, { estado: 'rechazada', motivo: (dto.motivo ?? '').trim() || null });
    await this.avisarAlSeguimiento(em, r, `No se tomó su reserva del sitio${(dto.motivo ?? '').trim() ? `: ${(dto.motivo ?? '').trim()}` : ''}.`, 'Avisarle que la reserva no se tomó');
    return this.una(id);
  }

  /** El interesado que nació con el pedido se entera de cómo terminó, y cambia lo que hay que hacer con él. */
  private async avisarAlSeguimiento(em: EntityManager, r: ReservaWeb, texto: string, proxima: string): Promise<void> {
    const candidatos = await em.find(Interesado, { where: { companyId: r.companyId, unidadId: r.unidadId, proxima_nota: PENDIENTE_SENA }, take: 50 });
    const i = candidatos.find((x) => soloDigitos(x.telefono) === soloDigitos(r.cliente_telefono));
    if (!i) return;
    await em.update(Interesado, { id: i.id }, {
      seguimiento: [...(i.seguimiento ?? []), { fecha: new Date().toISOString(), texto, autor: null }],
      proxima_accion: hoyAr(),
      proxima_nota: proxima,
    });
  }

  private async una(id: string): Promise<VistaReservaWeb> {
    const r = await this.dataSource.manager.findOneOrFail(ReservaWeb, { where: { id } });
    return (await this.vistas([r]))[0];
  }

  private async vistas(lista: ReservaWeb[]): Promise<VistaReservaWeb[]> {
    const em = this.dataSource.manager;
    const idsU = [...new Set(lista.map((r) => r.unidadId))];
    const idsO = [...new Set(lista.map((r) => r.operacionId).filter((x): x is string => !!x))];
    const [unidades, ops] = await Promise.all([
      idsU.length ? em.find(Unidad, { where: { id: In(idsU) } }) : [],
      idsO.length ? em.find(Operacion, { where: { id: In(idsO) }, select: { id: true, numero: true } }) : [],
    ]);
    const u = new Map(unidades.map((x) => [x.id, x]));
    const o = new Map(ops.map((x) => [x.id, x]));
    return lista.map((r) => {
      const unidad = u.get(r.unidadId);
      const op = r.operacionId ? o.get(r.operacionId) : undefined;
      return {
        id: r.id,
        estado: estadoVigente(r.estado, r.vence_at),
        unidad: { id: r.unidadId, numero: unidad?.numero ?? '', titulo: unidad ? tituloDe(unidad) : '', anio: unidad?.anio ?? 0, moneda: unidad?.moneda ?? 'ARS', disponible: unidad?.estado === 'disponible' },
        cliente_nombre: r.cliente_nombre,
        cliente_telefono: r.cliente_telefono,
        cliente_documento: r.cliente_documento,
        monto: Number(r.monto),
        moneda: r.moneda,
        vence_at: r.vence_at,
        dias: r.dias,
        operacion: op ? { id: op.id, numero: op.numero } : null,
        motivo: r.motivo,
        created_at: r.created_at,
      };
    });
  }
}
