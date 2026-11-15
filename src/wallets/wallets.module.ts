import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletsController } from './wallets.controller';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletMovement } from './entities/wallet-movement.entity';
import { CashRegister } from '../cash-register/entities/cash-register.entity';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletBalance, WalletMovement, CashRegister, Company]),
  ],
  controllers: [WalletsController],
  providers: [WalletsService, WalletLedgerService],
  exports: [WalletsService, WalletLedgerService, TypeOrmModule],
})
export class WalletsModule {}
