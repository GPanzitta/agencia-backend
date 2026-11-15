import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SesionesService } from './sesiones.service';
import { EstadoAbonoModule } from '../abono/estado-abono.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    EstadoAbonoModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('STAGE') === 'prod';

        return {
          secret: configService.get('JWT_SECRET'),
          // SEG-32: siempre vence (antes, en dev no vencía nunca: si producción
          // quedaba sin STAGE=prod, las sesiones eran eternas). Algoritmo fijo.
          signOptions: { expiresIn: isProd ? '5d' : '30d', algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, SesionesService],
  controllers: [AuthController],
  exports: [JwtStrategy, PassportModule, JwtModule, TypeOrmModule, SesionesService],
})
export class AuthModule {}
