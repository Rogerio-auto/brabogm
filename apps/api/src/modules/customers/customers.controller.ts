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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, ManualCreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ImportCaktoDto } from './dto/import-cakto.dto';
import { CommitCaktoImportDto } from './dto/commit-cakto-import.dto';
import { ResolveOrphanRenewalDto } from './dto/resolve-orphan-renewal.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List all customers' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.customersService.findAll({
      page: +page,
      limit: +limit,
      search,
      status,
      dateFrom,
      dateTo,
    });
  }

  @Get('products')
  @ApiOperation({ summary: 'List active products (for manual creation form)' })
  listProducts() {
    return this.customersService.listProducts();
  }

  @Get('orphan-renewals')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'List orphan renewal records for manual review' })
  listOrphanRenewals(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.customersService.listOrphanRenewals({
      page: +page,
      limit: +limit,
      status,
    });
  }

  @Post('orphan-renewals/:id/resolve')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Resolve an orphan renewal by approving as adhesion or rejecting it' })
  resolveOrphanRenewal(
    @Param('id') id: string,
    @Body() dto: ResolveOrphanRenewalDto,
    @Request() req: any,
  ) {
    return this.customersService.resolveOrphanRenewal(id, dto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Create customer manually with contacts and subscription' })
  manualCreate(@Body() dto: ManualCreateCustomerDto) {
    return this.customersService.manualCreate(dto);
  }

  @Post('import-cakto')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Import leads from a Cakto CSV/XLS export file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xls|xlsx)$/i)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Apenas arquivos CSV ou XLS/XLSX são aceitos.'), false);
        }
      },
    }),
  )
  importCakto(
    @UploadedFile() file: Express.Multer.File,
    @Body() _dto: ImportCaktoDto,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    return this.customersService.importCakto(file.buffer);
  }

  @Post('import-cakto/preview')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Preview a Cakto CSV/XLS import without persisting data' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xls|xlsx)$/i)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Apenas arquivos CSV ou XLS/XLSX são aceitos.'), false);
        }
      },
    }),
  )
  previewCaktoImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() _dto: ImportCaktoDto,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    return this.customersService.previewCaktoImport(file.buffer, file.originalname, file.size);
  }

  @Post('import-cakto/commit')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Commit a previously generated Cakto import preview' })
  commitCaktoImport(@Body() dto: CommitCaktoImportDto, @Request() req: any) {
    return this.customersService.commitCaktoImport(dto.previewId, req.user.id);
  }

  @Get('import-cakto/history')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'List Cakto import history' })
  findCaktoImportHistory(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.customersService.findCaktoImportHistory({
      page: +page,
      limit: +limit,
    });
  }

  @Get('import-cakto/history/:importId')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get Cakto import history detail' })
  findCaktoImportDetail(@Param('importId') importId: string) {
    return this.customersService.findCaktoImportDetail(importId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
