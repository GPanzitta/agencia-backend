import { totalesDeAlta, totalesDeEdicion } from './totales-gasto.util';

describe('totalesDeAlta', () => {
  it('con desglose, el total es neto + IVA + percepciones', () => {
    expect(
      totalesDeAlta({ monto: 999, neto: 100, iva: 21, percepciones: 3 }),
    ).toEqual({
      monto: 124,
      neto: 100,
      iva: 21,
      percepciones: 3,
    });
  });

  it('sin desglose, el neto es el total', () => {
    expect(totalesDeAlta({ monto: 50.5 })).toEqual({
      monto: 50.5,
      neto: 50.5,
      iva: 0,
      percepciones: 0,
    });
  });

  it('los decimales que llegan como string se suman como números', () => {
    expect(
      totalesDeAlta({ neto: '100.10' as any, iva: '21.02' as any }).monto,
    ).toBe(121.12);
  });
});

describe('totalesDeEdicion', () => {
  // Lo guardado viene de la base: los decimales llegan como string.
  const guardado = {
    monto: '121.00',
    neto: '100.00',
    iva: '21.00',
    percepciones: '0.00',
  };

  it('el caso del hallazgo: 121 editado con desglose 200/42 da 242', () => {
    expect(totalesDeEdicion(guardado, { neto: 200, iva: 42 })).toEqual({
      rama: 'desglose',
      monto: 242,
      neto: 200,
      iva: 42,
      percepciones: 0,
    });
  });

  it('el desglose manda aunque venga el monto viejo al lado', () => {
    expect(
      totalesDeEdicion(guardado, {
        monto: 121,
        neto: 200,
        iva: 42,
        percepciones: 0,
      })?.monto,
    ).toBe(242);
  });

  it('un desglose parcial se combina con lo guardado', () => {
    expect(totalesDeEdicion(guardado, { percepciones: 5 })).toEqual({
      rama: 'desglose',
      monto: 126,
      neto: 100,
      iva: 21,
      percepciones: 5,
    });
  });

  it('desglose en cero con monto: se limpia el desglose y el total es el monto', () => {
    expect(
      totalesDeEdicion(guardado, {
        monto: 150,
        neto: 0,
        iva: 0,
        percepciones: 0,
      }),
    ).toEqual({
      rama: 'desglose',
      monto: 150,
      neto: 150,
      iva: 0,
      percepciones: 0,
    });
  });

  it('«0.00» no cuenta como desglose', () => {
    const r = totalesDeEdicion(
      { monto: '80.00', neto: '80.00', iva: '0.00', percepciones: '0.00' },
      { monto: 90 },
    );
    expect(r).toEqual({
      rama: 'monto',
      monto: 90,
      neto: 90,
      iva: 0,
      percepciones: 0,
    });
  });

  it('solo monto sobre un gasto con IVA prorratea el desglose y la suma cierra', () => {
    const r = totalesDeEdicion(guardado, { monto: 60.5 })!;
    expect(r).toEqual({
      rama: 'monto',
      monto: 60.5,
      neto: 50,
      iva: 10.5,
      percepciones: 0,
    });
  });

  it('el prorrateo deja el redondeo en el neto: la suma da exacto el total', () => {
    const r = totalesDeEdicion(
      { monto: '100.00', neto: '70.00', iva: '20.00', percepciones: '10.00' },
      { monto: 33.33 },
    )!;
    expect(r.monto).toBe(33.33);
    expect(Number((r.neto + r.iva + r.percepciones).toFixed(2))).toBe(33.33);
    expect(r.iva).toBe(6.67);
    expect(r.percepciones).toBe(3.33);
  });

  it('solo monto en 0 (nota de crédito total) deja todo en 0', () => {
    expect(totalesDeEdicion(guardado, { monto: 0 })).toEqual({
      rama: 'monto',
      monto: 0,
      neto: 0,
      iva: 0,
      percepciones: 0,
    });
  });

  it('el mismo monto de siempre no toca el desglose guardado, aunque no cierre', () => {
    const inconsistente = {
      monto: '800.00',
      neto: '826.45',
      iva: '173.55',
      percepciones: '0.00',
    };
    expect(totalesDeEdicion(inconsistente, { monto: 800 })).toBeNull();
  });

  it('un desglose guardado que no cierra se prorratea contra su propia suma', () => {
    const inconsistente = {
      monto: '800.00',
      neto: '826.45',
      iva: '173.55',
      percepciones: '0.00',
    };
    const r = totalesDeEdicion(inconsistente, { monto: 500 })!;
    expect(r).toEqual({
      rama: 'monto',
      monto: 500,
      neto: 413.22,
      iva: 86.78,
      percepciones: 0,
    });
  });

  it('sin monto ni desglose no hay totales que tocar', () => {
    expect(totalesDeEdicion(guardado, {})).toBeNull();
    expect(
      totalesDeEdicion(guardado, { monto: null, neto: undefined } as any),
    ).toBeNull();
  });
});
