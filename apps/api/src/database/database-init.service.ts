import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from './database.constants';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async onModuleInit() {
    await this.createTables();
  }

  private async createTables() {
    this.logger.log('Checking database tables...');

    try {
      // Main table creation
      await this.db.execute(sql.raw(`
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        -- users
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        -- affiliates
        CREATE TABLE IF NOT EXISTS affiliates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        -- products
        CREATE TABLE IF NOT EXISTS products (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          price_in_cents INTEGER NOT NULL,
          duration_days INTEGER NOT NULL DEFAULT 30,
          external_product_id VARCHAR(255),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        -- customers
        CREATE TABLE IF NOT EXISTS customers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          document VARCHAR(50),
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          affiliate_id UUID REFERENCES affiliates(id),
          external_id VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customers_affiliate_id ON customers(affiliate_id);

        -- customer_contacts
        CREATE TABLE IF NOT EXISTS customer_contacts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          channel VARCHAR(20) NOT NULL,
          identifier VARCHAR(255) NOT NULL,
          external_id VARCHAR(255),
          display_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);

        -- subscriptions
        CREATE TABLE IF NOT EXISTS subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id UUID NOT NULL REFERENCES customers(id),
          product_id UUID NOT NULL REFERENCES products(id),
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          access_type VARCHAR(20) NOT NULL DEFAULT 'paid',
          access_granted BOOLEAN NOT NULL DEFAULT FALSE,
          start_date TIMESTAMP NOT NULL,
          end_date TIMESTAMP,
          trial_end_date TIMESTAMP,
          revoked_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          amount NUMERIC(10,2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
          billing_cycle VARCHAR(50) NOT NULL,
          external_id VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);

        -- payments
        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          subscription_id UUID NOT NULL REFERENCES subscriptions(id),
          customer_id UUID NOT NULL REFERENCES customers(id),
          type VARCHAR(20) NOT NULL,
          amount NUMERIC(10,2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          method VARCHAR(50),
          external_id VARCHAR(255),
          gateway_response JSONB,
          paid_at TIMESTAMP,
          due_date TIMESTAMP,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
        CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

        -- event_logs
        CREATE TABLE IF NOT EXISTS event_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(100) NOT NULL,
          customer_id UUID,
          subscription_id UUID,
          payment_id UUID,
          source VARCHAR(50) NOT NULL DEFAULT 'api',
          payload JSONB,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_event_logs_customer_id ON event_logs(customer_id);
        CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(type);

        -- admin_actions
        CREATE TABLE IF NOT EXISTS admin_actions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(100) NOT NULL,
          admin_id UUID NOT NULL,
          customer_id UUID,
          subscription_id UUID,
          payment_id UUID,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          payload JSONB,
          result JSONB,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
      `));

      // Run ALTER statements for columns added after initial creation
      await this.db.execute(sql.raw(`
        ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS metadata JSONB;
      `));

      this.logger.log('All database tables verified/created successfully');
    } catch (error) {
      this.logger.error('Failed to create database tables', error);
      // Don't throw — let the app start even if tables already exist
    }

    // Partial unique indexes for customer_contacts channels (separate try/catch)
    try {
      await this.db.execute(sql.raw(`
        DELETE FROM customer_contacts a
        USING customer_contacts b
        WHERE a.customer_id = b.customer_id
          AND a.channel = b.channel
          AND a.created_at < b.created_at;
      `));
      await this.db.execute(sql.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_customer_channel_whatsapp_unique
          ON customer_contacts (customer_id, channel) WHERE channel = 'whatsapp';
        CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_customer_channel_discord_unique
          ON customer_contacts (customer_id, channel) WHERE channel = 'discord';
        CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_customer_channel_telegram_unique
          ON customer_contacts (customer_id, channel) WHERE channel = 'telegram';
      `));
      this.logger.log('Unique indexes on customer_contacts verified/created');
    } catch (idxErr) {
      this.logger.warn('Could not create unique indexes on customer_contacts (may have remaining duplicates)', (idxErr as Error).message);
    }
  }
}
