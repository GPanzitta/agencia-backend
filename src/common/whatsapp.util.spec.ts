import { whatsappArgentino } from './whatsapp.util';

describe('whatsappArgentino', () => {
  it.each([
    // El caso de producción: el perfil decía "1133313834".
    ['1133313834', '5491133313834'],
    ['11 3331-3834', '5491133313834'],
    ['011 3331-3834', '5491133313834'],
    ['011 15 3331-3834', '5491133313834'],
    ['+54 9 11 3331-3834', '5491133313834'],
    ['5491133313834', '5491133313834'],
    ['+54 11 3331-3834', '5491133313834'],
    ['0054 11 3331 3834', '5491133313834'],
    ['54 011 15 3331 3834', '5491133313834'],
    // Área de 4 dígitos con el 15: 02944 15 123456 → 2944 123456.
    ['02944 15-123456', '5492944123456'],
    ['0351 155 123456', '5493515123456'],
  ])('%s → %s', (entrada, salida) => {
    expect(whatsappArgentino(entrada)).toBe(salida);
  });

  it('lo que no es un número argentino reconocible sale como vino, sólo dígitos', () => {
    expect(whatsappArgentino('4555-1234')).toBe('45551234');
    expect(whatsappArgentino('+1 (305) 555-0100')).toBe('13055550100');
  });

  it('vacío o nulo → null', () => {
    expect(whatsappArgentino(null)).toBeNull();
    expect(whatsappArgentino(undefined)).toBeNull();
    expect(whatsappArgentino('  -  ')).toBeNull();
  });
});
