import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import ImportCaktoModal from '../components/ImportCaktoModal';
import { MoreVertical, Play, Ban, RotateCcw, Send, X, Search, Filter, XCircle, Plus, Upload } from 'lucide-react';

const CUSTOMER_ACTIONS = [
  { key: 'trigger_n8n_workflow', label: 'Acionar Workflow n8n', icon: Play },
  { key: 'block_customer', label: 'Bloquear Cliente', icon: Ban },
  { key: 'unblock_customer', label: 'Desbloquear Cliente', icon: RotateCcw },
  { key: 'cancel_subscription', label: 'Cancelar Assinatura', icon: X },
  { key: 'send_notification', label: 'Enviar Notificação', icon: Send },
];

function ActionMenu({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const mutation = useMutation(
    (action: { type: string; customerId: string }) =>
      api.post('/admin-actions', { type: action.type, customerId: action.customerId }),
  );

  const handleAction = async (actionKey: string) => {
    setLoading(actionKey);
    try {
      await mutation.mutateAsync({ type: actionKey, customerId });
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-gray-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-gray-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            {CUSTOMER_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => handleAction(action.key)}
                  disabled={loading === action.key}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Icon className="w-4 h-4" />
                  {loading === action.key ? 'Executando...' : action.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'suspended', label: 'Suspenso' },
];

const BILLING_CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
];

const ACCESS_TYPE_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'manual', label: 'Manual' },
  { value: 'trial', label: 'Trial' },
];

const initialCreateForm = {
  name: '',
  email: '',
  document: '',
  whatsapp: '',
  discord: '',
  telegram: '',
  affiliateId: '',
  productId: '',
  billingCycle: 'monthly',
  amount: '',
  nextBillingDate: '',
  accessType: 'manual',
  notifyCustomer: false,
};

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [page, setPage] = useState(1);

  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });

  const PAGE_LIMIT = 20;
  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(PAGE_LIMIT));
  queryParams.set('page', String(page));
  if (appliedFilters.search) queryParams.set('search', appliedFilters.search);
  if (appliedFilters.status) queryParams.set('status', appliedFilters.status);
  if (appliedFilters.dateFrom) queryParams.set('dateFrom', appliedFilters.dateFrom);
  if (appliedFilters.dateTo) queryParams.set('dateTo', appliedFilters.dateTo);

  const { data, isLoading } = useQuery(
    ['customers', appliedFilters, page],
    () => api.get(`/customers?${queryParams.toString()}`).then((r) => r.data),
    { keepPreviousData: true },
  );

  const { data: productsData } = useQuery(
    ['products'],
    () => api.get('/customers/products').then((r) => r.data),
    { enabled: showCreateForm },
  );

  const { data: affiliatesData } = useQuery(
    ['affiliates-list'],
    () => api.get('/affiliates?limit=200').then((r) => r.data),
    { enabled: showCreateForm },
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

  const createMutation = useMutation(
    (payload: typeof createForm) => {
      const body: Record<string, unknown> = {
        name: payload.name,
        email: payload.email,
        productId: payload.productId,
        billingCycle: payload.billingCycle,
        amount: payload.amount,
        nextBillingDate: payload.nextBillingDate,
        accessType: payload.accessType,
        notifyCustomer: payload.notifyCustomer,
      };
      if (payload.document) body.document = payload.document;
      if (payload.whatsapp) body.whatsapp = payload.whatsapp;
      if (payload.discord) body.discord = payload.discord;
      if (payload.telegram) body.telegram = payload.telegram;
      if (payload.affiliateId) body.affiliateId = payload.affiliateId;
      return api.post('/customers/manual', body).then((r) => r.data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('customers');
        setShowCreateForm(false);
        setCreateForm(initialCreateForm);
      },
    },
  );

  const canSubmit = createForm.name && createForm.email && createForm.productId && createForm.amount && createForm.nextBillingDate;

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'email', header: 'E-mail' },
    { key: 'document', header: 'Documento', render: (row: any) => row.document || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (row: any) => <ActionMenu customerId={row.id} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Gerencie seus clientes"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" /> Importar CSV
            </button>
            <button
              onClick={() => { setShowCreateForm(!showCreateForm); if (!showCreateForm) setShowFilters(false); }}
              className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Cliente
            </button>
            <button
              onClick={() => { setShowFilters(!showFilters); if (!showFilters) setShowCreateForm(false); }}
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
          </div>
        }
      />

      {showCreateForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-4">Novo Cliente</h3>

          {/* Dados Pessoais */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dados Pessoais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Nome completo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF / Documento</label>
              <input
                type="text"
                value={createForm.document}
                onChange={(e) => setCreateForm({ ...createForm, document: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input
                type="text"
                value={createForm.whatsapp}
                onChange={(e) => setCreateForm({ ...createForm, whatsapp: e.target.value })}
                placeholder="5511999999999"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">@ Discord</label>
              <input
                type="text"
                value={createForm.discord}
                onChange={(e) => setCreateForm({ ...createForm, discord: e.target.value })}
                placeholder="usuario#1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">@ Telegram</label>
              <input
                type="text"
                value={createForm.telegram}
                onChange={(e) => setCreateForm({ ...createForm, telegram: e.target.value })}
                placeholder="@usuario"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Afiliado</label>
              <select
                value={createForm.affiliateId}
                onChange={(e) => setCreateForm({ ...createForm, affiliateId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Nenhum</option>
                {(affiliatesData?.data ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assinatura */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assinatura</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Produto *</label>
              <select
                value={createForm.productId}
                onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {(productsData ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} — R$ {(p.priceInCents / 100).toFixed(2)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciclo de Cobrança</label>
              <select
                value={createForm.billingCycle}
                onChange={(e) => setCreateForm({ ...createForm, billingCycle: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {BILLING_CYCLE_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={createForm.amount}
                onChange={(e) => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setCreateForm({ ...createForm, amount: val });
                  }
                }}
                placeholder="99.90"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Próxima Cobrança *</label>
              <input
                type="date"
                value={createForm.nextBillingDate}
                onChange={(e) => setCreateForm({ ...createForm, nextBillingDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Acesso</label>
              <select
                value={createForm.accessType}
                onChange={(e) => setCreateForm({ ...createForm, accessType: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {ACCESS_TYPE_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.notifyCustomer}
                  onChange={(e) => setCreateForm({ ...createForm, notifyCustomer: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">Disparar ao lead?</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(createForm)}
              disabled={createMutation.isLoading || !canSubmit}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isLoading ? 'Salvando...' : 'Salvar Cliente'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateForm(initialCreateForm); }}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
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
          {data.total} cliente{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''}
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

      {showImportModal && (
        <ImportCaktoModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}
