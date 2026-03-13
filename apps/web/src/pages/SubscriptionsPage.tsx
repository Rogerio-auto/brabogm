import React from 'react';
import { useQuery } from 'react-query';
import type { Subscription } from '@brabogm/shared';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';

export default function SubscriptionsPage() {
  const { data, isLoading } = useQuery('subscriptions', () =>
    api.get('/subscriptions').then((r) => r.data),
  );

  const columns = [
    { key: 'planName', header: 'Plan' },
    { key: 'customerId', header: 'Customer ID' },
    {
      key: 'amount',
      header: 'Amount',
      render: (row: Subscription) => `${row.currency} ${Number(row.amount).toFixed(2)}`,
    },
    { key: 'billingCycle', header: 'Cycle' },
    { key: 'status', header: 'Status', render: (row: Subscription) => <StatusBadge status={row.status} /> },
    {
      key: 'startDate',
      header: 'Start Date',
      render: (row: Subscription) => new Date(row.startDate).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <PageHeader title="Subscriptions" description="Manage customer subscriptions" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
