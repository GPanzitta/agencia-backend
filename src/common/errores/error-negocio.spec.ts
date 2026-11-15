import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConflictoDeNegocio, ErrorDeNegocio } from './error-negocio';

describe('ErrorDeNegocio', () => {
  it('es un BadRequestException, así que los controllers no cambian', () => {
    const e = new ErrorDeNegocio('CAJA_CERRADA', 'No hay una caja abierta.');
    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getStatus()).toBe(400);
  });

  it('expone el código y el mensaje en el cuerpo, como ya hace DESTINO_REQUERIDO', () => {
    const e = new ErrorDeNegocio('CAJA_CERRADA', 'No hay una caja abierta.');
    expect(e.getResponse()).toEqual(
      expect.objectContaining({ code: 'CAJA_CERRADA', message: 'No hay una caja abierta.' }),
    );
  });

  it('deja pasar datos extra para que el mensaje del ERP pueda armar el texto', () => {
    const e = new ErrorDeNegocio('FONDOS_INSUFICIENTES', 'Fondos insuficientes.', {
      disponible: 1500,
      solicitado: 3800,
    });
    expect(e.getResponse()).toEqual(
      expect.objectContaining({ disponible: 1500, solicitado: 3800 }),
    );
  });

  it('un extra llamado `message` no pisa el mensaje real', () => {
    const e = new ErrorDeNegocio('CAJA_CERRADA', 'No hay una caja abierta.', { message: 'x' });
    expect(e.getResponse()).toEqual(
      expect.objectContaining({ code: 'CAJA_CERRADA', message: 'No hay una caja abierta.' }),
    );
  });

  it('guarda el código en una propiedad propia para poder leerlo sin parsear', () => {
    const e = new ErrorDeNegocio('CAJA_CERRADA', 'No hay una caja abierta.');
    expect(e.codigo).toBe('CAJA_CERRADA');
  });

  it('acepta los códigos de pañol y compras (C)', () => {
    const codigos = [
      'STOCK_NO_EDITABLE',
      'MOTIVO_REQUERIDO',
      'REPUESTO_EN_USO',
      'REPUESTO_DUPLICADO',
      'OC_NO_EDITABLE',
      'OC_SIN_FALTANTE',
      'DEVOLUCION_EXCEDE_RECIBIDO',
      'EXCESO_NO_CONFIRMADO',
    ] as const;
    for (const c of codigos) {
      const e = new ErrorDeNegocio(c, 'x');
      expect(e.getResponse()).toMatchObject({ code: c });
    }
  });
});

describe('ConflictoDeNegocio', () => {
  it('es un ConflictException con status 409, la hermana 409 de ErrorDeNegocio', () => {
    const e = new ConflictoDeNegocio('CODIGO_EN_USO', 'Ese código ya lo tiene otro repuesto.');
    expect(e).toBeInstanceOf(ConflictException);
    expect(e.getStatus()).toBe(409);
  });

  it('expone el mismo payload que ErrorDeNegocio: code, message y los extra', () => {
    const e = new ConflictoDeNegocio('CODIGO_EN_USO', 'Ese código ya lo tiene "Capacitor 30 µF".', {
      codigo: 'CAP-30',
      repuesto_id: 'id-a',
      repuesto_nombre: 'Capacitor 30 µF',
      fuente: 'codigo',
    });
    expect(e.getResponse()).toEqual(
      expect.objectContaining({
        code: 'CODIGO_EN_USO',
        message: 'Ese código ya lo tiene "Capacitor 30 µF".',
        codigo: 'CAP-30',
        repuesto_id: 'id-a',
        repuesto_nombre: 'Capacitor 30 µF',
        fuente: 'codigo',
      }),
    );
  });

  it('guarda el código en una propiedad propia, igual que ErrorDeNegocio', () => {
    const e = new ConflictoDeNegocio('FUSION_INVALIDA', 'x');
    expect(e.codigo).toBe('FUSION_INVALIDA');
  });

  it('acepta los cuatro códigos nuevos de C5', () => {
    const codigos = ['CODIGO_EN_USO', 'SINONIMO_EN_USO', 'FUSION_INVALIDA', 'REPUESTO_FUSIONADO'] as const;
    for (const c of codigos) {
      const e = new ConflictoDeNegocio(c, 'x');
      expect(e.getResponse()).toMatchObject({ code: c });
    }
  });
});
