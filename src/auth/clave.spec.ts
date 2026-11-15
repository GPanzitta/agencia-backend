import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CambiarClaveDto } from './dto/cambiar-clave.dto';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { generarClaveProvisoria, LARGO_CLAVE_PROVISORIA, rutaPermitidaConClaveProvisoria } from './clave.util';
import { META_ROLES } from './decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { AccionAuditada } from '../audit/entities/audit-log.entity';
import { TenantThrottlerGuard } from '../common/tenant-throttler.guard';

/** SEG-54: cambio y reseteo de clave, sin base. */
describe('SEG-54 — clave.util', () => {
  it('la provisoria: 12 caracteres sin los que se confunden, y distinta cada vez', () => {
    const a = generarClaveProvisoria();
    expect(a).toHaveLength(LARGO_CLAVE_PROVISORIA);
    expect(a).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/);
    expect(new Set(Array.from({ length: 50 }, () => generarClaveProvisoria())).size).toBe(50);
  });

  it('con la provisoria sólo quedan me, cambiar-clave y logout', () => {
    for (const u of ['/api/auth/me', '/api/auth/cambiar-clave', '/api/auth/logout', '/api/auth/me?x=1', '/api/auth/me/']) {
      expect(rutaPermitidaConClaveProvisoria(u)).toBe(true);
    }
    for (const u of ['/api/repair-orders', '/api/auth/usuarios', '/api/auth/mexico', '/api/auth/me/x', '', null]) {
      expect(rutaPermitidaConClaveProvisoria(u)).toBe(false);
    }
  });
});

describe('SEG-54 — largo mínimo de 10 en las altas y los cambios', () => {
  const errores = async (Clase: any, datos: object) => (await validate(plainToInstance(Clase, datos))).map((e) => e.property);

  it('cambiar-clave: la nueva de 9 no pasa, la de 10 sí; la actual no se mide (las viejas pueden tener 6)', async () => {
    expect(await errores(CambiarClaveDto, { actual: '123456', nueva: '123456789' })).toEqual(['nueva']);
    expect(await errores(CambiarClaveDto, { actual: '123456', nueva: '1234567890' })).toEqual([]);
    expect(await errores(CambiarClaveDto, { actual: '', nueva: '1234567890' })).toEqual(['actual']);
    expect(await errores(CambiarClaveDto, { actual: 'x', nueva: 'a'.repeat(73) })).toEqual(['nueva']);
  });

  it('el alta de un empleado pide 10', async () => {
    const base = { nombre: 'Ana', email: 'ana@taller.com', rol: Roles.TECNICO };
    expect(await errores(RegisterAuthDto, { ...base, password: '123456789' })).toEqual(['password']);
    expect(await errores(RegisterAuthDto, { ...base, password: '1234567890' })).toEqual([]);
  });
});

