import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { demoDePagoActiva } from './modo-demo.util';
import { esInitPointDeMp } from '../common/url-segura.util';

/**
 * Cliente HTTP de Mercado Pago (Checkout Pro). Sin SDK: son dos llamadas
 * REST y el SDK oficial arrastra dependencias que acá no aportan.
 *
 * Modo demo: si el access token del taller es 'SIMULADO', la "preferencia"
 * vuelve directo al portal y el pago se confirma con el endpoint de pago
 * simulado — mismo camino de aprobación que el webhook real. Sirve para
 * demos de venta y para probar el circuito sin credenciales.
 *
 * PLA-02: el token solo ya no prende la demo. Fuera de desarrollo hace falta
 * `MP_PAGO_SIMULADO=habilitado` (ver `modo-demo.util.ts`); sin eso, un taller
 * con token 'SIMULADO' no tiene pago online.
 */
export interface TokensOAuthMp { access_token: string; refresh_token: string; user_id: number | string; expires_in: number }

@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);
  private readonly base = 'https://api.mercadopago.com';

  /**
   * El token NO es una credencial real de MP (no se le puede preguntar nada a
   * la API con él). No dice si la demo está permitida: eso es `demoActiva`.
   */
  esSimulado(accessToken: string | null | undefined): boolean {
    return accessToken === 'SIMULADO';
  }

  /** Token de demo y un entorno que la permite: se puede confirmar un pago simulado. */
  demoActiva(accessToken: string | null | undefined): boolean {
    return demoDePagoActiva(accessToken);
  }

  /** OAuth de la app de la plataforma (spec 2026-10-28 §13.1). */
  urlAutorizacion(state: string, redirectUri: string): string {
    const q = new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID ?? '', response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri,
    });
    return `https://auth.mercadopago.com.ar/authorization?${q}`;
  }

  canjearCodigoOAuth(code: string, redirectUri: string): Promise<TokensOAuthMp> {
    return this.pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  renovarTokenOAuth(refreshToken: string): Promise<TokensOAuthMp> {
    return this.pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Qué cuenta autorizó: para que el admin la vea antes de activarla. */
  async usuarioOAuth(accessToken: string): Promise<{ id: number | string; nickname?: string; email?: string }> {
    const res = await fetch(`${this.base}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Mercado Pago no devolvió la cuenta (${res.status})`);
    return (await res.json()) as { id: number | string; nickname?: string; email?: string };
  }

  private async pedirToken(datos: Record<string, string>): Promise<TokensOAuthMp> {
    const res = await fetch(`${this.base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...datos }),
    });
    if (!res.ok) {
      // `error` es un código de MP (`invalid_grant`, `invalid_client`): sin secretos.
      const cuerpo = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const motivo = typeof cuerpo?.error === 'string' ? `: ${cuerpo.error.slice(0, 80)}` : '';
      throw new Error(`Mercado Pago rechazó el token (${res.status})${motivo}`);
    }
    const t = (await res.json()) as Partial<TokensOAuthMp> | null;
    if (!t?.access_token || t.user_id === undefined || t.user_id === null || typeof t.expires_in !== 'number') {
      throw new Error('Mercado Pago dio una respuesta incompleta al pedir el token');
    }
    return t as TokensOAuthMp;
  }

  async crearPreferencia(
    accessToken: string,
    datos: {
      titulo: string;
      monto: number;
      externalReference: string;
      backUrl: string;
      notificationUrl: string;
      /** Hasta cuándo se puede pagar. Para una venta de la tienda es el vencimiento de la reserva: después, la plata entraría a MP y la venta ya estaría vencida. */
      venceEn?: Date | null;
    },
  ): Promise<{ id: string; init_point: string }> {
    if (this.esSimulado(accessToken)) {
      // Fuera de una demo permitida no hay a dónde mandar al cliente: el
      // token no sirve contra MP y el pago simulado está cerrado (PLA-02).
      if (!this.demoActiva(accessToken)) {
        this.logger.error('Token de MP «SIMULADO» en un entorno sin demo de pagos: no hay pago online. Cargá credenciales reales.');
        throw new BadRequestException('Este taller no tiene Mercado Pago habilitado: pasá por el local o escribinos.');
      }
      return {
        id: `SIM-PREF-${datos.externalReference}`,
        init_point: `${datos.backUrl}?pago=simulado`,
      };
    }

    const res = await fetch(`${this.base}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: datos.titulo,
            quantity: 1,
            unit_price: datos.monto,
            currency_id: 'ARS',
          },
        ],
        external_reference: datos.externalReference,
        back_urls: {
          success: datos.backUrl,
          pending: datos.backUrl,
          failure: datos.backUrl,
        },
        auto_return: 'approved',
        notification_url: datos.notificationUrl,
        ...(datos.venceEn ? { expires: true, expiration_date_to: expiracionParaMp(datos.venceEn) } : {}),
      }),
    });

    if (!res.ok) {
      const cuerpo = await res.text();
      this.logger.error(`MP preferencia falló (${res.status}): ${cuerpo}`);
      throw new BadRequestException('Mercado Pago rechazó la operación. Revisá las credenciales del taller.');
    }
    const json = (await res.json()) as { id: string; init_point: string };
    // SEG-46: el link al que se manda al cliente a pagar tiene que ser de MP
    // (https, mercadopago.com o .com.ar). Si viniera otra cosa no se devuelve.
    if (!esInitPointDeMp(json.init_point)) {
      this.logger.error(`MP devolvió un init_point que no es de Mercado Pago: ${String(json.init_point).slice(0, 120)}`);
      throw new BadRequestException('Mercado Pago devolvió un link de pago que no es de mercadopago.com: no te mandamos ahí. Probá de nuevo o pagá en el local.');
    }
    return { id: json.id, init_point: json.init_point };
  }

  async obtenerPago(
    accessToken: string,
    paymentId: string,
  ): Promise<{ status: string; external_reference: string | null; transaction_amount: number; currency_id: string | null }> {
    // El id llega del webhook público: va escapado para que no pueda torcer la ruta.
    const res = await fetch(`${this.base}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`MP pago ${paymentId} no se pudo leer (${res.status})`);
    }
    const json = (await res.json()) as {
      status: string;
      external_reference?: string;
      transaction_amount?: number;
      currency_id?: string;
    };
    return {
      status: json.status,
      external_reference: json.external_reference ?? null,
      transaction_amount: Number(json.transaction_amount ?? 0),
      // PLA-01: el webhook coteja la moneda además del monto.
      currency_id: json.currency_id ?? null,
    };
  }

  // ─── Suscripciones del abono de FG services (spec 2026-10-28 §7) ─────────

  /** Sin plan asociado y pendiente: el taller carga su medio de pago en el `init_point`. */
  async crearSuscripcion(
    accessToken: string,
    datos: { reason: string; monto: number; payerEmail: string; externalReference: string; backUrl: string },
  ): Promise<{ id: string; init_point: string }> {
    const res = await fetch(`${this.base}/preapproval`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: datos.reason,
        payer_email: datos.payerEmail,
        external_reference: datos.externalReference,
        back_url: datos.backUrl,
        status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: datos.monto, currency_id: 'ARS' },
      }),
    });
    if (!res.ok) {
      this.logger.error(`MP suscripción falló (${res.status}): ${await res.text()}`);
      throw new BadRequestException('Mercado Pago rechazó la suscripción. Revisá que el correo sea el de tu cuenta de Mercado Pago.');
    }
    const json = (await res.json()) as { id: string; init_point: string };
    if (!esInitPointDeMp(json.init_point)) {
      this.logger.error(`MP devolvió un init_point que no es de Mercado Pago: ${String(json.init_point)}`);
      throw new BadRequestException('Mercado Pago devolvió un link de pago que no es de mercadopago.com.');
    }
    return { id: json.id, init_point: json.init_point };
  }

  async obtenerSuscripcion(
    accessToken: string,
    id: string,
  ): Promise<{ id: string; status: string; external_reference: string | null }> {
    const json = await this.leer<{ id: string; status: string; external_reference?: string }>(accessToken, `/preapproval/${encodeURIComponent(id)}`);
    return { id: json.id, status: json.status, external_reference: json.external_reference ?? null };
  }

  async cancelarSuscripcion(accessToken: string, id: string): Promise<void> {
    const res = await fetch(`${this.base}/preapproval/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (!res.ok) throw Object.assign(new Error(`MP no canceló la suscripción ${id} (${res.status})`), { status: res.status });
  }

  /** Un cobro de una suscripción. Lo que cuenta es el pago que generó, no el estado del cobro. */
  async obtenerPagoAutorizado(
    accessToken: string,
    id: string,
  ): Promise<{ id: string; preapproval_id: string; monto: number; fecha: Date; aprobado: boolean }> {
    const json = await this.leer<{
      id: number | string;
      preapproval_id: string;
      transaction_amount?: number;
      debit_date?: string;
      date_created?: string;
      payment?: { status?: string };
    }>(accessToken, `/authorized_payments/${encodeURIComponent(id)}`);
    const fecha = new Date(json.debit_date ?? json.date_created ?? Date.now());
    return {
      id: String(json.id),
      preapproval_id: json.preapproval_id,
      monto: Number(json.transaction_amount ?? 0),
      fecha: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
      aprobado: json.payment?.status === 'approved',
    };
  }

  /** El error lleva el código de MP: quien llama decide si conviene reintentar. */
  private async leer<T>(accessToken: string, camino: string): Promise<T> {
    const res = await fetch(`${this.base}${camino}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw Object.assign(new Error(`MP ${camino} no se pudo leer (${res.status})`), { status: res.status });
    return (await res.json()) as T;
  }
}

/** MP quiere ISO 8601 con desplazamiento explícito (`2026-09-22T09:08:43.421+00:00`), no la `Z` de `toISOString()`. */
export function expiracionParaMp(momento: Date): string {
  return momento.toISOString().replace(/Z$/, '+00:00');
}
