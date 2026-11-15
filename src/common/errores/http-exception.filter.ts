import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import type { CodigoError } from './codigos';

/** Lo único que sale a la pantalla cuando falla el servidor. */
const MENSAJE_GENERICO = 'No se pudo completar la operación. Probá de nuevo o avisale al encargado.';

/** Multer no tiene mensajes en castellano: LIMIT_FILE_SIZE llega tal cual del paquete. */
const MENSAJE_ARCHIVO_GRANDE = 'El archivo es demasiado grande.';

/**
 * Los mensajes en inglés que un 413 puede traer de fábrica, sin pasar por
 * `ErrorDeNegocio` (Minor 1 de la revisión final): el de Multer
 * (`LIMIT_FILE_SIZE`) y el de `express.json`/`body-parser`
 * (`PayloadTooLargeError`). Si el 413 trae cualquier OTRO mensaje se respeta
 * tal cual: es una `ErrorDeNegocio` propia, ya en castellano.
 */
const MENSAJES_413_DE_FABRICA = ['file too large', 'request entity too large'];

/**
 * Le da forma `{ statusCode, code, message }` a TODO lo que sale del backend.
 *
 * Existe para que el ERP nunca reciba un error sin código: los sitios que ya
 * declaran el suyo lo conservan, y los 218 que todavía no lo hacen reciben uno
 * genérico según el status. Así la migración de códigos se puede hacer módulo
 * por módulo sin que en el medio quede algo peor que hoy.
 *
 * Ningún 5xx reenvía el mensaje, venga de una excepción inesperada o de una
 * HttpException con status 500: un error de servidor suele traer texto de
 * Postgres, y eso no va a la pantalla de nadie. El original queda en el log.
 */
/** Texto completo de un error para el log, sea Error, objeto plano o primitivo. */
function describirError(e: unknown): string {
  if (e instanceof Error) return e.stack ?? e.message;
  if (e !== null && typeof e === 'object') {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

@Catch()
export class FiltroDeErrores implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  /**
   * Dos reglas están codificadas acá y conviene leerlas antes de tocar el mapa:
   * 401 y 403 NO comparten código (vencerse la sesión y no tener el puesto se
   * arreglan de maneras distintas), y 400/422 reenvían el mensaje del backend
   * mientras que los 5xx nunca lo hacen.
   */
  private codigoPorStatus(status: number): CodigoError {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return 'NO_ENCONTRADO';
      case HttpStatus.UNAUTHORIZED:
        return 'SESION_VENCIDA';
      case HttpStatus.FORBIDDEN:
        return 'SIN_PERMISO';
      case HttpStatus.CONFLICT:
        return 'CONFLICTO';
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        // Un rechazo de negocio que el operario puede corregir. NO es lo mismo
        // que una falla del sistema: mezclarlos hace que el ERP le diga
        // "avisale al encargado" a alguien que solo cargó un dato de más.
        return 'SOLICITUD_RECHAZADA';
      case HttpStatus.TOO_MANY_REQUESTS:
        // Pendiente del portal (POR-04): el límite de pedidos salía como
        // ERROR_INTERNO y el portal no podía decir «esperá un minuto».
        return 'DEMASIADOS_INTENTOS';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        // El archivo que mandó el operario supera el tope: se corrige achicándolo, no es una falla del sistema.
        return 'ARCHIVO_DEMASIADO_GRANDE';
      default:
        return 'ERROR_INTERNO';
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (!(exception instanceof HttpException)) {
      // Nunca reenviar el texto de un error inesperado: puede traer detalle de
      // la base. Al log sí va entero (los SDK que rechazan con un objeto plano,
      // como Cloudinary, se serializan: String() daría "[object Object]").
      this.logger.error(describirError(exception));
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'ERROR_INTERNO' satisfies CodigoError,
        message: MENSAJE_GENERICO,
      });
    }

    const status = exception.getStatus();
    const cuerpo = exception.getResponse();
    const objeto: Record<string, unknown> =
      typeof cuerpo === 'string' || Array.isArray(cuerpo)
        ? { message: cuerpo }
        : { ...(cuerpo as object) };

    // `message` puede venir como array (varias validaciones a la vez).
    let mensaje = Array.isArray(objeto.message)
      ? (objeto.message as string[]).join('\n')
      : ((objeto.message as string) ?? exception.message);

    // Multer (y `express.json`) arman el 413 solos, en inglés y sin pasar por
    // ErrorDeNegocio: se traducen acá, el único lugar por donde pasan todas
    // las subidas. Antes se comparaba contra el string exacto de Multer
    // ('File too large'), lo que dejaba pasar en inglés el 'request entity
    // too large' de `express.json` (y cualquier cambio futuro del texto de
    // Multer); ahora se detectan los dos mensajes de fábrica conocidos y todo
    // lo demás se respeta tal cual, por si algún día hay un 413 propio ya en
    // castellano.
    if (status === HttpStatus.PAYLOAD_TOO_LARGE && MENSAJES_413_DE_FABRICA.includes(mensaje.toLowerCase())) {
      mensaje = MENSAJE_ARCHIVO_GRANDE;
    }
    // El 429 del throttler llega en inglés («ThrottlerException: Too Many Requests»).
    if (status === HttpStatus.TOO_MANY_REQUESTS && /too many requests/i.test(mensaje)) {
      mensaje = 'Hiciste muchos pedidos seguidos. Esperá un minuto y probá de nuevo.';
    }

    const { code, statusCode, error, message, ...extra } = objeto;

    // Una HttpException con status de servidor (un InternalServerErrorException
    // armado a mano, por ejemplo) es tan peligrosa como un error inesperado: su
    // texto puede venir de la base. Se lo trata igual — genérico afuera, entero
    // en el log — y sin extras, que también podrían traer detalle interno.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${status} ${mensaje}`, exception.stack);
      return res.status(status).json({
        statusCode: status,
        code: (code as CodigoError) ?? 'ERROR_INTERNO',
        message: MENSAJE_GENERICO,
      });
    }

    return res.status(status).json({
      statusCode: status,
      code: (code as CodigoError) ?? this.codigoPorStatus(status),
      message: mensaje,
      ...extra,
    });
  }
}
