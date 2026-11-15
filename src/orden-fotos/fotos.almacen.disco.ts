import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { FotosAlmacen } from './fotos.almacen';
import type { FotoComprimida } from './fotos.util';

/**
 * Almacén en disco: `uploads/<subcarpeta>/`, servido por `ServeStaticModule`
 * en `app.module.ts`. Es el de desarrollo; en un hosting con disco efímero
 * (Render free) las fotos se pierden en cada deploy — ahí va Cloudinary.
 */
export class FotosAlmacenDisco extends FotosAlmacen {
  constructor(private readonly raiz = join(process.cwd(), 'uploads')) {
    super();
  }

  async guardarEn(subcarpeta: string, foto: FotoComprimida): Promise<{ url: string; url_miniatura: string }> {
    const carpeta = await this.carpeta(subcarpeta);
    const nombre = randomUUID();
    await writeFile(join(carpeta, `${nombre}.webp`), foto.principal);
    await writeFile(join(carpeta, `${nombre}-m.webp`), foto.miniatura);
    return {
      url: `/uploads/${subcarpeta}/${nombre}.webp`,
      url_miniatura: `/uploads/${subcarpeta}/${nombre}-m.webp`,
    };
  }

  async guardarArchivo(subcarpeta: string, bytes: Buffer, extension: string): Promise<{ url: string }> {
    const carpeta = await this.carpeta(subcarpeta);
    const nombre = `${randomUUID()}.${extension}`;
    await writeFile(join(carpeta, nombre), bytes);
    return { url: `/uploads/${subcarpeta}/${nombre}` };
  }

  /** En disco no hay quien saque el primer cuadro: el portal usa la portada. */
  async guardarVideo(subcarpeta: string, bytes: Buffer, extension: string): Promise<{ url: string; poster_url: string | null }> {
    const { url } = await this.guardarArchivo(subcarpeta, bytes, extension);
    return { url, poster_url: null };
  }

  /** Solo acepta rutas bajo `/uploads/`: una URL cualquiera no borra nada. */
  async borrar(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (!url.startsWith('/uploads/') || url.includes('..')) continue;
      await unlink(join(this.raiz, url.slice('/uploads/'.length))).catch(() => undefined);
    }
  }

  /** Una ruta bajo `/uploads/`, sin `..`: lo que este almacén escribió. */
  protected leerPropio(url: string): Promise<Buffer> {
    if (!url.startsWith('/uploads/') || url.includes('..')) return Promise.reject(new Error(`URL ajena al almacén: ${url}`));
    return readFile(join(this.raiz, ...url.slice('/uploads/'.length).split('/')));
  }

  private async carpeta(subcarpeta: string): Promise<string> {
    const carpeta = join(this.raiz, ...subcarpeta.split('/'));
    await mkdir(carpeta, { recursive: true });
    return carpeta;
  }
}
