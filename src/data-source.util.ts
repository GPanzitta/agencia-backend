/**
 * Dónde busca la CLI de TypeORM las entidades y migraciones. Desde el código
 * fuente (local, con ts-node) son los `.ts` de `src/`; compilado (el
 * `preDeployCommand` de Render corre `dist/data-source.js`, sin ts-node) son
 * los `.js` de `dist/`.
 */
export function rutasDeTypeorm(compilado: boolean): { entities: string[]; migrations: string[] } {
  return compilado
    ? { entities: ['dist/**/*.entity.js'], migrations: ['dist/migrations/*.js'] }
    : { entities: ['src/**/*.entity.ts'], migrations: ['src/migrations/*.ts'] };
}
