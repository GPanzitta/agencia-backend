import { createHmac } from 'crypto';
import { AbonoService } from './abono.service';

const SECRETO = 'secreto-del-abono';
const EMPRESA = '11111111-1111-4111-8111-111111111111';

function firma(dataId: string, requestId = 'req-1') {
  const ts = String(Date.now());
  const v1 = createHmac('sha256', SECRETO).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return { signature: `ts=${ts},v1=${v1}`, requestId, dataId };
}

function errorMp(status: number) {
  return Object.assign(new Error(`MP ${status}`), { status });
}

/** Una base falsa que recuerda los pagos anotados y el estado de la empresa. */
function armar(empresa: Record<string, unknown> = {}) {
  const company: Record<string, any> = {
    id: EMPRESA, plan: 'gratis', abono_vence_en: null, mp_preapproval_id: null, mp_preapproval_estado: null, ...empresa,
  };
  const anotados = new Set<string>();
  const em = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (/INSERT INTO "abono_pagos"/.test(sql)) {
        if (anotados.has(params[1])) return [];
        anotados.add(params[1]);
        return [{ id: 'p' }];
      }
      if (/FOR UPDATE/.test(sql)) return [{ plan: company.plan, abono_vence_en: company.abono_vence_en }];
      if (/UPDATE "company"/.test(sql)) {
        company.plan = 'pago';
        company.abono_vence_en = params[1];
        return [];
      }
      return [];
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (e: unknown) => unknown) => fn(em)),
    query: jest.fn(async () => [{ n: 4 }]),
  };
  const companies = {
    findOne: jest.fn(async ({ where }: any) => (where.id === company.id ? company : null)),
    update: jest.fn(async (_id: string, cambios: Record<string, unknown>) => void Object.assign(company, cambios)),
  };
  const pagos = { find: jest.fn(async () => [{ mp_pago_id: 'x', monto: 25000 }]) };
  const estado = { config: jest.fn(async () => ({ precio_mensual: 25000, tope_ordenes_gratis: 30, dias_gracia: 7 })) };
  const mp = {
    crearSuscripcion: jest.fn(async () => ({ id: 'pre-1', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?x=1' })),
    obtenerSuscripcion: jest.fn(async (_t: string, id: string) => ({ id, status: 'authorized', external_reference: EMPRESA })),
    obtenerPagoAutorizado: jest.fn(async (_t: string, id: string) => ({
      id, preapproval_id: 'pre-1', monto: 25000, fecha: new Date('2026-11-04T12:00:00.000Z'), aprobado: true,
    })),
    cancelarSuscripcion: jest.fn(async () => undefined),
  };
  const service = new AbonoService(companies as never, pagos as never, estado as never, mp as never, dataSource as never);
  return { service, company, companies, em, mp, pagos };
}

const admin = { companyId: EMPRESA, role: { nombre: 'admin' } } as never;
const empleado = { companyId: EMPRESA, role: { nombre: 'mostrador' } } as never;

describe('AbonoService', () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    process.env.MP_ABONO_ACCESS_TOKEN = 'APP_USR-real';
    process.env.MP_ABONO_WEBHOOK_SECRET = SECRETO;
    process.env.ERP_URL = 'https://erp.example.com';
    process.env.STAGE = 'prod';
    delete process.env.MP_PAGO_SIMULADO;
  });
  afterEach(() => {
    process.env = { ...entorno };
  });

  describe('aplicarPago', () => {
    const fecha = new Date('2026-11-04T12:00:00.000Z');

    it('el mismo pago dos veces extiende un solo mes', async () => {
      const { service, company } = armar();
      await service.aplicarPago(EMPRESA, 'mp-1', 25000, fecha);
      await service.aplicarPago(EMPRESA, 'mp-1', 25000, fecha);
      expect(new Date(company.abono_vence_en).toISOString()).toBe('2026-12-04T12:00:00.000Z');
    });

    it('con el vencimiento en el futuro suma desde el vencimiento: no se pierden días', async () => {
      const { service, company } = armar({ plan: 'pago', abono_vence_en: new Date('2026-11-20T12:00:00.000Z') });
      await service.aplicarPago(EMPRESA, 'mp-2', 25000, fecha);
      expect(new Date(company.abono_vence_en).toISOString()).toBe('2026-12-20T12:00:00.000Z');
    });

    it('ya vencido suma desde la fecha del pago', async () => {
      const { service, company } = armar({ plan: 'pago', abono_vence_en: new Date('2026-09-01T12:00:00.000Z') });
      await service.aplicarPago(EMPRESA, 'mp-3', 25000, fecha);
      expect(new Date(company.abono_vence_en).toISOString()).toBe('2026-12-04T12:00:00.000Z');
    });

    it('pasa el plan gratis a pago', async () => {
      const { service, company } = armar();
      await service.aplicarPago(EMPRESA, 'mp-4', 25000, fecha);
      expect(company.plan).toBe('pago');
    });

    it('el plan interno queda como está, pero el pago se anota', async () => {
      const { service, company, em } = armar({ plan: 'interno' });
      await service.aplicarPago(EMPRESA, 'mp-5', 25000, fecha);
      expect(company.plan).toBe('interno');
      expect(em.query.mock.calls.some(([sql]) => /INSERT INTO "abono_pagos"/.test(sql))).toBe(true);
    });
  });

  describe('webhook', () => {
    const preapproval = { type: 'subscription_preapproval' };
    const pago = { type: 'subscription_authorized_payment' };

    it('una firma inválida da 401 y no procesa nada', async () => {
      const { service, mp } = armar();
      await expect(service.webhook(pago, { signature: 'ts=1,v1=mala', requestId: 'r', dataId: '9' })).rejects.toMatchObject({ status: 401 });
      expect(mp.obtenerPagoAutorizado).not.toHaveBeenCalled();
    });

    it('sin el secreto cargado da 503 y no procesa nada', async () => {
      delete process.env.MP_ABONO_WEBHOOK_SECRET;
      const { service, mp } = armar();
      await expect(service.webhook(pago, firma('9'))).rejects.toMatchObject({ status: 503 });
      expect(mp.obtenerPagoAutorizado).not.toHaveBeenCalled();
    });

    it('un aviso de otro tópico se contesta sin hacer nada', async () => {
      const { service, mp } = armar();
      await expect(service.webhook({ type: 'payment' }, firma('9'))).resolves.toBeUndefined();
      expect(mp.obtenerPagoAutorizado).not.toHaveBeenCalled();
      expect(mp.obtenerSuscripcion).not.toHaveBeenCalled();
    });

    it('subscription_preapproval guarda el id y el estado en la empresa de external_reference', async () => {
      const { service, company } = armar();
      await service.webhook(preapproval, firma('pre-1'));
      expect(company.mp_preapproval_id).toBe('pre-1');
      expect(company.mp_preapproval_estado).toBe('authorized');
    });

    it('el aviso de una suscripción vieja no pisa la vigente', async () => {
      const { service, company, mp } = armar({ mp_preapproval_id: 'pre-nueva', mp_preapproval_estado: 'authorized' });
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-vieja', status: 'cancelled', external_reference: EMPRESA });
      await service.webhook(preapproval, firma('pre-vieja'));
      expect(company.mp_preapproval_id).toBe('pre-nueva');
      expect(company.mp_preapproval_estado).toBe('authorized');
    });

    it('un cobro aprobado extiende el abono', async () => {
      const { service, company } = armar();
      await service.webhook(pago, firma('55'));
      expect(company.plan).toBe('pago');
      expect(new Date(company.abono_vence_en).toISOString()).toBe('2026-12-04T12:00:00.000Z');
    });

    it('el mismo aviso repetido extiende una sola vez', async () => {
      const { service, company } = armar();
      await service.webhook(pago, firma('55'));
      await service.webhook(pago, firma('55'));
      expect(new Date(company.abono_vence_en).toISOString()).toBe('2026-12-04T12:00:00.000Z');
    });

    it('un cobro rechazado no extiende nada', async () => {
      const { service, company, mp } = armar();
      mp.obtenerPagoAutorizado.mockResolvedValueOnce({ id: '56', preapproval_id: 'pre-1', monto: 25000, fecha: new Date(), aprobado: false });
      await service.webhook(pago, firma('56'));
      expect(company.plan).toBe('gratis');
      expect(company.abono_vence_en).toBeNull();
    });

    it('un external_reference desconocido se contesta sin error', async () => {
      const { service, company, mp } = armar();
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-1', status: 'authorized', external_reference: '22222222-2222-4222-8222-222222222222' });
      await expect(service.webhook(pago, firma('57'))).resolves.toBeUndefined();
      expect(company.plan).toBe('gratis');
    });

    it('un external_reference que no es un id se descarta sin consultar la base', async () => {
      const { service, companies, mp } = armar();
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-1', status: 'authorized', external_reference: 'x; DROP' });
      await expect(service.webhook(preapproval, firma('pre-1'))).resolves.toBeUndefined();
      expect(companies.findOne).not.toHaveBeenCalled();
    });

    it.each([429, 500, 503])('si MP contesta %i da 503, para que reintente', async (status) => {
      const { service, mp } = armar();
      mp.obtenerPagoAutorizado.mockRejectedValueOnce(errorMp(status));
      await expect(service.webhook(pago, firma('58'))).rejects.toMatchObject({ status: 503 });
    });

    it('sin red también da 503', async () => {
      const { service, mp } = armar();
      mp.obtenerPagoAutorizado.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(service.webhook(pago, firma('59'))).rejects.toMatchObject({ status: 503 });
    });

    it('un id que MP no conoce (404) no se reintenta', async () => {
      const { service, mp } = armar();
      mp.obtenerPagoAutorizado.mockRejectedValueOnce(errorMp(404));
      await expect(service.webhook(pago, firma('60'))).resolves.toBeUndefined();
    });
  });

  describe('suscribir', () => {
    it('sin token da 503 con el código', async () => {
      delete process.env.MP_ABONO_ACCESS_TOKEN;
      const { service } = armar();
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'ABONO_NO_DISPONIBLE' }),
      });
    });

    it('el monto sale de la configuración y la vuelta va al ERP', async () => {
      const { service, mp, company } = armar();
      await expect(service.suscribir(admin, 'a@b.com')).resolves.toEqual({
        init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?x=1',
      });
      expect(mp.crearSuscripcion).toHaveBeenCalledWith('APP_USR-real', expect.objectContaining({
        monto: 25000,
        payerEmail: 'a@b.com',
        externalReference: EMPRESA,
        backUrl: 'https://erp.example.com/home/configuracion/abono?volver=1',
      }));
      expect(company.mp_preapproval_id).toBe('pre-1');
      expect(company.mp_preapproval_estado).toBe('pending');
    });

    it('con una suscripción autorizada y al día da 409', async () => {
      const { service, mp } = armar({
        plan: 'pago', abono_vence_en: new Date(Date.now() + 86400000), mp_preapproval_id: 'pre-1', mp_preapproval_estado: 'authorized',
      });
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 409 });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
    });

    it('con el cobro trabado (autorizada pero vencida) cancela la vieja y crea otra', async () => {
      const { service, mp } = armar({
        plan: 'pago', abono_vence_en: new Date(Date.now() - 86400000), mp_preapproval_id: 'pre-vieja', mp_preapproval_estado: 'authorized',
      });
      await service.suscribir(admin, 'a@b.com');
      expect(mp.cancelarSuscripcion).toHaveBeenCalledWith('APP_USR-real', 'pre-vieja');
      expect(mp.crearSuscripcion).toHaveBeenCalled();
    });

    it('si no se puede cancelar la vieja no crea otra: se cobraría dos veces', async () => {
      const { service, mp } = armar({
        plan: 'pago', abono_vence_en: new Date(Date.now() - 86400000), mp_preapproval_id: 'pre-vieja', mp_preapproval_estado: 'authorized',
      });
      mp.cancelarSuscripcion.mockRejectedValueOnce(errorMp(500));
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 503 });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
    });

    it('el plan interno no se suscribe', async () => {
      const { service, mp } = armar({ plan: 'interno' });
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 409 });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
    });

    it('en la demo no llama a MP', async () => {
      process.env.MP_ABONO_ACCESS_TOKEN = 'SIMULADO';
      process.env.MP_PAGO_SIMULADO = 'habilitado';
      const { service, mp } = armar();
      await expect(service.suscribir(admin, 'a@b.com')).resolves.toEqual({ simulado: true });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
    });

    it('un token SIMULADO fuera de la demo es como no tener token', async () => {
      process.env.MP_ABONO_ACCESS_TOKEN = 'SIMULADO';
      const { service } = armar();
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('volverAGratis', () => {
    const conSuscripcion = {
      plan: 'pago', abono_vence_en: new Date(Date.now() + 86400000), mp_preapproval_id: 'pre-1', mp_preapproval_estado: 'authorized',
    };

    it('primero cancela la suscripción en MP', async () => {
      const { service, mp, company } = armar(conSuscripcion);
      await service.volverAGratis(admin);
      expect(mp.cancelarSuscripcion).toHaveBeenCalledWith('APP_USR-real', 'pre-1');
      expect(company.plan).toBe('gratis');
      expect(company.abono_vence_en).toBeNull();
      expect(company.mp_preapproval_id).toBeNull();
    });

    it('si MP falla no cambia nada', async () => {
      const { service, mp, company } = armar(conSuscripcion);
      mp.cancelarSuscripcion.mockRejectedValueOnce(errorMp(500));
      await expect(service.volverAGratis(admin)).rejects.toMatchObject({ status: 503 });
      expect(company.plan).toBe('pago');
      expect(company.mp_preapproval_id).toBe('pre-1');
    });

    it('sin suscripción, no llama a MP', async () => {
      const { service, mp, company } = armar({ plan: 'pago', abono_vence_en: new Date(Date.now() - 86400000) });
      await service.volverAGratis(admin);
      expect(mp.cancelarSuscripcion).not.toHaveBeenCalled();
      expect(company.plan).toBe('gratis');
    });

    it('el plan interno no cambia', async () => {
      const { service, company } = armar({ plan: 'interno' });
      await expect(service.volverAGratis(admin)).rejects.toMatchObject({ status: 409 });
      expect(company.plan).toBe('interno');
    });
  });

  describe('pagoSimulado', () => {
    it('fuera de la demo da 403', async () => {
      process.env.MP_ABONO_ACCESS_TOKEN = 'SIMULADO';
      const { service } = armar();
      await expect(service.pagoSimulado(admin)).rejects.toMatchObject({ status: 403 });
    });

    it('en la demo extiende el abono por el precio configurado', async () => {
      process.env.MP_ABONO_ACCESS_TOKEN = 'SIMULADO';
      process.env.MP_PAGO_SIMULADO = 'habilitado';
      const { service, company, em } = armar();
      await service.pagoSimulado(admin);
      expect(company.plan).toBe('pago');
      const insert = em.query.mock.calls.find(([sql]) => /INSERT INTO "abono_pagos"/.test(sql))!;
      expect((insert as any)[1][2]).toBe(25000);
    });
  });

  describe('estado', () => {
    it('informa el plan, el uso del mes y el tope', async () => {
      const { service } = armar();
      await expect(service.estado(admin)).resolves.toMatchObject({
        plan: 'gratis', estado: 'al_dia', ordenes_mes: 4, tope: 30, precio_mensual: 25000, pago_simulado: false,
      });
    });

    it('el tope sólo aplica al plan gratis', async () => {
      const { service } = armar({ plan: 'interno' });
      await expect(service.estado(admin)).resolves.toMatchObject({ tope: null });
    });

    it('con plan pago vencido dice hasta cuándo hay tiempo', async () => {
      const vence = new Date(Date.now() - 86400000);
      const { service } = armar({ plan: 'pago', abono_vence_en: vence });
      const r = await service.estado(admin);
      expect(r).toMatchObject({ estado: 'vencida', vence_en: vence });
      expect(r!.gracia_hasta!.getTime()).toBe(vence.getTime() + 7 * 86400000);
    });

    it('los pagos sólo los ve el admin', async () => {
      const { service } = armar();
      expect((await service.estado(admin))!.pagos).toHaveLength(1);
      expect((await service.estado(empleado))!.pagos).toBeUndefined();
    });

    it('un superadmin sin empresa no tiene estado', async () => {
      const { service } = armar();
      await expect(service.estado({ companyId: null, role: { nombre: 'superadmin' } } as never)).resolves.toBeNull();
    });
  });
});

