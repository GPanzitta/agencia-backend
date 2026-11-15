import { MIMES_VIDEO, TOPE_VIDEO_BYTES, extensionDeVideo } from './video.util';

describe('extensionDeVideo', () => {
  it('traduce los dos tipos que acepta el sitio', () => {
    expect(extensionDeVideo('video/mp4')).toBe('mp4');
    expect(extensionDeVideo('video/webm')).toBe('webm');
  });

  it('el navegador puede mandar el tipo con parámetros o en mayúsculas', () => {
    expect(extensionDeVideo('VIDEO/MP4')).toBe('mp4');
    expect(extensionDeVideo('video/webm; codecs=vp9')).toBe('webm');
  });

  it('cualquier otro tipo no entra', () => {
    expect(extensionDeVideo('video/quicktime')).toBeNull();
    expect(extensionDeVideo('image/png')).toBeNull();
    expect(extensionDeVideo('')).toBeNull();
  });
});

describe('constantes del video', () => {
  it('25 MB y los dos mime types del spec', () => {
    expect(TOPE_VIDEO_BYTES).toBe(26_214_400);
    expect(MIMES_VIDEO).toEqual(['video/mp4', 'video/webm']);
  });
});
