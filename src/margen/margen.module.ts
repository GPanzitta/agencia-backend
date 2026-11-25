import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Operacion } from '../unidades/entities/operacion.entity';
import { UnidadGasto } from '../unidades/entities/unidad-gasto.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { MargenController } from './margen.controller';
import { MargenService } from './margen.service';

/** El tablero de rentabilidad: lee el stock y las ventas cerradas, no escribe nada (23/11/2026). */
@Module({
  imports: [TypeOrmModule.forFeature([Unidad, UnidadGasto, Operacion]), AuthModule],
  controllers: [MargenController],
  providers: [MargenService],
})
export class MargenModule {}
