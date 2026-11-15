import { Module } from '@nestjs/common';
import { SaludBaseService } from './salud-base.service';

@Module({ providers: [SaludBaseService], exports: [SaludBaseService] })
export class SaludModule {}
