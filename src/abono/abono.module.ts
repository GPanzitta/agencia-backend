import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { MercadoPagoModule } from '../mercado-pago/mercado-pago.module';
import { AbonoController } from './abono.controller';
import { AbonoService } from './abono.service';
import { AbonoPago } from './entities/abono-pago.entity';
import { EstadoAbonoModule } from './estado-abono.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company, AbonoPago]), EstadoAbonoModule, MercadoPagoModule, AuthModule],
  controllers: [AbonoController],
  providers: [AbonoService],
})
export class AbonoModule {}
