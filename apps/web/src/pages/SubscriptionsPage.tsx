import React from 'react';
import { useQuery } from 'react-query';
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
      render: (row: any) => `${row.currency} ${Number(row.amount).toFixed(2)}`,
    },
    { key: 'billingCycle', header: 'Cycle' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'startDate',
      header: 'Start Date',
      render: (row: any) => new Date(row.startDate).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <PageHeader title="Subscriptions" description="Manage customer subscriptions" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
