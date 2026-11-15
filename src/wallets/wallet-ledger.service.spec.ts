import { WalletLedgerService } from './wallet-ledger.service';
import { ConflictoDeNegocio } from '../common/errores/error-negocio';

/**
 * PLA-03 (auditoría 13/10): anular un pago y su gasto a la vez —o un doble
 * clic— revertía dos veces el mismo egreso y la caja quedaba inflada.
 * `revertir` bloquea el asiento original y se niega a revertirlo otra vez.
 */
describe('WalletLedgerService.revertir — una sola reversa por asiento (PLA-03)', () => {
  const original = { id: 'mov-1', walletId: 'w1', signo: 'egreso', monto: 100, companyId: 'c1', cash_register_id: null };

  function armar(reversasPrevias: number) {
    const qbOriginal: any = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn(async () => original) };
    const qbReversas: any = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getCount: jest.fn(async () => reversasPrevias) };
    const qbs = [qbOriginal, qbReversas];
    const em: any = { createQueryBuilder: jest.fn(() => qbs.shift()) };
    const service = new WalletLedgerService({} as any, {} as any, { transaction: jest.fn(async (fn: any) => fn(em)) } as any);
    jest.spyOn(service as any, 'turnoAbierto').mockResolvedValue(null);
    const registrar = jest.spyOn(service, 'registrar').mockResolvedValue({ id: 'rev-1' } as any);
    return { service, em, qbOriginal, registrar };
  }

  it('la primera anulación bloquea el asiento original y escribe la reversa', async () => {
    const { service, em, qbOriginal, registrar } = armar(0);
    await service.revertir('mov-1', 'Anulación de pago', em);
    expect(qbOriginal.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ origen: 'anulacion_pago', origen_id: 'mov-1', monto: 100 }), em);
  });

  it('la segunda anulación del mismo asiento rebota y no devuelve la plata otra vez', async () => {
    const { service, em, registrar } = armar(1);
    await expect(service.revertir('mov-1', 'Anulación de gasto', em)).rejects.toThrow(ConflictoDeNegocio);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('sin manager abre su propia transacción (el lock necesita una)', async () => {
    const { service, registrar } = armar(0);
    await service.revertir('mov-1', 'Anulación');
    expect(registrar).toHaveBeenCalled();
  });
});
