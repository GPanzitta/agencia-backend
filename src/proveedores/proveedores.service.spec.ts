import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProveedoresService } from './proveedores.service';
import { Proveedor } from './entities/proveedore.entity';
import { ExpensesService } from '../expenses/expenses.service';

describe('ProveedoresService.ficha', () => {
  let service: ProveedoresService;
  const proveedorRepo = { findOne: jest.fn() };
  const expenses = { cuentasPorPagar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ProveedoresService,
        { provide: getRepositoryToken(Proveedor), useValue: proveedorRepo },
        { provide: ExpensesService, useValue: expenses },
      ],
    }).compile();
    service = mod.get(ProveedoresService);
  });

  it('la ficha trae el saldo del proveedor y los días de entrega cargados', async () => {
    proveedorRepo.findOne.mockResolvedValue({ id: 'p1', nombre: 'Centro', dias_entrega: 4, companyId: 'c1' });
    expenses.cuentasPorPagar.mockResolvedValue([{ proveedor_id: 'otro', deuda: 5, vencido: 5, a_cuenta: 5 }, { proveedor_id: 'p1', deuda: 1000, vencido: 200, a_cuenta: 50, sin_aprobar: 300 }]);
    const f = await service.ficha('p1');
    expect(f.saldo).toEqual({ deuda: 1000, vencido: 200, a_cuenta: 50, sin_aprobar: 300 });
    expect(f.dias_entrega_cargado).toBe(4);
    expect(f.ultimas_oc).toEqual([]);
    expect(f.lead_time_promedio_dias).toBeNull();
    expect(expenses.cuentasPorPagar).toHaveBeenCalledWith('c1');
  });

  it('sin movimientos el saldo va en cero', async () => {
    proveedorRepo.findOne.mockResolvedValue({ id: 'p1', nombre: 'Nuevo', dias_entrega: 2 });
    expenses.cuentasPorPagar.mockResolvedValue([]);
    const f = await service.ficha('p1');
    expect(f.saldo).toEqual({ deuda: 0, vencido: 0, a_cuenta: 0, sin_aprobar: 0 });
  });
});
