import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Search, Filter, XCircle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Ativa' },
  { value: 'pending', label: 'Pendente' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'expired', label: 'Expirada' },
  { value: 'suspended', label: 'Suspensa' },
  { value: 'trial', label: 'Trial' },
];

const PAGE_LIMIT = 20;

export default function SubscriptionsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(PAGE_LIMIT));
  queryParams.set('page', String(page));
  if (appliedFilters.search) queryParams.set('search', appliedFilters.search);
  if (appliedFilters.status) queryParams.set('status', appliedFilters.status);
  if (appliedFilters.dateFrom) queryParams.set('dateFrom', appliedFilters.dateFrom);
  if (appliedFilters.dateTo) queryParams.set('dateTo', appliedFilters.dateTo);

  const { data, isLoading } = useQuery(
    ['subscriptions', appliedFilters, page],
    () => api.get(`/subscriptions?${queryParams.toString()}`).then((r) => r.data),
    { keepPreviousData: true },
  );

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters({ search, status, dateFrom, dateTo });
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setAppliedFilters({ search: '', status: '', dateFrom: '', dateTo: '' });
  };

  const hasActiveFilters = appliedFilters.search || appliedFilters.status || appliedFilters.dateFrom || appliedFilters.dateTo;

  const columns = [
    { key: 'customerName', header: 'Cliente', render: (row: any) => row.customerName || '—' },
    { key: 'customerDocument', header: 'Documento', render: (row: any) => row.customerDocument || '—' },
    { key: 'customerEmail', header: 'E-mail', render: (row: any) => row.customerEmail || '—' },
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
      <PageHeader
        title="Assinaturas"
        description="Gerencie as assinaturas dos clientes"
        action={
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm transition-colors border ${
              hasActiveFilters
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {hasActiveFilters && (
              <span className="ml-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {[appliedFilters.search, appliedFilters.status, appliedFilters.dateFrom, appliedFilters.dateTo].filter(Boolean).length}
              </span>
            )}
          </button>
        }
      />

      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                  placeholder="Nome, e-mail ou documento..."
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={applyFilters}
              className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <Search className="w-4 h-4" /> Buscar
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Limpar Filtros
              </button>
            )}
          </div>
        </div>
      )}

      {data && (
        <p className="text-sm text-gray-500 mb-3">
          {data.total} assinatura{data.total !== 1 ? 's' : ''} encontrada{data.total !== 1 ? 's' : ''}
        </p>
      )}

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
