export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'pending'
  | 'suspended'
  | 'refunded'
  | 'revoked';

export type AccessType = 'paid' | 'free' | 'partner' | 'test';

export type Subscription = {
  id: string;
  customerId: string;
  productId: string;
  status: SubscriptionStatus;
  accessType: AccessType;
  accessGranted: boolean;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  revokedAt?: string;
  cancelledAt?: string;
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
  productId: string;
  amount: number;
  currency?: string;
  billingCycle: string;
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  accessType?: AccessType;
  accessGranted?: boolean;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateSubscriptionDto = Partial<CreateSubscriptionDto> & {
  status?: SubscriptionStatus;
  revokedAt?: string;
  cancelledAt?: string;
};
