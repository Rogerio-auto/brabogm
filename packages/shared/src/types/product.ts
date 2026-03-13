export interface Product {
  id: string;
  name: string;
  description?: string;
  priceInCents: number;
  durationDays: number;
  externalProductId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  name: string;
  description?: string;
  priceInCents: number;
  durationDays?: number;
  externalProductId?: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  priceInCents?: number;
  durationDays?: number;
  externalProductId?: string;
  isActive?: boolean;
}
