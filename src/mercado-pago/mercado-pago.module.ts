import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { ConexionMpService } from './conexion-mp.service';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoController } from './mercado-pago.controller';

/**
 * El cliente de Mercado Pago que usa el abono (`AbonoModule`) y la conexión
 * por OAuth de la cuenta de la empresa (`/mp/oauth`, pantalla Empresa del ERP).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [MercadoPagoController],
  providers: [MercadoPagoClient, ConexionMpService],
  exports: [MercadoPagoClient],
})
export class MercadoPagoModule {}
