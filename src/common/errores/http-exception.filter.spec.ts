import { ThrottlerException } from '@nestjs/throttler';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';

import { ErrorDeNegocio } from './error-negocio';
import { FiltroDeErrores } from './http-exception.filter';

/** Simula el ArgumentsHost de Nest y captura lo que el filtro responde. */
function hostFalso() {
  const capturado: { status?: number; body?: any } = {};
  const res = {
    status(code: number) {
      capturado.status = code;
      return this;
    },
    json(body: any) {
      capturado.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/api/x' }) }),
  } as any;
  return { host, capturado };
}

describe('FiltroDeErrores', () => {
  let filtro: FiltroDeErrores;

  beforeEach(() => {
    filtro = new FiltroDeErrores();
  });

  it('respeta el código que ya trae un ErrorDeNegocio', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new ErrorDeNegocio('CAJA_CERRADA', 'No hay una caja abierta.'), host);
    expect(capturado.status).toBe(400);
    expect(capturado.body).toEqual(
      expect.objectContaining({ code: 'CAJA_CERRADA', message: 'No hay una caja abierta.' }),
    );
  });

  it('conserva los datos extra del ErrorDeNegocio', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(
      new ErrorDeNegocio('FONDOS_INSUFICIENTES', 'Fondos insuficientes.', { disponible: 1500 }),
      host,
    );
    expect(capturado.body).toEqual(expect.objectContaining({ disponible: 1500 }));
  });

  it('respeta el code de una excepción que lo trae a mano, como DESTINO_REQUERIDO', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(
      new BadRequestException({ message: 'Indicá el destino.', code: 'DESTINO_REQUERIDO' }),
      host,
    );
    expect(capturado.body.code).toBe('DESTINO_REQUERIDO');
  });

  it('le pone NO_ENCONTRADO a un 404 sin código', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new NotFoundException('Orden inexistente'), host);
    expect(capturado.status).toBe(404);
    expect(capturado.body).toEqual(
      expect.objectContaining({ code: 'NO_ENCONTRADO', message: 'Orden inexistente' }),
    );
  });

  it('el 429 del throttler sale como DEMASIADOS_INTENTOS y en castellano (POR-04)', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new ThrottlerException(), host);
    expect(capturado.status).toBe(429);
    expect(capturado.body).toEqual(expect.objectContaining({ code: 'DEMASIADOS_INTENTOS', message: expect.stringContaining('Esperá un minuto') }));
  });

  it('le pone SIN_PERMISO a un 403 sin código', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new ForbiddenException('No podés'), host);
    expect(capturado.body.code).toBe('SIN_PERMISO');
  });

  it('le pone SESION_VENCIDA a un 401 sin código, no SIN_PERMISO', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new UnauthorizedException('Token revoked, please log in again'), host);
    expect(capturado.status).toBe(401);
    expect(capturado.body.code).toBe('SESION_VENCIDA');
  });

  it('respeta el CREDENCIALES_INVALIDAS del login sin tocarle el 401', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(
      new UnauthorizedException({
        code: 'CREDENCIALES_INVALIDAS',
        message: 'Usuario o contraseña incorrectos.',
      }),
      host,
    );
    expect(capturado.status).toBe(401);
    expect(capturado.body).toEqual(
      expect.objectContaining({
        code: 'CREDENCIALES_INVALIDAS',
        message: 'Usuario o contraseña incorrectos.',
      }),
    );
  });

  it('tampoco filtra el detalle de una HttpException con status 500', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new InternalServerErrorException('column "foo" does not exist'), host);
    expect(capturado.status).toBe(500);
    expect(capturado.body.code).toBe('ERROR_INTERNO');
    expect(JSON.stringify(capturado.body)).not.toContain('column');
    expect(capturado.body.message).toBe(
      'No se pudo completar la operación. Probá de nuevo o avisale al encargado.',
    );
  });

  it('un 5xx tampoco deja salir los datos extra del cuerpo', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(
      new InternalServerErrorException({
        message: 'relation "users" does not exist',
        query: 'SELECT * FROM users',
      }),
      host,
    );
    expect(capturado.body).toEqual({
      statusCode: 500,
      code: 'ERROR_INTERNO',
      message: 'No se pudo completar la operación. Probá de nuevo o avisale al encargado.',
    });
  });

  it('le pone CONFLICTO a un 409 sin código', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new ConflictException('Ese horario está completo'), host);
    expect(capturado.body.code).toBe('CONFLICTO');
  });

  it('convierte un array de mensajes en renglones separados', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new BadRequestException(['uno', 'dos']), host);
    expect(capturado.body.message).toBe('uno\ndos');
  });

  it('loguea entero un error que llega como objeto plano (el SDK de Cloudinary rechaza así)', () => {
    const { host } = hostFalso();
    const log = jest.spyOn((filtro as any).logger, 'error').mockImplementation(() => undefined);
    filtro.catch({ message: 'Invalid api_key', name: 'Error', http_code: 401 }, host);
    expect(log.mock.calls[0][0]).toContain('Invalid api_key');
    expect(log.mock.calls[0][0]).toContain('401');
  });

  it('nunca filtra el detalle de un error inesperado', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new Error('column "foo" does not exist'), host);
    expect(capturado.status).toBe(500);
    expect(capturado.body.code).toBe('ERROR_INTERNO');
    expect(capturado.body.message).not.toContain('column');
  });

  it('le pone SOLICITUD_RECHAZADA a un 400 sin código y reenvía el mensaje', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new BadRequestException('El gasto está anulado'), host);
    expect(capturado.status).toBe(400);
    expect(capturado.body).toEqual(
      expect.objectContaining({
        code: 'SOLICITUD_RECHAZADA',
        message: 'El gasto está anulado',
      }),
    );
  });

  it('conserva el 409 y el code de un ConflictException que lo trae a mano, como CUPO_COMPLETO', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(
      new ConflictException({
        message: 'Ese horario está completo (6 de 6).',
        code: 'CUPO_COMPLETO',
        ocupados: 6,
        cupo: 6,
      }),
      host,
    );
    expect(capturado.status).toBe(409);
    expect(capturado.body).toEqual(
      expect.objectContaining({ code: 'CUPO_COMPLETO', ocupados: 6, cupo: 6 }),
    );
  });

  it('distingue entre 400 (rechazo, reenvía) y 500 (error, no reenvía)', () => {
    const { host: host400, capturado: capturado400 } = hostFalso();
    filtro.catch(new BadRequestException('La orden ya está cancelada'), host400);

    const { host: host500, capturado: capturado500 } = hostFalso();
    filtro.catch(new Error('database connection failed'), host500);

    // El 400: código genérico pero el operario lee el mensaje
    expect(capturado400.status).toBe(400);
    expect(capturado400.body.code).toBe('SOLICITUD_RECHAZADA');
    expect(capturado400.body.message).toBe('La orden ya está cancelada');

    // El 500: no reenvía nada que pueda exponer la base
    expect(capturado500.status).toBe(500);
    expect(capturado500.body.code).toBe('ERROR_INTERNO');
    expect(capturado500.body.message).not.toContain('database');
    expect(capturado500.body.message).toBe(
      'No se pudo completar la operación. Probá de nuevo o avisale al encargado.',
    );
  });

  it('el 413 de multer (LIMIT_FILE_SIZE) se traduce con código propio', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new PayloadTooLargeException('File too large'), host);
    expect(capturado.status).toBe(413);
    expect(capturado.body).toEqual(
      expect.objectContaining({ code: 'ARCHIVO_DEMASIADO_GRANDE', message: 'El archivo es demasiado grande.' }),
    );
  });

  it('el 413 de express.json ("request entity too large") también se traduce (Minor 1)', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new PayloadTooLargeException('request entity too large'), host);
    expect(capturado.status).toBe(413);
    expect(capturado.body).toEqual(
      expect.objectContaining({ code: 'ARCHIVO_DEMASIADO_GRANDE', message: 'El archivo es demasiado grande.' }),
    );
  });

  it('un 413 con mensaje propio en castellano se respeta tal cual (Minor 1)', () => {
    const { host, capturado } = hostFalso();
    filtro.catch(new PayloadTooLargeException('El video no puede superar los 25 MB.'), host);
    expect(capturado.status).toBe(413);
    expect(capturado.body).toEqual(
      expect.objectContaining({
        code: 'ARCHIVO_DEMASIADO_GRANDE',
        message: 'El video no puede superar los 25 MB.',
      }),
    );
  });
});
