import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlataformaService } from './plataforma.service';
import { EstadoAbonoModule } from '../abono/estado-abono.module';
import { PlataformaConfig } from '../abono/entities/plataforma-config.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Role } from '../roles/entities/role.entity';
import { PaymentMethod } from '../payment-methods/entities/payment-method.entity';

@Module({
  imports: [EstadoAbonoModule, TypeOrmModule.forFeature([PlataformaConfig, User, Company, Role, PaymentMethod])],
  controllers: [AdminController],
  providers: [AdminService, PlataformaService],
  exports: [AdminService],
})
export class AdminModule {}
