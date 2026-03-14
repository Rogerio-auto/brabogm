import React, { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { MoreVertical, Play, Ban, RotateCcw, Send, X } from 'lucide-react';

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
      api.post('/admin-actions', { type: action.type, customerId: action.customerId, notes: '' }),
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

export default function CustomersPage() {
  const { data, isLoading } = useQuery('customers', () =>
    api.get('/customers').then((r) => r.data),
  );

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'email', header: 'E-mail' },
    { key: 'phone', header: 'Telefone', render: (row: any) => row.phone || '—' },
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
      <PageHeader title="Clientes" description="Gerencie seus clientes" />
      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
