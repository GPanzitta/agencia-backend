import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { Company } from '../companies/entities/company.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { AvisoAjeno } from './aviso-ajeno.entity';
import { AgregarCompetidorDto } from './competencia.dtos';
import { Comparacion, comparar, esComparable, mediana, UnidadPropia } from './comparacion.util';
import { Competidor } from './competidor.entity';
import { bajarPagina } from './descarga';
import { aplicarLectura, AvisoGuardado, claveDe, Novedad, novedadesDesde, precioAl } from './historia.util';
import { extraerUnidades, MAXIMO_UNIDADES, UnidadAjena } from './lector.util';
import { listadoDeModelo, paginasSiguientes } from './rastreo.util';

const MAXIMO_COMPETIDORES = 12;
const EN_STOCK = ['ingreso', 'alistaje', 'disponible', 'reservada'];
/** Cuánto se le pide a un sitio ajeno en una lectura. */
const MAXIMO_MODELOS = 12;
const PAGINAS_POR_MODELO = 2;
const PAGINAS_SIN_STOCK = 4;
const A_LA_VEZ = 3;
const TIEMPO_TOTAL_MS = 90_000;
/** Una lectura que lleva más que esto se da por caída (el servidor se reinició en el medio). */
const LECTURA_COLGADA_MS = 5 * 60_000;
const DIAS_DE_NOVEDADES = 30;
const DIA = 86_400_000;

export interface VistaCompetidor { id: string; nombre: string; url: string; autos: number; leida_at: Date | null; error: string | null; leyendo: boolean }
export interface Tendencia { antes: number; ahora: number; variacion_pct: number; dias: number }
export interface VistaComparacion {
  competidores: VistaCompetidor[];
  /** El dólar con el que se comparó: el que llegó en el pedido o el guardado por la agencia. */
  dolar: number | null;
  /** Mis autos en stock, cada uno contra los mismos modelos de los demás. `tendencia`: cómo se movió el precio del medio de ese modelo. */
  mios: (Comparacion & { tendencia: Tendencia | null })[];
  /** Lo que ellos tienen publicado y yo no tengo en stock. */
  solo_ellos: (UnidadAjena & { fuente: string })[];
  /** Lo que cambió en los avisos de los modelos que tengo, en los últimos 30 días. */
  novedades: (Novedad & { fuente: string })[];
}

/** Comparar mis precios con los de otros vendedores (14/11/2026). */
@Injectable()
export class CompetenciaService {
  private readonly logger = new Logger(CompetenciaService.name);
  constructor(private readonly dataSource: DataSource) {}

  private leyendo(c: Competidor): boolean {
    return !!c.leyendo_desde && Date.now() - new Date(c.leyendo_desde).getTime() < LECTURA_COLGADA_MS;
  }

  private vista(c: Competidor): VistaCompetidor {
    return { id: c.id, nombre: c.nombre, url: c.url, autos: (c.unidades ?? []).length, leida_at: c.leida_at, error: c.error, leyendo: this.leyendo(c) };
  }

  private async existente(id: string, companyId: string): Promise<Competidor> {
    const c = await this.dataSource.manager.findOne(Competidor, { where: { id, companyId } });
    if (!c) throw new NotFoundException('Ese vendedor ya no está en la lista.');
    return c;
  }

  async agregar(dto: AgregarCompetidorDto, user: User): Promise<VistaCompetidor> {
    const em = this.dataSource.manager;
    const url = dto.url.trim();
    const cuantos = await em.count(Competidor, { where: { companyId: user.companyId } });
    if (cuantos >= MAXIMO_COMPETIDORES) throw new ErrorDeNegocio('DATOS_INVALIDOS', `Se pueden seguir hasta ${MAXIMO_COMPETIDORES} vendedores: quitá alguno para sumar otro.`);
    if (await em.findOne(Competidor, { where: { companyId: user.companyId, url } })) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Esa página ya está en la lista.');
    let nombre = dto.nombre?.trim() ?? '';
    if (!nombre) { try { nombre = new URL(url).hostname.replace(/^www\./, ''); } catch { nombre = 'Otro vendedor'; } }
    const creado = await em.save(Competidor, em.create(Competidor, { nombre: nombre.slice(0, 120), url, unidades: [], leida_at: null, error: null, leyendo_desde: null, companyId: user.companyId }));
    return this.leer(creado.id, user);
  }

