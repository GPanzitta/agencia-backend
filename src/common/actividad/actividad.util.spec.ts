import { HORA_MS, MINUTO_MS, baseDespierta, tocaMantenimiento } from './actividad.util';
import { ActividadService } from './actividad.service';

const T = 1_000 * HORA_MS;
const tarea = { cadaMs: HORA_MS, topeMs: 6 * HORA_MS };

describe('tocaMantenimiento', () => {
  it('al arrancar corre una vez, aunque no haya actividad', () => {
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: null, ultimaActividad: null })).toBe(true);
  });
  it('pasada la hora corre si la base está despierta (pedido hace menos de 4 min)', () => {
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: T - HORA_MS, ultimaActividad: T - 3 * MINUTO_MS })).toBe(true);
  });
  it('pasada la hora NO corre si la base duerme: esa es la consulta que la despertaba', () => {
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: T - 2 * HORA_MS, ultimaActividad: T - 10 * MINUTO_MS })).toBe(false);
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: T - 2 * HORA_MS, ultimaActividad: null })).toBe(false);
  });
  it('antes de la hora no corre aunque haya uso', () => {
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: T - 30 * MINUTO_MS, ultimaActividad: T })).toBe(false);
  });
  it('al llegar al tope corre igual, aunque tenga que despertar la base', () => {
    expect(tocaMantenimiento({ ...tarea, ahora: T, ultimaCorrida: T - 6 * HORA_MS, ultimaActividad: null })).toBe(true);
  });
  it('baseDespierta: el borde de 4 min ya cuenta como dormida', () => {
    expect(baseDespierta(T, T - 4 * MINUTO_MS + 1)).toBe(true);
    expect(baseDespierta(T, T - 4 * MINUTO_MS)).toBe(false);
  });
});

describe('ActividadService', () => {
  it('el health check y los preflight no cuentan como actividad', () => {
    const a = new ActividadService();
    a.registrar('GET', '/api/health', 10);
    a.registrar('OPTIONS', '/api/ventas-tienda', 20);
    expect(a.ultimaActividad).toBeNull();
    expect(a.ultimaEscritura).toBeNull();
  });
  it('una lectura cuenta como actividad pero no como escritura', () => {
    const a = new ActividadService();
    a.registrar('GET', '/api/tienda/perfil', 10);
    expect(a.ultimaActividad).toBe(10);
    expect(a.ultimaEscritura).toBeNull();
  });
  it('POST, PATCH, PUT y DELETE cuentan como escritura', () => {
    const a = new ActividadService();
    for (const [i, m] of ['POST', 'PATCH', 'PUT', 'DELETE'].entries()) {
      a.registrar(m, '/api/repair-orders/1', i + 1);
      expect(a.ultimaEscritura).toBe(i + 1);
    }
  });
});
