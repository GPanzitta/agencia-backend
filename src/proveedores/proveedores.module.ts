import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProveedoresService } from './proveedores.service';
import { ProveedoresController } from './proveedores.controller';
import { Proveedor } from './entities/proveedore.entity';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [TypeOrmModule.forFeature([Proveedor]), ExpensesModule],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
})
export class ProveedoresModule {}
