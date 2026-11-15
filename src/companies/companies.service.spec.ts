import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { instanceToPlain } from 'class-transformer';

import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

/**
 * D2: la billetera de transferencias (y la de Mercado Pago) se asignan desde
 * Configuración › Empresa. Asignar una billetera que no existe, está
 * desactivada o es la caja de una ruta abierta se rechaza antes de guardar.
 * Desactivar una billetera ya asignada es otro hallazgo (#41, tanda 4).
 */
describe('CompaniesService — billeteras de cobro (D2)', () => {
  const admin = { id: 'u1', companyId: 'c1' } as User;
  let service: CompaniesService;
  let empresa: Partial<Company>;
  let companyRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let walletRepo: { findOneBy: jest.Mock };

  const billeteras: Record<string, Partial<Wallet>> = {
    'w-mp': { id: 'w-mp', name: 'Mercado Pago', companyId: 'c1', is_active: true, is_deleted: false },
    'w-banco': { id: 'w-banco', name: 'Banco Galicia', companyId: 'c1', is_active: true, is_deleted: false },
    'w-caja': { id: 'w-caja', name: 'Caja efectivo', companyId: 'c1', is_active: true, is_deleted: false },
    'w-inactiva': { id: 'w-inactiva', name: 'Vieja', companyId: 'c1', is_active: false, is_deleted: false },
    'w-borrada': { id: 'w-borrada', name: 'Borrada', companyId: 'c1', is_active: true, is_deleted: true },
    'w-ajena': { id: 'w-ajena', name: 'De otro taller', companyId: 'c2', is_active: true, is_deleted: false },
  };

  beforeEach(async () => {
    empresa = { id: 'c1', name: 'Taller', mp_wallet_id: 'w-mp', transferencia_wallet_id: null };
    companyRepo = {
      findOneBy: jest.fn(async () => empresa),
      save: jest.fn(async (c: Company) => c),
    };
    walletRepo = { findOneBy: jest.fn(async ({ id }: { id: string }) => billeteras[id] ?? null) };

    const module = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(Wallet), useValue: walletRepo },
      ],
    }).compile();
    service = module.get(CompaniesService);
  });

  async function rechazo(p: Promise<unknown>): Promise<unknown> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('se esperaba un rechazo');
  }

  describe('primeros pasos', () => {
    let manager: { count: jest.Mock; findOne: jest.Mock; query: jest.Mock };
    beforeEach(() => {
      manager = { count: jest.fn(async () => 0), findOne: jest.fn(async () => ({ logo_url: 'x' })), query: jest.fn(async () => [{ n: 0 }]) };
      (companyRepo as any).manager = manager;
    });

    it('cuenta sólo lo de la empresa de la sesión', async () => {
      Object.assign(empresa, { primeros_pasos: {} });
      const r = await service.primerosPasos(admin);
      expect(manager.count.mock.calls.every(([, o]: any[]) => o.where.companyId === 'c1')).toBe(true);
      expect(r.cerrado).toBe(false);
      expect(r.pasos.find((p) => p.clave === 'logo')?.hecho).toBe(true);
      // Agencia: las cuentas propias (cajas en dólares, unidades) también van sólo con la empresa de la sesión.
      expect(manager.query.mock.calls.every(([, params]: any[]) => params[0] === 'c1')).toBe(true);
      expect(r.pasos.find((p) => p.clave === 'unidad')?.hecho).toBe(false);
    });

    it('marcar suma a lo que había, sin pisarlo', async () => {
      Object.assign(empresa, { primeros_pasos: { plantillas_vistas: true } });
      await service.marcarPrimerosPasos(admin, { cerrado: true });
      expect(empresa.primeros_pasos).toEqual({ plantillas_vistas: true, cerrado: true });
      expect(companyRepo.save).toHaveBeenCalled();
    });
  });

  it('CLI-02: miEmpresa no devuelve el token de MP, sólo si hay uno', async () => {
    empresa.mp_access_token = 'APP_USR-123-secreto';
    const r: any = await service.miEmpresa(admin);
    expect(r).not.toHaveProperty('mp_access_token');
    expect(r.mp_configurado).toBe(true);
    empresa.mp_access_token = null;
    expect(((await service.miEmpresa(admin)) as any).mp_configurado).toBe(false);
  });

  it('miEmpresa dice cómo está conectado Mercado Pago', async () => {
    Object.assign(empresa, { mp_access_token: 'APP_USR-x', mp_user_id: '123', mp_token_vence: new Date('2027-01-01T00:00:00Z') });
    await expect(service.miEmpresa(admin)).resolves.toMatchObject({ mp_conexion: 'oauth', mp_user_id: '123', mp_token_vence: '2027-01-01T00:00:00.000Z' });
    Object.assign(empresa, { mp_user_id: null, mp_token_vence: null });
    await expect(service.miEmpresa(admin)).resolves.toMatchObject({ mp_conexion: 'manual', mp_token_vence: null });
    empresa.mp_access_token = null;
  });

  it('miEmpresa dice si este entorno permite el modo demo, para no ofrecerlo donde dejaría al taller sin cobrar', async () => {
    const antes = { STAGE: process.env.STAGE, MP: process.env.MP_PAGO_SIMULADO };
    process.env.STAGE = 'prod';
    delete process.env.MP_PAGO_SIMULADO;
    await expect(service.miEmpresa(admin)).resolves.toMatchObject({ mp_demo_permitida: false });
    process.env.MP_PAGO_SIMULADO = 'habilitado';
    await expect(service.miEmpresa(admin)).resolves.toMatchObject({ mp_demo_permitida: true });
    process.env.STAGE = antes.STAGE;
    if (antes.MP === undefined) delete process.env.MP_PAGO_SIMULADO; else process.env.MP_PAGO_SIMULADO = antes.MP;
  });

  it('pasar a modo demo a mano corta el OAuth: si no, la renovación diaria pisaría el SIMULADO', async () => {
    Object.assign(empresa, { mp_access_token: 'APP_USR-x', mp_refresh_token: 'TG-1', mp_user_id: '123', mp_token_vence: new Date(), mp_conectado_en: new Date() });
    await service.actualizar(admin, { mp_access_token: 'SIMULADO' } as any);
    expect(empresa).toMatchObject({ mp_access_token: 'SIMULADO', mp_refresh_token: null, mp_user_id: null, mp_token_vence: null, mp_conectado_en: null });
    empresa.mp_access_token = null;
  });

  it('la entidad serializada tampoco lleva los datos de la cuenta de Mercado Pago', () => {
    const c = Object.assign(new Company(), { id: 'c1', name: 'T', mp_user_id: '123', mp_cuenta: 'NANDU', mp_token_vence: new Date(), mp_conectado_en: new Date() });
    const plano = instanceToPlain(c);
    for (const campo of ['mp_user_id', 'mp_cuenta', 'mp_token_vence', 'mp_conectado_en']) expect(plano).not.toHaveProperty(campo);
  });

  it('CLI-02: la entidad serializada (GET /admin/companies, relaciones) tampoco lo lleva', () => {
    const c = Object.assign(new Company(), { id: 'c1', name: 'T', mp_access_token: 'APP_USR-123-secreto' });
    expect(instanceToPlain(c)).not.toHaveProperty('mp_access_token');
    expect(instanceToPlain({ envoltorio: c })).toEqual({ envoltorio: expect.not.objectContaining({ mp_access_token: expect.anything() }) });
  });

  it('CLI-02: sin el campo el token no se toca; vacío lo quita; uno nuevo se guarda sin espacios', async () => {
    empresa.mp_access_token = 'APP_USR-viejo';
    await service.actualizar(admin, { name: 'Taller' } as any);
    expect(empresa.mp_access_token).toBe('APP_USR-viejo');
    await service.actualizar(admin, { mp_access_token: ' APP_USR-nuevo ' } as any);
    expect(empresa.mp_access_token).toBe('APP_USR-nuevo');
    await service.actualizar(admin, { mp_access_token: '' } as any);
    expect(empresa.mp_access_token).toBeNull();
  });

  it('miEmpresa devuelve el descuento máximo del mostrador como número (10 si no hay)', async () => {
    expect((await service.miEmpresa(admin)).descuento_maximo_mostrador).toBe(10);
    (empresa as any).descuento_maximo_mostrador = '15.00';
    expect((await service.miEmpresa(admin)).descuento_maximo_mostrador).toBe(15);
  });

  it('miEmpresa devuelve la billetera de transferencias (null si no está configurada)', async () => {
    expect((await service.miEmpresa(admin)).transferencia_wallet_id).toBeNull();
    empresa.transferencia_wallet_id = 'w-banco';
    expect((await service.miEmpresa(admin)).transferencia_wallet_id).toBe('w-banco');
  });

  it('asigna la billetera de transferencias y la devuelve', async () => {
    const r = await service.actualizar(admin, { transferencia_wallet_id: 'w-banco' });
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ transferencia_wallet_id: 'w-banco' }));
    expect(r.transferencia_wallet_id).toBe('w-banco');
  });

  it('null la borra, sin consultar billeteras', async () => {
    empresa.transferencia_wallet_id = 'w-banco';
    await service.actualizar(admin, { transferencia_wallet_id: null as unknown as string });
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ transferencia_wallet_id: null }));
    expect(walletRepo.findOneBy).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente', 'w-no-existe'],
    ['de otra empresa', 'w-ajena'],
    ['desactivada', 'w-inactiva'],
    ['borrada', 'w-borrada'],
  ])('una billetera %s: 400 y no se guarda nada', async (_caso, id) => {
    const e = await rechazo(service.actualizar(admin, { transferencia_wallet_id: id }));
    expect(e).toBeInstanceOf(BadRequestException);
    expect((e as BadRequestException).message).toBe('Esa billetera no existe o está desactivada.');
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  // #41 (tanda 4): el mismo criterio para la de Mercado Pago, que es la que
  // usa el webhook. Una billetera muerta ahí deja el cobro sin asiento.
  it.each([
    ['inexistente', 'w-no-existe'],
    ['de otra empresa', 'w-ajena'],
    ['desactivada', 'w-inactiva'],
    ['borrada', 'w-borrada'],
  ])('Mercado Pago: una billetera %s también da 400 y no se guarda nada', async (_caso, id) => {
    const e = await rechazo(service.actualizar(admin, { mp_wallet_id: id }));
    expect(e).toBeInstanceOf(BadRequestException);
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  it('null limpia la de Mercado Pago sin consultar billeteras', async () => {
    await service.actualizar(admin, { mp_wallet_id: null as unknown as string });
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mp_wallet_id: null }));
    expect(walletRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('Mercado Pago y transferencias pueden ser la misma billetera', async () => {
    await service.actualizar(admin, { mp_wallet_id: 'w-mp', transferencia_wallet_id: 'w-mp' });
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mp_wallet_id: 'w-mp', transferencia_wallet_id: 'w-mp' }));
  });

  it('el formulario reenvía la billetera que ya tenía: no se revalida (guardar otro dato no queda trabado)', async () => {
    empresa.mp_wallet_id = 'w-inactiva';
    await service.actualizar(admin, { name: 'Taller Nuevo', mp_wallet_id: 'w-inactiva' });
    expect(walletRepo.findOneBy).not.toHaveBeenCalled();
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Taller Nuevo' }));
  });
});

