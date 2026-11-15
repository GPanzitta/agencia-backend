import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { urlPublicaDelPortal } from '../common/urls.util';
import { Company } from '../companies/entities/company.entity';
import { MailerService } from '../correo/mailer.service';
import { Interesado } from '../interesados/interesado.entity';
import { Operacion } from '../unidades/entities/operacion.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { cuenta } from '../unidades/operaciones.util';
import { correoDeAgencia } from './correo-html.util';
import { CrearPlantillaDto, DestinoDto, EditarPlantillaDto, EnviarCorreoDto, RegistrarWhatsappDto } from './dto/mensajes.dtos';
import { MensajeEnviado } from './entities/mensaje-enviado.entity';
import { MensajePlantilla } from './entities/mensaje-plantilla.entity';
import {
  AYUDA_DE_VARIABLE, CanalPlantilla, ContextoPlantilla, CONTEXTOS, DatosPlantilla, VARIABLES_POR_CONTEXTO,
  datosDeInteresado, datosDeOperacion, normalizarTelefono, renderizarPlantilla, sitioDeAgencia, variablesDesconocidas,
} from './plantilla.util';
import { PLANTILLAS_DE_FABRICA } from './plantillas-agencia';

export interface PlantillaLista { id: string; nombre: string; asunto: string | null; texto: string }
export interface MensajesPara {
  nombre: string;
  /** Listo para wa.me; null si no tiene un teléfono que sirva. */
  whatsapp: string | null;
  telefono: string | null;
  email: string | null;
  plantillas: Record<CanalPlantilla, PlantillaLista[]>;
  correo: { configurado: boolean; remitente: string | null; pruebas: boolean };
}

const MAXIMO_PROPIAS = 40;

/** Mensajes al cliente por WhatsApp y por correo, con plantillas que cada agencia reescribe (14/11/2026). */
@Injectable()
export class MensajesService {
  constructor(private readonly dataSource: DataSource, private readonly mailer: MailerService) {}

  /** Cada agencia arranca con los mensajes de fábrica; los que falten se crean al entrar. */
  private async asegurar(companyId: string): Promise<void> {
    const em = this.dataSource.manager;
    const existentes = await em.find(MensajePlantilla, { where: { companyId }, select: { clave: true } });
    const claves = new Set(existentes.map((p) => p.clave).filter(Boolean));
    const faltan = PLANTILLAS_DE_FABRICA.filter((p) => !claves.has(p.clave));
    if (!faltan.length) return;
    await em.createQueryBuilder().insert().into(MensajePlantilla).values(faltan.map((p) => ({
      companyId, clave: p.clave, nombre: p.nombre, texto: p.texto, contexto: p.contexto, canal: p.canal, asunto: p.asunto ?? null,
      activa: true, orden_visual: PLANTILLAS_DE_FABRICA.indexOf(p), adjuntos_sugeridos: [],
    }))).orIgnore().execute();
  }

  private propias(companyId: string) {
    return this.dataSource.manager.find(MensajePlantilla, { where: CONTEXTOS.map((contexto) => ({ companyId, contexto })), order: { orden_visual: 'ASC', created_at: 'ASC' } });
  }

  async listar(user: User) {
    await this.asegurar(user.companyId);
    return { plantillas: await this.propias(user.companyId), variables: VARIABLES_POR_CONTEXTO, ayuda: AYUDA_DE_VARIABLE, correo: this.mailer.estado() };
  }

