import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { Company } from '../companies/entities/company.entity';
import { Role } from '../roles/entities/role.entity';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';

/**
 * Alta de un taller nuevo (empresa) con sus dos primeros usuarios: el
 * gerente (rol admin: configura la empresa y da de alta al resto del
 * personal desde el ERP) y un administrativo (rol mostrador). Arranca sin
 * datos operativos.
 *
 * Idempotente por email: si la empresa (por nombre) o un usuario ya existen,
 * se reusan y se les actualiza la contraseña. Se corre con
 * `npm run empresa:crear` y toma todo de variables de entorno:
 *
 *   EMPRESA_NOMBRE, GERENTE_EMAIL, GERENTE_PASSWORD,
 *   ADMINISTRATIVO_EMAIL, ADMINISTRATIVO_PASSWORD  (nombres opcionales:
 *   GERENTE_NOMBRE, ADMINISTRATIVO_NOMBRE)
 */
function requerida(nombre: string): string {
  const valor = (process.env[nombre] ?? '').trim();
  if (!valor) throw new Error(`Falta la variable ${nombre}`);
  return valor;
}

async function bootstrap() {
  const nombreEmpresa = requerida('EMPRESA_NOMBRE');
  const usuarios = [
    { rol: Roles.ADMIN, nombre: process.env.GERENTE_NOMBRE || 'Gerente', email: requerida('GERENTE_EMAIL'), password: requerida('GERENTE_PASSWORD') },
    { rol: Roles.MOSTRADOR, nombre: process.env.ADMINISTRATIVO_NOMBRE || 'Administrativo', email: requerida('ADMINISTRATIVO_EMAIL'), password: requerida('ADMINISTRATIVO_PASSWORD') },
  ];

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const companyRepo = ds.getRepository(Company);
  const roleRepo = ds.getRepository(Role);
  const userRepo = ds.getRepository(User);

  let company = await companyRepo.findOneBy({ name: nombreEmpresa });
  if (company) {
    console.log(`Empresa "${nombreEmpresa}" ya existía (${company.id}); se reusa.`);
  } else {
    company = await companyRepo.save(companyRepo.create({ name: nombreEmpresa }));
    console.log(`Empresa "${nombreEmpresa}" creada (${company.id}).`);
  }

  for (const u of usuarios) {
    const role = await roleRepo.findOneBy({ nombre: u.rol });
    if (!role) throw new Error(`No existe el rol "${u.rol}": correr primero el seed.`);
    const password = await bcrypt.hash(u.password, 10);
    let user = await userRepo.findOneBy({ email: u.email });
    if (user) {
      if (user.companyId !== company.id) {
        throw new Error(`${u.email} ya existe en otra empresa (${user.companyId}); elegí otro email.`);
      }
      user.password = password;
      user.activo = true;
      await userRepo.save(user);
      console.log(`Usuario ${u.email} ya existía: contraseña actualizada.`);
    } else {
      const ahora = new Date();
      user = userRepo.create({
        nombre: u.nombre, email: u.email, password, role, company, companyId: company.id, activo: true,
        created_at: ahora, updated_at: ahora,
      });
      await userRepo.save(user);
      console.log(`Usuario ${u.rol} creado: ${u.email}`);
    }
  }

  console.log('Listo.');
  await app.close();
}

bootstrap().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
