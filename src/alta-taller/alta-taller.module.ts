import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { MailerService } from '../correo/mailer.service';
import { AltaTallerController, RecuperarClaveController } from './alta-taller.controller';
import { AltaTallerService } from './alta-taller.service';
import { RecuperarClaveService } from './recuperar-clave.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AdminModule, AuthModule],
  controllers: [AltaTallerController, RecuperarClaveController],
  providers: [AltaTallerService, RecuperarClaveService, MailerService],
})
export class AltaTallerModule {}
