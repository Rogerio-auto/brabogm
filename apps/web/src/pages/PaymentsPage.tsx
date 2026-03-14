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
    { key: 'subscriptionId', header: 'ID da Assinatura' },
    {
      key: 'amount',
      header: 'Valor',
      render: (row: any) => `${row.currency} ${Number(row.amount).toFixed(2)}`,
    },
    { key: 'method', header: 'Método', render: (row: any) => row.method || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'paidAt',
      header: 'Pago em',
      render: (row: any) => (row.paidAt ? new Date(row.paidAt).toLocaleDateString('pt-BR') : '—'),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <div>
      <PageHeader title="Pagamentos" description="Acompanhe o histórico de pagamentos" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
