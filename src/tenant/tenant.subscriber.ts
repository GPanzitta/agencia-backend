import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { tenantContext } from './tenant.context';
import { Injectable } from '@nestjs/common';

@Injectable()
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  constructor(private dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<any>) {
    const companyId = tenantContext.getStore();
    if (companyId && event.metadata && event.entity) {
      const hasCompanyId = event.metadata.columns.some(col => col.propertyName === 'companyId') || 
                           event.metadata.relations.some(rel => rel.propertyName === 'company');
      
      if (hasCompanyId && !event.entity.companyId && !event.entity.company) {
        event.entity.companyId = companyId;
      }
    }
  }
}
