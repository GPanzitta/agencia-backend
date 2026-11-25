// Primero el .env (no pisa lo que ya venga en el entorno): el candado de SEG-01
// mira ADMIN_PASSWORD y STAGE antes de abrir la base.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { Role } from './roles/entities/role.entity';
import { User } from './auth/entities/user.entity';
import { Company } from './companies/entities/company.entity';
import { Unidad } from './unidades/entities/unidad.entity';
import { UnidadGasto } from './unidades/entities/unidad-gasto.entity';
import { Operacion } from './unidades/entities/operacion.entity';
import { OperacionPago } from './unidades/entities/operacion-pago.entity';
import { Interesado } from './interesados/interesado.entity';
import { RepuestoAuto } from './taller/entities/repuesto-auto.entity';
import { OrdenAlistaje } from './taller/entities/orden-alistaje.entity';
import { OrdenAlistajeRepuesto } from './taller/entities/orden-alistaje-repuesto.entity';
import { checklistInicial } from './taller/taller.util';
import * as bcrypt from 'bcrypt';
import { Roles } from './enums/roles.enum';
import { credencialesDelSeed, SeedInseguroError } from './auth/clave-inicial.util';

/**
 * Seed de la agencia: empresa demo, todos los roles, el admin y datos de
 * demostración completos (stock con distintos estados/papeles, interesados con
 * vehículos usados detallados y Órdenes de Venta OV con pagos) si la base está vacía.
 * Idempotente: correrlo dos veces no duplica nada.
 */
