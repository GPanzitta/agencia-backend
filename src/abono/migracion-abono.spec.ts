import { AbonoYPlanes1790000000015 } from '../migrations/1790000000015-AbonoYPlanes';

/** Un QueryRunner falso: anota cada SQL y contesta si la columna `plan` ya estaba. */
function runnerFalso(columnaYaExiste: boolean) {
  const consultas: string[] = [];
  return {
    consultas,
    query: async (sql: string) => {
      consultas.push(sql);
      return /information_schema/.test(sql) ? (columnaYaExiste ? [{ existe: 1 }] : []) : [];
    },
  };
}

describe('Migración de abono y planes', () => {
  const pasarAInterno = (q: { consultas: string[] }) =>
    q.consultas.filter((s) => /UPDATE\s+"company"/i.test(s) && /interno/.test(s));

  it('la primera vez deja a todas las empresas existentes en el plan interno', async () => {
    const q = runnerFalso(false);
    await new AbonoYPlanes1790000000015().up(q as never);
    expect(pasarAInterno(q)).toHaveLength(1);
  });

  it('corrida de nuevo no convierte en interno a un taller gratis nuevo', async () => {
    const q = runnerFalso(true);
    await new AbonoYPlanes1790000000015().up(q as never);
    expect(pasarAInterno(q)).toHaveLength(0);
  });

  it('siembra los valores decididos sin pisar los que ya estén editados', async () => {
    const q = runnerFalso(false);
    await new AbonoYPlanes1790000000015().up(q as never);
    const siembra = q.consultas.find((s) => /INSERT INTO "plataforma_config"/.test(s));
    expect(siembra).toMatch(/25000/);
    expect(siembra).toMatch(/30/);
    expect(siembra).toMatch(/\b7\b/);
    expect(siembra).toMatch(/ON CONFLICT .*DO NOTHING/s);
  });

  it('el pago de MP no se puede anotar dos veces', async () => {
    const q = runnerFalso(false);
    await new AbonoYPlanes1790000000015().up(q as never);
    expect(q.consultas.join('\n')).toMatch(/UNIQUE[^\n]*mp_pago_id/i);
  });

  it('la configuración es de una sola fila', async () => {
    const q = runnerFalso(false);
    await new AbonoYPlanes1790000000015().up(q as never);
    expect(q.consultas.join('\n')).toMatch(/CHECK \("?id"? = 1\)/);
  });
});
