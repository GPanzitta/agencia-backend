import { LIMITE_MAXIMO, limiteSeguro } from './limite.util';

describe('limiteSeguro (SEG-36)', () => {
  it('respeta lo que pide el ERP', () => {
    expect(limiteSeguro('20', 50)).toBe(20);
    expect(limiteSeguro(100, 50)).toBe(100);
  });

  it('sin valor, basura, cero o negativo: el de por defecto', () => {
    expect(limiteSeguro(undefined, 50)).toBe(50);
    expect(limiteSeguro('abc', 50)).toBe(50);
    expect(limiteSeguro('0', 50)).toBe(50);
    expect(limiteSeguro('-5', 50)).toBe(50);
    expect(limiteSeguro(['1', '2'], 50)).toBe(1);
  });

  it('nunca más que el tope', () => {
    expect(limiteSeguro('10000000', 50)).toBe(LIMITE_MAXIMO);
    expect(limiteSeguro('Infinity', 50)).toBe(50);
  });
});
