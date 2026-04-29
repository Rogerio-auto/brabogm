import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { CheckCircle2, SearchX, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import { api } from '../lib/api';

type OrphanRenewalRecord = {
  id: string;
  saleId: string;
  fileHash: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  status: string;
  amount: string | number | null;
  paidAt: string;
  resolutionNotes: string | null;
  createdAt: string;
};

type PaginatedResponse = {
  data: OrphanRenewalRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const PAGE_LIMIT = 20;

export default function OrphanRenewalsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(PAGE_LIMIT));
  if (status) queryParams.set('status', status);

  const { data, isLoading } = useQuery(
    ['orphan-renewals', page, status],
    () => api.get(`/customers/orphan-renewals?${queryParams.toString()}`).then((response) => response.data as PaginatedResponse),
    { keepPreviousData: true },
  );

  const resolveMutation = useMutation(
    ({ id, action, notes }: { id: string; action: 'approve_as_adhesion' | 'reject'; notes?: string }) =>
      api.post(`/customers/orphan-renewals/${id}/resolve`, { action, notes }).then((response) => response.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('orphan-renewals');
        queryClient.invalidateQueries('customers');
        queryClient.invalidateQueries('cakto-import-history');
      },
    },
  );

  const columns = [
    {
      key: 'customerName',
      header: 'Cliente',
      render: (row: OrphanRenewalRecord) => (
        <div>
          <p className="font-medium text-gray-900">{row.customerName}</p>
          <p className="text-xs text-gray-500">{row.customerEmail}</p>
        </div>
      ),
    },
    { key: 'saleId', header: 'Venda' },
    { key: 'productName', header: 'Produto' },
    {
      key: 'paidAt',
      header: 'Pago em',
      render: (row: OrphanRenewalRecord) => new Date(row.paidAt).toLocaleString('pt-BR'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: OrphanRenewalRecord) => <StatusBadge status={row.status === 'approved_as_adhesion' ? 'completed' : row.status} />,
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (row: OrphanRenewalRecord) => (
        row.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => resolveMutation.mutate({ id: row.id, action: 'approve_as_adhesion' })}
              disabled={resolveMutation.isLoading}
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar como adesão
            </button>
            <button
              onClick={() => resolveMutation.mutate({ id: row.id, action: 'reject' })}
              disabled={resolveMutation.isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Rejeitar
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-500">{row.resolutionNotes || 'Resolvida'}</span>
        )
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Renovações Órfãs"
        description="Revise renovações sem adesão encontrada e resolva manualmente antes do próximo commit."
      />

      <div className="mb-4 flex items-center gap-2">
        {[
          { value: 'pending', label: 'Pendentes' },
          { value: 'approved_as_adhesion', label: 'Aprovadas' },
          { value: 'rejected', label: 'Rejeitadas' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => { setStatus(option.value); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm transition-colors ${
              status === option.value
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {data && (
        <p className="mb-3 text-sm text-gray-500">
          {data.total} renova{data.total !== 1 ? 'ções' : 'ção'} órfã{data.total !== 1 ? 's' : ''} encontrada{data.total !== 1 ? 's' : ''}
        </p>
      )}

      <Table
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Nenhuma renovação órfã encontrada para este filtro."
      />

      {data?.data.length === 0 && !isLoading && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <SearchX className="w-4 h-4" /> Nada pendente nesta fila.
          </div>
        </div>
      )}

      <Pagination
        page={data?.page ?? 1}
        totalPages={data?.totalPages ?? 1}
        total={data?.total ?? 0}
        limit={data?.limit ?? PAGE_LIMIT}
        onPageChange={setPage}
      />
    </div>
  );
}