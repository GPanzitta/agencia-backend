import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { FotosAlmacenModule } from '../orden-fotos/fotos-almacen.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { OperacionPago } from './entities/operacion-pago.entity';
import { Operacion } from './entities/operacion.entity';
import { UnidadFoto } from './entities/unidad-foto.entity';
import { UnidadGasto } from './entities/unidad-gasto.entity';
import { Unidad } from './entities/unidad.entity';
import { OperacionesController } from './operaciones.controller';
import { OperacionesService } from './operaciones.service';
import { PerfilPublicoModule } from '../perfil-publico/perfil-publico.module';
import { SitioService } from './sitio.service';
import { UnidadesController } from './unidades.controller';
import { UnidadesService } from './unidades.service';

/** El corazón de la agencia: unidades en stock, operaciones de venta y catálogo público (12/11/2026). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Unidad, UnidadGasto, UnidadFoto, Operacion, OperacionPago]),
    AuthModule,
    // Las fotos de la unidad usan el mismo almacén que el resto (disco en local, Cloudinary en producción).
    FotosAlmacenModule,
    // Los cobros de una operación entran a una billetera.
    WalletsModule,
    // Los datos públicos de la agencia dueña del sitio.
    PerfilPublicoModule,
  ],
  controllers: [UnidadesController, OperacionesController, CatalogoController],
  providers: [UnidadesService, OperacionesService, CatalogoService, SitioService],
  exports: [UnidadesService, OperacionesService, SitioService],
})
export class UnidadesModule {}
