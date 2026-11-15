import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { conexionDeMp } from '../mercado-pago/conexion-mp.service';
import { PasoInicial, pasosDe } from './primeros-pasos.util';
import { PerfilPublico } from '../perfil-publico/entities/perfil-publico.entity';
import { pagoSimuladoHabilitado } from '../mercado-pago/modo-demo.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company } from './entities/company.entity';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';
import { User } from '../auth/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import {
  SLA_CONFIG_DEFAULT, cuotasRepetidas, faltanParaTransferencia, numeroONull, problemaDeAgenda, resolverAgenda,
} from './config-heredada.util';

/** Hay un token de MP cargado (el que sea, también 'SIMULADO'). */
export const tokenCargado = (t: string | null | undefined): boolean => !!t?.trim();

/** Los datos legales de texto libre de los documentos: en blanco se guardan como null. */
const TEXTOS_LEGALES = ['razon_social', 'iibb', 'email_contacto', 'horario_atencion', 'traslado_garantia'] as const;

/** Las billeteras de cobro de la empresa y para qué medio es cada una (D2). */
const BILLETERAS_DE_COBRO = [
  ['mp_wallet_id', 'mercado_pago'],
  ['transferencia_wallet_id', 'transferencia'],
] as const;

/**
 * Datos de la empresa de la sesión. Existe por la documentación física:
 * orden de servicio, remito y OC salen con este membrete.
 */
