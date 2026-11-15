import { crearFotosAlmacen } from './fotos.almacen.factory';
import { FotosAlmacenDisco } from './fotos.almacen.disco';
import { FotosAlmacenCloudinary } from './fotos.almacen.cloudinary';

describe('crearFotosAlmacen', () => {
  it('sin CLOUDINARY_URL guarda en disco (dev)', () => {
    expect(crearFotosAlmacen({})).toBeInstanceOf(FotosAlmacenDisco);
  });

  it('con CLOUDINARY_URL guarda en Cloudinary', () => {
    expect(crearFotosAlmacen({ CLOUDINARY_URL: 'cloudinary://1:2@demo' })).toBeInstanceOf(FotosAlmacenCloudinary);
  });
});
