import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { MailerService } from '../correo/mailer.service';
import { Interesado } from '../interesados/interesado.entity';
import { Operacion } from '../unidades/entities/operacion.entity';
import { Unidad } from '../unidades/entities/unidad.entity';
import { MensajeEnviado } from './entities/mensaje-enviado.entity';
import { MensajePlantilla } from './entities/mensaje-plantilla.entity';
import { MensajesController, PlantillasController } from './mensajes.controller';
import { MensajesService } from './mensajes.service';

/** Mensajes al cliente por WhatsApp y correo, con plantillas por agencia (14/11/2026). */
@Module({
  imports: [TypeOrmModule.forFeature([MensajePlantilla, MensajeEnviado, Interesado, Operacion, Unidad, Company]), AuthModule],
  controllers: [PlantillasController, MensajesController],
  providers: [MensajesService, MailerService],
})
export class MensajesModule {}
