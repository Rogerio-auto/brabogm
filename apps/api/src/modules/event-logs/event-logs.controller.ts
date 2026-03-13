import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EventLogsService } from './event-logs.service';
import { CreateEventLogDto } from './dto/create-event-log.dto';

@ApiTags('Event Logs')
@Controller('event-logs')
export class EventLogsController {
  constructor(private readonly eventLogsService: EventLogsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all event logs' })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.eventLogsService.findAll({ page: +page, limit: +limit });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get event log by ID' })
  findOne(@Param('id') id: string) {
    return this.eventLogsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create event log (used by n8n or internal)' })
  create(@Body() dto: CreateEventLogDto) {
    return this.eventLogsService.create(dto);
  }
}
