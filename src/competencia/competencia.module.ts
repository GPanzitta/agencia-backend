import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { AvisoAjeno } from './aviso-ajeno.entity';
import { CompetenciaController } from './competencia.controller';
import { CompetenciaService } from './competencia.service';
import { Competidor } from './competidor.entity';

/** Comparación de precios con otros vendedores (14/11/2026). */
@Module({
  imports: [TypeOrmModule.forFeature([Competidor, AvisoAjeno, Unidad, Company]), AuthModule],
  controllers: [CompetenciaController],
  providers: [CompetenciaService],
})
export class CompetenciaModule {}
