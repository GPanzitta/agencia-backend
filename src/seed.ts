// Primero el .env (no pisa lo que ya venga en el entorno): el candado de SEG-01
// mira ADMIN_PASSWORD y STAGE antes de abrir la base.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { Role } from './roles/entities/role.entity';
import { User } from './auth/entities/user.entity';
import { Company } from './companies/entities/company.entity';
import * as bcrypt from 'bcrypt';
import { Roles } from './enums/roles.enum';
import { credencialesDelSeed, SeedInseguroError } from './auth/clave-inicial.util';

/**
 * Seed mínimo: la empresa demo, todos los roles y el superadmin.
 * Idempotente: correrlo dos veces no duplica nada.
 */
async function bootstrap() {
  // SEG-01: antes de abrir la base. En producción no hay clave por defecto.
  let credenciales;
  try {
    credenciales = credencialesDelSeed(process.env);
  } catch (e) {
    if (e instanceof SeedInseguroError) {
      console.error(`Seed cancelado: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Seeding de la agencia...');

  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);
  const companyRepo = dataSource.getRepository(Company);

  // Todos los roles del enum, para que el alta de empleados los encuentre.
  const roles = new Map<string, Role>();
  for (const nombre of Object.values(Roles)) {
    let rol = await roleRepo.findOneBy({ nombre });
    if (!rol) rol = await roleRepo.save(roleRepo.create({ nombre }));
    roles.set(nombre, rol);
  }

  // Dejar rastro de dónde salió la clave (nunca la clave): un ADMIN_PASSWORD
  // distinto al esperado en el .env ya hizo perder una tarde de "el seed no persiste".
  const { email: adminEmail, password: adminPassword, origen: origenPassword } = credenciales;

  let adminUser = await userRepo.findOneBy({ email: adminEmail });

  // La empresa se puede renombrar desde Configuración → Empresa, así que no
  // sirve buscarla por nombre: se reusa la del admin si ya existe, si no la
  // primera que haya. Solo se crea "Agencia Demo" en una base vacía (buscar por
  // nombre hardcodeado creaba una duplicada tras cada renombre).
  let company: Company | null = null;
  if (adminUser?.companyId) {
    company = await companyRepo.findOneBy({ id: adminUser.companyId });
  }
  if (!company) {
    const existentes = await companyRepo.find({ order: { created_at: 'ASC' }, take: 1 });
    company = existentes[0] ?? null;
  }
  if (!company) {
    company = await companyRepo.save(companyRepo.create({ name: 'Agencia Demo' }));
    console.log('Empresa "Agencia Demo" creada');
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  if (!adminUser) {
    adminUser = userRepo.create({
      nombre: 'Admin Agencia',
      email: adminEmail,
      password: hashedPassword,
      role: roles.get(Roles.SUPERADMIN),
      company,
      companyId: company.id,
      activo: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    await userRepo.save(adminUser);
    console.log(`SuperAdmin creado: ${adminEmail} (clave: ${origenPassword})`);
  } else {
    adminUser.password = hashedPassword;
    await userRepo.save(adminUser);
    console.log(`Contraseña de SuperAdmin actualizada: ${adminEmail} (clave: ${origenPassword})`);
  }

  console.log('Seeding de la agencia completado.');
  await app.close();
}

bootstrap();
