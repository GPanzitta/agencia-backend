import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { FinanceController } from './finance.controller';
import { META_ROLES } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';

/** #42: «Reactivar» es del dueño, como el resto de los gastos fijos. */
describe('FinanceController — reactivar un gasto fijo', () => {
  const handler = FinanceController.prototype.reactivarRecurrente;

  it('es PATCH recurrentes/:id/reactivar', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('recurrentes/:id/reactivar');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
  });

  it('sólo ADMIN', () => {
    expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([Roles.ADMIN]);
  });

  it('delega el modo en el servicio', async () => {
    const recurrentes: any = { reactivar: jest.fn(async () => ({ id: 'r1' })) };
    const c = new FinanceController(recurrentes, {} as never, {} as never);
    await c.reactivarRecurrente('r1', { desde: 'hoy' });
    expect(recurrentes.reactivar).toHaveBeenCalledWith('r1', 'hoy');
  });
});
