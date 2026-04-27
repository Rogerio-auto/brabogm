import { IsUUID, IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ImportCaktoDto {
  @ApiProperty({ description: 'ID do produto para vincular as assinaturas importadas' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'Ciclo de cobrança das assinaturas',
    enum: ['monthly', 'quarterly', 'semiannual', 'yearly'],
    default: 'monthly',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'quarterly', 'semiannual', 'yearly'])
  billingCycle?: string;

  @ApiProperty({
    description: 'Pular vendas reembolsadas ou com chargeback',
    default: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return true;
  })
  @IsBoolean()
  skipRefunded?: boolean;

  @ApiProperty({
    description:
      'Modo de importação: auto = usa Tipo da Venda do CSV; force_new = cria novas assinaturas para todas as linhas; force_renewal = estende assinaturas existentes para todas as linhas (use para relatório de renovações com Tipo da Venda = main)',
    enum: ['auto', 'force_new', 'force_renewal'],
    default: 'auto',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'force_new', 'force_renewal'])
  importMode?: string;
}
