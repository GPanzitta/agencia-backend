import {
  FilaDeStock,
  FilaDeVenta,
  antiguedadDeStock,
  descuentoDe,
  margenBruto,
  margenDeStock,
  margenNeto,
  masParados,
  porcentaje,
  porOrigen,
  porVendedor,
  resumenDeStock,
  resumenDeVentas,
  riesgosDe,
} from './margen.util';

const stock = (parcial: Partial<FilaDeStock> = {}): FilaDeStock => ({
  id: 'u1', numero: 'U-0001', titulo: 'Toyota Corolla XEI', dominio: 'AB123CD',
  origen: 'compra', estado: 'disponible', moneda: 'USD', costo: 10000, piso: 0,
  precio: 15000, dias: 10, papeles_en_rojo: false, reservada: false,
  ...parcial,
});

const venta = (parcial: Partial<FilaDeVenta> = {}): FilaDeVenta => ({
  id: 'o1', numero: 'OP-2026-0001', vendedorId: 'v1', moneda: 'USD',
  precio: 15000, lista: 15000, costo: 10000, piso: 0, comision: 500, dias: 20, origen: 'compra',
  ...parcial,
});

describe('margen de una unidad en stock', () => {
  it('compra: precio menos costo', () => {
    expect(margenDeStock(stock())).toBe(5000);
  });

  it('consignación: además descuenta el piso del dueño', () => {
    expect(margenDeStock(stock({ origen: 'consignacion', costo: 800, piso: 12000 }))).toBe(2200);
  });

  it('sin precio no hay margen: no se puede prometer lo que no está a la venta', () => {
    expect(margenDeStock(stock({ precio: null }))).toBeNull();
  });
});

describe('resumen del stock', () => {
  it('separa pesos de dólares y no los suma entre sí', () => {
    const r = resumenDeStock([
      stock({ moneda: 'USD', costo: 10000, precio: 15000 }),
      stock({ moneda: 'ARS', costo: 9_000_000, precio: 12_000_000 }),
    ]);
    expect(r.capital).toEqual({ ARS: 9_000_000, USD: 10000 });
    expect(r.venta).toEqual({ ARS: 12_000_000, USD: 15000 });
    expect(r.margen).toEqual({ ARS: 3_000_000, USD: 5000 });
    expect(r.margen_pct).toEqual({ ARS: 25, USD: 33.3 });
  });

  it('cuenta el capital parado, el de papeles en rojo y el que no tiene precio', () => {
    const r = resumenDeStock([
      stock({ id: 'a', costo: 10000, dias: 61 }),
      stock({ id: 'b', costo: 2000, dias: 60 }),
      stock({ id: 'c', costo: 500, papeles_en_rojo: true }),
      stock({ id: 'd', costo: 3000, precio: null }),
    ]);
    expect(r.unidades).toBe(4);
    expect(r.con_precio).toBe(3);
    expect(r.parados).toEqual({ cuantos: 1, capital: { ARS: 0, USD: 10000 } });
    expect(r.papeles_en_rojo).toEqual({ cuantos: 1, capital: { ARS: 0, USD: 500 } });
    expect(r.sin_precio).toEqual({ cuantos: 1, capital: { ARS: 0, USD: 3000 } });
    expect(r.dias_promedio).toBe(35);
  });

  it('un stock vacío no rompe los promedios ni los porcentajes', () => {
    const r = resumenDeStock([]);
    expect(r.unidades).toBe(0);
    expect(r.dias_promedio).toBe(0);
    expect(r.margen_pct).toEqual({ ARS: null, USD: null });
  });
});

describe('antigüedad del stock', () => {
  it('cada auto cae en un solo tramo, con los bordes en su lugar', () => {
    const tramos = antiguedadDeStock([
      stock({ id: 'a', dias: 0, costo: 100 }),
      stock({ id: 'b', dias: 30, costo: 100 }),
      stock({ id: 'c', dias: 31, costo: 100 }),
      stock({ id: 'd', dias: 90, costo: 100 }),
      stock({ id: 'e', dias: 91, costo: 100 }),
      stock({ id: 'f', dias: 400, costo: 100 }),
    ]);
    expect(tramos.map((t) => t.cuantos)).toEqual([2, 1, 1, 2]);
    expect(tramos.map((t) => t.rotulo)).toEqual(['Hasta 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días']);
  });
});

describe('margen de una venta cerrada', () => {
  it('bruto es cobrado menos costo; neto descuenta la comisión', () => {
    const v = venta({ precio: 15000, costo: 10000, piso: 0, comision: 500 });
    expect(margenBruto(v)).toBe(5000);
    expect(margenNeto(v)).toBe(4500);
  });

  it('en consignación el piso del dueño también es costo', () => {
    expect(margenBruto(venta({ origen: 'consignacion', precio: 15000, costo: 800, piso: 12000 }))).toBe(2200);
  });

  it('el descuento es contra la lista, y vender sobre lista no es descuento negativo', () => {
    expect(descuentoDe(venta({ lista: 15000, precio: 14200 }))).toBe(800);
    expect(descuentoDe(venta({ lista: 14000, precio: 15000 }))).toBe(0);
    expect(descuentoDe(venta({ lista: null }))).toBe(0);
  });
});

