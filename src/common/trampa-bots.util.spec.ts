import { Logger } from '@nestjs/common';
import { registrarDescarte } from './trampa-bots.util';

describe('registrarDescarte (POR-06)', () => {
  it('deja el descarte en el log, con el formulario, la empresa y los datos de contacto recortados', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    registrarDescarte('arrepentimiento', 'c1', { email: 'ana@mail.com', pedido: 'VT-2026-0001', vacio: '', nulo: null, largo: 'x'.repeat(500) });
    const linea = String(warn.mock.calls[0][0]);
    expect(linea).toContain('"formulario":"arrepentimiento"');
    expect(linea).toContain('"email":"ana@mail.com"');
    expect(linea).not.toContain('vacio');
    expect(linea).not.toContain('x'.repeat(121));
    warn.mockRestore();
  });
});
