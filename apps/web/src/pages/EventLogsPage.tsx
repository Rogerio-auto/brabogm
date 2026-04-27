import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';

const PAGE_LIMIT = 20;

export default function EventLogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery(
    ['event-logs', page],
    () => api.get(`/event-logs?limit=${PAGE_LIMIT}&page=${page}`).then((r) => r.data),
    { keepPreviousData: true },
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
      <Pagination
        page={page}
        totalPages={data?.totalPages ?? 1}
        total={data?.total ?? 0}
        limit={PAGE_LIMIT}
        onPageChange={setPage}
      />
    </div>
  );
}
