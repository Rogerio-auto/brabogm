import { IsString, IsNumber, IsOptional, IsDateString, IsIn, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false, default: 'BRL' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsString()
  billingCycle: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  trialEndDate?: string;

  @ApiProperty({ required: false, default: 'paid' })
  @IsOptional()
  @IsIn(['paid', 'free', 'partner', 'test'])
  accessType?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  accessGranted?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
