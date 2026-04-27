import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { api } from '../lib/api';
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ImportResult {
  total: number;
  imported: number;
  renewed: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ saleId: string; error: string }>;
}

const BILLING_CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
];

interface Props {
  onClose: () => void;
}

export default function ImportCaktoModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [productId, setProductId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [skipRefunded, setSkipRefunded] = useState(true);
  const [importMode, setImportMode] = useState('auto');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: productsData } = useQuery('products', () =>
    api.get('/customers/products').then((r) => r.data),
  );

  const importMutation = useMutation(
    async () => {
      if (!file || !productId) throw new Error('Arquivo e produto são obrigatórios.');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('billingCycle', billingCycle);
      formData.append('skipRefunded', String(skipRefunded));
      formData.append('importMode', importMode);

      const res = await api.post('/customers/import-cakto', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as ImportResult;
    },
    {
      onSuccess: (data) => {
        setResult(data);
        if (data.imported > 0) {
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
      setResult(null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
    }
  };

  const canImport = !!file && !!productId && !importMutation.isLoading;

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
              Importe o histórico de vendas exportado da Cakto (CSV ou XLSX). Apenas vendas com
              status <strong>paid</strong> serão ativadas. Clientes já cadastrados são reutilizados.
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
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
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

          {/* Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Produto <span className="text-red-500">*</span>
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione o produto...</option>
                {(productsData ?? []).map((p: { id: string; name: string; priceInCents: number }) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ciclo de Cobrança
              </label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BILLING_CYCLE_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Import mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de relatório</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'auto', label: 'Automático', desc: 'Usa coluna "Tipo da Venda" do CSV' },
                { value: 'force_new', label: 'Adesão', desc: 'Todas as linhas criam assinatura nova' },
                { value: 'force_renewal', label: 'Renovação', desc: 'Todas as linhas estendem assinatura existente' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setImportMode(opt.value)}
                  className={`
                    text-left rounded-lg border px-3 py-2.5 transition-all
                    ${importMode === opt.value
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                  `}
                >
                  <p className={`text-xs font-semibold ${importMode === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipRefunded}
              onChange={(e) => setSkipRefunded(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Ignorar vendas reembolsadas ou com chargeback
            </span>
          </label>

          {/* Error */}
          {importMutation.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {(importMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao processar o arquivo.'}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Resultado da importação</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { label: 'Total', value: result.total, color: 'text-gray-700' },
                  { label: 'Novos', value: result.imported, color: 'text-green-600' },
                  { label: 'Renovados', value: result.renewed, color: 'text-purple-600' },
                  { label: 'Ignorados', value: result.skipped, color: 'text-yellow-600' },
                  { label: 'Duplicados', value: result.duplicates, color: 'text-blue-600' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

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
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              onClick={() => importMutation.mutate()}
              disabled={!canImport}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4" />
              {importMutation.isLoading ? 'Importando...' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
