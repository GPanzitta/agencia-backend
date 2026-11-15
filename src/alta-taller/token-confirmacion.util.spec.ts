import { firmarConfirmacion, firmarRecuperacion, huellaDeClave, leerConfirmacion, leerRecuperacion } from './token-confirmacion.util';

const SECRETO = 'un-secreto-de-prueba-largo';
const T = new Date('2026-11-04T12:00:00Z');
const horas = (h: number) => new Date(T.getTime() + h * 3600 * 1000);

describe('token de confirmación', () => {
  it('el firmado se lee y devuelve el usuario', () => {
    expect(leerConfirmacion(firmarConfirmacion('u-1', 'hash', SECRETO, T), SECRETO, T)?.userId).toBe('u-1');
  });
  it('vale 48 horas', () => {
    const t = firmarConfirmacion('u-1', 'hash', SECRETO, T);
    expect(leerConfirmacion(t, SECRETO, horas(47))?.userId).toBe('u-1');
    expect(leerConfirmacion(t, SECRETO, horas(49))).toBeNull();
  });
  it('adulterado o firmado con otro secreto no vale', () => {
    const t = firmarConfirmacion('u-1', 'hash', SECRETO, T);
    expect(leerConfirmacion(t, 'otro-secreto-cualquiera', T)).toBeNull();
    const [, resto] = [t.slice(0, 2), t.slice(2)];
    expect(leerConfirmacion('zz' + resto, SECRETO, T)).toBeNull();
    expect(leerConfirmacion('basura', SECRETO, T)).toBeNull();
    expect(leerConfirmacion('', SECRETO, T)).toBeNull();
  });
  it('el state de OAuth u otra firma con el mismo secreto no sirve de confirmación', () => {
    const carga = Buffer.from(`u-1.${horas(10).getTime()}`).toString('base64url');
    expect(leerConfirmacion(`${carga}.firma`, SECRETO, T)).toBeNull();
  });
});

describe('enlaces atados a la clave', () => {
  const S = 'secreto-de-prueba-largo';
  const T0 = new Date('2026-11-04T12:00:00Z');
  it('llevan la huella de la clave, no la clave', () => {
    const t = firmarConfirmacion('u-1', 'hash-a', S, T0);
    expect(leerConfirmacion(t, S, T0)?.huella).toBe(huellaDeClave('hash-a'));
    expect(huellaDeClave('hash-a')).not.toBe(huellaDeClave('hash-b'));
    expect(Buffer.from(t.split('.')[0], 'base64url').toString()).not.toContain('hash-a');
  });
  it('uno de confirmar no sirve para recuperar, ni al revés', () => {
    expect(leerRecuperacion(firmarConfirmacion('u-1', 'h', S, T0), S, T0)).toBeNull();
    expect(leerConfirmacion(firmarRecuperacion('u-1', 'h', S, T0), S, T0)).toBeNull();
  });
  it('recuperar vale una hora', () => {
    const t = firmarRecuperacion('u-1', 'h', S, T0);
    expect(leerRecuperacion(t, S, new Date(T0.getTime() + 59 * 60000))?.userId).toBe('u-1');
    expect(leerRecuperacion(t, S, new Date(T0.getTime() + 61 * 60000))).toBeNull();
  });
});
