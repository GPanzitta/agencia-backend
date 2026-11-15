import { demoDePagoActiva, mpUtilizable, pagoSimuladoHabilitado } from './modo-demo.util';

describe('modo demo de pagos (PLA-02)', () => {
  it('en desarrollo la demo está permitida', () => {
    expect(pagoSimuladoHabilitado({ STAGE: 'dev' })).toBe(true);
    expect(demoDePagoActiva('SIMULADO', { STAGE: 'dev' })).toBe(true);
  });

  it('en producción el token SIMULADO solo NO prende la demo', () => {
    expect(pagoSimuladoHabilitado({ STAGE: 'prod' })).toBe(false);
    expect(demoDePagoActiva('SIMULADO', { STAGE: 'prod' })).toBe(false);
  });

  it('en producción sólo con la demo prendida a propósito', () => {
    expect(demoDePagoActiva('SIMULADO', { STAGE: 'prod', MP_PAGO_SIMULADO: 'habilitado' })).toBe(true);
    expect(demoDePagoActiva('SIMULADO', { STAGE: 'prod', MP_PAGO_SIMULADO: 'true' })).toBe(false);
  });

  it('mpUtilizable: un SIMULADO fuera de la demo es como no tener MP', () => {
    expect(mpUtilizable('SIMULADO', { STAGE: 'prod' })).toBe(false);
    expect(mpUtilizable('SIMULADO', { STAGE: 'dev' })).toBe(true);
    expect(mpUtilizable('APP_USR-123', { STAGE: 'prod' })).toBe(true);
    expect(mpUtilizable(null, { STAGE: 'dev' })).toBe(false);
  });

  it('un token real nunca es demo', () => {
    expect(demoDePagoActiva('APP_USR-123', { STAGE: 'dev' })).toBe(false);
    expect(demoDePagoActiva(null, { STAGE: 'dev' })).toBe(false);
  });
});

describe('modo demo de pagos — SEG-33: falla cerrado', () => {
  it('sin STAGE, o con un valor que no es de desarrollo, la demo NO se prende', () => {
    expect(pagoSimuladoHabilitado({})).toBe(false);
    expect(pagoSimuladoHabilitado({ STAGE: 'production' })).toBe(false);
    expect(demoDePagoActiva('SIMULADO', { STAGE: 'Prod' })).toBe(false);
  });
});
