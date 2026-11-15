import { ValidationPipe } from '@nestjs/common';
import { ConsultarAuditoriaDto } from './consultar-auditoria.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const como = { type: 'query' as const, metatype: ConsultarAuditoriaDto };

describe('ConsultarAuditoriaDto (CLI-11)', () => {
  it('«Desde 13/10 Hasta 13/10» es el día entero del taller (UTC-3)', async () => {
    const r: ConsultarAuditoriaDto = await pipe.transform({ desde: '2026-10-13', hasta: '2026-10-13' }, como);
    expect(r.desde!.toISOString()).toBe('2026-10-13T03:00:00.000Z');
    expect(r.hasta!.toISOString()).toBe('2026-10-14T02:59:59.999Z');
  });

  it('un ISO con hora se respeta', async () => {
    const r: ConsultarAuditoriaDto = await pipe.transform({ desde: '2026-10-13T10:00:00Z' }, como);
    expect(r.desde!.toISOString()).toBe('2026-10-13T10:00:00.000Z');
  });

  it('una fecha que no es fecha da 400', async () => {
    await expect(pipe.transform({ desde: 'ayer' }, como)).rejects.toBeDefined();
  });
});
