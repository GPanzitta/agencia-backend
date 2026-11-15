import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import type { User } from '../auth/entities/user.entity';
import { ConflictoDeNegocio } from '../common/errores/error-negocio';
import { firmaMercadoPagoValida, secretoSinConfigurar, type FirmaMercadoPago } from '../common/mercadopago-firma.util';
import { urlDelErp } from '../common/urls.util';
import { Company } from '../companies/entities/company.entity';
import { Roles } from '../enums/roles.enum';
import { MercadoPagoClient } from '../mercado-pago/mercado-pago.client';
import { demoDePagoActiva, mpUtilizable } from '../mercado-pago/modo-demo.util';
import { estadoAbono, graciaHasta, sumarUnMes, type EstadoAbono, type PlanTaller } from './abono.util';
import { ordenesDelMes } from './cupo-abono';
import { AbonoPago } from './entities/abono-pago.entity';
import { EstadoAbonoService } from './estado-abono.service';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RespuestaAbono {
  plan: PlanTaller;
  estado: EstadoAbono;
  vence_en: Date | null;
  gracia_hasta: Date | null;
  ordenes_mes: number;
  /** Sólo el plan gratis tiene tope. */
  tope: number | null;
  precio_mensual: number;
  preapproval_estado: string | null;
  pago_simulado: boolean;
  /** Sólo para el admin. */
  pagos?: AbonoPago[];
}

/**
 * Sólo un id que MP no conoce se descarta. Cualquier otro error (sin red, 5xx, o
 * un 401 por un token vencido) puede ser un pago real: se le pide a MP que reintente,
 * y al corregirlo se acredita.
 */
function hayQueReintentar(error: unknown): boolean {
  return (error as { status?: number })?.status !== 404;
}

/**
 * Cuánto vale una firma. El 503 depende de que MP reintente y no se sabe si vuelve a
 * firmar cada vez. Reenviar un aviso viejo no hace daño: todo se relee de MP y el
 * mismo pago no cuenta dos veces.
 */
const TOLERANCIA_FIRMA_ABONO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * El cobro del abono de FG services (spec 2026-10-28 §7). Sólo un pago aprobado
 * extiende el vencimiento; la suscripción aprobada, por sí sola, no da días.
 */
@Injectable()
export class AbonoService {
  private readonly logger = new Logger(AbonoService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(AbonoPago)
    private readonly pagos: Repository<AbonoPago>,
    private readonly estadoAbono: EstadoAbonoService,
    private readonly mp: MercadoPagoClient,
    private readonly dataSource: DataSource,
  ) {}

  private get token(): string | undefined {
    return process.env.MP_ABONO_ACCESS_TOKEN;
  }

  private async empresaDe(user: User): Promise<Company> {
    // TypeORM ignora un `id: null` en el where: devolvería un taller cualquiera.
    if (!user.companyId) throw new ForbiddenException('Tu usuario no pertenece a un taller.');
    const empresa = await this.companies.findOne({ where: { id: user.companyId } });
    if (!empresa) throw new ForbiddenException('Tu usuario no pertenece a un taller.');
    return empresa;
  }

