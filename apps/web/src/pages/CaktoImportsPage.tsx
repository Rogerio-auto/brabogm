import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Eye, FileSpreadsheet, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Table from '../components/Table';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import { api } from '../lib/api';

type ImportSummary = {
  total?: number;
  imported?: number;
  renewed?: number;
  expired?: number;
  cancelled?: number;
  skipped?: number;
  duplicates?: number;
  errors?: Array<{ saleId: string; error: string }>;
};

type CaktoImportRecord = {
  id: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  status: string;
  summary: ImportSummary | null;
  planSnapshot: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CaktoImportEventRecord = {
  id: string;
  saleId: string;
  action: string;
  status: string;
  customerEmail: string | null;
  productName: string | null;
  payload: Record<string, unknown> | null;
  processedAt: string;
};

type CaktoImportDetailResponse = {
  import: CaktoImportRecord;
  events: CaktoImportEventRecord[];
};

type PaginatedResponse = {
  data: CaktoImportRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="text-sm text-right text-gray-700 break-all">{value}</div>
    </div>
  );
}

export default function CaktoImportsPage() {
  const [page, setPage] = useState(1);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const pageLimit = 10;

  const { data, isLoading, refetch, isFetching } = useQuery(
    ['cakto-import-history', page],
    () => api.get(`/customers/import-cakto/history?page=${page}&limit=${pageLimit}`).then((response) => response.data as PaginatedResponse),
    { keepPreviousData: true },
  );

  const selectedImportQuery = useQuery(
    ['cakto-import-detail', selectedImportId],
    () => api.get(`/customers/import-cakto/history/${selectedImportId}`).then((response) => response.data as CaktoImportDetailResponse),
    { enabled: !!selectedImportId },
  );

  const selectedImport = selectedImportQuery.data?.import ?? null;
  const selectedEvents = selectedImportQuery.data?.events ?? [];

  const columns = useMemo(() => ([
    {
      key: 'fileName',
      header: 'Arquivo',
      render: (row: CaktoImportRecord) => (
        <div>
          <p className="font-medium text-gray-900">{row.fileName}</p>
          <p className="text-xs text-gray-500">{row.fileHash.slice(0, 12)}...</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: CaktoImportRecord) => <StatusBadge status={row.status} />,
    },
    {
      key: 'summary',
      header: 'Resumo',
      render: (row: CaktoImportRecord) => {
        const summary = row.summary ?? {};
        return (
          <div className="text-xs text-gray-600 space-y-1">
            <p>Total: {summary.total ?? 0}</p>
            <p>Novos: {summary.imported ?? 0} | Renovados: {summary.renewed ?? 0}</p>
            <p>Cancelados: {summary.cancelled ?? 0} | Duplicados: {summary.duplicates ?? 0}</p>
          </div>
        );
      },
    },
    {
      key: 'startedAt',
      header: 'Início',
      render: (row: CaktoImportRecord) => new Date(row.startedAt).toLocaleString('pt-BR'),
    },
    {
      key: 'finishedAt',
      header: 'Fim',
      render: (row: CaktoImportRecord) => row.finishedAt ? new Date(row.finishedAt).toLocaleString('pt-BR') : '—',
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (row: CaktoImportRecord) => (
        <button
          onClick={() => setSelectedImportId(row.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" /> Ver detalhe
        </button>
      ),
    },
  ]), []);

  return (
    <div>
      <PageHeader
        title="Histórico Cakto"
        description="Consulte os imports executados, hashes processados e o resumo de cada execução."
        action={
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        }
      />

      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        O histórico mostra cada import salvo em <span className="font-semibold">cakto_imports</span>. O detalhe exibe o plano salvo, o resumo final e os eventos por linha persistidos em <span className="font-semibold">cakto_import_events</span>.
      </div>

      <Table
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Nenhum import Cakto foi registrado ainda."
      />

      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          limit={data.limit}
          onPageChange={setPage}
        />
      )}

      {selectedImportId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="font-semibold text-gray-900">Detalhe do import</h2>
                  <p className="text-xs text-gray-500">{selectedImportId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedImportId(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              {selectedImportQuery.isLoading && (
                <div className="flex h-32 items-center justify-center text-gray-400">Carregando detalhe...</div>
              )}

              {selectedImport && (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <DetailRow label="Arquivo" value={selectedImport.fileName} />
                    <DetailRow label="Status" value={<StatusBadge status={selectedImport.status} />} />
                    <DetailRow label="SHA-256" value={selectedImport.fileHash} />
                    <DetailRow label="Tamanho" value={`${selectedImport.fileSize.toLocaleString('pt-BR')} bytes`} />
                    <DetailRow label="Iniciado em" value={new Date(selectedImport.startedAt).toLocaleString('pt-BR')} />
                    <DetailRow label="Finalizado em" value={selectedImport.finishedAt ? new Date(selectedImport.finishedAt).toLocaleString('pt-BR') : '—'} />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-3 text-sm font-semibold text-gray-900">Resumo final</p>
                    <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
{JSON.stringify(selectedImport.summary ?? {}, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-3 text-sm font-semibold text-gray-900">Plano salvo no preview</p>
                    <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
{JSON.stringify(selectedImport.planSnapshot ?? {}, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-3 text-sm font-semibold text-gray-900">Eventos por linha</p>

                    {selectedEvents.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum evento por linha foi encontrado para este import.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Venda</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ação</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Produto</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Processado em</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {selectedEvents.map((event) => (
                              <tr key={event.id} className="align-top">
                                <td className="px-3 py-2 text-xs text-gray-700">{event.saleId}</td>
                                <td className="px-3 py-2 text-xs text-gray-700">
                                  <StatusBadge status={event.status === 'processed' ? 'completed' : event.status} />
                                  <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{event.action}</div>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700">{event.customerEmail ?? '—'}</td>
                                <td className="px-3 py-2 text-xs text-gray-700">{event.productName ?? '—'}</td>
                                <td className="px-3 py-2 text-xs text-gray-700">{new Date(event.processedAt).toLocaleString('pt-BR')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}