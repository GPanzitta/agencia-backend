import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FinanceController } from './finance.controller';
import { RecurringExpensesService } from './recurring-expenses.service';
import { BudgetsService } from './budgets.service';
import { FinanceSettingsService } from './finance-settings.service';

import { RecurringExpense } from './entities/recurring-expense.entity';
import { Budget } from './entities/budget.entity';
import { FinanceSettings } from './entities/finance-settings.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringExpense, Budget, FinanceSettings, Expense]),
    AuthModule,
  ],
  controllers: [FinanceController],
  providers: [RecurringExpensesService, BudgetsService, FinanceSettingsService],
  exports: [RecurringExpensesService, BudgetsService, FinanceSettingsService],
})
export class FinanceModule {}
