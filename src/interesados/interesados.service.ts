import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { FotosAlmacen } from '../orden-fotos/fotos.almacen';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { Unidad } from '../unidades/entities/unidad.entity';
import { hoyAr, tituloDe } from '../unidades/unidades.vista';
import { EtapaInteresado, FotoDeInteresado, UsadoDelInteresado, Interesado, NotaDeSeguimiento, OrigenInteresado, Temperatura } from './interesado.entity';
import { ConsultaWebDto, CotizarDto, CrearInteresadoDto, EditarInteresadoDto, InteresadoDto, ListarInteresadosDto, MoverInteresadoDto, NotaDto } from './interesados.dtos';
import { ETAPAS_ACTIVAS, atrasado, coincide, digitos, problemaDelCambio, tocaHoy, usadoDe } from './interesados.util';

export interface UnidadSugerida {
  id: string; numero: string; titulo: string; anio: number; km: number; precio: number | null; moneda: string; estado: string;
}

export interface VistaInteresado {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  origen: OrigenInteresado;
  etapa: EtapaInteresado;
  temperatura: Temperatura;
  /** La unidad por la que consultó. */
  unidad: UnidadSugerida | null;
  busca: string | null;
  busca_marca: string | null;
  busca_carroceria: string | null;
  precio_max: number | null;
  precio_moneda: string | null;
  tiene_usado: string | null;
  proxima_accion: string | null;
  proxima_nota: string | null;
  atrasado: boolean;
  toca_hoy: boolean;
  vendedor: { id: string; nombre: string } | null;
  seguimiento: NotaDeSeguimiento[];
  motivo_perdida: string | null;
  /** Las fotos de su auto que mandó desde el sitio. */
  fotos: FotoDeInteresado[];
  /** Su auto en datos sueltos, si lo cargó desde el sitio. */
  usado: UsadoDelInteresado | null;
  /** La cotización de su auto: si la pidió, y qué se le ofreció. */
  cotizacion: { pedida: boolean; pendiente: boolean; valor: number | null; moneda: 'ARS' | 'USD' | null; fecha: string | null };
  /** Las unidades disponibles que hoy le sirven a lo que busca. */
  sugeridas: UnidadSugerida[];
  created_at: Date;
  updated_at: Date;
}

/** Cuántas fotos entran por consulta y cuántas guarda un interesado en total. */
export const MAXIMO_FOTOS_CONSULTA = 6;
export const MAXIMO_FOTOS_INTERESADO = 12;

const VISTAS: Record<string, EtapaInteresado[]> = { activos: ETAPAS_ACTIVAS, ganados: ['ganado'], perdidos: ['perdido'] };
const limpio = (v: string | null | undefined) => (v ?? '').trim() || null;
const sugerida = (u: Unidad): UnidadSugerida => ({
  id: u.id, numero: u.numero, titulo: tituloDe(u), anio: u.anio, km: u.km,
  precio: u.precio_venta === null ? null : Number(u.precio_venta), moneda: u.moneda, estado: u.estado,
});

/**
 * Interesados (tanda de la demo, 12/11/2026): quién consultó, por qué auto,
 * qué busca, en qué etapa está y cuándo hay que volver a hablarle. Cruza lo
 * que busca cada uno contra el stock disponible, en los dos sentidos.
 */
@Injectable()
export class InteresadosService {
  constructor(private readonly dataSource: DataSource, private readonly almacen: FotosAlmacen) {}

  async listar(dto: ListarInteresadosDto): Promise<VistaInteresado[]> {
    const em = this.dataSource.manager;
    const lista = await em.find(Interesado, {
      where: { etapa: In(VISTAS[dto.vista ?? 'activos']) },
      order: { updated_at: 'DESC' },
      take: 500,
    });
    return this.vistas(em, lista);
  }

  async obtener(id: string, em: EntityManager = this.dataSource.manager): Promise<VistaInteresado> {
    const i = await em.findOne(Interesado, { where: { id } });
    if (!i) throw new NotFoundException('No encontramos a ese interesado.');
    return (await this.vistas(em, [i]))[0];
  }

