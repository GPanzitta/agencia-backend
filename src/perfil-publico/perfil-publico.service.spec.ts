import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { PerfilPublicoService } from './perfil-publico.service';
import { perfilPorDefecto } from './perfil-publico.util';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { ConsultorOembedFalso } from './oembed.falso';

jest.mock('../orden-fotos/fotos.util', () => ({
  comprimirFoto: jest.fn(async () => ({ principal: Buffer.from('p'), miniatura: Buffer.from('m'), ancho: 10, alto: 10 })),
}));

/**
 * Sin Postgres: repositorios de mentira. Lo que importa es la regla, no el
 * SQL: defaults sin fila, PATCH parcial que no pisa, la fila que nace al
 * primer guardado, el tope de 12 fotos y el borrado por índice.
 */
function armar(filaInicial: any = null, almacenOverride: any = null, oembedOverride: any = null) {
  let fila = filaInicial;
  const perfiles: any = {
    findOne: jest.fn(async () => fila),
    create: jest.fn((datos: any) => ({ ...datos })),
    save: jest.fn(async (p: any) => { fila = { id: 'pp-1', ...p }; return fila; }),
  };
  // La transacción de mentira usa el mismo repositorio: lo que se prueba es
  // que la fila se relee recién adentro, no el bloqueo de Postgres.
  perfiles.manager = { transaction: jest.fn(async (fn: any) => fn({ getRepository: () => perfiles })) };
  const companies: any = {
    findOneBy: jest.fn(async ({ id }: any) => (id === 'emp-1'
      ? { id: 'emp-1', name: 'Taller Demo', telefono: '11 5555', direccion: null, lat: null, lng: null, garantia_dias: 90 }
      : null)),
  };
  const almacen: any = almacenOverride ?? {
    guardarEn: jest.fn(async (sub: string) => ({ url: `/uploads/${sub}/a.webp`, url_miniatura: `/uploads/${sub}/a_min.webp` })),
    borrar: jest.fn(async () => undefined),
  };
  const oembed = oembedOverride ?? new ConsultorOembedFalso({
    '0MELX_vb0qY': { titulo: 'Cómo cambiamos un blocapuertas', canal: 'Taller Demo' },
    bbbbbbbbbbb: { titulo: 'Service de aire', canal: 'Taller Demo' },
  });
  const service = new PerfilPublicoService(perfiles, companies, almacen, oembed);
  return { service, perfiles, companies, almacen, oembed, fila: () => fila };
}

