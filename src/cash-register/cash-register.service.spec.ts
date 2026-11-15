import { CashRegisterService } from './cash-register.service';
import { CashRegister, EstadoCaja } from './entities/cash-register.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

/**
 * PLA-04 (auditoría 13/10): un MOSTRADOR reescribía el saldo de cualquier
 * billetera abriendo un turno: la diferencia entre lo «contado» y el libro se
 * asentaba sola como «Arqueo de apertura», sin motivo ni aprobación.
 */
describe('CashRegisterService — abrir no mueve plata, cerrar ajusta con motivo (PLA-04)', () => {
  const wallet = { id: 'w1', name: 'Caja', is_active: true, is_deleted: false };

  function armar(opciones: { turno?: any } = {}) {
    const em: any = {
      query: jest.fn(async () => []),
      findOne: jest.fn(async (entidad: any) => {
        if (entidad === CashRegister) return opciones.turno ?? null;
        if (entidad === Wallet) return wallet;
        return null;
      }),
      create: jest.fn((_e: any, x: any) => x),
      save: jest.fn(async (_e: any, x: any) => ({ id: 'turno-1', ...x })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => opciones.turno ?? null),
      })),
    };
    const cashRegisterRepository: any = {
      manager: { transaction: jest.fn(async (fn: any) => fn(em)) },
      createQueryBuilder: jest.fn(() => ({ andWhere: jest.fn().mockReturnThis(), getCount: jest.fn(async () => 0) })),
      findOne: jest.fn(async () => ({ id: 'turno-1' })),
    };
    const userRepository: any = { findOneBy: jest.fn(async () => ({ id: 'u1' })) };
    const ledger: any = {
      saldo: jest.fn(async () => 10000),
      saldoEn: jest.fn(async () => 10000),
      ajustar: jest.fn(async () => ({})),
    };
    const service = new CashRegisterService(cashRegisterRepository, {} as any, userRepository, {} as any, {} as any, ledger);
    jest.spyOn((service as any).logger, 'warn').mockImplementation();
    return { service, ledger, em };
  }

  it('abrir declarando 0 en una billetera con $10.000 no escribe ningún ajuste: la diferencia sólo se informa', async () => {
    const { service, ledger, em } = armar();
    const caja: any = await service.openRegister('u1', [{ wallet_id: 'w1', amount: 0 }]);
    expect(ledger.ajustar).not.toHaveBeenCalled();
    expect(caja.diferencias_apertura).toEqual([{ wallet_id: 'w1', billetera: 'Caja', contado: 0, segun_sistema: 10000, diferencia: -10000 }]);
    // Lo esperado del turno arranca en lo que dice el libro, no en lo contado.
    const balance = em.save.mock.calls.find((c: any[]) => c[1]?.walletId === 'w1')?.[1];
    expect(balance).toMatchObject({ opening_amount: 0, expected_amount: 10000 });
  });

  it('dos aperturas se ponen en fila (lock) y con un turno abierto la segunda rebota', async () => {
    const { service, em } = armar({ turno: { id: 't0', estado: EstadoCaja.ABIERTA } });
    await expect(service.openRegister('u1', [{ wallet_id: 'w1', amount: 10000 }])).rejects.toThrow(ErrorDeNegocio);
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['cash_register:abrir']);
  });

  it('cerrar con diferencia sin motivo no cierra ni ajusta', async () => {
    const turno = { id: 't1', turno_numero: 'T-1', estado: EstadoCaja.ABIERTA, walletBalances: [{ walletId: 'w1', expected_amount: 10000 }] };
    const { service, ledger } = armar({ turno });
    await expect(service.closeRegister('t1', 'admin', [{ wallet_id: 'w1', declared_amount: 9500 }])).rejects.toThrow('motivo');
    expect(ledger.ajustar).not.toHaveBeenCalled();
  });

  it('cerrar con diferencia y motivo ajusta en la misma transacción, con el motivo en el concepto', async () => {
    const turno = { id: 't1', turno_numero: 'T-1', estado: EstadoCaja.ABIERTA, walletBalances: [{ walletId: 'w1', expected_amount: 10000 }] };
    const { service, ledger, em } = armar({ turno });
    await service.closeRegister('t1', 'admin', [{ wallet_id: 'w1', declared_amount: 9500 }], 'faltante contado');
    expect(ledger.ajustar).toHaveBeenCalledWith('w1', 9500, 'Arqueo de cierre T-1 · faltante contado', 'admin', em);
  });
});
