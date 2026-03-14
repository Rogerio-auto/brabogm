import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Search, Filter, XCircle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendente' },
  { value: 'processing', label: 'Processando' },
  { value: 'paid', label: 'Pago' },
  { value: 'failed', label: 'Falhou' },
  { value: 'refunded', label: 'Reembolsado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const METHOD_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'bank_transfer', label: 'Transferência' },
];

export default function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: '',
    method: '',
    dateFrom: '',
    dateTo: '',
  });

  const queryParams = new URLSearchParams();
  queryParams.set('limit', '50');
  if (appliedFilters.search) queryParams.set('search', appliedFilters.search);
  if (appliedFilters.status) queryParams.set('status', appliedFilters.status);
  if (appliedFilters.method) queryParams.set('method', appliedFilters.method);
  if (appliedFilters.dateFrom) queryParams.set('dateFrom', appliedFilters.dateFrom);
  if (appliedFilters.dateTo) queryParams.set('dateTo', appliedFilters.dateTo);

  const { data, isLoading } = useQuery(
    ['payments', appliedFilters],
    () => api.get(`/payments?${queryParams.toString()}`).then((r) => r.data),
  );

  const applyFilters = () => {
    setAppliedFilters({ search, status, method, dateFrom, dateTo });
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setMethod('');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({ search: '', status: '', method: '', dateFrom: '', dateTo: '' });
  };

  const hasActiveFilters = appliedFilters.search || appliedFilters.status || appliedFilters.method || appliedFilters.dateFrom || appliedFilters.dateTo;

  const columns = [
    { key: 'customerName', header: 'Cliente', render: (row: any) => row.customerName || '—' },
    { key: 'customerDocument', header: 'Documento', render: (row: any) => row.customerDocument || '—' },
    { key: 'customerEmail', header: 'E-mail', render: (row: any) => row.customerEmail || '—' },
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
      <PageHeader
        title="Pagamentos"
        description="Acompanhe o histórico de pagamentos"
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
                {[appliedFilters.search, appliedFilters.status, appliedFilters.method, appliedFilters.dateFrom, appliedFilters.dateTo].filter(Boolean).length}
              </span>
            )}
          </button>
        }
      />

      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
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
          {data.total} pagamento{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''}
        </p>
      )}

      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
