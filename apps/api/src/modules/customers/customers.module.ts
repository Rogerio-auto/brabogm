import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CaktoImportExecutor } from './cakto-import-executor';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [IntegrationsModule, SubscriptionsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CaktoImportExecutor],
  exports: [CustomersService],
})
export class CustomersModule {}
