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
      required: ['file', 'productId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        productId: { type: 'string', format: 'uuid' },
        billingCycle: { type: 'string', enum: ['monthly', 'quarterly', 'semiannual', 'yearly'], default: 'monthly' },
        skipRefunded: { type: 'boolean', default: true },
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
    @Body() dto: ImportCaktoDto,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    return this.customersService.importCakto(
      file.buffer,
      dto.productId,
      dto.billingCycle ?? 'monthly',
      dto.skipRefunded !== false,
      dto.importMode ?? 'auto',
    );
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
