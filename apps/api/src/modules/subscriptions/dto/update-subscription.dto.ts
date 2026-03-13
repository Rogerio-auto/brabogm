import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateSubscriptionDto } from './create-subscription.dto';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @IsOptional()
  @IsIn(['active', 'cancelled', 'expired', 'pending', 'suspended', 'trial'])
  status?: string;
}
