import * as bcrypt from 'bcrypt';
import { RecuperarClaveService } from './recuperar-clave.service';
import { firmarConfirmacion, firmarRecuperacion } from './token-confirmacion.util';

const S = 'secreto-de-prueba';
const cuenta = (x = {}) => ({ id: 'u-1', email: 'ana@mail.com', password: 'hash-a', activo: true, confirmacion_pendiente: false, tokenVersion: 3, companyId: 'c-1', ...x });

function armar(usuario: any = cuenta()) {
  const usuarios: any = { findOne: jest.fn(async () => usuario), update: jest.fn(async () => ({ affected: 1 })) };
  const mailer: any = { enviar: jest.fn(async () => ({})) };
  const sesiones: any = { revocar: jest.fn() };
  const audit: any = { registrar: jest.fn(async () => ({})) };
  return { service: new RecuperarClaveService(usuarios, mailer, sesiones, audit), usuarios, mailer, sesiones, audit };
}
const espera = () => new Promise((r) => setTimeout(r));

describe('RecuperarClaveService', () => {
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { JWT_SECRET: S, ERP_URL: 'https://erp.test' }); });
  afterEach(() => { process.env = { ...env }; });

  it('manda el link al correo de la cuenta', async () => {
    const { service, mailer } = armar();
    await expect(service.pedir(' ANA@mail.com ')).resolves.toEqual({ enviado: true });
    await espera();
    expect(mailer.enviar.mock.calls[0][0].para).toBe('ana@mail.com');
    expect(mailer.enviar.mock.calls[0][0].texto).toContain('https://erp.test/auth/nueva-clave?token=');
  });

  it.each([['sin cuenta', null], ['dada de baja', cuenta({ activo: false })], ['sin confirmar', cuenta({ confirmacion_pendiente: true })]])(
    '%s contesta igual y no manda el link', async (_q, usuario) => {
      const { service, mailer } = armar(usuario);
      await expect(service.pedir('ana@mail.com')).resolves.toEqual({ enviado: true });
      await espera();
      expect(mailer.enviar).not.toHaveBeenCalled();
    });

  it('si el correo falla, contesta igual', async () => {
    const { service, mailer } = armar();
    mailer.enviar.mockRejectedValueOnce(new Error('SMTP caído'));
    await expect(service.pedir('ana@mail.com')).resolves.toEqual({ enviado: true });
    await espera();
  });

  it('el link cambia la clave, apaga la provisoria y cierra las sesiones', async () => {
    const { service, usuarios, sesiones, audit } = armar(cuenta({ debe_cambiar_clave: true }));
    await expect(service.cambiar(firmarRecuperacion('u-1', 'hash-a', S), 'una-clave-nueva-1')).resolves.toEqual({ cambiada: true });
    const [donde, cambios] = usuarios.update.mock.calls[0];
    expect(donde).toEqual({ id: 'u-1' });
    await expect(bcrypt.compare('una-clave-nueva-1', cambios.password)).resolves.toBe(true);
    expect(cambios).toMatchObject({ debe_cambiar_clave: false, tokenVersion: 4 });
    expect(sesiones.revocar).toHaveBeenCalledWith('u-1');
    expect(audit.registrar).toHaveBeenCalled();
  });

  it('sirve una sola vez: al cambiar la clave, el link deja de valer', async () => {
    const { service, usuarios } = armar(cuenta({ password: 'hash-otra' }));
    await expect(service.cambiar(firmarRecuperacion('u-1', 'hash-a', S), 'una-clave-nueva-1')).rejects.toMatchObject({ codigo: 'RECUPERACION_INVALIDA' });
    expect(usuarios.update).not.toHaveBeenCalled();
  });

  it('un link de otra cosa, roto o de una cuenta dada de baja no sirve', async () => {
    const { service } = armar();
    await expect(service.cambiar('basura', 'una-clave-nueva-1')).rejects.toMatchObject({ codigo: 'RECUPERACION_INVALIDA' });
    await expect(service.cambiar(firmarConfirmacion('u-1', 'hash-a', S), 'una-clave-nueva-1')).rejects.toMatchObject({ codigo: 'RECUPERACION_INVALIDA' });
    const baja = armar(cuenta({ activo: false }));
    await expect(baja.service.cambiar(firmarRecuperacion('u-1', 'hash-a', S), 'una-clave-nueva-1')).rejects.toMatchObject({ codigo: 'RECUPERACION_INVALIDA' });
  });
});
