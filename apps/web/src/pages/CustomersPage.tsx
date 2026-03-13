import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';

export default function CustomersPage() {
  const { data, isLoading } = useQuery('customers', () =>
    api.get('/customers').then((r) => r.data),
  );

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (row: any) => row.phone || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customers" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
