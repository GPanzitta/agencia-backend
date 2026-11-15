import { credencialesDelSeed, SeedInseguroError } from './clave-inicial.util';

describe('credencialesDelSeed (SEG-01)', () => {
  it('en desarrollo sigue el default de siempre', () => {
    expect(credencialesDelSeed({ STAGE: 'dev' })).toMatchObject({ email: 'admin@taller.local', password: 'admin123456' });
    expect(credencialesDelSeed({})).toMatchObject({ password: 'admin123456' });
  });

  it('en producción sin ADMIN_PASSWORD o sin ADMIN_EMAIL no corre', () => {
    expect(() => credencialesDelSeed({ STAGE: 'prod', ADMIN_EMAIL: 'duenio@taller.com' })).toThrow(SeedInseguroError);
    expect(() => credencialesDelSeed({ STAGE: 'prod', ADMIN_PASSWORD: 'una-clave-larga-y-rara' })).toThrow(/ADMIN_EMAIL/);
  });

  it('en producción rechaza la clave del repo, aunque venga explícita', () => {
    expect(() => credencialesDelSeed({ STAGE: 'prod', ADMIN_EMAIL: 'a@b.com', ADMIN_PASSWORD: 'admin123456' })).toThrow(SeedInseguroError);
    expect(() =>
      credencialesDelSeed({ STAGE: 'prod', ADMIN_EMAIL: 'a@b.com', ADMIN_PASSWORD: 'cambiar-por-una-clave-nueva' }),
    ).toThrow(/clave conocida/);
  });

  it('en producción rechaza una clave corta', () => {
    expect(() => credencialesDelSeed({ STAGE: 'prod', ADMIN_EMAIL: 'a@b.com', ADMIN_PASSWORD: 'corta123' })).toThrow(/12 caracteres/);
  });

  it('en producción, con correo y una clave propia, la usa', () => {
    expect(credencialesDelSeed({ STAGE: 'prod', ADMIN_EMAIL: ' a@b.com ', ADMIN_PASSWORD: 'Tornillo-Azul-2026' })).toEqual({
      email: 'a@b.com', password: 'Tornillo-Azul-2026', origen: 'ADMIN_PASSWORD del entorno',
    });
  });
});
