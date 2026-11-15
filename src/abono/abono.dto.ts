import { IsEmail } from 'class-validator';

export class SuscribirDto {
  /** El correo de la cuenta de Mercado Pago que va a pagar: MP lo exige para crear la suscripción. */
  @IsEmail({}, { message: 'Escribí un correo válido.' })
  payer_email: string;
}
