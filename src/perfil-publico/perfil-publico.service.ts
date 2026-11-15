import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PerfilPublico, VideoYoutube } from './entities/perfil-publico.entity';
import { ActualizarPerfilPublicoDto, CampoImagen, VideoDto } from './dto/perfil-publico.dtos';
import {
  PerfilEditable, PerfilPublicoRespuesta, TOPES, armarPerfilPublico, perfilPorDefecto,
} from './perfil-publico.util';
import { Company } from '../companies/entities/company.entity';
import { FotosAlmacen } from '../orden-fotos/fotos.almacen';
import { comprimirFoto } from '../orden-fotos/fotos.util';
import { recortarBorde } from './recorte.util';
import { ConsultorOembed } from './oembed.consultor';
import { idDeYoutube } from './youtube.util';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { sintomasVigentes, type SintomaConfig } from './sintomas.util';
import {
  ClaveFotoSitio, FotoSitioGuardada, FotosDelSitioErp, LUGARES_FOTO, esClaveFotoSitio, lugaresParaErp, propiaEn,
} from './fotos-sitio';

const CAMPOS_EDITABLES: (keyof PerfilEditable)[] = [
  'eslogan', 'quienes_somos', 'zona', 'color_acento', 'logo_url', 'isotipo_url', 'portada_url', 'foto_equipo_url',
  'horarios', 'redes', 'marcas', 'servicios', 'fotos_trabajos', 'cifras',
  'video_url', 'video_poster_url', 'videos', 'google_place_id', 'sintomas',
  'fotos_sitio', 'video_portada_url', 'instalacion_activa', 'instalacion_texto', 'vende_repuestos',
];

/**
 * Lo que el PATCH genérico NO puede pisar. `video_url` y `video_poster_url`
 * los escriben sólo los endpoints de video (el ERP nunca manda una URL de
 * video a mano), y `videos` y `google_place_id` tienen tratamiento propio en
 * `actualizar` (oembed y recorte). `fotos_sitio` y
 * `video_portada_url` los escriben sólo los endpoints de «Fotos del sitio».
 */
const CAMPOS_NO_PARCHEABLES = new Set<keyof PerfilEditable>([
  'video_url', 'video_poster_url', 'videos', 'google_place_id', 'fotos_sitio', 'video_portada_url',
]);

/**
 * El perfil público del taller (S1a §3). La fila nace al primer guardado;
 * hasta entonces todo el mundo ve `perfilPorDefecto()`.
 */
@Injectable()
export class PerfilPublicoService {
  private readonly logger = new Logger('PerfilPublico');

  constructor(
    @InjectRepository(PerfilPublico) private readonly perfiles: Repository<PerfilPublico>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly almacen: FotosAlmacen,
    private readonly oembed: ConsultorOembed,
  ) {}

  /**
   * `User.companyId` es anulable (superadmin de plataforma, o un usuario mal
   * migrado) y TypeORM 0.3 descarta en silencio un `where: { companyId: null
   * o undefined }`: sin esta guardia, `findOne` devolvería la primera fila
   * de CUALQUIER empresa — un usuario sin taller asignado leería o pisaría
   * el perfil público de otro taller.
   */
  private empresaDe(companyId: string | null | undefined): string {
    if (!companyId) throw new ForbiddenException('La sesión no tiene empresa asignada');
    return companyId;
  }

  private soloEditable(p: PerfilPublico | PerfilEditable): PerfilEditable {
    const salida = {} as PerfilEditable;
    for (const campo of CAMPOS_EDITABLES) (salida as any)[campo] = (p as any)[campo];
    // El ERP edita sobre la lista de fábrica mientras el taller no guarde la suya.
    salida.sintomas = sintomasVigentes(p.sintomas);
    return salida;
  }

  private async fila(companyId: string): Promise<PerfilPublico | null> {
    return this.perfiles.findOne({ where: { companyId } });
  }

  /** La fila existente o una nueva con defaults, todavía sin guardar. */
  private async filaOTemporal(companyId: string): Promise<PerfilPublico> {
    return (await this.fila(companyId)) ?? this.perfiles.create({ companyId, ...perfilPorDefecto() });
  }

