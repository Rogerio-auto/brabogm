export type EventLogType =
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.expired'
  | 'subscription.suspended'
  | 'payment.received'
  | 'payment.failed'
  | 'payment.refunded'
  | 'customer.created'
  | 'customer.updated'
  | 'admin.action'
  | 'webhook.received'
  | 'n8n.trigger';

export type EventLog = {
  id: string;
  type: EventLogType;
  customerId?: string;
  subscriptionId?: string;
  paymentId?: string;
  source: 'api' | 'n8n' | 'webhook' | 'admin';
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CreateEventLogDto = {
  type: EventLogType;
  customerId?: string;
  subscriptionId?: string;
  paymentId?: string;
  source: 'api' | 'n8n' | 'webhook' | 'admin';
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
