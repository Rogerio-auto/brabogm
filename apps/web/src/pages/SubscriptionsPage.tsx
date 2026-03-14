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
    { key: 'productId', header: 'Produto' },
    { key: 'customerId', header: 'ID do Cliente' },
    {
      key: 'amount',
      header: 'Valor',
      render: (row: any) => `${row.currency} ${Number(row.amount).toFixed(2)}`,
    },
    { key: 'billingCycle', header: 'Ciclo' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'startDate',
      header: 'Data Início',
      render: (row: any) => new Date(row.startDate).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <div>
      <PageHeader title="Assinaturas" description="Gerencie as assinaturas dos clientes" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
