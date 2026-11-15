import { Logger } from '@nestjs/common';
import { LoggerEnmascarado } from './logger-enmascarado';

describe('LoggerEnmascarado', () => {
  it('lo que escribe cualquier servicio sale sin correos, DNI ni tokens', () => {
    const salida: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      salida.push(String(s));
      return true;
    });
    const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation((s: any) => {
      salida.push(String(s));
      return true;
    });
    try {
      Logger.overrideLogger(new LoggerEnmascarado());
      const log = new Logger('Prueba');
      log.warn('duplicate key: Key (email)=(marta@gmail.com) ya existe; dni 30123456');
      log.error('MP falló', 'Authorization: Bearer eyJhbGciOi.abc.def token APP_USR-1234567890-xyz');
    } finally {
      spy.mockRestore();
      spyErr.mockRestore();
      Logger.overrideLogger(true as any);
    }
    const todo = salida.join('');
    expect(todo).toContain('Prueba');
    expect(todo).not.toContain('marta@gmail.com');
    expect(todo).not.toContain('30123456');
    expect(todo).not.toContain('eyJhbGciOi');
    expect(todo).not.toContain('1234567890');
  });
});
