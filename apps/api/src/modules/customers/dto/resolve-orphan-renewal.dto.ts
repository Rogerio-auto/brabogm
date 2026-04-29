import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveOrphanRenewalDto {
  @ApiProperty({ enum: ['approve_as_adhesion', 'reject'] })
  @IsString()
  @IsIn(['approve_as_adhesion', 'reject'])
  action!: 'approve_as_adhesion' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}