import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActividadService } from '../common/actividad/actividad.service';
import { baseDespierta } from '../common/actividad/actividad.util';
import { CodigoBase, TOPE_CONSULTA_DORMIDA_MS, TOPE_CONSULTA_MS, UltimaConsulta, codigoDeError, tocaConsultarBase } from './salud-base.util';

const MENSAJES: Record<CodigoBase, (topeMs: number) => string> = {
  BASE_SIN_CUOTA: () => 'La base de datos se quedó sin cuota de cómputo',
  BASE_SIN_RESPUESTA: (topeMs) => `La base de datos no respondió en ${topeMs / 1000} segundos`,
  BASE_CON_ERROR: () => 'La base de datos devolvió un error',
};

type Consulta = UltimaConsulta & { code?: CodigoBase; topeMs: number };

export interface EstadoBase {
  ok: boolean;
  code?: CodigoBase;
  message?: string;
  consultada_hace_s: number;
}

/** Lo que contesta `/api/health/base`; la regla de cuándo consultar está en `salud-base.util.ts`. */
@Injectable()
export class SaludBaseService {
  private ultima: Consulta | null = null;
  /** La consulta que está corriendo: dos chequeos a la vez la comparten. */
  private enCurso: Promise<Consulta> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly actividad: ActividadService,
  ) {}

  async estado(): Promise<EstadoBase> {
    const ahora = Date.now();
    if (tocaConsultarBase({ ahora, ultima: this.ultima, ultimaActividad: this.actividad.ultimaActividad })) {
      this.enCurso ??= this.consultar(baseDespierta(ahora, this.actividad.ultimaActividad) ? TOPE_CONSULTA_MS : TOPE_CONSULTA_DORMIDA_MS)
        .finally(() => { this.enCurso = null; });
      this.ultima = await this.enCurso;
    }
    const u = this.ultima as Consulta;
    const consultada_hace_s = Math.round((Date.now() - u.en) / 1000);
    return u.ok ? { ok: true, consultada_hace_s } : { ok: false, code: u.code, message: MENSAJES[u.code as CodigoBase](u.topeMs), consultada_hace_s };
  }

  private async consultar(topeMs: number): Promise<Consulta> {
    let tope: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, rechazar) => { tope = setTimeout(() => rechazar(new Error('TIMEOUT_BASE')), topeMs); }),
      ]);
      return { en: Date.now(), ok: true, topeMs };
    } catch (e) {
      return { en: Date.now(), ok: false, code: codigoDeError(e), topeMs };
    } finally {
      clearTimeout(tope);
    }
  }
}
