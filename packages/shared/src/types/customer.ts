export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  document?: string;
  status: CustomerStatus;
  externalId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerDto = {
  name: string;
  email: string;
  phone?: string;
  document?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateCustomerDto = Partial<CreateCustomerDto> & {
  status?: CustomerStatus;
};
