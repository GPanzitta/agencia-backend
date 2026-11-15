import { IsString, IsNotEmpty, MaxLength, IsEnum, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { WalletType } from '../entities/wallet.entity';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(WalletType)
  @IsNotEmpty()
  type: WalletType;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  /** Agencia: la moneda de la caja. Sin dato, pesos. */
  @IsIn(['ARS', 'USD'])
  @IsOptional()
  moneda?: 'ARS' | 'USD';
}
