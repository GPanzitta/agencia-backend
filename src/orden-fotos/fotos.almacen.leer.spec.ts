import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FotosAlmacenDisco } from './fotos.almacen.disco';
import { TOPE_BYTES_CORREO } from './fotos.almacen';
import { FotosAlmacenCloudinary, SubidorCloudinary } from './fotos.almacen.cloudinary';

/**
 * Leer lo guardado, para adjuntarlo a un correo (spec 2026-10-07 §5.2): sólo
 * lo que es del almacén. Una URL cualquiera escrita en la base no hace que
 * el servidor salga a buscarla.
 */
describe('FotosAlmacen.leer', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  /** Una respuesta con cuerpo en stream (en trozos de `trozo` bytes) y, opcional, `content-length`. */
  const respuesta = (bytes: string | Uint8Array, ok = true, status = 200, largo?: number, trozo = 4) => {
    const datos = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    let i = 0;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= datos.length) return c.close();
        c.enqueue(datos.slice(i, i + trozo));
        i += trozo;
      },
    });
    return {
      ok,
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' && largo !== undefined ? String(largo) : null) },
      body: cuerpo,
    } as unknown as Response;
  };

  describe('en disco', () => {
    let raiz: string;
    beforeEach(async () => {
      raiz = await mkdtemp(join(tmpdir(), 'leer-'));
    });
    afterEach(() => rm(raiz, { recursive: true, force: true }));

    it('lee lo que guardó bajo /uploads/', async () => {
      const almacen = new FotosAlmacenDisco(raiz);
      const { url } = await almacen.guardarArchivo('ordenes/o1/documentos', Buffer.from('%PDF-1.7 hola'), 'pdf');
      await expect(almacen.leer(url)).resolves.toEqual(Buffer.from('%PDF-1.7 hola'));
    });

    it('rechaza rutas con .. y URLs que no son del almacén', async () => {
      const almacen = new FotosAlmacenDisco(raiz);
      await expect(almacen.leer('/uploads/../.env')).rejects.toThrow('URL ajena al almacén');
      await expect(almacen.leer('http://169.254.169.254/latest/meta-data')).rejects.toThrow('URL ajena al almacén');
      await expect(almacen.leer('https://otro-sitio.com/a.pdf')).rejects.toThrow('URL ajena al almacén');
    });

    it('las URLs de Cloudinary (la copia local de la base las tiene) se bajan', async () => {
      global.fetch = jest.fn(async () => respuesta('foto')) as unknown as typeof fetch;
      const almacen = new FotosAlmacenDisco(raiz);
      await expect(almacen.leer('https://res.cloudinary.com/demo/image/upload/v1/ordenes/o1/a.webp')).resolves.toEqual(Buffer.from('foto'));
      expect(global.fetch).toHaveBeenCalledWith('https://res.cloudinary.com/demo/image/upload/v1/ordenes/o1/a.webp', expect.objectContaining({ signal: expect.anything(), redirect: 'error' }));
    });
  });

  describe('en Cloudinary', () => {
    const subidor: SubidorCloudinary = { subir: jest.fn(), destruir: jest.fn() };

    it('baja la URL de entrega', async () => {
      global.fetch = jest.fn(async () => respuesta('%PDF-')) as unknown as typeof fetch;
      const almacen = new FotosAlmacenCloudinary(subidor, undefined);
      await expect(almacen.leer('https://res.cloudinary.com/demo/raw/upload/v1/ordenes/o1/documentos/x.pdf')).resolves.toEqual(Buffer.from('%PDF-'));
    });

    it('un 401 de Cloudinary (entrega de PDF deshabilitada) es un error', async () => {
      global.fetch = jest.fn(async () => respuesta('', false, 401)) as unknown as typeof fetch;
      const almacen = new FotosAlmacenCloudinary(subidor, undefined);
      await expect(almacen.leer('https://res.cloudinary.com/demo/raw/upload/v1/x.pdf')).rejects.toThrow('HTTP 401');
    });

    const URL_CLD = 'https://res.cloudinary.com/demo/raw/upload/v1/x.pdf';

    it('baja con redirect:error: una redirección no sale de Cloudinary', async () => {
      global.fetch = jest.fn(async () => respuesta('ok')) as unknown as typeof fetch;
      await new FotosAlmacenCloudinary(subidor, undefined).leer(URL_CLD);
      expect(global.fetch).toHaveBeenCalledWith(URL_CLD, expect.objectContaining({ redirect: 'error' }));
    });

    it('rechaza sin leer el cuerpo si content-length pasa el tope', async () => {
      const r = respuesta('x', true, 200, 1001);
      global.fetch = jest.fn(async () => r) as unknown as typeof fetch;
      await expect(new FotosAlmacenCloudinary(subidor, undefined).leer(URL_CLD, 1000)).rejects.toThrow('tope');
    });

    it('corta el stream cuando lo leído pasa el tope aunque no haya content-length', async () => {
      const r = respuesta(new Uint8Array(5000), true, 200, undefined, 100);
      global.fetch = jest.fn(async () => r) as unknown as typeof fetch;
      await expect(new FotosAlmacenCloudinary(subidor, undefined).leer(URL_CLD, 1000)).rejects.toThrow('tope');
    });

    it('acepta lo que cabe justo en el tope', async () => {
      global.fetch = jest.fn(async () => respuesta(new Uint8Array(1000), true, 200, 1000)) as unknown as typeof fetch;
      await expect(new FotosAlmacenCloudinary(subidor, undefined).leer(URL_CLD, 1000)).resolves.toHaveLength(1000);
    });

    it('sin tope explícito usa el de 20 MB del correo', async () => {
      global.fetch = jest.fn(async () => respuesta('x', true, 200, TOPE_BYTES_CORREO + 1)) as unknown as typeof fetch;
      await expect(new FotosAlmacenCloudinary(subidor, undefined).leer(URL_CLD)).rejects.toThrow('tope');
    });

    it('una ruta /uploads/ vieja no existe en este almacén', async () => {
      const almacen = new FotosAlmacenCloudinary(subidor, undefined);
      await expect(almacen.leer('/uploads/ordenes/o1/a.webp')).rejects.toThrow('URL ajena al almacén');
    });
  });
});
