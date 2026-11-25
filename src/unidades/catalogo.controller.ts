import { Controller, Get, Headers, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { DataSource } from 'typeorm';

import { PerfilPublicoService } from '../perfil-publico/perfil-publico.service';
import { CatalogoService } from './catalogo.service';
import { SitioService } from './sitio.service';

/** Catálogo público de autos: sin login. Lo consume el sitio de la agencia. */
@Controller('catalogo')
@Throttle({ short: { ttl: 1000, limit: 60 }, medium: { ttl: 60000, limit: 1500 } })
export class CatalogoController {
  constructor(
    private readonly service: CatalogoService,
    private readonly sitio: SitioService,
    private readonly perfil: PerfilPublicoService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lo que cuesta el producto, para la página donde una agencia nueva se registra: cuántas
   * unidades en stock entran en el plan gratis y cuánto sale el plan pago. Es información
   * pública (es la lista de precios); la define el dueño de la plataforma en su panel.
   */
  @Get('plan')
  async plan(): Promise<{ unidades_gratis: number; precio_mensual: number } | null> {
    const filas = await this.dataSource.query(`SELECT "tope_ordenes_gratis", "precio_mensual" FROM "plataforma_config" WHERE "id" = 1`);
    if (!filas?.[0]) return null;
    return { unidades_gratis: Number(filas[0].tope_ordenes_gratis), precio_mensual: Number(filas[0].precio_mensual) };
  }

  /** Los datos públicos de la agencia dueña del sitio que se mira (nombre, contacto, horarios). */
  @Get('perfil')
  async perfilDeLaAgencia(@Headers('x-agencia') agencia?: string) {
    return this.perfil.publico(await this.sitio.empresaDe(agencia));
  }

  @Get('unidades')
  async listar(
    @Headers('x-agencia') agencia?: string,
    @Query('marca') marca?: string,
    @Query('carroceria') carroceria?: string,
    @Query('combustible') combustible?: string,
    @Query('transmision') transmision?: string,
    @Query('condicion') condicion?: string,
    @Query('q') q?: string,
  ) {
    const corto = (v?: string) => (typeof v === 'string' ? v.slice(0, 80) : undefined);
    return this.service.listar(await this.sitio.empresaDe(agencia), {
      marca: corto(marca), carroceria: corto(carroceria), combustible: corto(combustible),
      transmision: corto(transmision), condicion: corto(condicion), q: corto(q),
    });
  }

  @Get('unidades/:id')
  async obtener(@Param('id', ParseUUIDPipe) id: string, @Headers('x-agencia') agencia?: string) {
    return this.service.obtener(await this.sitio.empresaDe(agencia), id);
  }

  /** Seguimiento público en vivo para el dueño que dejó su auto en consignación. */
  @Get('consignacion/:id')
  async consignacion(@Param('id', ParseUUIDPipe) id: string, @Headers('x-agencia') agencia?: string) {
    return this.service.consignacion(await this.sitio.empresaDe(agencia), id);
  }

  /** Seguimiento público en vivo de una Orden de Venta (OV) para el comprador (escaneando el QR de su OV). */
  @Get('ov/:id')
  async ordenDeVenta(@Param('id', ParseUUIDPipe) id: string, @Headers('x-agencia') agencia?: string) {
    return this.service.ordenDeVentaPublica(await this.sitio.empresaDe(agencia), id);
  }
}
