import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** SEG-08: el alta de taller recibía un objeto sin validar. */
export class CrearTallerDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  companyName: string;

  @IsString() @IsOptional() @MaxLength(100)
  domain?: string;
}
