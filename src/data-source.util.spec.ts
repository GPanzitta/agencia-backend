import { rutasDeTypeorm } from './data-source.util';

describe('rutasDeTypeorm', () => {
  it('compilado (deploy en Render, sin ts-node): entidades y migraciones de dist/', () => {
    expect(rutasDeTypeorm(true)).toEqual({ entities: ['dist/**/*.entity.js'], migrations: ['dist/migrations/*.js'] });
  });
  it('desde el código fuente (CLI local con ts-node): las de src/, como siempre', () => {
    expect(rutasDeTypeorm(false)).toEqual({ entities: ['src/**/*.entity.ts'], migrations: ['src/migrations/*.ts'] });
  });
});
