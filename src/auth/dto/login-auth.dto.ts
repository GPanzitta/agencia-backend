import { Transform } from 'class-transformer';
import { MaxLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginAuthDto {
  // CLI-17: sin espacios alrededor; las mayúsculas se ignoran al buscar.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}
