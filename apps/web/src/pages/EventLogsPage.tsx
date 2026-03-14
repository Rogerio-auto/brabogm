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
    { key: 'type', header: 'Tipo de Evento' },
    { key: 'source', header: 'Origem' },
    { key: 'customerId', header: 'ID do Cliente', render: (row: any) => row.customerId || '—' },
    {
      key: 'subscriptionId',
      header: 'ID da Assinatura',
      render: (row: any) => row.subscriptionId || '—',
    },
    {
      key: 'createdAt',
      header: 'Data/Hora',
      render: (row: any) => new Date(row.createdAt).toLocaleString('pt-BR'),
    },
  ];

  return (
    <div>
      <PageHeader title="Logs de Eventos" description="Histórico de eventos do sistema" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
