import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { PlataformaConfig } from './entities/plataforma-config.entity';
import { EstadoAbonoService } from './estado-abono.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company, PlataformaConfig])],
  providers: [EstadoAbonoService],
  exports: [EstadoAbonoService],
})
export class EstadoAbonoModule {}
