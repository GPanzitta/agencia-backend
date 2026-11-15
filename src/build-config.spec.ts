import { readFileSync } from 'fs';
import { join } from 'path';

// Revisión final de la etapa 0 (28/10): un .ts en scripts/ entraba al build y
// la salida pasaba a dist/src/main.js; `node dist/main` y las migraciones del
// deploy (dist/data-source.js) dejaban de existir.
describe('tsconfig.build.json', () => {
  it('deja afuera scripts/: la salida tiene que quedar en dist/main.js', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'tsconfig.build.json'), 'utf8'));
    expect(config.exclude).toContain('scripts');
  });
});
