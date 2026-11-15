import { sesionInvalida } from './sesion.util';

const ok = { activo: true, tokenVersion: 3, companyId: 'c1', role: { nombre: 'tecnico' } };

describe('sesionInvalida', () => {
  it('un usuario activo, con su versión, rol y empresa: vale', () => {
    expect(sesionInvalida(ok, { id: 'u1', tokenVersion: 3 })).toBeNull();
  });

  it('CLI-04: dado de baja dice USUARIO_DADO_DE_BAJA', () => {
    expect(sesionInvalida({ ...ok, activo: false }, { id: 'u1', tokenVersion: 3 })?.code).toBe('USUARIO_DADO_DE_BAJA');
  });

  it('versión vieja (cambio de rol, cerrar sesión): SESION_VENCIDA', () => {
    expect(sesionInvalida(ok, { id: 'u1', tokenVersion: 2 })?.code).toBe('SESION_VENCIDA');
  });

  it('SEG-32: token sin versión no se puede revocar: no pasa', () => {
    expect(sesionInvalida(ok, { id: 'u1' })?.code).toBe('SESION_VENCIDA');
  });

  it('SEG-07: sin empresa y sin ser superadmin no pasa (el aislamiento no filtraría nada)', () => {
    expect(sesionInvalida({ ...ok, companyId: null }, { id: 'u1', tokenVersion: 3 })?.code).toBe('SESION_VENCIDA');
    expect(sesionInvalida({ ...ok, companyId: null, role: { nombre: 'superadmin' } }, { id: 'u1', tokenVersion: 3 })).toBeNull();
  });

  it('sin rol o sin usuario: SESION_VENCIDA', () => {
    expect(sesionInvalida({ ...ok, role: null }, { id: 'u1' })?.code).toBe('SESION_VENCIDA');
    expect(sesionInvalida(null, { id: 'u1' })?.code).toBe('SESION_VENCIDA');
  });
});
