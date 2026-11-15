import { randomUUID } from 'crypto';
import { FotosAlmacen } from './fotos.almacen';
import { carpetaCloudinary, posterDeCloudinary, publicIdDeUrl, RecursoCloudinary } from './cloudinary.util';
import type { FotoComprimida } from './fotos.util';

/** Lo único que este almacén necesita del SDK; `subidor.cloudinary.ts` lo implementa. */
export interface SubidorCloudinary {
  subir(bytes: Buffer, opciones: { public_id: string; resource_type: RecursoCloudinary }): Promise<{ secure_url: string }>;
  destruir(publicId: string, resourceType: RecursoCloudinary): Promise<void>;
}

/**
 * Almacén en Cloudinary. Sube desde el buffer (nunca toca el disco) y guarda
 * en la base la URL de entrega (`secure_url`), absoluta. El nombre del
 * archivo lo ponemos nosotros (`<carpeta>/<uuid>`) para que la miniatura sea
 * `<uuid>-m` como en disco. Los PDF van como `raw` y con extensión en el
 * public_id, que es como Cloudinary identifica un raw.
 */
export class FotosAlmacenCloudinary extends FotosAlmacen {
  constructor(
    private readonly subidor: SubidorCloudinary,
    private readonly prefijo: string | undefined,
  ) {
    super();
  }

  async guardarEn(subcarpeta: string, foto: FotoComprimida): Promise<{ url: string; url_miniatura: string }> {
    const base = `${carpetaCloudinary(this.prefijo, subcarpeta)}/${randomUUID()}`;
    const principal = await this.subidor.subir(foto.principal, { public_id: base, resource_type: 'image' });
    const miniatura = await this.subidor.subir(foto.miniatura, { public_id: `${base}-m`, resource_type: 'image' });
    return { url: principal.secure_url, url_miniatura: miniatura.secure_url };
  }

  async guardarArchivo(subcarpeta: string, bytes: Buffer, extension: string): Promise<{ url: string }> {
    const esRaw = extension.toLowerCase() === 'pdf';
    const nombre = esRaw ? `${randomUUID()}.${extension}` : randomUUID();
    const subida = await this.subidor.subir(bytes, {
      public_id: `${carpetaCloudinary(this.prefijo, subcarpeta)}/${nombre}`,
      resource_type: esRaw ? 'raw' : 'image',
    });
    return { url: subida.secure_url };
  }

  async guardarVideo(subcarpeta: string, bytes: Buffer, extension: string): Promise<{ url: string; poster_url: string | null }> {
    // Sin extensión en el public_id: en `video`, como en `image`, Cloudinary la
    // pone él y `publicIdDeUrl` la saca para poder borrarlo después.
    void extension;
    const subida = await this.subidor.subir(bytes, {
      public_id: `${carpetaCloudinary(this.prefijo, subcarpeta)}/${randomUUID()}`,
      resource_type: 'video',
    });
    return { url: subida.secure_url, poster_url: posterDeCloudinary(subida.secure_url) };
  }

  async borrar(urls: string[]): Promise<void> {
    for (const url of urls) {
      const destino = publicIdDeUrl(url);
      if (!destino) continue;
      await this.subidor.destruir(destino.publicId, destino.resourceType).catch(() => undefined);
    }
  }
}
