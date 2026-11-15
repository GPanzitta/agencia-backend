import { v2 as cloudinary } from 'cloudinary';
import type { SubidorCloudinary } from './fotos.almacen.cloudinary';
import type { RecursoCloudinary } from './cloudinary.util';

/**
 * Pegamento con el SDK oficial. El SDK lee `CLOUDINARY_URL` del entorno solo;
 * acá sólo forzamos `secure` (URLs https). Sin pruebas propias: lo que se
 * prueba es `FotosAlmacenCloudinary` con un subidor falso.
 */
export function subidorCloudinary(): SubidorCloudinary {
  cloudinary.config({ secure: true });
  return {
    subir(bytes, opciones) {
      return new Promise((resolve, reject) => {
        const flujo = cloudinary.uploader.upload_stream(
          { ...opciones, overwrite: false },
          (error, resultado) => {
            if (error || !resultado) return reject(error ?? new Error('Cloudinary no devolvió resultado'));
            resolve({ secure_url: resultado.secure_url });
          },
        );
        flujo.end(bytes);
      });
    },
    async destruir(publicId: string, resourceType: RecursoCloudinary) {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
    },
  };
}
