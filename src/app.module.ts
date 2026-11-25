import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { TenantThrottlerGuard } from './common/tenant-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { RolesModule } from './roles/roles.module';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { TenantSubscriber } from './tenant/tenant.subscriber';
import { AdminModule } from './admin/admin.module';
import { AbonoModule } from './abono/abono.module';
import { AltaTallerModule } from './alta-taller/alta-taller.module';
import { CashRegisterModule } from './cash-register/cash-register.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { FinanceModule } from './finance/finance.module';
import { WalletsModule } from './wallets/wallets.module';
import { EventsModule } from './events/events.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { UnidadesModule } from './unidades/unidades.module';
import { MargenModule } from './margen/margen.module';
import { TallerModule } from './taller/taller.module';
import { InteresadosModule } from './interesados/interesados.module';
import { CompetenciaModule } from './competencia/competencia.module';
import { MensajesModule } from './mensajes/mensajes.module';
import { PerfilPublicoModule } from './perfil-publico/perfil-publico.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ActividadModule } from './common/actividad/actividad.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Los cron de la app (gastos recurrentes en `finance`). `forRoot()` va una sola vez y acá: es un
    // módulo dinámico sin opciones, así que Nest lo deduplica si lo declaran
    // varios, pero depender de esa deduplicación para no registrar dos veces
    // el mismo cron es una garantía prestada. Los módulos que tienen tareas
    // sólo usan @Cron.
    //
    // `TAREAS_PROGRAMADAS=apagadas` lo deja afuera y ningún @Cron corre (nada
    // inyecta SchedulerRegistry, así que no hay dependencia que se rompa). Es
    // para el backend local: los cron generan gastos fijos, y dos backends corriéndolos a la vez
    // duplican todo eso. En Render la variable no existe y corren como siempre.
    ...(process.env.TAREAS_PROGRAMADAS === 'apagadas' ? [] : [ScheduleModule.forRoot()]),
    ActividadModule,
    AltaTallerModule,
    SaludModule,

    // Rate limiting global.
    //
    // Estaba en 5 req/s y 30 req/min POR IP. En un restaurante todas las
    // terminales salen por la misma IP pública: tres cajas en hora pico se
    // comían el límite y el sistema empezaba a devolver 429 en plena operación.
    // Al mismo tiempo, 30/min es holgado para un ataque de fuerza bruta contra
    // el login, que es donde el límite hace falta de verdad.
    //
    // Acá va un techo global que solo frena abuso evidente; los endpoints
    // sensibles llevan su propio @Throttle mucho más estricto.
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1 segundo
        limit: 30,    // ráfaga: abrir una pantalla dispara varias llamadas
      },
      {
        name: 'medium',
        ttl: 60000,   // 1 minuto
        limit: 600,   // ~10 req/s sostenidas para todo el local
      },
    ]),

    // Configurar servir archivos estáticos (imágenes)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('STAGE') === 'prod';

        if (isProd) {
          const dbUrl = new URL(
            configService.get<string>('DATABASE_URL') ?? '',
          );
          return {
            type: 'postgres' as const,
            host: dbUrl.hostname,
            port: parseInt(dbUrl.port || '5432', 10),
            username: decodeURIComponent(dbUrl.username),
            password: decodeURIComponent(dbUrl.password),
            database: dbUrl.pathname.replace('/', ''),
            autoLoadEntities: true,
            // NUNCA volver a poner esto en true.
            //
            // `synchronize` ajusta el esquema solo para que coincida con las
            // entidades: un campo renombrado o borrado en una entidad se
            // traduce en un DROP COLUMN sobre la base productiva, sin aviso ni
            // vuelta atrás. Un deploy desde una rama vieja alcanza para perder
            // datos. El esquema ahora se cambia con migraciones versionadas:
            //   npm run migration:generate -- src/migrations/NombreDelCambio
            //   npm run migration:run
            synchronize: false,
            migrations: ['dist/migrations/*.js'],
            migrationsTableName: 'migrations',
            // Las migraciones se corren explícitamente en el deploy, no al
            // levantar la app: si una falla, tiene que fallar el deploy y no
            // dejar el servicio a medio arrancar.
            migrationsRun: false,
            // dropSchema: true,
            // `rejectUnauthorized: false` cifraba la conexión pero no validaba
            // el certificado del servidor, que es justamente lo que protege
            // contra un man-in-the-middle: cualquiera en el camino podía
            // presentar un certificado propio y leer el tráfico, credenciales
            // incluidas. Neon usa una CA pública, así que validar no requiere
            // configuración extra.
            ssl: { rejectUnauthorized: true }
          };
        }

        // Configuración para desarrollo local
        return {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', '1234'),
          database: configService.get<string>('DB_NAME', 'gestion_empresa'),
          autoLoadEntities: true,
          synchronize: true, // Solo en desarrollo local
        };
      },
    }),
    AuthModule,
    // Datos de la empresa (membrete de la documentación física).
    CompaniesModule,
    RolesModule,
    ProveedoresModule,
    ExpensesModule,
    FinanceModule,
    CashRegisterModule,
    AdminModule,
    AbonoModule,
    PaymentMethodsModule,
    WalletsModule,
    EventsModule,
    AuditModule,
    // Agencia: unidades, operaciones y catálogo público.
    UnidadesModule,
    // Tablero de rentabilidad del dueño.
    MargenModule,
    // Órdenes de alistaje / taller y pañol de repuestos automotrices.
    TallerModule,
    InteresadosModule,
    CompetenciaModule,
    MensajesModule,
    PerfilPublicoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Aplica rate limiting a TODAS las rutas
    {
      provide: APP_GUARD,
      useClass: TenantThrottlerGuard,
    },
    // Interceptor global para Multi-tenancy
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    // Auditoría de acciones sensibles. Solo actúa sobre los endpoints marcados
    // con @Auditable; el resto pasa de largo.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    TenantSubscriber,
  ],
})
export class AppModule {}
