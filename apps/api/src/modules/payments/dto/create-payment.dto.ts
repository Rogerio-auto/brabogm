import { IsString, IsNumber, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  subscriptionId: string;

  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false, default: 'BRL' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['credit_card', 'debit_card', 'pix', 'boleto', 'bank_transfer'])
  method?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
