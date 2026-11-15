import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { tenantContext } from '../tenant/tenant.context';

/** CLI-04, CLI-05, CLI-17 y CLI-24, sin base. */
describe('AuthService: login, alta y revocación de sesiones', () => {
  const HASH = bcrypt.hashSync('clave-buena', 4);
  let usuarios: any[];
  let repo: any;
  let sesiones: { revocar: jest.Mock };
  let service: AuthService;
  let contextoDelChequeo: string | undefined | null;

  /** El `Raw` de LOWER(email): lo resuelve el falso como lo haría Postgres. */
  const coincide = (u: any, where: any) => {
    const e = where.email;
    if (typeof e === 'string') return u.email === e;
    return u.email.toLowerCase() === String(e.objectLiteralParameters.email).toLowerCase();
  };

  beforeEach(() => {
    usuarios = [
      { id: 'u1', email: 'Padri@gusmat.com', password: HASH, activo: true, tokenVersion: 0, companyId: 'c1', role: { nombre: 'tecnico' } },
    ];
    contextoDelChequeo = null;
    repo = {
      find: jest.fn(async ({ where }: any) => usuarios.filter((u) => coincide(u, where))),
      findOne: jest.fn(async ({ where }: any) => {
        contextoDelChequeo = tenantContext.getStore();
        return usuarios.find((u) => coincide(u, where)) ?? null;
      }),
      findOneBy: jest.fn(async (w: any) => (w.nombre ? { id: 'r', nombre: w.nombre } : null)),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      increment: jest.fn(),
    };
    sesiones = { revocar: jest.fn() };
    service = new AuthService(repo, repo, { sign: () => 'jwt' } as any, sesiones as any);
  });

  it('CLI-17: entra aunque el correo se escriba con otras mayúsculas', async () => {
    const r = await service.login({ email: 'padri@GUSMAT.com', password: 'clave-buena' });
    expect(r.token).toBe('jwt');
    expect(r.id).toBe('u1');
  });

  it('clave incorrecta: CREDENCIALES_INVALIDAS, igual que un correo que no existe', async () => {
    await expect(service.login({ email: 'padri@gusmat.com', password: 'otra' })).rejects.toMatchObject({
      response: { code: 'CREDENCIALES_INVALIDAS' },
    });
    await expect(service.login({ email: 'nadie@gusmat.com', password: 'otra' })).rejects.toMatchObject({
      response: { code: 'CREDENCIALES_INVALIDAS' },
    });
  });

  it('cuenta sin confirmar y con la clave correcta: 401 CUENTA_SIN_CONFIRMAR, sin token', async () => {
    usuarios[0].confirmacion_pendiente = true;
    await expect(service.login({ email: 'Padri@gusmat.com', password: 'clave-buena' })).rejects.toMatchObject({
      status: 401,
      response: { code: 'CUENTA_SIN_CONFIRMAR' },
    });
  });

  it('cuenta sin confirmar y clave mala: no revela que la cuenta existe', async () => {
    usuarios[0].confirmacion_pendiente = true;
    await expect(service.login({ email: 'Padri@gusmat.com', password: 'otra' })).rejects.toMatchObject({
      response: { code: 'CREDENCIALES_INVALIDAS' },
    });
  });

  it('CLI-04: dado de baja y con la clave correcta: 401 USUARIO_DADO_DE_BAJA, sin token', async () => {
    usuarios[0].activo = false;
    await expect(service.login({ email: 'Padri@gusmat.com', password: 'clave-buena' })).rejects.toMatchObject({
      status: 401,
      response: { code: 'USUARIO_DADO_DE_BAJA' },
    });
  });

  it('dado de baja con la clave mala: no se le dice que la cuenta existe', async () => {
    usuarios[0].activo = false;
    await expect(service.login({ email: 'Padri@gusmat.com', password: 'mala' })).rejects.toMatchObject({
      response: { code: 'CREDENCIALES_INVALIDAS' },
    });
  });

  it('dos usuarios viejos que sólo difieren en mayúsculas: entra el de la clave que coincide', async () => {
    usuarios.push({ ...usuarios[0], id: 'u2', email: 'padri@gusmat.com', password: bcrypt.hashSync('la-otra', 4) });
    expect((await service.login({ email: 'PADRI@gusmat.com', password: 'la-otra' })).id).toBe('u2');
    expect((await service.login({ email: 'PADRI@gusmat.com', password: 'clave-buena' })).id).toBe('u1');
  });

  it('CLI-24 y CLI-17: el alta mira el correo en toda la base y sin mayúsculas: EMAIL_EN_USO, no 500', async () => {
    const admin = { id: 'a', companyId: 'c2', role: { nombre: 'admin' } } as any;
    await expect(
      tenantContext.run('c2', () => service.register({ email: 'padri@gusmat.com', nombre: 'X', password: '123456', rol: 'tecnico' } as any, admin)),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_EN_USO' } });
    expect(contextoDelChequeo).toBeUndefined();
  });

  it('CLI-05: baja, cambio de rol y cerrar sesión avisan para cortar el socket', async () => {
    const admin = { id: 'a', companyId: 'c1', role: { nombre: 'admin' } } as any;
    repo.findOne.mockResolvedValue(usuarios[0]);
    await service.cambiarEstadoUsuario('u1', false, admin);
    await service.cambiarRolUsuario('u1', 'mostrador', admin);
    await service.logout('u1');
    expect(sesiones.revocar.mock.calls).toEqual([['u1'], ['u1'], ['u1']]);
  });

  it('reactivar no corta nada', async () => {
    const admin = { id: 'a', companyId: 'c1', role: { nombre: 'admin' } } as any;
    repo.findOne.mockResolvedValue({ ...usuarios[0], activo: false });
    await service.cambiarEstadoUsuario('u1', true, admin);
    expect(sesiones.revocar).not.toHaveBeenCalled();
  });
});
