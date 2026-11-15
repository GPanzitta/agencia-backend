import { ValidationPipe } from '@nestjs/common';

import { ActualizarSettingsDto, CopiarPresupuestosDto } from '../finance/dto/actualizar-settings.dto';
import { AnulacionDto } from '../expenses/dto/anulacion.dto';
import { CrearTallerDto } from '../admin/dto/crear-taller.dto';

/** SEG-08: los cuerpos que entraban sin validar, con la configuración de `main.ts`. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const como = (metatype: any) => ({ type: 'body' as const, metatype });

describe('SEG-08: validación de cuerpos', () => {
  it('parámetros de finanzas: un texto en el umbral da 400 (antes 500) y no se puede escribir otra columna', async () => {
    await expect(pipe.transform({ umbral_aprobacion: 'mucho' }, como(ActualizarSettingsDto))).rejects.toBeDefined();
    await expect(pipe.transform({ companyId: 'otra' }, como(ActualizarSettingsDto))).rejects.toBeDefined();
    await expect(pipe.transform({ umbral_aprobacion: '15000.50', dias_aviso_vencimiento: 5 }, como(ActualizarSettingsDto)))
      .resolves.toEqual({ umbral_aprobacion: 15000.5, dias_aviso_vencimiento: 5 });
  });

  it('copiar presupuestos acepta `hasta` (lo que manda el ERP) y `hacia`', async () => {
    await expect(pipe.transform({ desde: '2026-09-01', hasta: '2026-10-01' }, como(CopiarPresupuestosDto))).resolves.toBeDefined();
    await expect(pipe.transform({ desde: 'ayer' }, como(CopiarPresupuestosDto))).rejects.toBeDefined();
  });

  it('anulaciones: el destino es uno de los dos, el motivo con tope', async () => {
    await expect(pipe.transform({ motivo: 'cargado dos veces', destino: 'turno_actual' }, como(AnulacionDto))).resolves.toBeDefined();
    await expect(pipe.transform({ destino: 'otra_caja' }, como(AnulacionDto))).rejects.toBeDefined();
    await expect(pipe.transform({ motivo: 'x'.repeat(201) }, como(AnulacionDto))).rejects.toBeDefined();
  });

  it('alta de taller: cuerpo tipado', async () => {
    await expect(pipe.transform({ companyName: '' }, como(CrearTallerDto))).rejects.toBeDefined();
    await expect(pipe.transform({ companyName: 'Taller Sur' }, como(CrearTallerDto))).resolves.toBeDefined();
  });
});
