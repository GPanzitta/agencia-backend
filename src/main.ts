// Tiene que ser el primer import: carga el .env en process.env ANTES de que
// se evalúen los decoradores de los módulos que se importan más abajo (como
// el @WebSocketGateway de events.gateway.ts, que lee CORS_ORIGINS al definirse).
// En Render las variables ya vienen inyectadas en el proceso, así que esto
// no pisa nada — dotenv no sobreescribe una env var que ya exista.
import 'dotenv/config';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { applyTenantPatch } from './tenant/tenant.plugin';
import { traducirValidacion } from './common/errores/validacion.util';
import { FiltroDeErrores } from './common/errores/http-exception.filter';
import { obtenerOrigenesCors } from './common/cors-origins.util';
import { LoggerEnmascarado } from './common/logger-enmascarado';
import { QuitarSecretosInterceptor } from './common/quitar-secretos.interceptor';
import { TaparDatosClienteInterceptor } from './common/tapar-datos-cliente.interceptor';
import { ActividadService } from './common/actividad/actividad.service';

async function bootstrap() {
  applyTenantPatch();
  // Integridad 14/10: todos los logs pasan por el enmascarador (correos, DNI,
  // teléfonos, CBU y tokens no se imprimen enteros). `bufferLogs` para que
  // los mensajes del arranque también salgan por él.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(new LoggerEnmascarado());

  // Render pone un proxy adelante: sin esto `req.ip` es la IP del proxy y el
  // rate limit metía a todos los usuarios de todos los talleres en el mismo
  // balde. Con N saltos de confianza Express toma la IP que agregó el último
  // proxy propio (no la que manda el cliente, que se puede falsificar).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // Consumo de Neon (28/10): cada pedido anota la hora, y los cron de
  // mantenimiento corren sólo con la base ya despierta (`actividad.util.ts`).
  const actividad = app.get(ActividadService);
  app.use((req: { method: string; path: string }, _res: unknown, next: () => void) => { actividad.registrar(req.method, req.path); next(); });

  // Helmet: headers de seguridad HTTP (XSS, clickjacking, MIME sniffing, etc.)
  app.use(helmet({
    crossOriginResourcePolicy: false,
  }));

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true,   // Rechaza requests con campos inventados
      transform: true,              // Transforma payloads a instancias de DTO (ej: string → Date)
      // Sin esto, un typo en cualquier formulario le muestra al operario el
      // mensaje default de class-validator, en inglés técnico.
      exceptionFactory: traducirValidacion,
    }),
  );

  // Excluye campos marcados con @Exclude() (como password)
  // DAT-04: el primero envuelve al segundo, así que `QuitarSecretos` trabaja
  // sobre lo que ya serializó el ClassSerializer y borra lo que se le escape
  // (hash de clave, versión de sesión, tokens de MP/ML) en objetos planos.
  // DAT-02: en el medio, también sobre lo ya serializado, se tapan teléfono,
  // correo y DNI de los clientes para técnico y chofer (salvo las excepciones
  // marcadas con @DatosClienteCompletos).
  app.useGlobalInterceptors(
    new QuitarSecretosInterceptor(),
    new TaparDatosClienteInterceptor(app.get(Reflector)),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Forma única de los errores: { statusCode, code, message }
  app.useGlobalFilters(new FiltroDeErrores());

  // CORS restringido a dominios confiables: los de desarrollo (hardcodeados)
  // más los que lleguen por CORS_ORIGINS (lista separada por comas), para
  // sumar los dominios de Vercel de la demo sin tocar código en cada deploy.
  app.enableCors({
    origin: obtenerOrigenesCors(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.setGlobalPrefix("api");
  // 0.0.0.0: Render (y la mayoría de los PaaS) enrutan al contenedor por su
  // IP interna, no por localhost — sin esto el health check nunca conecta.
  // El puerto lo inyecta la plataforma vía PORT; 3000 queda de fallback local.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
