import { TIPOS_PIEZA } from './sintomas.util';
import {
  EQUIPOS_SINTOMA, SINTOMAS_POR_DEFECTO, idsDeRepuestos, sintomasPublicos, sintomasVigentes, type SintomaConfig,
} from './sintomas.util';

const repuesto = (id: string) => ({ id, nombre: `Repuesto ${id}` });
const config: SintomaConfig[] = [
  {
    equipo: 'lavarropas', sintoma: 'No centrifuga',
    causas: [
      { causa: 'Rulemanes', senal: 'Ruido', tiempo: '2 días', tipo: 'rodamiento', repuestos: [repuesto('a'), repuesto('b')] },
      { causa: 'Correa', senal: 'Motor suena', tiempo: 'En el día', tipo: 'correa', repuestos: [repuesto('a')] },
    ],
  },
  { equipo: 'heladera', sintoma: 'Vacío', causas: [] },
];

describe('sintomas.util', () => {
  it('la lista de fábrica usa equipos y zonas del despiece que existen', () => {
    for (const x of SINTOMAS_POR_DEFECTO) {
      expect(EQUIPOS_SINTOMA).toContain(x.equipo);
      for (const k of x.causas) if (k.tipo) expect(TIPOS_PIEZA).toContain(k.tipo);
    }
  });

  it('sin nada guardado devuelve una copia de la lista de fábrica', () => {
    const vigentes = sintomasVigentes(null);
    expect(vigentes).toEqual(SINTOMAS_POR_DEFECTO);
    vigentes[0].sintoma = 'pisado';
    expect(SINTOMAS_POR_DEFECTO[0].sintoma).not.toBe('pisado');
  });

  it('lo guardado manda, aunque sea una lista vacía', () => {
    expect(sintomasVigentes([])).toEqual([]);
    expect(sintomasVigentes(config)).toBe(config);
  });

  it('junta los ids de repuestos sin repetir', () => {
    expect(idsDeRepuestos(config)).toEqual(['a', 'b']);
  });

  it('el portal ve cada repuesto con su vista de la tienda y pierde los despublicados', () => {
    const vistas = new Map([['a', { slug: 'rulemanes-a' }]]);
    const pub = sintomasPublicos(config, vistas);
    expect(pub).toHaveLength(1); // el síntoma sin causas no sale
    expect(pub[0].causas[0].repuestos).toEqual([{ slug: 'rulemanes-a' }]);
    expect(pub[0].causas[1].repuestos).toEqual([{ slug: 'rulemanes-a' }]);
    expect(pub[0].causas[0]).not.toHaveProperty('repuestos.0.nombre');
  });
});
