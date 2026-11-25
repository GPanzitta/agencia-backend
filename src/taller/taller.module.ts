import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { FotosAlmacenModule } from '../orden-fotos/fotos-almacen.module';
import { UnidadGasto } from '../unidades/entities/unidad-gasto.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { OrdenAlistajeRepuesto } from './entities/orden-alistaje-repuesto.entity';
import { OrdenAlistaje } from './entities/orden-alistaje.entity';
import { OrdenCompraTaller } from './entities/orden-compra-taller.entity';
import { RepuestoAuto } from './entities/repuesto-auto.entity';
import { TallerController } from './taller.controller';
import { TallerService } from './taller.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RepuestoAuto, OrdenAlistaje, OrdenAlistajeRepuesto, OrdenCompraTaller, Unidad, UnidadGasto]),
    AuthModule,
    FotosAlmacenModule,
  ],
  controllers: [TallerController],
  providers: [TallerService],
  exports: [TallerService],
})
export class TallerModule {}
