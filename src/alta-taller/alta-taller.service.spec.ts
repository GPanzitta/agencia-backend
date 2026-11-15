import * as bcrypt from 'bcrypt';
import { AltaTallerService } from './alta-taller.service';
import { firmarConfirmacion, huellaDeClave, leerConfirmacion } from './token-confirmacion.util';

const dto = (x = {}) => ({ taller: 'Taller Ñandú', nombre: 'Ana Paz', email: '  ANA@Mail.com ', telefono: '1155550000', clave: 'una-clave-larga', ...x });

function armar(usuario: any = null, configurado = true) {
  const usuarios: any = { findOne: jest.fn(async () => usuario), update: jest.fn(async () => ({ affected: 1 })) };
  const admin: any = { crearTallerPublico: jest.fn(async () => ({ userId: 'u-1', companyId: 'c-1' })), actualizarTallerPendiente: jest.fn(async () => undefined) };
  const mailer: any = { configurado: jest.fn(() => configurado), enviar: jest.fn(async () => ({})) };
  return { service: new AltaTallerService(usuarios, admin, mailer), usuarios, admin, mailer };
}

describe('AltaTallerService', () => {
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { JWT_SECRET: 'secreto-de-prueba', ERP_URL: 'https://erp.test' }); });
  afterEach(() => { process.env = { ...env }; });

  it('crea el taller con el correo normalizado y manda la confirmación con el nombre del producto', async () => {
    const { service, admin, mailer } = armar();
    await expect(service.registrar(dto())).resolves.toEqual({ enviado: true });
    expect(admin.crearTallerPublico).toHaveBeenCalledWith(expect.objectContaining({ taller: 'Taller Ñandú', email: 'ana@mail.com', claveHash: expect.any(String) }));
    expect(admin.crearTallerPublico.mock.calls[0][0].claveHash).not.toContain('una-clave-larga');
    const correo = mailer.enviar.mock.calls[0][0];
    expect(correo.para).toBe('ana@mail.com');
    expect(correo.asunto).toBe('Confirmá tu cuenta de FG services');
    expect(correo.remitente).toEqual({ nombre: 'FG services' });
    expect(correo.html).toContain('https://erp.test/auth/confirmar?token=');
  });

  it('el campo trampa lleno responde igual y no crea nada', async () => {
    const { service, admin, mailer } = armar();
    await expect(service.registrar(dto({ sitio_web: 'http://spam' }))).resolves.toEqual({ enviado: true });
    expect(admin.crearTallerPublico).not.toHaveBeenCalled();
    expect(mailer.enviar).not.toHaveBeenCalled();
  });

  it('un correo de una cuenta confirmada se rechaza', async () => {
    const { service, admin } = armar({ id: 'u-9', email: 'ana@mail.com', confirmacion_pendiente: false });
    await expect(service.registrar(dto())).rejects.toMatchObject({ codigo: 'CORREO_YA_REGISTRADO' });
    expect(admin.crearTallerPublico).not.toHaveBeenCalled();
  });

  it('registrarse otra vez antes de confirmar reenvía y no crea otro taller', async () => {
    const { service, admin, mailer } = armar({ id: 'u-9', email: 'ana@mail.com', confirmacion_pendiente: true });
    await expect(service.registrar(dto())).resolves.toEqual({ enviado: true });
    expect(admin.crearTallerPublico).not.toHaveBeenCalled();
    expect(mailer.enviar).toHaveBeenCalledTimes(1);
  });

  it('sin correo configurado no crea nada: nadie podría entrar a ese taller', async () => {
    const { service, admin } = armar(null, false);
    await expect(service.registrar(dto())).rejects.toMatchObject({ codigo: 'CORREO_NO_CONFIGURADO' });
    expect(admin.crearTallerPublico).not.toHaveBeenCalled();
  });

  it('si el envío falla después de crear, avisa con enviado: false', async () => {
    const { service, mailer } = armar();
    mailer.enviar.mockRejectedValueOnce(new Error('SMTP caído'));
    await expect(service.registrar(dto())).resolves.toEqual({ enviado: false });
  });

  it('confirmar con un token válido activa la cuenta, y repetirlo no falla', async () => {
    const { service, usuarios } = armar({ id: 'u-1', confirmacion_pendiente: true });
    const token = firmarConfirmacion('u-1', undefined, 'secreto-de-prueba');
    await expect(service.confirmar(token)).resolves.toEqual({ confirmada: true });
    expect(usuarios.update).toHaveBeenCalledWith({ id: 'u-1' }, { confirmacion_pendiente: false });
    usuarios.findOne.mockResolvedValue({ id: 'u-1', confirmacion_pendiente: false });
    await expect(service.confirmar(token)).resolves.toEqual({ confirmada: true });
    expect(usuarios.update).toHaveBeenCalledTimes(1);
  });

  it('un token malo, o de un usuario que no existe, se rechaza', async () => {
    const { service } = armar(null);
    await expect(service.confirmar('basura')).rejects.toMatchObject({ codigo: 'CONFIRMACION_INVALIDA' });
    await expect(service.confirmar(firmarConfirmacion('u-1', undefined, 'secreto-de-prueba'))).rejects.toMatchObject({ codigo: 'CONFIRMACION_INVALIDA' });
  });

  it('reenviar responde siempre igual: no revela qué correos existen', async () => {
    const pendiente = armar({ id: 'u-1', email: 'a@b.c', confirmacion_pendiente: true });
    await expect(pendiente.service.reenviar('A@b.c')).resolves.toEqual({ enviado: true });
    expect(pendiente.mailer.enviar).toHaveBeenCalledTimes(1);
    const nadie = armar(null);
    await expect(nadie.service.reenviar('x@y.z')).resolves.toEqual({ enviado: true });
    expect(nadie.mailer.enviar).not.toHaveBeenCalled();
    const confirmada = armar({ id: 'u-1', email: 'a@b.c', confirmacion_pendiente: false });
    await expect(confirmada.service.reenviar('a@b.c')).resolves.toEqual({ enviado: true });
    expect(confirmada.mailer.enviar).not.toHaveBeenCalled();
  });
});

