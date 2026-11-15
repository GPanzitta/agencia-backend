import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashRegister } from './entities/cash-register.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashRegister, CashMovement]),
    AuthModule,
    WalletsModule,
  ],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService, TypeOrmModule],
})
export class CashRegisterModule {}
