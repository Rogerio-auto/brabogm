export interface Affiliate {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface CreateAffiliateDto {
  name: string;
  email: string;
}

export interface UpdateAffiliateDto {
  name?: string;
  email?: string;
}
