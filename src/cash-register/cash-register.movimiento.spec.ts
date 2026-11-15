import { CashRegisterService } from './cash-register.service';
import { CashRegister, EstadoCaja } from './entities/cash-register.entity';
import { CashMovement, TipoMovimientoCaja } from './entities/cash-movement.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { User } from '../auth/entities/user.entity';
import { transaccionFalsa } from '../common/testing/transaccion-falsa';

/**
 * Informe 14/10, 7.3 («alta»): el ingreso o retiro de caja escribía el
 * asiento del ledger, el movimiento y los totales del turno por separado. Si
 * fallaba un paso, la plata ya había salido de la billetera sin movimiento de
 * caja que la explique.
 */
describe('CashRegisterService.addMovement — todo o nada', () => {
  function armar(opciones: { turno?: Partial<CashRegister>; fallaAlGuardar?: 'CashMovement' | 'CashRegister' } = {}) {
    const turno = {
      id: 't1',
      estado: EstadoCaja.ABIERTA,
      monto_apertura: 1000,
      ventas_efectivo: 0,
      retiros_caja: 0,
      ingresos_extra: 0,
      companyId: 'c1',
      ...opciones.turno,
    };
    const lock = jest.fn();
    const base = transaccionFalsa((anotar) => {
      const em: any = {
        anotar,
        createQueryBuilder: jest.fn(() => {
          const qb: any = { where: jest.fn(() => qb), setLock: jest.fn((m: string) => (lock(m), qb)), getOne: jest.fn(async () => turno) };
          return qb;
        }),
        findOne: jest.fn(async (entidad: unknown) => {
          if (entidad === User) return { id: 'u1' };
          if (entidad === Wallet) return { id: 'w1', companyId: 'c1' };
          return null;
        }),
        create: jest.fn((_e: unknown, x: unknown) => x),
        save: jest.fn(async (entidad: { name: string }, x: unknown) => {
          if (opciones.fallaAlGuardar === entidad.name) throw new Error(`falló ${entidad.name}`);
          anotar(entidad.name);
          return x;
        }),
      };
      return em;
    });
    // El ledger de verdad abre su propia transacción si no le pasan el em:
    // en ese caso el asiento queda confirmado aunque lo demás falle.
    const ledger: any = {
      registrar: jest.fn(async (_datos: unknown, em?: any) => (em ? em.anotar('asiento') : base.directa('asiento'))),
    };
    const escrituraDirecta = jest.fn(async (x: unknown) => (base.directa('directa'), x));
    const cashRegisterRepository: any = {
      manager: { transaction: base.transaction },
      findOneBy: jest.fn(async () => turno),
      save: escrituraDirecta,
    };
    const cashMovementRepository: any = { create: jest.fn((x: unknown) => x), save: escrituraDirecta };
    const userRepository: any = { findOneBy: jest.fn(async () => ({ id: 'u1' })) };
    const walletRepository: any = { findOne: jest.fn(async () => ({ id: 'w1', companyId: 'c1' })) };
    const service = new CashRegisterService(cashRegisterRepository, cashMovementRepository, userRepository, walletRepository, {} as any, ledger);
    return { service, base, ledger, turno, lock };
  }

  it('si falla guardar el turno, no queda ni el asiento ni el movimiento', async () => {
    const { service, base } = armar({ fallaAlGuardar: 'CashRegister' });
    await expect(service.addMovement('t1', 'u1', TipoMovimientoCaja.RETIRO, 300, 'cambio', 'w1')).rejects.toThrow('falló CashRegister');
    expect(base.confirmadas).toEqual([]);
  });

  it('si falla guardar el movimiento, el asiento del ledger tampoco queda', async () => {
    const { service, base } = armar({ fallaAlGuardar: 'CashMovement' });
    await expect(service.addMovement('t1', 'u1', TipoMovimientoCaja.INGRESO, 300, 'fondo', 'w1')).rejects.toThrow('falló CashMovement');
    expect(base.confirmadas).toEqual([]);
  });

  it('bien: asiento, movimiento y turno en una sola transacción, con el turno bloqueado', async () => {
    const { service, base, ledger, turno, lock } = armar();
    const mov: any = await service.addMovement('t1', 'u1', TipoMovimientoCaja.RETIRO, 300, 'cambio', 'w1');
    expect(base.abiertas()).toBe(1);
    expect(base.confirmadas).toEqual(['asiento', CashMovement.name, CashRegister.name]);
    expect(ledger.registrar).toHaveBeenCalledWith(expect.objectContaining({ walletId: 'w1', monto: 300 }), expect.anything());
    expect(lock).toHaveBeenCalledWith('pessimistic_write');
    expect(turno.retiros_caja).toBe(300);
    expect(turno.monto_esperado).toBe(700);
    expect(mov).toMatchObject({ tipo: TipoMovimientoCaja.RETIRO, monto: 300, walletId: 'w1' });
  });

  it('con la caja cerrada no escribe nada', async () => {
    const { service, base, ledger } = armar({ turno: { estado: EstadoCaja.CERRADA } });
    await expect(service.addMovement('t1', 'u1', TipoMovimientoCaja.RETIRO, 300, 'x', 'w1')).rejects.toThrow('cerrada');
    expect(ledger.registrar).not.toHaveBeenCalled();
    expect(base.confirmadas).toEqual([]);
  });
});
