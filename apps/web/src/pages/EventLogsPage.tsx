import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import PageHeader from '../components/PageHeader';

export default function EventLogsPage() {
  const { data, isLoading } = useQuery('event-logs', () =>
    api.get('/event-logs').then((r) => r.data),
  );

  const columns = [
    { key: 'type', header: 'Event Type' },
    { key: 'source', header: 'Source' },
    { key: 'customerId', header: 'Customer ID', render: (row: any) => row.customerId || '—' },
    {
      key: 'subscriptionId',
      header: 'Subscription ID',
      render: (row: any) => row.subscriptionId || '—',
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (row: any) => new Date(row.createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <PageHeader title="Event Logs" description="System event history" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
