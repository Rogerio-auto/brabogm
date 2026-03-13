import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminActionDto {
  @ApiProperty({
    enum: [
      'cancel_subscription', 'reactivate_subscription', 'extend_subscription',
      'refund_payment', 'block_customer', 'unblock_customer',
      'trigger_n8n_workflow', 'manual_renewal', 'change_plan',
    ],
  })
  @IsIn([
    'cancel_subscription', 'reactivate_subscription', 'extend_subscription',
    'refund_payment', 'block_customer', 'unblock_customer',
    'trigger_n8n_workflow', 'manual_renewal', 'change_plan',
  ])
  type: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
