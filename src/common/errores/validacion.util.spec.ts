import { ValidationError } from 'class-validator';

import { ErrorDeNegocio } from './error-negocio';
import { traducirValidacion } from './validacion.util';

/** Arma el objeto que class-validator le pasa al exceptionFactory. */
function err(property: string, constraints: Record<string, string>): ValidationError {
  return { property, constraints, children: [] } as ValidationError;
}

describe('traducirValidacion', () => {
  it('devuelve un ErrorDeNegocio con código DATOS_INVALIDOS', () => {
    const e = traducirValidacion([err('monto', { isPositive: 'monto must be a positive number' })]);
    expect(e).toBeInstanceOf(ErrorDeNegocio);
    expect(e.codigo).toBe('DATOS_INVALIDOS');
  });

  it('traduce el nombre del campo al que ve el usuario', () => {
    const e = traducirValidacion([err('monto', { isPositive: 'x' })]);
    expect((e.getResponse() as any).message).toContain('Importe');
  });

  it('usa el nombre crudo si el campo no está en el diccionario', () => {
    const e = traducirValidacion([err('campo_raro', { isPositive: 'x' })]);
    expect((e.getResponse() as any).message).toContain('campo_raro');
  });

  it('traduce isPositive a castellano', () => {
    const e = traducirValidacion([err('monto', { isPositive: 'x' })]);
    expect((e.getResponse() as any).message).toBe('Importe: tiene que ser un número mayor a cero.');
  });

  it('traduce isNotEmpty', () => {
    const e = traducirValidacion([err('nombre', { isNotEmpty: 'x' })]);
    expect((e.getResponse() as any).message).toBe('Nombre: es obligatorio.');
  });

  it('traduce whitelistValidation, que es el campo inventado', () => {
    const e = traducirValidacion([err('mesa', { whitelistValidation: 'x' })]);
    expect((e.getResponse() as any).message).toBe(
      'mesa: este dato no corresponde a esta pantalla.',
    );
  });

  it('junta varios campos en renglones separados', () => {
    const e = traducirValidacion([
      err('nombre', { isNotEmpty: 'x' }),
      err('monto', { isPositive: 'x' }),
    ]);
    expect((e.getResponse() as any).message).toBe(
      'Nombre: es obligatorio.\nImporte: tiene que ser un número mayor a cero.',
    );
  });

  it('entra en los hijos de un DTO anidado y nombra el campo con su padre', () => {
    const padre = err('pago', {});
    padre.constraints = undefined;
    padre.children = [err('wallet_id', { isUuid: 'x' })];
    const e = traducirValidacion([padre]);
    expect((e.getResponse() as any).message).toContain('Billetera');
  });

  it('traduce arrayMaxSize (el tope de la vidriera, entre otros)', () => {
    const e = traducirValidacion([err('ids', { arrayMaxSize: 'x' })]);
    expect((e.getResponse() as any).message).toBe('ids: tiene más elementos de los permitidos.');
    expect((e.getResponse() as any).campos).toEqual(['ids']);
  });

  it('cae en un texto genérico cuando la restricción no está mapeada', () => {
    const e = traducirValidacion([err('nombre', { restriccionRara: 'x' })]);
    expect((e.getResponse() as any).message).toBe('Nombre: el dato cargado no es válido.');
  });

  it('devuelve un mensaje usable aunque no llegue ningún error', () => {
    const e = traducirValidacion([]);
    expect((e.getResponse() as any).message).toBe('Revisá los datos cargados.');
  });
});