describe('CompaniesService — capa comercial de la tienda (spec 2026-10-07 §3.2)', () => {
  const admin = { id: 'u1', companyId: 'c1' } as User;
  let service: CompaniesService;
  let empresa: Partial<Company>;
  let companyRepo: { findOneBy: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    empresa = {
      id: 'c1', name: 'Taller', transferencia_wallet_id: 'w-banco', transferencia_tienda_habilitada: false,
      transferencia_cbu: null, transferencia_alias: null, transferencia_titular: null,
    };
    companyRepo = { findOneBy: jest.fn(async () => empresa), save: jest.fn(async (c: Company) => c) };
    const module = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(Wallet), useValue: { findOneBy: jest.fn() } },
      ],
    }).compile();
    service = module.get(CompaniesService);
  });

  it('miEmpresa devuelve los campos comerciales con sus valores por defecto y como números', async () => {
    const e = await service.miEmpresa(admin);
    expect(e).toMatchObject({
      alicuota_iva_defecto: 21, cuotas_tienda: [], transferencia_tienda_habilitada: false, transferencia_descuento_porcentaje: 0,
      transferencia_cbu: null, transferencia_alias: null, transferencia_titular: null, envio_gratis_desde: null,
    });
    Object.assign(empresa, { alicuota_iva_defecto: '10.50', transferencia_descuento_porcentaje: '7.50', envio_gratis_desde: '50000.00' });
    expect(await service.miEmpresa(admin)).toMatchObject({ alicuota_iva_defecto: 10.5, transferencia_descuento_porcentaje: 7.5, envio_gratis_desde: 50000 });
  });

  it('habilitar la transferencia sin datos: TRANSFERENCIA_INCOMPLETA con lo que falta, y no guarda', async () => {
    await expect(service.actualizar(admin, { transferencia_tienda_habilitada: true })).rejects.toMatchObject({
      codigo: 'TRANSFERENCIA_INCOMPLETA',
      response: expect.objectContaining({ faltan: ['cbu_o_alias', 'titular'] }),
    });
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  it('habilitar con alias, titular y caja guarda', async () => {
    await service.actualizar(admin, {
      transferencia_tienda_habilitada: true, transferencia_alias: 'taller.demo', transferencia_titular: 'Taller Demo SRL',
    });
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ transferencia_tienda_habilitada: true }));
  });

  it('sacar la caja con la transferencia prendida también es TRANSFERENCIA_INCOMPLETA', async () => {
    Object.assign(empresa, { transferencia_tienda_habilitada: true, transferencia_alias: 'taller.demo', transferencia_titular: 'T' });
    await expect(service.actualizar(admin, { transferencia_wallet_id: null as unknown as string })).rejects.toMatchObject({
      codigo: 'TRANSFERENCIA_INCOMPLETA',
    });
  });

  it('dos planes con las mismas cuotas: DATOS_INVALIDOS', async () => {
    await expect(
      service.actualizar(admin, { cuotas_tienda: [{ cuotas: 3, sin_interes: true }, { cuotas: 3, sin_interes: false }] }),
    ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  });
});

