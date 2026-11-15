import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FotosAlmacenDisco } from './fotos.almacen.disco';

describe('FotosAlmacenDisco', () => {
  let raiz: string;
  beforeEach(async () => { raiz = await mkdtemp(join(tmpdir(), 'fotos-')); });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  it('guardarArchivo escribe el archivo con su extensión y devuelve la ruta bajo /uploads/', async () => {
    const almacen = new FotosAlmacenDisco(raiz);

    const { url } = await almacen.guardarArchivo('comprobantes', Buffer.from('%PDF'), 'pdf');

    expect(url).toMatch(/^\/uploads\/comprobantes\/[0-9a-f-]{36}\.pdf$/);
    const enDisco = await readFile(join(raiz, url.slice('/uploads/'.length)));
    expect(enDisco.toString()).toBe('%PDF');
  });

  it('guardarEn escribe principal y miniatura, y borrar las saca', async () => {
    const almacen = new FotosAlmacenDisco(raiz);
    const r = await almacen.guardarEn('ordenes/o1', { principal: Buffer.from('g'), miniatura: Buffer.from('c'), ancho: 1, alto: 1 });
    expect(r.url_miniatura).toBe(r.url.replace(/\.webp$/, '-m.webp'));

    await almacen.borrar([r.url, r.url_miniatura, 'https://res.cloudinary.com/x/image/upload/v1/a.webp']);

    await expect(stat(join(raiz, r.url.slice('/uploads/'.length)))).rejects.toThrow();
  });

  it('guarda el video en uploads y no promete poster', async () => {
    const almacen = new FotosAlmacenDisco(raiz);
    const r = await almacen.guardarVideo('perfil/emp-1', Buffer.from('mp4'), 'mp4');
    expect(r.url).toMatch(/^\/uploads\/perfil\/emp-1\/[0-9a-f-]{36}\.mp4$/);
    expect(r.poster_url).toBeNull();
    expect(existsSync(join(raiz, 'perfil', 'emp-1', r.url.split('/').pop()!))).toBe(true);
  });
});
