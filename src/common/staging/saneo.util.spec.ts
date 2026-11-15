import { sentenciasDeSaneo, urlDeStaging } from './saneo.util';

describe('urlDeStaging', () => {
  it('sin STAGING_DATABASE_URL no arranca', () => {
    expect(() => urlDeStaging({})).toThrow(/STAGING_DATABASE_URL/);
  });
  it('si es la misma que DATABASE_URL (la de producción en el .env) no arranca', () => {
    const url = 'postgresql://u:p@ep-prod.neon.tech/neondb';
    expect(() => urlDeStaging({ STAGING_DATABASE_URL: url, DATABASE_URL: url })).toThrow(/producción/);
  });
  it('la misma base de Neon escrita distinto (con o sin -pooler, otros parámetros) también es producción', () => {
    const prod = 'postgresql://u:p@ep-spring-leaf-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
    const directa = 'postgresql://otro:clave@ep-spring-leaf-123456.us-east-1.aws.neon.tech/neondb';
    expect(() => urlDeStaging({ STAGING_DATABASE_URL: directa, DATABASE_URL: prod })).toThrow(/producción/);
  });
  it('si es otra, la devuelve', () => {
    expect(urlDeStaging({ STAGING_DATABASE_URL: 'postgresql://u:p@ep-staging.neon.tech/neondb', DATABASE_URL: 'postgresql://u:p@ep-prod.neon.tech/neondb' }))
      .toBe('postgresql://u:p@ep-staging.neon.tech/neondb');
  });
});

describe('sentenciasDeSaneo', () => {
  const sql = sentenciasDeSaneo().map((s) => s.sql);
  it("Mercado Pago de todas las empresas pasa al modo demo 'SIMULADO'", () => {
    expect(sql).toContain(`UPDATE company SET mp_access_token = 'SIMULADO' WHERE mp_access_token IS NOT NULL`);
  });
  it('la conexión OAuth de Mercado Pago no pasa a staging', () => {
    expect(sql).toContain('UPDATE company SET mp_refresh_token = NULL, mp_user_id = NULL, mp_cuenta = NULL, mp_token_vence = NULL, mp_conectado_en = NULL');
  });
  it('Mercado Libre queda sin credenciales y fuera del drenaje', () => {
    expect(sql).toContain(`UPDATE conexiones_ml SET access_token = '', refresh_token = '', ultimo_error = 'Staging: sin credenciales de Mercado Libre'`);
  });
  it('sólo actualiza: nunca borra filas ni tablas', () => {
    for (const s of sql) expect(s.trim().toUpperCase().startsWith('UPDATE ')).toBe(true);
  });
});
