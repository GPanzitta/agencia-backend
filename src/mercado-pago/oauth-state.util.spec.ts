import { firmarState, leerState, STATE_VIGENCIA_MS } from './oauth-state.util';

const SECRETO = 'secreto-de-prueba';
const ahora = new Date('2026-09-11T12:00:00Z');

describe('oauth-state.util', () => {
  it('firma y lee: devuelve la empresa que se firmó', () => {
    const state = firmarState('empresa-1', SECRETO, ahora);
    expect(leerState(state, SECRETO, ahora)).toEqual({ companyId: 'empresa-1', nonce: expect.any(String) });
  });

  it('dos firmas para la misma empresa son distintas (nonce): un state no se reusa por adivinación', () => {
    expect(firmarState('empresa-1', SECRETO, ahora)).not.toBe(firmarState('empresa-1', SECRETO, ahora));
  });

  it('rechaza un state firmado con otro secreto (un tercero no puede conectar su cuenta a tu taller)', () => {
    const ajeno = firmarState('empresa-1', 'otro-secreto', ahora);
    expect(leerState(ajeno, SECRETO, ahora)).toBeNull();
  });

  it('rechaza un state manipulado (cambiar la empresa rompe la firma)', () => {
    const state = firmarState('empresa-1', SECRETO, ahora);
    const [carga, firma] = state.split('.');
    const otraCarga = Buffer.from('empresa-2|nonce|' + (ahora.getTime() + STATE_VIGENCIA_MS)).toString('base64url');
    expect(leerState(`${otraCarga}.${firma}`, SECRETO, ahora)).toBeNull();
    expect(leerState(carga, SECRETO, ahora)).toBeNull(); // sin firma
  });

  it('vence a los 10 minutos', () => {
    const state = firmarState('empresa-1', SECRETO, ahora);
    const justo = new Date(ahora.getTime() + STATE_VIGENCIA_MS - 1);
    const tarde = new Date(ahora.getTime() + STATE_VIGENCIA_MS + 1);
    expect(leerState(state, SECRETO, justo)).toMatchObject({ companyId: 'empresa-1' });
    expect(leerState(state, SECRETO, tarde)).toBeNull();
  });
});