  /** Pone la lectura a correr de fondo y contesta enseguida: la pantalla vuelve a preguntar hasta que termina. */
  async leer(id: string, user: User): Promise<VistaCompetidor> {
    const c = await this.existente(id, user.companyId);
    if (this.leyendo(c)) return this.vista(c);
    await this.dataSource.manager.update(Competidor, { id: c.id }, { leyendo_desde: new Date() });
    void this.leerAhora(c.id, user.companyId);
    return this.vista(await this.existente(id, user.companyId));
  }

  /** La lectura en sí. Nunca tira: lo que falle queda guardado como motivo, y lo leído antes se conserva. */
  private async leerAhora(id: string, companyId: string): Promise<void> {
    const em = this.dataSource.manager;
    try {
      const c = await this.existente(id, companyId);
      const { html, url } = await bajarPagina(c.url);
      const unidades = await this.leerTodo(html, url, companyId);
      if (!unidades.length) {
        await em.update(Competidor, { id }, { leida_at: new Date(), error: 'Abrimos la página pero no reconocimos autos con precio. Probá con la dirección del listado de usados; algunos sitios arman la lista recién en el navegador y no se pueden leer.' });
      } else {
        await this.guardarHistoria(id, companyId, unidades);
        await em.update(Competidor, { id }, { unidades: unidades as never, leida_at: new Date(), error: null });
      }
    } catch (e) {
      const motivo = e instanceof ErrorDeNegocio ? e.message : 'No pudimos leer esa página.';
      if (!(e instanceof ErrorDeNegocio) && !(e instanceof NotFoundException)) this.logger.warn(`Lectura de ${id} falló: ${String((e as Error)?.message ?? e)}`);
      await em.update(Competidor, { id }, { leida_at: new Date(), error: motivo.slice(0, 300) }).catch(() => undefined);
    } finally {
      await em.update(Competidor, { id }, { leyendo_desde: null }).catch(() => undefined);
    }
  }

