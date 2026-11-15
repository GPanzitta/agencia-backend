import {
  estadoAbono,
  graciaHasta,
  rutaPermitidaEnSoloLectura,
  sumarUnMes,
} from './abono.util';

const DIA = 24 * 60 * 60 * 1000;
const vence = new Date('2026-11-10T12:00:00.000Z');

describe('estadoAbono', () => {
  const ahora = new Date('2027-06-01T00:00:00.000Z');

  it.each(['gratis', 'interno'] as const)('%s siempre está al día, aunque tenga una fecha vencida', (plan) => {
    expect(estadoAbono({ plan, abono_vence_en: vence }, ahora, 7)).toBe('al_dia');
  });

  it('un plan pago está al día hasta el instante exacto del vencimiento', () => {
    expect(estadoAbono({ plan: 'pago', abono_vence_en: vence }, vence, 7)).toBe('al_dia');
  });

  it('un milisegundo después del vencimiento está vencida', () => {
    const despues = new Date(vence.getTime() + 1);
    expect(estadoAbono({ plan: 'pago', abono_vence_en: vence }, despues, 7)).toBe('vencida');
  });

  it('sigue vencida hasta el último instante de la gracia', () => {
    const ultimo = new Date(vence.getTime() + 7 * DIA);
    expect(estadoAbono({ plan: 'pago', abono_vence_en: vence }, ultimo, 7)).toBe('vencida');
  });

  it('pasada la gracia queda en sólo lectura', () => {
    const pasada = new Date(vence.getTime() + 7 * DIA + 1);
    expect(estadoAbono({ plan: 'pago', abono_vence_en: vence }, pasada, 7)).toBe('solo_lectura');
  });

  it('con cero días de gracia pasa directo a sólo lectura', () => {
    const despues = new Date(vence.getTime() + 1);
    expect(estadoAbono({ plan: 'pago', abono_vence_en: vence }, despues, 0)).toBe('solo_lectura');
  });

  it('un plan pago sin fecha falla cerrado', () => {
    expect(estadoAbono({ plan: 'pago', abono_vence_en: null }, ahora, 7)).toBe('solo_lectura');
  });
});

describe('graciaHasta', () => {
  it('suma los días de gracia al vencimiento', () => {
    expect(graciaHasta(vence, 7).getTime()).toBe(vence.getTime() + 7 * DIA);
  });
});

describe('sumarUnMes', () => {
  it('suma un mes conservando el día', () => {
    expect(sumarUnMes(new Date('2026-11-10T12:00:00.000Z')).toISOString()).toBe('2026-12-10T12:00:00.000Z');
  });

  it('del 31 de enero pasa al último día de febrero', () => {
    expect(sumarUnMes(new Date('2027-01-31T12:00:00.000Z')).toISOString()).toBe('2027-02-28T12:00:00.000Z');
  });

  it('en año bisiesto, al 29 de febrero', () => {
    expect(sumarUnMes(new Date('2028-01-31T12:00:00.000Z')).toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });

  it('del 31 de diciembre pasa al 31 de enero del año siguiente', () => {
    expect(sumarUnMes(new Date('2026-12-31T12:00:00.000Z')).toISOString()).toBe('2027-01-31T12:00:00.000Z');
  });
});

describe('rutaPermitidaEnSoloLectura', () => {
  it.each([
    '/api/auth/logout',
    '/api/auth/cambiar-clave',
    '/api/abono/suscribir',
    '/api/abono/volver-a-gratis',
    '/api/abono/pago-simulado',
    '/api/abono/suscribir?x=1',
    '/api/auth/logout/',
    // Cerrar lo que ya está en curso: no es cargar nada nuevo, y lo sufriría el cliente.
    '/api/cash-register/open',
    '/api/cash-register/c1/close',
    // Seguridad y cobro de sus clientes.
    '/api/auth/usuarios/u1/activo',
    '/api/auth/usuarios/u1/resetear-clave',
    '/api/mp/oauth/iniciar',
    '/api/mp/oauth/confirmar',
  ])('deja pasar %s', (url) => {
    expect(rutaPermitidaEnSoloLectura(url)).toBe(true);
  });

  it.each([
    '/api/unidades',
    '/api/abonox',
    '/api/abonox/suscribir',
    '/api/auth/usuarios/1/rol',
    '/api/auth/register',
    '/api/unidades?r=/api/abono/suscribir',
    '/api/unidades/o1/reparada',
    '/api/cash-register/c1/movement',
    '',
  ])('frena %s', (url) => {
    expect(rutaPermitidaEnSoloLectura(url)).toBe(false);
  });
});
