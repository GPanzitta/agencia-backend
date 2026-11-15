import { Body, Controller, Delete, Get, Post, Query, Res } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { Roles } from '../enums/roles.enum';
import { ConexionMpService } from './conexion-mp.service';

class ConfirmarConexionMpDto {
  @IsUUID()
  pendiente: string;
}

/** La conexión de la cuenta de Mercado Pago de cada taller (spec 2026-10-28 §13.1). */
@Controller('mp')
export class MercadoPagoController {
  constructor(private readonly conexion: ConexionMpService) {}

  @Post('oauth/iniciar') @UserProtected(Roles.ADMIN)
  iniciar(@GetUser() user: User) { return { url: this.conexion.urlParaConectar(user.companyId, user.id) }; }

  @Post('oauth/confirmar') @UserProtected(Roles.ADMIN)
  async confirmar(@Body() dto: ConfirmarConexionMpDto, @GetUser() user: User) {
    await this.conexion.confirmar(dto.pendiente, user);
    return { conectada: true };
  }

  /**
   * Público: el navegador vuelve de MP sin JWT. Nunca responde JSON: la persona
   * está en una pestaña del navegador, se la devuelve al ERP con el resultado.
   * Sin DTO a propósito: MP agrega parámetros, y si la persona no autoriza
   * vuelve sin `code`.
   */
  @Get('oauth/callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Res() res: Response) {
    const pantalla = `${process.env.ERP_URL || 'http://localhost:4300'}/home/configuracion/empresa`;
    if (!code || !state) { res.redirect(`${pantalla}?mp_error=MP_OAUTH_INVALIDO`); return; }
    try {
      res.redirect(await this.conexion.callback(code, state));
    } catch (e) {
      res.redirect(`${pantalla}?mp_error=${e instanceof ErrorDeNegocio ? e.codigo : 'MP_NO_DISPONIBLE'}`);
    }
  }

  @Delete('conexion') @UserProtected(Roles.ADMIN)
  async desconectar(@GetUser() user: User) {
    await this.conexion.desconectar(user.companyId);
    return { conectada: false };
  }
}