  /** Para la ficha de un auto: quién consultó por él y a quién más le sirve. */
  async deUnidad(unidadId: string): Promise<{ consultaron: VistaInteresado[]; coinciden: VistaInteresado[] }> {
    const em = this.dataSource.manager;
    const u = await em.findOne(Unidad, { where: { id: unidadId } });
    if (!u) throw new NotFoundException('No encontramos esa unidad.');
    const activos = await em.find(Interesado, { where: { etapa: In(ETAPAS_ACTIVAS) }, order: { updated_at: 'DESC' }, take: 500 });
    const consultaron = activos.filter((i) => i.unidadId === u.id);
    const coinciden = activos.filter((i) => i.unidadId !== u.id && coincide(i, u));
    const vistas = await this.vistas(em, [...consultaron, ...coinciden]);
    return { consultaron: vistas.slice(0, consultaron.length), coinciden: vistas.slice(consultaron.length) };
  }

  async crear(dto: CrearInteresadoDto, user: User): Promise<VistaInteresado> {
    const nombre = dto.nombre.trim();
    if (!limpio(dto.telefono) && !limpio(dto.email)) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá un teléfono o un correo: sin eso no hay cómo volver a hablarle.');
    }
    const em = this.dataSource.manager;
    if (dto.unidad_id) await this.exigirUnidad(em, dto.unidad_id);
    const nota = limpio(dto.nota);
    const guardado = await em.save(Interesado, em.create(Interesado, {
      ...this.datos(dto),
      nombre,
      origen: (dto.origen ?? 'salon') as OrigenInteresado,
      etapa: 'nuevo',
      temperatura: (dto.temperatura ?? 'tibio') as Temperatura,
      vendedorId: dto.vendedor_id ?? user.id,
      seguimiento: nota ? [{ fecha: new Date().toISOString(), texto: nota, autor: user.nombre }] : [],
      companyId: user.companyId,
    }));
    return this.obtener(guardado.id);
  }

  async editar(id: string, dto: EditarInteresadoDto): Promise<VistaInteresado> {
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    if (dto.unidad_id) await this.exigirUnidad(em, dto.unidad_id);
    const cambios: Partial<Interesado> = this.datos(dto, true);
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.origen !== undefined) cambios.origen = dto.origen as OrigenInteresado;
    if (dto.temperatura !== undefined) cambios.temperatura = dto.temperatura as Temperatura;
    const telefono = 'telefono' in cambios ? cambios.telefono : i.telefono;
    const email = 'email' in cambios ? cambios.email : i.email;
    if (!telefono && !email) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Tiene que quedar un teléfono o un correo.');
    if (Object.keys(cambios).length) await em.update(Interesado, { id: i.id }, cambios);
    return this.obtener(i.id);
  }

  async mover(id: string, dto: MoverInteresadoDto, user: User): Promise<VistaInteresado> {
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    const problema = problemaDelCambio(i.etapa, dto.etapa, dto.motivo);
    if (problema) throw new ErrorDeNegocio('DATOS_INVALIDOS', problema);
    const cierra = dto.etapa === 'ganado' || dto.etapa === 'perdido';
    const motivo = limpio(dto.motivo);
    const texto = dto.etapa === 'perdido' ? `Se perdió: ${motivo}` : dto.etapa === 'ganado' ? 'Compró.' : null;
    await em.update(Interesado, { id: i.id }, {
      etapa: dto.etapa,
      motivo_perdida: dto.etapa === 'perdido' ? motivo : null,
      // Cerrado, ya no hay a quién llamar.
      ...(cierra ? { proxima_accion: null, proxima_nota: null } : {}),
      ...(texto ? { seguimiento: [...(i.seguimiento ?? []), { fecha: new Date().toISOString(), texto, autor: user.nombre }] } : {}),
    });
    return this.obtener(i.id);
  }

  /** La agencia le pone un valor al auto del interesado. Queda en su ficha y en el seguimiento. */
  async cotizar(id: string, dto: CotizarDto, user: User): Promise<VistaInteresado> {
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    if (!ETAPAS_ACTIVAS.includes(i.etapa)) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Este interesado ya está cerrado: no se le puede cotizar.');
    }
    if (!limpio(i.tiene_usado)) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá primero qué auto entrega: sin eso no hay qué cotizar.');
    }
    const importe = `${dto.moneda === 'USD' ? 'US$' : '$'} ${dto.valor.toLocaleString('es-AR')}`;
    const nota = limpio(dto.nota);
    const texto = `Se le cotizó su auto (${i.tiene_usado}) en ${importe}.` + (nota ? ` ${nota}` : '');
    await em.update(Interesado, { id: i.id }, {
      cotizacion_valor: dto.valor,
      cotizacion_moneda: dto.moneda,
      cotizacion_fecha: hoyAr(),
      seguimiento: [...(i.seguimiento ?? []), { fecha: new Date().toISOString(), texto, autor: user.nombre }],
      // Cotizarle ya es haberle contestado.
      ...(i.etapa === 'nuevo' ? { etapa: 'contactado' as EtapaInteresado } : {}),
      // Si lo pendiente era cotizarle, ya está: queda sin fecha hasta que el vendedor ponga la próxima.
      ...(i.proxima_nota === 'Pasarle la cotización de su auto' || i.proxima_nota === 'Pasarle un valor por su auto' ? { proxima_accion: null, proxima_nota: null } : {}),
    });
    return this.obtener(i.id);
  }

  async anotar(id: string, dto: NotaDto, user: User): Promise<VistaInteresado> {
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    const texto = dto.texto.trim();
    if (!texto) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Escribí qué pasó.');
    await em.update(Interesado, { id: i.id }, {
      seguimiento: [...(i.seguimiento ?? []), { fecha: new Date().toISOString(), texto, autor: user.nombre }],
      // Hablar con alguien nuevo ya es haberlo contactado.
      ...(i.etapa === 'nuevo' ? { etapa: 'contactado' as EtapaInteresado } : {}),
      ...(dto.proxima_accion !== undefined ? { proxima_accion: dto.proxima_accion || null, proxima_nota: limpio(dto.proxima_nota) } : {}),
    });
    return this.obtener(i.id);
  }

  async subirFotos(id: string, archivos: Buffer[], user: User): Promise<VistaInteresado> {
    if (!archivos.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Elegí al menos una foto para subir.');
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    const actuales = i.fotos ?? [];
    const lugar = Math.max(0, MAXIMO_FOTOS_INTERESADO - actuales.length);
    if (lugar <= 0) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', `Un interesado admite hasta ${MAXIMO_FOTOS_INTERESADO} fotos: quitá alguna.`);
    }
    const comprimidas = await Promise.all(archivos.slice(0, lugar).map((a) => comprimirFoto(a)));
    const nuevas = await this.guardarFotos(i.id, comprimidas);
    const nota: NotaDeSeguimiento = {
      fecha: new Date().toISOString(),
      texto: `Se cargaron ${nuevas.length} ${nuevas.length === 1 ? 'foto' : 'fotos'} en su ficha.`,
      autor: user.nombre,
    };
    await em.update(Interesado, { id: i.id }, {
      fotos: [...actuales, ...nuevas],
      seguimiento: [...(i.seguimiento ?? []), nota],
    });
    return this.obtener(i.id);
  }

  async borrarFoto(id: string, indice: number): Promise<VistaInteresado> {
    const em = this.dataSource.manager;
    const i = await this.existente(em, id);
    const actuales = [...(i.fotos ?? [])];
    if (indice < 0 || indice >= actuales.length) {
      throw new NotFoundException('Esa foto no existe en la ficha.');
    }
    const [quitada] = actuales.splice(indice, 1);
    await em.update(Interesado, { id: i.id }, { fotos: actuales });
    if (quitada) {
      await this.almacen.borrar([quitada.url, quitada.url_miniatura]).catch(() => undefined);
    }
    return this.obtener(i.id);
  }

  /**
   * La consulta que llega del sitio, sin login. Si ese teléfono ya está entre
   * los interesados vivos, se le suma la nota en vez de duplicarlo. Nunca
   * devuelve datos: sólo que llegó.
   */
  /** Sube las fotos ya comprimidas a la carpeta del interesado. */
  private async guardarFotos(interesadoId: string, fotos: Awaited<ReturnType<typeof comprimirFoto>>[]): Promise<FotoDeInteresado[]> {
    const guardadas: FotoDeInteresado[] = [];
    for (const f of fotos) {
      const u = await this.almacen.guardarEn(`interesados/${interesadoId}`, f);
      guardadas.push({ url: u.url, url_miniatura: u.url_miniatura });
    }
    return guardadas;
  }

  async consultaWeb(dto: ConsultaWebDto, companyId: string, archivos: Buffer[] = [], propio?: { encabezado: string; pendiente: string }): Promise<{ ok: true }> {
    // Un bot completa el campo trampa: se le contesta que sí y no se guarda nada.
    if (limpio(dto.sitio_web)) return { ok: true };
    const em = this.dataSource.manager;
    const unidad = dto.unidad_id
      ? await em.findOne(Unidad, { where: { id: dto.unidad_id, companyId, publicada: true } })
      : null;
    const mensaje = limpio(dto.mensaje);
    const usado = limpio(dto.tiene_usado);
    const vende = dto.asunto === 'vender';
    const encabezado = propio ? propio.encabezado : vende
      ? (dto.intencion === 'entregar' ? 'Pide cotización para entregar su auto en parte de pago' : dto.intencion === 'consignar' ? 'Pide cotización para dejar su auto en consignación' : dto.intencion === 'vender' ? 'Pide cotización para vender su auto' : 'Pide cotización de su auto') : dto.asunto === 'contacto' ? 'Contacto desde el sitio'
      : dto.asunto === 'visita' ? 'Pide una visita'
      : dto.asunto === 'aviso' ? 'Pide que le avisen cuando entre lo que busca'
      : 'Consulta desde el sitio';
    const avisa = dto.asunto === 'aviso';
    const dia = dto.asunto === 'visita' ? limpio(dto.dia_preferido) : null;
    const datosDelUsado = vende ? usadoDe(dto.usado_datos) : null;
    // Lo que busca, para cruzarlo contra el stock (hoy y cuando entre una unidad nueva).
    const busqueda = avisa ? {
      ...(limpio(dto.busca_marca) ? { busca_marca: limpio(dto.busca_marca) } : {}),
      ...(dto.busca_carroceria ? { busca_carroceria: dto.busca_carroceria } : {}),
      ...(dto.precio_max ? { precio_max: dto.precio_max, precio_moneda: dto.precio_moneda ?? 'USD' } : {}),
    } : {};
    // Sólo quien ofrece su auto manda fotos; las de cualquier otro formulario se descartan.
    const recibidas = vende ? archivos.slice(0, MAXIMO_FOTOS_CONSULTA) : [];
    // Se comprimen antes de tocar la base: si una no es una foto, no se guarda nada.
    const comprimidas = await Promise.all(recibidas.map((a) => comprimirFoto(a)));
    const conFotos = comprimidas.length ? ` Mandó ${comprimidas.length} ${comprimidas.length === 1 ? 'foto' : 'fotos'}.` : '';
    const texto = [encabezado, unidad ? `por ${tituloDe(unidad)} ${unidad.anio} (${unidad.numero})` : null, usado ? `(${usado})` : null, dia ? `el ${dia.split('-').reverse().join('/')}` : null]
      .filter(Boolean).join(' ') + (mensaje ? `: «${mensaje}».` : '.') + conFotos;
    const pendiente = propio ? propio.pendiente : vende ? 'Pasarle la cotización de su auto'
      : dto.asunto === 'visita' ? (dia ? `Confirmarle la visita del ${dia.split('-').reverse().join('/')}` : 'Coordinar la visita')
      : avisa ? 'Avisarle cuando entre lo que busca'
      : 'Contestar la consulta del sitio';
    const nota: NotaDeSeguimiento = { fecha: new Date().toISOString(), texto, autor: null };

    const clave = digitos(dto.telefono);
    const vivos = await em.find(Interesado, { where: { companyId, etapa: In(ETAPAS_ACTIVAS) }, take: 1000 });
    const existente = clave ? vivos.find((i) => digitos(i.telefono) === clave) : undefined;
    const esVisita = dto.asunto === 'visita';
    if (existente) {
      const lugar = Math.max(0, MAXIMO_FOTOS_INTERESADO - (existente.fotos ?? []).length);
      const nuevas = await this.guardarFotos(existente.id, comprimidas.slice(0, lugar));
      await em.update(Interesado, { id: existente.id }, {
        fotos: [...(existente.fotos ?? []), ...nuevas],
        // Un pedido nuevo deja la cotización otra vez pendiente; la anterior queda en el seguimiento.
        ...(vende ? { cotizacion_pedida: true, cotizacion_valor: null, cotizacion_moneda: null, cotizacion_fecha: null } : {}),
        ...(esVisita ? { etapa: 'visita' as EtapaInteresado, temperatura: 'caliente' as Temperatura } : {}),
        seguimiento: [...(existente.seguimiento ?? []), nota],
        unidadId: unidad?.id ?? existente.unidadId,
        tiene_usado: usado ?? existente.tiene_usado,
        ...(datosDelUsado ? { usado: datosDelUsado } : {}),
        ...busqueda,
        // Volvió a escribir: hay que contestarle hoy.
        proxima_accion: hoyAr(),
        proxima_nota: pendiente,
      });
      return { ok: true };
    }
    const creado = await em.save(Interesado, em.create(Interesado, {
      nombre: dto.nombre.trim(),
      telefono: dto.telefono.trim(),
      origen: 'sitio',
      etapa: esVisita ? 'visita' : 'nuevo',
      temperatura: esVisita ? 'caliente' : 'tibio',
      unidadId: unidad?.id ?? null,
      // Lo que escribió va al seguimiento; «busca» queda para lo que el vendedor averigüe.
      busca: vende ? null : mensaje,
      tiene_usado: usado,
      usado: datosDelUsado,
      ...busqueda,
      cotizacion_pedida: vende,
      proxima_accion: hoyAr(),
      proxima_nota: pendiente,
      seguimiento: [nota],
      companyId,
    }));
    if (comprimidas.length) {
      await em.update(Interesado, { id: creado.id }, { fotos: await this.guardarFotos(creado.id, comprimidas) });
    }
    return { ok: true };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private async existente(em: EntityManager, id: string): Promise<Interesado> {
    const i = await em.findOne(Interesado, { where: { id } });
    if (!i) throw new NotFoundException('No encontramos a ese interesado.');
    return i;
  }

  private async exigirUnidad(em: EntityManager, unidadId: string): Promise<void> {
    if (!(await em.findOne(Unidad, { where: { id: unidadId }, select: { id: true } }))) {
      throw new NotFoundException('No encontramos esa unidad.');
    }
  }

  /** Los campos comunes al alta y a la edición. En edición sólo entran los que vinieron. */
  private datos(dto: InteresadoDto, soloPresentes = false): Partial<Interesado> {
    const d: Partial<Interesado> = {};
    const poner = <K extends keyof Interesado>(clave: K, presente: boolean, valor: Interesado[K]) => {
      if (presente || !soloPresentes) d[clave] = valor;
    };
    poner('telefono', dto.telefono !== undefined, limpio(dto.telefono));
    poner('email', dto.email !== undefined, limpio(dto.email));
    poner('unidadId', dto.unidad_id !== undefined, dto.unidad_id || null);
    poner('busca', dto.busca !== undefined, limpio(dto.busca));
    poner('busca_marca', dto.busca_marca !== undefined, limpio(dto.busca_marca));
    poner('busca_carroceria', dto.busca_carroceria !== undefined, dto.busca_carroceria || null);
    poner('precio_max', dto.precio_max !== undefined, dto.precio_max ? Number(dto.precio_max) : null);
    poner('precio_moneda', dto.precio_moneda !== undefined || dto.precio_max !== undefined, dto.precio_max ? dto.precio_moneda ?? 'USD' : null);
    poner('tiene_usado', dto.tiene_usado !== undefined, limpio(dto.tiene_usado));
    if (dto.usado !== undefined) {
      const parsed = usadoDe(dto.usado);
      d.usado = parsed;
      if (parsed && !d.tiene_usado) {
        const kmTxt = parsed.km !== null ? `${parsed.km.toLocaleString('es-AR')} km` : null;
        d.tiene_usado = [parsed.marca, parsed.modelo, parsed.version, parsed.anio, kmTxt, parsed.dominio ? `[${parsed.dominio}]` : null]
          .filter(Boolean)
          .join(' ')
          .slice(0, 200);
      }
    }
    poner('proxima_accion', dto.proxima_accion !== undefined, dto.proxima_accion || null);
    poner('proxima_nota', dto.proxima_nota !== undefined, limpio(dto.proxima_nota));
    if (soloPresentes && dto.vendedor_id !== undefined) d.vendedorId = dto.vendedor_id || null;
    return d;
  }

  private async vistas(em: EntityManager, lista: Interesado[]): Promise<VistaInteresado[]> {
    if (!lista.length) return [];
    const unicos = (ids: (string | null)[]) => [...new Set(ids.filter((x): x is string => !!x))];
    const idsUnidad = unicos(lista.map((i) => i.unidadId));
    const idsVendedor = unicos(lista.map((i) => i.vendedorId));
    const [disponibles, consultadas, vendedores] = await Promise.all([
      em.find(Unidad, { where: { estado: 'disponible' }, order: { fecha_ingreso: 'DESC' }, take: 500 }),
      idsUnidad.length ? em.find(Unidad, { where: { id: In(idsUnidad) } }) : [],
      idsVendedor.length ? em.find(User, { where: { id: In(idsVendedor) }, select: { id: true, nombre: true } }) : [],
    ]);
    const u = new Map(consultadas.map((x) => [x.id, x]));
    const v = new Map(vendedores.map((x) => [x.id, x]));
    const hoy = hoyAr();
    return lista.map((i) => {
      const unidad = i.unidadId ? u.get(i.unidadId) : undefined;
      const vendedor = i.vendedorId ? v.get(i.vendedorId) : undefined;
      const viva = ETAPAS_ACTIVAS.includes(i.etapa);
      return {
        id: i.id,
        nombre: i.nombre,
        telefono: i.telefono,
        email: i.email,
        origen: i.origen,
        etapa: i.etapa,
        temperatura: i.temperatura,
        unidad: unidad ? sugerida(unidad) : null,
        busca: i.busca,
        busca_marca: i.busca_marca,
        busca_carroceria: i.busca_carroceria,
        precio_max: i.precio_max === null ? null : Number(i.precio_max),
        precio_moneda: i.precio_moneda,
        tiene_usado: i.tiene_usado,
        proxima_accion: i.proxima_accion,
        proxima_nota: i.proxima_nota,
        atrasado: atrasado(i.etapa, i.proxima_accion, hoy),
        toca_hoy: tocaHoy(i.etapa, i.proxima_accion, hoy),
        vendedor: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
        seguimiento: i.seguimiento ?? [],
        motivo_perdida: i.motivo_perdida,
        fotos: i.fotos ?? [],
        usado: i.usado ?? null,
        cotizacion: {
          pedida: i.cotizacion_pedida,
          pendiente: viva && i.cotizacion_pedida && i.cotizacion_valor === null,
          valor: i.cotizacion_valor === null ? null : Number(i.cotizacion_valor),
          moneda: i.cotizacion_moneda,
          fecha: i.cotizacion_fecha,
        },
        sugeridas: viva ? disponibles.filter((x) => x.id !== i.unidadId && coincide(i, x)).slice(0, 12).map(sugerida) : [],
        created_at: i.created_at,
        updated_at: i.updated_at,
      };
    });
  }
}
