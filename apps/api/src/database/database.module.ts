import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DatabaseInitService } from './database-init.service';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
        });
        return drizzle(pool, { schema });
      },
    },
    DatabaseInitService,
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
