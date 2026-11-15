import { ConsultorOembed, DatosOembed } from './oembed.consultor';

/**
 * El consultor de mentira de los specs: devuelve lo que le cargaron y anota a
 * quién le preguntaron, que es como se verifica que un video ya guardado NO se
 * vuelve a consultar.
 */
export class ConsultorOembedFalso extends ConsultorOembed {
  readonly consultados: string[] = [];

  constructor(private readonly conocidos: Record<string, DatosOembed> = {}) {
    super();
  }

  async consultar(id: string): Promise<DatosOembed | null> {
    this.consultados.push(id);
    return this.conocidos[id] ?? null;
  }
}