describe('resumen de ventas', () => {
  it('suma por moneda y mide el descuento sobre la lista', () => {
    const r = resumenDeVentas([
      venta({ moneda: 'USD', precio: 15000, lista: 16000, costo: 10000, comision: 500 }),
      venta({ id: 'o2', moneda: 'ARS', precio: 10_000_000, lista: 10_000_000, costo: 8_000_000, comision: 300_000 }),
    ]);
    expect(r.operaciones).toBe(2);
    expect(r.facturado).toEqual({ ARS: 10_000_000, USD: 15000 });
    expect(r.margen).toEqual({ ARS: 2_000_000, USD: 5000 });
    expect(r.comisiones).toEqual({ ARS: 300_000, USD: 500 });
    expect(r.neto).toEqual({ ARS: 1_700_000, USD: 4500 });
    expect(r.descuento).toEqual({ ARS: 0, USD: 1000 });
    expect(r.descuento_pct).toEqual({ ARS: 0, USD: 6.3 });
    expect(r.margen_pct).toEqual({ ARS: 20, USD: 33.3 });
    expect(r.ticket).toEqual({ ARS: 10_000_000, USD: 15000 });
    expect(r.dias_promedio).toBe(20);
  });

  it('sin ventas no inventa un ticket', () => {
    const r = resumenDeVentas([]);
    expect(r.operaciones).toBe(0);
    expect(r.ticket).toEqual({ ARS: 0, USD: 0 });
    expect(r.margen_pct).toEqual({ ARS: null, USD: null });
  });
});

describe('ranking por vendedor y por origen', () => {
  it('agrupa por vendedor, nombra al que no tiene y ordena por operaciones', () => {
    const nombres = new Map([['v1', 'Ana'], ['v2', 'Beto']]);
    const filas = porVendedor([
      venta({ id: 'a', vendedorId: 'v1' }),
      venta({ id: 'b', vendedorId: 'v1' }),
      venta({ id: 'c', vendedorId: 'v2', lista: 16000, precio: 14000 }),
      venta({ id: 'd', vendedorId: null }),
    ], nombres);
    expect(filas.map((f) => f.nombre)).toEqual(['Ana', 'Beto', 'Sin vendedor']);
    expect(filas[0].operaciones).toBe(2);
    expect(filas[1].descuento).toEqual({ ARS: 0, USD: 2000 });
    expect(filas[1].descuento_pct).toEqual({ ARS: null, USD: 12.5 });
  });

  it('siempre devuelve los tres orígenes, aunque estén en cero', () => {
    const filas = porOrigen([venta({ origen: 'toma' })]);
    expect(filas.map((f) => f.origen)).toEqual(['compra', 'toma', 'consignacion']);
    expect(filas.find((f) => f.origen === 'toma')?.operaciones).toBe(1);
    expect(filas.find((f) => f.origen === 'compra')?.operaciones).toBe(0);
  });
});

describe('riesgos del stock', () => {
  it('vender a pérdida es lo más grave y va primero', () => {
    const r = riesgosDe([
      stock({ id: 'parado', dias: 120, costo: 10000, precio: 15000 }),
      stock({ id: 'perdida', dias: 5, costo: 10000, precio: 9000 }),
    ]);
    expect(r[0].id).toBe('perdida');
    expect(r[0].severidad).toBe(3);
    expect(r[0].motivos).toEqual(['perdida']);
  });

  it('un auto que entró esta semana no genera ruido', () => {
    const r = riesgosDe([
      stock({ id: 'nuevo', dias: 2, papeles_en_rojo: true, precio: null }),
      stock({ id: 'ok', dias: 20, precio: 15000 }),
    ]);
    expect(r).toEqual([]);
  });

  it('junta todos los motivos de la misma unidad', () => {
    const r = riesgosDe([
      stock({ id: 'todo', dias: 75, papeles_en_rojo: true, costo: 10000, precio: 10500 }),
    ]);
    expect(r[0].motivos).toEqual(['papeles', 'parado', 'margen_flaco']);
    expect(r[0].margen_pct).toBe(4.8);
    expect(r[0].severidad).toBe(2);
  });

  it('el que no tiene precio hace una semana ya es un problema', () => {
    const r = riesgosDe([stock({ id: 'sin', dias: 8, precio: null })]);
    expect(r[0].motivos).toEqual(['sin_precio']);
    expect(r[0].margen).toBeNull();
  });

  it('respeta el tope y ordena por días a igual gravedad', () => {
    const filas = [30, 90, 60].map((dias, i) => stock({ id: `p${i}`, dias, costo: 1000, precio: 1200 }));
    const r = riesgosDe(filas, 2);
    expect(r.map((x) => x.dias)).toEqual([90, 60]);
  });

  it('los más parados salen de 30 días para arriba', () => {
    const filas = [stock({ id: 'a', dias: 29 }), stock({ id: 'b', dias: 30 }), stock({ id: 'c', dias: 200 })];
    expect(masParados(filas).map((f) => f.id)).toEqual(['c', 'b']);
  });
});

describe('porcentaje', () => {
  it('un decimal y null sin base', () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(-5, 0)).toBeNull();
  });
});
