import { IsString, IsNotEmpty, MaxLength, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { PaymentMethodType } from '../entities/payment-method.entity';

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(PaymentMethodType)
  @IsNotEmpty()
  type: PaymentMethodType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