async function bootstrap() {
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
  const unidadRepo = dataSource.getRepository(Unidad);
  const gastoRepo = dataSource.getRepository(UnidadGasto);
  const opRepo = dataSource.getRepository(Operacion);
  const pagoRepo = dataSource.getRepository(OperacionPago);
  const intRepo = dataSource.getRepository(Interesado);
  const repRepo = dataSource.getRepository(RepuestoAuto);
  const oaRepo = dataSource.getRepository(OrdenAlistaje);
  const oaRepRepo = dataSource.getRepository(OrdenAlistajeRepuesto);

  const roles = new Map<string, Role>();
  for (const nombre of Object.values(Roles)) {
    let rol = await roleRepo.findOneBy({ nombre });
    if (!rol) rol = await roleRepo.save(roleRepo.create({ nombre }));
    roles.set(nombre, rol);
  }

  const { email: adminEmail, password: adminPassword, origen: origenPassword } = credenciales;
  let adminUser = await userRepo.findOneBy({ email: adminEmail });

  let company: Company | null = null;
  if (adminUser?.companyId) {
    company = await companyRepo.findOneBy({ id: adminUser.companyId });
  }
  if (!company) {
    const existentes = await companyRepo.find({ order: { created_at: 'ASC' }, take: 1 });
    company = existentes[0] ?? null;
  }
  if (!company) {
    company = await companyRepo.save(
      companyRepo.create({
        name: 'FG Autos',
        slug: 'fg-autos',
        sitio_muestra_papeles: true,
        sitio_financiacion: { anticipo_minimo_pct: 30, plazos: [12, 24, 36, 48], tna_ars: 55, tna_usd: 18 },
        sitio_reserva: { monto: 250000, moneda: 'ARS', horas: 48, dias: 7, alias: 'FGAUTOS.RESERVA.MP', titular: 'FG Autos S.R.L.' },
      }),
    );
    console.log('Empresa "FG Autos" creada');
  } else if (!company.slug) {
    await companyRepo.update({ id: company.id }, {
      slug: 'fg-autos',
      sitio_muestra_papeles: true,
      sitio_financiacion: { anticipo_minimo_pct: 30, plazos: [12, 24, 36, 48], tna_ars: 55, tna_usd: 18 },
      sitio_reserva: { monto: 250000, moneda: 'ARS', horas: 48, dias: 7, alias: 'FGAUTOS.RESERVA.MP', titular: 'FG Autos S.R.L.' },
    });
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  if (!adminUser) {
    adminUser = userRepo.create({
      nombre: 'Admin FG Autos',
      email: adminEmail,
      password: hashedPassword,
      role: roles.get(Roles.SUPERADMIN),
      company,
      companyId: company.id,
      comision_pct: 3,
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

  // Sembrar unidades, interesados y Órdenes de Venta (OV) si no hay stock todavía
  const cantUnidades = await unidadRepo.count({ where: { companyId: company.id } });
  if (cantUnidades === 0) {
    console.log('Sembrando unidades en stock, interesados con usados y Órdenes de Venta (OV)...');

    const u1 = await unidadRepo.save(
      unidadRepo.create({
        numero: 'U-0001',
        dominio: 'AE852RA',
        marca: 'Volkswagen',
        modelo: 'Nivus',
        version: '200 TSI Highline AT',
        anio: 2021,
        km: 48500,
        color: 'Gris Platino',
        combustible: 'nafta',
        transmision: 'automatica',
        carroceria: 'suv',
        nro_motor: 'DHS-449812',
        nro_chasis: '9BWAA45U8MT089112',
        condicion: 'usado',
        origen: 'compra',
        estado: 'disponible',
        moneda: 'USD',
        costo_adquisicion: 18900,
        precio_venta: 22400,
        publicada: true,
        ubicacion: 'En salón',
        descripcion: 'Único dueño, todos los services oficiales asentados en manual, cubiertas Michelin al 85%, interior impecable.',
        fecha_ingreso: '2026-10-20',
        papeles: {
          titulo: { estado: 'ok' },
          cedula: { estado: 'ok' },
          formulario_08: { estado: 'ok' },
          vtv: { estado: 'ok', vence: '2027-06-15' },
          informe_dominio: { estado: 'ok', vence: '2026-12-20' },
          verificacion_policial: { estado: 'ok', vence: '2026-12-18' },
          libre_deuda_patentes: { estado: 'ok' },
          libre_deuda_multas: { estado: 'ok' },
        },
        autorId: adminUser.id,
        companyId: company.id,
      }),
    );

    await gastoRepo.save(
      gastoRepo.create({
        unidadId: u1.id,
        descripcion: 'Tratamiento acrílico y limpieza de tapizados',
        monto: 180,
        moneda: 'USD',
        autorId: adminUser.id,
      }),
    );

    const u2 = await unidadRepo.save(
      unidadRepo.create({
        numero: 'U-0002',
        dominio: 'AF410KL',
        marca: 'Toyota',
        modelo: 'Corolla Cross',
        version: 'SEG 1.8 Hybrid eCVT',
        anio: 2022,
        km: 34000,
        color: 'Blanco Perlado',
        combustible: 'hibrido',
        transmision: 'automatica',
        carroceria: 'suv',
        nro_motor: '2ZR-998123',
        nro_chasis: '9BRK33BE4N0114820',
        condicion: 'usado',
        origen: 'consignacion',
        estado: 'disponible',
        moneda: 'USD',
        costo_adquisicion: 0,
        precio_piso: 25500,
        precio_venta: 27900,
        publicada: true,
        titular_nombre: 'Martín Echeverría',
        titular_telefono: '11 5412-8890',
        titular_documento: '28441920',
        ubicacion: 'En salón',
        descripcion: 'Garantía Toyota transferible vigente hasta 2027. Consumo urbano de 4,5 L/100km. Auxilio sin rodar.',
        fecha_ingreso: '2026-09-05',
        papeles: {
          contrato_consignacion: { estado: 'ok' },
          titulo: { estado: 'ok' },
          cedula: { estado: 'ok' },
          formulario_08: { estado: 'ok' },
          vtv: { estado: 'ok', vence: '2026-11-28' },
          informe_dominio: { estado: 'en_tramite' },
          libre_deuda_patentes: { estado: 'ok' },
          libre_deuda_multas: { estado: 'ok' },
        },
        autorId: adminUser.id,
        companyId: company.id,
      }),
    );

    const u3 = await unidadRepo.save(
      unidadRepo.create({
        numero: 'U-0003',
        dominio: 'AD921MP',
        marca: 'Volkswagen',
        modelo: 'Amarok',
        version: 'V6 3.0 TDI Highline 4x4 AT',
        anio: 2020,
        km: 82000,
        color: 'Negro Profundo',
        combustible: 'diesel',
        transmision: 'automatica',
        carroceria: 'pickup',
        nro_motor: 'DDX-119204',
        nro_chasis: '8AWDB42H5LA044911',
        condicion: 'usado',
        origen: 'compra',
        estado: 'reservada',
        moneda: 'USD',
        costo_adquisicion: 26200,
        precio_venta: 30500,
        publicada: true,
        ubicacion: 'En salón',
        descripcion: 'Lona marítima original, cobertor de caja, 4 BFGoodrich recién colocadas, distribución completa recién hecha.',
        fecha_ingreso: '2026-11-01',
        papeles: {
          titulo: { estado: 'ok' },
          cedula: { estado: 'ok' },
          formulario_08: { estado: 'ok' },
          vtv: { estado: 'ok', vence: '2027-04-10' },
          informe_dominio: { estado: 'ok', vence: '2026-12-15' },
          verificacion_policial: { estado: 'ok', vence: '2026-12-10' },
          libre_deuda_patentes: { estado: 'ok' },
          libre_deuda_multas: { estado: 'ok' },
          transferencia_registro: { estado: 'en_tramite', nota: 'Carpeta ingresada en Registro Seccional N° 14 (Trámite #88412)' },
        },
        autorId: adminUser.id,
        companyId: company.id,
      }),
    );

    const u4 = await unidadRepo.save(
      unidadRepo.create({
        numero: 'U-0004',
        dominio: 'AC304TR',
        marca: 'Peugeot',
        modelo: '208',
        version: 'Feline 1.6 Pack Cuir',
        anio: 2018,
        km: 74000,
        color: 'Rojo Rubí',
        combustible: 'nafta',
        transmision: 'manual',
        carroceria: 'hatchback',
        condicion: 'usado',
        origen: 'toma',
        estado: 'disponible',
        moneda: 'USD',
        costo_adquisicion: 11200,
        precio_venta: 13800,
        publicada: true,
        ubicacion: 'En salón',
        descripcion: 'Techo cielo panorámico, climatizador bizona, sensores de estacionamiento y cámara de retroceso.',
        fecha_ingreso: '2026-08-15',
        papeles: {
          titulo: { estado: 'ok' },
          cedula: { estado: 'ok' },
          formulario_08: { estado: 'ok' },
          vtv: { estado: 'ok', vence: '2027-03-01' },
        },
        autorId: adminUser.id,
        companyId: company.id,
      }),
    );

    // Orden de Venta (OV) activa sobre la Amarok V6 (U-0003)
    const ov1 = await opRepo.save(
      opRepo.create({
        numero: 'OP-2026-0001',
        unidadId: u3.id,
        estado: 'reservada',
        cliente_nombre: 'Lucas Fernández',
        cliente_telefono: '11 6234-9901',
        cliente_documento: '34889102',
        precio: 30500,
        moneda: 'USD',
        reserva_vence: '2026-12-05',
        vendedorId: adminUser.id,
        notas: 'Entrega Toyota Hilux 2017 como parte de pago y saldo en efectivo al firmar 08.',
        fotos: [],
        autorId: adminUser.id,
        companyId: company.id,
      }),
    );

    await pagoRepo.save(
      pagoRepo.create({
        operacionId: ov1.id,
        medio: 'transferencia',
        monto: 2500,
        moneda: 'USD',
        detalle: 'Seña transferencia Banco Galicia #99412',
        autorId: adminUser.id,
      }),
    );

    // Interesados con autos usados completos y distintos estados en el tablero
    await intRepo.save([
      intRepo.create({
        nombre: 'Santiago Gómez',
        telefono: '11 5890-3321',
        email: 'santiago.gomez@gmail.com',
        origen: 'sitio',
        etapa: 'negociando',
        temperatura: 'caliente',
        unidadId: u1.id,
        busca: 'Busca SUV automática para su esposa, le encantó la Nivus Highline.',
        busca_marca: 'Volkswagen',
        busca_carroceria: 'suv',
        precio_max: 24000,
        precio_moneda: 'USD',
        tiene_usado: 'Volkswagen Gol Trend Pack III 2017 · 78.000 km [AB452CD]',
        cotizacion_pedida: true,
        cotizacion_valor: 9800,
        cotizacion_moneda: 'USD',
        cotizacion_fecha: '2026-11-22',
        proxima_accion: '2026-11-24',
        proxima_nota: 'Viene a las 16:30 hs con el Gol Trend para cerrar diferencia llave por llave',
        vendedorId: adminUser.id,
        usado: {
          tipo_vehiculo: 'Auto',
          carroceria: 'hatchback',
          dominio: 'AB452CD',
          marca: 'Volkswagen',
          modelo: 'Gol Trend',
          version: '1.6 Pack III 5P',
          anio: 2017,
          km: 78000,
          combustible: 'nafta',
          transmision: 'manual',
          seguro_compania: 'Federación Patronal',
          seguro_cobertura: 'Terceros Completo',
          seguro_cuota: 68000,
          costo_patente: 29000,
          radicacion: 'CABA',
          descripcion: 'Muy buen estado general, detalle mínimo de estacionamiento en paragolpes trasero.',
          guia: {
            uso: 'Uso diario en ciudad para ir a la oficina',
            guardado: 'Cochera cubierta fija',
            motivo_venta: 'Salto a SUV automática familiar',
            ultimo_service: '2026-08-10',
            ultima_vtv: '2027-05-01',
            mantenimiento: 'Distribución completa y bomba de agua hecha a los 62.000 km',
            neumaticos: '4 Pirelli Cinturato P1 con 15.000 km de uso',
            transferencia: 'Titular directo, sin deuda de patentes ni multas',
            agregados: 'Sensor de estacionamiento trasero y polarizado antivandálico 3M',
            paneles_choques: 'Sin choques, sólo roce superficial en paragolpes trasero',
            reparaciones: 'Cambio de batería Moura hace 4 meses',
          },
        },
        seguimiento: [
          {
            fecha: new Date(Date.now() - 86400000 * 2).toISOString(),
            texto: 'Pide cotización para entregar su auto en parte de pago por Volkswagen Nivus 200 TSI Highline AT 2021 (U-0001).',
            autor: null,
          },
          {
            fecha: new Date(Date.now() - 86400000).toISOString(),
            texto: 'Se le cotizó su auto (Volkswagen Gol Trend Pack III 2017) en US$ 9.800. Ref. mercado US$ 11.200 - Chapa y pintura: US$ 300 - Margen y garantía (10%): US$ 1.100.',
            autor: 'Admin FG Autos',
          },
        ],
        companyId: company.id,
      }),
      intRepo.create({
        nombre: 'Valeria Quiroga',
        telefono: '11 4120-7744',
        email: 'valeria.quiroga@hotmail.com',
        origen: 'whatsapp',
        etapa: 'visita',
        temperatura: 'caliente',
        unidadId: u2.id,
        busca: 'Busca SUV híbrida o bajo consumo hasta US$ 29.000.',
        busca_marca: 'Toyota',
        busca_carroceria: 'suv',
        precio_max: 29000,
        precio_moneda: 'USD',
        tiene_usado: 'Ford Fiesta Kinetic Titanium AT 2018 · 64.000 km [AC819LP]',
        cotizacion_pedida: true,
        proxima_accion: '2026-11-24',
        proxima_nota: 'Pasarle la cotización del Fiesta Titanium y confirmar prueba de manejo del Corolla Cross',
        vendedorId: adminUser.id,
        usado: {
          tipo_vehiculo: 'Auto',
          carroceria: 'hatchback',
          dominio: 'AC819LP',
          marca: 'Ford',
          modelo: 'Fiesta Kinetic',
          version: '1.6 Titanium Powershift',
          anio: 2018,
          km: 64000,
          combustible: 'nafta',
          transmision: 'automatica',
          seguro_compania: 'La Caja',
          seguro_cobertura: 'Todo Riesgo',
          seguro_cuota: 94000,
          costo_patente: 38000,
          radicacion: 'Buenos Aires (GBA / Interior)',
          descripcion: 'Techo solar, 7 airbags, tapizado de cuero, cámara trasera.',
          guia: {
            uso: 'Familiar y autopista Zona Norte',
            guardado: 'Cochera techada',
            motivo_venta: 'Busca SUV híbrida más alta',
            ultimo_service: '2026-09-18',
            ultima_vtv: '2027-07-01',
            mantenimiento: 'Services oficiales en Dietrich',
            neumaticos: 'Delanteros nuevos, traseros al 70%',
            transferencia: 'Sí, radicada en Vicente López al día',
            agregados: 'Tuercas de seguridad McGard',
            paneles_choques: '100% pintura original de fábrica',
            reparaciones: 'Ninguna',
          },
        },
        seguimiento: [
          {
            fecha: new Date(Date.now() - 3600000 * 6).toISOString(),
            texto: 'Completó la ficha técnica de su Ford Fiesta Titanium 2018 para permutar por la Corolla Cross Hybrid.',
            autor: 'Admin FG Autos',
          },
        ],
        companyId: company.id,
      }),
      intRepo.create({
        nombre: 'Diego Morales',
        telefono: '11 3398-1120',
        origen: 'salon',
        etapa: 'contactado',
        temperatura: 'tibio',
        unidadId: u4.id,
        busca: 'Primer auto hatchback hasta US$ 14.500.',
        busca_carroceria: 'hatchback',
        precio_max: 14500,
        precio_moneda: 'USD',
        proxima_accion: '2026-11-25',
        proxima_nota: 'Avisarle simulación de cuotas fijas por el Peugeot 208 Feline',
        vendedorId: adminUser.id,
        seguimiento: [
          {
            fecha: new Date(Date.now() - 3600000 * 12).toISOString(),
            texto: 'Pasó por el salón a ver el Peugeot 208 Feline 2018. Le enviamos propuesta comercial con anticipo de US$ 8.000 y 24 cuotas.',
            autor: 'Admin FG Autos',
          },
        ],
        companyId: company.id,
      }),
    ]);

    console.log('Datos de demostración sembrados: 4 unidades en stock, 3 interesados y 1 Orden de Venta (OV).');
  }

  // Sembrar repuestos del pañol y Órdenes de Alistaje/Taller si todavía no hay
  const cantRepuestos = await repRepo.count({ where: { companyId: company.id } });
  if (cantRepuestos === 0) {
    console.log('Sembrando Pañol de Repuestos Automotrices y Órdenes de Alistaje (OA)...');
    const repuestosGuardados = await repRepo.save([
      repRepo.create({
        codigo: 'SRV-VW-200TSI',
        nombre: 'Kit Service Aceite Shell Helix 5W40 Sintético + 3 Filtros (Aceite/Aire/Habitáculo)',
        categoria: 'filtros_fluidos',
        marca: 'Shell / Mann Filter',
        compatibilidad: 'VW Nivus / T-Cross / Polo / Virtus 200 TSI',
        ubicacion: 'Estante A-1',
        unidad_medida: 'kit',
        stock: 4,
        stock_minimo: 2,
        moneda: 'ARS',
        costo: 118000,
        proveedor: 'Distribuidora Warnes Originales',
        activo: true,
        companyId: company.id,
      }),
      repRepo.create({
        codigo: 'BAT-MOU-M24KD',
        nombre: 'Batería Moura 12x65Ah Reforzada Libre Mantenimiento',
        categoria: 'baterias_electricidad',
        marca: 'Moura',
        compatibilidad: 'Sedán / Hatchback / SUV medianos (Peugeot 208, Gol, Corolla)',
        ubicacion: 'Sector Baterías B-1',
        unidad_medida: 'un',
        stock: 1,
        stock_minimo: 2,
        moneda: 'ARS',
        costo: 145000,
        proveedor: 'Baterías Centro Moura Oficial',
        activo: true,
        companyId: company.id,
      }),
      repRepo.create({
        codigo: 'FRE-BOS-208',
        nombre: 'Juego Pastillas de Freno Delanteras Cerámicas',
        categoria: 'frenos_suspension',
        marca: 'Bosch',
        compatibilidad: 'Peugeot 208 / 2008 / Citroën C3 / C4 Cactus',
        ubicacion: 'Estante C-3',
        unidad_medida: 'jgo',
        stock: 3,
        stock_minimo: 2,
        moneda: 'ARS',
        costo: 58000,
        proveedor: 'Frenos del Norte',
        activo: true,
        companyId: company.id,
      }),
      repRepo.create({
        codigo: 'EST-3M-ACR',
        nombre: 'Kit Tratamiento Acrílico + Sellador Cerámico y Limpieza Tapizados',
        categoria: 'estetica_detailing',
        marca: '3M / Koch Chemie',
        compatibilidad: 'Universal Autos / SUV / Pick-ups',
        ubicacion: 'Armario Detailing D-1',
        unidad_medida: 'kit',
        stock: 6,
        stock_minimo: 2,
        moneda: 'ARS',
        costo: 42000,
        proveedor: 'Shiny Cars Insumos',
        activo: true,
        companyId: company.id,
      }),
      repRepo.create({
        codigo: 'SEG-KIT-VTV',
        nombre: 'Kit Seguridad Reglamentario VTV (Matafuegos 1kg ABC + Balizas + Botiquín)',
        categoria: 'accesorios_seguridad',
        marca: 'Georgia',
        compatibilidad: 'Universal Entrega de Unidades',
        ubicacion: 'Estante E-2',
        unidad_medida: 'kit',
        stock: 1,
        stock_minimo: 3,
        moneda: 'ARS',
        costo: 32000,
        proveedor: 'Accesorios Sur',
        activo: true,
        companyId: company.id,
      }),
    ]);

    const unidadesExistentes = await unidadRepo.find({ where: { companyId: company.id }, order: { numero: 'ASC' } });
    if (unidadesExistentes.length >= 2) {
      const uPeugeot = unidadesExistentes.find((u) => u.modelo.includes('208')) ?? unidadesExistentes[0];
      const uAmarok = unidadesExistentes.find((u) => u.modelo.includes('Amarok')) ?? unidadesExistentes[1];

      const cl1 = checklistInicial().map((item) => {
        if (['aceite_filtros', 'luces_instrumental', 'aire_multimedia', 'cristales_levantavidrios'].includes(item.clave)) {
          return { ...item, estado: 'ok' as const, observacion: 'Verificado OK' };
        }
        if (['frenos', 'bateria_carga'].includes(item.clave)) {
          return { ...item, estado: 'reparar' as const, observacion: 'Reemplazar en taller antes de entrega' };
        }
        return item;
      });

      const oa1 = await oaRepo.save(
        oaRepo.create({
          numero: 'OA-2026-0001',
          unidadId: uPeugeot.id,
          estado: 'en_trabajo',
          prioridad: 'alta',
          sector: 'Mecánica y distribución',
          responsable: 'Taller Mecánico Central (Matías)',
          falla_motivo: 'Revisión de ingreso por toma: batería con arranque lento y chillido en frenos delanteros al frenar.',
          diagnostico: 'Batería original agotada (38% de vida útil) y pastillas de freno delanteras al límite (2 mm).',
          trabajo_realizado: 'Se colocó batería Moura 65Ah nueva y juego de pastillas Bosch delanteras con rectificado de discos.',
          km_ingreso: uPeugeot.km,
          moneda: 'ARS',
          costo_mano_obra: 65000,
          tipo_cambio: 1150,
          checklist: cl1,
          fotos: [],
          bitacora: [
            {
              fecha: new Date(Date.now() - 86400000).toISOString(),
              texto: 'Orden de alistaje abierta (Mecánica y distribución) · asignada a Taller Mecánico Central (Matías).',
              autor: 'Admin FG Autos',
            },
            {
              fecha: new Date(Date.now() - 3600000 * 5).toISOString(),
              texto: 'Diagnóstico cargado y repuestos retirados del pañol (Batería Moura 65Ah + Pastillas Bosch).',
              autor: 'Admin FG Autos',
            },
          ],
          autorId: adminUser.id,
          companyId: company.id,
        }),
      );

      await oaRepRepo.save([
        oaRepRepo.create({
          ordenId: oa1.id,
          repuestoId: repuestosGuardados[1].id,
          codigo: repuestosGuardados[1].codigo,
          nombre: repuestosGuardados[1].nombre,
          cantidad: 1,
          moneda: 'ARS',
          costo_unitario: 145000,
        }),
        oaRepRepo.create({
          ordenId: oa1.id,
          repuestoId: repuestosGuardados[2].id,
          codigo: repuestosGuardados[2].codigo,
          nombre: repuestosGuardados[2].nombre,
          cantidad: 1,
          moneda: 'ARS',
          costo_unitario: 58000,
        }),
      ]);

      const cl2 = checklistInicial().map((item) => ({
        ...item,
        estado: 'ok' as const,
        observacion: 'Control pre-entrega aprobado',
      }));

      const oa2 = await oaRepo.save(
        oaRepo.create({
          numero: 'OA-2026-0002',
          unidadId: uAmarok.id,
          estado: 'control_calidad',
          prioridad: 'urgente_entrega',
          sector: 'Revisión pre-entrega (OV)',
          responsable: 'Sector Detailing & Pre-entrega',
          falla_motivo: 'Alistaje final pre-entrega para Orden de Venta OP-2026-0001 (Lucas Fernández): limpieza integral y kit VTV.',
          diagnostico: 'Vehículo en óptimo estado mecánico. Se agrega kit de seguridad reglamentario y abrillantado.',
          trabajo_realizado: 'Lavado premium de chasis y motor, tratamiento acrílico 3M y colocación de kit matafuegos/balizas.',
          km_ingreso: uAmarok.km,
          moneda: 'ARS',
          costo_mano_obra: 45000,
          tipo_cambio: 1150,
          checklist: cl2,
          fotos: [],
          bitacora: [
            {
              fecha: new Date(Date.now() - 3600000 * 10).toISOString(),
              texto: 'Orden pre-entrega abierta para unidad reservada U-0003 (Amarok V6).',
              autor: 'Admin FG Autos',
            },
            {
              fecha: new Date(Date.now() - 3600000 * 2).toISOString(),
              texto: 'Pasó a Control de Calidad (QA) con los 12 puntos aprobados.',
              autor: 'Admin FG Autos',
            },
          ],
          autorId: adminUser.id,
          companyId: company.id,
        }),
      );

      await oaRepRepo.save([
        oaRepRepo.create({
          ordenId: oa2.id,
          repuestoId: repuestosGuardados[3].id,
          codigo: repuestosGuardados[3].codigo,
          nombre: repuestosGuardados[3].nombre,
          cantidad: 1,
          moneda: 'ARS',
          costo_unitario: 42000,
        }),
        oaRepRepo.create({
          ordenId: oa2.id,
          repuestoId: repuestosGuardados[4].id,
          codigo: repuestosGuardados[4].codigo,
          nombre: repuestosGuardados[4].nombre,
          cantidad: 1,
          moneda: 'ARS',
          costo_unitario: 32000,
        }),
      ]);
    }
    console.log('5 repuestos en pañol y 2 Órdenes de Alistaje (OA-2026-0001 y OA-2026-0002) sembradas.');
  }

  console.log('Seeding de la agencia completado.');
  await app.close();
}

bootstrap();
