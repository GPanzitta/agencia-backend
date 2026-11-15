import { SupplierAdvance } from './entities/supplier-advance.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { Expense } from './entities/expense.entity';
import { ExpensePayment } from './entities/expense-payment.entity';
import { Proveedor } from '../proveedores/entities/proveedore.entity';
import { FinanceSettings } from '../finance/entities/finance-settings.entity';
import { User } from '../auth/entities/user.entity';
import { WalletsModule } from '../wallets/wallets.module';
import { FotosAlmacenModule } from '../orden-fotos/fotos-almacen.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, ExpensePayment, SupplierAdvance, Proveedor, User, FinanceSettings]),
    // Trae WalletLedgerService: el unico autorizado a mover saldos.
    WalletsModule,
    // Los comprobantes van al almacén (disco o Cloudinary).
    FotosAlmacenModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
