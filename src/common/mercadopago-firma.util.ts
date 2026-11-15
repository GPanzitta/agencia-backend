import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validación de la firma `x-signature` de los webhooks de Mercado Pago.
 *
 * MP firma con HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * usando el secreto del panel de integraciones (`MP_WEBHOOK_SECRET`).
 *
 * Portado desde `brumm-backend/src/common/mercadopago-firma.util.ts`, sin
 * cambios de lógica: acá `POST /portal/mp/webhook` era público y no validaba
 * nada, así que un POST armado a mano podía acreditar un pago inexistente —
 * tanto la seña de una orden como una venta de la tienda. Que el handler
 * después confirme el pago contra la API de MP cierra el agujero de "acreditar
 * lo que diga el body", pero no el de "cualquiera puede hacer que el backend
 * salga a consultar y aplicar pagos ajenos".
 */

export interface FirmaMercadoPago {
  signature?: string;
  requestId?: string;
  dataId?: string;
}

/**
 * `true` si el secreto todavía no está cargado de verdad.
 *
 * Los `.env.example` se distribuyen con marcadores tipo
 * `REEMPLAZAR_CON_TU_SECRET`; si se tomaran como secreto real, la firma no
 * validaría nunca y el taller dejaría de acreditar pagos sin entender por qué.
 */
export function secretoSinConfigurar(secreto?: string | null): boolean {
  return !secreto || secreto.startsWith('REEMPLAZAR') || secreto.length < 16;
}

/**
 * SEG-47: la ventana contra el reenvío. Una notificación firmada sirve sólo
 * durante 5 minutos alrededor del `ts` del header: grabar una válida y
 * mandarla de nuevo más tarde ya no pasa. Hacia adelante también, por si el
 * reloj de MP y el del servidor no coinciden del todo.
 */
export const TOLERANCIA_FIRMA_MP_MS = 5 * 60 * 1000;

/**
 * El `ts` de `x-signature` en milisegundos. MP lo documenta en segundos
 * (`ts=1704908010`); si algún día llega en milisegundos (13 cifras), se
 * toma tal cual. `null` si no es un número.
 */
export function instanteDeFirma(ts: string): number | null {
  if (!/^[0-9]{1,16}$/.test(ts)) return null;
  const n = Number(ts);
  return n >= 1e12 ? n : n * 1000;
}

/**
 * Valida la firma contra el secreto dado.
 *
 * `permitirSinSecreto` decide qué pasa cuando el secreto no está configurado.
 * El webhook del portal lo pide en `true` a propósito: es el ÚNICO camino por
 * el que entra plata de clientes reales (seña de órdenes y ventas de tienda),
 * y fallar cerrado sin secreto significaría que el cliente paga, MP notifica,
 * el backend descarta y la orden queda impaga para siempre — peor que el
 * riesgo que cubre la firma. Apenas se carga `MP_WEBHOOK_SECRET`, el endpoint
 * pasa a exigir firma sin tocar una línea de código.
 */
export function firmaMercadoPagoValida(
  meta: FirmaMercadoPago,
  secreto: string | undefined | null,
  opciones: { permitirSinSecreto?: boolean; onSinSecreto?: () => void; ahora?: Date; toleranciaMs?: number } = {},
): boolean {
  if (secretoSinConfigurar(secreto)) {
    opciones.onSinSecreto?.();
    return opciones.permitirSinSecreto === true;
  }

  if (!meta.signature || !meta.dataId) return false;

  // Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8c1aa1..."
  const partes = Object.fromEntries(
    meta.signature.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k.trim(), v.join('=').trim()];
    }),
  );
  const ts = partes['ts'];
  const v1 = partes['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${meta.dataId};request-id:${meta.requestId ?? ''};ts:${ts};`;
  const esperado = createHmac('sha256', secreto as string)
    .update(manifest)
    .digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  // SEG-47: la firma es buena, pero ¿es de ahora? El `ts` va dentro del
  // manifiesto firmado, así que no se puede correr sin romper el HMAC.
  const instante = instanteDeFirma(ts);
  if (instante === null) return false;
  const ahora = (opciones.ahora ?? new Date()).getTime();
  return Math.abs(ahora - instante) <= (opciones.toleranciaMs ?? TOLERANCIA_FIRMA_MP_MS);
}