@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  async miEmpresa(user: User) {
    const company = await this.companyRepo.findOneBy({ id: user.companyId });
    if (!company) throw new NotFoundException('La sesión no tiene empresa asignada');
    const {
      id, name, direccion, telefono, cuit, requiere_presupuesto,
      mp_access_token, mp_user_id, mp_cuenta, mp_token_vence, sena_porcentaje, mp_wallet_id, garantia_dias,
      dias_abandono, exigir_oc_paga_repuestos, agenda_config, costo_visita_domicilio,
      sla_config, tope_ordenes_tecnico,
      margen_repuestos_porcentaje, alerta_suba_costo_porcentaje,
      envio_habilitado, costo_envio_tienda, reserva_horas,
      descuento_maximo_mostrador,
      transferencia_wallet_id,
      alicuota_iva_defecto, cuotas_tienda, transferencia_tienda_habilitada, transferencia_descuento_porcentaje,
      transferencia_cbu, transferencia_alias, transferencia_titular, envio_gratis_desde,
      razon_social, condicion_iva, iibb, inicio_actividades, email_contacto, horario_atencion,
      costo_revision, revision_se_descuenta, plazo_presupuesto_dias, plazo_reparacion_dias,
      canon_guarda_diario, revision_garantia_dias, factura_momento, traslado_garantia,
    } = company;
    return {
      id, name, direccion, telefono, cuit, requiere_presupuesto,
      // CLI-02: el token de MP es un secreto y esta lectura es de todos los
      // puestos (el membrete de los documentos). Sólo se dice si hay uno.
      mp_configurado: tokenCargado(mp_access_token),
      mp_conexion: conexionDeMp({ mp_access_token, mp_user_id }),
      mp_user_id: mp_user_id ?? null,
      mp_cuenta: mp_cuenta ?? null,
      // Dónde se puede ofrecer el modo demo: en producción dejaría al taller sin cobrar.
      mp_demo_permitida: pagoSimuladoHabilitado(),
      mp_token_vence: mp_token_vence ? new Date(mp_token_vence).toISOString() : null,
      sena_porcentaje, mp_wallet_id, garantia_dias,
      // D2: dónde entran las transferencias que el chofer cobra en la puerta.
      transferencia_wallet_id: transferencia_wallet_id ?? null,
      // El formulario tiene que poder leer lo que escribe: estos dos se
      // aceptaban en el PATCH pero no volvían en el GET.
      dias_abandono, exigir_oc_paga_repuestos,
      // Sin configuración cargada valen los valores por defecto del backend,
      // así el formulario nunca arranca vacío. Una config vieja de franjas
      // vuelve con los bloques de domicilio derivados (`resolverAgenda`).
      agenda_config: resolverAgenda(agenda_config),
      costo_visita_domicilio: Number(costo_visita_domicilio ?? 0),
      // Mismo criterio que la agenda: el formulario nunca arranca vacío.
      sla_config: sla_config ?? SLA_CONFIG_DEFAULT,
      tope_ordenes_tecnico: tope_ordenes_tecnico ?? 8,
      // Mismo criterio que las dos de arriba: el formulario tiene que poder
      // leer lo que escribe.
      margen_repuestos_porcentaje: margen_repuestos_porcentaje ?? 40,
      alerta_suba_costo_porcentaje: alerta_suba_costo_porcentaje ?? 15,
      // T11b — mismo hueco: se aceptaban en el PATCH desde T4/T11a (leídas
      // en tienda.service.ts#configuracion()) pero nunca en este GET, así
      // que Configuración → Tienda no podía leer lo que acababa de guardar.
      envio_habilitado: envio_habilitado ?? false,
      costo_envio_tienda: Number(costo_envio_tienda ?? 0),
      reserva_horas: reserva_horas ?? 24,
      // Spec 2026-10-02 §3.6: el formulario lo lee y la venta de mostrador lo usa para avisar antes de cobrar.
      descuento_maximo_mostrador: Number(descuento_maximo_mostrador ?? 10),
      // Spec 2026-10-07 tienda §3.2: Configuración → Tienda lee lo que escribe.
      alicuota_iva_defecto: Number(alicuota_iva_defecto ?? 21),
      cuotas_tienda: cuotas_tienda ?? [],
      transferencia_tienda_habilitada: transferencia_tienda_habilitada ?? false,
      transferencia_descuento_porcentaje: Number(transferencia_descuento_porcentaje ?? 0),
      transferencia_cbu: transferencia_cbu ?? null,
      transferencia_alias: transferencia_alias ?? null,
      transferencia_titular: transferencia_titular ?? null,
      envio_gratis_desde: numeroONull(envio_gratis_desde),
      // Documentos opción B: los datos legales que imprimen los papeles al
      // cliente. Vacíos van como null (el papel usa su respaldo) y los
      // montos como número, con los mismos defaults de la columna.
      razon_social: razon_social ?? null,
      condicion_iva: condicion_iva ?? null,
      iibb: iibb ?? null,
      inicio_actividades: inicio_actividades ?? null,
      email_contacto: email_contacto ?? null,
      horario_atencion: horario_atencion ?? null,
      costo_revision: Number(costo_revision ?? 0),
      revision_se_descuenta: revision_se_descuenta ?? true,
      plazo_presupuesto_dias: plazo_presupuesto_dias ?? 2,
      plazo_reparacion_dias: plazo_reparacion_dias ?? 10,
      canon_guarda_diario: Number(canon_guarda_diario ?? 0),
      revision_garantia_dias: revision_garantia_dias ?? 5,
      factura_momento: factura_momento ?? 'al_cobrar',
      traslado_garantia: traslado_garantia ?? null,
    };
  }

  async actualizar(user: User, dto: ActualizarEmpresaDto) {
    const company = await this.companyRepo.findOneBy({ id: user.companyId });
    if (!company) throw new NotFoundException('La sesión no tiene empresa asignada');
    await this.validarBilleterasDeCobro(company, dto, user);
    this.validarCapaComercial(company, dto);
    if (dto.agenda_config) {
      const problema = problemaDeAgenda(dto.agenda_config);
      if (problema) throw new ErrorDeNegocio('DATOS_INVALIDOS', problema);
      // Se guarda completa y sin las franjas viejas: desde acá manda `domicilio`.
      dto.agenda_config = resolverAgenda(dto.agenda_config);
    }
    // CLI-02: el token ya no vuelve en el GET, así que el formulario lo manda
    // sólo para cambiarlo. Sin el campo no se toca; vacío o null lo quita.
    if (dto.mp_access_token !== undefined) {
      dto.mp_access_token = dto.mp_access_token?.trim() || null;
      // Cambiarlo a mano (modo demo, o quitarlo) corta la conexión por OAuth: si
      // no, la tarea diaria lo pisaría al renovar.
      company.mp_refresh_token = null;
      company.mp_user_id = null;
      company.mp_cuenta = null;
      company.mp_token_vence = null;
      company.mp_conectado_en = null;
    }
    // Documentos opción B: un dato legal en blanco es «no cargado» (null), no
    // un texto vacío que el pie imprimiría como «IIBB ».
    for (const campo of TEXTOS_LEGALES) {
      if (dto[campo] !== undefined) dto[campo] = dto[campo]?.trim() || null;
    }
    Object.assign(company, dto);
    await this.companyRepo.save(company);
    return this.miEmpresa(user);
  }

  /** Qué le falta configurar al taller (spec 2026-10-28 §6). Cuentas, sin traer filas. */
  async primerosPasos(user: User): Promise<{ cerrado: boolean; pasos: PasoInicial[] }> {
    const company = await this.companyRepo.findOneBy({ id: user.companyId });
    if (!company) throw new NotFoundException('La sesión no tiene empresa asignada');
    const companyId = company.id;
    const m = this.companyRepo.manager;
    const cuenta = async (sql: string): Promise<number> => (await m.query(sql, [companyId]))?.[0]?.n ?? 0;
    const [cajas_usd, unidades, publicadas] = await Promise.all([
      cuenta(`SELECT count(*)::int AS n FROM "wallets" WHERE "company_id" = $1 AND "moneda" = 'USD' AND "is_deleted" = false`),
      cuenta(`SELECT count(*)::int AS n FROM "unidades" WHERE "company_id" = $1`),
      cuenta(`SELECT count(*)::int AS n FROM "unidades" WHERE "company_id" = $1 AND "publicada" = true`),
    ]);
    const [usuarios_activos, perfil] = await Promise.all([
      m.count(User, { where: { companyId, activo: true } }),
      m.findOne(PerfilPublico, { where: { companyId }, select: { id: true, logo_url: true } }),
    ]);
    const marcas = company.primeros_pasos ?? {};
    return {
      cerrado: !!marcas.cerrado,
      pasos: pasosDe({
        nombre: company.name,
        telefono: company.telefono,
        direccion: company.direccion,
        cuit: company.cuit,
        razon_social: company.razon_social,
        logo_url: perfil?.logo_url,
        usuarios_activos,
        cajas_usd,
        unidades,
        publicadas,
      }),
    };
  }

  async marcarPrimerosPasos(user: User, marcas: { plantillas_vistas?: boolean; cerrado?: boolean }): Promise<void> {
    const company = await this.companyRepo.findOneBy({ id: user.companyId });
    if (!company) throw new NotFoundException('La sesión no tiene empresa asignada');
    company.primeros_pasos = { ...(company.primeros_pasos ?? {}), ...marcas };
    await this.companyRepo.save(company);
  }

  /**
   * Spec 2026-10-07 tienda §3.2: las cuotas no se repiten, y la transferencia
   * prendida exige CBU o alias, titular y caja — mirando cómo QUEDA la
   * empresa, así sacar la caja con la transferencia prendida también se
   * rechaza. `faltan` dice qué cargar.
   */
  private validarCapaComercial(company: Company, dto: ActualizarEmpresaDto): void {
    if (dto.cuotas_tienda && cuotasRepetidas(dto.cuotas_tienda)) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Hay dos planes con la misma cantidad de cuotas.');
    }
    const queda = { ...company, ...dto };
    if (!queda.transferencia_tienda_habilitada) return;
    const faltan = faltanParaTransferencia(queda);
    if (faltan.length) {
      throw new ErrorDeNegocio(
        'TRANSFERENCIA_INCOMPLETA',
        'Para cobrar por transferencia cargá el CBU o el alias, el titular y la caja de transferencias.',
        { faltan },
      );
    }
  }

  /**
   * D2 — Valida la ASIGNACIÓN de una billetera de cobro (MP o transferencias):
   * que exista en la empresa y esté activa. `null` la borra y
   * no se valida. El mismo id que ya tenía tampoco: el formulario reenvía
   * todo, y guardar otro dato no puede quedar trabado por una billetera que
   * ya estaba. Desactivar una billetera ya asignada es otro hallazgo (#41).
   * La misma billetera para MP y para transferencias está permitida.
   */
  private async validarBilleterasDeCobro(company: Company, dto: ActualizarEmpresaDto, user: User): Promise<void> {
    for (const [campo] of BILLETERAS_DE_COBRO) {
      const id = dto[campo];
      if (id == null || id === company[campo]) continue;

      const billetera = await this.walletRepo.findOneBy({ id });
      if (!billetera || billetera.companyId !== user.companyId || !billetera.is_active || billetera.is_deleted) {
        throw new BadRequestException('Esa billetera no existe o está desactivada.');
      }
    }
  }
}