describe('AbonoService: revisión final', () => {
  const entorno = { ...process.env };
  const pago = { type: 'subscription_authorized_payment' };

  function firmaDe(dataId: string, antiguedadMs: number) {
    const ts = String(Date.now() - antiguedadMs);
    const v1 = createHmac('sha256', SECRETO).update(`id:${dataId};request-id:r;ts:${ts};`).digest('hex');
    return { signature: `ts=${ts},v1=${v1}`, requestId: 'r', dataId };
  }

  beforeEach(() => {
    process.env.MP_ABONO_ACCESS_TOKEN = 'APP_USR-real';
    process.env.MP_ABONO_WEBHOOK_SECRET = SECRETO;
    process.env.STAGE = 'prod';
    delete process.env.MP_PAGO_SIMULADO;
  });
  afterEach(() => {
    process.env = { ...entorno };
  });

  describe('un aviso no se pierde', () => {
    it.each([401, 403])('un %i de MP (token vencido o de otra app) da 503: el pago se acredita al corregirlo', async (status) => {
      const { service, mp } = armar();
      mp.obtenerPagoAutorizado.mockRejectedValueOnce(errorMp(status));
      await expect(service.webhook(pago, firma('61'))).rejects.toMatchObject({ status: 503 });
    });

    it('un reintento de MP con la firma de hace una hora se procesa igual', async () => {
      const { service, company } = armar();
      await service.webhook(pago, firmaDe('62', 3600 * 1000));
      expect(company.plan).toBe('pago');
    });

    it('un id con mayúsculas se valida en minúsculas, como firma MP las suscripciones', async () => {
      const { service, mp } = armar();
      const { signature, requestId } = firma('abc123');
      await service.webhook({ type: 'subscription_preapproval' }, { signature, requestId, dataId: 'ABC123' });
      expect(mp.obtenerSuscripcion).toHaveBeenCalledWith('APP_USR-real', 'ABC123');
    });

    it('una firma de hace más de una semana no vale', async () => {
      const { service } = armar();
      await expect(service.webhook(pago, firmaDe('63', 8 * 86400000))).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('no se cobra dos veces', () => {
    it('si en MP ya está autorizada, aunque el aviso no haya llegado, da 409 y no crea otra', async () => {
      const { service, mp, company } = armar({ mp_preapproval_id: 'pre-a', mp_preapproval_estado: 'pending' });
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-a', status: 'authorized', external_reference: EMPRESA });
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 409 });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
      expect(company.mp_preapproval_estado).toBe('authorized');
    });

    it.each(['pending', 'paused'])('una suscripción %s se cancela antes de crear otra', async (status) => {
      const { service, mp } = armar({ mp_preapproval_id: 'pre-a', mp_preapproval_estado: 'pending' });
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-a', status, external_reference: EMPRESA });
      await service.suscribir(admin, 'a@b.com');
      expect(mp.cancelarSuscripcion).toHaveBeenCalledWith('APP_USR-real', 'pre-a');
      expect(mp.crearSuscripcion).toHaveBeenCalled();
    });

    it('una ya cancelada no hace falta cancelarla', async () => {
      const { service, mp } = armar({ mp_preapproval_id: 'pre-a', mp_preapproval_estado: 'authorized', plan: 'pago', abono_vence_en: new Date(Date.now() - 86400000) });
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-a', status: 'cancelled', external_reference: EMPRESA });
      await service.suscribir(admin, 'a@b.com');
      expect(mp.cancelarSuscripcion).not.toHaveBeenCalled();
      expect(mp.crearSuscripcion).toHaveBeenCalled();
    });

    it('si MP no conoce la vieja (404), crea la nueva', async () => {
      const { service, mp } = armar({ mp_preapproval_id: 'pre-a', mp_preapproval_estado: 'pending' });
      mp.obtenerSuscripcion.mockRejectedValueOnce(errorMp(404));
      await service.suscribir(admin, 'a@b.com');
      expect(mp.crearSuscripcion).toHaveBeenCalled();
    });

    it('si no se puede leer la vieja, no crea otra', async () => {
      const { service, mp } = armar({ mp_preapproval_id: 'pre-a', mp_preapproval_estado: 'pending' });
      mp.obtenerSuscripcion.mockRejectedValueOnce(errorMp(500));
      await expect(service.suscribir(admin, 'a@b.com')).rejects.toMatchObject({ status: 503 });
      expect(mp.crearSuscripcion).not.toHaveBeenCalled();
    });
  });

  describe('el taller no queda sin salida', () => {
    const conSuscripcion = { plan: 'pago', abono_vence_en: new Date(Date.now() + 86400000), mp_preapproval_id: 'pre-1', mp_preapproval_estado: 'authorized' };

    it('si MP rechaza cancelar porque ya estaba cancelada, vuelve a gratis', async () => {
      const { service, mp, company } = armar(conSuscripcion);
      mp.cancelarSuscripcion.mockRejectedValueOnce(errorMp(400));
      mp.obtenerSuscripcion.mockResolvedValueOnce({ id: 'pre-1', status: 'cancelled', external_reference: EMPRESA });
      await service.volverAGratis(admin);
      expect(company.plan).toBe('gratis');
    });

    it('si MP no conoce la suscripción, vuelve a gratis', async () => {
      const { service, mp, company } = armar(conSuscripcion);
      mp.cancelarSuscripcion.mockRejectedValueOnce(errorMp(404));
      mp.obtenerSuscripcion.mockRejectedValueOnce(errorMp(404));
      await service.volverAGratis(admin);
      expect(company.plan).toBe('gratis');
    });

    it('si MP rechaza cancelar y sigue activa, no cambia nada: seguiría cobrando', async () => {
      const { service, mp, company } = armar(conSuscripcion);
      mp.cancelarSuscripcion.mockRejectedValueOnce(errorMp(400));
      await expect(service.volverAGratis(admin)).rejects.toMatchObject({ status: 503 });
      expect(company.plan).toBe('pago');
    });

    it('con el primer cobro sin salir (gratis y autorizada) puede cancelar', async () => {
      const { service, mp, company } = armar({ mp_preapproval_id: 'pre-1', mp_preapproval_estado: 'authorized' });
      await service.volverAGratis(admin);
      expect(mp.cancelarSuscripcion).toHaveBeenCalledWith('APP_USR-real', 'pre-1');
      expect(company.mp_preapproval_id).toBeNull();
    });
  });

  describe('un superadmin sin empresa no toca un taller ajeno', () => {
    const sinEmpresa = { companyId: null, role: { nombre: 'superadmin' } } as never;

    it.each([
      ['volverAGratis', (s: AbonoService) => s.volverAGratis(sinEmpresa)],
      ['suscribir', (s: AbonoService) => s.suscribir(sinEmpresa, 'a@b.com')],
    ])('%s da 403 sin buscar ninguna empresa', async (_nombre, llamar) => {
      const { service, companies } = armar();
      await expect((llamar as (s: AbonoService) => Promise<unknown>)(service)).rejects.toMatchObject({ status: 403 });
      expect(companies.findOne).not.toHaveBeenCalled();
    });

    it('pagoSimulado da 403 sin anotar nada', async () => {
      process.env.MP_ABONO_ACCESS_TOKEN = 'SIMULADO';
      process.env.MP_PAGO_SIMULADO = 'habilitado';
      const { service, em } = armar();
      await expect(service.pagoSimulado(sinEmpresa)).rejects.toMatchObject({ status: 403 });
      expect(em.query).not.toHaveBeenCalled();
    });
  });
});
