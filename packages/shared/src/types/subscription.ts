export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'pending'
  | 'suspended'
  | 'trial';

export type Subscription = {
  id: string;
  customerId: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  amount: number;
  currency: string;
  billingCycle: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateSubscriptionDto = {
  customerId: string;
  planId: string;
  planName: string;
  amount: number;
  currency?: string;
  billingCycle: string;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateSubscriptionDto = Partial<CreateSubscriptionDto> & {
  status?: SubscriptionStatus;
};
