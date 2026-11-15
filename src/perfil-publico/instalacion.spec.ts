import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActualizarPerfilPublicoDto } from './dto/perfil-publico.dtos';
import { PerfilPublicoService } from './perfil-publico.service';
import { armarPerfilPublico, perfilPorDefecto, TOPES } from './perfil-publico.util';

/**
 * «Te lo instalamos» (spec 2026-11-07 §8.3): vale para todo el taller, no por
 * producto. Un interruptor y un texto libre con las condiciones, apagado por
 * defecto, editable por el PATCH del perfil y público en `GET /tienda/perfil`.
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

describe('Instalación del taller', () => {
  it('arranca apagada y sin texto', () => {
    expect(perfilPorDefecto()).toMatchObject({ instalacion_activa: false, instalacion_texto: null });
    expect(TOPES.instalacion_texto).toBe(200);
  });

  it('el PATCH guarda los dos campos y lo que no viene no se toca', async () => {
    const { service, fila } = armar();
    const r = await service.actualizar('emp-1', { instalacion_activa: true, instalacion_texto: 'En CABA y GBA norte, sin cargo con la compra.' });
    expect(r.instalacion_activa).toBe(true);
    expect(r.instalacion_texto).toBe('En CABA y GBA norte, sin cargo con la compra.');
    expect(fila().instalacion_activa).toBe(true);

    const r2 = await service.actualizar('emp-1', { eslogan: 'Hola' });
    expect(r2.instalacion_activa).toBe(true);
    expect(r2.instalacion_texto).toBe('En CABA y GBA norte, sin cargo con la compra.');

    const r3 = await service.actualizar('emp-1', { instalacion_activa: false });
    expect(r3.instalacion_activa).toBe(false);
    expect(r3.instalacion_texto).toBe('En CABA y GBA norte, sin cargo con la compra.');
  });

  it('el texto se guarda sin los espacios de las puntas, y vacío o null lo borra', async () => {
    const { service } = armar();
    expect((await service.actualizar('emp-1', { instalacion_texto: '  Con turno  ' })).instalacion_texto).toBe('Con turno');
    expect((await service.actualizar('emp-1', { instalacion_texto: '   ' })).instalacion_texto).toBeNull();
    await service.actualizar('emp-1', { instalacion_texto: 'Con turno' });
    expect((await service.actualizar('emp-1', { instalacion_texto: null })).instalacion_texto).toBeNull();
  });

  it('un texto de 201 letras es un 400; 200 entra', async () => {
    expect(await errores({ instalacion_texto: 'a'.repeat(201) })).toEqual(['instalacion_texto']);
    expect(await errores({ instalacion_texto: 'a'.repeat(200) })).toEqual([]);
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    await expect(
      pipe.transform({ instalacion_texto: 'a'.repeat(201) }, { type: 'body', metatype: ActualizarPerfilPublicoDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el interruptor sólo acepta verdadero o falso', async () => {
    expect(await errores({ instalacion_activa: true })).toEqual([]);
    expect(await errores({ instalacion_activa: false })).toEqual([]);
    expect(await errores({ instalacion_activa: 'si' })).toEqual(['instalacion_activa']);
    expect(await errores({ instalacion_activa: null })).toEqual(['instalacion_activa']);
  });

  it('el perfil público los devuelve', async () => {
    const { service } = armar({ id: 'pp-1', companyId: 'emp-1', ...perfilPorDefecto(), instalacion_activa: true, instalacion_texto: 'Con turno' });
    const p = await service.publico('emp-1');
    expect(p.instalacion_activa).toBe(true);
    expect(p.instalacion_texto).toBe('Con turno');
  });

  it('sin fila, o con una fila de antes de la columna, sale apagada', () => {
    const empresa = { id: 'emp-1', name: 'Taller Demo', telefono: null } as any;
    expect(armarPerfilPublico(empresa, null)).toMatchObject({ instalacion_activa: false, instalacion_texto: null });
    const vieja: any = { ...perfilPorDefecto() };
    delete vieja.instalacion_activa;
    delete vieja.instalacion_texto;
    expect(armarPerfilPublico(empresa, vieja)).toMatchObject({ instalacion_activa: false, instalacion_texto: null });
  });
});
