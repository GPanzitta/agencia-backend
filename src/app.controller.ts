import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { EstadoBase, SaludBaseService } from './salud/salud-base.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly saludBase: SaludBaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Health check para Render (y para probar a mano que el deploy respondió).
  // Sin auth ni DB de por medio: solo confirma que el proceso está arriba.
  @Get('health')
  getHealth(): { ok: boolean } {
    return { ok: true };
  }

  // Para el monitor externo (spec 2026-10-28 §4): ¿contesta la base? 503 con
  // el motivo si no. Render NO mira esta ruta: si la base se cae, reiniciar
  // el proceso no arregla nada. Ver `salud-base.util.ts` sobre no despertarla.
  @Get('health/base')
  async getHealthBase(@Res({ passthrough: true }) res: Response): Promise<EstadoBase> {
    const estado = await this.saludBase.estado();
    if (!estado.ok) res.status(503);
    return estado;
  }
}
