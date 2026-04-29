export type AdminActionType =
  | 'cancel_subscription'
  | 'reactivate_subscription'
  | 'extend_subscription'
  | 'refund_payment'
  | 'block_customer'
  | 'unblock_customer'
  | 'trigger_n8n_workflow'
  | 'manual_renewal'
  | 'change_plan';

export type AdminActionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type AdminAction = {
  id: string;
  type: AdminActionType;
  adminId: string;
  customerId?: string;
  subscriptionId?: string;
  paymentId?: string;
  status: AdminActionStatus;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminActionDto = {
  type: AdminActionType;
  customerId?: string;
  subscriptionId?: string;
  paymentId?: string;
  payload?: Record<string, unknown>;
  notes?: string;
};
