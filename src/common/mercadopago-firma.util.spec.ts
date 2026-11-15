import { createHmac } from 'crypto';

import {
  firmaMercadoPagoValida,
  instanteDeFirma,
  secretoSinConfigurar,
  TOLERANCIA_FIRMA_MP_MS,
} from './mercadopago-firma.util';

const SECRETO = 'un-secreto-de-produccion-largo';

/** Arma el header `x-signature` tal como lo manda Mercado Pago. SEG-47: por defecto, con el `ts` de ahora. */
function firmar(dataId: string, requestId: string, ts = String(Math.floor(Date.now() / 1000))) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRETO).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('secretoSinConfigurar', () => {
  it('toma como no configurado el vacío, el marcador del .env y uno demasiado corto', () => {
    expect(secretoSinConfigurar(undefined)).toBe(true);
    expect(secretoSinConfigurar('')).toBe(true);
    expect(secretoSinConfigurar('REEMPLAZAR_CON_TU_SECRET')).toBe(true);
    expect(secretoSinConfigurar('corto')).toBe(true);
  });

  it('acepta un secreto real', () => {
    expect(secretoSinConfigurar(SECRETO)).toBe(false);
  });
});

describe('firmaMercadoPagoValida', () => {
  const meta = {
    signature: firmar('123', 'req-1'),
    requestId: 'req-1',
    dataId: '123',
  };

  it('valida una firma correcta', () => {
    expect(firmaMercadoPagoValida(meta, SECRETO)).toBe(true);
  });

  it('rechaza una firma de otro pago', () => {
    expect(firmaMercadoPagoValida({ ...meta, dataId: '999' }, SECRETO)).toBe(
      false,
    );
  });

  it('rechaza si cambia el request-id', () => {
    expect(
      firmaMercadoPagoValida({ ...meta, requestId: 'otro' }, SECRETO),
    ).toBe(false);
  });

  it('rechaza cuando falta el header', () => {
    expect(firmaMercadoPagoValida({ dataId: '123' }, SECRETO)).toBe(false);
    expect(firmaMercadoPagoValida({ signature: meta.signature }, SECRETO)).toBe(
      false,
    );
  });

  it('rechaza un x-signature sin ts o sin v1', () => {
    expect(
      firmaMercadoPagoValida({ ...meta, signature: 'v1=abc' }, SECRETO),
    ).toBe(false);
    expect(
      firmaMercadoPagoValida({ ...meta, signature: 'ts=1' }, SECRETO),
    ).toBe(false);
  });

  it('rechaza un v1 de largo distinto sin explotar en timingSafeEqual', () => {
    expect(
      firmaMercadoPagoValida(
        { ...meta, signature: 'ts=1704908010,v1=ab' },
        SECRETO,
      ),
    ).toBe(false);
  });

  // El punto del parámetro: sin secreto, cada endpoint decide.
  it('sin secreto configurado, falla cerrado por defecto', () => {
    expect(firmaMercadoPagoValida(meta, undefined)).toBe(false);
  });

  it('sin secreto configurado, deja pasar solo si el llamador lo pide', () => {
    const aviso = jest.fn();
    expect(
      firmaMercadoPagoValida(meta, undefined, {
        permitirSinSecreto: true,
        onSinSecreto: aviso,
      }),
    ).toBe(true);
    expect(aviso).toHaveBeenCalled();
  });
});

describe('SEG-47: tolerancia de 5 minutos sobre el ts de x-signature', () => {
  const ts = '1704908010';
  const instante = 1704908010 * 1000;
  const meta = { signature: firmar('123', 'req-1', ts), requestId: 'req-1', dataId: '123' };
  const en = (ms: number) => ({ ahora: new Date(instante + ms) });

  it('la tolerancia es de 5 minutos', () => {
    expect(TOLERANCIA_FIRMA_MP_MS).toBe(300_000);
  });

  it('pasa dentro de los 5 minutos, para atrás y para adelante', () => {
    expect(firmaMercadoPagoValida(meta, SECRETO, en(0))).toBe(true);
    expect(firmaMercadoPagoValida(meta, SECRETO, en(5 * 60_000))).toBe(true);
    expect(firmaMercadoPagoValida(meta, SECRETO, en(-5 * 60_000))).toBe(true);
  });

  it('una notificación reenviada más tarde (o con el reloj muy corrido) no pasa', () => {
    expect(firmaMercadoPagoValida(meta, SECRETO, en(5 * 60_000 + 1000))).toBe(false);
    expect(firmaMercadoPagoValida(meta, SECRETO, en(-6 * 60_000))).toBe(false);
  });

  it('un ts en milisegundos también se entiende; uno que no es número, no', () => {
    expect(instanteDeFirma('1704908010')).toBe(instante);
    expect(instanteDeFirma('1704908010123')).toBe(1704908010123);
    expect(instanteDeFirma('abc')).toBeNull();
    expect(instanteDeFirma('17e8')).toBeNull();
  });

  it('sin secreto, la tolerancia no cambia nada: decide permitirSinSecreto, como antes', () => {
    expect(firmaMercadoPagoValida(meta, undefined, { permitirSinSecreto: true, ...en(60 * 60_000) })).toBe(true);
  });
});
