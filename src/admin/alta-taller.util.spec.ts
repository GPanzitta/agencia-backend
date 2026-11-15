import { emailDelAdmin } from './alta-taller.util';

describe('emailDelAdmin', () => {
  it('el caso de siempre no cambia', () => {
    expect(emailDelAdmin('Taller Sur')).toBe('admin@tallersur.com');
  });

  it('sin acentos ni símbolos (#37)', () => {
    expect(emailDelAdmin('Taller Ñandú & Cía.')).toBe('admin@tallernanducia.com');
  });

  it('un nombre sin letras ni números no deja el correo vacío', () => {
    expect(emailDelAdmin('¡¡!!')).toBe('admin@taller.com');
  });
});
