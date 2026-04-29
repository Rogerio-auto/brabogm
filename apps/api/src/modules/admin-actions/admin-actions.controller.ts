import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminActionsService } from './admin-actions.service';
import { CreateAdminActionDto } from './dto/create-admin-action.dto';

@ApiTags('Admin Actions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin-actions')
export class AdminActionsController {
  constructor(private readonly adminActionsService: AdminActionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all admin actions' })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminActionsService.findAll({ page: +page, limit: +limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get admin action by ID' })
  findOne(@Param('id') id: string) {
    return this.adminActionsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Execute an admin action' })
  create(@Body() dto: CreateAdminActionDto, @Request() req: any) {
    return this.adminActionsService.create(dto, req.user.id);
  }
}
