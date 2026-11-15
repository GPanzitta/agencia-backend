import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Raw, Repository } from 'typeorm';
import { LoginAuthDto } from './dto/login-auth.dto';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { Roles } from '../enums/roles.enum';
import type { CodigoError } from '../common/errores/codigos';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { tenantContext } from '../tenant/tenant.context';
import { SesionesService } from './sesiones.service';
import { AuditService } from '../audit/audit.service';
import { AccionAuditada } from '../audit/entities/audit-log.entity';
import { generarClaveProvisoria } from './clave.util';
import type { CambiarClaveDto } from './dto/cambiar-clave.dto';

/**
 * Un hash cualquiera para comparar cuando el correo no existe: así el login
 * tarda lo mismo exista o no el usuario, y el tiempo no delata qué correos
 * están dados de alta (SEG-11).
 */
const HASH_DE_RELLENO = '$2b$10$P8hZe4kh1LxIavtZdGtvS.suvZyxhmtYqA3NI6m0KPwbikgHCkWf2';

/** CLI-17: el correo se compara sin distinguir mayúsculas. */
export const mismoCorreo = (email: string) => Raw((col) => `LOWER(${col}) = LOWER(:email)`, { email });

/**
 * Mismo cuerpo para "ese email no existe" y para "la clave no es esa": decir
 * cuál de las dos falló le confirma a cualquiera qué usuarios están dados de
 * alta. El `code` es lo que el ERP traduce; el status sigue siendo 401.
 */