describe('PerfilPublicoService', () => {
  it('obtener sin fila devuelve los defaults sin crear nada', async () => {
    const { service, perfiles } = armar();
    expect(await service.obtener('emp-1')).toEqual(perfilPorDefecto());
    expect(perfiles.save).not.toHaveBeenCalled();
    // El fake ignora su argumento, así que esto no falla si el filtro se
    // pierde: lo que importa es que el `where` viajó con la empresa correcta.
    expect(perfiles.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'emp-1' } }));
  });

  it('un usuario sin empresa asignada no puede leer ni escribir ningún perfil', async () => {
    const { service } = armar();
    await expect(service.obtener(null as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.obtener(undefined as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.actualizar(null as any, { eslogan: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.subirImagen(null as any, 'logo', Buffer.from('x'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.borrarTrabajo(null as any, 0)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('actualizar crea la fila al primer guardado y sólo pisa lo enviado', async () => {
    const { service, fila } = armar();
    await service.actualizar('emp-1', { eslogan: 'Hola' });
    expect(fila().companyId).toBe('emp-1');
    expect(fila().eslogan).toBe('Hola');
    const r = await service.actualizar('emp-1', { marcas: ['LG'] });
    expect(r.eslogan).toBe('Hola');
    expect(r.marcas).toEqual(['LG']);
  });

  it('subirImagen: logo reemplaza la URL; trabajo agrega al final con miniatura', async () => {
    const { service, almacen } = armar();
    const r1 = await service.subirImagen('emp-1', 'logo', Buffer.from('x'));
    expect(r1.logo_url).toBe('/uploads/perfil/emp-1/a.webp');
    expect(almacen.guardarEn).toHaveBeenCalledWith('perfil/emp-1', expect.objectContaining({ principal: expect.any(Buffer) }));
    // Primera subida: no había nada antes, así que no hay nada que borrar.
    expect(almacen.borrar).not.toHaveBeenCalled();
    const r2 = await service.subirImagen('emp-1', 'trabajo', Buffer.from('x'));
    expect(r2.fotos_trabajos).toEqual([{ url: '/uploads/perfil/emp-1/a.webp', miniatura: '/uploads/perfil/emp-1/a_min.webp' }]);
  });

  it('subirImagen: isotipo se guarda en su propio campo y no toca el logo', async () => {
    const { service } = armar();
    await service.subirImagen('emp-1', 'logo', Buffer.from('x'));
    const r = await service.subirImagen('emp-1', 'isotipo', Buffer.from('x'));
    expect(r.isotipo_url).toBe('/uploads/perfil/emp-1/a.webp');
    expect(r.logo_url).toBe('/uploads/perfil/emp-1/a.webp');
  });

  it('actualizar: isotipo_url en null lo quita (mismo camino que el logo)', async () => {
    const { service } = armar({ companyId: 'emp-1', isotipo_url: '/uploads/i.webp' });
    const r = await service.actualizar('emp-1', { isotipo_url: null });
    expect(r.isotipo_url).toBeNull();
  });

  it('subirImagen: al reemplazar logo/portada/equipo borra del almacén la URL anterior (Cloudinary es medido)', async () => {
    let contador = 0;
    const almacen: any = {
      guardarEn: jest.fn(async (sub: string) => {
        contador += 1;
        return { url: `/uploads/${sub}/a${contador}.webp`, url_miniatura: `/uploads/${sub}/a${contador}_min.webp` };
      }),
      borrar: jest.fn(async () => undefined),
    };
    const { service } = armar(null, almacen);
    const r1 = await service.subirImagen('emp-1', 'logo', Buffer.from('x'));
    expect(r1.logo_url).toBe('/uploads/perfil/emp-1/a1.webp');
    expect(almacen.borrar).not.toHaveBeenCalled();

    const r2 = await service.subirImagen('emp-1', 'logo', Buffer.from('y'));
    expect(r2.logo_url).toBe('/uploads/perfil/emp-1/a2.webp');
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/perfil/emp-1/a1.webp']);
  });

  it('subirImagen: el borrado del almacén que falla no rompe la subida (best-effort)', async () => {
    let contador = 0;
    const almacen: any = {
      guardarEn: jest.fn(async (sub: string) => {
        contador += 1;
        return { url: `/uploads/${sub}/a${contador}.webp`, url_miniatura: `/uploads/${sub}/a${contador}_min.webp` };
      }),
      borrar: jest.fn(async () => { throw new Error('Cloudinary caído'); }),
    };
    const { service } = armar(null, almacen);
    await service.subirImagen('emp-1', 'logo', Buffer.from('x'));
    const r2 = await service.subirImagen('emp-1', 'logo', Buffer.from('y'));
    expect(r2.logo_url).toBe('/uploads/perfil/emp-1/a2.webp');
  });

  it('la foto de trabajo número 13 es un 409', async () => {
    const doce = Array.from({ length: 12 }, (_, i) => ({ url: `/uploads/${i}.webp`, miniatura: `/uploads/${i}m.webp` }));
    const { service } = armar({ id: 'pp-1', companyId: 'emp-1', ...perfilPorDefecto(), fotos_trabajos: doce });
    await expect(service.subirImagen('emp-1', 'trabajo', Buffer.from('x'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('un archivo que no es una imagen válida es un 400, no un 409', async () => {
    const { service } = armar();
    (comprimirFoto as jest.Mock).mockRejectedValueOnce(new Error('no es imagen'));
    await expect(service.subirImagen('emp-1', 'logo', Buffer.from('x'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('borrarTrabajo quita por índice; fuera de rango es 404; borra del almacén la foto quitada', async () => {
    const dos = [{ url: '/uploads/a.webp', miniatura: '/uploads/am.webp' }, { url: '/uploads/b.webp', miniatura: '/uploads/bm.webp' }];
    const { service, almacen } = armar({ id: 'pp-1', companyId: 'emp-1', ...perfilPorDefecto(), fotos_trabajos: dos });
    const r = await service.borrarTrabajo('emp-1', 0);
    expect(r.fotos_trabajos).toEqual([dos[1]]);
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/a.webp', '/uploads/am.webp']);
    await expect(service.borrarTrabajo('emp-1', 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrarTrabajo no borra del almacén una URL que un PATCH dejó duplicada en otra foto', async () => {
    const dos = [
      { url: '/uploads/a.webp', miniatura: '/uploads/am.webp' },
      { url: '/uploads/a.webp', miniatura: '/uploads/bm.webp' },
    ];
    const { service, almacen } = armar({ id: 'pp-1', companyId: 'emp-1', ...perfilPorDefecto(), fotos_trabajos: dos });
    const r = await service.borrarTrabajo('emp-1', 0);
    expect(r.fotos_trabajos).toEqual([dos[1]]);
    // '/uploads/a.webp' sigue en uso por la foto que quedó: sólo se borra la miniatura.
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/am.webp']);
  });

  it('publico arma la respuesta con la empresa; sin taller configurado es un 503, no un 404', async () => {
    const { service } = armar();
    const r = await service.publico('emp-1');
    expect(r.nombre).toBe('Taller Demo');
    expect(r.whatsapp).toBe('115555');
    expect(r.color_acento).toBe('amarillo');
    await expect(service.publico('nadie')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('guarda los videos con el título y el canal que trajo oembed, en orden', async () => {
    const { service, fila, oembed } = armar();
    await service.actualizar('emp-1', {
      videos: [
        { url: 'https://www.youtube.com/watch?v=0MELX_vb0qY', titulo_personalizado: 'Nuestro taller' },
        { url: 'https://youtu.be/bbbbbbbbbbb' },
      ],
    } as any);
    expect(fila().videos).toEqual([
      { id: '0MELX_vb0qY', titulo: 'Cómo cambiamos un blocapuertas', canal: 'Taller Demo', titulo_personalizado: 'Nuestro taller' },
      { id: 'bbbbbbbbbbb', titulo: 'Service de aire', canal: 'Taller Demo' },
    ]);
    expect((oembed as ConsultorOembedFalso).consultados).toEqual(['0MELX_vb0qY', 'bbbbbbbbbbb']);
  });

  it('un video que ya estaba guardado no se vuelve a consultar', async () => {
    const guardado = { id: '0MELX_vb0qY', titulo: 'Título viejo', canal: 'Taller Demo' };
    const { service, fila, oembed } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), videos: [guardado] });
    await service.actualizar('emp-1', {
      videos: [{ url: 'https://www.youtube.com/watch?v=0MELX_vb0qY', titulo_personalizado: 'Mi título' }],
    } as any);
    expect((oembed as ConsultorOembedFalso).consultados).toEqual([]);
    expect(fila().videos).toEqual([{ ...guardado, titulo_personalizado: 'Mi título' }]);
  });

  it('un enlace que no es de YouTube se rechaza señalando la fila', async () => {
    const { service } = armar();
    await expect(service.actualizar('emp-1', {
      videos: [{ url: 'https://www.youtube.com/watch?v=0MELX_vb0qY' }, { url: 'https://vimeo.com/76979871' }],
    } as any)).rejects.toMatchObject({
      response: { code: 'DATOS_INVALIDOS', message: 'No parece un enlace de YouTube', campos: ['videos.1.url'] },
    });
  });

  it('un video que no permite embebido se rechaza señalando la fila', async () => {
    const { service } = armar();
    await expect(service.actualizar('emp-1', {
      videos: [{ url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' }],
    } as any)).rejects.toMatchObject({
      response: { message: 'El video no permite embebido o no existe', campos: ['videos.0.url'] },
    });
  });

  it('el mismo video dos veces se rechaza', async () => {
    const { service } = armar();
    await expect(service.actualizar('emp-1', {
      videos: [
        { url: 'https://www.youtube.com/watch?v=0MELX_vb0qY' },
        { url: 'https://youtu.be/0MELX_vb0qY' },
      ],
    } as any)).rejects.toMatchObject({
      response: { message: 'Ese video ya está en la lista', campos: ['videos.1.url'] },
    });
  });

  it('mandar una lista vacía borra todos los videos', async () => {
    const { service, fila } = armar({
      companyId: 'emp-1', ...perfilPorDefecto(),
      videos: [{ id: '0MELX_vb0qY', titulo: 'x', canal: 'y' }],
    });
    await service.actualizar('emp-1', { videos: [] } as any);
    expect(fila().videos).toEqual([]);
  });

  it('subir el video guarda url y poster, y borra el anterior', async () => {
    const { service, almacen, fila } = armar({
      companyId: 'emp-1', ...perfilPorDefecto(),
      video_url: '/uploads/perfil/emp-1/viejo.mp4', video_poster_url: null,
    });
    almacen.guardarVideo = jest.fn(async () => ({ url: '/uploads/perfil/emp-1/nuevo.mp4', poster_url: null }));
    const r = await service.subirVideo('emp-1', Buffer.from('mp4'), 'mp4');
    expect(almacen.guardarVideo).toHaveBeenCalledWith('perfil/emp-1', expect.any(Buffer), 'mp4');
    expect(r.video_url).toBe('/uploads/perfil/emp-1/nuevo.mp4');
    expect(fila().video_url).toBe('/uploads/perfil/emp-1/nuevo.mp4');
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/perfil/emp-1/viejo.mp4']);
  });

  it('quitar el video deja las dos columnas en null y borra el archivo', async () => {
    const { service, almacen, fila } = armar({
      companyId: 'emp-1', ...perfilPorDefecto(),
      video_url: 'https://res.cloudinary.com/demo/video/upload/v1/a.mp4',
      video_poster_url: 'https://res.cloudinary.com/demo/video/upload/so_0/v1/a.jpg',
    });
    const r = await service.quitarVideo('emp-1');
    expect(r.video_url).toBeNull();
    expect(r.video_poster_url).toBeNull();
    expect(fila().video_poster_url).toBeNull();
    // El poster lo genera Cloudinary al vuelo: no es un archivo que se borre.
    expect(almacen.borrar).toHaveBeenCalledWith(['https://res.cloudinary.com/demo/video/upload/v1/a.mp4']);
  });

  it('quitar el video sin video cargado no rompe ni borra nada', async () => {
    const { service, almacen } = armar({ companyId: 'emp-1', ...perfilPorDefecto() });
    const r = await service.quitarVideo('emp-1');
    expect(r.video_url).toBeNull();
    expect(almacen.borrar).not.toHaveBeenCalled();
  });

  it('sin empresa asignada no se sube ni se quita el video', async () => {
    const { service } = armar();
    await expect(service.subirVideo(null as any, Buffer.from('x'), 'mp4')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.quitarVideo(null as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el Place ID se guarda recortado, y null lo borra', async () => {
    const { service, fila } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), google_place_id: 'ChIJviejo' });
    await service.actualizar('emp-1', { google_place_id: ' ChIJnuevo ' } as any);
    expect(fila().google_place_id).toBe('ChIJnuevo');
    await service.actualizar('emp-1', { google_place_id: null } as any);
    expect(fila().google_place_id).toBeNull();
  });
});

describe('PerfilPublicoService — fotos del sitio (spec 2026-10-18)', () => {
  const propia = (n: string) => ({ url: `/uploads/${n}.webp`, miniatura: `/uploads/${n}_min.webp` });

  it('sin fila, todos los lugares muestran la original', async () => {
    const { service } = armar();
    const r = await service.fotosSitio('emp-1');
    expect(r.lugares).toHaveLength(13);
    expect(r.lugares.every((l) => l.fotos.every((f) => !f.propia))).toBe(true);
    expect(r.video_portada.propio).toBe(false);
  });

  it('subir guarda en su posición, deja la otra original y borra la anterior después de guardar', async () => {
    const { service, almacen, fila } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), fotos_sitio: { portada_visita: [null, propia('vieja')] } });
    const r = await service.subirFotoSitio('emp-1', 'portada_visita', 1, Buffer.from('x'));
    expect(fila().fotos_sitio.portada_visita).toEqual([null, { url: '/uploads/perfil/emp-1/a.webp', miniatura: '/uploads/perfil/emp-1/a_min.webp' }]);
    expect(r.lugares.find((l) => l.clave === 'portada_visita')!.fotos.map((f) => f.propia)).toEqual([false, true]);
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/vieja.webp', '/uploads/vieja_min.webp']);
  });

  it('clave desconocida o posición fuera del lugar: 400 sin guardar ni subir nada', async () => {
    const { service, perfiles, almacen } = armar();
    await expect(service.subirFotoSitio('emp-1', 'no_existe', 0, Buffer.from('x'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.subirFotoSitio('emp-1', 'portada_aire', 1, Buffer.from('x'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.quitarFotoSitio('emp-1', 'marcas', 4)).rejects.toBeInstanceOf(BadRequestException);
    expect(perfiles.save).not.toHaveBeenCalled();
    expect(almacen.guardarEn).not.toHaveBeenCalled();
  });

  it('volver a la original borra la propia; si ya era original, 404 sin tocar nada', async () => {
    const { service, almacen, perfiles, fila } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), fotos_sitio: { marcas: [propia('m0')] } });
    await service.quitarFotoSitio('emp-1', 'marcas', 0);
    expect(fila().fotos_sitio.marcas).toEqual([null, null, null, null]);
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/m0.webp', '/uploads/m0_min.webp']);
    perfiles.save.mockClear();
    await expect(service.quitarFotoSitio('emp-1', 'marcas', 0)).rejects.toBeInstanceOf(NotFoundException);
    expect(perfiles.save).not.toHaveBeenCalled();
  });

  it('lo que otro pedido guardó mientras se subía la foto no se pierde ni queda apuntando a un borrado', async () => {
    const { service, almacen, perfiles, fila } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), fotos_sitio: { portada_visita: [propia('x'), null] } });
    // Durante la subida, otro pedido cambia la posición 0 (X → otra) y lo guarda.
    almacen.guardarEn.mockImplementationOnce(async () => {
      await perfiles.save({ ...fila(), fotos_sitio: { portada_visita: [propia('otra'), null] } });
      return { url: '/uploads/b.webp', url_miniatura: '/uploads/b_min.webp' };
    });
    await service.subirFotoSitio('emp-1', 'portada_visita', 1, Buffer.from('x'));
    expect(fila().fotos_sitio.portada_visita).toEqual([propia('otra'), { url: '/uploads/b.webp', miniatura: '/uploads/b_min.webp' }]);
    expect(perfiles.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it('si guardar falla, la foto recién subida se borra del almacén', async () => {
    const { service, almacen, perfiles } = armar();
    perfiles.save.mockRejectedValueOnce(new Error('caída'));
    await expect(service.subirFotoSitio('emp-1', 'portada_aire', 0, Buffer.from('x'))).rejects.toThrow('caída');
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/perfil/emp-1/a.webp', '/uploads/perfil/emp-1/a_min.webp']);
  });

  it('no borra del almacén una foto que sigue usando otro lugar', async () => {
    const { service, almacen } = armar({
      companyId: 'emp-1', ...perfilPorDefecto(),
      fotos_sitio: { portada_aire: [propia('compartida')], equipo_aire: [propia('compartida')] },
    });
    await service.quitarFotoSitio('emp-1', 'portada_aire', 0);
    expect(almacen.borrar).toHaveBeenCalledWith([]);
  });

  it('el PATCH genérico no escribe fotos_sitio ni video_portada_url', async () => {
    const { service, fila } = armar();
    await service.actualizar('emp-1', { eslogan: 'Hola', fotos_sitio: { portada_aire: [propia('x')] }, video_portada_url: '/uploads/v.mp4' } as any);
    expect(fila().fotos_sitio).toEqual({});
    expect(fila().video_portada_url).toBeNull();
  });

  it('video de la portada: subir reemplaza y borra el anterior; quitar sin video da 404', async () => {
    const almacen: any = {
      guardarVideo: jest.fn(async () => ({ url: '/uploads/perfil/emp-1/v2.mp4', poster_url: null })),
      borrar: jest.fn(async () => undefined),
    };
    const { service, fila } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), video_portada_url: '/uploads/v1.mp4' }, almacen);
    const r = await service.subirVideoPortada('emp-1', Buffer.from('x'), 'mp4');
    expect(r.video_portada).toEqual({ url: '/uploads/perfil/emp-1/v2.mp4', propio: true });
    expect(almacen.borrar).toHaveBeenCalledWith(['/uploads/v1.mp4']);
    await service.quitarVideoPortada('emp-1');
    expect(fila().video_portada_url).toBeNull();
    await expect(service.quitarVideoPortada('emp-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('la respuesta pública trae los lugares resueltos y no el video crudo', async () => {
    const { service } = armar({ companyId: 'emp-1', ...perfilPorDefecto(), fotos_sitio: { equipo_aire: [propia('aire')] } });
    const p: any = await service.publico('emp-1');
    expect(p.fotos_sitio.equipo_aire).toEqual([{ ...propia('aire'), propia: true }]);
    expect(p.fotos_sitio.equipo_lavarropas[0].propia).toBe(false);
    expect(p.video_portada.propio).toBe(false);
    expect(p.video_taller.url).toContain('videos.pexels.com');
    expect(p).not.toHaveProperty('video_portada_url');
  });
});