describe('CompaniesService — datos legales de los documentos (opción B)', () => {
  const admin = { id: 'u1', companyId: 'c1' } as User;
  let service: CompaniesService;
  let empresa: Partial<Company>;
  let companyRepo: { findOneBy: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    empresa = { id: 'c1', name: 'GUSMAT', mp_access_token: 'APP_USR-secreto' };
    companyRepo = { findOneBy: jest.fn(async () => empresa), save: jest.fn(async (c: Company) => c) };
    const module = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(Wallet), useValue: { findOneBy: jest.fn() } },
      ],
    }).compile();
    service = module.get(CompaniesService);
  });

  it('sin cargar: null en los de texto y los defaults de la columna en el resto', async () => {
    expect(await service.miEmpresa(admin)).toMatchObject({
      razon_social: null, condicion_iva: null, iibb: null, inicio_actividades: null, email_contacto: null,
      horario_atencion: null, traslado_garantia: null,
      costo_revision: 0, revision_se_descuenta: true, plazo_presupuesto_dias: 2, plazo_reparacion_dias: 10,
      canon_guarda_diario: 0, revision_garantia_dias: 5, factura_momento: 'al_cobrar',
    });
  });

  it('guarda los 14 y los devuelve, con los montos como número y sin el token de MP', async () => {
    const dto = {
      razon_social: 'GUSMAT S.R.L.', condicion_iva: 'responsable_inscripto' as const, iibb: '1234567-08',
      inicio_actividades: '2020-03-01', email_contacto: 'hola@gusmat.com.ar', horario_atencion: 'lunes a sábados de 9 a 18 h',
      costo_revision: 15000, revision_se_descuenta: false, plazo_presupuesto_dias: 3, plazo_reparacion_dias: 12,
      canon_guarda_diario: 1000, revision_garantia_dias: 7, factura_momento: 'al_senar' as const, traslado_garantia: 'Lo traés vos.',
    };
    const r = await service.actualizar(admin, dto);
    expect(companyRepo.save).toHaveBeenCalledWith(expect.objectContaining(dto));
    // Postgres devuelve los decimal como texto: el GET los da como número.
    Object.assign(empresa, { costo_revision: '15000.00', canon_guarda_diario: '1000.00' });
    expect(await service.miEmpresa(admin)).toMatchObject({ ...dto, costo_revision: 15000, canon_guarda_diario: 1000 });
    expect(r).not.toHaveProperty('mp_access_token');
  });

  it('un dato legal en blanco se guarda como null (el pie no imprime «IIBB »)', async () => {
    await service.actualizar(admin, { razon_social: '  ', iibb: '', email_contacto: ' hola@gusmat.com.ar ' } as any);
    expect(empresa).toMatchObject({ razon_social: null, iibb: null, email_contacto: 'hola@gusmat.com.ar' });
  });
});
