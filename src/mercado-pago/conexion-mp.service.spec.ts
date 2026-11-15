import { ConexionMpService, conexionDeMp } from './conexion-mp.service';

const DIA = 24 * 3600 * 1000;

function armar(porVencer: any[] = []) {
  const qb: any = { addSelect: () => qb, where: () => qb, andWhere: () => qb, getMany: jest.fn(async () => porVencer) };
  const repo: any = { update: jest.fn(async () => ({ affected: 1 })), createQueryBuilder: jest.fn(() => qb) };
  const tokens = { access_token: 'APP_USR-nuevo', refresh_token: 'TG-nuevo', user_id: 123, expires_in: 15552000 };
  const client: any = {
    urlAutorizacion: jest.fn((state: string, redirect: string) => `https://auth/?state=${state}&redirect_uri=${redirect}`),
    canjearCodigoOAuth: jest.fn(async () => tokens),
    renovarTokenOAuth: jest.fn(async () => tokens),
    usuarioOAuth: jest.fn(async () => ({ id: 123, nickname: 'NANDU.TALLER', email: 'nandu@mail.com' })),
  };
  return { service: new ConexionMpService(repo, client), repo, client };
}

/** Saca el `state` firmado de la URL que armó el servicio, como lo devuelve Mercado Pago al callback. */
const stateDe = (url: string) => /state=([^&]+)/.exec(url)![1];
const pendienteDe = (url: string) => /[?&]mp=([^&]+)/.exec(url)![1];

