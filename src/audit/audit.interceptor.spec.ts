import { of } from 'rxjs';

import { AuditInterceptor } from './audit.interceptor';
import { AuditableOptions } from './auditable.decorator';
import { AccionAuditada } from './entities/audit-log.entity';

/**
 * El interceptor se prueba por su entrada pública (`intercept`), con la request
 * que le llega de verdad: dos params, `id` (la orden) y `notaId` (el comentario).
 * Es el único lugar donde se decide a qué entidad apunta la fila del log.
 */
describe('AuditInterceptor — a qué entidad apunta el registro', () => {
  let registrar: jest.Mock;

  const correr = (opciones: AuditableOptions, params: Record<string, string>, resultado: any = {}) => {
    registrar = jest.fn().mockResolvedValue(undefined);
    const reflector = { get: () => opciones } as any;
    const interceptor = new AuditInterceptor(reflector, { registrar } as any);
    const contexto = {
      getHandler: () => () => {},
      switchToHttp: () => ({ getRequest: () => ({ params, body: {}, headers: {}, user: undefined }) }),
    } as any;
    interceptor.intercept(contexto, { handle: () => of(resultado) } as any).subscribe();
    return registrar.mock.calls[0][0];
  };

  const opciones = (extra: Partial<AuditableOptions> = {}): AuditableOptions => ({
    accion: AccionAuditada.BITACORA_EDITADA,
    entidad: 'repair_order_note',
    ...extra,
  });

  it('sin paramId usa `id`: el comportamiento de todos los endpoints que ya existían', () => {
    const fila = correr(opciones({ entidad: 'repair_order' }), { id: 'orden-1' });
    expect(fila.entidad_id).toBe('orden-1');
  });

  /**
   * `PATCH :id/bitacora/:notaId` audita la NOTA, no la orden: sin esto la fila
   * decía `entidad: 'repair_order_note'` con el uuid de la orden, o sea que
   * apuntaba a una entidad que no existe con ese id.
   */
  it('con paramId apunta al param que se le indica, no al `id` de la ruta', () => {
    const fila = correr(opciones({ paramId: 'notaId' }), { id: 'orden-1', notaId: 'nota-7' });
    expect(fila.entidad_id).toBe('nota-7');
    expect(fila.entidad).toBe('repair_order_note');
  });

  it('si el param indicado no viene, cae al id del resultado', () => {
    const fila = correr(opciones({ paramId: 'notaId' }), {}, { id: 'del-resultado' });
    expect(fila.entidad_id).toBe('del-resultado');
  });

  /**
   * El alta y la BAJA de una plantilla de mensajes quedaban con `detalle`
   * vacío: en la baja la fila ya no existe, así que el log era un uuid
   * huérfano y no se podía saber qué mensaje se borró. `nombre` y `contexto`
   * son lo que hace legible esa fila seis meses después.
   */
  it('guarda nombre y contexto del resultado: sin eso, la baja de una plantilla es un id huérfano', () => {
    const fila = correr(opciones({ entidad: 'mensaje_plantilla' }), { id: 'p1' }, {
      ok: true, nombre: 'Aviso propio', contexto: 'orden',
    });
    expect(fila.detalle).toEqual({ nombre: 'Aviso propio', contexto: 'orden' });
  });
});
