import { enmascararCampo, enmascararObjeto, enmascararTexto } from './enmascarar.util';

describe('enmascararCampo', () => {
  it('teléfono y documento: sólo los últimos 3 dígitos', () => {
    expect(enmascararCampo('telefono', '11 3331-3834')).toBe('•••• 834');
    expect(enmascararCampo('documento', '30.123.456')).toBe('•••• 456');
    expect(enmascararCampo('cuit', '20-30123456-7')).toBe('•••• 567');
  });

  it('correo, dirección y secretos', () => {
    expect(enmascararCampo('email', 'marta@gmail.com')).toBe('ma•••@gmail.com');
    expect(enmascararCampo('direccion_principal', 'Rivadavia 1234')).toBe('(dirección)');
    expect(enmascararCampo('mp_access_token', 'APP_USR-123')).toBe('••••');
  });

  it('lo que no es sensible pasa igual', () => {
    expect(enmascararCampo('nombre', 'Marta')).toBe('Marta');
    expect(enmascararCampo('telefono', null)).toBeNull();
  });
});

describe('enmascararTexto (logs)', () => {
  it('tapa correos, DNI, teléfonos, CBU, tokens y Bearer', () => {
    const t = enmascararTexto(
      'cliente marta@gmail.com tel 11 3331-3834 dni 30123456 cbu 0110599520000001234567 token APP_USR-1234567890-abc Authorization: Bearer eyJhbGciOi.abc.def',
    );
    expect(t).not.toContain('marta@gmail.com');
    expect(t).not.toContain('3331-3834');
    expect(t).not.toContain('30123456');
    expect(t).not.toContain('0110599520000001234567');
    expect(t).not.toContain('1234567890');
    expect(t).not.toContain('eyJhbGciOi');
  });

  it('números cortos (montos, años, códigos) quedan', () => {
    expect(enmascararTexto('Orden OS-2026-0042 por $ 45000')).toBe('Orden OS-2026-0042 por $ 45000');
  });

  it('enmascararObjeto usa el nombre del campo', () => {
    expect(enmascararObjeto({ nombre: 'Marta', telefono: '1133313834', email: 'm@x.com' })).toEqual({
      nombre: 'Marta', telefono: '•••• 834', email: 'm•••@x.com',
    });
  });
});
