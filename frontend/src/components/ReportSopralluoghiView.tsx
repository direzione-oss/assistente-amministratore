import React, { useState, useEffect, useMemo } from 'react';
import { getStoredToken } from '../auth';
import {
  FileText,
  Download,
  Eye,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  FolderOpen,
  Camera,
  Wrench,
  Scale,
  ExternalLink,
  X,
  FileCheck,
  Smartphone,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export interface ReportItem {
  id: string;
  tipo: 'sopralluogo' | 'intervento' | 'sollecito' | string;
  base_name: string;
  condominio: string;
  data_modifica_ts: number;
  data_modifica: string;
  has_docx: boolean;
  has_pdf: boolean;
  docx_filename: string | null;
  pdf_filename: string | null;
  docx_url: string | null;
  pdf_url: string | null;
  docx_size: number;
  pdf_size: number;
}

interface ReportSopralluoghiViewProps {
  apiBase: string; // es. "/api" o "/assistente/api"
  onNotify?: (msg: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const ReportSopralluoghiView: React.FC<ReportSopralluoghiViewProps> = ({ apiBase, onNotify }) => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'sopralluogo' | 'intervento' | 'sollecito'>('all');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      // Normalizza apiBase
      const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      const token = getStoredToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${base}/serra-mobile/reports`, { 
        credentials: 'include',
        headers
      });
      if (!res.ok) {
        throw new Error(`Errore server HTTP ${res.status}`);
      }
      const data = await res.json();
      setReports(data.reports || []);
    } catch (err: any) {
      console.error('Errore caricamento report:', err);
      setError(err.message || 'Impossibile caricare i report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [apiBase]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchTipo = tipoFilter === 'all' || r.tipo.toLowerCase() === tipoFilter.toLowerCase();
      const matchSearch =
        !searchTerm.trim() ||
        r.condominio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.base_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.tipo.toLowerCase().includes(searchTerm.toLowerCase());
      return matchTipo && matchSearch;
    });
  }, [reports, tipoFilter, searchTerm]);

  const counts = useMemo(() => {
    return {
      totale: reports.length,
      sopralluoghi: reports.filter((r) => r.tipo === 'sopralluogo').length,
      interventi: reports.filter((r) => r.tipo === 'intervento').length,
      solleciti: reports.filter((r) => r.tipo === 'sollecito').length,
      pdfCount: reports.filter((r) => r.has_pdf).length,
      docxCount: reports.filter((r) => r.has_docx).length,
    };
  }, [reports]);

  const getTipoBadge = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'sopralluogo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Camera className="w-3.5 h-3.5" />
            Sopralluogo
          </span>
        );
      case 'intervento':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Wrench className="w-3.5 h-3.5" />
            Intervento Manutentivo
          </span>
        );
      case 'sollecito':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Scale className="w-3.5 h-3.5" />
            Sollecito Formale
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <FileText className="w-3.5 h-3.5" />
            {tipo}
          </span>
        );
    }
  };

  const handleOpenPdf = (report: ReportItem) => {
    const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    let url = report.pdf_url
      ? `${base}${report.pdf_url.startsWith('/api') ? report.pdf_url.replace('/api', '') : report.pdf_url}`
      : `${base}/serra-mobile/reports/${report.tipo}/${report.base_name}.pdf`;
    const token = getStoredToken();
    if (token) {
      url += (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
    }
    setPreviewTitle(`${report.condominio} — ${report.tipo.toUpperCase()}`);
    setPreviewPdfUrl(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER DELLA SEZIONE */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20 text-slate-950 font-bold">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Archivio File & Report Sopralluoghi
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30">
                  DOCX + PDF
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Verbali di ispezione tecnica, segnalazioni interventi e documenti generati in mobilità da S.E.R.R.A. & @AssistenteStudioSerra_bot
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadReports}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition border border-slate-700 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Aggiorna</span>
          </button>
        </div>
      </div>

      {/* METRICHE STATISTICHE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Totale Report</p>
            <p className="text-2xl font-black text-white mt-0.5">{counts.totale}</p>
            <p className="text-[11px] text-slate-500 mt-1">{counts.pdfCount} PDF • {counts.docxCount} Word</p>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sopralluoghi</p>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{counts.sopralluoghi}</p>
            <p className="text-[11px] text-slate-500 mt-1">Con foto e sintesi IA</p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Camera className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Interventi</p>
            <p className="text-2xl font-black text-amber-400 mt-0.5">{counts.interventi}</p>
            <p className="text-[11px] text-slate-500 mt-1">Ticket DettoFatto</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Wrench className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Solleciti</p>
            <p className="text-2xl font-black text-purple-400 mt-0.5">{counts.solleciti}</p>
            <p className="text-[11px] text-slate-500 mt-1">Lettere formali</p>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Scale className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* BANNER INFORMATIVO INTEGRAZIONE BOT TELEGRAM */}
      <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900 border border-blue-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30 shrink-0 mt-0.5">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Flusso Automatico dal Telefono (@AssistenteStudioSerra_bot)
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                Attivo su VPS
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Quando sei sul campo, seleziona <b>📋 1. Sopralluogo</b> o <b>🛠️ 2. Intervento</b> sul bot Telegram: invia le foto dal cantiere con eventuali didascalie e note vocali.
              Al click su <b>✅ CHIUDI E GENERA DOC</b>, il sistema genera il verbale formale, lo converte in <b>PDF</b> e te lo invia direttamente nella chat Telegram, salvando sia il PDF che il DOCX qui nel CRM.
            </p>
          </div>
        </div>
      </div>

      {/* BARRA FILTRI E RICERCA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca per condominio, numero verbale o data..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setTipoFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              tipoFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Tutti ({reports.length})
          </button>
          <button
            onClick={() => setTipoFilter('sopralluogo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              tipoFilter === 'sopralluogo'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Sopralluoghi ({counts.sopralluoghi})
          </button>
          <button
            onClick={() => setTipoFilter('intervento')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              tipoFilter === 'intervento'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Interventi ({counts.interventi})
          </button>
          <button
            onClick={() => setTipoFilter('sollecito')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              tipoFilter === 'sollecito'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Solleciti ({counts.solleciti})
          </button>
        </div>
      </div>

      {/* STATO CARICAMENTO O ERRORE */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Caricamento archivio documenti dal server...</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-rose-300">Errore: {error}</p>
          <button
            onClick={loadReports}
            className="mt-3 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg cursor-pointer transition"
          >
            Riprova
          </button>
        </div>
      )}

      {/* ELENCO DEI REPORT */}
      {!loading && !error && (
        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-300">Nessun verbale trovato</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {searchTerm || tipoFilter !== 'all'
                  ? 'Nessun file corrisponde ai filtri impostati. Prova a modificare la ricerca.'
                  : 'Non sono ancora stati generati report. Esegui il tuo primo sopralluogo inviando foto al bot Telegram @AssistenteStudioSerra_bot.'}
              </p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
              const token = getStoredToken();
              const authQuery = token ? `?token=${encodeURIComponent(token)}` : '';
              const docxHref = (report.docx_url
                ? `${base}${report.docx_url.startsWith('/api') ? report.docx_url.replace('/api', '') : report.docx_url}`
                : `${base}/serra-mobile/reports/${report.tipo}/${report.base_name}.docx`) + authQuery;
              const pdfHref = (report.pdf_url
                ? `${base}${report.pdf_url.startsWith('/api') ? report.pdf_url.replace('/api', '') : report.pdf_url}`
                : `${base}/serra-mobile/reports/${report.tipo}/${report.base_name}.pdf`) + authQuery;

              return (
                <div
                  key={report.id}
                  className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 transition shadow-sm hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="p-3 rounded-xl bg-slate-800/80 text-amber-400 border border-slate-700/60 shrink-0 mt-0.5">
                      {report.tipo === 'sopralluogo' ? (
                        <Camera className="w-5 h-5 text-emerald-400" />
                      ) : report.tipo === 'intervento' ? (
                        <Wrench className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Scale className="w-5 h-5 text-purple-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {getTipoBadge(report.tipo)}
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {report.data_modifica}
                        </span>
                        <span className="text-xs text-slate-300 font-medium flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60">
                          Tecnico: <strong className="text-white">Gian Carlo ing. Serra</strong>
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white truncate flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="capitalize">{report.condominio}</span>
                      </h3>

                      <p className="text-xs text-slate-400 font-mono mt-1 truncate">
                        File: {report.base_name}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                        {report.has_pdf && (
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            PDF ({formatBytes(report.pdf_size)})
                          </span>
                        )}
                        {report.has_docx && (
                          <span className="flex items-center gap-1 text-blue-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            Word DOCX ({formatBytes(report.docx_size)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PULSANTI DI AZIONE DOWNLOAD E ANTEPRIMA */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* TASTO ANTEPRIMA PDF IN MODAL */}
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(report)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 cursor-pointer"
                      title="Anteprima rapida PDF a schermo"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Anteprima</span>
                    </button>

                    {/* TASTO SCARICA PDF */}
                    <a
                      href={pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition shadow-sm shadow-emerald-600/20 cursor-pointer"
                      title="Scarica o visualizza documento PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </a>

                    {/* TASTO SCARICA WORD DOCX */}
                    <a
                      href={docxHref}
                      download
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition shadow-sm shadow-blue-600/20 cursor-pointer"
                      title="Scarica documento Microsoft Word .docx modificabile"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>DOCX</span>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL ANTEPRIMA PDF */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white truncate max-w-md sm:max-w-xl">
                    {previewTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400">Anteprima documento PDF generato</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Nuova Scheda</span>
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 p-2 overflow-hidden">
              <iframe
                src={previewPdfUrl}
                className="w-full h-full rounded-xl border border-slate-800"
                title="Anteprima PDF"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
