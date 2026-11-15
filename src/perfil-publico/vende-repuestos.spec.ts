import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActualizarPerfilPublicoDto } from './dto/perfil-publico.dtos';
import { PerfilPublicoService } from './perfil-publico.service';
import { armarPerfilPublico, perfilPorDefecto } from './perfil-publico.util';

/**
 * «Vende repuestos»: un interruptor del taller. Apagado, el sitio no ofrece
 * buscar piezas (código, marca y modelo del equipo, despieces, compatibles);
 * no se borra nada, así que se vuelve a prender y está todo. Prendido por
 * defecto: es lo que hacía el sitio hasta ahora y lo que hacen los talleres.
 */
function armar(filaInicial: any = null) {
  let fila = filaInicial;
  const perfiles: any = {
    findOne: jest.fn(async () => fila),
    create: jest.fn((datos: any) => ({ ...datos })),
    save: jest.fn(async (p: any) => { fila = { id: 'pp-1', ...p }; return fila; }),
  };
  const companies: any = {
    findOneBy: jest.fn(async () => ({ id: 'emp-1', name: 'Taller Demo', telefono: null, direccion: null, lat: null, lng: null, garantia_dias: 90 })),
  };
  const service = new PerfilPublicoService(perfiles, companies, {} as any, {} as any);
  return { service, fila: () => fila };
}

async function errores(body: any): Promise<string[]> {
  const dto = plainToInstance(ActualizarPerfilPublicoDto, body);
  const errs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errs.map((e) => e.property);
}

describe('Vende repuestos', () => {
  it('arranca prendido', () => {
    expect(perfilPorDefecto()).toMatchObject({ vende_repuestos: true });
  });

  it('el PATCH lo apaga y lo prende, y lo que no viene no lo toca', async () => {
    const { service, fila } = armar();
    expect((await service.actualizar('emp-1', { vende_repuestos: false })).vende_repuestos).toBe(false);
    expect(fila().vende_repuestos).toBe(false);
    expect((await service.actualizar('emp-1', { eslogan: 'Hola' })).vende_repuestos).toBe(false);
    expect((await service.actualizar('emp-1', { vende_repuestos: true })).vende_repuestos).toBe(true);
  });

  it('sólo acepta verdadero o falso', async () => {
    expect(await errores({ vende_repuestos: false })).toEqual([]);
    expect(await errores({ vende_repuestos: 'no' })).toEqual(['vende_repuestos']);
    expect(await errores({ vende_repuestos: null })).toEqual(['vende_repuestos']);
  });

  it('sin fila, o con una fila de antes de la columna, sale prendido; apagado sale apagado', () => {
    const empresa = { id: 'emp-1', name: 'Taller Demo', telefono: null } as any;
    expect(armarPerfilPublico(empresa, null)).toMatchObject({ vende_repuestos: true });
    const vieja: any = { ...perfilPorDefecto() };
    delete vieja.vende_repuestos;
    expect(armarPerfilPublico(empresa, vieja)).toMatchObject({ vende_repuestos: true });
    expect(armarPerfilPublico(empresa, { ...perfilPorDefecto(), vende_repuestos: false } as any)).toMatchObject({ vende_repuestos: false });
  });
});
