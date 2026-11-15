import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { AuthModule } from '../auth/auth.module';
import { Wallet } from '../wallets/entities/wallet.entity';

@Module({
  // Wallet sólo para validar las billeteras de cobro que se asignan (D2):
  // que existan y estén activas.
  imports: [TypeOrmModule.forFeature([Company, Wallet]), AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
