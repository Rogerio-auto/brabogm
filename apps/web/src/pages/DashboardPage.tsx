import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../lib/api';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';

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
        title="Dashboard"
        description="Overview of your subscription management system"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Customers"
          value={customers?.total ?? '—'}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="Total Subscriptions"
          value={subscriptions?.total ?? '—'}
          icon="🔄"
          color="green"
        />
        <StatCard
          title="Total Payments"
          value={payments?.total ?? '—'}
          icon="💳"
          color="purple"
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-2">Quick Start</h2>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Add customers via the Customers page</li>
          <li>Create subscriptions and track billing</li>
          <li>Monitor payments and event logs</li>
          <li>Use Admin Actions to trigger n8n workflows</li>
        </ul>
      </div>
    </div>
  );
}
