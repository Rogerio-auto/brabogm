import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ImportResult {
  total: number;
  imported: number;
  renewed: number;
  expired?: number;
  cancelled?: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ saleId: string; error: string }>;
  importId?: string;
  status?: 'completed';
  fileHash?: string;
  fileName?: string;
  finishedAt?: string;
}

interface ImportPreviewResult extends ImportResult {
  previewId: string;
  orphanRenewals: number;
  blocked: boolean;
  blockingReasons: string[];
  expiresAt: string;
  fileHash: string;
  fileName: string;
  fileSize: number;
  warnings: string[];
  hasPriorCompletedImport: boolean;
  priorImportId: string | null;
}

interface Props {
  onClose: () => void;
}

export default function ImportCaktoModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);

  const previewMutation = useMutation(
    async () => {
      if (!file) throw new Error('Arquivo é obrigatório.');

      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/customers/import-cakto/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as ImportPreviewResult;
    },
    {
      onSuccess: (data) => {
        setPreview(data);
        setResult(null);
        setCancelConfirmed(false);
      },
    },
  );

  const commitMutation = useMutation(
    async () => {
      if (!preview) throw new Error('Pré-visualização não encontrada.');

      const res = await api.post('/customers/import-cakto/commit', {
        previewId: preview.previewId,
      });
      return res.data as ImportResult;
    },
    {
      onSuccess: (data) => {
        setResult(data);
        setPreview(null);
        if (data.imported > 0 || data.renewed > 0 || (data.cancelled ?? 0) > 0) {
          queryClient.invalidateQueries('customers');
        }
      },
    },
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && /\.(csv|xls|xlsx)$/i.test(dropped.name)) {
      setFile(dropped);
      setPreview(null);
      setResult(null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreview(null);
      setResult(null);
      setCancelConfirmed(false);
    }
  };

  const HIGH_CANCEL_THRESHOLD = 10;
  const requiresCancelConfirm = !!preview && (preview.cancelled ?? 0) > HIGH_CANCEL_THRESHOLD;
  const canPreview = !!file && !previewMutation.isLoading && !commitMutation.isLoading;
  const canCommit =
    !!preview &&
    !preview.blocked &&
    !commitMutation.isLoading &&
    (!requiresCancelConfirm || cancelConfirmed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">Importar da Cakto</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Info */}
          <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Importe o histórico de vendas exportado da Cakto. O sistema usa o mapeamento interno
              dos produtos, ignora orderbumps e produtos fora de escopo, e trata chargeback com a
              mesma regra de reembolso.
            </span>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}
              ${file ? 'border-green-300 bg-green-50' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium text-sm">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); setCancelConfirmed(false); }}
                  className="ml-1 text-green-500 hover:text-green-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-sm font-medium text-gray-600">Arraste o arquivo ou clique para selecionar</p>
                <p className="text-xs text-gray-400">CSV, XLS ou XLSX — máx. 20 MB</p>
              </div>
            )}
          </div>

          {!preview && !result && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              A importação agora acontece em duas etapas: primeiro a pré-visualização, depois a
              confirmação final.
            </div>
          )}

          {/* Error */}
          {(previewMutation.isError || commitMutation.isError) && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {((previewMutation.error ?? commitMutation.error) as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message instanceof Array
                ? (((previewMutation.error ?? commitMutation.error) as { response?: { data?: { message?: string[] } } }).response?.data?.message ?? []).join(', ')
                : (((previewMutation.error ?? commitMutation.error) as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao processar o arquivo.')}
            </div>
          )}

          {preview && !result && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800">Pré-visualização da importação</p>
                <span className="text-xs text-gray-500">
                  expira em {new Date(preview.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="grid grid-cols-8 gap-2 text-center">
                {[
                  { label: 'Total', value: preview.total, color: 'text-gray-700' },
                  { label: 'Novos', value: preview.imported, color: 'text-green-600' },
                  { label: 'Renovados', value: preview.renewed, color: 'text-purple-600' },
                  { label: 'Expirados', value: preview.expired ?? 0, color: 'text-orange-500' },
                  { label: 'Cancelados', value: preview.cancelled ?? 0, color: 'text-red-600' },
                  { label: 'Ignorados', value: preview.skipped, color: 'text-yellow-600' },
                  { label: 'Duplicados', value: preview.duplicates, color: 'text-blue-600' },
                  { label: 'Órfãs', value: preview.orphanRenewals, color: 'text-rose-600' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {preview.blocked && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                  <p className="font-semibold">Importação bloqueada</p>
                  {preview.blockingReasons.map((reason) => (
                    <p key={reason}>{reason}</p>
                  ))}
                  {preview.orphanRenewals > 0 && (
                    <div className="pt-2">
                      <Link
                        to="/orphan-renewals"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Abrir fila de revisão manual
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
                  <p className="font-semibold">Atenção antes de confirmar</p>
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 space-y-1">
                <p>
                  <span className="font-semibold text-gray-700">Arquivo:</span> {preview.fileName}
                </p>
                <p>
                  <span className="font-semibold text-gray-700">SHA-256:</span> {preview.fileHash}
                </p>
              </div>

              {requiresCancelConfirm && (
                <label className="flex items-start gap-2.5 rounded-lg border border-orange-300 bg-orange-50 p-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cancelConfirmed}
                    onChange={(e) => setCancelConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-orange-400 text-orange-600 accent-orange-600"
                  />
                  <span className="text-xs text-orange-800 leading-relaxed">
                    <span className="font-semibold block mb-0.5">
                      Atenção: {preview.cancelled} cancelamentos detectados
                    </span>
                    Confirmo que revisei os cancelamentos acima e autorizo a importação.
                  </span>
                </label>
              )}

              {preview.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">
                    {preview.errors.length} problema{preview.errors.length > 1 ? 's' : ''} encontrado{preview.errors.length > 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {preview.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">
                        <span className="font-mono">{e.saleId || '—'}</span>: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Resultado da importação</p>
              <div className="grid grid-cols-7 gap-2 text-center">
                {[
                  { label: 'Total', value: result.total, color: 'text-gray-700' },
                  { label: 'Novos', value: result.imported, color: 'text-green-600' },
                  { label: 'Renovados', value: result.renewed, color: 'text-purple-600' },
                  { label: 'Expirados', value: result.expired ?? 0, color: 'text-orange-500' },
                  { label: 'Cancelados', value: result.cancelled ?? 0, color: 'text-red-600' },
                  { label: 'Ignorados', value: result.skipped, color: 'text-yellow-600' },
                  { label: 'Duplicados', value: result.duplicates, color: 'text-blue-600' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {(result.importId || result.fileHash || result.finishedAt) && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 space-y-1">
                  {result.importId && (
                    <p>
                      <span className="font-semibold">Protocolo:</span> {result.importId}
                    </p>
                  )}
                  {result.finishedAt && (
                    <p>
                      <span className="font-semibold">Concluída em:</span>{' '}
                      {new Date(result.finishedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                  {result.fileHash && (
                    <p>
                      <span className="font-semibold">SHA-256:</span> {result.fileHash}
                    </p>
                  )}
                  <div className="pt-2">
                    <Link
                      to="/cakto-imports"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Ver histórico de imports
                    </Link>
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">
                    {result.errors.length} erro{result.errors.length > 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">
                        <span className="font-mono">{e.saleId || '—'}</span>: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => {
              if (preview && !result) {
                setPreview(null);
                return;
              }
              onClose();
            }}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {result ? 'Fechar' : preview ? 'Voltar' : 'Cancelar'}
          </button>
          {!result && !preview && (
            <button
              onClick={() => previewMutation.mutate()}
              disabled={!canPreview}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4" />
              {previewMutation.isLoading ? 'Analisando...' : 'Pré-visualizar'}
            </button>
          )}
          {!result && preview && (
            <button
              onClick={() => commitMutation.mutate()}
              disabled={!canCommit}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4" />
              {commitMutation.isLoading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
