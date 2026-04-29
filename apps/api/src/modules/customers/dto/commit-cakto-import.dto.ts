import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CommitCaktoImportDto {
  @ApiProperty({ description: 'ID da pré-visualização gerada anteriormente' })
  @IsString()
  @IsUUID()
  previewId: string;
}
