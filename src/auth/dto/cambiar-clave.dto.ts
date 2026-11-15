import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { LARGO_MAXIMO_CLAVE, LARGO_MINIMO_CLAVE } from '../clave.util';

/**
 * POST /auth/cambiar-clave (SEG-54). La repetición de la nueva la controla el
 * ERP: acá llega una sola vez. La actual no se valida por largo (las claves
 * de antes pueden tener 6).
 */
export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty({ message: 'Escribí tu clave actual.' })
  @MaxLength(255)
  actual: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: `La clave nueva tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` })
  @MaxLength(LARGO_MAXIMO_CLAVE, { message: `La clave nueva puede tener hasta ${LARGO_MAXIMO_CLAVE} caracteres.` })
  nueva: string;
}
