import { pasosDe } from './primeros-pasos.util';

const nada = {
  nombre: 'A', telefono: null, direccion: null, cuit: null, razon_social: null, logo_url: null,
  usuarios_activos: 1, cajas_usd: 0, unidades: 0, publicadas: 0,
};
const hecho = (x: Record<string, unknown>, clave: string) => pasosDe({ ...nada, ...x } as never).find((p) => p.clave === clave)!.hecho;

// Agencia (12/11/2026): los pasos de una agencia que recién se da de alta.
describe('pasosDe', () => {
  it('una agencia recién creada no tiene nada hecho, y son siempre los mismos 7 en orden', () => {
    const pasos = pasosDe(nada);
    expect(pasos.map((p) => p.clave)).toEqual(['datos', 'legales', 'logo', 'caja_dolares', 'unidad', 'publicada', 'empleados']);
    expect(pasos.every((p) => !p.hecho)).toBe(true);
  });
  it('datos: nombre, teléfono y dirección', () => {
    expect(hecho({ telefono: '11' }, 'datos')).toBe(false);
    expect(hecho({ telefono: '11', direccion: 'Calle 1' }, 'datos')).toBe(true);
  });
  it('legales: CUIT y razón social', () => {
    expect(hecho({ cuit: '20' }, 'legales')).toBe(false);
    expect(hecho({ cuit: '20', razon_social: 'R' }, 'legales')).toBe(true);
  });
  it('logo: el del perfil público', () => {
    expect(hecho({ logo_url: 'x' }, 'logo')).toBe(true);
  });
  it('caja en dólares: al menos una', () => {
    expect(hecho({ cajas_usd: 1 }, 'caja_dolares')).toBe(true);
  });
  it('unidad cargada y unidad publicada son pasos distintos', () => {
    expect(hecho({ unidades: 1 }, 'unidad')).toBe(true);
    expect(hecho({ unidades: 1 }, 'publicada')).toBe(false);
    expect(hecho({ unidades: 1, publicadas: 1 }, 'publicada')).toBe(true);
  });
  it('empleados: más de un usuario activo', () => {
    expect(hecho({ usuarios_activos: 1 }, 'empleados')).toBe(false);
    expect(hecho({ usuarios_activos: 2 }, 'empleados')).toBe(true);
  });
  it('sin los datos de la agencia (llamadas viejas) los pasos nuevos quedan sin hacer', () => {
    const viejo = { ...nada } as Record<string, unknown>;
    delete viejo.cajas_usd; delete viejo.unidades; delete viejo.publicadas;
    expect(pasosDe(viejo as never).filter((p) => ['caja_dolares', 'unidad', 'publicada'].includes(p.clave)).every((p) => !p.hecho)).toBe(true);
  });
});