describe('SEG-54 — AuthService.cambiarClave y resetearClave', () => {
  const HASH = bcrypt.hashSync('clave-vieja', 4);
  let usuarios: any[];
  let repo: any;
  let sesiones: { revocar: jest.Mock };
  let audit: { registrar: jest.Mock };
  let service: AuthService;
  const admin = { id: 'a1', email: 'admin@t.com', companyId: 'c1', role: { nombre: 'admin' } } as any;
  const usuario = (p: any) => ({ password: HASH, activo: true, tokenVersion: 0, companyId: 'c1', role: { nombre: 'tecnico' }, debe_cambiar_clave: false, ...p });

  beforeEach(() => {
    usuarios = [
      usuario({ id: 'u1', email: 'ana@t.com', tokenVersion: 3 }),
      usuario({ id: 'u2', email: 'otro@t.com', companyId: 'c2' }),
      usuario({ id: 's1', email: 'super@t.com', role: { nombre: 'superadmin' } }),
    ];
    repo = {
      findOne: jest.fn(async ({ where }: any) => usuarios.find((u) => u.id === where.id) ?? null),
      save: jest.fn(async (x: any) => x),
    };
    sesiones = { revocar: jest.fn() };
    audit = { registrar: jest.fn(async () => undefined) };
    service = new AuthService(repo, repo, { sign: (p: any) => `jwt-${p.tokenVersion}` } as any, sesiones as any, audit as any);
  });

  it('cambiar: con la actual bien, guarda el hash nuevo, apaga el flag, cierra todas las sesiones y devuelve un token nuevo', async () => {
    usuarios[0].debe_cambiar_clave = true;
    const r = await service.cambiarClave(usuarios[0], { actual: 'clave-vieja', nueva: 'una-clave-nueva' }, '1.2.3.4');
    const guardado = repo.save.mock.calls[0][0];
    expect(await bcrypt.compare('una-clave-nueva', guardado.password)).toBe(true);
    expect(guardado).toMatchObject({ debe_cambiar_clave: false, tokenVersion: 4 });
    expect(sesiones.revocar).toHaveBeenCalledWith('u1');
    expect(r).toMatchObject({ id: 'u1', token: 'jwt-4', debe_cambiar_clave: false });
    expect(r).not.toHaveProperty('password');
  });

  it('cambiar: queda en audit_logs SIN la clave', async () => {
    await service.cambiarClave(usuarios[0], { actual: 'clave-vieja', nueva: 'una-clave-nueva' }, '1.2.3.4');
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: AccionAuditada.CLAVE_CAMBIADA, usuario_id: 'u1', entidad: 'user', entidad_id: 'u1', ip: '1.2.3.4', companyId: 'c1',
      }),
    );
    const texto = JSON.stringify(audit.registrar.mock.calls);
    expect(texto).not.toContain('una-clave-nueva');
    expect(texto).not.toContain('clave-vieja');
    expect(texto).not.toContain('$2b$');
  });

  it('cambiar: con la actual mal, CLAVE_ACTUAL_INCORRECTA y no se toca nada; igual a la actual, CLAVE_REPETIDA', async () => {
    await expect(service.cambiarClave(usuarios[0], { actual: 'otra', nueva: 'una-clave-nueva' })).rejects.toMatchObject({
      codigo: 'CLAVE_ACTUAL_INCORRECTA',
    });
    await expect(service.cambiarClave(usuarios[0], { actual: 'clave-vieja', nueva: 'clave-vieja' })).rejects.toMatchObject({
      codigo: 'CLAVE_REPETIDA',
    });
    expect(repo.save).not.toHaveBeenCalled();
    expect(sesiones.revocar).not.toHaveBeenCalled();
  });

  it('cambiar: si la auditoría falla (enum sin migrar), el cambio igual se hace', async () => {
    audit.registrar.mockRejectedValueOnce(new Error('invalid input value for enum'));
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    await expect(service.cambiarClave(usuarios[0], { actual: 'clave-vieja', nueva: 'una-clave-nueva' })).resolves.toMatchObject({
      token: 'jwt-4',
    });
  });

  it('resetear: provisoria de 12 que vale para entrar, flag prendido, sesiones cerradas y auditado sin la clave', async () => {
    const r = await service.resetearClave('u1', admin, '5.6.7.8');
    expect(r.clave_provisoria).toHaveLength(12);
    const guardado = repo.save.mock.calls[0][0];
    expect(await bcrypt.compare(r.clave_provisoria, guardado.password)).toBe(true);
    expect(guardado).toMatchObject({ debe_cambiar_clave: true, tokenVersion: 4 });
    expect(r.debe_cambiar_clave).toBe(true);
    expect(sesiones.revocar).toHaveBeenCalledWith('u1');
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: AccionAuditada.CLAVE_RESETEADA, usuario_id: 'a1', entidad_id: 'u1', companyId: 'c1' }),
    );
    expect(JSON.stringify(audit.registrar.mock.calls)).not.toContain(r.clave_provisoria);
  });

  it('resetear: un empleado de otro taller es 404; la propia cuenta, 400; un superadmin, 403 para el admin', async () => {
    await expect(service.resetearClave('u2', admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resetearClave('a1', admin)).rejects.toMatchObject({ status: 400 });
    await expect(service.resetearClave('s1', admin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resetearClave('nadie', admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('SEG-54 — JwtStrategy con la clave provisoria', () => {
  const armar = (user: any) => {
    const repo: any = { findOne: jest.fn(async () => user) };
    const config: any = { get: () => 'secreto-de-prueba-largo' };
    const estado: any = { enSoloLectura: jest.fn(async () => false) };
    return new JwtStrategy(repo, config, estado);
  };
  const usuario = (p: any = {}) => ({
    id: 'u1', activo: true, tokenVersion: 1, companyId: 'c1', role: { nombre: 'tecnico' }, debe_cambiar_clave: false, ...p,
  });
  const payload = { id: 'u1', tokenVersion: 1 };

  it('sin el flag, pasa a cualquier ruta', async () => {
    await expect(armar(usuario()).validate({ originalUrl: '/api/repair-orders' } as any, payload)).resolves.toMatchObject({ id: 'u1' });
  });

  it('con el flag: me, cambiar-clave y logout sí; el resto, 403 DEBE_CAMBIAR_CLAVE', async () => {
    const s = armar(usuario({ debe_cambiar_clave: true }));
    for (const u of ['/api/auth/me', '/api/auth/cambiar-clave', '/api/auth/logout']) {
      await expect(s.validate({ originalUrl: u } as any, payload)).resolves.toMatchObject({ id: 'u1' });
    }
    await expect(s.validate({ originalUrl: '/api/customers' } as any, payload)).rejects.toMatchObject({
      response: { code: 'DEBE_CAMBIAR_CLAVE' },
    });
  });

  it('el token de antes del cambio o del reseteo ya no vale (tokenVersion)', async () => {
    await expect(
      armar(usuario({ tokenVersion: 2 })).validate({ originalUrl: '/api/auth/me' } as any, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('SEG-54 — rutas, roles y rate limit', () => {
  const roles = (m: keyof AuthController) => Reflect.getMetadata(META_ROLES, AuthController.prototype[m]);
  const guard = Object.create(TenantThrottlerGuard.prototype) as { getTracker(r: unknown): Promise<string> };

  it('resetear es del admin (el superadmin pasa por el guard)', () => {
    expect(roles('resetearClave')).toEqual([Roles.ADMIN]);
  });

  it('cambiar-clave tiene el mismo tope que el login: 5 por minuto', () => {
    const throttle = (m: keyof AuthController) => [
      Reflect.getMetadata('THROTTLER:LIMITshort', AuthController.prototype[m]),
      Reflect.getMetadata('THROTTLER:TTLshort', AuthController.prototype[m]),
    ];
    expect(throttle('cambiarClave')).toEqual(throttle('login'));
    expect(throttle('cambiarClave')).toEqual([5, 60000]);
  });

  it('el tope de cambiar-clave se cuenta por sesión (token hasheado), no por la IP del taller', async () => {
    const pedido = (token: string, ip: string) => ({ headers: { authorization: `Bearer ${token}` }, url: '/api/auth/cambiar-clave', ip });
    const a = await guard.getTracker(pedido('token-a', '200.1.1.1'));
    const b = await guard.getTracker(pedido('token-b', '200.1.1.1'));
    const a2 = await guard.getTracker(pedido('token-a', '9.9.9.9'));
    expect(a).not.toBe(b);
    expect(a).toBe(a2);
    expect(a).toMatch(/^clave:[0-9a-f]{32}$/);
    expect(a).not.toContain('token-a');
  });
});
