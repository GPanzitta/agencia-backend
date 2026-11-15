import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { sesionInvalida } from '../sesion.util';
import { rutaPermitidaConClaveProvisoria } from '../clave.util';
import type { CodigoError } from '../../common/errores/codigos';
import { rutaPermitidaEnSoloLectura } from '../../abono/abono.util';
import { EstadoAbonoService } from '../../abono/estado-abono.service';

/** Consultar no escribe nada: en sólo lectura se puede ver y exportar todo. */
const METODOS_DE_CONSULTA = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly estadoAbono: EstadoAbonoService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: configService.get<string>('JWT_SECRET')!,
      // SEG-54: hace falta la URL para la regla de la clave provisoria.
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { id: string; role?: string; tokenVersion?: number }) {
    // Los tokens de clientes web (role: web_customer) no pasan por esta estrategia.
    // Se validan en cada endpoint con extractCustomerId().
    if (payload.role === 'web_customer') return null;

    const { id } = payload;
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });

    // Baja (USUARIO_DADO_DE_BAJA, CLI-04), sesión revocada, sin rol o sin
    // empresa sin ser superadmin (SEG-07: el aislamiento falla cerrado). La
    // misma regla corre en el socket (CLI-05).
    //
    // Un usuario sin rol pasaba igual todos los endpoints que solo exigen estar
    // autenticado (`@Auth()`), que son la mayoría. Y como además solía quedar
    // sin empresa asignada, el filtro por local no se activaba y veía los datos
    // de todos los comercios.
    const invalida = sesionInvalida(user, payload);
    if (invalida) throw new UnauthorizedException(invalida);

    // SEG-54: con la clave provisoria del reseteo, sólo `/auth/me`,
    // `/auth/cambiar-clave` y `/auth/logout`. 403 y no 401: la sesión vale,
    // lo que falta es cambiar la clave (el ERP manda a esa pantalla).
    if (user!.debe_cambiar_clave && !rutaPermitidaConClaveProvisoria(req?.originalUrl ?? req?.url)) {
      throw new ForbiddenException({
        code: 'DEBE_CAMBIAR_CLAVE' satisfies CodigoError,
        message: 'Tenés que cambiar la clave provisoria antes de seguir.',
      });
    }

    // Spec 2026-10-28 §7 y §13.2: un taller que no pagó deja de cargar datos. Va
    // acá porque las rutas públicas del portal no usan JWT: su cliente no se entera.
    if (
      req?.method && !METODOS_DE_CONSULTA.has(req.method) && user!.companyId &&
      !rutaPermitidaEnSoloLectura(req.originalUrl ?? req.url) &&
      (await this.estadoAbono.enSoloLectura(user!.companyId))
    ) {
      throw new ForbiddenException({
        code: 'TALLER_SOLO_LECTURA' satisfies CodigoError,
        message: 'El abono del taller venció: se puede ver y exportar todo, pero no cargar nada nuevo.',
      });
    }

    return user!;
  }
}
