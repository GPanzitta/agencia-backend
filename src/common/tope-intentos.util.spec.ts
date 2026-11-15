import { TopeIntentos, agruparIp } from './tope-intentos.util';

describe('TopeIntentos (SEG-04)', () => {
  it('bloquea a los N fallos y libera al vencer la ventana', () => {
    let t = 0;
    const tope = new TopeIntentos(3, 1000, () => t);
    expect(tope.bloqueada('o1')).toBe(false);
    tope.registrarFallo('o1');
    tope.registrarFallo('o1');
    expect(tope.bloqueada('o1')).toBe(false);
    tope.registrarFallo('o1');
    expect(tope.bloqueada('o1')).toBe(true);
    expect(tope.bloqueada('o2')).toBe(false);
    t = 1000;
    expect(tope.bloqueada('o1')).toBe(false);
  });

  it('purga lo vencido cuando llega al techo de claves', () => {
    let t = 0;
    const tope = new TopeIntentos(1, 10, () => t, 2);
    tope.registrarFallo('a');
    tope.registrarFallo('b');
    t = 20;
    tope.registrarFallo('c');
    expect((tope as any).fallos.size).toBe(1);
  });
});

describe('agruparIp (SEG-04, IPv6 por /64)', () => {
  it('IPv4 queda igual, también la mapeada', () => {
    expect(agruparIp('200.1.2.3')).toBe('200.1.2.3');
    expect(agruparIp('::ffff:200.1.2.3')).toBe('200.1.2.3');
  });

  it('dos IPv6 del mismo /64 caen en el mismo balde', () => {
    const a = agruparIp('2800:810:4a2:1234:aaaa:bbbb:cccc:1');
    const b = agruparIp('2800:0810:04a2:1234::99');
    expect(a).toBe('2800:810:4a2:1234::/64');
    expect(b).toBe(a);
    expect(agruparIp('2800:810:4a2:1235::1')).not.toBe(a);
  });

  it('abreviada al principio', () => {
    expect(agruparIp('::1')).toBe('0:0:0:0::/64');
  });
});
