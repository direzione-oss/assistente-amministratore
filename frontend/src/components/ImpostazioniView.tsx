import React, { useState, useMemo } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Search,
  CheckCircle2,
  FileText,
  Sliders,
  Download,
  Upload,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Hash,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  CustomPassoTemplate,
  getCustomPassiTemplate,
  saveCustomPassiTemplate,
  resetCustomPassiTemplate,
  isCustomPassiTemplateActive,
  isPassoPostAssemblea,
} from '../data/modello5Fallback';

interface ImpostazioniViewProps {
  apiBase: string;
  onTemplateUpdated: (newTemplate: CustomPassoTemplate[]) => void;
  onNotify: (msg: string) => void;
  onOpenRendiconto?: () => void;
}

const DEFAULT_SEZIONI = [
  '1. Controlli Preliminari & Riconciliazione',
  '2. Contatori, Pezze & Bilancio Consuntivo',
  '3. Bilancio Preventivo, Fondi & Sinistri',
  '4. Verifiche Finali, Stampa & Convocazione',
  '5. Adempimenti Dopo Assemblea',
];

const DOC_CODICI_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Nessun collegamento specifico (Generico)' },
  { value: 'doc_02_nota_esplicativa', label: '02 Nota esplicativa' },
  { value: 'doc_03_straordinario', label: '03 Documenti Bilancio Straordinario' },
  { value: 'doc_04_consuntivo', label: '04 Bilancio consuntivo' },
  { value: 'doc_05_sit_patrimoniale', label: '05 Situazione economica/patrimoniale' },
  { value: 'doc_06_registro', label: '06 Registro di contabilità per risorsa' },
  { value: 'doc_07a_debiti_crediti', label: '07a Dettaglio debiti/crediti' },
  { value: 'doc_07b_fondo', label: '07b Riparto Fondi' },
  { value: 'doc_08_comparativo', label: '08 Bilancio comparativo' },
  { value: 'doc_09_riparto_cons', label: '09 Riparto consuntivo per unità' },
  { value: 'doc_10_attivita', label: '10 Elenco attività' },
  { value: 'doc_11_calendar', label: '11 Google Calendar' },
  { value: 'doc_12_acqua', label: '12 Contatori acqua' },
  { value: 'doc_13_riscaldamento', label: '13 Letture contabilizzatori (riscaldamento)' },
  { value: 'doc_14_interessi', label: '14 Interessi di morosità' },
  { value: 'doc_15_criteri', label: '15 Criteri di ripartizione delle spese' },
  { value: 'doc_16_preventivo', label: '16 Bilancio preventivo' },
  { value: 'doc_17_riparto_prev', label: '17 Riparto preventivo sintetico per tabelle' },
  { value: 'doc_18_rate', label: '18 Prospetto rate' },
];

