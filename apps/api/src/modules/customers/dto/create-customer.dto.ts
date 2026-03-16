import { IsEmail, IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  document?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  affiliateId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ManualCreateCustomerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  document?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  affiliateId?: string;

  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsString()
  billingCycle: string;

  @ApiProperty()
  @IsString()
  amount: string;

  @ApiProperty({ description: 'Data da próxima cobrança (ISO date string)' })
  @IsString()
  nextBillingDate: string;

  @ApiProperty({ enum: ['paid', 'manual', 'trial'], default: 'manual' })
  @IsOptional()
  @IsIn(['paid', 'manual', 'trial'])
  accessType?: string;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}
