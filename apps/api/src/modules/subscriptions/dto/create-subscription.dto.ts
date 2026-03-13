import { IsString, IsNumber, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty()
  @IsString()
  planId: string;

  @ApiProperty()
  @IsString()
  planName: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
