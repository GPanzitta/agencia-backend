import { plainToInstance } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { FechaLocal } from './fecha-local.transform';

class Dto {
  @IsDate()
  @FechaLocal()
  @IsOptional()
  fecha?: Date;
}

describe('FechaLocal', () => {
  it('una fecha suelta se parsea como medianoche local (el dia no se corre)', () => {
    const dto = plainToInstance(Dto, { fecha: '2026-08-24' });
    expect(dto.fecha!.getFullYear()).toBe(2026);
    expect(dto.fecha!.getMonth()).toBe(7);
    // getDate() es LOCAL: si diera 23, el bug de corrimiento sigue vivo.
    expect(dto.fecha!.getDate()).toBe(24);
  });

  it('un ISO con hora se respeta tal cual', () => {
    const dto = plainToInstance(Dto, { fecha: '2026-08-24T15:30:00.000Z' });
    expect(dto.fecha!.toISOString()).toBe('2026-08-24T15:30:00.000Z');
  });

  it('vacio o ausente pasa sin tocar', () => {
    expect(plainToInstance(Dto, {}).fecha).toBeUndefined();
    expect(plainToInstance(Dto, { fecha: '' }).fecha as unknown).toBe('');
  });
});
