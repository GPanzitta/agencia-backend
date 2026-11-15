/** Tope de un archivo que se lee para adjuntar a un correo (20 MB). */
export const TOPE_BYTES_CORREO = 20 * 1024 * 1024;
import type { FotoComprimida } from './fotos.util';

/**
 * Dónde viven los archivos que suben el ERP y el portal: fotos de órdenes y
 * repuestos (principal + miniatura, ya comprimidas por `fotos.util`) y
 * archivos sueltos (fotos de recepción y de notas técnicas, comprobantes y
 * remitos, que pueden ser PDF).
 *
 * Es el token que inyectan los servicios; la implementación la elige
 * `fotos.almacen.factory.ts` por entorno: disco local en dev
 * (`fotos.almacen.disco.ts`, servido por `ServeStaticModule`) o Cloudinary
 * cuando hay `CLOUDINARY_URL` (`fotos.almacen.cloudinary.ts`) — en Render el
 * disco es efímero y se borra en cada deploy.
 *
 * Las URLs que devuelve se guardan tal cual en la base: relativas
 * (`/uploads/...`) en disco, absolutas (`https://res.cloudinary.com/...`) en
 * Cloudinary. Los frontends aceptan las dos.
 */
export abstract class FotosAlmacen {
  /** Fotos de la orden: `ordenes/<orden>/`. */
  guardar(ordenId: string, foto: FotoComprimida): Promise<{ url: string; url_miniatura: string }> {
    return this.guardarEn(`ordenes/${ordenId}`, foto);
  }

  /** Cualquier subcarpeta (las fotos de repuestos usan `repuestos/<id>`). */
  abstract guardarEn(subcarpeta: string, foto: FotoComprimida): Promise<{ url: string; url_miniatura: string }>;

  /** Un archivo suelto, con su extensión (`webp`, `jpg`, `pdf`...). */
  abstract guardarArchivo(subcarpeta: string, bytes: Buffer, extension: string): Promise<{ url: string }>;

  /**
   * El video de portada del sitio (S1c-b §3.3). Devuelve además el poster
   * cuando el almacén sabe generarlo: Cloudinary sí (primer cuadro), el disco
   * local no.
   */
  abstract guardarVideo(
    subcarpeta: string,
    bytes: Buffer,
    extension: string,
  ): Promise<{ url: string; poster_url: string | null }>;

  /** Borra lo que sea propio; una URL ajena o inexistente no rompe nada. */
  abstract borrar(urls: string[]): Promise<void>;

  /**
   * Los bytes de un archivo guardado, para adjuntarlo a un correo (spec
   * 2026-10-07 §5.2). Sólo lo que es del almacén: una URL de Cloudinary (las
   * de producción, que la copia local de la base también tiene) o, en el
   * disco, una ruta bajo `/uploads/`. Cualquier otra URL se rechaza: el
   * servidor no sale a buscar lo que alguien haya escrito en la base.
   *
   * `tope` (bytes, por defecto los 20 MB de un correo) acota lo que se baja:
   * en Render hay 512 MB de memoria y un archivo enorme no debe cargarse entero.
   */
  async leer(url: string, tope: number = TOPE_BYTES_CORREO): Promise<Buffer> {
    if (url.startsWith(ORIGEN_CLOUDINARY)) return this.bajar(url, tope);
    return this.leerPropio(url);
  }

  /** Lo que no es de Cloudinary: el disco lo sobreescribe; Cloudinary no tiene otra cosa. */
  protected leerPropio(url: string): Promise<Buffer> {
    return Promise.reject(new Error(`URL ajena al almacén: ${url}`));
  }

  /** Sin redirecciones (no se sale de Cloudinary) y cortando el cuerpo apenas pasa el tope. */
  private async bajar(url: string, tope: number): Promise<Buffer> {
    const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} bajando ${url}`);
    const declarado = Number(r.headers.get('content-length'));
    if (declarado > tope) {
      void r.body?.cancel().catch(() => undefined);
      throw new Error(`El archivo pasa el tope de ${tope} bytes: ${url}`);
    }
    if (!r.body) throw new Error(`Respuesta sin cuerpo bajando ${url}`);
    const trozos: Uint8Array[] = [];
    let total = 0;
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > tope) {
        await lector.cancel().catch(() => undefined);
        throw new Error(`El archivo pasa el tope de ${tope} bytes: ${url}`);
      }
      trozos.push(value);
    }
    return Buffer.concat(trozos);
  }
}

/** De dónde se aceptan URLs absolutas: la entrega de Cloudinary. */
export const ORIGEN_CLOUDINARY = 'https://res.cloudinary.com/';
