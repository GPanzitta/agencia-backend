import { ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AbonoController } from './abono.controller';
import { EstadoAbonoService } from './estado-abono.service';

describe('sólo lectura en la sesión del personal', () => {
  const usuario = (p: Record<string, unknown> = {}) => ({
    id: 'u1', activo: true, tokenVersion: 1, companyId: 'c1', role: { nombre: 'admin' }, debe_cambiar_clave: false, ...p,
  });
  const payload = { id: 'u1', tokenVersion: 1 };

  function armar(user: unknown, enSoloLectura = true) {
    const repo = { findOne: jest.fn(async () => user) };
    const config = { get: () => 'secreto-de-prueba-largo' };
    const estado = { enSoloLectura: jest.fn(async () => enSoloLectura) };
    return { estado, strategy: new JwtStrategy(repo as never, config as never, estado as never) };
  }

  const pedido = (method: string, originalUrl: string) => ({ method, originalUrl }) as never;

  it('un POST de un taller en sólo lectura da 403 con el código', async () => {
    const { strategy } = armar(usuario());
    const intento = strategy.validate(pedido('POST', '/api/unidades'), payload);
    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(intento).rejects.toMatchObject({ response: { code: 'TALLER_SOLO_LECTURA' } });
  });

  it.each(['PATCH', 'PUT', 'DELETE'])('también frena %s', async (method) => {
    const { strategy } = armar(usuario());
    await expect(strategy.validate(pedido(method, '/api/unidades/1'), payload)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un GET pasa y no consulta el estado: ver y exportar no cuesta una consulta más', async () => {
    const { strategy, estado } = armar(usuario());
    await expect(strategy.validate(pedido('GET', '/api/unidades'), payload)).resolves.toBeTruthy();
    expect(estado.enSoloLectura).not.toHaveBeenCalled();
  });

  it.each(['/api/abono/suscribir', '/api/abono/volver-a-gratis', '/api/auth/cambiar-clave', '/api/auth/logout'])(
    'el taller no queda encerrado: %s pasa',
    async (url) => {
      const { strategy } = armar(usuario());
      await expect(strategy.validate(pedido('POST', url), payload)).resolves.toBeTruthy();
    },
  );

  it('un taller al día escribe normalmente', async () => {
    const { strategy, estado } = armar(usuario(), false);
    await expect(strategy.validate(pedido('POST', '/api/unidades'), payload)).resolves.toBeTruthy();
    expect(estado.enSoloLectura).toHaveBeenCalledWith('c1');
  });

  it('el superadmin, sin empresa, no pasa por el control', async () => {
    const { strategy, estado } = armar(usuario({ companyId: null, role: { nombre: 'superadmin' } }));
    await expect(strategy.validate(pedido('POST', '/api/admin/setup-company'), payload)).resolves.toBeTruthy();
    expect(estado.enSoloLectura).not.toHaveBeenCalled();
  });

  it('la clave provisoria se sigue evaluando primero', async () => {
    const { strategy } = armar(usuario({ debe_cambiar_clave: true }));
    await expect(strategy.validate(pedido('POST', '/api/unidades'), payload)).rejects.toMatchObject({
      response: { code: 'DEBE_CAMBIAR_CLAVE' },
    });
  });
});

describe('EstadoAbonoService', () => {
  const config = { precio_mensual: 25000, tope_ordenes_gratis: 30, dias_gracia: 7 };

  function armar(company: unknown) {
    const companies = { findOne: jest.fn(async () => company) };
    const configs = { findOneBy: jest.fn(async () => config) };
    return new EstadoAbonoService(companies as never, configs as never);
  }

  it('un plan pago pasada la gracia está en sólo lectura', async () => {
    const vencio = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    await expect(armar({ plan: 'pago', abono_vence_en: vencio }).enSoloLectura('c1')).resolves.toBe(true);
  });

  it('dentro de la gracia todavía puede trabajar', async () => {
    const vencio = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    await expect(armar({ plan: 'pago', abono_vence_en: vencio }).enSoloLectura('c1')).resolves.toBe(false);
  });

  it('el plan interno nunca queda en sólo lectura', async () => {
    await expect(armar({ plan: 'interno', abono_vence_en: null }).enSoloLectura('c1')).resolves.toBe(false);
  });

  it('una empresa inexistente no bloquea', async () => {
    await expect(armar(null).enSoloLectura('c1')).resolves.toBe(false);
  });
});

describe('Mercado Pago no se entera', () => {
  it('el webhook del abono no pide JWT', () => {
    expect(Reflect.getMetadata('__guards__', AbonoController.prototype.webhook)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', AbonoController)).toBeUndefined();
  });
});
