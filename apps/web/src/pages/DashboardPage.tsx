import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';
import { Users, RefreshCw, CreditCard } from 'lucide-react';

export default function DashboardPage() {
  const { data: customers } = useQuery('customers-count', () =>
    api.get('/customers?limit=1').then((r) => r.data),
  );
  const { data: subscriptions } = useQuery('subscriptions-count', () =>
    api.get('/subscriptions?limit=1').then((r) => r.data),
  );
  const { data: payments } = useQuery('payments-count', () =>
    api.get('/payments?limit=1').then((r) => r.data),
  );

  return (
    <div>
      <PageHeader
        title="Painel"
        description="Visão geral do sistema de gestão de assinaturas"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total de Clientes"
          value={customers?.total ?? '—'}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Total de Assinaturas"
          value={subscriptions?.total ?? '—'}
          icon={RefreshCw}
          color="green"
        />
        <StatCard
          title="Total de Pagamentos"
          value={payments?.total ?? '—'}
          icon={CreditCard}
          color="purple"
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-2">Início Rápido</h2>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Adicione clientes pela página de Clientes</li>
          <li>Crie assinaturas e acompanhe cobranças</li>
          <li>Monitore pagamentos e logs de eventos</li>
          <li>Use Ações Admin para disparar workflows no n8n</li>
        </ul>
      </div>
    </div>
  );
}
