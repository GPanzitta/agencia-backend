import { SaludBaseService } from './salud-base.service';

function armar(query: jest.Mock, ultimaActividad: number | null = null) {
  const actividad: any = { ultimaActividad };
  return new SaludBaseService({ query } as any, actividad);
}

describe('SaludBaseService', () => {
  afterEach(() => jest.useRealTimers());

  it('con la base despierta, una base que no contesta corta a los 3 s con BASE_SIN_RESPUESTA', async () => {
    jest.useFakeTimers();
    const s = armar(jest.fn(() => new Promise(() => undefined)), Date.now());
    const promesa = s.estado();
    await jest.advanceTimersByTimeAsync(3000);
    await expect(promesa).resolves.toMatchObject({ ok: false, code: 'BASE_SIN_RESPUESTA', message: 'La base de datos no respondió en 3 segundos' });
  });

  it('con la base dormida, el arranque en frío de Neon (5 s) no es una caída', async () => {
    jest.useFakeTimers();
    const s = armar(jest.fn(() => new Promise((r) => setTimeout(() => r([{ '?column?': 1 }]), 5000))));
    const promesa = s.estado();
    await jest.advanceTimersByTimeAsync(5000);
    await expect(promesa).resolves.toMatchObject({ ok: true });
  });

  it('con la base dormida, si no contesta en 10 s sí es BASE_SIN_RESPUESTA', async () => {
    jest.useFakeTimers();
    const s = armar(jest.fn(() => new Promise(() => undefined)));
    const promesa = s.estado();
    await jest.advanceTimersByTimeAsync(10000);
    await expect(promesa).resolves.toMatchObject({ ok: false, code: 'BASE_SIN_RESPUESTA' });
  });

  it('Neon sin cuota → BASE_SIN_CUOTA con su mensaje', async () => {
    const s = armar(jest.fn(async () => { throw Object.assign(new Error('exceeded the quota'), { code: '53000' }); }));
    await expect(s.estado()).resolves.toMatchObject({ ok: false, code: 'BASE_SIN_CUOTA', message: 'La base de datos se quedó sin cuota de cómputo' });
  });

  it('con la base dormida, dos chequeos seguidos consultan una sola vez', async () => {
    const query = jest.fn(async () => [{ '?column?': 1 }]);
    const s = armar(query);
    await expect(s.estado()).resolves.toMatchObject({ ok: true });
    await expect(s.estado()).resolves.toMatchObject({ ok: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('dos chequeos al mismo tiempo comparten la misma consulta', async () => {
    const query = jest.fn(async () => [{ '?column?': 1 }]);
    const s = armar(query);
    await Promise.all([s.estado(), s.estado()]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('con la base despierta por uso, consulta cada vez', async () => {
    const query = jest.fn(async () => [{ '?column?': 1 }]);
    const s = armar(query, Date.now());
    await s.estado();
    await s.estado();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