describe('ConexionMpService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, { MP_CLIENT_ID: 'app-1', MP_CLIENT_SECRET: 'secreto', API_PUBLIC_URL: 'https://api.test/api', ERP_URL: 'https://erp.test' });
  });
  afterEach(() => { process.env = { ...env }; });

  it('sin la app de la plataforma configurada, conectar da MP_NO_DISPONIBLE', () => {
    delete process.env.MP_CLIENT_SECRET;
    const { service } = armar();
    expect(() => service.urlParaConectar('e1', 'u1')).toThrow(expect.objectContaining({ codigo: 'MP_NO_DISPONIBLE' }));
  });

  it('la autorización vuelve al callback público de la API', () => {
    const { service, client } = armar();
    service.urlParaConectar('e1', 'u1');
    expect(client.urlAutorizacion).toHaveBeenCalledWith(expect.any(String), 'https://api.test/api/mp/oauth/callback');
  });

  it('un state inventado no canjea nada', async () => {
    const { service, client } = armar();
    await expect(service.callback('code', 'inventado')).rejects.toMatchObject({ codigo: 'MP_OAUTH_INVALIDO' });
    expect(client.canjearCodigoOAuth).not.toHaveBeenCalled();
  });

  it('el mismo state no sirve dos veces', async () => {
    const { service } = armar();
    const state = stateDe(service.urlParaConectar('e1', 'u1'));
    await service.callback('code', state);
    await expect(service.callback('code', state)).rejects.toMatchObject({ codigo: 'MP_OAUTH_INVALIDO' });
  });

  it('el callback NO conecta nada: vuelve al ERP con un pendiente a confirmar', async () => {
    const { service, repo } = armar();
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    expect(url).toMatch(/^https:\/\/erp\.test\/home\/configuracion\/empresa\?mp=/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each([
    ['otra empresa', { id: 'u1', companyId: 'e2' }],
    ['otro usuario', { id: 'u2', companyId: 'e1' }],
  ])('confirmar desde %s se rechaza y la empresa queda como estaba', async (_q, user) => {
    const { service, repo } = armar();
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    await expect(service.confirmar(pendienteDe(url), user)).rejects.toMatchObject({ codigo: 'MP_OAUTH_INVALIDO' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('confirmar desde la sesión que inició guarda tokens, cuenta y vencimiento', async () => {
    const { service, repo } = armar();
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    await service.confirmar(pendienteDe(url), { id: 'u1', companyId: 'e1' });
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1' }, expect.objectContaining({
      mp_access_token: 'APP_USR-nuevo', mp_refresh_token: 'TG-nuevo', mp_user_id: '123', mp_token_vence: expect.any(Date), mp_conectado_en: expect.any(Date),
    }));
    const { mp_token_vence } = repo.update.mock.calls[0][1];
    expect(Math.round((mp_token_vence.getTime() - Date.now()) / DIA)).toBe(180);
  });

  it('vuelve al ERP diciendo qué cuenta volvió, y al confirmar la guarda', async () => {
    const { service, repo } = armar();
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    expect(url).toContain('cuenta=NANDU.TALLER');
    await service.confirmar(pendienteDe(url), { id: 'u1', companyId: 'e1' });
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1' }, expect.objectContaining({ mp_cuenta: 'NANDU.TALLER' }));
  });

  it('si no se puede leer la cuenta, la conexión sigue: muestra el mail o nada', async () => {
    const { service, client } = armar();
    client.usuarioOAuth.mockRejectedValueOnce(new Error('MP caído'));
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    expect(url).toMatch(/[?&]mp=/);
    expect(url).toContain('cuenta=');
  });

  it('un pendiente sirve una sola vez', async () => {
    const { service } = armar();
    const url = await service.callback('code', stateDe(service.urlParaConectar('e1', 'u1')));
    await service.confirmar(pendienteDe(url), { id: 'u1', companyId: 'e1' });
    await expect(service.confirmar(pendienteDe(url), { id: 'u1', companyId: 'e1' })).rejects.toMatchObject({ codigo: 'MP_OAUTH_INVALIDO' });
  });

  it('desconectar deja la empresa sin Mercado Pago', async () => {
    const { service, repo } = armar();
    await service.desconectar('e1');
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1' }, { mp_access_token: null, mp_refresh_token: null, mp_user_id: null, mp_cuenta: null, mp_token_vence: null, mp_conectado_en: null });
  });

  it('la tarea diaria renueva lo que está por vencer y guarda los tokens nuevos', async () => {
    const { service, repo, client } = armar([{ id: 'e1', mp_refresh_token: 'TG-viejo' }]);
    await service.renovarPorVencer();
    expect(client.renovarTokenOAuth).toHaveBeenCalledWith('TG-viejo');
    // Condicionado al refresh token leído: si el admin reconectó mientras tanto, no se pisa.
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1', mp_refresh_token: 'TG-viejo' }, expect.objectContaining({ mp_access_token: 'APP_USR-nuevo', mp_refresh_token: 'TG-nuevo' }));
  });

  it('si Mercado Pago falla al renovar, el token actual sigue y las demás empresas se renuevan igual', async () => {
    const { service, repo, client } = armar([{ id: 'e1', mp_refresh_token: 'TG-1' }, { id: 'e2', mp_refresh_token: 'TG-2' }]);
    client.renovarTokenOAuth.mockRejectedValueOnce(new Error('MP caído'));
    await expect(service.renovarPorVencer()).resolves.toBeUndefined();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith({ id: 'e2', mp_refresh_token: 'TG-2' }, expect.anything());
  });
});

describe('ConexionMpService — la conexión que no se pudo renovar', () => {
  const venc = (dias: number) => new Date(Date.now() + dias * DIA);

  it('si ya venció y no se renueva, la empresa queda sin token: los cobros pasan a «sin pago online»', async () => {
    const vencio = venc(-1);
    const { service, repo, client } = armar([{ id: 'e1', mp_refresh_token: 'TG-1', mp_token_vence: vencio }]);
    client.renovarTokenOAuth.mockRejectedValueOnce(new Error('rechazado'));
    await service.renovarPorVencer();
    // Condicionado al vencimiento leído: una reconexión recién hecha no se borra.
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1', mp_token_vence: vencio }, { mp_access_token: null });
  });

  it('sin refresh token (la app sin offline_access) y vencida, también', async () => {
    const vencio = venc(-1);
    const { service, repo, client } = armar([{ id: 'e1', mp_refresh_token: null, mp_token_vence: vencio }]);
    await service.renovarPorVencer();
    expect(client.renovarTokenOAuth).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith({ id: 'e1', mp_token_vence: vencio }, { mp_access_token: null });
  });

  it('por vencer y sin refresh token: no se toca, todavía cobra', async () => {
    const { service, repo } = armar([{ id: 'e1', mp_refresh_token: null, mp_token_vence: venc(10) }]);
    await service.renovarPorVencer();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('conexionDeMp', () => {
  it('una cuenta OAuth que se quedó sin token está vencida', () => {
    expect(conexionDeMp({ mp_access_token: null, mp_user_id: '123' })).toBe('vencida');
  });

  it('distingue OAuth, token pegado, demo y nada', () => {
    expect(conexionDeMp({ mp_access_token: 'APP_USR-x', mp_user_id: '123' })).toBe('oauth');
    expect(conexionDeMp({ mp_access_token: 'APP_USR-x', mp_user_id: null })).toBe('manual');
    expect(conexionDeMp({ mp_access_token: 'SIMULADO', mp_user_id: null })).toBe('demo');
    expect(conexionDeMp({ mp_access_token: null, mp_user_id: null })).toBeNull();
  });
});