export const ImpostazioniView: React.FC<ImpostazioniViewProps> = ({
  apiBase,
  onTemplateUpdated,
  onNotify,
  onOpenRendiconto,
}) => {
  const [passi, setPassi] = useState<CustomPassoTemplate[]>(() => getCustomPassiTemplate());
  const [isCustom, setIsCustom] = useState<boolean>(() => isCustomPassiTemplateActive());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSezione, setSelectedSezione] = useState<string>('Tutte');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Modal / Box per aggiungere rapidamente un nuovo passaggio
  const [showNewStepModal, setShowNewStepModal] = useState(false);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [newStepDraft, setNewStepDraft] = useState<{
    numero_codice: string;
    sezione: string;
    chi_lo_fa: string;
    descrizione: string;
    ha_pagine: boolean;
    doc_codice: string;
    campi_extra_keys: string;
  }>({
    numero_codice: '',
    sezione: DEFAULT_SEZIONI[0],
    chi_lo_fa: 'G',
    descrizione: '',
    ha_pagine: false,
    doc_codice: '',
    campi_extra_keys: '',
  });

  // Input per aggiungere un campo extra a un passo specifico
  const [newExtraFieldLabel, setNewExtraFieldLabel] = useState<Record<number, string>>({});
  const [customSezioneInput, setCustomSezioneInput] = useState('');
  const [showNewSezioneInput, setShowNewSezioneInput] = useState(false);
  const [customSezioniList, setCustomSezioniList] = useState<string[]>([]);

  const tutteLeSezioni = useMemo(() => {
    const set = new Set<string>(DEFAULT_SEZIONI);
    for (const p of passi) {
      if (p.sezione) set.add(p.sezione);
    }
    for (const s of customSezioniList) {
      if (s) set.add(s);
    }
    return Array.from(set);
  }, [passi, customSezioniList]);

  const stats = useMemo(() => {
    const pre = passi.filter((p) => !isPassoPostAssemblea(p)).length;
    const post = passi.filter((p) => isPassoPostAssemblea(p)).length;
    const conPagine = passi.filter((p) => p.ha_pagine).length;
    return {
      totale: passi.length,
      pre,
      post,
      conPagine,
    };
  }, [passi]);

  const filteredPassiWithIndex = useMemo(() => {
    return passi
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (selectedSezione !== 'Tutte' && item.sezione !== selectedSezione) {
          return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          return (
            item.numero_codice.toLowerCase().includes(q) ||
            item.descrizione.toLowerCase().includes(q) ||
            item.sezione.toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [passi, selectedSezione, searchQuery]);

  const reindexOrdine = (list: CustomPassoTemplate[]): CustomPassoTemplate[] =>
    list.map((p, i) => ({ ...p, ordine: i + 1 }));

  const handleUpdateStep = (index: number, patch: Partial<CustomPassoTemplate>) => {
    setPassi((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return reindexOrdine(next);
    });
    setHasUnsavedChanges(true);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= passi.length) return;
    setPassi((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, removed);
      return reindexOrdine(copy);
    });
    if (expandedIndex === index) {
      setExpandedIndex(targetIndex);
    } else if (expandedIndex === targetIndex) {
      setExpandedIndex(index);
    }
    setHasUnsavedChanges(true);
  };

  const handleDeleteStep = (index: number) => {
    const target = passi[index];
    if (!target) return;
    if (passi.length <= 1) {
      alert('Deve rimanere almeno un passaggio nella procedura.');
      return;
    }
    const ok = window.confirm(
      `Vuoi eliminare il passaggio #${target.numero_codice} ("${target.descrizione}")?\n\nPotrai sempre annullare o ripristinare il Modello 5 originale.`
    );
    if (!ok) return;

    setPassi((prev) => reindexOrdine(prev.filter((_, i) => i !== index)));
    if (expandedIndex === index) setExpandedIndex(null);
    setHasUnsavedChanges(true);
  };

  const openAddStepModal = (afterIdx: number | null = null) => {
    const refStep = afterIdx !== null ? passi[afterIdx] : passi[passi.length - 1];
    const defaultSez =
      selectedSezione !== 'Tutte'
        ? selectedSezione
        : refStep?.sezione || DEFAULT_SEZIONI[0];

    let suggestedCode = String(passi.length + 1);
    if (afterIdx !== null && refStep) {
      const baseCode = refStep.numero_codice;
      if (/^\d+$/.test(baseCode)) {
        const candidate = `${baseCode}b`;
        const exists = passi.some((p) => p.numero_codice === candidate);
        suggestedCode = exists ? `${baseCode}c` : candidate;
      } else {
        suggestedCode = `${baseCode}_2`;
      }
    }

    setInsertAfterIndex(afterIdx);
    setNewStepDraft({
      numero_codice: suggestedCode,
      sezione: defaultSez,
      chi_lo_fa: refStep?.chi_lo_fa || 'G',
      descrizione: '',
      ha_pagine: false,
      doc_codice: '',
      campi_extra_keys: '',
    });
    setShowNewStepModal(true);
  };

  const handleConfirmAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepDraft.descrizione.trim()) {
      alert('Inserisci una descrizione per il nuovo passaggio.');
      return;
    }

    const extraObj: Record<string, string> = {};
    if (newStepDraft.campi_extra_keys.trim()) {
      newStepDraft.campi_extra_keys
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((k) => {
          extraObj[k] = '';
        });
    }

    const newPasso: CustomPassoTemplate = {
      ordine: 0,
      numero_codice: newStepDraft.numero_codice.trim() || String(passi.length + 1),
      sezione: newStepDraft.sezione,
      chi_lo_fa: newStepDraft.chi_lo_fa.trim() || 'G',
      descrizione: newStepDraft.descrizione.trim(),
      ha_pagine: newStepDraft.ha_pagine,
      doc_codice: newStepDraft.ha_pagine ? newStepDraft.doc_codice || null : null,
      num_pagine: 0,
      campi_extra: extraObj,
    };

    setPassi((prev) => {
      const copy = [...prev];
      const pos = insertAfterIndex !== null ? insertAfterIndex + 1 : copy.length;
      copy.splice(pos, 0, newPasso);
      return reindexOrdine(copy);
    });

    setShowNewStepModal(false);
    setHasUnsavedChanges(true);
    onNotify(`Nuovo passaggio #${newPasso.numero_codice} aggiunto! Clicca su "Salva e Applica" per confermare.`);
  };

  const handleAutoRenumberCodes = () => {
    const ok = window.confirm(
      'Vuoi rinumerare automaticamente i codici di tutti i passaggi in ordine sequenziale (1, 2, 3...)?\n\nNota: i passaggi con funzionalità speciali legate al codice (es. 15b Acqua, 33 Fondi, 47 Nota Esplicativa, 48 Fascicolo) manterranno le loro funzioni se non cambi i loro codici, oppure puoi rinumerare tutto.'
    );
    if (!ok) return;
    setPassi((prev) =>
      prev.map((p, idx) => ({
        ...p,
        ordine: idx + 1,
        numero_codice: String(idx + 1),
      }))
    );
    setHasUnsavedChanges(true);
    onNotify('Codici passaggi rinumerati in sequenza.');
  };

  const handleAddExtraFieldToStep = (stepIdx: number) => {
    const label = (newExtraFieldLabel[stepIdx] || '').trim();
    if (!label) return;
    const step = passi[stepIdx];
    if (!step) return;
    const nextExtra = { ...(step.campi_extra || {}), [label]: '' };
    handleUpdateStep(stepIdx, { campi_extra: nextExtra });
    setNewExtraFieldLabel((prev) => ({ ...prev, [stepIdx]: '' }));
  };

  const handleRemoveExtraFieldFromStep = (stepIdx: number, keyToRemove: string) => {
    const step = passi[stepIdx];
    if (!step) return;
    const nextExtra = { ...(step.campi_extra || {}) };
    delete nextExtra[keyToRemove];
    handleUpdateStep(stepIdx, { campi_extra: nextExtra });
  };

  const handleSaveAll = async () => {
    if (passi.length === 0) {
      alert('La procedura deve contenere almeno un passaggio.');
      return;
    }
    setSaving(true);
    try {
      const normalized = saveCustomPassiTemplate(passi);
      setPassi(normalized);
      setIsCustom(true);
      setHasUnsavedChanges(false);

      // Salva sul database del server VPS
      const endpointBase = apiBase ? `${apiBase}/api` : '/api';
      await fetch(`${endpointBase}/impostazioni/passi-rendiconto`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passi: normalized }),
      });

      onTemplateUpdated(normalized);
      onNotify(
        `Impostazioni salvate sul server! Tutti i condomini sono stati aggiornati con i ${normalized.length} passaggi.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    const ok = window.confirm(
      'Vuoi ripristinare i 63 passaggi originali del Modello 5 Studio Serra?\n\nLe spunte e i dati già inseriti nei condomini per i passaggi corrispondenti verranno conservati.'
    );
    if (!ok) return;
    setSaving(true);
    try {
      const defaults = resetCustomPassiTemplate();
      setPassi(defaults);
      setIsCustom(false);
      setHasUnsavedChanges(false);

      const endpointBase = apiBase ? `${apiBase}/api` : '/api';
      await fetch(`${endpointBase}/impostazioni/passi-rendiconto/reset`, {
        method: 'POST',
      });

      onTemplateUpdated(defaults);
      onNotify('Ripristinato il Modello 5 originale (63 passaggi) su tutti i condomini!');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = JSON.stringify(passi, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modello_passi_rendiconto_studio_serra_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(' Configurazione passaggi esportata in formato JSON.');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '[]'));
        if (!Array.isArray(parsed) || parsed.length === 0) {
          alert('Il file selezionato non contiene una lista valida di passaggi.');
          return;
        }
        const normalized = reindexOrdine(
          parsed.map((item: any, i: number) => ({
            ordine: i + 1,
            numero_codice: String(item.numero_codice || i + 1),
            sezione: String(item.sezione || DEFAULT_SEZIONI[0]),
            chi_lo_fa: String(item.chi_lo_fa || 'G'),
            descrizione: String(item.descrizione || ''),
            ha_pagine: Boolean(item.ha_pagine),
            doc_codice: item.ha_pagine ? item.doc_codice || null : null,
            num_pagine: Number(item.num_pagine || 0),
            campi_extra:
              item.campi_extra && typeof item.campi_extra === 'object' ? item.campi_extra : {},
          }))
        );
        setPassi(normalized);
        setHasUnsavedChanges(true);
        onNotify(
          `Importati ${normalized.length} passaggi dal file! Clicca su "Salva e Applica" per renderli attivi.`
        );
      } catch {
        alert('Errore nella lettura del file JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddCustomSezione = () => {
    const trimmed = customSezioneInput.trim();
    if (!trimmed) return;
    if (!customSezioniList.includes(trimmed)) {
      setCustomSezioniList((prev) => [...prev, trimmed]);
    }
    setSelectedSezione(trimmed);
    setCustomSezioneInput('');
    setShowNewSezioneInput(false);
    onNotify(`Nuova fase "${trimmed}" creata! Ora puoi assegnarla ai passaggi.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER PRINCIPALE IMPOSTAZIONI */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Settings className="w-3.5 h-3.5" />
                Personalizzazione Procedura Studio Serra
              </span>
              {isCustom ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  <Sparkles className="w-3.5 h-3.5" />
                  Modello Personalizzato Attivo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Modello 5 Standard (Originale)
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500 text-white animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Modifiche non ancora salvate
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Impostazioni & Gestione Passaggi Rendiconto
            </h2>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Modifica il testo di qualsiasi passaggio, aggiungine di nuovi nella posizione che
              preferisci, riordina o elimina quelli che non ti servono. Quando clicchi su{' '}
              <strong className="text-white">Salva e Applica</strong>, tutti i condomini vengono
              aggiornati preservando le spunte, le date e i dati già compilati.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenRendiconto && (
              <button
                type="button"
                onClick={onOpenRendiconto}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition cursor-pointer"
              >
                Vai alla Procedura Rendiconto
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => openAddStepModal(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Nuovo Passaggio
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvataggio...' : 'Salva e Applica a tutti i Condomini'}
            </button>
          </div>
        </div>

        {/* RIEPILOGO METRICHE TEMPLATE */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Totale Passaggi Procedura
            </div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.totale}</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <div className="text-[11px] font-bold uppercase text-indigo-300">
              Passaggi Pre-Assemblea (Fasi 1-4)
            </div>
            <div className="text-2xl font-black text-indigo-300 mt-0.5">{stats.pre}</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <div className="text-[11px] font-bold uppercase text-amber-300">
              Adempimenti Post-Assemblea (Fase 5)
            </div>
            <div className="text-2xl font-black text-amber-300 mt-0.5">{stats.post}</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <div className="text-[11px] font-bold uppercase text-emerald-300">
              Passaggi con Pagine Fascicolo (PAG.)
            </div>
            <div className="text-2xl font-black text-emerald-300 mt-0.5">{stats.conPagine}</div>
          </div>
        </div>
      </div>

      {/* BARRA STRUMENTI, FILTRI E AZIONI RAPIDE */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/90 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Ricerca testuale */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca passaggio per numero (es. 33) o parola chiave..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-medium text-slate-900"
            />
          </div>

          {/* Pulsanti Utilità Template */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewSezioneInput((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              title="Aggiungi una nuova Fase/Sezione"
            >
              <FolderPlus className="w-3.5 h-3.5 text-indigo-600" />
              Nuova Fase
            </button>

            <button
              type="button"
              onClick={handleAutoRenumberCodes}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              title="Rinumera i codici dei passaggi in sequenza 1, 2, 3..."
            >
              <Hash className="w-3.5 h-3.5 text-indigo-600" />
              Rinumera Codici
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              title="Scarica backup JSON dei passaggi"
            >
              <Download className="w-3.5 h-3.5 text-slate-700" />
              Esporta Backup
            </button>

            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-700" />
              Importa Backup
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
              title="Ripristina i 63 passaggi predefiniti del Modello 5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Ripristina Modello 5 Originale
            </button>
          </div>
        </div>

        {/* Creazione Nuova Fase/Sezione opzionale */}
        {showNewSezioneInput && (
          <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={customSezioneInput}
              onChange={(e) => setCustomSezioneInput(e.target.value)}
              placeholder="Es. 6. Controlli Fiscali & Certificazione Unica"
              className="flex-1 px-3 py-1.5 text-sm bg-white border border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-600"
            />
            <button
              type="button"
              onClick={handleAddCustomSezione}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
            >
              Crea Fase
            </button>
            <button
              type="button"
              onClick={() => setShowNewSezioneInput(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-bold cursor-pointer"
            >
              Annulla
            </button>
          </div>
        )}

        {/* Filtro per Fase / Sezione */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedSezione('Tutte')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
              selectedSezione === 'Tutte'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tutte le Fasi ({passi.length})
          </button>
          {tutteLeSezioni.map((sez) => {
            const count = passi.filter((p) => p.sezione === sez).length;
            return (
              <button
                key={sez}
                type="button"
                onClick={() => setSelectedSezione(sez)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedSezione === sez
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {sez} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* LISTA DEI PASSAGGI MODIFICABILI */}
      <div className="space-y-2.5">
        {filteredPassiWithIndex.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <p className="text-sm font-semibold text-slate-600">
              Nessun passaggio trovato con i filtri attuali.
            </p>
            <button
              type="button"
              onClick={() => openAddStepModal(null)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Aggiungi un nuovo passaggio qui
            </button>
          </div>
        ) : (
          filteredPassiWithIndex.map(({ item, idx }) => {
            const isExpanded = expandedIndex === idx;
            const extraKeys = Object.keys(item.campi_extra || {});
            const isPost = isPassoPostAssemblea(item);

            return (
              <div
                key={`${idx}-${item.ordine}`}
                className={`bg-white rounded-2xl border transition shadow-2xs ${
                  isExpanded
                    ? 'border-indigo-500 ring-2 ring-indigo-500/15'
                    : isPost
                      ? 'border-amber-200/90 hover:border-amber-300'
                      : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* RIGA PRINCIPALE DEL PASSAGGIO */}
                <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Controlli Ordine Su / Giù + Numero Posizione */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded-md bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 disabled:opacity-30 cursor-pointer"
                        title="Sposta in alto"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'down')}
                        disabled={idx === passi.length - 1}
                        className="p-1 rounded-md bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 disabled:opacity-30 cursor-pointer"
                        title="Sposta in basso"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Input Codice Passaggio (es. 1, 15b, 33) */}
                    <div className="w-16">
                      <label className="block text-[9px] font-extrabold uppercase text-slate-400 text-center mb-0.5">
                        Codice
                      </label>
                      <input
                        type="text"
                        value={item.numero_codice}
                        onChange={(e) =>
                          handleUpdateStep(idx, { numero_codice: e.target.value })
                        }
                        className="w-full text-center font-extrabold text-xs px-1.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 focus:outline-none focus:border-indigo-600"
                        title="Codice identificativo del passaggio"
                      />
                    </div>
                  </div>

                  {/* Descrizione & Sezione */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      type="text"
                      value={item.descrizione}
                      onChange={(e) => handleUpdateStep(idx, { descrizione: e.target.value })}
                      placeholder="Descrizione dell'attività da svolgere in questo passaggio..."
                      className="w-full px-3 py-1.5 text-sm font-bold text-slate-900 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <select
                        value={item.sezione}
                        onChange={(e) => handleUpdateStep(idx, { sezione: e.target.value })}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-semibold text-slate-700 text-xs focus:outline-none focus:border-indigo-600"
                      >
                        {tutteLeSezioni.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      {item.ha_pagine && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold border border-amber-300">
                          <FileText className="w-3 h-3" />
                          Produce Pag. Fascicolo
                        </span>
                      )}

                      {extraKeys.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-bold border border-indigo-200">
                          <Sliders className="w-3 h-3" />
                          {extraKeys.length} camp{extraKeys.length === 1 ? 'o' : 'i'} extra:{' '}
                          {extraKeys.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Azioni sulla riga */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => openAddStepModal(idx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer"
                      title="Inserisci un nuovo passaggio subito sotto a questo"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Inserisci sotto</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        isExpanded
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                      title="Opzioni avanzate (Pagine fascicolo, Campi extra, Operatore)"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Opzioni</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteStep(idx)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition cursor-pointer"
                      title="Elimina questo passaggio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* PANNELLO ESPANSO OPZIONI AVANZATE DEL PASSAGGIO */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Sigla Operatore Default */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Chi lo fa (Sigla Operatore)
                        </label>
                        <input
                          type="text"
                          value={item.chi_lo_fa}
                          onChange={(e) => handleUpdateStep(idx, { chi_lo_fa: e.target.value })}
                          placeholder="Es. G"
                          className="w-full px-3 py-1.5 text-sm font-bold bg-slate-50 border border-slate-300 rounded-lg"
                        />
                      </div>

                      {/* Toggle Produce Documento con Pagine */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                        <span className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Richiede Numero Pagine (Col. PAG.)?
                        </span>
                        <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                          <input
                            type="checkbox"
                            checked={item.ha_pagine}
                            onChange={(e) =>
                              handleUpdateStep(idx, {
                                ha_pagine: e.target.checked,
                                doc_codice: e.target.checked ? item.doc_codice : null,
                              })
                            }
                            className="w-4 h-4 rounded text-indigo-600"
                          />
                          <span className="text-xs font-bold text-slate-800">
                            Sì, mostra il riquadro "Numero Pagine Documento"
                          </span>
                        </label>
                      </div>

                      {/* Collegamento Documento Fascicolo */}
                      {item.ha_pagine && (
                        <div className="bg-white p-3 rounded-xl border border-amber-300">
                          <label className="block text-[11px] font-extrabold uppercase text-amber-900 mb-1">
                            Collega a Rigo Fascicolo (Passo 48)
                          </label>
                          <select
                            value={item.doc_codice || ''}
                            onChange={(e) =>
                              handleUpdateStep(idx, {
                                doc_codice: e.target.value || null,
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-amber-50 border border-amber-300 rounded-lg text-slate-900"
                          >
                            {DOC_CODICI_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Gestione Campi Extra personalizzati del passo */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase text-indigo-950">
                          Campi Input da compilare in questo passaggio (Campi Extra)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Vengono mostrati come caselle da compilare nella scheda del passaggio
                        </span>
                      </div>

                      {extraKeys.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {extraKeys.map((k) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900"
                            >
                              {k}
                              <button
                                type="button"
                                onClick={() => handleRemoveExtraFieldFromStep(idx, k)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                title="Rimuovi questo campo"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">
                          Nessun campo specifico configurato (verrà mostrato il campo generico
                          "Esito Verifica / Valore Riscontrato").
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newExtraFieldLabel[idx] || ''}
                          onChange={(e) =>
                            setNewExtraFieldLabel((prev) => ({
                              ...prev,
                              [idx]: e.target.value,
                            }))
                          }
                          placeholder="Nome nuovo campo (es. Importo €, Data verifica, Riferimento...)"
                          className="flex-1 max-w-sm px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddExtraFieldToStep(idx)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                        >
                          + Aggiungi Campo
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* BARRA FISSA IN BASSO SE CI SONO MODIFICHE DA SALVARE */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-5 right-6 left-6 lg:left-80 z-40 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-emerald-400/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <div className="text-sm font-extrabold">
                Hai apportato modifiche ai passaggi del Rendiconto
              </div>
              <div className="text-xs text-slate-300">
                Clicca su "Salva e Applica" per rendere effettive le modifiche su tutti i condomini.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPassi(getCustomPassiTemplate());
                setHasUnsavedChanges(false);
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Annulla modifiche
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvataggio...' : 'Salva e Applica Ora'}
            </button>
          </div>
        </div>
      )}

      {/* MODALE AGGIUNTA NUOVO PASSAGGIO */}
      {showNewStepModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {insertAfterIndex !== null
                    ? `Inserisci Nuovo Passaggio dopo #${passi[insertAfterIndex]?.numero_codice}`
                    : 'Aggiungi Nuovo Passaggio al Rendiconto'}
                </h3>
                <p className="text-xs text-slate-500">
                  Il nuovo passaggio sarà disponibile nella checklist di tutti i condomini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewStepModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleConfirmAddStep} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Codice Passo
                  </label>
                  <input
                    type="text"
                    required
                    value={newStepDraft.numero_codice}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, numero_codice: e.target.value }))
                    }
                    placeholder="Es. 15c o 63"
                    className="w-full px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Fase / Sezione
                  </label>
                  <select
                    value={newStepDraft.sezione}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, sezione: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    {tutteLeSezioni.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Descrizione del Passaggio *
                </label>
                <textarea
                  rows={3}
                  required
                  value={newStepDraft.descrizione}
                  onChange={(e) =>
                    setNewStepDraft((d) => ({ ...d, descrizione: e.target.value }))
                  }
                  placeholder="Scrivi cosa deve verificare o fare l'operatore in questo passaggio..."
                  className="w-full px-3.5 py-2.5 text-sm font-medium bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Operatore Predefinito
                  </label>
                  <input
                    type="text"
                    value={newStepDraft.chi_lo_fa}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, chi_lo_fa: e.target.value }))
                    }
                    placeholder="G"
                    className="w-full px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Campi Input Extra (separati da virgola)
                  </label>
                  <input
                    type="text"
                    value={newStepDraft.campi_extra_keys}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, campi_extra_keys: e.target.value }))
                    }
                    placeholder="Es. Importo €, Data controllo"
                    className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newStepDraft.ha_pagine}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, ha_pagine: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs font-bold text-amber-950">
                    Questo passaggio produce un documento con numero pagine (Col. PAG.)
                  </span>
                </label>

                {newStepDraft.ha_pagine && (
                  <select
                    value={newStepDraft.doc_codice}
                    onChange={(e) =>
                      setNewStepDraft((d) => ({ ...d, doc_codice: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-amber-300 rounded-lg"
                  >
                    {DOC_CODICI_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewStepModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Aggiungi Passaggio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
