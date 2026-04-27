import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Plus, Search, X } from 'lucide-react';

const ACTION_TYPES = [
  { value: 'cancel_subscription', label: 'Cancelar Assinatura' },
  { value: 'reactivate_subscription', label: 'Reativar Assinatura' },
  { value: 'extend_subscription', label: 'Estender Assinatura' },
  { value: 'refund_payment', label: 'Reembolsar Pagamento' },
  { value: 'block_customer', label: 'Bloquear Cliente' },
  { value: 'unblock_customer', label: 'Desbloquear Cliente' },
  { value: 'trigger_n8n_workflow', label: 'Acionar Workflow n8n' },
  { value: 'manual_renewal', label: 'Renovação Manual' },
  { value: 'change_plan', label: 'Trocar Plano' },
];

function CustomerSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, label: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery(
    ['customers-search', searchTerm],
    () => api.get(`/customers?limit=20&search=${encodeURIComponent(searchTerm)}`).then((r) => r.data),
    { enabled: open && searchTerm.length >= 1, keepPreviousData: true },
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      setSearchTerm('');
    }
  }, [value]);

  const customers = data?.data ?? [];

  return (
    <div ref={wrapperRef} className="relative">
      {value && selectedLabel ? (
        <div className="flex items-center gap-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50">
          <span className="flex-1 truncate">{selectedLabel}</span>
          <button
            type="button"
            onClick={() => {
              onChange('', '');
              setSelectedLabel('');
              setSearchTerm('');
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nome, e-mail ou documento..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
      )}
      {open && !value && customers.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {customers.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const label = `${c.name} — ${c.email}${c.document ? ` · ${c.document}` : ''}`;
                onChange(c.id, label);
                setSelectedLabel(label);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
            >
              <span className="font-medium text-gray-800">{c.name}</span>
              <span className="text-gray-400 ml-2 text-xs">{c.email}</span>
              {c.document && <span className="text-gray-400 ml-2 text-xs">· {c.document}</span>}
            </button>
          ))}
        </div>
      )}
      {open && !value && searchTerm.length >= 1 && customers.length === 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400">
          Nenhum cliente encontrado
        </div>
      )}
    </div>
  );
}

const PAGE_LIMIT = 20;

export default function AdminActionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: ACTION_TYPES[0].value, customerId: '', subscriptionId: '', notes: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery(
    ['admin-actions', page],
    () => api.get(`/admin-actions?limit=${PAGE_LIMIT}&page=${page}`).then((r) => r.data),
    { keepPreviousData: true },
  );

  // Auto-load subscriptions when a customer is selected
  const { data: subsData, isLoading: subsLoading } = useQuery(
    ['customer-subscriptions', form.customerId],
    () => api.get(`/subscriptions?customerId=${form.customerId}&limit=50`).then((r) => r.data),
    { enabled: !!form.customerId },
  );

  const customerSubscriptions = subsData?.data ?? [];

  const mutation = useMutation(
    (payload: typeof form) => {
      const body = {
        ...payload,
        customerId: payload.customerId || undefined,
        subscriptionId: payload.subscriptionId || undefined,
      };
      return api.post('/admin-actions', body).then((r) => r.data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-actions');
        setShowForm(false);
        setForm({ type: ACTION_TYPES[0].value, customerId: '', subscriptionId: '', notes: '' });
      },
    },
  );

  const columns = [
    { key: 'type', header: 'Tipo de Ação' },
    { key: 'adminId', header: 'ID do Admin' },
    { key: 'customerId', header: 'ID do Cliente', render: (row: any) => row.customerId || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    { key: 'notes', header: 'Observações', render: (row: any) => row.notes || '—' },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (row: any) => new Date(row.createdAt).toLocaleString('pt-BR'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ações Administrativas"
        description="Execute ações administrativas"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Ação
          </button>
        }
      />

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-4">Nova Ação Administrativa</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ação</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <CustomerSearch
                value={form.customerId}
                onChange={(id) => setForm({ ...form, customerId: id, subscriptionId: '' })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assinatura</label>
              {form.customerId ? (
                subsLoading ? (
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-400">
                    Carregando assinaturas...
                  </div>
                ) : customerSubscriptions.length > 0 ? (
                  <select
                    value={form.subscriptionId}
                    onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecione uma assinatura</option>
                    {customerSubscriptions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.billingCycle} — {s.currency} {Number(s.amount).toFixed(2)} — {s.status}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-400">
                    Nenhuma assinatura encontrada para este cliente
                  </div>
                )
              ) : (
                <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-400">
                  Selecione um cliente primeiro
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isLoading ? 'Executando...' : 'Executar Ação'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
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
