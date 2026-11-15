import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { mismoCorreo } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { registrarDescarte } from '../common/trampa-bots.util';
import { MailerService } from '../correo/mailer.service';
import { tenantContext } from '../tenant/tenant.context';
import { firmarConfirmacion, huellaDeClave, leerConfirmacion } from './token-confirmacion.util';
import { RegistrarTallerDto } from './alta-taller.dto';

const PRODUCTO = 'FG services';

/**
 * Un taller se da de alta solo (spec 2026-10-28 §6). Público: corre sin
 * contexto de empresa, y el correo es único en toda la base. La cuenta nace sin
 * poder entrar hasta confirmar el correo.
 */
@Injectable()
export class AltaTallerService {
  private readonly logger = new Logger(AltaTallerService.name);

  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    private readonly admin: AdminService,
    private readonly mailer: MailerService,
  ) {}

  private get secreto(): string { return process.env.JWT_SECRET as string; }

  async registrar(dto: RegistrarTallerDto): Promise<{ enviado: boolean }> {
    const email = dto.email.trim().toLowerCase();
    if (dto.sitio_web?.trim()) {
      registrarDescarte('alta_taller', null, { email, taller: dto.taller });
      return { enviado: true };
    }
    // Antes de crear: sin correo, nadie podría confirmar y entrar a ese taller.
    if (!this.mailer.configurado()) {
      throw new ErrorDeNegocio('CORREO_NO_CONFIGURADO', 'Ahora no podemos mandar correos. Probá de nuevo en un rato.');
    }
    const existente = await this.buscar(email);
    if (existente && !existente.confirmacion_pendiente) {
      throw new ErrorDeNegocio('CORREO_YA_REGISTRADO', 'Ya hay una cuenta con ese correo. Probá entrar o pedí recuperar la clave.');
    }
    // Se registró antes y no confirmó: otro correo, sin crear otro taller.
    // Vale lo de esta vez: si no, confirmaría una clave que ya no recuerda.
    if (existente) {
      const claveHash = await bcrypt.hash(dto.clave, 10);
      await this.admin.actualizarTallerPendiente(existente.id, existente.companyId as string, {
        taller: dto.taller.trim(), nombre: dto.nombre.trim(), telefono: dto.telefono.trim(), claveHash, rubros: dto.rubros ?? [],
      });
      return { enviado: await this.enviarConfirmacion(existente.id, email, claveHash) };
    }

    const claveHash = await bcrypt.hash(dto.clave, 10);
    const { userId } = await this.admin.crearTallerPublico({
      taller: dto.taller.trim(),
      nombre: dto.nombre.trim(),
      email,
      telefono: dto.telefono.trim(),
      claveHash,
      rubros: dto.rubros ?? [],
    });
    return { enviado: await this.enviarConfirmacion(userId, email, claveHash) };
  }

  async confirmar(token: string): Promise<{ confirmada: true }> {
    const invalida = () => new ErrorDeNegocio('CONFIRMACION_INVALIDA', 'El link no es válido o venció. Pedí que te mandemos otro.');
    const datos = leerConfirmacion(token, this.secreto);
    if (!datos) throw invalida();
    const usuario = await tenantContext.exit(() => this.usuarios.findOne({ where: { id: datos.userId } }));
    if (!usuario) throw invalida();
    if (usuario.confirmacion_pendiente) {
      // Se registró de nuevo después de este link: no activa una clave que ya no es.
      if (huellaDeClave(usuario.password) !== datos.huella) throw invalida();
      await tenantContext.exit(() => this.usuarios.update({ id: usuario.id }, { confirmacion_pendiente: false }));
    }
    return { confirmada: true };
  }

  /** Responde siempre igual: no se revela qué correos tienen cuenta. */
  async reenviar(email: string): Promise<{ enviado: true }> {
    const limpio = email.trim().toLowerCase();
    const usuario = await this.buscar(limpio);
    if (usuario?.confirmacion_pendiente) await this.enviarConfirmacion(usuario.id, limpio, usuario.password);
    return { enviado: true };
  }

  private buscar(email: string): Promise<User | null> {
    return tenantContext.exit(() => this.usuarios.findOne({ where: { email: mismoCorreo(email) } }));
  }

  /** El taller ya existe: si el correo falla, se puede reenviar. `false` lo dice en pantalla. */
  private async enviarConfirmacion(userId: string, email: string, claveHash: string | null | undefined): Promise<boolean> {
    const erp = process.env.ERP_URL || 'http://localhost:4400';
    const link = `${erp}/auth/confirmar?token=${encodeURIComponent(firmarConfirmacion(userId, claveHash, this.secreto))}`;
    try {
      await this.mailer.enviar({
        para: email,
        asunto: `Confirmá tu cuenta de ${PRODUCTO}`,
        texto: `Para empezar a usar ${PRODUCTO}, confirmá tu cuenta entrando acá: ${link}\n\nEl link vale 48 horas. Si no fuiste vos, ignorá este correo.`,
        html: `<p>Para empezar a usar ${PRODUCTO}, confirmá tu cuenta:</p><p><a href="${link}">Confirmar mi cuenta</a></p><p>El link vale 48 horas. Si no fuiste vos, ignorá este correo.</p>`,
        remitente: { nombre: PRODUCTO },
      });
      return true;
    } catch (e) {
      this.logger.error(`No se pudo mandar la confirmación a ${email}: ${(e as Error).message}`);
      return false;
    }
  }
}
