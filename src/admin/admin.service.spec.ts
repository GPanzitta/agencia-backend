import { AdminService } from './admin.service';
import { tenantContext } from '../tenant/tenant.context';
import { Company } from '../companies/entities/company.entity';
import { User } from '../auth/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { PaymentMethod } from '../payment-methods/entities/payment-method.entity';
import { Wallet } from '../wallets/entities/wallet.entity';

/**
 * CLI-01: el superadmin tiene empresa (GUSMAT), así que el alta corre con ese
 * contexto. Sin base: el `em` falso anota con qué empresa del contexto se hizo
 * cada lectura y cada escritura, que es lo que el parche de tenant usa para
 * filtrar y para pisar `companyId`.
 */
describe('AdminService.createCompanyWithUsers (CLI-01)', () => {
  const GUSMAT = 'c-gusmat';
  let em: any;
  let contextos: Array<{ op: string; entidad: string; empresa: string | undefined }>;
  let service: AdminService;
  let usuarios: any[];

  beforeEach(() => {
    contextos = [];
    usuarios = [];
    const anotar = (op: string, entidad: any) =>
      contextos.push({ op, entidad: entidad?.name ?? String(entidad), empresa: tenantContext.getStore() });
    em = {
      findOneBy: jest.fn(async (entidad: any, where: any) => {
        anotar('findOneBy', entidad);
        if (entidad === Role) return { id: 'r-admin', nombre: 'admin' };
        if (entidad === User) return usuarios.find((u) => u.email === where.email) ?? null;
        return null;
      }),
      find: jest.fn(async (entidad: any) => {
        anotar('find', entidad);
        return [];
      }),
      create: jest.fn((_entidad: any, x: any) => (Array.isArray(x) ? x.map((y) => ({ ...y })) : { ...x })),
      save: jest.fn(async (entidad: any, x: any) => {
        anotar('save', entidad);
        if (entidad === Company) return { ...x, id: 'c-nueva' };
        return x;
      }),
      getRepository: jest.fn((entidad: any) => ({
        find: (o: any) => em.find(entidad, o),
        create: (x: any) => em.create(entidad, x),
        save: (x: any) => em.save(entidad, x),
      })),
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    service = new AdminService({} as any, dataSource as any);
  });

  const altaComoSuperadmin = (nombre = 'Taller Sur') =>
    tenantContext.run(GUSMAT, () => service.createCompanyWithUsers({ companyName: nombre }));

  describe('alta pública (etapa 2)', () => {
    const datos = { taller: 'Taller Ñandú', nombre: 'Ana Paz', email: 'ana@mail.com', telefono: '1155550000', claveHash: 'hash', rubros: ['Heladeras'] };

    it('todo queda en la empresa nueva, aunque corra sin contexto: admin, medios y billeteras', async () => {
      const r = await service.crearTallerPublico(datos);
      expect(r.companyId).toBe('c-nueva');
      const delTaller = contextos.filter((c) => c.op === 'save' && c.entidad !== 'Company');
      expect(delTaller.map((c) => c.entidad)).toEqual(expect.arrayContaining(['User', 'PaymentMethod', 'Wallet']));
      expect(delTaller.every((c) => c.empresa === 'c-nueva')).toBe(true);
    });

    it('el admin nace con la clave elegida y sin poder entrar hasta confirmar', async () => {
      await service.crearTallerPublico(datos);
      const admin = em.save.mock.calls.find(([e]: any[]) => e === User)[1];
      expect(admin).toMatchObject({ email: 'ana@mail.com', nombre: 'Ana Paz', password: 'hash', confirmacion_pendiente: true, companyId: 'c-nueva' });
    });

    it('la empresa guarda el teléfono y los rubros declarados', async () => {
      await service.crearTallerPublico(datos);
      const empresa = em.save.mock.calls.find(([e]: any[]) => e === Company)[1];
      expect(empresa).toMatchObject({ name: 'Taller Ñandú', telefono: '1155550000', rubros_declarados: ['Heladeras'] });
    });

    it('nace con una caja de efectivo y una billetera de Mercado Pago', async () => {
      await service.crearTallerPublico(datos);
      const billeteras = em.save.mock.calls.find(([e]: any[]) => e === Wallet)[1];
      expect(billeteras.map((b: any) => b.name)).toEqual(['Efectivo', 'Mercado Pago']);
      expect(billeteras.every((b: any) => b.companyId === 'c-nueva')).toBe(true);
    });

    it('un nombre que ya existe se rechaza con una salida clara', async () => {
      em.findOneBy.mockImplementation(async (entidad: any) => (entidad === Company ? { id: 'otra' } : null));
      await expect(service.crearTallerPublico(datos)).rejects.toMatchObject({ codigo: 'TALLER_YA_EXISTE' });
      await expect(service.crearTallerPublico(datos)).rejects.toThrow('agregale la ciudad o el barrio');
    });
  });

  it('el alta del superadmin deja la cuenta lista para entrar', async () => {
    await altaComoSuperadmin();
    const admin = em.save.mock.calls.find(([e]: any[]) => e === User)[1];
    expect(admin.confirmacion_pendiente).toBe(false);
  });

  it('lo global (nombre y correo) se mira sin la empresa del superadmin', async () => {
    await altaComoSuperadmin();
    const globales = contextos.filter((c) => c.op === 'findOneBy' && (c.entidad === 'Company' || c.entidad === 'User'));
    expect(globales.length).toBeGreaterThanOrEqual(2);
    expect(globales.every((c) => c.empresa === undefined)).toBe(true);
  });

  it('el admin y los medios de pago se guardan con el contexto del taller NUEVO', async () => {
    const r = await altaComoSuperadmin();
    const delTaller = contextos.filter((c) => c.op === 'save' && ['User', 'PaymentMethod'].includes(c.entidad));
    expect(delTaller.map((c) => c.entidad)).toEqual(expect.arrayContaining(['User', 'PaymentMethod']));
    expect(delTaller.every((c) => c.empresa === 'c-nueva')).toBe(true);
    expect(contextos.some((c) => c.empresa === GUSMAT)).toBe(false);
    expect(r.users).toEqual([{ email: 'admin@tallersur.com', role: 'admin' }]);
    expect(r.clave_inicial).toEqual(expect.any(String));
    const admin = em.save.mock.calls.find(([e]: any[]) => e === User)[1];
    expect(admin.companyId).toBe('c-nueva');
  });

  it('todo va en una sola transacción', async () => {
    await altaComoSuperadmin();
    expect(em.save.mock.calls.map(([e]: any[]) => e)).toEqual(
      expect.arrayContaining([Company, User, PaymentMethod]),
    );
  });

  it('un correo que ya existe en otro taller: 400 claro, sin crear la empresa', async () => {
    usuarios.push({ email: 'admin@tallersur.com' });
    await expect(altaComoSuperadmin()).rejects.toThrow(/Ya existe un usuario/);
    expect(em.save).not.toHaveBeenCalledWith(Company, expect.anything());
  });
});

describe('AdminService.actualizarTallerPendiente', () => {
  const datos = { taller: 'Nuevo', nombre: 'Ana', telefono: '11', claveHash: 'h2', rubros: [] };
  const armar = (ocupado: any) => {
    const em: any = { findOneBy: jest.fn(async () => ocupado), update: jest.fn(async () => ({})) };
    return { em, service: new AdminService({} as any, { transaction: async (cb: any) => cb(em) } as any) };
  };
  it('pisa nombre, teléfono y clave, y la clave sólo si sigue pendiente', async () => {
    const { em, service } = armar(null);
    await service.actualizarTallerPendiente('u1', 'c1', datos);
    expect(em.update).toHaveBeenCalledWith(Company, { id: 'c1' }, expect.objectContaining({ name: 'Nuevo', telefono: '11' }));
    expect(em.update).toHaveBeenCalledWith(User, { id: 'u1', confirmacion_pendiente: true }, { nombre: 'Ana', password: 'h2' });
  });
  it('un nombre de otro taller se rechaza; el propio no', async () => {
    await expect(armar({ id: 'c2' }).service.actualizarTallerPendiente('u1', 'c1', datos)).rejects.toMatchObject({ codigo: 'TALLER_YA_EXISTE' });
    await expect(armar({ id: 'c1' }).service.actualizarTallerPendiente('u1', 'c1', datos)).resolves.toBeUndefined();
  });
});
