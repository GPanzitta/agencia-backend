import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { urlPublicaDeLaApi } from '../common/urls.util';
import { firmarState, leerState, STATE_VIGENCIA_MS } from './oauth-state.util';
import { MercadoPagoClient, TokensOAuthMp } from './mercado-pago.client';

const CONFIRMACION_VIGENCIA_MS = 10 * 60_000;
/** Los tokens de MP duran 180 días: se renuevan con este margen, así una falla tiene muchos reintentos. */
const RENOVAR_ANTES_MS = 30 * 24 * 3600 * 1000;

interface Iniciado { companyId: string; userId: string; vence: number }
interface Pendiente extends Iniciado { tokens: TokensOAuthMp; cuenta: string | null }

export type ConexionMp = 'oauth' | 'manual' | 'demo' | 'vencida' | null;

/** Cómo está conectado Mercado Pago: por OAuth, con un token pegado a mano (como quedó GUSMAT), en demo o nada. */
export function conexionDeMp(c: { mp_access_token?: string | null; mp_user_id?: string | null }): ConexionMp {
  if (!c.mp_access_token) return c.mp_user_id ? 'vencida' : null;
  if (c.mp_access_token === 'SIMULADO') return 'demo';
  return c.mp_user_id ? 'oauth' : 'manual';
}

function camposDeTokens(t: TokensOAuthMp): Partial<Company> {
  return {
    mp_access_token: t.access_token,
    mp_refresh_token: t.refresh_token,
    mp_user_id: String(t.user_id),
    mp_token_vence: new Date(Date.now() + t.expires_in * 1000),
  };
}

/**
 * Cada taller conecta SU cuenta de Mercado Pago con la app de la plataforma
 * (spec 2026-10-28 §13.1). Mismo flujo que Mercado Libre (`conexion-ml.service`,
 * SEG-13): lo que está en juego es a qué cuenta van los pagos de los clientes,
 * así que el callback público no conecta nada: deja los tokens en espera y sólo
 * el admin que inició, desde su sesión, los activa.
 *
 * Los tokens se renuevan con una tarea diaria y no al cobrar: la columna
 * `mp_access_token` queda siempre vigente y los caminos de cobro no cambian. Un
 * token pegado a mano no tiene `mp_refresh_token`: no se toca y sigue cobrando.
 */
