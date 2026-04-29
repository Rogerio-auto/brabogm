import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import { Search, Filter, XCircle, Plus, Pencil, Trash2 } from 'lucide-react';

const initialForm = { name: '', email: '', metadata: '' };
const PAGE_LIMIT = 20;

export default function AffiliatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(PAGE_LIMIT));
  queryParams.set('page', String(page));
  if (appliedSearch) queryParams.set('search', appliedSearch);

  const { data, isLoading } = useQuery(
    ['affiliates', appliedSearch, page],
    () => api.get(`/affiliates?${queryParams.toString()}`).then((r) => r.data),
    { keepPreviousData: true },
  );

  const createMutation = useMutation(
    (payload: { name: string; email: string; metadata?: Record<string, unknown> }) =>
      api.post('/affiliates', payload).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('affiliates');
        setShowCreateForm(false);
        setForm(initialForm);
      },
    },
  );

  const updateMutation = useMutation(
    ({ id, ...payload }: { id: string; name?: string; email?: string; metadata?: Record<string, unknown> }) =>
      api.patch(`/affiliates/${id}`, payload).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('affiliates');
        setEditingId(null);
        setForm(initialForm);
      },
    },
  );

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/affiliates/${id}`).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('affiliates');
        setDeleteConfirm(null);
      },
      onError: (err: any) => {
        alert(err?.response?.data?.message || 'Erro ao excluir afiliado');
        setDeleteConfirm(null);
      },
    },
  );

  const handleSubmit = () => {
    let metadata: Record<string, unknown> | undefined;
    if (form.metadata.trim()) {
      try {
        metadata = JSON.parse(form.metadata);
      } catch {
        alert('Metadata inválido. Use formato JSON válido.');
        return;
      }
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, name: form.name, email: form.email, metadata });
    } else {
      createMutation.mutate({ name: form.name, email: form.email, metadata });
    }
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      email: row.email,
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : '',
    });
    setShowCreateForm(true);
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'email', header: 'E-mail' },
    {
      key: 'customerCount',
      header: 'Clientes',
      render: (row: any) => (
        <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 text-xs font-medium rounded-full px-2 py-0.5">
          {row.customerCount}
        </span>
      ),
    },
    {
      key: 'metadata',
      header: 'Metadata',
      render: (row: any) =>
        row.metadata ? (
          <span className="text-xs text-gray-500 font-mono truncate max-w-[200px] block">
            {JSON.stringify(row.metadata).slice(0, 60)}
            {JSON.stringify(row.metadata).length > 60 ? '…' : ''}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (row: any) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => startEdit(row)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Editar"
          >
            <Pencil className="w-4 h-4 text-gray-500" />
          </button>
          {deleteConfirm === row.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteMutation.mutate(row.id)}
                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
              >
                Confirmar
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(row.id)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Afiliados"
        description="Gerencie seus afiliados e veja quantos clientes cada um possui"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (showCreateForm) { cancelForm(); } else { setShowCreateForm(true); }
              }}
              className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Afiliado
            </button>
          </div>
        }
      />

      {showCreateForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-4">{editingId ? 'Editar Afiliado' : 'Novo Afiliado'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do afiliado"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Metadata (JSON)</label>
              <textarea
                value={form.metadata}
                onChange={(e) => setForm({ ...form, metadata: e.target.value })}
                placeholder='{"comissao": "10%"}'
                rows={1}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSubmit}
              disabled={createMutation.isLoading || updateMutation.isLoading || !form.name || !form.email}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {(createMutation.isLoading || updateMutation.isLoading) ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
            </button>
            <button
              onClick={cancelForm}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(search)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => { setAppliedSearch(search); setPage(1); }}
          className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          <Search className="w-4 h-4" /> Buscar
        </button>
        {appliedSearch && (
          <button
            onClick={() => { setSearch(''); setAppliedSearch(''); setPage(1); }}
            className="flex items-center gap-1 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Limpar
          </button>
        )}
      </div>

      {data && (
        <p className="text-sm text-gray-500 mb-3">
          {data.total} afiliado{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''}
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
