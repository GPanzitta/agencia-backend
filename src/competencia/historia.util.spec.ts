import { aplicarLectura, claveDe, novedadesDesde, precioAl } from './historia.util';
import { UnidadAjena } from './lector.util';

const aviso = (url: string, precio: number, x: Partial<UnidadAjena> = {}): UnidadAjena => ({ titulo: 'Fiat Cronos', marca: 'Fiat', anio: 2022, km: 40000, precio, moneda: 'ARS', url, detalle: '1.3 DRIVE · Manual', ...x });
const dia = (n: number) => new Date(Date.UTC(2026, 10, n, 7));

describe('la historia de los avisos de otros vendedores', () => {
  it('identifica un aviso por su dirección o, si no tiene, por sus datos', () => {
    expect(claveDe(aviso('https://otra.example/v/1?id=9', 1))).toBe('https://otra.example/v/1?id=9');
    expect(claveDe(aviso(null as never, 1))).toBe('Fiat Cronos|2022|40000|1.3 DRIVE · Manual');
  });

  it('anota el alta, cada cambio de precio y la baja', () => {
    let estado = aplicarLectura([], [aviso('a', 20_000_000), aviso('b', 18_000_000)], dia(1));
    expect(estado.map((a) => [a.clave, a.precio, a.activo, a.historia.length])).toEqual([['a', 20_000_000, true, 1], ['b', 18_000_000, true, 1]]);

    // Día 5: «a» baja de precio, «b» sigue igual.
    estado = aplicarLectura(estado, [aviso('a', 19_000_000), aviso('b', 18_000_000)], dia(5));
    const a = estado.find((x) => x.clave === 'a')!;
    expect([a.precio, a.precio_anterior, a.cambio_at, a.historia.map((p) => p.precio)]).toEqual([19_000_000, 20_000_000, dia(5), [20_000_000, 19_000_000]]);
    expect(estado.find((x) => x.clave === 'b')!.cambio_at).toBeNull();

    // Día 12: «b» ya no está.
    estado = aplicarLectura(estado, [aviso('a', 19_000_000)], dia(12));
    const b = estado.find((x) => x.clave === 'b')!;
    expect([b.activo, b.desaparecio_at, b.primera_vez_at]).toEqual([false, dia(12), dia(1)]);

    // Día 14: «b» vuelve a aparecer.
    estado = aplicarLectura(estado, [aviso('a', 19_000_000), aviso('b', 18_000_000)], dia(14));
    expect(estado.find((x) => x.clave === 'b')).toEqual(expect.objectContaining({ activo: true, desaparecio_at: null, primera_vez_at: dia(1) }));
  });

  it('una lectura vacía es una falla, no un vendedor que vendió todo', () => {
    const estado = aplicarLectura([], [aviso('a', 1_600_000)], dia(1));
    expect(aplicarLectura(estado, [], dia(2))).toBe(estado);
  });

  it('cuenta lo que cambió desde una fecha, lo más reciente primero', () => {
    let estado = aplicarLectura([], [aviso('a', 20_000_000), aviso('b', 18_000_000), aviso('c', 15_000_000)], dia(1));
    estado = aplicarLectura(estado, [aviso('a', 19_000_000), aviso('c', 15_500_000), aviso('d', 30_000_000)], dia(8));
    const n = novedadesDesde(estado, dia(3));
    expect(n.map((x) => [x.tipo, x.precio, x.variacion_pct, x.dias_publicado]).sort()).toEqual([
      ['bajo', 19_000_000, -5, null], ['nuevo', 30_000_000, null, null], ['salio', 18_000_000, null, 7], ['subio', 15_500_000, 3.3, null],
    ]);
    expect(novedadesDesde(estado, dia(9))).toEqual([]);
  });

  it('sabe qué precio tenía publicado en una fecha', () => {
    let estado = aplicarLectura([], [aviso('a', 20_000_000)], dia(1));
    estado = aplicarLectura(estado, [aviso('a', 19_000_000)], dia(5));
    estado = aplicarLectura(estado, [aviso('z', 1_600_000)], dia(9));
    const a = estado.find((x) => x.clave === 'a')!;
    expect([precioAl(a, dia(0)), precioAl(a, dia(3)), precioAl(a, dia(6)), precioAl(a, dia(10))]).toEqual([null, 20_000_000, 19_000_000, null]);
  });
});
