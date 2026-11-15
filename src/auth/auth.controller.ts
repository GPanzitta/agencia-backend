import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../enums/roles.enum';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { UserProtected } from './decorators/user-protected.decorator';
import { LoginAuthDto } from './dto/login-auth.dto';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { CambiarEstadoUsuarioDto } from './dto/cambiar-estado-usuario.dto';
import { CambiarRolUsuarioDto } from './dto/cambiar-rol-usuario.dto';
import { CambiarClaveDto } from './dto/cambiar-clave.dto';
import { User } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Alta de empleados. Solo un admin o superadmin puede crearlos, y el
   * usuario nuevo queda en la empresa de quien lo dio de alta.
   *
   * Antes era público. Cualquiera desde internet se registraba, recibía un token
   * válido y —al quedar sin empresa asignada, lo que desactiva el filtro por
   * local— leía clientes, ventas y productos de TODOS los comercios del sistema.
   */
  @Post('register')
  @UserProtected(Roles.ADMIN)
  register(@Body() registerDto: RegisterAuthDto, @GetUser() creador: User) {
    return this.authService.register(registerDto, creador);
  }

  /**
   * Anti fuerza bruta: 5 intentos por minuto POR CUENTA.
   *
   * Antes se contaba por IP, y en un taller todas las terminales salen por la
   * misma: al entrar los seis puestos en el cambio de turno, el último quedaba
   * bloqueado un minuto sin haber fallado nada (pasó en la demo, con 429 al
   * sexto login). `TenantThrottlerGuard` cuenta por email + IP, que es lo que
   * el límite realmente quiere frenar.
   */
  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  login(@Body() loginDto: LoginAuthDto) {
    return this.authService.login(loginDto);
  }

  /**
   * GET /api/auth/me — usuario de la sesión actual.
   *
   * Sirve para dos cosas en el ERP: saber el rol (y con eso mostrar solo lo que
   * corresponde a cada perfil) y validar de verdad el token contra el servidor
   * al arrancar la aplicación, en vez de dar por bueno cualquier string que
   * haya quedado en localStorage.
   */
  @Get('me')
  @Auth()
  me(@GetUser() user: User) {
    return this.authService.me(user);
  }

  /** GET /api/auth/usuarios — empleados del local. */
  @Get('usuarios')
  @UserProtected(Roles.ADMIN)
  listarUsuarios() {
    return this.authService.listarUsuarios();
  }

  /** PATCH /api/auth/usuarios/:id/activo — alta o baja lógica de un empleado. */
  @Patch('usuarios/:id/activo')
  @UserProtected(Roles.ADMIN)
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoUsuarioDto,
    @GetUser() quienPide: User,
  ) {
    return this.authService.cambiarEstadoUsuario(id, dto.activo, quienPide);
  }

  /**
   * PATCH /api/auth/usuarios/:id/rol — cambia el rol de un empleado.
   * Revoca sus sesiones vigentes: permisos nuevos exigen token nuevo.
   */
  @Patch('usuarios/:id/rol')
  @UserProtected(Roles.ADMIN)
  cambiarRol(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarRolUsuarioDto,
    @GetUser() quienPide: User,
  ) {
    return this.authService.cambiarRolUsuario(id, dto.rol, quienPide);
  }

  /**
   * POST /api/auth/cambiar-clave — SEG-54: «Cambiar mi clave». Pide la actual
   * y cierra todas las sesiones de la cuenta; devuelve un token nuevo para el
   * equipo que la cambió. Mismo tope que el login (5 por minuto), contado por
   * sesión y no por IP (`TenantThrottlerGuard`): adivinar la clave actual con
   * un token robado queda igual de frenado que adivinarla en el login.
   */
  @Post('cambiar-clave')
  @HttpCode(200)
  @Auth()
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  cambiarClave(@Body() dto: CambiarClaveDto, @GetUser() user: User, @Ip() ip: string) {
    return this.authService.cambiarClave(user, dto, ip);
  }

  /**
   * POST /api/auth/usuarios/:id/resetear-clave — SEG-54: el admin le pone una
   * clave provisoria a un empleado de su taller. La provisoria vuelve una sola
   * vez en esta respuesta; el empleado la cambia al entrar. Con tope, para que
   * una sesión de admin robada no resetee el taller entero de un saque.
   */
  @Post('usuarios/:id/resetear-clave')
  @HttpCode(200)
  @UserProtected(Roles.ADMIN)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  resetearClave(@Param('id', ParseUUIDPipe) id: string, @GetUser() quienPide: User, @Ip() ip: string) {
    return this.authService.resetearClave(id, quienPide, ip);
  }

  /**
   * POST /api/auth/logout — cierra la sesión de verdad.
   *
   * "Cerrar sesión" antes era borrar el token del lado del cliente y nada más:
   * ese mismo token seguía siendo válido en el servidor hasta que expirara —
   * hasta 5 días en producción, sin límite en desarrollo. Si el dispositivo se
   * perdía después de un logout, el token robado seguía funcionando.
   */
  @Post('logout')
  @Auth()
  async logout(@GetUser() user: User) {
    await this.authService.logout(user.id);
    return { message: 'Sesión cerrada' };
  }

}
