import { TenantThrottlerGuard, visitanteDelPortal } from './tenant-throttler.guard';

const req = (h: Record<string, string>) => ({ headers: h }) as any;

describe('visitanteDelPortal — la IP del visitante que manda el portal', () => {
  const antes = process.env.PORTAL_CLAVE;
  afterEach(() => {
    process.env.PORTAL_CLAVE = antes;
  });

  it('con la clave correcta cuenta por la IP del visitante', () => {
    process.env.PORTAL_CLAVE = 'secreta';
    expect(visitanteDelPortal(req({ 'x-portal-clave': 'secreta', 'x-visitante-ip': ' 200.1.2.3 ' }))).toBe('visitante:200.1.2.3');
  });

  it('con otra clave, o sin la variable, no le cree (cuenta la IP de la conexión)', () => {
    process.env.PORTAL_CLAVE = 'secreta';
    expect(visitanteDelPortal(req({ 'x-portal-clave': 'otra', 'x-visitante-ip': '1.1.1.1' }))).toBeNull();
    expect(visitanteDelPortal(req({ 'x-visitante-ip': '1.1.1.1' }))).toBeNull();
    delete process.env.PORTAL_CLAVE;
    expect(visitanteDelPortal(req({ 'x-portal-clave': 'secreta', 'x-visitante-ip': '1.1.1.1' }))).toBeNull();
  });
});

describe('TenantThrottlerGuard.getTracker — IPv6 por /64 (SEG-04)', () => {
  const guard = Object.create(TenantThrottlerGuard.prototype) as { getTracker(r: unknown): Promise<string> };

  it('dos direcciones del mismo /64 comparten el balde', async () => {
    const a = await guard.getTracker({ headers: {}, url: '/api/portal/buscar', ip: '2800:810:4a2:1234::1' });
    const b = await guard.getTracker({ headers: {}, url: '/api/portal/buscar', ip: '2800:810:4a2:1234:ffff::2' });
    expect(a).toBe(b);
  });

  it('en el login también agrupa la IP', async () => {
    const t = await guard.getTracker({ headers: {}, url: '/api/auth/login', ip: '2800:810:4a2:1234::7', body: { email: ' A@B.com ' } });
    expect(t).toBe('login:a@b.com:2800:810:4a2:1234::/64');
  });
});
