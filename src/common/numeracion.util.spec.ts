import { SelectQueryBuilder } from 'typeorm';
import {
  numeroDeCorrelativo,
  ordenarPorCorrelativo,
  siguienteCorrelativo,
} from './numeracion.util';

const VTA = 'OR-2026-';

describe('numeroDeCorrelativo', () => {
  it('extrae el sufijo numérico', () => {
    expect(numeroDeCorrelativo('OR-2026-0007', VTA)).toBe(7);
    expect(numeroDeCorrelativo('OR-2026-10000', VTA)).toBe(10000);
  });

  it('devuelve 0 ante un valor que no termina en número', () => {
    expect(numeroDeCorrelativo('OR-2026-', VTA)).toBe(0);
    expect(numeroDeCorrelativo('OR-2026-ABC', VTA)).toBe(0);
  });
});

describe('siguienteCorrelativo', () => {
  it('arranca en 1 cuando no hay ninguno', () => {
    expect(siguienteCorrelativo(VTA, null)).toBe('OR-2026-0001');
    expect(siguienteCorrelativo(VTA, undefined)).toBe('OR-2026-0001');
  });

  it('incrementa respetando el relleno', () => {
    expect(siguienteCorrelativo(VTA, 'OR-2026-0001')).toBe('OR-2026-0002');
    expect(siguienteCorrelativo(VTA, 'OR-2026-0099')).toBe('OR-2026-0100');
  });

  // El bug que motivó el util: pasado el relleno el número crece de largo,
  // no se trunca ni vuelve a empezar.
  it('cruza el límite del relleno sin truncar', () => {
    expect(siguienteCorrelativo(VTA, 'OR-2026-9999')).toBe('OR-2026-10000');
    expect(siguienteCorrelativo(VTA, 'OR-2026-10000')).toBe('OR-2026-10001');
  });

  it('admite otros anchos', () => {
    expect(siguienteCorrelativo('T-2026-08-30-', null, 3)).toBe('T-2026-08-30-001');
    expect(siguienteCorrelativo('T-2026-08-30-', 'T-2026-08-30-009', 3)).toBe(
      'T-2026-08-30-010',
    );
  });
});

describe('ordenarPorCorrelativo', () => {
  it('ordena por longitud antes que alfabéticamente', () => {
    const qb = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
    } as unknown as SelectQueryBuilder<object>;

    ordenarPorCorrelativo(qb, 'orden.numero_orden');

    expect(qb.orderBy).toHaveBeenCalledWith('LENGTH(orden.numero_orden)', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('orden.numero_orden', 'DESC');
  });

  /**
   * La demostración de por qué hace falta: ordenar como texto pone el 9999
   * arriba del 10000, que es exactamente lo que rompía el alta de ventas.
   */
  it('el criterio que reemplaza elegiría mal el último', () => {
    const numeros = ['OR-2026-9999', 'OR-2026-10000', 'OR-2026-0001'];

    const alfabetico = [...numeros].sort().reverse();
    expect(alfabetico[0]).toBe('OR-2026-9999'); // el bug

    const porLongitudYLuegoTexto = [...numeros].sort((a, b) =>
      b.length - a.length || b.localeCompare(a),
    );
    expect(porLongitudYLuegoTexto[0]).toBe('OR-2026-10000'); // el arreglo
  });
});
