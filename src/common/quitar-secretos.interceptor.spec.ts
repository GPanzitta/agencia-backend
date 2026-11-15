import { lastValueFrom, of } from 'rxjs';
import { QuitarSecretosInterceptor, sinSecretos } from './quitar-secretos.interceptor';

describe('sinSecretos (DAT-04)', () => {
  it('saca hash, versión de sesión y tokens en cualquier nivel', () => {
    const r = sinSecretos({
      token: 'jwt-del-login',
      user: { id: 'u1', email: 'a@b.com', password: '$2b$10$hash', tokenVersion: 3 },
      empresa: { nombre: 'Taller', mp_access_token: 'APP_USR-1', cbu: '0110' },
      clientes: [{ id: 'c1', google_id: 'g-1', token_version: 2 }],
      ml: { access_token: 'APP_USR-ml', refresh_token: 'TG-1' },
    });
    expect(r).toEqual({
      token: 'jwt-del-login',
      user: { id: 'u1', email: 'a@b.com' },
      empresa: { nombre: 'Taller', cbu: '0110' },
      clientes: [{ id: 'c1' }],
      ml: {},
    });
  });

  it('no toca fechas, binarios ni escalares', () => {
    const d = new Date('2026-10-14T00:00:00Z');
    const b = Buffer.from('pdf');
    expect(sinSecretos({ d, b }).d).toBe(d);
    expect(sinSecretos({ d, b }).b).toBe(b);
    expect(sinSecretos('hola')).toBe('hola');
    expect(sinSecretos(null)).toBeNull();
  });

  it('aguanta referencias circulares', () => {
    const a: any = { id: 1 };
    a.yo = a;
    expect(() => sinSecretos(a)).not.toThrow();
  });

  it('el interceptor lo aplica a la respuesta', async () => {
    const i = new QuitarSecretosInterceptor();
    const r = await lastValueFrom(i.intercept({} as any, { handle: () => of({ id: 1, password: 'x' }) }) as any);
    expect(r).toEqual({ id: 1 });
  });
});