  private sinServicio(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'ABONO_NO_DISPONIBLE',
      message: 'El cobro del abono todavía no está disponible.',
    });
  }

  async estado(user: User): Promise<RespuestaAbono | null> {
    if (!user.companyId) return null;
    const empresa = await this.empresaDe(user);
    const config = await this.estadoAbono.config();
    const esAdmin = user.role?.nombre === Roles.ADMIN || user.role?.nombre === Roles.SUPERADMIN;
    const vence = empresa.abono_vence_en ? new Date(empresa.abono_vence_en) : null;
    return {
      plan: empresa.plan,
      estado: estadoAbono(empresa, new Date(), config.dias_gracia),
      vence_en: vence,
      gracia_hasta: empresa.plan === 'pago' && vence ? graciaHasta(vence, config.dias_gracia) : null,
      ordenes_mes: await ordenesDelMes(this.dataSource, empresa.id),
      tope: empresa.plan === 'gratis' ? config.tope_ordenes_gratis : null,
      precio_mensual: config.precio_mensual,
      preapproval_estado: empresa.mp_preapproval_estado ?? null,
      pago_simulado: demoDePagoActiva(this.token),
      ...(esAdmin
        ? { pagos: await this.pagos.find({ where: { companyId: empresa.id }, order: { pagado_en: 'DESC' }, take: 12 }) }
        : {}),
    };
  }

  async suscribir(user: User, payerEmail: string): Promise<{ init_point: string } | { simulado: true }> {
    const token = this.token;
    if (!mpUtilizable(token)) throw this.sinServicio();

    const empresa = await this.empresaDe(user);
    if (empresa.plan === 'interno') {
      throw new ConflictoDeNegocio('CONFLICTO', 'Este taller no paga abono.');
    }
    const config = await this.estadoAbono.config();
    if (demoDePagoActiva(token)) return { simulado: true };

    if (empresa.mp_preapproval_id) {
      await this.despejarSuscripcion(token!, empresa, config.dias_gracia);
    }

    const suscripcion = await this.mp.crearSuscripcion(token!, {
      reason: 'FG services: abono mensual',
      monto: config.precio_mensual,
      payerEmail,
      externalReference: empresa.id,
      backUrl: `${urlDelErp()}/home/configuracion/abono?volver=1`,
    });
    await this.companies.update(empresa.id, {
      mp_preapproval_id: suscripcion.id,
      mp_preapproval_estado: 'pending',
    });
    return { init_point: suscripcion.init_point };
  }

  async pagoSimulado(user: User): Promise<void> {
    if (!demoDePagoActiva(this.token)) {
      throw new ForbiddenException('El pago simulado sólo existe en la demo.');
    }
    const empresa = await this.empresaDe(user);
    const { precio_mensual } = await this.estadoAbono.config();
    await this.aplicarPago(empresa.id, `SIM-${randomUUID()}`, precio_mensual, new Date());
  }

  /** Sale del plan pago. Lo que quedaba del mes se pierde: la pantalla lo avisa antes. */
  async volverAGratis(user: User): Promise<void> {
    const empresa = await this.empresaDe(user);
    if (empresa.plan === 'interno') {
      throw new ConflictoDeNegocio('CONFLICTO', 'Este taller no paga abono.');
    }
    const token = this.token;
    if (empresa.mp_preapproval_id && empresa.mp_preapproval_estado !== 'cancelled' && !demoDePagoActiva(token)) {
      if (!token) throw this.sinServicio();
      await this.cancelarEnMp(token, empresa.mp_preapproval_id);
    }
    await this.companies.update(empresa.id, {
      plan: 'gratis',
      abono_vence_en: null,
      mp_preapproval_id: null,
      mp_preapproval_estado: null,
    });
  }

  /**
   * Antes de crear otra suscripción se pregunta a MP, no al dato local: el aviso de
   * una ya aprobada puede no haber llegado, y crear otra cobraría dos veces.
   */
  private async despejarSuscripcion(token: string, empresa: Company, diasGracia: number): Promise<void> {
    const id = empresa.mp_preapproval_id!;
    let status: string;
    try {
      ({ status } = await this.mp.obtenerSuscripcion(token, id));
    } catch (error) {
      if ((error as { status?: number })?.status === 404) return;
      this.logger.error(`No se pudo leer la suscripción ${id}: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'ABONO_NO_DISPONIBLE',
        message: 'Mercado Pago no respondió. Probá de nuevo en unos minutos.',
      });
    }
    if (status === 'cancelled') return;

    if (status === 'authorized') {
      const trabada = empresa.plan === 'pago' && estadoAbono(empresa, new Date(), diasGracia) !== 'al_dia';
      if (!trabada) {
        await this.companies.update(empresa.id, { mp_preapproval_estado: 'authorized' });
        throw new ConflictoDeNegocio(
          'CONFLICTO',
          empresa.plan === 'pago'
            ? 'Este taller ya tiene una suscripción activa.'
            : 'Ya hay una suscripción aprobada: estamos esperando que se acredite el primer pago.',
        );
      }
      // El cobro está trabado (por ejemplo, una tarjeta vencida) y el taller quiere pagar de nuevo.
    }
    await this.cancelarEnMp(token, id);
  }

  /** ¿Ya no le puede cobrar? MP rechaza cancelar una que ya no existe o ya está cancelada. */
  private async yaNoCobra(token: string, preapprovalId: string): Promise<boolean> {
    try {
      return (await this.mp.obtenerSuscripcion(token, preapprovalId)).status === 'cancelled';
    } catch (error) {
      return (error as { status?: number })?.status === 404;
    }
  }

  private async cancelarEnMp(token: string, preapprovalId: string): Promise<void> {
    try {
      await this.mp.cancelarSuscripcion(token, preapprovalId);
    } catch (error) {
      const status = (error as { status?: number })?.status ?? 0;
      if (status >= 400 && status < 500 && status !== 429 && (await this.yaNoCobra(token, preapprovalId))) return;
      this.logger.error(`No se pudo cancelar la suscripción ${preapprovalId}: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'ABONO_NO_DISPONIBLE',
        message: 'Mercado Pago no respondió. Probá de nuevo en unos minutos.',
      });
    }
  }

  /** Anota un pago aprobado y extiende el abono un mes. El mismo pago no cuenta dos veces. */
  async aplicarPago(companyId: string, pagoId: string, monto: number, fecha: Date): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const anotado = await em.query(
        `INSERT INTO "abono_pagos" ("company_id", "mp_pago_id", "monto", "pagado_en")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("mp_pago_id") DO NOTHING RETURNING "id"`,
        [companyId, pagoId, monto, fecha],
      );
      if (anotado.length === 0) return;

      const [empresa] = await em.query(
        `SELECT "plan", "abono_vence_en" FROM "company" WHERE "id" = $1 FOR UPDATE`,
        [companyId],
      );
      if (!empresa || empresa.plan === 'interno') return;

      const vence = empresa.abono_vence_en ? new Date(empresa.abono_vence_en) : null;
      const desde = vence && vence.getTime() > fecha.getTime() ? vence : fecha;
      await em.query(`UPDATE "company" SET "plan" = 'pago', "abono_vence_en" = $2 WHERE "id" = $1`, [
        companyId,
        sumarUnMes(desde),
      ]);
    });
  }

  async webhook(body: Record<string, unknown>, meta: FirmaMercadoPago): Promise<void> {
    const secreto = process.env.MP_ABONO_WEBHOOK_SECRET;
    // A diferencia del webhook de ventas, éste nació con la firma: sin secreto no acepta nada.
    if (secretoSinConfigurar(secreto)) {
      this.logger.error('MP_ABONO_WEBHOOK_SECRET sin configurar: el webhook del abono responde 503.');
      throw new ServiceUnavailableException('Webhook sin configurar');
    }
    // MP firma el id en minúsculas cuando es alfanumérico, y los de las suscripciones lo son.
    const firmado = { ...meta, dataId: meta.dataId?.toLowerCase() };
    if (!firmaMercadoPagoValida(firmado, secreto, { toleranciaMs: TOLERANCIA_FIRMA_ABONO_MS })) {
      this.logger.warn('Webhook del abono con firma inválida: se descarta la notificación.');
      throw new UnauthorizedException('Firma inválida');
    }

    const tipo = body?.type ?? body?.topic;
    if (tipo !== 'subscription_preapproval' && tipo !== 'subscription_authorized_payment') return;

    const token = this.token;
    if (!token || !mpUtilizable(token)) throw new ServiceUnavailableException('Abono sin configurar');

    try {
      if (tipo === 'subscription_preapproval') {
        const suscripcion = await this.mp.obtenerSuscripcion(token, meta.dataId!);
        await this.guardarSuscripcion(suscripcion);
      } else {
        await this.procesarCobro(token, meta.dataId!);
      }
    } catch (error) {
      if (hayQueReintentar(error)) {
        this.logger.error(`Webhook del abono falló y MP va a reintentar: ${(error as Error).message}`);
        throw new ServiceUnavailableException('Reintentar');
      }
      // Un id que MP no conoce no se arregla reintentando.
      this.logger.warn(`Webhook del abono descartado: ${(error as Error).message}`);
    }
  }

  private async procesarCobro(token: string, pagoAutorizadoId: string): Promise<void> {
    const cobro = await this.mp.obtenerPagoAutorizado(token, pagoAutorizadoId);
    if (!cobro.aprobado) return;
    const suscripcion = await this.mp.obtenerSuscripcion(token, cobro.preapproval_id);
    const empresa = await this.guardarSuscripcion(suscripcion);
    if (!empresa) return;
    await this.aplicarPago(empresa.id, cobro.id, cobro.monto, cobro.fecha);
  }

  /** Anota la suscripción en su empresa. Devuelve la empresa, o null si el aviso no es de ninguna. */
  private async guardarSuscripcion(s: { id: string; status: string; external_reference: string | null }): Promise<Company | null> {
    if (!s.external_reference || !ES_UUID.test(s.external_reference)) {
      this.logger.warn(`Suscripción ${s.id} con una referencia que no es de un taller.`);
      return null;
    }
    const empresa = await this.companies.findOne({ where: { id: s.external_reference } });
    if (!empresa) {
      this.logger.warn(`Suscripción ${s.id} de un taller que no existe.`);
      return null;
    }
    // El aviso de una suscripción vieja (cancelada o abandonada) no pisa la vigente.
    const esOtra = empresa.mp_preapproval_id && empresa.mp_preapproval_id !== s.id;
    if (!esOtra || s.status === 'authorized') {
      await this.companies.update(empresa.id, { mp_preapproval_id: s.id, mp_preapproval_estado: s.status });
    }
    return empresa;
  }
}
