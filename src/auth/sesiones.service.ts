import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * CLI-05: avisa que las sesiones de un usuario se revocaron (baja, cambio de
 * rol, cerrar sesión), para que el socket lo corte en el momento. Vive en
 * AuthModule para no atar AuthService al gateway: EventsModule ya importa
 * AuthModule, y lo inverso armaba un ciclo.
 */
@Injectable()
export class SesionesService {
  private readonly revocadas = new Subject<string>();

  get revocadas$(): Observable<string> {
    return this.revocadas.asObservable();
  }

  revocar(userId: string): void {
    this.revocadas.next(userId);
  }
}
