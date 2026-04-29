export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export type ContactChannel = 'whatsapp' | 'telegram' | 'discord';

export type Customer = {
  id: string;
  name: string;
  email: string;
  document?: string;
  status: CustomerStatus;
  affiliateId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export interface CustomerContact {
  id: string;
  customerId: string;
  channel: ContactChannel;
  identifier: string;
  externalId?: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerContactDto {
  customerId: string;
  channel: ContactChannel;
  identifier: string;
  externalId?: string;
  displayName?: string;
}

export interface UpdateCustomerContactDto {
  channel?: ContactChannel;
  identifier?: string;
  externalId?: string;
  displayName?: string;
}

export type CreateCustomerDto = {
  name: string;
  email: string;
  document?: string;
  affiliateId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateCustomerDto = Partial<CreateCustomerDto> & {
  status?: CustomerStatus;
};
