import { ValidationPipe } from '@nestjs/common';

import { UpdateExpenseDto } from './update-expense.dto';

/** SEG-56: el PATCH de gastos no acepta `companyId`. Mismo pipe que `main.ts`. */
describe('UpdateExpenseDto — SEG-56', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const meta = { type: 'body' as const, metatype: UpdateExpenseDto };

  it('mandar companyId en la edición es 400', async () => {
    await expect(pipe.transform({ notas: 'x', companyId: '5c4ec273-74da-4525-b2bc-5cbca3c7657f' }, meta)).rejects.toBeDefined();
  });

  it('lo que manda el ERP al editar sigue pasando', async () => {
    const salida = await pipe.transform(
      { fecha: '2026-10-14', categoria: 'servicios', descripcion: 'Luz', metodo_pago: 'efectivo', monto: 1500, notas: 'octubre' },
      meta,
    );
    expect(salida).toMatchObject({ descripcion: 'Luz', monto: 1500, notas: 'octubre' });
    expect(salida).not.toHaveProperty('companyId');
  });
});
