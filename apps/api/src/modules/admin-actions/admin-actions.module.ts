import { Module } from '@nestjs/common';
import { AdminActionsController } from './admin-actions.controller';
import { AdminActionsService } from './admin-actions.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [AdminActionsController],
  providers: [AdminActionsService],
  exports: [AdminActionsService],
})
export class AdminActionsModule {}