  private exigirVariables(texto: string, asunto: string | null | undefined, contexto: ContextoPlantilla): void {
    const malas = variablesDesconocidas(`${texto}\n${asunto ?? ''}`, contexto);
    if (malas.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', `Este mensaje no puede usar ${malas.map((v) => `{${v}}`).join(', ')}: revisá las variables disponibles.`);
  }

  async crear(dto: CrearPlantillaDto, user: User): Promise<MensajePlantilla> {
    const em = this.dataSource.manager;
    this.exigirVariables(dto.texto, dto.asunto, dto.contexto);
    if (dto.canal === 'email' && !dto.asunto?.trim()) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Un correo necesita asunto.');
    const cuantas = await em.count(MensajePlantilla, { where: { companyId: user.companyId } });
    if (cuantas >= PLANTILLAS_DE_FABRICA.length + MAXIMO_PROPIAS) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Hay demasiados mensajes: borrá alguno que no uses.');
    return em.save(MensajePlantilla, em.create(MensajePlantilla, {
      companyId: user.companyId, clave: null, nombre: dto.nombre.trim(), texto: dto.texto, contexto: dto.contexto, canal: dto.canal,
      asunto: dto.canal === 'email' ? dto.asunto?.trim() ?? null : null, activa: true, orden_visual: 500, adjuntos_sugeridos: [],
    }));
  }

  private async existente(id: string, user: User): Promise<MensajePlantilla> {
    const p = await this.dataSource.manager.findOne(MensajePlantilla, { where: { id, companyId: user.companyId } });
    if (!p) throw new NotFoundException('Ese mensaje ya no existe.');
    return p;
  }

  async editar(id: string, dto: EditarPlantillaDto, user: User): Promise<MensajePlantilla> {
    const p = await this.existente(id, user);
    const texto = dto.texto ?? p.texto;
    const asunto = dto.asunto !== undefined ? dto.asunto.trim() : p.asunto;
    this.exigirVariables(texto, asunto, p.contexto);
    if (p.canal === 'email' && !asunto) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Un correo necesita asunto.');
    await this.dataSource.manager.update(MensajePlantilla, { id: p.id }, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}), texto, asunto: p.canal === 'email' ? asunto : null,
      ...(dto.activa !== undefined ? { activa: dto.activa } : {}), ...(dto.orden_visual !== undefined ? { orden_visual: dto.orden_visual } : {}),
    });
    return this.existente(id, user);
  }

  /** Un mensaje de fábrica vuelve a su texto original. */
  async restaurar(id: string, user: User): Promise<MensajePlantilla> {
    const p = await this.existente(id, user);
    const original = PLANTILLAS_DE_FABRICA.find((x) => x.clave === p.clave);
    if (!original) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Este mensaje lo creaste vos: no tiene un original al que volver.');
    await this.dataSource.manager.update(MensajePlantilla, { id: p.id }, { nombre: original.nombre, texto: original.texto, asunto: original.asunto ?? null });
    return this.existente(id, user);
  }

  async borrar(id: string, user: User): Promise<{ ok: true }> {
    const p = await this.existente(id, user);
    if (p.clave) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Los mensajes que trae el sistema no se borran: podés reescribirlos o apagarlos.');
    await this.dataSource.manager.delete(MensajePlantilla, { id: p.id });
    return { ok: true };
  }

  /** Los datos de la persona y los valores de cada variable para ese interesado u operación. */
  private async destino(d: DestinoDto, user: User): Promise<{ nombre: string; telefono: string | null; email: string | null; datos: DatosPlantilla; interesado: Interesado | null; operacion: Operacion | null; agencia: Company | null }> {
    const em = this.dataSource.manager;
    const agencia = await em.findOne(Company, { where: { id: user.companyId } });
    const portal = urlPublicaDelPortal();
    const vendedorDe = async (id: string | null | undefined) => (id ? (await em.findOne(User, { where: { id }, select: { id: true, nombre: true } }))?.nombre ?? null : null);
    if (d.contexto === 'interesado') {
      const i = await em.findOne(Interesado, { where: { id: d.id, companyId: user.companyId } });
      if (!i) throw new NotFoundException('Ese interesado ya no existe.');
      const auto = i.unidadId ? await em.findOne(Unidad, { where: { id: i.unidadId, companyId: user.companyId } }) : null;
      const vendedor = (await vendedorDe(i.vendedorId)) ?? user.nombre;
      return { nombre: i.nombre, telefono: i.telefono, email: i.email, interesado: i, operacion: null, agencia, datos: datosDeInteresado(i, auto, vendedor, agencia, portal) };
    }
    const o = await em.findOne(Operacion, { where: { id: d.id, companyId: user.companyId }, relations: { pagos: true } });
    if (!o) throw new NotFoundException('Esa operación ya no existe.');
    const auto = await em.findOne(Unidad, { where: { id: o.unidadId, companyId: user.companyId } });
    const vendedor = (await vendedorDe(o.vendedorId)) ?? user.nombre;
    const pagado = cuenta(o.precio, o.moneda, (o.pagos ?? []) as never).pagado;
    return {
      nombre: o.cliente_nombre, telefono: o.cliente_telefono, email: null, interesado: null, operacion: o, agencia,
      datos: datosDeOperacion({ numero: o.numero, cliente_nombre: o.cliente_nombre, precio: o.precio, moneda: o.moneda, reserva_vence: o.reserva_vence, estado: o.estado, pagado }, auto, vendedor, agencia, portal),
    };
  }

  /** Lo que necesita la ventana de «Escribirle»: a quién, y cada mensaje ya con sus datos puestos. */
  async para(d: DestinoDto, user: User): Promise<MensajesPara> {
    await this.asegurar(user.companyId);
    const dest = await this.destino(d, user);
    const todas = (await this.propias(user.companyId)).filter((p) => p.contexto === d.contexto && p.activa);
    const listas = (canal: CanalPlantilla): PlantillaLista[] => todas.filter((p) => p.canal === canal).map((p) => ({
      id: p.id, nombre: p.nombre, asunto: p.asunto ? renderizarPlantilla(p.asunto, dest.datos) : null, texto: renderizarPlantilla(p.texto, dest.datos),
    }));
    return {
      nombre: dest.nombre, whatsapp: normalizarTelefono(dest.telefono), telefono: dest.telefono, email: dest.email,
      plantillas: { whatsapp: listas('whatsapp'), email: listas('email') }, correo: this.mailer.estado(),
    };
  }

  private async anotar(interesado: Interesado | null, texto: string, user: User): Promise<void> {
    if (!interesado) return;
    await this.dataSource.manager.update(Interesado, { id: interesado.id }, {
      seguimiento: [...(interesado.seguimiento ?? []), { fecha: new Date().toISOString(), texto, autor: user.nombre }] as never,
    });
  }

  private async nombreDePlantilla(id: string | undefined, user: User): Promise<string | null> {
    if (!id) return null;
    return (await this.dataSource.manager.findOne(MensajePlantilla, { where: { id, companyId: user.companyId }, select: { id: true, nombre: true } }))?.nombre ?? null;
  }

  /** Queda anotado que se abrió WhatsApp con ese texto: el envío lo hace el vendedor desde su teléfono o WhatsApp Web. */
  async registrarWhatsapp(dto: RegistrarWhatsappDto, user: User): Promise<{ ok: true }> {
    const dest = await this.destino(dto, user);
    const telefono = normalizarTelefono(dest.telefono);
    if (!telefono) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Esta persona no tiene un teléfono que sirva para WhatsApp.');
    const plantilla = await this.nombreDePlantilla(dto.plantilla_id, user);
    const em = this.dataSource.manager;
    await em.save(MensajeEnviado, em.create(MensajeEnviado, {
      canal: 'whatsapp', interesadoId: dest.interesado?.id ?? null, operacionId: dest.operacion?.id ?? null, para: telefono, asunto: null,
      cuerpo: dto.texto, plantilla, estado: 'abierto', error: null, autor: user.nombre, companyId: user.companyId,
    }));
    await this.anotar(dest.interesado, `Se le escribió por WhatsApp${plantilla ? ` («${plantilla}»)` : ''}.`, user);
    return { ok: true };
  }

  async enviarCorreo(dto: EnviarCorreoDto, user: User): Promise<MensajeEnviado> {
    if (!this.mailer.configurado()) throw new ErrorDeNegocio('CORREO_NO_CONFIGURADO', 'El envío de correos todavía no está configurado en el servidor.');
    const dest = await this.destino(dto, user);
    const em = this.dataSource.manager;
    const para = dto.para.trim().toLowerCase();
    const plantilla = await this.nombreDePlantilla(dto.plantilla_id, user);
    const a = dest.agencia;
    const sitio = sitioDeAgencia(urlPublicaDelPortal(), a?.slug);
    const { html, texto } = correoDeAgencia(dto.cuerpo, { nombre: a?.name ?? 'La agencia', direccion: a?.direccion, telefono: a?.telefono, sitio });
    const registro = em.create(MensajeEnviado, {
      canal: 'email', interesadoId: dest.interesado?.id ?? null, operacionId: dest.operacion?.id ?? null, para, asunto: dto.asunto.trim(),
      cuerpo: dto.cuerpo, plantilla, estado: 'enviado', error: null, autor: user.nombre, companyId: user.companyId,
    });
    try {
      // Sale a nombre de la agencia y las respuestas le llegan a su correo de contacto.
      await this.mailer.enviar({ para, asunto: dto.asunto.trim(), texto, html, remitente: { nombre: a?.name ?? 'FG autos', responderA: a?.email_contacto ?? null } });
    } catch (e) {
      registro.estado = 'fallido';
      registro.error = String((e as Error)?.message ?? e).slice(0, 300);
      await em.save(MensajeEnviado, registro);
      throw new ErrorDeNegocio('CORREO_FALLIDO', 'No se pudo enviar el correo. Quedó registrado como fallido: probá de nuevo en un rato.', { detalle: registro.error });
    }
    const guardado = await em.save(MensajeEnviado, registro);
    if (dest.interesado) {
      // Si no tenía correo cargado, queda el que se usó.
      if (!dest.interesado.email) await em.update(Interesado, { id: dest.interesado.id }, { email: para });
      await this.anotar(dest.interesado, `Se le mandó un correo: «${dto.asunto.trim()}».`, user);
    }
    return guardado;
  }

  /** Lo que ya se le escribió a esa persona, lo último primero. */
  async historial(d: DestinoDto, user: User): Promise<MensajeEnviado[]> {
    return this.dataSource.manager.find(MensajeEnviado, {
      where: { companyId: user.companyId, ...(d.contexto === 'interesado' ? { interesadoId: d.id } : { operacionId: d.id }) },
      order: { created_at: 'DESC' }, take: 30,
    });
  }
}
