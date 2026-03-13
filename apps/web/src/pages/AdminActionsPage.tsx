import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';

const ACTION_TYPES = [
  'cancel_subscription',
  'reactivate_subscription',
  'extend_subscription',
  'refund_payment',
  'block_customer',
  'unblock_customer',
  'trigger_n8n_workflow',
  'manual_renewal',
  'change_plan',
];

export default function AdminActionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: ACTION_TYPES[0], customerId: '', subscriptionId: '', notes: '' });

  const { data, isLoading } = useQuery('admin-actions', () =>
    api.get('/admin-actions').then((r) => r.data),
  );

  const mutation = useMutation(
    (payload: any) => api.post('/admin-actions', payload).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-actions');
        setShowForm(false);
        setForm({ type: ACTION_TYPES[0], customerId: '', subscriptionId: '', notes: '' });
      },
    },
  );

  const columns = [
    { key: 'type', header: 'Action Type' },
    { key: 'adminId', header: 'Admin ID' },
    { key: 'customerId', header: 'Customer ID', render: (row: any) => row.customerId || '—' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    { key: 'notes', header: 'Notes', render: (row: any) => row.notes || '—' },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: any) => new Date(row.createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Admin Actions"
        description="Execute administrative actions"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            + New Action
          </button>
        }
      />

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-4">New Admin Action</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
              <input
                type="text"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subscription ID</label>
              <input
                type="text"
                value={form.subscriptionId}
                onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
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
              {mutation.isLoading ? 'Executing...' : 'Execute Action'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Table columns={columns} data={data?.data ?? []} isLoading={isLoading} />
    </div>
  );
}
