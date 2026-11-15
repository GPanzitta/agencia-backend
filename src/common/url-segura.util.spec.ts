import { esInitPointDeMp, motivoUrlInsegura, urlSeguraONull } from './url-segura.util';

describe('motivoUrlInsegura (SEG-46)', () => {
  it('una https común pasa', () => {
    expect(motivoUrlInsegura('https://instagram.com/taller')).toBeNull();
    expect(motivoUrlInsegura('https://maps.google.com/?cid=123')).toBeNull();
  });

  it('dice qué está mal', () => {
    expect(motivoUrlInsegura('http://taller.com')).toBe('tiene que empezar con https://');
    expect(motivoUrlInsegura('javascript:alert(1)')).toBe('tiene que empezar con https://');
    expect(motivoUrlInsegura('https://taller@otro-host.com')).toMatch(/usuario ni clave/);
    expect(motivoUrlInsegura('https://a:b@otro-host.com/x')).toMatch(/usuario ni clave/);
    expect(motivoUrlInsegura('https:///otro')).toMatch(/sitio válido/);
    expect(motivoUrlInsegura('https://taller.com/a b')).toMatch(/espacios/);
    expect(motivoUrlInsegura('')).toBe('falta la dirección');
  });

  it('una @ después del sitio (en la ruta) no es credencial', () => {
    expect(motivoUrlInsegura('https://www.tiktok.com/@taller')).toBeNull();
  });

  it('urlSeguraONull descarta lo inseguro', () => {
    expect(urlSeguraONull('https://maps.google.com/x')).toBe('https://maps.google.com/x');
    expect(urlSeguraONull('javascript:alert(1)')).toBeNull();
  });
});

describe('esInitPointDeMp (SEG-46)', () => {
  it('sólo https de mercadopago.com o .com.ar', () => {
    expect(esInitPointDeMp('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1')).toBe(true);
    expect(esInitPointDeMp('https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=1')).toBe(true);
    expect(esInitPointDeMp('https://mercadopago.com/x')).toBe(true);
  });

  it('otro host, http o con credenciales: no', () => {
    expect(esInitPointDeMp('https://mercadopago.com.ar.estafa.com/x')).toBe(false);
    expect(esInitPointDeMp('https://estafamercadopago.com/x')).toBe(false);
    expect(esInitPointDeMp('http://www.mercadopago.com.ar/x')).toBe(false);
    expect(esInitPointDeMp('https://www.mercadopago.com.ar@estafa.com/x')).toBe(false);
    expect(esInitPointDeMp(undefined)).toBe(false);
  });
});
