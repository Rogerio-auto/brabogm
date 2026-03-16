export interface Affiliate {
  id: string;
  name: string;
  email: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAffiliateDto {
  name: string;
  email: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAffiliateDto {
  name?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}
