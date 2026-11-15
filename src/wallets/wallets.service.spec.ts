import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';
import { Company } from '../companies/entities/company.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

/**
 * #41 (tanda 4): la billetera donde entran los cobros de Mercado Pago o las
 * transferencias de la empresa no se puede desactivar ni borrar. Si se
 * pudiera, el próximo pago de MP llega a una billetera muerta: el asiento se
 * rechaza y el cobro queda sin plata en ninguna caja.
 */
describe('WalletsService — la billetera de cobros no se da de baja (#41)', () => {
  let service: WalletsService;
  let billetera: Partial<Wallet>;
  let walletRepo: { findOne: jest.Mock; merge: jest.Mock; save: jest.Mock };
  let companyRepo: { findOne: jest.Mock };
  let empresas: Partial<Company>[];

  beforeEach(async () => {
    billetera = { id: 'w-mp', name: 'Mercado Pago', companyId: 'c1', is_active: true, is_deleted: false };
    empresas = [];
    walletRepo = {
      findOne: jest.fn(async () => billetera),
      merge: jest.fn((w: Wallet, dto: Partial<Wallet>) => Object.assign(w, dto)),
      save: jest.fn(async (w: Wallet) => w),
    };
    // Imita el `where` en forma de lista (OR) que arma el servicio.
    companyRepo = {
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown>[] }) =>
        empresas.find((c) =>
          where.some((w) => Object.entries(w).every(([k, v]) => (c as Record<string, unknown>)[k] === v)),
        ) ?? null,
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
      ],
    }).compile();
    service = module.get(WalletsService);
  });

  async function rechazo(p: Promise<unknown>): Promise<ErrorDeNegocio> {
    try {
      await p;
    } catch (e) {
      return e as ErrorDeNegocio;
    }
    throw new Error('se esperaba un rechazo');
  }

  describe.each([
    ['la de cobros de Mercado Pago', { mp_wallet_id: 'w-mp' }, 'mercado_pago'],
    ['la de transferencias', { transferencia_wallet_id: 'w-mp' }, 'transferencia'],
  ])('%s', (_caso, campos, uso) => {
    beforeEach(() => empresas.push({ id: 'c1', mp_wallet_id: null, transferencia_wallet_id: null, ...campos }));

    it('desactivarla se rechaza con BILLETERA_EN_USO y no se guarda', async () => {
      const e = await rechazo(service.update('w-mp', { is_active: false }));
      expect(e).toBeInstanceOf(ErrorDeNegocio);
      expect(e.getResponse()).toMatchObject({ code: 'BILLETERA_EN_USO', uso, billetera: 'Mercado Pago' });
      expect(walletRepo.save).not.toHaveBeenCalled();
    });

    it('borrarla se rechaza con BILLETERA_EN_USO y no se guarda', async () => {
      const e = await rechazo(service.remove('w-mp'));
      expect(e.getResponse()).toMatchObject({ code: 'BILLETERA_EN_USO', uso });
      expect(walletRepo.save).not.toHaveBeenCalled();
    });

    it('renombrarla sigue permitido', async () => {
      await service.update('w-mp', { name: 'MP del taller' });
      expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'MP del taller', is_active: true }));
    });

    it('reenviar is_active: true (sin desactivarla) también', async () => {
      await service.update('w-mp', { name: 'MP', is_active: true });
      expect(walletRepo.save).toHaveBeenCalled();
    });
  });

  it('busca sólo en la empresa dueña de la billetera, por los dos campos', async () => {
    await service.remove('w-mp');
    expect(companyRepo.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'c1', mp_wallet_id: 'w-mp' },
        { id: 'c1', transferencia_wallet_id: 'w-mp' },
      ],
    });
  });

  it('una referencia cruzada de otra empresa no la traba: se puede dar de baja', async () => {
    empresas.push({ id: 'c2', mp_wallet_id: 'w-mp', transferencia_wallet_id: 'w-mp' });
    await service.remove('w-mp');
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: true, is_active: false }));
  });

  it('una billetera que no es de cobros se desactiva como siempre', async () => {
    empresas.push({ id: 'c1', mp_wallet_id: 'otra', transferencia_wallet_id: 'otra' });
    await service.update('w-mp', { is_active: false });
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });
});
