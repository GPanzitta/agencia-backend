import { carpetaCloudinary, hayCloudinary, publicIdDeUrl, patronDeSubida, posterDeCloudinary } from './cloudinary.util';

describe('hayCloudinary', () => {
  it('sin CLOUDINARY_URL no hay Cloudinary (se usa el disco)', () => {
    expect(hayCloudinary({})).toBe(false);
    expect(hayCloudinary({ CLOUDINARY_URL: '' })).toBe(false);
    expect(hayCloudinary({ CLOUDINARY_URL: '   ' })).toBe(false);
  });

  it('con la variable estándar cloudinary://key:secret@cloud hay Cloudinary', () => {
    expect(hayCloudinary({ CLOUDINARY_URL: 'cloudinary://123:abc@mi-cloud' })).toBe(true);
  });

  it('una URL que no es cloudinary:// se rechaza para no arrancar con una config rota', () => {
    expect(hayCloudinary({ CLOUDINARY_URL: 'https://res.cloudinary.com/x' })).toBe(false);
  });
});

describe('carpetaCloudinary', () => {
  it('sin prefijo es la subcarpeta tal cual', () => {
    expect(carpetaCloudinary(undefined, 'ordenes/o1')).toBe('ordenes/o1');
  });

  it('con prefijo (un despliegue por carpeta en la misma cuenta) lo antepone', () => {
    expect(carpetaCloudinary('gusmat-demo', 'repuestos/r1')).toBe('gusmat-demo/repuestos/r1');
  });

  it('tolera barras de más en el prefijo y la subcarpeta', () => {
    expect(carpetaCloudinary('/gusmat-demo/', '/comprobantes/')).toBe('gusmat-demo/comprobantes');
  });
});

describe('publicIdDeUrl', () => {
  it('de una imagen saca el public_id sin la extensión y con la carpeta completa', () => {
    expect(
      publicIdDeUrl('https://res.cloudinary.com/mi-cloud/image/upload/v1699999999/gusmat-demo/ordenes/o1/abc-123.webp'),
    ).toEqual({ publicId: 'gusmat-demo/ordenes/o1/abc-123', resourceType: 'image' });
  });

  it('de un archivo raw (PDF) conserva la extensión porque es parte del public_id', () => {
    expect(
      publicIdDeUrl('https://res.cloudinary.com/mi-cloud/raw/upload/v1/comprobantes/abc.pdf'),
    ).toEqual({ publicId: 'comprobantes/abc.pdf', resourceType: 'raw' });
  });

  it('funciona sin la versión en la URL', () => {
    expect(
      publicIdDeUrl('https://res.cloudinary.com/mi-cloud/image/upload/repuestos/r1/x-m.webp'),
    ).toEqual({ publicId: 'repuestos/r1/x-m', resourceType: 'image' });
  });

  it('una URL que no es de Cloudinary (las /uploads/ viejas o cualquier otra) da null', () => {
    expect(publicIdDeUrl('/uploads/ordenes/o1/x.webp')).toBeNull();
    expect(publicIdDeUrl('https://otro-host.com/image/upload/v1/x.webp')).toBeNull();
    expect(publicIdDeUrl('')).toBeNull();
  });
});

describe('patronDeSubida', () => {
  const patron = patronDeSubida('notas');

  it('acepta la ruta del disco local que devuelve upload-foto', () => {
    expect(patron.test('/uploads/notas/3f2a-foto.webp')).toBe(true);
  });

  it('acepta la URL de entrega de Cloudinary de esa subcarpeta, con o sin prefijo de despliegue', () => {
    expect(patron.test('https://res.cloudinary.com/m5fo7oj3/image/upload/v1789334736/gusmat-dev/notas/37c658a2.webp')).toBe(true);
    expect(patron.test('https://res.cloudinary.com/m5fo7oj3/image/upload/notas/37c658a2.webp')).toBe(true);
  });

  it('rechaza rutas de otra subcarpeta y URLs ajenas', () => {
    expect(patron.test('/uploads/repuestos/3f2a.webp')).toBe(false);
    expect(patron.test('https://res.cloudinary.com/m5fo7oj3/image/upload/v1/gusmat-dev/repuestos/x.webp')).toBe(false);
    expect(patron.test('https://evil.example/notas/x.webp')).toBe(false);
    expect(patron.test('/uploads/notas/../secreto')).toBe(false);
  });
});

describe('posterDeCloudinary', () => {
  it('mete /so_0/ después de /upload/ y cambia la extensión por .jpg', () => {
    expect(posterDeCloudinary('https://res.cloudinary.com/demo/video/upload/v1726800000/taller/perfil/emp-1/abc.mp4'))
      .toBe('https://res.cloudinary.com/demo/video/upload/so_0/v1726800000/taller/perfil/emp-1/abc.jpg');
  });

  it('funciona sin versión y con webm', () => {
    expect(posterDeCloudinary('https://res.cloudinary.com/demo/video/upload/perfil/emp-1/abc.webm'))
      .toBe('https://res.cloudinary.com/demo/video/upload/so_0/perfil/emp-1/abc.jpg');
  });

  it('descarta la query antes de armar el poster', () => {
    expect(posterDeCloudinary('https://res.cloudinary.com/demo/video/upload/v1/abc.mp4?_a=xyz'))
      .toBe('https://res.cloudinary.com/demo/video/upload/so_0/v1/abc.jpg');
  });

  it('lo que no es un video de Cloudinary no tiene poster', () => {
    expect(posterDeCloudinary('/uploads/perfil/emp-1/abc.mp4')).toBeNull();
    expect(posterDeCloudinary('https://res.cloudinary.com/demo/image/upload/v1/abc.webp')).toBeNull();
    expect(posterDeCloudinary('https://evil.com/video/upload/abc.mp4')).toBeNull();
    expect(posterDeCloudinary('')).toBeNull();
  });
});

describe('publicIdDeUrl con videos', () => {
  it('reconoce un video y devuelve su resource_type (si no, el borrado no lo encuentra)', () => {
    expect(publicIdDeUrl('https://res.cloudinary.com/demo/video/upload/v1/taller/perfil/emp-1/abc.mp4'))
      .toEqual({ publicId: 'taller/perfil/emp-1/abc', resourceType: 'video' });
  });
});
