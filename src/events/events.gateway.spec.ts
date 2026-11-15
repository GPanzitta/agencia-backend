import { EventsGateway } from './events.gateway';
import { SesionesService } from '../auth/sesiones.service';

/** CLI-05 y SEG-07 en el socket. */
describe('EventsGateway: quién entra y quién queda afuera', () => {
  let usuario: any;
  let gateway: EventsGateway;
  let sesiones: SesionesService;
  let cortados: string[];

  const cliente = (token = 'tok') => ({
    id: 's1',
    handshake: { auth: { token }, headers: {} },
    data: {} as any,
    join: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    usuario = { id: 'u1', activo: true, tokenVersion: 2, companyId: 'c1', role: { nombre: 'tecnico' } };
    sesiones = new SesionesService();
    const jwt = { verify: jest.fn(() => ({ id: 'u1', companyId: 'c1', tokenVersion: 2 })) };
    const repo = { findOne: jest.fn(async () => usuario) };
    gateway = new EventsGateway(jwt as any, repo as any, sesiones);
    cortados = [];
    gateway.server = { in: (room: string) => ({ disconnectSockets: () => cortados.push(room) }) } as any;
    gateway.afterInit();
  });

  it('un empleado activo entra al room de su empresa y al suyo', async () => {
    const c = cliente();
    await gateway.handleConnection(c as any);
    expect(c.join).toHaveBeenCalledWith('company:c1');
    expect(c.join).toHaveBeenCalledWith('user:u1');
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('CLI-05: dado de baja, con el token todavía firmado: se corta', async () => {
    usuario.activo = false;
    const c = cliente();
    await gateway.handleConnection(c as any);
    expect(c.join).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalled();
  });

  it('CLI-05: un token de antes de «Cerrar sesión» (versión vieja): se corta', async () => {
    usuario.tokenVersion = 3;
    const c = cliente();
    await gateway.handleConnection(c as any);
    expect(c.disconnect).toHaveBeenCalled();
  });

  it('SEG-07: sin empresa no entra a ningún room, y joinCompany tampoco lo deja', async () => {
    usuario.companyId = null;
    const c = cliente();
    await gateway.handleConnection(c as any);
    expect(c.disconnect).toHaveBeenCalled();
    gateway.handleJoinCompany(c as any, 'c-ajena');
    expect(c.join).not.toHaveBeenCalled();
  });

  it('CLI-05: una revocación corta los sockets de ese usuario', () => {
    sesiones.revocar('u1');
    expect(cortados).toEqual(['user:u1']);
  });
});
