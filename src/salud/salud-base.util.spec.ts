import { MINUTO_MS } from '../common/actividad/actividad.util';
import { codigoDeError, tocaConsultarBase } from './salud-base.util';

const T = 1_000_000 * MINUTO_MS;

describe('tocaConsultarBase', () => {
  it('sin consulta previa, consulta', () => {
    expect(tocaConsultarBase({ ahora: T, ultima: null, ultimaActividad: null })).toBe(true);
  });
  it('con la base despierta por uso, consulta aunque la última sea de hace 1 min', () => {
    expect(tocaConsultarBase({ ahora: T, ultima: { en: T - MINUTO_MS, ok: true }, ultimaActividad: T - MINUTO_MS })).toBe(true);
  });
  it('con la base dormida y una consulta OK de hace 30 min, NO consulta: el monitor no la despierta', () => {
    expect(tocaConsultarBase({ ahora: T, ultima: { en: T - 30 * MINUTO_MS, ok: true }, ultimaActividad: T - 20 * MINUTO_MS })).toBe(false);
  });
  it('con la base dormida y la última OK de hace exactamente 60 min, consulta', () => {
    expect(tocaConsultarBase({ ahora: T, ultima: { en: T - 60 * MINUTO_MS, ok: true }, ultimaActividad: null })).toBe(true);
  });
  it('si la última falló, consulta siempre (sin cuota no hay cómputo que gastar)', () => {
    expect(tocaConsultarBase({ ahora: T, ultima: { en: T - MINUTO_MS, ok: false }, ultimaActividad: null })).toBe(true);
  });
});

describe('codigoDeError', () => {
  it("el 53000 de Neon es 'BASE_SIN_CUOTA'", () => {
    expect(codigoDeError({ code: '53000', message: 'Your account or project has exceeded the quota' })).toBe('BASE_SIN_CUOTA');
  });
  it("el tope propio es 'BASE_SIN_RESPUESTA'", () => {
    expect(codigoDeError(new Error('TIMEOUT_BASE'))).toBe('BASE_SIN_RESPUESTA');
  });
  it("cualquier otro es 'BASE_CON_ERROR'", () => {
    expect(codigoDeError(new Error('ECONNREFUSED'))).toBe('BASE_CON_ERROR');
    expect(codigoDeError(null)).toBe('BASE_CON_ERROR');
  });
});
