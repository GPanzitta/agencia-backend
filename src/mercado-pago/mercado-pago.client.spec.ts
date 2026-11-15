import { MercadoPagoClient, expiracionParaMp } from './mercado-pago.client';

describe('expiracionParaMp', () => {
  it('ISO 8601 con desplazamiento explícito, como lo pide Mercado Pago (sin la Z)', () => {
    expect(expiracionParaMp(new Date('2026-09-22T09:08:43.421Z'))).toBe('2026-09-22T09:08:43.421+00:00');
  });
});

describe('MercadoPagoClient.crearPreferencia — SEG-46: el init_point tiene que ser de MP', () => {
  const { MercadoPagoClient } = require('./mercado-pago.client');
  const datos = { titulo: 'Seña', monto: 100, externalReference: 'ref', backUrl: 'https://portal/x', notificationUrl: 'https://api/x' };
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  const responder = (init_point: string) => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'pref-1', init_point }) })) as any;
  };

  it('el de MP pasa', async () => {
    responder('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1');
    await expect(new MercadoPagoClient().crearPreferencia('APP_USR-x', datos)).resolves.toMatchObject({ id: 'pref-1' });
  });

  it('otro host no se devuelve al cliente', async () => {
    responder('https://mercadopago.com.ar.estafa.com/pagar');
    await expect(new MercadoPagoClient().crearPreferencia('APP_USR-x', datos)).rejects.toThrow('no es de mercadopago.com');
  });
});

describe('MercadoPagoClient — OAuth de la plataforma', () => {
  const original = global.fetch;
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { MP_CLIENT_ID: 'app-1', MP_CLIENT_SECRET: 'secreto' }); });
  afterEach(() => { global.fetch = original; process.env = { ...env }; });

  it('arma la URL de autorización con la app, el state y a dónde volver', () => {
    const u = new URL(new MercadoPagoClient().urlAutorizacion('st-1', 'https://api.test/api/mp/oauth/callback'));
    expect(u.origin + u.pathname).toBe('https://auth.mercadopago.com.ar/authorization');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'app-1', response_type: 'code', platform_id: 'mp', state: 'st-1', redirect_uri: 'https://api.test/api/mp/oauth/callback',
    });
  });

  it('canjea el código y renueva contra /oauth/token con su grant_type', async () => {
    const tokens = { access_token: 'a', refresh_token: 'r', user_id: 1, expires_in: 100 };
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => tokens }));
    global.fetch = fetchMock as any;
    const c = new MercadoPagoClient();
    await expect(c.canjearCodigoOAuth('cod', 'https://vuelta')).resolves.toEqual(tokens);
    await c.renovarTokenOAuth('TG-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(JSON.parse(init.body)).toEqual({ client_id: 'app-1', client_secret: 'secreto', grant_type: 'authorization_code', code: 'cod', redirect_uri: 'https://vuelta' });
    const [, init2] = fetchMock.mock.calls[1] as unknown as [string, { body: string }];
    expect(JSON.parse(init2.body)).toEqual({ client_id: 'app-1', client_secret: 'secreto', grant_type: 'refresh_token', refresh_token: 'TG-1' });
  });

  it('dice el motivo que da Mercado Pago, para poder diagnosticar la primera configuración', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', message: 'bad', cause: [] }) })) as any;
    await expect(new MercadoPagoClient().canjearCodigoOAuth('cod', 'https://vuelta')).rejects.toThrow('invalid_grant');
  });

  it('una respuesta sin token, cuenta o vencimiento no se toma como buena', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ refresh_token: 'r', user_id: 1, expires_in: 100 }) })) as any;
    await expect(new MercadoPagoClient().renovarTokenOAuth('TG-1')).rejects.toThrow('respuesta incompleta');
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', user_id: 1 }) })) as any;
    await expect(new MercadoPagoClient().renovarTokenOAuth('TG-1')).rejects.toThrow('respuesta incompleta');
  });

  it('si Mercado Pago rechaza, tira un error sin el secreto ni los tokens en el mensaje', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_grant' }) })) as any;
    await expect(new MercadoPagoClient().renovarTokenOAuth('TG-1')).rejects.toThrow('Mercado Pago rechazó el token (400)');
  });
});

describe('MercadoPagoClient — suscripciones del abono', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  const responder = (cuerpo: unknown, ok = true, status = 200) => {
    const f = jest.fn(async () => ({ ok, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) }));
    global.fetch = f as never;
    return f;
  };
  const datos = { reason: 'FG services', monto: 25000, payerEmail: 'a@b.com', externalReference: 'c1', backUrl: 'https://erp/abono' };

  it('crea una suscripción mensual en pesos, pendiente de pago y sin plan asociado', async () => {
    const f = responder({ id: 'pre-1', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=1' });
    const r = await new MercadoPagoClient().crearSuscripcion('tok', datos);
    expect(r.id).toBe('pre-1');
    const [url, opciones] = f.mock.calls[0] as unknown as [string, { method: string; body: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(opciones.body)).toEqual({
      reason: 'FG services',
      payer_email: 'a@b.com',
      external_reference: 'c1',
      back_url: 'https://erp/abono',
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 25000, currency_id: 'ARS' },
    });
  });

  it('no devuelve un link de pago que no sea de Mercado Pago', async () => {
    responder({ id: 'pre-1', init_point: 'https://malo.example.com' });
    await expect(new MercadoPagoClient().crearSuscripcion('tok', datos)).rejects.toThrow(/mercadopago/i);
  });

  it('lee una suscripción con el id escapado', async () => {
    const f = responder({ id: 'p/1', status: 'authorized', external_reference: 'c1' });
    await expect(new MercadoPagoClient().obtenerSuscripcion('tok', 'p/1')).resolves.toEqual({ id: 'p/1', status: 'authorized', external_reference: 'c1' });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://api.mercadopago.com/preapproval/p%2F1');
  });

  it('cancela una suscripción', async () => {
    const f = responder({ id: 'pre-1', status: 'cancelled' });
    await new MercadoPagoClient().cancelarSuscripcion('tok', 'pre-1');
    const [url, opciones] = f.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toBe('https://api.mercadopago.com/preapproval/pre-1');
    expect(opciones.method).toBe('PUT');
    expect(JSON.parse(opciones.body)).toEqual({ status: 'cancelled' });
  });

  it('un cobro con el pago aprobado cuenta como aprobado', async () => {
    responder({ id: 77, preapproval_id: 'pre-1', transaction_amount: 25000, debit_date: '2026-11-04T12:00:00.000-03:00', payment: { id: 9, status: 'approved' } });
    await expect(new MercadoPagoClient().obtenerPagoAutorizado('tok', '77')).resolves.toEqual({
      id: '77', preapproval_id: 'pre-1', monto: 25000, fecha: new Date('2026-11-04T15:00:00.000Z'), aprobado: true,
    });
  });

  it.each([
    ['rechazado', { status: 'rejected' }],
    ['sin pago todavía', undefined],
  ])('un cobro %s no cuenta como aprobado', async (_nombre, payment) => {
    responder({ id: 78, preapproval_id: 'pre-1', transaction_amount: 25000, payment });
    await expect(new MercadoPagoClient().obtenerPagoAutorizado('tok', '78')).resolves.toMatchObject({ aprobado: false });
  });

  it('el error de lectura lleva el código de MP, para decidir si se reintenta', async () => {
    responder({ message: 'x' }, false, 503);
    await expect(new MercadoPagoClient().obtenerSuscripcion('tok', 'p')).rejects.toMatchObject({ status: 503 });
  });
});
