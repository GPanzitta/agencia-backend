import { conDia, fechaLocal, primeraFecha, primeraNoAnteriorA, siguienteFecha } from './recurrencia-fechas.util';
import { Frecuencia } from './entities/recurring-expense.entity';

const d = (s: string) => new Date(s + 'T12:00:00');

describe('recurrencia-fechas', () => {
  describe('conDia', () => {
    it('fija el día pedido dentro del mes', () => {
      expect(conDia(d('2026-08-05'), 27).getDate()).toBe(27);
    });

    it('recorta al último día cuando el mes es más corto', () => {
      // Vencimiento el 31 sobre febrero: 28, no 3 de marzo.
      expect(conDia(d('2026-02-10'), 31).getDate()).toBe(28);
      expect(conDia(d('2026-02-10'), 31).getMonth()).toBe(1);
    });

    it('respeta el 29 en año bisiesto', () => {
      expect(conDia(d('2028-02-10'), 31).getDate()).toBe(29);
    });
  });

  describe('primeraFecha', () => {
    it('cae en el mismo mes si el día no pasó todavía', () => {
      const f = primeraFecha(d('2026-08-05'), 27);
      expect([f.getDate(), f.getMonth()]).toEqual([27, 7]);
    });

    it('salta al mes siguiente si el día ya pasó', () => {
      const f = primeraFecha(d('2026-08-28'), 27);
      expect([f.getDate(), f.getMonth()]).toEqual([27, 8]);
    });
  });

  describe('siguienteFecha', () => {
    it('mensual avanza un mes manteniendo el día elegido', () => {
      const f = siguienteFecha(d('2026-08-27'), Frecuencia.MENSUAL, 27);
      expect([f.getDate(), f.getMonth()]).toEqual([27, 8]);
    });

    it('mensual desde el 31 de enero cae al 28 de febrero, no al 3 de marzo', () => {
      const f = siguienteFecha(d('2026-01-31'), Frecuencia.MENSUAL, 31);
      expect([f.getDate(), f.getMonth()]).toEqual([28, 1]);
    });

    it('semanal suma 7 días exactos', () => {
      const f = siguienteFecha(d('2026-08-27'), Frecuencia.SEMANAL, 27);
      expect(f.getDate()).toBe(3);
      expect(f.getMonth()).toBe(8);
    });

    it('quincenal suma 15 días', () => {
      const f = siguienteFecha(d('2026-08-01'), Frecuencia.QUINCENAL, 1);
      expect(f.getDate()).toBe(16);
    });

    it('anual mantiene mes y día', () => {
      const f = siguienteFecha(d('2026-03-10'), Frecuencia.ANUAL, 10);
      expect([f.getFullYear(), f.getMonth(), f.getDate()]).toEqual([2027, 2, 10]);
    });
  });
});

describe('fechaLocal', () => {
  it("parsea el string 'YYYY-MM-DD' de una columna date como fecha LOCAL", () => {
    // El bug real: new Date('2026-09-14') parsea UTC medianoche, que en
    // Argentina (UTC-3) es el 13 a las 21hs — y el gasto se generaba con
    // vencimiento un día antes del configurado.
    const f = fechaLocal('2026-09-14');
    expect(f.getFullYear()).toBe(2026);
    expect(f.getMonth()).toBe(8);
    expect(f.getDate()).toBe(14);
  });

  it('ancla a mediodía local para que ningún huso lo corra de día', () => {
    expect(fechaLocal('2026-09-14').getHours()).toBe(12);
  });

  it('un Date date-only (UTC medianoche) conserva su día calendario', () => {
    const utcMidnight = new Date('2026-09-14');
    const f = fechaLocal(utcMidnight);
    expect(f.getDate()).toBe(14);
    expect(f.getMonth()).toBe(8);
  });
});


describe('primeraNoAnteriorA (#42: retomar desde hoy)', () => {
  const ymd = (f: Date) => [f.getFullYear(), f.getMonth() + 1, f.getDate()];

  it('mensual: saltea lo vencido y cae en el primer vencimiento desde hoy', () => {
    const f = primeraNoAnteriorA(d('2026-03-10'), d('2026-09-29'), Frecuencia.MENSUAL, 10);
    expect(ymd(f)).toEqual([2026, 10, 10]);
  });

  it('si el vencimiento es hoy, es hoy', () => {
    const f = primeraNoAnteriorA(d('2026-03-10'), d('2026-09-10'), Frecuencia.MENSUAL, 10);
    expect(ymd(f)).toEqual([2026, 9, 10]);
  });

  it('si la próxima no está vencida, no se mueve', () => {
    const f = primeraNoAnteriorA(d('2026-12-10'), d('2026-09-29'), Frecuencia.MENSUAL, 10);
    expect(ymd(f)).toEqual([2026, 12, 10]);
  });

  it('anual: el mismo día del año siguiente', () => {
    const f = primeraNoAnteriorA(d('2025-03-15'), d('2026-09-29'), Frecuencia.ANUAL, 15);
    expect(ymd(f)).toEqual([2027, 3, 15]);
  });

  it('día 31 sobre febrero: el 28, y en marzo vuelve al 31', () => {
    expect(ymd(primeraNoAnteriorA(d('2026-01-31'), d('2026-02-15'), Frecuencia.MENSUAL, 31))).toEqual([2026, 2, 28]);
    expect(ymd(primeraNoAnteriorA(d('2026-01-31'), d('2026-03-01'), Frecuencia.MENSUAL, 31))).toEqual([2026, 3, 31]);
  });

  it('semanal con años de atraso no se corta por el tope', () => {
    const f = primeraNoAnteriorA(d('2020-01-06'), d('2026-09-29'), Frecuencia.SEMANAL, 1);
    expect(f >= d('2026-09-29')).toBe(true);
    expect((f.getTime() - d('2026-09-29').getTime()) / 86_400_000).toBeLessThan(7);
  });
});