const CREDENCIALES_INVALIDAS = {
  code: 'CREDENCIALES_INVALIDAS' satisfies CodigoError,
  message: 'Usuario o contraseña incorrectos.',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly jwtService: JwtService,
    private readonly sesiones: SesionesService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async register(registerDto: RegisterAuthDto, creador: User) {
    const { email, nombre, password, telefono, rol } = registerDto;

    // Un admin solo da de alta gente en su propio local. El superadmin es
    // el único que puede no tener empresa asociada.
    if (!creador.companyId && creador.role?.nombre !== Roles.SUPERADMIN) {
      throw new BadRequestException(
        'El usuario que da el alta no tiene una empresa asignada',
      );
    }

    // Un admin no puede fabricar superadmins.
    if (rol === Roles.SUPERADMIN && creador.role?.nombre !== Roles.SUPERADMIN) {
      throw new ForbiddenException('No podés crear usuarios superadmin');
    }

    // `users.email` es único en toda la base, no por empresa: se busca sin el
    // filtro de empresa (CLI-24: un correo de otro taller pasaba este chequeo
    // y rebotaba en el índice con un 500) y sin distinguir mayúsculas (CLI-17).
    const existingUser = await tenantContext.exit(() =>
      this.userRepository.findOne({ where: { email: mismoCorreo(email) } }),
    );
    if (existingUser) {
      throw new ErrorDeNegocio('EMAIL_EN_USO', 'Ese correo ya está en uso por otro usuario.');
    }

    const role = await this.roleRepository.findOneBy({ nombre: rol });
    if (!role) {
      throw new BadRequestException(`El rol "${rol}" no existe`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    const user = this.userRepository.create({
      email,
      nombre,
      telefono,
      password: hashedPassword,
      role,
      companyId: creador.companyId,
      created_at: now,
      updated_at: now,
    });

    await this.userRepository.save(user);

    // No se devuelve token: el alta la hace un tercero, no la persona que se
    // está dando de alta. Antes se devolvía y era la vía de escalada.
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: role.nombre,
      companyId: user.companyId,
    };
  }

  async login(loginDto: LoginAuthDto) {
    const { email, password } = loginDto;

    // CLI-17: sin distinguir mayúsculas. Puede haber dos usuarios viejos que
    // sólo difieren en eso: primero el escrito tal cual, y entra aquel cuya
    // clave coincida.
    const candidatos = (await this.userRepository.find({ where: { email: mismoCorreo(email) } }))
      .sort((a, b) => Number(b.email === email) - Number(a.email === email));
    let user: User | undefined;
    for (const c of candidatos) {
      if (await bcrypt.compare(password, c.password!)) {
        user = c;
        break;
      }
    }
    if (!candidatos.length) await bcrypt.compare(password, HASH_DE_RELLENO);
    if (!user) {
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    // Después de la clave, igual que la baja: la cuenta del alta pública no entra
    // hasta confirmar el correo (spec 2026-10-28 §6).
    if (user.confirmacion_pendiente) {
      throw new UnauthorizedException({
        code: 'CUENTA_SIN_CONFIRMAR' satisfies CodigoError,
        message: 'Todavía no confirmaste tu correo. Revisá tu casilla o pedí que te lo mandemos de nuevo.',
      });
    }

    // CLI-04: después de la clave (no se le dice a cualquiera que la cuenta
    // existe). Antes entraba con «Bienvenido» y quedaba en un bucle de
    // «Tu sesión venció» sin enterarse nunca de que estaba dado de baja.
    if (!user.activo) {
      throw new UnauthorizedException({
        code: 'USUARIO_DADO_DE_BAJA' satisfies CodigoError,
        message: 'Tu usuario está dado de baja. Hablá con el encargado.',
      });
    }

    // `role` es eager en la entidad, así que ya viene cargado.
    if (!user.role) {
      throw new UnauthorizedException(
        'El usuario no tiene un rol asignado. Habla con un administrador.',
      );
    }

    return {
      ...this.perfil(user),
      token: this.getJwtToken({ id: user.id, companyId: user.companyId, tokenVersion: user.tokenVersion }),
    };
  }

  /**
   * Datos del usuario logueado.
   *
   * El ERP no tenía forma de saber el rol de quien entró: la respuesta del
   * login solo traía id, email y companyId, así que la interfaz no podía
   * adaptarse al perfil y el guard de rutas se limitaba a mirar si existía un
   * token en localStorage —sin validar siquiera que no estuviera vencido—.
   */
  me(user: User) {
    return this.perfil(user);
  }

  /** Empleados del local de quien consulta. El filtro por empresa lo aplica el parche de tenant. */
  async listarUsuarios() {
    const usuarios = await this.userRepository.find({
      order: { nombre: 'ASC' },
    });
    return usuarios.map((u) => ({
      ...this.perfil(u),
      telefono: u.telefono,
      activo: u.activo,
      created_at: u.created_at,
    }));
  }

  /**
   * Da de alta o de baja a un empleado.
   *
   * Es baja lógica, no borrado: las ventas, los movimientos de caja y el log de
   * auditoría apuntan a este usuario, y borrarlo dejaría el historial sin autor.
   * `JwtStrategy` verifica `activo` en cada request, así que la baja corta el
   * acceso en el momento aunque la persona tenga un token todavía vigente.
   */
  async cambiarEstadoUsuario(id: string, activo: boolean, quienPide: User) {
    if (id === quienPide.id) {
      throw new BadRequestException('No podés desactivar tu propio usuario');
    }

    const usuario = await this.userRepository.findOne({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    if (
      usuario.role?.nombre === Roles.SUPERADMIN &&
      quienPide.role?.nombre !== Roles.SUPERADMIN
    ) {
      throw new ForbiddenException('No podés modificar usuarios superadmin');
    }

    usuario.activo = activo;
    usuario.updated_at = new Date();
    // Si se está desactivando, cualquier token que ya tenga emitido deja de
    // servir en el momento: sin esto, JwtStrategy corta por `activo`, pero
    // solo porque ya recarga el usuario en cada request. Bumpear la versión
    // acá es la misma protección sin depender de ese detalle.
    if (!activo) usuario.tokenVersion += 1;
    await this.userRepository.save(usuario);
    // CLI-05: el socket abierto también se corta, no sólo el HTTP.
    if (!activo) this.sesiones.revocar(usuario.id);
    return this.perfil(usuario);
  }

  /**
   * Cambia el rol de un empleado.
   *
   * No existía: el rol quedaba fijado en el alta para siempre, y un empleado
   * cargado con el rol equivocado no tenía arreglo desde el sistema.
   *
   * Cambiar el rol cambia los permisos, así que revoca las sesiones vigentes
   * (`tokenVersion`): el próximo request del usuario le pide loguearse de
   * nuevo y el token nuevo trae los permisos nuevos. Sin esto, alguien
   * degradado de admin a tecnico seguiría operando como admin hasta que
   * su token venciera.
   */
  async cambiarRolUsuario(id: string, rol: string, quienPide: User) {
    // Cambiarse el rol a uno mismo es la forma más corta de escalar permisos.
    if (id === quienPide.id) {
      throw new BadRequestException('No podés cambiar tu propio rol');
    }

    const usuario = await this.userRepository.findOne({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // Mismas reglas que el alta: superadmin solo lo toca otro superadmin,
    // en ninguna de las dos direcciones (ni quitarlo ni otorgarlo).
    const esSuper = (r?: string) => r === Roles.SUPERADMIN;
    if (
      (esSuper(usuario.role?.nombre) || esSuper(rol)) &&
      !esSuper(quienPide.role?.nombre)
    ) {
      throw new ForbiddenException('No podés asignar ni quitar el rol superadmin');
    }

    const role = await this.roleRepository.findOneBy({ nombre: rol });
    if (!role) throw new BadRequestException(`El rol "${rol}" no existe`);
    if (usuario.role?.id === role.id) return this.perfil(usuario);

    usuario.role = role;
    usuario.updated_at = new Date();
    usuario.tokenVersion += 1;
    await this.userRepository.save(usuario);
    this.sesiones.revocar(usuario.id);
    return this.perfil(usuario);
  }

  /**
   * POST /auth/cambiar-clave (SEG-54): el empleado cambia SU clave. Pide la
   * actual (con una sesión abierta en una máquina compartida no alcanza para
   * cambiarla), apaga `debe_cambiar_clave` y cierra TODAS las sesiones de la
   * cuenta (`tokenVersion` + el socket). El que la cambió recibe un token
   * nuevo para no tener que volver a entrar; los demás equipos, no.
   */
  async cambiarClave(quien: User, dto: CambiarClaveDto, ip?: string) {
    const usuario = await this.userRepository.findOne({ where: { id: quien.id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (!(await bcrypt.compare(dto.actual, usuario.password!))) {
      throw new ErrorDeNegocio('CLAVE_ACTUAL_INCORRECTA', 'La clave actual no es esa.');
    }
    if (dto.nueva === dto.actual) {
      throw new ErrorDeNegocio('CLAVE_REPETIDA', 'La clave nueva tiene que ser distinta de la actual.');
    }
    const eraProvisoria = usuario.debe_cambiar_clave === true;
    usuario.password = await bcrypt.hash(dto.nueva, 10);
    usuario.debe_cambiar_clave = false;
    usuario.tokenVersion += 1;
    usuario.updated_at = new Date();
    await this.userRepository.save(usuario);
    this.sesiones.revocar(usuario.id);
    await this.auditarClave(AccionAuditada.CLAVE_CAMBIADA, usuario, usuario, { era_provisoria: eraProvisoria }, ip);
    return {
      ...this.perfil(usuario),
      token: this.getJwtToken({ id: usuario.id, companyId: usuario.companyId, tokenVersion: usuario.tokenVersion }),
    };
  }

  /**
   * POST /auth/usuarios/:id/resetear-clave (SEG-54): el admin le pone una
   * clave provisoria a un empleado de SU taller (el parche de tenant filtra
   * la búsqueda, y además se coteja la empresa). La provisoria vuelve UNA vez
   * en esta respuesta y no se guarda en ningún otro lado; el empleado la
   * tiene que cambiar al entrar. Cierra todas sus sesiones.
   *
   * No sirve para la propia cuenta (para eso está «Cambiar mi clave», que
   * pide la actual) ni para un superadmin, salvo que lo pida otro superadmin.
   */
  async resetearClave(id: string, quienPide: User, ip?: string) {
    if (id === quienPide.id) {
      throw new BadRequestException('Para tu propia clave usá «Cambiar mi clave».');
    }
    const usuario = await this.userRepository.findOne({ where: { id } });
    const esSuperPide = quienPide.role?.nombre === Roles.SUPERADMIN;
    if (!usuario || (!esSuperPide && usuario.companyId !== quienPide.companyId)) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (usuario.role?.nombre === Roles.SUPERADMIN && !esSuperPide) {
      throw new ForbiddenException('No podés modificar usuarios superadmin');
    }
    const provisoria = generarClaveProvisoria();
    usuario.password = await bcrypt.hash(provisoria, 10);
    usuario.debe_cambiar_clave = true;
    usuario.tokenVersion += 1;
    usuario.updated_at = new Date();
    await this.userRepository.save(usuario);
    this.sesiones.revocar(usuario.id);
    await this.auditarClave(AccionAuditada.CLAVE_RESETEADA, quienPide, usuario, {}, ip);
    return { ...this.perfil(usuario), clave_provisoria: provisoria };
  }

  /**
   * SEG-54: queda en `audit_logs` quién cambió o reseteó la clave de quién.
   * NUNCA la clave (ni la vieja, ni la nueva, ni la provisoria). Si no se
   * puede grabar (la migración del enum todavía no corrió) se anota en el log
   * y el cambio sigue: dejar a alguien sin poder cambiar su clave por la
   * auditoría sería peor.
   */
  private async auditarClave(
    accion: AccionAuditada,
    autor: User,
    cuenta: User,
    detalle: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    if (!this.audit) return;
    try {
      await this.audit.registrar({
        accion,
        usuario_id: autor.id,
        usuario_email: autor.email,
        usuario_rol: autor.role?.nombre ?? undefined,
        entidad: 'user',
        entidad_id: cuenta.id,
        detalle: { ...detalle, cuenta_email: cuenta.email, sesiones_cerradas: true },
        ip: ip?.slice(0, 45),
        companyId: cuenta.companyId || undefined,
      });
    } catch (e) {
      this.logger.error(`No se pudo grabar la auditoría ${accion} del usuario ${cuenta.id}: ${(e as Error).message}`);
    }
  }

  /** Proyección del usuario para el cliente. Nunca incluye el hash. */
  private perfil(user: User) {
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.role?.nombre ?? null,
      companyId: user.companyId,
      // SEG-54: el ERP manda a la pantalla de cambio antes que a cualquier otra.
      debe_cambiar_clave: user.debe_cambiar_clave === true,
    };
  }

  private getJwtToken(payload: { id: string; companyId?: string; tokenVersion: number }) {
    return this.jwtService.sign(payload);
  }

  /**
   * Cierra la sesión de verdad: incrementa `token_version`, así que todos los
   * tokens firmados antes de este momento dejan de servir, aunque no hayan
   * expirado. No hay forma de revocar un solo token sin lista negra, así que
   * esto invalida todas las sesiones abiertas del usuario a la vez —correcto
   * para 'cerrar sesión en todos lados' y para el caso que realmente importa,
   * que alguien haga logout desde un dispositivo que perdió o le robaron.
   */
  async logout(userId: string): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
    this.sesiones.revocar(userId);
  }
}
