import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { FotosAlmacenModule } from '../orden-fotos/fotos-almacen.module';
import { UnidadesModule } from '../unidades/unidades.module';
import { Unidad } from '../unidades/entities/unidad.entity';
import { Interesado } from './interesado.entity';
import { ConsultasController, InteresadosController } from './interesados.controller';
import { InteresadosService } from './interesados.service';
import { ReservaWeb } from './reserva-web.entity';
import { ReservasPublicasController, ReservasWebController } from './reservas-web.controller';
import { ReservasWebService } from './reservas-web.service';

/** Interesados y consultas del sitio (tanda de la demo, 12/11/2026). */
@Module({
  imports: [TypeOrmModule.forFeature([Interesado, Unidad, ReservaWeb]), AuthModule, UnidadesModule, FotosAlmacenModule],
  controllers: [InteresadosController, ConsultasController, ReservasPublicasController, ReservasWebController],
  providers: [InteresadosService, ReservasWebService],
})
export class InteresadosModule {}
