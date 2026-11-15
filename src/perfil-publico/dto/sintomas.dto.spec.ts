import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ActualizarPerfilPublicoDto } from './perfil-publico.dtos';

const errores = (sintomas: unknown) =>
  validateSync(plainToInstance(ActualizarPerfilPublicoDto, { sintomas }), { whitelist: true, forbidNonWhitelisted: true });

const causa = (p: Record<string, unknown> = {}) => ({
  causa: 'Rulemanes', senal: 'Ruido al centrifugar', tiempo: '2–4 días', tipo: 'rodamiento',
  repuestos: [{ id: '0b7a3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d', nombre: 'Rulemán 6205' }], ...p,
});

describe('ActualizarPerfilPublicoDto — síntomas', () => {
  it('acepta un síntoma con varias causas y repuestos', () => {
    expect(errores([{ equipo: 'lavarropas', sintoma: 'No centrifuga', causas: [causa(), causa({ causa: 'Correa', tipo: null, repuestos: [] })] }])).toHaveLength(0);
  });

  it('acepta la lista vacía: el taller puede apagar la consola', () => {
    expect(errores([])).toHaveLength(0);
  });

  it('rechaza un equipo que la consola no conoce', () => {
    expect(errores([{ equipo: 'secarropas', sintoma: 'x', causas: [causa()] }]).length).toBeGreaterThan(0);
  });

  it('rechaza un síntoma sin causas', () => {
    expect(errores([{ equipo: 'heladera', sintoma: 'No enfría', causas: [] }]).length).toBeGreaterThan(0);
  });

  it('rechaza una zona del despiece que no existe y un repuesto sin id válido', () => {
    expect(errores([{ equipo: 'heladera', sintoma: 'No enfría', causas: [causa({ tipo: 'inventada' })] }]).length).toBeGreaterThan(0);
    expect(errores([{ equipo: 'heladera', sintoma: 'No enfría', causas: [causa({ repuestos: [{ id: 'x', nombre: 'y' }] })] }]).length).toBeGreaterThan(0);
  });
});
