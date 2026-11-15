import { Injectable } from '@nestjs/common';

/** Lo que no toca la base: el health check de Render (cada pocos segundos) y los preflight de CORS. */
const SIN_BASE = (metodo: string, ruta: string) => metodo === 'OPTIONS' || ruta.startsWith('/api/health');
const LECTURA = new Set(['GET', 'HEAD']);

/**
 * Cuándo llegó el último pedido HTTP y la última escritura, en memoria. Los
 * cron lo miran para no despertar la base de Neon sin necesidad (ver
 * `actividad.util.ts`). Una sola instancia: Render corre un proceso.
 */
@Injectable()
export class ActividadService {
  ultimaActividad: number | null = null;
  ultimaEscritura: number | null = null;

  registrar(metodo: string, ruta: string, ahora = Date.now()): void {
    if (SIN_BASE(metodo, ruta)) return;
    this.ultimaActividad = ahora;
    if (!LECTURA.has(metodo)) this.ultimaEscritura = ahora;
  }
}
