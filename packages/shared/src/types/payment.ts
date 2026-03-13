export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type PaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'pix'
  | 'boleto'
  | 'bank_transfer';

export type Payment = {
  id: string;
  subscriptionId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod;
  externalId?: string;
  gatewayResponse?: Record<string, unknown>;
  paidAt?: string;
  dueDate?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreatePaymentDto = {
  subscriptionId: string;
  customerId: string;
  amount: number;
  currency?: string;
  method?: PaymentMethod;
  externalId?: string;
  dueDate?: string;
  metadata?: Record<string, unknown>;
};
