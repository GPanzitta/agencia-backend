import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Roles } from '../enums/roles.enum';
import { Role } from '../roles/entities/role.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/entities/payment-method.entity';
import { tenantContext } from '../tenant/tenant.context';
import { CrearTallerDto } from './dto/crear-taller.dto';
import { emailDelAdmin } from './alta-taller.util';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { Wallet, WalletType } from '../wallets/entities/wallet.entity';

const BILLETERAS_INICIALES: Array<[string, WalletType]> = [
  ['Efectivo', WalletType.CASH],
  ['Mercado Pago', WalletType.DIGITAL],
];

const MEDIOS_DE_PAGO_INICIALES: Array<[string, PaymentMethodType]> = [
  ['Efectivo', PaymentMethodType.CASH],
  ['Mercado Pago / QR', PaymentMethodType.DIGITAL],
  ['Tarjeta de Débito', PaymentMethodType.DIGITAL],
  ['Tarjeta de Crédito', PaymentMethodType.DIGITAL],
  ['Transferencia', PaymentMethodType.DIGITAL],
  ['Cuenta Corriente', PaymentMethodType.DIGITAL],
];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Company) private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Alta de una agencia nueva con su admin, sus medios de pago y sus billeteras.
   *
   * CLI-01 (auditoría 13/10/2026): el superadmin de la plataforma TIENE
   * empresa (la del primer taller), así que su request corre con el contexto
   * de esa empresa y el parche de tenant pisaba `companyId` en todo lo que se
   * guardaba: el admin y los medios de pago del taller nuevo caían en el
   * taller del superadmin y el
   * alta terminaba en 500 con la empresa creada y vacía.
   *
   * Ahora:
   * - todo va en una transacción: si algo falla no queda una empresa a medias;
   * - lo global (nombre de empresa y correo, únicos en toda la base) se mira
   *   SIN contexto de empresa (`tenantContext.exit`);
   * - lo del taller nuevo se crea CON su contexto (`tenantContext.run`), así el
   *   parche completa la empresa nueva y no la del superadmin.
   */
  createCompanyWithUsers(data: CrearTallerDto) {
    const nombre = data.companyName.trim();
    return tenantContext.exit(() =>
      this.dataSource.transaction(async (em) => {
        const existente = await em.findOneBy(Company, { name: nombre });
        if (existente) throw new BadRequestException('Ya existe un taller con ese nombre.');

        const email = emailDelAdmin(nombre);
        // `users.email` es único en toda la base, no por empresa: se mira sin
        // filtro de empresa, o un correo de otro taller pasaba y rebotaba en
        // el índice con un error crudo.
        if (await em.findOneBy(User, { email })) {
          throw new BadRequestException(
            `Ya existe un usuario con el mail "${email}". Cambiá el nombre del taller o creá el admin a mano.`,
          );
        }

        let adminRole = await em.findOneBy(Role, { nombre: Roles.ADMIN });
        if (!adminRole) adminRole = await em.save(Role, em.create(Role, { nombre: Roles.ADMIN }));

        const company = await em.save(Company, em.create(Company, { name: nombre, domain: data.domain }));

        // Clave aleatoria por taller, devuelta UNA sola vez en la respuesta.
        //
        // Antes todos los talleres nacían con la misma clave fija ('user123456') y
        // un mail derivable del nombre. El endpoint es de superadmin, así que no
        // era explotable desde afuera, pero era una credencial por defecto
        // permanente que nada obligaba a cambiar.
        const claveInicial = randomBytes(9).toString('base64url');
        const admin = await tenantContext.run(company.id, () =>
          this.sembrarTaller(em, company, adminRole!, {
            email,
            nombreAdmin: 'Admin ' + company.name,
            claveHash: bcrypt.hash(claveInicial, 10),
            confirmacionPendiente: false,
          }),
        );
        return {
          message: 'Company and initial users created successfully',
          company,
          users: [{ email: admin.email, role: adminRole.nombre }],
          // Única vez que esta clave viaja en claro: no se guarda en ningún lado
          // más que hasheada. Quien da de alta el taller se la pasa al dueño, y el
          // dueño la cambia.
          clave_inicial: claveInicial,
        };
      }),
    );
  }

  /**
   * El alta pública (spec 2026-10-28 §6): la misma siembra, con el correo y la
   * clave que eligió el dueño, y sin poder entrar hasta confirmar. Corre sin
   * contexto de empresa: lo del taller se crea con el suyo, igual que arriba.
   */
  /** Se registró otra vez sin haber confirmado: vale lo de esta vez. Sólo sobre una cuenta todavía pendiente. */
  actualizarTallerPendiente(userId: string, companyId: string, datos: {
    taller: string; nombre: string; telefono: string; claveHash: string; rubros: string[];
  }): Promise<void> {
    return tenantContext.exit(() =>
      this.dataSource.transaction(async (em) => {
        const mismoNombre = await em.findOneBy(Company, { name: datos.taller });
        if (mismoNombre && mismoNombre.id !== companyId) {
          throw new ErrorDeNegocio('TALLER_YA_EXISTE', 'Ya hay un taller con ese nombre: agregale la ciudad o el barrio.');
        }
        await em.update(Company, { id: companyId }, { name: datos.taller, telefono: datos.telefono, rubros_declarados: datos.rubros });
        await em.update(User, { id: userId, confirmacion_pendiente: true }, { nombre: datos.nombre, password: datos.claveHash });
      }),
    );
  }

  crearTallerPublico(datos: {
    taller: string; nombre: string; email: string; telefono: string; claveHash: string; rubros: string[];
  }): Promise<{ userId: string; companyId: string }> {
    return tenantContext.exit(() =>
      this.dataSource.transaction(async (em) => {
        if (await em.findOneBy(Company, { name: datos.taller })) {
          throw new ErrorDeNegocio('TALLER_YA_EXISTE', 'Ya hay un taller con ese nombre: agregale la ciudad o el barrio.');
        }
        let adminRole = await em.findOneBy(Role, { nombre: Roles.ADMIN });
        if (!adminRole) adminRole = await em.save(Role, em.create(Role, { nombre: Roles.ADMIN }));
        const company = await em.save(
          Company,
          em.create(Company, { name: datos.taller, telefono: datos.telefono, rubros_declarados: datos.rubros }),
        );
        const admin = await tenantContext.run(company.id, () =>
          this.sembrarTaller(em, company, adminRole!, {
            email: datos.email,
            nombreAdmin: datos.nombre,
            claveHash: datos.claveHash,
            confirmacionPendiente: true,
          }),
        );
        return { userId: admin.id, companyId: company.id };
      }),
    );
  }

  /** Lo del taller nuevo, ya con su contexto de empresa. */
  private async sembrarTaller(
    em: EntityManager,
    company: Company,
    adminRole: Role,
    cuenta: { email: string; nombreAdmin: string; claveHash: string | Promise<string>; confirmacionPendiente: boolean },
  ): Promise<User> {
    const now = new Date();
    const admin = await em.save(
      User,
      em.create(User, {
        nombre: cuenta.nombreAdmin,
        email: cuenta.email,
        password: await cuenta.claveHash,
        role: adminRole,
        companyId: company.id,
        activo: true,
        confirmacion_pendiente: cuenta.confirmacionPendiente,
        created_at: now,
        updated_at: now,
      }),
    );

    await em.save(
      PaymentMethod,
      MEDIOS_DE_PAGO_INICIALES.map(([name, type]) =>
        em.create(PaymentMethod, { name, type, isSystem: true, company }),
      ),
    );

    // Sin esto no hay dónde asentar un cobro: abrir la caja o cobrar una seña
    // chocaba con «no hay billeteras» en el primer día del taller.
    await em.save(
      Wallet,
      BILLETERAS_INICIALES.map(([name, type]) => em.create(Wallet, { name, type, companyId: company.id })),
    );

    return admin;
  }

  async getCompanies() {
    return this.companyRepository.find({
      order: { created_at: 'DESC' }
    });
  }
}
