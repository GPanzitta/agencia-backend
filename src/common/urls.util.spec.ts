import { urlPublicaDeLaApi, urlPublicaDelPortal } from './urls.util';

describe('urls.util', () => {
  const original = { portal: process.env.PORTAL_URL, api: process.env.API_PUBLIC_URL };

  /**
   * `process.env.X = undefined` guarda el STRING "undefined": hay que borrar
   * la clave. Jest comparte el `process` entre los specs de un mismo worker,
   * así que dejarla sucia ensucia a los que corran después.
   */
  function restaurar(clave: 'PORTAL_URL' | 'API_PUBLIC_URL', valor: string | undefined): void {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }

  afterEach(() => {
    restaurar('PORTAL_URL', original.portal);
    restaurar('API_PUBLIC_URL', original.api);
  });

  it('sin variables de entorno apunta al desarrollo local', () => {
    delete process.env.PORTAL_URL;
    delete process.env.API_PUBLIC_URL;
    expect(urlPublicaDelPortal()).toBe('http://localhost:3201');
    expect(urlPublicaDeLaApi()).toBe('http://localhost:3100/api');
  });

  it('usa las variables cuando están', () => {
    process.env.PORTAL_URL = 'https://taller-portal.vercel.app';
    process.env.API_PUBLIC_URL = 'https://taller-backend.onrender.com/api';
    expect(urlPublicaDelPortal()).toBe('https://taller-portal.vercel.app');
    expect(urlPublicaDeLaApi()).toBe('https://taller-backend.onrender.com/api');
  });

  it('saca la barra final: el que carga la variable no tiene por qué saber que se concatena', () => {
    process.env.PORTAL_URL = 'https://taller-portal.vercel.app/';
    process.env.API_PUBLIC_URL = 'https://taller-backend.onrender.com/api/';
    expect(urlPublicaDelPortal()).toBe('https://taller-portal.vercel.app');
    expect(urlPublicaDeLaApi()).toBe('https://taller-backend.onrender.com/api');
  });

  it('una variable vacía vale como ausente', () => {
    process.env.PORTAL_URL = '';
    expect(urlPublicaDelPortal()).toBe('http://localhost:3201');
  });

  it('se lee en cada llamada: cambiar la variable cambia el resultado', () => {
    process.env.PORTAL_URL = 'https://uno.example';
    expect(urlPublicaDelPortal()).toBe('https://uno.example');
    process.env.PORTAL_URL = 'https://dos.example';
    expect(urlPublicaDelPortal()).toBe('https://dos.example');
  });

  it('el afterEach deja el entorno como estaba: una variable ausente no queda como el texto "undefined"', () => {
    delete process.env.PORTAL_URL;
    restaurar('PORTAL_URL', undefined);
    expect('PORTAL_URL' in process.env).toBe(false);
    restaurar('PORTAL_URL', 'https://x.example');
    expect(process.env.PORTAL_URL).toBe('https://x.example');
  });
});
