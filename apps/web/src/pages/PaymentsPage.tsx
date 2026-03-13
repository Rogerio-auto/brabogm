import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';

export default function PaymentsPage() {
  const { data, isLoading } = useQuery('payments', () =>
    api.get('/payments').then((r) => r.data),
  );

  const columns = [
    { key: 'subscriptionId', header: 'Subscription ID' },
    {
      key: 'amount',
      header: 'Amount',
      render: (row: any) => `${row.currency} ${Number(row.amount).toFixed(2)}`,
    },
    { key: 'method', header: 'Method', render: (row: any) => row.method || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'paidAt',
      header: 'Paid At',
      render: (row: any) => (row.paidAt ? new Date(row.paidAt).toLocaleDateString() : '—'),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <PageHeader title="Payments" description="Track payment history" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
