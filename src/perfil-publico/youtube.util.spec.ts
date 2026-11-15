import { idDeYoutube } from './youtube.util';

/**
 * El taller pega lo que le da el botón "Compartir" de YouTube, que según desde
 * dónde comparta puede ser cualquiera de estas cinco formas. Todas tienen que
 * terminar en el mismo id de 11 caracteres.
 */
describe('idDeYoutube', () => {
  it('acepta las cinco formas en que YouTube comparte un video', () => {
    expect(idDeYoutube('https://www.youtube.com/watch?v=0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('https://youtu.be/0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('https://www.youtube.com/shorts/0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('https://www.youtube.com/embed/0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('0MELX_vb0qY')).toBe('0MELX_vb0qY');
  });

  it('ignora lo que YouTube le cuelga al enlace (tiempo, lista, canal)', () => {
    expect(idDeYoutube('https://youtu.be/0MELX_vb0qY?t=42')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('https://www.youtube.com/watch?v=0MELX_vb0qY&list=PL123&index=2')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('https://m.youtube.com/watch?v=0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('  https://www.youtube.com/watch?v=0MELX_vb0qY  ')).toBe('0MELX_vb0qY');
  });

  it('perdona el enlace pegado sin https://', () => {
    expect(idDeYoutube('www.youtube.com/watch?v=0MELX_vb0qY')).toBe('0MELX_vb0qY');
    expect(idDeYoutube('youtu.be/0MELX_vb0qY')).toBe('0MELX_vb0qY');
  });

  it('rechaza lo que no es un video de YouTube', () => {
    expect(idDeYoutube('https://vimeo.com/76979871')).toBeNull();
    expect(idDeYoutube('https://www.youtube.com/@TallerDemo')).toBeNull();
    expect(idDeYoutube('https://www.youtube.com/watch?v=corto')).toBeNull();
    expect(idDeYoutube('javascript:alert(1)')).toBeNull();
    expect(idDeYoutube('')).toBeNull();
    expect(idDeYoutube('   ')).toBeNull();
  });

  it('un id con caracteres prohibidos no pasa (no se arma un iframe con cualquier cosa)', () => {
    expect(idDeYoutube('https://www.youtube.com/watch?v=abc"><script')).toBeNull();
    expect(idDeYoutube('abc<script>x')).toBeNull();
  });
});
