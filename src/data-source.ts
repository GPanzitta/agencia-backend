import 'dotenv/config';
import { DataSource } from 'typeorm';
import { rutasDeTypeorm } from './data-source.util';

/**
 * DataSource para la CLI de TypeORM (generar y correr migraciones).
 *
 * Es un archivo aparte del `TypeOrmModule.forRootAsync` de `app.module.ts` a
 * propósito: la CLI corre fuera de Nest y no tiene acceso al `ConfigService`.
 * La configuración de conexión tiene que quedar igual en los dos lados.
 */
const isProd = process.env.STAGE === 'prod';
const rutas = rutasDeTypeorm(__filename.endsWith('.js'));

export const AppDataSource = new DataSource(
  isProd
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        ...rutas,
        migrationsTableName: 'migrations',
        synchronize: false,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? '1234',
        database: process.env.DB_NAME ?? 'gestion_empresa',
        ...rutas,
        migrationsTableName: 'migrations',
        synchronize: false,
      },
);

// Un solo export de DataSource: la CLI de TypeORM rechaza el archivo si
// encuentra más de uno (named + default cuenta como dos).
