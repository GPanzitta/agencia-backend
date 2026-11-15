import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { SubidasService, extensionDeMime } from './subidas.service';
import { FotosAlmacen } from './fotos.almacen';

describe('extensionDeMime', () => {
  it('mapea los mime que aceptan los endpoints a una extensión corta', () => {
    expect(extensionDeMime('image/jpeg')).toBe('jpg');
    expect(extensionDeMime('image/jpg')).toBe('jpg');
    expect(extensionDeMime('image/png')).toBe('png');
    expect(extensionDeMime('image/webp')).toBe('webp');
    expect(extensionDeMime('image/gif')).toBe('gif');
    expect(extensionDeMime('application/pdf')).toBe('pdf');
  });

  it('un mime desconocido da null (el controlador ya lo filtró, pero no se inventa extensión)', () => {
    expect(extensionDeMime('application/zip')).toBeNull();
  });
});

describe('SubidasService', () => {
  let almacen: jest.Mocked<Pick<FotosAlmacen, 'guardarArchivo'>>;
  let service: SubidasService;
  beforeEach(() => {
    almacen = { guardarArchivo: jest.fn().mockResolvedValue({ url: '/uploads/x/y.webp' }) };
    service = new SubidasService(almacen as unknown as FotosAlmacen);
  });

  it('fotoComprimida comprime a WebP de hasta 1600 px y guarda sólo la principal', async () => {
    const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#f00' } }).jpeg().toBuffer();

    const r = await service.fotoComprimida('recepcion', { buffer: original, mimetype: 'image/jpeg' } as Express.Multer.File);

    expect(r).toEqual({ url: '/uploads/x/y.webp' });
    const [subcarpeta, bytes, extension] = almacen.guardarArchivo.mock.calls[0];
    expect(subcarpeta).toBe('recepcion');
    expect(extension).toBe('webp');
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
  });

  it('archivoCrudo guarda los bytes tal cual con la extensión del mime (comprobantes y remitos pueden ser PDF)', async () => {
    const bytes = Buffer.from('%PDF-1.4');

    await service.archivoCrudo('comprobantes', { buffer: bytes, mimetype: 'application/pdf' } as Express.Multer.File);

    expect(almacen.guardarArchivo).toHaveBeenCalledWith('comprobantes', bytes, 'pdf');
  });

  it('sin archivo o con un mime que no se entiende tira BadRequest', async () => {
    await expect(service.archivoCrudo('remitos', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.archivoCrudo('remitos', { buffer: Buffer.from('x'), mimetype: 'application/zip' } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.fotoComprimida('notas', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una "foto" que no es una imagen tira BadRequest en vez de un 500', async () => {
    await expect(
      service.fotoComprimida('notas', { buffer: Buffer.from('no soy imagen'), mimetype: 'image/jpeg' } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SubidasService: el tipo real del archivo (SEG-09)', () => {
  let almacen: jest.Mocked<Pick<FotosAlmacen, 'guardarArchivo'>>;
  let service: SubidasService;
  beforeEach(() => {
    almacen = { guardarArchivo: jest.fn().mockResolvedValue({ url: '/uploads/x/y.pdf' }) };
    service = new SubidasService(almacen as unknown as FotosAlmacen);
  });
  const archivo = (contenido: string | Buffer, mimetype: string) =>
    ({ buffer: Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido), mimetype }) as Express.Multer.File;

  it('un html declarado como image/png no se guarda', async () => {
    await expect(service.archivoCrudo('comprobantes', archivo('<html><script>alert(1)</script>', 'image/png'))).rejects.toBeInstanceOf(BadRequestException);
    expect(almacen.guardarArchivo).not.toHaveBeenCalled();
  });

  it('un pdf de verdad se guarda como pdf', async () => {
    await service.archivoCrudo('comprobantes', archivo('%PDF-1.7\n...', 'application/pdf'));
    expect(almacen.guardarArchivo).toHaveBeenCalledWith('comprobantes', expect.any(Buffer), 'pdf');
  });

  it('un pdf declarado como imagen tampoco: lo declarado y lo real tienen que coincidir', async () => {
    await expect(service.archivoCrudo('remitos', archivo('%PDF-1.7\n', 'image/jpeg'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una «foto» que es un svg no llega a sharp', async () => {
    await expect(service.fotoComprimida('recepcion', archivo('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/webp'))).rejects.toBeInstanceOf(BadRequestException);
    expect(almacen.guardarArchivo).not.toHaveBeenCalled();
  });
});
