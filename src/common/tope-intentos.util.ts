/**
 * Tope de intentos fallidos por clave (SEG-04), en memoria.
 *
 * El rate limit general cuenta por IP: con rotación de direcciones (un /64 de
 * IPv6 alcanza) se podía probar los 10.000 finales de teléfono contra UNA
 * orden. Esto cuenta los fallos por la cosa atacada —la orden—, sea cual sea
 * la IP: a los `maxFallos` dentro de la ventana, la clave queda bloqueada
 * hasta que vence la ventana del primer fallo.
 *
 * En memoria a propósito: el backend corre en una sola instancia y un
 * reinicio sólo le devuelve al atacante 5 intentos más. Las claves son ids de
 * órdenes reales (no texto del visitante), así que el mapa no crece sin techo;
 * igual se purga lo vencido cuando pasa de `maxClaves`.
 */
export class TopeIntentos {
  private readonly fallos = new Map<string, { cuenta: number; vence: number }>();

  constructor(
    private readonly maxFallos: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = () => Date.now(),
    private readonly maxClaves = 10_000,
  ) {}

  bloqueada(clave: string): boolean {
    const f = this.vigente(clave);
    return !!f && f.cuenta >= this.maxFallos;
  }

  registrarFallo(clave: string): void {
    const f = this.vigente(clave);
    if (f) {
      f.cuenta += 1;
      return;
    }
    if (this.fallos.size >= this.maxClaves) this.purgar();
    this.fallos.set(clave, { cuenta: 1, vence: this.ahora() + this.ventanaMs });
  }

  private vigente(clave: string) {
    const f = this.fallos.get(clave);
    if (!f) return null;
    if (f.vence <= this.ahora()) {
      this.fallos.delete(clave);
      return null;
    }
    return f;
  }

  private purgar() {
    const t = this.ahora();
    for (const [k, f] of this.fallos) if (f.vence <= t) this.fallos.delete(k);
  }
}

/**
 * Agrupa la IP para el rate limit (SEG-04, punto 2): una IPv6 se cuenta por su
 * /64, que es lo que un proveedor le da a UN cliente; contar por dirección
 * exacta le regalaba 2^64 baldes. IPv4 (y la IPv4 mapeada `::ffff:a.b.c.d`)
 * queda igual.
 */
export function agruparIp(ip: string): string {
  const limpia = (ip ?? '').trim().toLowerCase();
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(limpia);
  if (mapeada) return mapeada[1];
  if (!limpia.includes(':')) return limpia;
  const sinZona = limpia.split('%')[0];
  const [izq, der] = sinZona.split('::');
  const grupos = (s: string | undefined) => (s ? s.split(':').filter(Boolean) : []);
  const a = grupos(izq);
  const b = der === undefined ? [] : grupos(der);
  const faltan = Math.max(0, 8 - a.length - b.length);
  const todos = der === undefined ? a : [...a, ...Array(faltan).fill('0'), ...b];
  if (todos.length < 4) return limpia;
  return todos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
