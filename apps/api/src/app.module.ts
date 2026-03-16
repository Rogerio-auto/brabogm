import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EventLogsModule } from './modules/event-logs/event-logs.module';
import { AdminActionsModule } from './modules/admin-actions/admin-actions.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AffiliatesModule } from './modules/affiliates/affiliates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    DatabaseModule,
    AuthModule,
    CustomersModule,
    SubscriptionsModule,
    PaymentsModule,
    EventLogsModule,
    AdminActionsModule,
    IntegrationsModule,
    AffiliatesModule,
  ],
})
export class AppModule {}
