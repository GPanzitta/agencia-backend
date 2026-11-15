import { ValidationPipe } from '@nestjs/common';

import { ActualizarRecurrenteDto, ReactivarRecurrenteDto } from './actualizar-recurrente.dto';
import { CrearRecurrenteDto } from './crear-recurrente.dto';

/**
 * #16: el PATCH de gastos fijos entraba sin validar (`Partial<CrearRecurrenteDto>`
 * es un tipo, no una clase, y el pipe lo dejaba pasar entero). Se prueba con la
 * misma configuración de `main.ts` y se mira lo que SALE del pipe: un null que
 * el whitelist borrara dejaría el proveedor o el «Hasta» como estaban.
 */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const patch = { type: 'body' as const, metatype: ActualizarRecurrenteDto };
const alta = { type: 'body' as const, metatype: CrearRecurrenteDto };

describe('ActualizarRecurrenteDto (#16)', () => {
  it('los null de Hasta, proveedor y notas sobreviven al whitelist', async () => {
    const salida = await pipe.transform({ fecha_fin: null, proveedor_id: null, notas: null }, patch);
    expect(salida).toEqual(expect.objectContaining({ fecha_fin: null, proveedor_id: null, notas: null }));
    expect(Object.keys(salida).sort()).toEqual(['fecha_fin', 'notas', 'proveedor_id']);
  });

  it('un proveedor vacío da 400: vacío no es «sin proveedor», eso es null', async () => {
    await expect(pipe.transform({ proveedor_id: '' }, patch)).rejects.toBeDefined();
  });

  it.each([
    ['activo', { activo: true }],
    ['generados', { generados: 0 }],
    ['proxima_generacion', { proxima_generacion: '2026-01-01' }],
    ['companyId', { companyId: '8f1f6f4e-2d7c-4a8e-9f55-3c2d1e0b9a77' }],
  ])('%s no se acepta en el PATCH', async (_campo, cuerpo) => {
    await expect(pipe.transform(cuerpo, patch)).rejects.toBeDefined();
  });

  it('«Hasta» 2027-10-31 queda a medianoche local, no corrido un día', async () => {
    const salida = await pipe.transform({ fecha_fin: '2027-10-31' }, patch);
    const f: Date = salida.fecha_fin;
    expect([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours()]).toEqual([2027, 9, 31, 0]);
  });

  it('«Desde» también', async () => {
    const salida = await pipe.transform({ fecha_inicio: '2026-11-01' }, patch);
    const f: Date = salida.fecha_inicio;
    expect([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours()]).toEqual([2026, 10, 1, 0]);
  });

  it('un cuerpo vacío pasa y queda vacío', async () => {
    expect(Object.keys(await pipe.transform({}, patch))).toEqual([]);
  });
});

describe('CrearRecurrenteDto (#16)', () => {
  const base = {
    descripcion: 'Alquiler',
    categoria: 'alquiler',
    monto: 1000,
    metodo_pago: 'transferencia',
    frecuencia: 'mensual',
    dia_vencimiento: 10,
    fecha_inicio: '2026-10-01',
  };

  it('el alta acepta Hasta, proveedor y notas en null', async () => {
    const salida = await pipe.transform({ ...base, fecha_fin: null, proveedor_id: null, notas: null }, alta);
    expect(salida.fecha_fin).toBeNull();
    expect(salida.proveedor_id).toBeNull();
    expect(salida.notas).toBeNull();
  });

  it('el alta sigue exigiendo «Desde»', async () => {
    const { fecha_inicio: _f, ...sinDesde } = base;
    await expect(pipe.transform(sinDesde, alta)).rejects.toBeDefined();
  });
});

describe('ReactivarRecurrenteDto (#42)', () => {
  const meta = { type: 'body' as const, metatype: ReactivarRecurrenteDto };

  it.each(['pendiente', 'hoy'])("acepta desde '%s'", async (desde) => {
    expect((await pipe.transform({ desde }, meta)).desde).toBe(desde);
  });

  it('sin modo, o con otro, da 400', async () => {
    await expect(pipe.transform({}, meta)).rejects.toBeDefined();
    await expect(pipe.transform({ desde: 'ayer' }, meta)).rejects.toBeDefined();
  });
});
