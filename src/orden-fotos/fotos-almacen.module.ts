import { Module } from '@nestjs/common';
import { FotosAlmacen } from './fotos.almacen';
import { crearFotosAlmacen } from './fotos.almacen.factory';
import { SubidasService } from './subidas.service';

/**
 * El almacén de archivos (disco o Cloudinary, según `CLOUDINARY_URL`) y el
 * servicio de subidas sueltas. Lo importan todos los módulos que reciben
 * archivos: órdenes (recepción), notas técnicas, gastos (comprobantes),
 * compras (remitos), y las fotos de órdenes y repuestos.
 */
@Module({
  providers: [
    { provide: FotosAlmacen, useFactory: () => crearFotosAlmacen(process.env) },
    SubidasService,
  ],
  exports: [FotosAlmacen, SubidasService],
})
export class FotosAlmacenModule {}
