import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AffiliatesService } from './affiliates.service';
import { CreateAffiliateDto, UpdateAffiliateDto } from './dto/affiliate.dto';

@ApiTags('Affiliates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('affiliates')
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  @Get()
  @ApiOperation({ summary: 'List all affiliates' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    return this.affiliatesService.findAll({
      page: +page,
      limit: +limit,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get affiliate by ID' })
  findOne(@Param('id') id: string) {
    return this.affiliatesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new affiliate' })
  create(@Body() dto: CreateAffiliateDto) {
    return this.affiliatesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update affiliate' })
  update(@Param('id') id: string, @Body() dto: UpdateAffiliateDto) {
    return this.affiliatesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete affiliate' })
  remove(@Param('id') id: string) {
    return this.affiliatesService.remove(id);
  }
}