  /** Varias páginas a la vez, de a pocas para no cargar al otro sitio. Las que fallan se saltean. */
  private async bajarVarias(urls: string[], limite: number): Promise<{ html: string; url: string }[]> {
    const salida: { html: string; url: string }[] = [];
    let i = 0;
    const trabajar = async () => {
      while (i < urls.length && Date.now() < limite) {
        const url = urls[i++];
        try { salida.push(await bajarPagina(url)); } catch { /* ese listado no existe o no se dejó leer */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, urls.length) }, trabajar));
    return salida;
  }

  /**
   * La página cargada y, de ahí, sólo lo que sirve para comparar: el listado de cada modelo que
   * tengo en stock (con sus páginas siguientes). Sin stock, las páginas siguientes del listado general.
   */
  private async leerTodo(html: string, url: string, companyId: string): Promise<UnidadAjena[]> {
    const limite = Date.now() + TIEMPO_TOTAL_MS;
    const todas = new Map<string, UnidadAjena>();
    const sumar = (lista: UnidadAjena[]) => { for (const u of lista) { const k = claveDe(u); if (!todas.has(k) && todas.size < MAXIMO_UNIDADES) todas.set(k, u); } };
    sumar(extraerUnidades(html, url));
    const stock = await this.dataSource.manager.find(Unidad, { where: { companyId, estado: In(EN_STOCK) as never }, select: { marca: true, modelo: true } });
    const modelos = [...new Map(stock.map((u) => [`${u.marca} ${u.modelo}`.toLowerCase(), u])).values()].slice(0, MAXIMO_MODELOS);
    const vistas = new Set([url]);
    const nuevas = (lista: string[]) => lista.filter((x) => !vistas.has(x) && vistas.add(x));
    if (!modelos.length) {
      for (const p of await this.bajarVarias(nuevas(paginasSiguientes(html, url, PAGINAS_SIN_STOCK)), limite)) sumar(extraerUnidades(p.html, p.url));
      return [...todas.values()];
    }
    const deModelos = await this.bajarVarias(nuevas(modelos.map((u) => listadoDeModelo(html, url, u.marca, u.modelo))), limite);
    for (const p of deModelos) sumar(extraerUnidades(p.html, p.url));
    const siguientes = nuevas(deModelos.flatMap((p) => paginasSiguientes(p.html, p.url, PAGINAS_POR_MODELO)));
    for (const p of await this.bajarVarias(siguientes, limite)) sumar(extraerUnidades(p.html, p.url));
    return [...todas.values()];
  }

  private aGuardado(a: AvisoAjeno): AvisoGuardado {
    return { ...a, precio: Number(a.precio), precio_anterior: a.precio_anterior === null ? null : Number(a.precio_anterior), historia: a.historia ?? [] };
  }

  /** Deja anotado qué avisos aparecieron, cuáles cambiaron de precio y cuáles ya no están. */
  private async guardarHistoria(competidorId: string, companyId: string, leidos: UnidadAjena[]): Promise<void> {
    const em = this.dataSource.manager;
    const previos = await em.find(AvisoAjeno, { where: { competidorId } });
    const porClave = new Map(previos.map((p) => [p.clave, p.id]));
    const despues = aplicarLectura(previos.map((p) => this.aGuardado(p)), leidos, new Date());
    await em.save(AvisoAjeno, despues.map((a) => em.create(AvisoAjeno, { ...a, id: porClave.get(a.clave), competidorId, companyId })), { chunk: 100 });
  }

  async quitar(id: string, user: User): Promise<{ ok: true }> {
    const c = await this.existente(id, user.companyId);
    await this.dataSource.transaction(async (em) => {
      await em.delete(AvisoAjeno, { competidorId: c.id });
      await em.delete(Competidor, { id: c.id });
    });
    return { ok: true };
  }

  /** El dólar con el que la agencia compara, guardado para todos sus usuarios. */
  async guardarDolar(dolar: number | null, user: User): Promise<{ dolar: number | null }> {
    await this.dataSource.manager.update(Company, { id: user.companyId }, { dolar_comparacion: dolar });
    return { dolar };
  }

  async comparacion(pedido: number | null, user: User): Promise<VistaComparacion> {
    const em = this.dataSource.manager;
    const companyId = user.companyId;
    const empresa = await em.findOne(Company, { where: { id: companyId }, select: { id: true, dolar_comparacion: true } });
    const dolar = pedido ?? (empresa?.dolar_comparacion ? Number(empresa.dolar_comparacion) : null);
    const competidores = await em.find(Competidor, { where: { companyId }, order: { created_at: 'ASC' } });
    const nombreDe = new Map(competidores.map((c) => [c.id, c.nombre]));
    const stock = await em.find(Unidad, { where: { companyId, estado: In(EN_STOCK) as never }, order: { marca: 'ASC', modelo: 'ASC', anio: 'DESC' } });
    const mias: UnidadPropia[] = stock.map((u) => ({
      id: u.id, numero: u.numero, marca: u.marca, modelo: u.modelo, version: u.version, anio: u.anio, km: u.km,
      precio: u.precio_venta === null ? null : Number(u.precio_venta), moneda: u.moneda as 'ARS' | 'USD', transmision: u.transmision,
    }));
    // El mismo aviso puede venir de dos páginas cargadas (un listado y una publicación suelta): cuenta una vez.
    const vistos = new Set<string>();
    const ajenas = competidores.flatMap((c) => (c.unidades ?? []).map((u) => ({ ...u, fuente: c.nombre }))).filter((u) => {
      const clave = claveDe(u);
      return !vistos.has(clave) && !!vistos.add(clave);
    });

    // La historia sólo de los avisos de modelos que tengo: es lo que importa y lo que entra en pantalla.
    const guardados = (await em.find(AvisoAjeno, { where: { companyId } })).map((a) => ({ ...this.aGuardado(a), fuente: nombreDe.get(a.competidorId) ?? '', competidorId: a.competidorId }));
    // La primera lectura de cada vendedor trae todo «nuevo»: eso no es una novedad.
    const primeraLectura = new Map<string, number>();
    for (const a of guardados) primeraLectura.set(a.competidorId, Math.min(primeraLectura.get(a.competidorId) ?? Infinity, a.primera_vez_at.getTime()));
    const deMisModelos = guardados.filter((a) => mias.some((m) => esComparable(m, a)));
    const desde = new Date(Date.now() - DIAS_DE_NOVEDADES * DIA);
    const novedades = novedadesDesde(deMisModelos, desde)
      .map((n) => ({ n, de: deMisModelos.find((a) => a.url === n.url && a.titulo === n.titulo && a.km === n.km) }))
      .filter(({ n, de }) => !(n.tipo === 'nuevo' && de && n.fecha.getTime() - (primeraLectura.get(de.competidorId) ?? 0) < 10 * 60_000))
      .slice(0, 60)
      .map(({ n, de }) => ({ ...n, fuente: de?.fuente ?? '' }));
    const masViejo = guardados.reduce((min, a) => (a.primera_vez_at < min ? a.primera_vez_at : min), new Date());
    const tendenciaDe = (m: UnidadPropia): Tendencia | null => {
      // Se compara contra la lectura más vieja que haya dentro de los 30 días, y sólo si pasó al menos una semana.
      const antes = masViejo > desde ? masViejo : desde;
      const dias = Math.round((Date.now() - antes.getTime()) / DIA);
      if (dias < 7) return null;
      const delModelo = guardados.filter((a) => a.moneda === (guardados.find((x) => esComparable(m, x))?.moneda ?? a.moneda) && esComparable(m, a));
      const [p0, p1] = [delModelo.map((a) => precioAl(a, antes)).filter((p): p is number => p !== null), delModelo.filter((a) => a.activo).map((a) => a.precio)];
      const [m0, m1] = [mediana(p0), mediana(p1)];
      if (p0.length < 2 || p1.length < 2 || !m0 || !m1) return null;
      return { antes: m0, ahora: m1, variacion_pct: Math.round(((m1 - m0) / m0) * 1000) / 10, dias };
    };

    return {
      competidores: competidores.map((c) => this.vista(c)),
      dolar,
      mios: mias.map((m) => ({ ...comparar(m, ajenas, dolar), tendencia: tendenciaDe(m) })),
      solo_ellos: ajenas.filter((a) => !mias.some((m) => esComparable(m, a))).slice(0, 200),
      novedades,
    };
  }

  /**
   * Todos los días a las 4 de la mañana (07:00 UTC) se releen los vendedores de todas las agencias,
   * de a uno, para que al abrir la pantalla los precios ya estén al día y haya historia que mostrar.
   */
  @Cron('0 7 * * *')
  async releerTodos(): Promise<void> {
    const todos = await this.dataSource.manager.find(Competidor, { select: { id: true, companyId: true }, order: { leida_at: 'ASC' } });
    for (const c of todos) {
      if (!c.companyId) continue;
      await this.dataSource.manager.update(Competidor, { id: c.id }, { leyendo_desde: new Date() });
      await this.leerAhora(c.id, c.companyId);
    }
    if (todos.length) this.logger.log(`Lectura diaria: ${todos.length} vendedores releídos.`);
  }
}
