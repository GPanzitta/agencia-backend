import { aplicarEnv, esBaseDeProduccion } from './env-de-tests';

describe('env-de-tests', () => {
  describe('esBaseDeProduccion', () => {
    it('detecta hosts de Neon', () => {
      expect(
        esBaseDeProduccion('postgresql://u:p@ep-x.sa-east-1.aws.neon.tech/db'),
      ).toBe(true);
    });
    it('no marca la base local', () => {
      expect(
        esBaseDeProduccion('postgresql://postgres:local@localhost:5433/taller_local'),
      ).toBe(false);
    });
    it('vacío o ausente no es producción (no hay base)', () => {
      expect(esBaseDeProduccion('')).toBe(false);
      expect(esBaseDeProduccion(undefined)).toBe(false);
    });
    it('una URL que no se puede parsear se trata como insegura', () => {
      expect(esBaseDeProduccion('esto no es una url')).toBe(true);
    });
  });

  describe('aplicarEnv', () => {
    it('no pisa una variable presente aunque esté vacía', () => {
      const env: NodeJS.ProcessEnv = { DATABASE_URL: '' };
      aplicarEnv('DATABASE_URL=postgresql://x\r\nOTRA=1', env);
      expect(env.DATABASE_URL).toBe('');
      expect(env.OTRA).toBe('1');
    });
    it('completa las que faltan', () => {
      const env: NodeJS.ProcessEnv = {};
      aplicarEnv('DATABASE_URL=abc', env);
      expect(env.DATABASE_URL).toBe('abc');
    });
  });
});
