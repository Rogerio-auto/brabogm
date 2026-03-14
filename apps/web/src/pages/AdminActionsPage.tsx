import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Plus } from 'lucide-react';

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

export default function AdminActionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: ACTION_TYPES[0].value, customerId: '', subscriptionId: '', notes: '' });

  const { data, isLoading } = useQuery('admin-actions', () =>
    api.get('/admin-actions').then((r) => r.data),
  );

  const mutation = useMutation(
    (payload: typeof form) => api.post('/admin-actions', payload).then((r) => r.data),
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
              <label className="block text-sm font-medium text-gray-700 mb-1">ID do Cliente</label>
              <input
                type="text"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID da Assinatura</label>
              <input
                type="text"
                value={form.subscriptionId}
                onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
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
    </div>
  );
}
