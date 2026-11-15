import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AccionAuditada } from '../audit/entities/audit-log.entity';
import { mismoCorreo } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { SesionesService } from '../auth/sesiones.service';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { MailerService } from '../correo/mailer.service';
import { tenantContext } from '../tenant/tenant.context';
import { firmarRecuperacion, huellaDeClave, leerRecuperacion } from './token-confirmacion.util';

const PRODUCTO = 'FG services';

/**
 * «Me olvidé la clave», sin nadie que la resetee: en un taller que se dio de alta
 * solo, el dueño es el único admin. Público y sin contexto de empresa.
 */
@Injectable()
export class RecuperarClaveService {
  private readonly logger = new Logger(RecuperarClaveService.name);

  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    private readonly mailer: MailerService,
    private readonly sesiones: SesionesService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private get secreto(): string { return process.env.JWT_SECRET as string; }

  /** Contesta siempre igual y sin esperar al correo: ni el texto ni la demora dicen qué cuentas existen. */
  async pedir(email: string): Promise<{ enviado: true }> {
    const limpio = email.trim().toLowerCase();
    const usuario = await tenantContext.exit(() => this.usuarios.findOne({ where: { email: mismoCorreo(limpio) } }));
    if (usuario?.activo && !usuario.confirmacion_pendiente) void this.enviar(usuario, limpio);
    return { enviado: true };
  }

  async cambiar(token: string, clave: string): Promise<{ cambiada: true }> {
    const invalido = () => new ErrorDeNegocio('RECUPERACION_INVALIDA', 'El link no es válido o venció. Pedí otro.');
    const datos = leerRecuperacion(token, this.secreto);
    if (!datos) throw invalido();
    const usuario = await tenantContext.exit(() => this.usuarios.findOne({ where: { id: datos.userId } }));
    // La huella es de la clave de cuando se pidió: cambiada la clave, el link ya no vale.
    if (!usuario?.activo || huellaDeClave(usuario.password) !== datos.huella) throw invalido();
    const claveHash = await bcrypt.hash(clave, 10);
    await tenantContext.exit(() => this.usuarios.update({ id: usuario.id }, {
      password: claveHash,
      debe_cambiar_clave: false,
      tokenVersion: usuario.tokenVersion + 1,
      updated_at: new Date(),
    }));
    this.sesiones.revocar(usuario.id);
    await this.auditar(usuario);
    return { cambiada: true };
  }

  private async enviar(usuario: User, email: string): Promise<void> {
    const erp = process.env.ERP_URL || 'http://localhost:4400';
    const link = `${erp}/auth/nueva-clave?token=${encodeURIComponent(firmarRecuperacion(usuario.id, usuario.password, this.secreto))}`;
    try {
      await this.mailer.enviar({
        para: email,
        asunto: `Cambiá tu clave de ${PRODUCTO}`,
        texto: `Para elegir una clave nueva de ${PRODUCTO}, entrá acá: ${link}\n\nEl link vale una hora. Si no lo pediste, ignorá este correo: tu clave sigue igual.`,
        html: `<p>Para elegir una clave nueva de ${PRODUCTO}:</p><p><a href="${link}">Cambiar mi clave</a></p><p>El link vale una hora. Si no lo pediste, ignorá este correo: tu clave sigue igual.</p>`,
        remitente: { nombre: PRODUCTO },
      });
    } catch (e) {
      this.logger.error(`No se pudo mandar la recuperación a ${email}: ${(e as Error).message}`);
    }
  }

  private async auditar(usuario: User): Promise<void> {
    try {
      await this.audit?.registrar({
        accion: AccionAuditada.CLAVE_CAMBIADA,
        usuario_id: usuario.id,
        usuario_email: usuario.email,
        entidad: 'user',
        entidad_id: usuario.id,
        detalle: { por_correo: true, cuenta_email: usuario.email, sesiones_cerradas: true },
        companyId: usuario.companyId || undefined,
      });
    } catch (e) {
      this.logger.error(`No se pudo grabar la auditoría de la clave de ${usuario.id}: ${(e as Error).message}`);
    }
  }
}
