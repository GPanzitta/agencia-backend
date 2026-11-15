import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminController } from './admin.controller';
import { ConfigPlataformaDto, PlanTallerDto } from './dto/plataforma.dto';
import { PlataformaService } from './plataforma.service';
import { Roles } from '../enums/roles.enum';
import { META_ROLES } from '../auth/decorators/user-protected.decorator';

const config = { id: 1, precio_mensual: 25000, tope_ordenes_gratis: 30, dias_gracia: 7 };

function armar(filas: unknown[] = [], empresa: unknown = { id: 'c1', plan: 'pago' }) {
  const dataSource = { query: jest.fn(async () => filas) };
  const companies = {
    findOne: jest.fn(async () => empresa),
    update: jest.fn(async () => undefined),
  };
  const configs = { save: jest.fn(async (c: unknown) => c) };
  const estado = { config: jest.fn(async () => config) };
  const service = new PlataformaService(dataSource as never, companies as never, configs as never, estado as never);
  return { service, dataSource, companies, configs };
}

describe('PlataformaService.talleres', () => {
  const alta = new Date('2026-01-01T00:00:00.000Z');

  it('arma todo con una sola consulta', async () => {
    const { service, dataSource } = armar([]);
    await service.talleres();
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('cuenta las unidades en stock con la misma regla que el tope', async () => {
    const { service, dataSource } = armar([]);
    await service.talleres();
    const [sql] = dataSource.query.mock.calls[0] as unknown as [string];
    expect(sql).toMatch(/FROM "unidades"/);
    expect(sql).toMatch(/'ingreso', 'alistaje', 'disponible', 'reservada'/);
    expect(sql).toMatch(/MAX\(o\."updated_at"\)/);
    expect(sql).toMatch(/COALESCE\(/);
  });

  it('calcula el estado de cada taller', async () => {
    const vencio = new Date(Date.now() - 8 * 86400000);
    const { service } = armar([
      { id: 'a', nombre: 'A', plan: 'pago', vence_en: vencio, ultima_actividad: alta, ordenes_mes: 2, creado_en: alta },
      { id: 'b', nombre: 'B', plan: 'gratis', vence_en: null, ultima_actividad: alta, ordenes_mes: 0, creado_en: alta },
    ]);
    const lista = await service.talleres();
    expect(lista.map((t) => t.estado)).toEqual(['solo_lectura', 'al_dia']);
    expect(lista[0]).toMatchObject({ id: 'a', nombre: 'A', ordenes_mes: 2 });
  });
});

describe('PlataformaService.cambiarPlan', () => {
  it('guarda el plan pago con su vencimiento', async () => {
    const { service, companies } = armar();
    await service.cambiarPlan('c1', { plan: 'pago', vence_en: '2026-12-01T00:00:00.000Z' });
    expect(companies.update).toHaveBeenCalledWith('c1', { plan: 'pago', abono_vence_en: new Date('2026-12-01T00:00:00.000Z') });
  });

  it('un plan pago sin vencimiento da 400', async () => {
    const { service, companies } = armar();
    await expect(service.cambiarPlan('c1', { plan: 'pago' })).rejects.toMatchObject({ status: 400 });
    expect(companies.update).not.toHaveBeenCalled();
  });

  it('los otros planes no guardan vencimiento', async () => {
    const { service, companies } = armar();
    await service.cambiarPlan('c1', { plan: 'interno', vence_en: '2026-12-01T00:00:00.000Z' });
    expect(companies.update).toHaveBeenCalledWith('c1', { plan: 'interno', abono_vence_en: null });
  });

  it('un taller inexistente da 404', async () => {
    const { service } = armar([], null);
    await expect(service.cambiarPlan('x', { plan: 'gratis' })).rejects.toMatchObject({ status: 404 });
  });

  it('con una suscripción activa no se saca del plan pago: MP le seguiría cobrando', async () => {
    const { service, companies } = armar([], { id: 'c1', plan: 'pago', mp_preapproval_estado: 'authorized' });
    await expect(service.cambiarPlan('c1', { plan: 'gratis' })).rejects.toMatchObject({ status: 409 });
    expect(companies.update).not.toHaveBeenCalled();
  });

  it('con una suscripción activa sí se puede correr el vencimiento', async () => {
    const { service, companies } = armar([], { id: 'c1', plan: 'pago', mp_preapproval_estado: 'authorized' });
    await service.cambiarPlan('c1', { plan: 'pago', vence_en: '2026-12-01T00:00:00.000Z' });
    expect(companies.update).toHaveBeenCalled();
  });
});

describe('PlataformaService.guardarConfig', () => {
  it('guarda los tres valores en la única fila', async () => {
    const { service, configs } = armar();
    await service.guardarConfig({ precio_mensual: 30000, tope_ordenes_gratis: 20, dias_gracia: 5 });
    expect(configs.save).toHaveBeenCalledWith({ id: 1, precio_mensual: 30000, tope_ordenes_gratis: 20, dias_gracia: 5 });
  });
});

describe('DTOs del panel', () => {
  const errores = async (dto: object, clase: new () => object) => (await validate(plainToInstance(clase, dto))).map((e) => e.property);
  const bien = { precio_mensual: 25000, tope_ordenes_gratis: 30, dias_gracia: 7 };

  it('acepta los valores decididos', async () => {
    await expect(errores(bien, ConfigPlataformaDto)).resolves.toEqual([]);
  });

  it.each([
    ['precio_mensual', 0],
    ['tope_ordenes_gratis', 0],
    ['tope_ordenes_gratis', 1.5],
    ['dias_gracia', -1],
    ['dias_gracia', 61],
  ])('rechaza %s = %s', async (campo, valor) => {
    await expect(errores({ ...bien, [campo]: valor }, ConfigPlataformaDto)).resolves.toEqual([campo]);
  });

  it('acepta cero días de gracia', async () => {
    await expect(errores({ ...bien, dias_gracia: 0 }, ConfigPlataformaDto)).resolves.toEqual([]);
  });

  it('rechaza un plan que no existe', async () => {
    await expect(errores({ plan: 'oro' }, PlanTallerDto)).resolves.toEqual(['plan']);
  });

  it('rechaza una fecha inválida', async () => {
    await expect(errores({ plan: 'pago', vence_en: 'mañana' }, PlanTallerDto)).resolves.toEqual(['vence_en']);
  });
});

describe('el panel es sólo del dueño de la plataforma', () => {
  it.each(['talleresPlataforma', 'cambiarPlanTaller', 'configPlataforma', 'guardarConfigPlataforma'] as const)(
    '%s exige superadmin',
    (metodo) => {
      expect(Reflect.getMetadata(META_ROLES, AdminController.prototype[metodo])).toEqual([Roles.SUPERADMIN]);
    },
  );
});
