import { BadRequestException, ConflictException } from '@nestjs/common';

import type { CodigoError } from './codigos';

/**
 * Un error que el operario puede provocar haciendo su trabajo.
 *
 * Extiende BadRequestException a propósito: los controllers y los tests que ya
 * esperan un 400 siguen funcionando sin tocarse. Lo que agrega es el `code`,
 * que es lo que el ERP usa para escribir el mensaje en castellano y ofrecer el
 * botón que resuelve el problema.
 *
 * No usar para errores defensivos (una entidad inexistente con un id
 * inventado): esos no los provoca una persona trabajando y no necesitan
 * traducción propia.
 */
export class ErrorDeNegocio extends BadRequestException {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string, extra?: Record<string, unknown>) {
    // `extra` va PRIMERO: un dato extra que se llame `code` o `message` es
    // información del caso, no el contrato. Si se esparciera al final pisaría
    // el código que el ERP usa para traducir.
    super({ ...extra, code: codigo, message: mensaje });
    this.codigo = codigo;
  }
}

/**
 * La hermana 409 de `ErrorDeNegocio`, con exactamente el mismo payload.
 *
 * Existe porque hay rechazos que no son "revisá los datos que cargaste" sino
 * "ese dato ya está en otro lado": el ERP tiene que poder ofrecer "ir a ese
 * repuesto" en vez de un cartel de validación (spec §3, conflicto 12). El ERP
 * no cambia: `mensajes.util.ts` traduce por `code` y no por status.
 */
export class ConflictoDeNegocio extends ConflictException {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje: string, extra?: Record<string, unknown>) {
    // Mismo orden que ErrorDeNegocio: `extra` primero, para que un dato extra
    // llamado `code` o `message` no pise el contrato.
    super({ ...extra, code: codigo, message: mensaje });
    this.codigo = codigo;
  }
}