describe('AltaTallerService — registrarse otra vez sin haber confirmado', () => {
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { JWT_SECRET: 'secreto-de-prueba', ERP_URL: 'https://erp.test' }); });
  afterEach(() => { process.env = { ...env }; });
  const pendiente = { id: 'u-9', companyId: 'c-9', email: 'ana@mail.com', password: 'hash-viejo', confirmacion_pendiente: true };
  const tokenDe = (correo: any) => decodeURIComponent(/token=([^"\s]+)/.exec(correo.texto)![1]);

  it('vale la clave y el nombre de esta vez: si no, la cuenta confirmada no abriría con la clave que recuerda', async () => {
    const { service, admin, mailer } = armar(pendiente);
    await service.registrar(dto({ taller: 'Otro nombre', clave: 'la-clave-nueva-1' }));
    expect(admin.crearTallerPublico).not.toHaveBeenCalled();
    const [userId, companyId, datos] = admin.actualizarTallerPendiente.mock.calls[0];
    expect([userId, companyId]).toEqual(['u-9', 'c-9']);
    expect(datos.taller).toBe('Otro nombre');
    await expect(bcrypt.compare('la-clave-nueva-1', datos.claveHash)).resolves.toBe(true);
    expect(leerConfirmacion(tokenDe(mailer.enviar.mock.calls[0][0]), 'secreto-de-prueba')?.huella).toBe(huellaDeClave(datos.claveHash));
  });

  it('el link del registro anterior deja de servir: no activa una clave que ya no es', async () => {
    const { service, usuarios } = armar({ ...pendiente, password: 'hash-nuevo' });
    const viejo = firmarConfirmacion('u-9', 'hash-viejo', 'secreto-de-prueba');
    await expect(service.confirmar(viejo)).rejects.toMatchObject({ codigo: 'CONFIRMACION_INVALIDA' });
    expect(usuarios.update).not.toHaveBeenCalled();
  });

  it('el link del último registro confirma', async () => {
    const { service, usuarios } = armar({ ...pendiente, password: 'hash-nuevo' });
    await service.confirmar(firmarConfirmacion('u-9', 'hash-nuevo', 'secreto-de-prueba'));
    expect(usuarios.update).toHaveBeenCalledWith({ id: 'u-9' }, { confirmacion_pendiente: false });
  });
});
