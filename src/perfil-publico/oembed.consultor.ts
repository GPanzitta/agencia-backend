/** Lo que `oembed` nos dice de un video. */
export interface DatosOembed {
  titulo: string;
  canal: string;
}

/**
 * Consulta el título y el canal de un video de YouTube (S1c-b §3.2).
 *
 * Es una clase abstracta y no una interfaz porque además de contrato es el
 * TOKEN de inyección de Nest, igual que `FotosAlmacen`. Existe para que el
 * servicio no haga `fetch` adentro: los specs inyectan `ConsultorOembedFalso`
 * y ningún test sale a internet.
 */
export abstract class ConsultorOembed {
  /** `null` = el video no existe, es privado o no permite embebido. */
  abstract consultar(id: string): Promise<DatosOembed | null>;
}

/** Timeout corto a propósito: guardar el formulario no puede quedar colgado. */
const ESPERA_MS = 2_500;

export class ConsultorOembedYoutube extends ConsultorOembed {
  async consultar(id: string): Promise<DatosOembed | null> {
    const video = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${video}&format=json`, {
        signal: AbortSignal.timeout(ESPERA_MS),
      });
      if (!res.ok) return null;
      const cuerpo = (await res.json()) as { title?: unknown; author_name?: unknown };
      if (typeof cuerpo?.title !== 'string' || !cuerpo.title.trim()) return null;
      return {
        titulo: cuerpo.title.trim().slice(0, 200),
        canal: typeof cuerpo.author_name === 'string' ? cuerpo.author_name.trim().slice(0, 120) : '',
      };
    } catch {
      // Timeout, DNS, IP bloqueada por YouTube: para el taller es lo mismo que
      // "ese video no anda", y el 400 se lo dice con la fila señalada.
      return null;
    }
  }
}