@Injectable()
export class ConexionMpService {
  private readonly logger = new Logger(ConexionMpService.name);
  private readonly iniciados = new Map<string, Iniciado>();
  private readonly pendientes = new Map<string, Pendiente>();

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly client: MercadoPagoClient,
  ) {}

  private get secreto(): string {
    const s = process.env.MP_CLIENT_SECRET;
    if (!s || !process.env.MP_CLIENT_ID) {
      throw new ErrorDeNegocio('MP_NO_DISPONIBLE', 'La plataforma todavía no tiene configurada la conexión con Mercado Pago.');
    }
    return s;
  }
  private get redirectUri(): string { return `${urlPublicaDeLaApi()}/mp/oauth/callback`; }
  private get pantalla(): string { return `${process.env.ERP_URL || 'http://localhost:4300'}/home/configuracion/empresa`; }

  private invalido(): ErrorDeNegocio {
    return new ErrorDeNegocio('MP_OAUTH_INVALIDO', 'Esa conexión con Mercado Pago no es válida o venció. Volvé a conectar desde Configuración.');
  }

  private limpiarVencidos(ahora = Date.now()): void {
    for (const [k, v] of this.iniciados) if (v.vence <= ahora) this.iniciados.delete(k);
    for (const [k, v] of this.pendientes) if (v.vence <= ahora) this.pendientes.delete(k);
  }

  urlParaConectar(companyId: string, userId: string): string {
    const secreto = this.secreto;
    this.limpiarVencidos();
    const state = firmarState(companyId, secreto);
    const { nonce } = leerState(state, secreto)!;
    this.iniciados.set(nonce, { companyId, userId, vence: Date.now() + STATE_VIGENCIA_MS });
    return this.client.urlAutorizacion(state, this.redirectUri);
  }

  /** Público: la empresa sale del `state` firmado y del nonce anotado al iniciar. Devuelve adónde redirigir. */
  async callback(code: string, state: string): Promise<string> {
    const leido = leerState(state, this.secreto);
    if (!leido) throw this.invalido();
    // Un solo uso: se consume antes de canjear el code.
    const iniciado = this.iniciados.get(leido.nonce);
    this.iniciados.delete(leido.nonce);
    if (!iniciado || iniciado.companyId !== leido.companyId || iniciado.vence <= Date.now()) throw this.invalido();
    const tokens = await this.client.canjearCodigoOAuth(code, this.redirectUri);
    // Para que el admin vea qué cuenta volvió antes de activarla: con su Mercado
    // Pago personal abierto, los cobros del taller irían ahí.
    const usuario = await this.client.usuarioOAuth(tokens.access_token).catch(() => null);
    const cuenta = usuario?.nickname || usuario?.email || null;
    const id = randomUUID();
    this.pendientes.set(id, { ...iniciado, vence: Date.now() + CONFIRMACION_VIGENCIA_MS, tokens, cuenta });
    return `${this.pantalla}?mp=${id}&cuenta=${encodeURIComponent(cuenta ?? '')}`;
  }

  async confirmar(pendienteId: string, user: { id: string; companyId?: string | null }): Promise<void> {
    this.limpiarVencidos();
    const p = this.pendientes.get(pendienteId);
    // Un solo intento: acierte o no, el id se descarta.
    this.pendientes.delete(pendienteId);
    if (!p || p.companyId !== user.companyId || p.userId !== user.id) throw this.invalido();
    await this.companies.update({ id: p.companyId }, { ...camposDeTokens(p.tokens), mp_cuenta: p.cuenta, mp_conectado_en: new Date() });
  }

  async desconectar(companyId: string): Promise<void> {
    await this.companies.update({ id: companyId }, { mp_access_token: null, mp_refresh_token: null, mp_user_id: null, mp_cuenta: null, mp_token_vence: null, mp_conectado_en: null });
  }

  /** Una vez por día alcanza: despierta la base una sola vez y hay 30 días de margen. */
  @Cron('0 5 * * *')
  async renovarPorVencer(): Promise<void> {
    const porVencer = await this.companies.createQueryBuilder('c')
      .addSelect('c.mp_refresh_token')
      .where('c.mp_user_id IS NOT NULL')
      .andWhere('c.mp_access_token IS NOT NULL')
      .andWhere('c.mp_token_vence < :limite', { limite: new Date(Date.now() + RENOVAR_ANTES_MS) })
      .getMany();
    for (const c of porVencer) {
      try {
        // Sin esto, la app no tiene el permiso `offline_access`: vence a los 180 días.
        if (!c.mp_refresh_token) throw new Error('la conexión no trajo refresh token');
        const tokens = await this.client.renovarTokenOAuth(c.mp_refresh_token);
        // Condicionado a lo leído: si el admin reconectó mientras tanto, no se pisa.
        await this.companies.update({ id: c.id, mp_refresh_token: c.mp_refresh_token }, camposDeTokens(tokens));
      } catch (e) {
        this.logger.error(`No se pudo renovar el token de Mercado Pago de ${c.id}: ${(e as Error).message}`);
        // Mientras no venza sigue cobrando y mañana se reintenta. Vencido no sirve,
        // y dejarlo haría fallar el checkout: sin token, el cliente aprueba sin pago
        // y el ERP le pide al taller que reconecte (`vencida`).
        if (c.mp_token_vence && new Date(c.mp_token_vence) <= new Date()) {
          await this.companies.update({ id: c.id, mp_token_vence: c.mp_token_vence }, { mp_access_token: null });
        }
      }
    }
  }
}
