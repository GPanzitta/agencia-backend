import { FotosAlmacenCloudinary, SubidorCloudinary } from './fotos.almacen.cloudinary';
import type { FotoComprimida } from './fotos.util';

/** Subidor de mentira: devuelve la URL de entrega como la armaría Cloudinary. */
function subidorFalso() {
  const subidas: Array<{ bytes: Buffer; public_id: string; resource_type: string }> = [];
  const borrados: Array<{ publicId: string; resourceType: string }> = [];
  const subidor: SubidorCloudinary = {
    subir: async (bytes, opciones) => {
      subidas.push({ bytes, ...opciones });
      const ext = opciones.resource_type === 'image' ? '.webp' : '';
      return { secure_url: `https://res.cloudinary.com/demo/${opciones.resource_type}/upload/v1/${opciones.public_id}${ext}` };
    },
    destruir: async (publicId, resourceType) => {
      if (publicId.includes('falla')) throw new Error('not found');
      borrados.push({ publicId, resourceType });
    },
  };
  return { subidor, subidas, borrados };
}

const foto: FotoComprimida = { principal: Buffer.from('grande'), miniatura: Buffer.from('chica'), ancho: 10, alto: 10 };

describe('FotosAlmacenCloudinary', () => {
  it('guardarEn sube principal y miniatura como imágenes en la carpeta pedida y devuelve las dos URLs', async () => {
    const { subidor, subidas } = subidorFalso();
    const almacen = new FotosAlmacenCloudinary(subidor, undefined);

    const r = await almacen.guardarEn('repuestos/r1', foto);

    expect(subidas).toHaveLength(2);
    expect(subidas[0]).toMatchObject({ bytes: foto.principal, resource_type: 'image' });
    expect(subidas[1]).toMatchObject({ bytes: foto.miniatura, resource_type: 'image' });
    expect(subidas[0].public_id).toMatch(/^repuestos\/r1\/[0-9a-f-]{36}$/);
    expect(subidas[1].public_id).toBe(`${subidas[0].public_id}-m`);
    expect(r).toEqual({
      url: `https://res.cloudinary.com/demo/image/upload/v1/${subidas[0].public_id}.webp`,
      url_miniatura: `https://res.cloudinary.com/demo/image/upload/v1/${subidas[1].public_id}.webp`,
    });
  });

  it('guardar (fotos de la orden) usa ordenes/<id> y antepone el prefijo del despliegue', async () => {
    const { subidor, subidas } = subidorFalso();
    const almacen = new FotosAlmacenCloudinary(subidor, 'gusmat-demo');

    await almacen.guardar('o1', foto);

    expect(subidas[0].public_id).toMatch(/^gusmat-demo\/ordenes\/o1\/[0-9a-f-]{36}$/);
  });

  it('guardarArchivo con un PDF lo sube como raw y con la extensión en el public_id', async () => {
    const { subidor, subidas } = subidorFalso();
    const almacen = new FotosAlmacenCloudinary(subidor, undefined);

    const r = await almacen.guardarArchivo('comprobantes', Buffer.from('%PDF'), 'pdf');

    expect(subidas[0]).toMatchObject({ resource_type: 'raw' });
    expect(subidas[0].public_id).toMatch(/^comprobantes\/[0-9a-f-]{36}\.pdf$/);
    expect(r).toEqual({ url: `https://res.cloudinary.com/demo/raw/upload/v1/${subidas[0].public_id}` });
  });

  it('guardarArchivo con una imagen la sube como image sin extensión en el public_id', async () => {
    const { subidor, subidas } = subidorFalso();
    const almacen = new FotosAlmacenCloudinary(subidor, undefined);

    await almacen.guardarArchivo('recepcion', Buffer.from('webp'), 'webp');

    expect(subidas[0]).toMatchObject({ resource_type: 'image' });
    expect(subidas[0].public_id).toMatch(/^recepcion\/[0-9a-f-]{36}$/);
  });

  it('borrar destruye sólo las URLs de Cloudinary, ignora las /uploads/ viejas y sigue si una falla', async () => {
    const { subidor, borrados } = subidorFalso();
    const almacen = new FotosAlmacenCloudinary(subidor, undefined);

    await expect(
      almacen.borrar([
        'https://res.cloudinary.com/demo/image/upload/v1/ordenes/o1/falla.webp',
        '/uploads/ordenes/o1/vieja.webp',
        'https://res.cloudinary.com/demo/image/upload/v1/ordenes/o1/a.webp',
        'https://res.cloudinary.com/demo/raw/upload/v1/comprobantes/b.pdf',
      ]),
    ).resolves.toBeUndefined();

    expect(borrados).toEqual([
      { publicId: 'ordenes/o1/a', resourceType: 'image' },
      { publicId: 'comprobantes/b.pdf', resourceType: 'raw' },
    ]);
  });

  it('sube el video como resource_type video y deriva el poster', async () => {
    const subidor = {
      subir: jest.fn(async () => ({ secure_url: 'https://res.cloudinary.com/demo/video/upload/v1/taller/perfil/emp-1/abc.mp4' })),
      destruir: jest.fn(async () => undefined),
    };
    const almacen = new FotosAlmacenCloudinary(subidor as any, 'taller');
    const r = await almacen.guardarVideo('perfil/emp-1', Buffer.from('mp4'), 'mp4');
    expect(subidor.subir).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ resource_type: 'video' }));
    expect((subidor.subir.mock.calls as any)[0][1].public_id).toMatch(/^taller\/perfil\/emp-1\/[0-9a-f-]{36}$/);
    expect(r).toEqual({
      url: 'https://res.cloudinary.com/demo/video/upload/v1/taller/perfil/emp-1/abc.mp4',
      poster_url: 'https://res.cloudinary.com/demo/video/upload/so_0/v1/taller/perfil/emp-1/abc.jpg',
    });
  });
});