  async obtener(companyId: string | null | undefined): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.fila(empresa);
    return fila ? this.soloEditable(fila) : perfilPorDefecto();
  }

  async actualizar(
    companyId: string | null | undefined,
    dto: ActualizarPerfilPublicoDto,
  ): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.filaOTemporal(empresa);
    for (const campo of CAMPOS_EDITABLES) {
      if (CAMPOS_NO_PARCHEABLES.has(campo)) continue;
      if (campo in dto && (dto as any)[campo] !== undefined) (fila as any)[campo] = (dto as any)[campo];
    }
    // Las condiciones de la instalación sin espacios de más; vacías, se borran.
    if (dto.instalacion_texto !== undefined) fila.instalacion_texto = dto.instalacion_texto?.trim() || null;
    if (dto.videos !== undefined) {
      fila.videos = await this.resolverVideos(fila.videos ?? [], dto.videos);
    }
    if (dto.google_place_id !== undefined) fila.google_place_id = dto.google_place_id?.trim() || null;
    const guardada = this.soloEditable(await this.perfiles.save(fila));
    return guardada;
  }

  /**
   * Los videos que manda el ERP, resueltos contra YouTube (S1c-b §3.2).
   *
   * El ERP manda la lista COMPLETA en orden, con las URLs crudas. Acá se
   * extrae el id y, sólo para los que todavía no estaban guardados, se
   * consulta `oembed` por el título y el canal: reconsultar los que ya están
   * sería una llamada de red por video en cada guardado del formulario, y los
   * dejaría en blanco el día que YouTube no responda.
   *
   * Los rechazos viajan con `campos: ['videos.<n>.url']` para que el ERP pinte
   * el error BAJO la fila que lo provocó y no en un toast genérico.
   */
  private async resolverVideos(actuales: VideoYoutube[], pedidos: VideoDto[]): Promise<VideoYoutube[]> {
    const previos = new Map((actuales ?? []).map((v) => [v.id, v]));
    const salida: VideoYoutube[] = [];
    const vistos = new Set<string>();

    for (let i = 0; i < pedidos.length; i++) {
      const campos = [`videos.${i}.url`];
      const id = idDeYoutube(pedidos[i].url);
      if (!id) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'No parece un enlace de YouTube', { campos });
      if (vistos.has(id)) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Ese video ya está en la lista', { campos });
      vistos.add(id);

      const previo = previos.get(id);
      let titulo = previo?.titulo ?? '';
      let canal = previo?.canal ?? '';
      if (!previo) {
        const datos = await this.oembed.consultar(id);
        if (!datos) {
          throw new ErrorDeNegocio('DATOS_INVALIDOS', 'El video no permite embebido o no existe', { campos });
        }
        titulo = datos.titulo;
        canal = datos.canal;
      }

      const propio = pedidos[i].titulo_personalizado?.trim();
      salida.push({ id, titulo, canal, ...(propio ? { titulo_personalizado: propio } : {}) });
    }
    return salida;
  }

  async subirImagen(
    companyId: string | null | undefined,
    campo: CampoImagen,
    bytes: Buffer,
  ): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.filaOTemporal(empresa);
    if (campo === 'trabajo' && fila.fotos_trabajos.length >= TOPES.fotos_trabajos) {
      throw new ConflictException(`La galería admite hasta ${TOPES.fotos_trabajos} fotos`);
    }
    // Logo e isotipo sin el margen blanco: si no, en la barra se ven chicos.
    const entrada = campo === 'logo' || campo === 'isotipo' ? await recortarBorde(bytes) : bytes;
    const comprimida = await comprimirFoto(entrada).catch(() => {
      throw new BadRequestException('El archivo no es una imagen válida');
    });
    const { url, url_miniatura } = await this.almacen.guardarEn(`perfil/${empresa}`, comprimida);
    // La URL anterior (si había) se borra del almacén DESPUÉS de guardar: si
    // el guardado fallara, el archivo viejo sigue sirviendo y no se pierde.
    let anterior: string | null = null;
    if (campo === 'logo') { anterior = fila.logo_url; fila.logo_url = url; }
    else if (campo === 'isotipo') { anterior = fila.isotipo_url; fila.isotipo_url = url; }
    else if (campo === 'portada') { anterior = fila.portada_url; fila.portada_url = url; }
    else if (campo === 'equipo') { anterior = fila.foto_equipo_url; fila.foto_equipo_url = url; }
    else fila.fotos_trabajos = [...fila.fotos_trabajos, { url, miniatura: url_miniatura }];
    const guardada = this.soloEditable(await this.perfiles.save(fila));
    // Best-effort (Cloudinary es un servicio medido): si el borrado falla, la
    // URL nueva ya está guardada y el archivo viejo sólo queda huérfano.
    if (anterior) await this.almacen.borrar([anterior]).catch(() => undefined);
    return guardada;
  }

  /**
   * El video de portada (S1c-b §3.3). Mismo criterio que las imágenes: primero
   * se guarda el nuevo y recién después se borra el viejo, así un fallo del
   * almacén no deja al taller sin nada.
   */
  async subirVideo(
    companyId: string | null | undefined,
    bytes: Buffer,
    extension: string,
  ): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.filaOTemporal(empresa);
    const { url, poster_url } = await this.almacen.guardarVideo(`perfil/${empresa}`, bytes, extension);
    const anterior = fila.video_url;
    fila.video_url = url;
    fila.video_poster_url = poster_url;
    const guardada = this.soloEditable(await this.perfiles.save(fila));
    if (anterior) await this.almacen.borrar([anterior]).catch(() => undefined);
    return guardada;
  }

  async quitarVideo(companyId: string | null | undefined): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.filaOTemporal(empresa);
    const anterior = fila.video_url;
    fila.video_url = null;
    // El poster de Cloudinary es una transformación de la URL del video, no un
    // archivo aparte: se va solo cuando se borra el video.
    fila.video_poster_url = null;
    const guardada = this.soloEditable(await this.perfiles.save(fila));
    if (anterior) await this.almacen.borrar([anterior]).catch(() => undefined);
    return guardada;
  }

  // ─── Fotos del sitio (spec 2026-10-18) ─────────────────────────────────

  async fotosSitio(companyId: string | null | undefined): Promise<FotosDelSitioErp> {
    const fila = await this.fila(this.empresaDe(companyId));
    return lugaresParaErp(fila?.fotos_sitio, fila?.video_portada_url);
  }

  /** Clave y posición vienen de la URL: se validan contra el catálogo antes de tocar nada. */
  private validarLugar(clave: string, posicion: number): ClaveFotoSitio {
    if (!esClaveFotoSitio(clave)) throw new BadRequestException(`Lugar de foto desconocido: ${clave}`);
    if (!Number.isInteger(posicion) || posicion < 0 || posicion >= LUGARES_FOTO[clave].originales.length) {
      throw new BadRequestException(`Ese lugar no tiene la posición ${posicion}`);
    }
    return clave;
  }

  /** La lista de una clave con el largo del catálogo y `null` donde va la original. */
  private listaDe(fila: PerfilPublico, clave: ClaveFotoSitio): (FotoSitioGuardada | null)[] {
    return LUGARES_FOTO[clave].originales.map((_, i) => propiaEn(fila.fotos_sitio, clave, i));
  }

  async subirFotoSitio(
    companyId: string | null | undefined,
    claveCruda: string,
    posicion: number,
    bytes: Buffer,
  ): Promise<FotosDelSitioErp> {
    const clave = this.validarLugar(claveCruda, posicion);
    const empresa = this.empresaDe(companyId);
    const comprimida = await comprimirFoto(bytes).catch(() => {
      throw new BadRequestException('El archivo no es una imagen válida');
    });
    // La subida tarda segundos: se hace ANTES de tomar la fila, así dos
    // subidas a la vez no se pisan (ver `cambiarLugar`).
    const { url, url_miniatura } = await this.almacen.guardarEn(`perfil/${empresa}`, comprimida);
    const nueva = { url, miniatura: url_miniatura };
    const { guardada, anterior } = await this.cambiarLugar(empresa, clave, posicion, nueva).catch(async (e) => {
      await this.almacen.borrar([url, url_miniatura]).catch(() => undefined);
      throw e;
    });
    // Igual que las demás imágenes: la anterior se borra recién con la nueva guardada.
    if (anterior) await this.almacen.borrar(this.sinUso(guardada, [anterior.url, anterior.miniatura])).catch(() => undefined);
    return lugaresParaErp(guardada.fotos_sitio, guardada.video_portada_url);
  }

  async quitarFotoSitio(
    companyId: string | null | undefined,
    claveCruda: string,
    posicion: number,
  ): Promise<FotosDelSitioErp> {
    const clave = this.validarLugar(claveCruda, posicion);
    const { guardada, anterior } = await this.cambiarLugar(this.empresaDe(companyId), clave, posicion, null);
    await this.almacen.borrar(this.sinUso(guardada, [anterior!.url, anterior!.miniatura])).catch(() => undefined);
    return lugaresParaErp(guardada.fotos_sitio, guardada.video_portada_url);
  }

  /**
   * Pone `nueva` (o la original, con `null`) en un lugar, sobre la fila
   * releída con bloqueo dentro de una transacción: dos pedidos a la vez (el
   * ERP deja cambiar otra tarjeta mientras sube una) no guardan cada uno su
   * copia vieja de `fotos_sitio`, que perdería el cambio del otro y podría
   * dejar apuntada una foto ya borrada del almacén.
   */
  private cambiarLugar(
    empresa: string,
    clave: ClaveFotoSitio,
    posicion: number,
    nueva: FotoSitioGuardada | null,
  ): Promise<{ guardada: PerfilPublico; anterior: FotoSitioGuardada | null }> {
    return this.perfiles.manager.transaction(async (m) => {
      const repo = m.getRepository(PerfilPublico);
      const fila = (await repo.findOne({ where: { companyId: empresa }, lock: { mode: 'pessimistic_write' } }))
        ?? repo.create({ companyId: empresa, ...perfilPorDefecto() });
      const lista = this.listaDe(fila, clave);
      const anterior = lista[posicion];
      if (!nueva && !anterior) throw new NotFoundException('Ese lugar ya muestra la foto original');
      lista[posicion] = nueva;
      fila.fotos_sitio = { ...(fila.fotos_sitio ?? {}), [clave]: lista };
      return { guardada: await repo.save(fila), anterior };
    });
  }

  /** De `urls`, las que ya no usa ningún lugar: la misma foto pudo quedar en dos. */
  private sinUso(fila: PerfilPublico, urls: string[]): string[] {
    const enUso = new Set(
      Object.values(fila.fotos_sitio ?? {}).flatMap((l) => (l ?? []).flatMap((f) => (f ? [f.url, f.miniatura] : []))),
    );
    return [...new Set(urls)].filter((u) => u && !enUso.has(u));
  }

  async subirVideoPortada(
    companyId: string | null | undefined,
    bytes: Buffer,
    extension: string,
  ): Promise<FotosDelSitioErp> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.filaOTemporal(empresa);
    // El póster es el lugar `portada_video_poster`: el que genera Cloudinary no se usa.
    const { url } = await this.almacen.guardarVideo(`perfil/${empresa}`, bytes, extension);
    const anterior = fila.video_portada_url;
    fila.video_portada_url = url;
    const guardada = await this.perfiles.save(fila);
    if (anterior) await this.almacen.borrar([anterior]).catch(() => undefined);
    return lugaresParaErp(guardada.fotos_sitio, guardada.video_portada_url);
  }

  async quitarVideoPortada(companyId: string | null | undefined): Promise<FotosDelSitioErp> {
    const fila = await this.fila(this.empresaDe(companyId));
    if (!fila?.video_portada_url) throw new NotFoundException('La portada ya muestra el video original');
    const anterior = fila.video_portada_url;
    fila.video_portada_url = null;
    const guardada = await this.perfiles.save(fila);
    await this.almacen.borrar([anterior]).catch(() => undefined);
    return lugaresParaErp(guardada.fotos_sitio, guardada.video_portada_url);
  }

  async borrarTrabajo(companyId: string | null | undefined, indice: number): Promise<PerfilEditable> {
    const empresa = this.empresaDe(companyId);
    const fila = await this.fila(empresa);
    if (!fila || !Number.isInteger(indice) || indice < 0 || indice >= fila.fotos_trabajos.length) {
      throw new NotFoundException('No hay una foto en esa posición');
    }
    const quitada = fila.fotos_trabajos[indice];
    fila.fotos_trabajos = fila.fotos_trabajos.filter((_, i) => i !== indice);
    const guardada = this.soloEditable(await this.perfiles.save(fila));
    // Un PATCH previo pudo haber duplicado la URL en otra foto de la
    // galería: sólo se borra del almacén lo que ya no aparece en lo que
    // quedó guardado.
    const enUso = new Set(fila.fotos_trabajos.flatMap((f) => [f.url, f.miniatura]));
    const aBorrar = [quitada.url, quitada.miniatura].filter((url) => !enUso.has(url));
    if (aBorrar.length > 0) await this.almacen.borrar(aBorrar).catch(() => undefined);
    return guardada;
  }

  /** Los síntomas vigentes del taller (los suyos o los de fábrica), para la consola. */
  async sintomas(companyId: string | null | undefined): Promise<SintomaConfig[]> {
    if (!companyId) return sintomasVigentes(null);
    return sintomasVigentes((await this.fila(companyId))?.sintomas);
  }

  async publico(companyId: string | null | undefined): Promise<PerfilPublicoRespuesta> {
    const empresa = this.empresaDe(companyId);
    const company = await this.companies.findOneBy({ id: empresa });
    if (!company) throw new ServiceUnavailableException('La tienda no tiene taller configurado');
    const fila = await this.fila(empresa);
    return armarPerfilPublico(company, fila ? this.soloEditable(fila) : null);
  }
}
