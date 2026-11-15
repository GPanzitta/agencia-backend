import { Global, Module } from '@nestjs/common';
import { ActividadService } from './actividad.service';

@Global()
@Module({ providers: [ActividadService], exports: [ActividadService] })
export class ActividadModule {}
