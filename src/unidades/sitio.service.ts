import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull, Not } from 'typeorm';

import { Company } from '../companies/entities/company.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { ConfigurarSitioDto } from './dto/unidades.dtos';
import { slugLibre, slugValido } from './sitio.util';
import { ReservaDelSitio, problemaDeReserva } from '../interesados/reservas-web.util';

/**
 * De qué agencia es el sitio que se está mirando (tanda 2, 12/11/2026). Un
 * solo sitio sirve a todas: cada una entra por su dirección (`perez.dominio`)
 * y el sitio le manda esa dirección al backend en la cabecera `x-agencia`.
 * Sin cabecera se comporta como antes: la empresa única o `SHOP_COMPANY_ID`.
 */
@Injectable()
export class SitioService {
  private empresaUnicaCache: string | null = null;

  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService) { }

  /**
   * Sin cabecera: `SHOP_COMPANY_ID` dice de quién es el sitio; sin la variable y
   * con una sola empresa en la base se resuelve sola. Con varias se planta:
   * elegir una al azar publicaría el catálogo del vecino.
   */
  private async empresaUnica(): Promise<string> {
    if (this.empresaUnicaCache) return this.empresaUnicaCache;
    const m = this.dataSource.manager;
    const configurada = this.config.get<string>('SHOP_COMPANY_ID');
    if (configurada) {
      const existe = await m.findOne(Company, { where: { id: configurada }, select: { id: true } });
      if (existe) return (this.empresaUnicaCache = existe.id);
    }
    const algunas = await m.find(Company, { select: { id: true }, take: 2 });
    if (algunas.length >= 1) return (this.empresaUnicaCache = algunas[0].id);
    throw new ServiceUnavailableException('El sitio no tiene agencia configurada: falta SHOP_COMPANY_ID');
  }

  async empresaDe(cabecera: string | null | undefined): Promise<string> {
    if (!cabecera) return this.empresaUnica();
    const slug = slugValido(cabecera);
    const empresa = slug ? await this.dataSource.manager.findOne(Company, { where: { slug }, select: { id: true } }) : null;
    if (!empresa) throw new NotFoundException('No hay ninguna agencia en esa dirección.');
    if (!empresa) {
      const algunas = await this.dataSource.manager.find(Company, { select: { id: true }, take: 2 });
      if (algunas.length === 1) return algunas[0].id;
      throw new NotFoundException('No hay ninguna agencia en esa dirección.');
    }
    return empresa.id;
  }

  /** La dirección de esta agencia; si todavía no tiene, se le asigna una libre a partir de su nombre. */
  async direccionDe(companyId: string): Promise<SitioDeAgencia> {
    return this.dataSource.transaction(async (em) => {
      const empresa = await em.findOne(Company, { where: { id: companyId }, lock: { mode: 'pessimistic_write' } });
      if (!empresa) throw new NotFoundException('La sesión no tiene empresa asignada');
      if (empresa.slug) return { slug: empresa.slug, muestra_papeles: empresa.sitio_muestra_papeles, financiacion: empresa.sitio_financiacion ?? null, reserva: empresa.sitio_reserva ?? null };
      const ocupados = await em.find(Company, { where: { slug: Not(IsNull()) }, select: { id: true, slug: true } });
      const slug = slugLibre(empresa.name, ocupados.map((c) => c.slug as string));
      await em.update(Company, { id: empresa.id }, { slug });
      return { slug, muestra_papeles: empresa.sitio_muestra_papeles, financiacion: empresa.sitio_financiacion ?? null, reserva: empresa.sitio_reserva ?? null };
    });
  }

  /** Si el sitio de esta agencia muestra el estado de los papeles de cada auto. */
  async muestraPapeles(companyId: string): Promise<boolean> {
    const empresa = await this.dataSource.manager.findOne(Company, { where: { id: companyId }, select: { id: true, sitio_muestra_papeles: true } });
    return empresa?.sitio_muestra_papeles ?? true;
  }

  /** Las condiciones de financiación del sitio de esta agencia; `null` si no ofrece. */
  async financiacionDe(companyId: string): Promise<Financiacion | null> {
    const empresa = await this.dataSource.manager.findOne(Company, { where: { id: companyId }, select: { id: true, sitio_financiacion: true } });
    return empresa?.sitio_financiacion ?? null;
  }

  async configurar(companyId: string, dto: ConfigurarSitioDto): Promise<SitioDeAgencia> {
    const cambios: Partial<Company> = {};
    if (dto.muestra_papeles !== undefined) cambios.sitio_muestra_papeles = dto.muestra_papeles;
    if (dto.financia === false) cambios.sitio_financiacion = null;
    if (dto.financia === true) {
      const plazos = [...new Set(dto.plazos ?? [])].sort((a, b) => a - b);
      const tasa = (v: number | null | undefined) => (v === null || v === undefined ? null : v);
      if (!plazos.length) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá al menos un plazo, en meses.');
      if (tasa(dto.tna_ars) === null && tasa(dto.tna_usd) === null) throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cargá la tasa anual de los autos en pesos, en dólares o las dos.');
      cambios.sitio_financiacion = { anticipo_minimo_pct: dto.anticipo_minimo_pct ?? 0, plazos, tna_ars: tasa(dto.tna_ars), tna_usd: tasa(dto.tna_usd) };
    }
    if (dto.reserva === false) cambios.sitio_reserva = null;
    if (dto.reserva === true) {
      const r: ReservaDelSitio = {
        monto: Number(dto.reserva_monto ?? 0), moneda: dto.reserva_moneda ?? 'ARS',
        horas: dto.reserva_horas ?? 48, dias: dto.reserva_dias ?? 7,
        alias: (dto.reserva_alias ?? '').trim(), titular: (dto.reserva_titular ?? '').trim(),
      };
      const problema = problemaDeReserva(r);
      if (problema) throw new ErrorDeNegocio('DATOS_INVALIDOS', problema);
      cambios.sitio_reserva = r;
    }
    if (Object.keys(cambios).length) await this.dataSource.manager.update(Company, { id: companyId }, cambios);
    return this.direccionDe(companyId);
  }
}

export type Financiacion = NonNullable<Company['sitio_financiacion']>;
export interface SitioDeAgencia { slug: string; muestra_papeles: boolean; financiacion: Financiacion | null; reserva: ReservaDelSitio | null }
