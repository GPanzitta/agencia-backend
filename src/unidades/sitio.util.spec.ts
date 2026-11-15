import { slugDe, slugLibre, slugValido } from './sitio.util';

describe('dirección del sitio de cada agencia', () => {
  it('arma la dirección a partir del nombre', () => {
    expect(slugDe('Automotores Pérez & Hnos.')).toBe('automotores-perez-hnos');
    expect(slugDe('  Ñandú   Autos  ')).toBe('nandu-autos');
    expect(slugDe('***')).toBe('');
    expect(slugDe('a'.repeat(60)).length).toBe(40);
  });

  it('busca la primera libre y esquiva las de la plataforma', () => {
    expect(slugLibre('Pérez', [])).toBe('perez');
    expect(slugLibre('Pérez', ['perez'])).toBe('perez-2');
    expect(slugLibre('Pérez', ['perez', 'perez-2'])).toBe('perez-3');
    expect(slugLibre('Admin', [])).toBe('admin-2');
    expect(slugLibre('***', [])).toBe('agencia');
  });

  it('sólo acepta lo que tiene forma de dirección', () => {
    expect(slugValido(' Perez-Autos ')).toBe('perez-autos');
    expect(slugValido('perez_autos')).toBeNull();
    expect(slugValido('-perez')).toBeNull();
    expect(slugValido("x'; drop")).toBeNull();
    expect(slugValido(undefined)).toBeNull();
  });
});
