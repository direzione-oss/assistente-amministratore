import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare,
  FileSpreadsheet,
  Droplets,
  BookOpen,
  Sparkles,
  Copy,
  Check,
  Plus,
  Search,
  FileText,
  AlertTriangle,
  Printer,
  ChevronRight,
  ChevronLeft,
  Layers,
  Play,
  StickyNote,
  ArrowRight,
  CheckCircle2,
  Circle,
  User,
  RefreshCw,
  Calculator,
  Trash2,
  Edit3,
  RotateCcw,
  Download,
  X,
  Settings,
  Users,
} from 'lucide-react';
import {
  FALLBACK_SCHEDE_RENDICONTO,
  RAW_PASSI_MODELLO_5,
  ricalcolaSchedaFrontend,
  buildSchedaIniziale,
  PROMPT_SLIDE_NOTEBOOKLM,
  PROMPT_PODCAST_NOTEBOOKLM,
  getCustomPassiTemplate,
  syncSchedaWithTemplate,
} from '../data/modello5Fallback';
import { syncAssembleaOrdinariaFromScheda } from './GestioneAssembleeView';

export interface PassoRendiconto {
  id: number;
  scheda_id: number;
  ordine: number;
  numero_codice: string;
  sezione: string;
  chi_lo_fa: string;
  fatto: boolean;
  data_spunta?: string | null;
  descrizione: string;
  ha_pagine: boolean;
  doc_codice?: string | null;
  num_pagine: number;
  campi_extra: Record<string, string>;
  note_passo?: string | null;
}

export interface DocumentoAllegato {
  id_riga: number;
  numero_allegato: number;
  incluso: boolean;
  titolo: string;
  prima_pagina: number;
  pagine_documento: number;
  riferimento_passo: string;
  fisso: boolean;
}

export interface NotaCheckItem {
  codice: string;
  titolo: string;
  gruppo: string;
  fatto: boolean;
  note: string;
}

export interface SchedaRendiconto {
  id: number;
  condominio_id: number;
  condominio_nome: string;
  condominio_codice_danea?: string | null;
  condominio_iban?: string | null;
  procedura_codice: string;
  gestione: string;
  fatto_il?: string | null;
  note_intestazione?: string | null;
  chi_lo_fa_default: string;
  totale_passi: number;
  passi_completati: number;
  percentuale_fatto: number;
  post_assemblea_completati?: number;
  post_assemblea_totale?: number;
  in_attesa_assemblea?: boolean;
  calcolatore_acqua: {
    consumo_contabilizzatori: number;
    mc_fatture: number;
    mc_oltre_letture: number;
    costo_fatture_h2o: number;
    costo_al_mc: number;
    quota_acqua_eccedente: number;
    soglia_eccedenza_superata: boolean;
  };
  nota_esplicativa_checks: NotaCheckItem[];
  documenti_allegati: DocumentoAllegato[];
  totale_pagine_fascicolo: number;
  passi: PassoRendiconto[];
  prompt_slide_notebooklm: string;
  prompt_podcast_notebooklm: string;
}

interface CondominioSimple {
  id: number;
  codice_danea: string;
  nome: string;
  esercizio_in_corso: string;
}

export interface ActiveRendicontoProgress {
  schedaId: number;
  condominioId: number;
  condominioNome: string;
  condominioCodiceDanea?: string | null;
  gestione: string;
  percentualeFatto: number;
  passiCompletati: number;
  totalePassi: number;
  postAssembleaCompletati?: number;
  postAssembleaTotale?: number;
  inAttesaAssemblea?: boolean;
  passoAttivoCodice?: string;
  passoAttivoIndice?: number;
}

interface Props {
  apiBase: string;
  condomini: CondominioSimple[];
  selectedCondominioId?: number | null;
  onNotify: (msg: string) => void;
  onRinnovaEsercizio?: (condominioId: number) => void;
  onProgressChange?: (progress: ActiveRendicontoProgress) => void;
  onOpenImpostazioni?: () => void;
  onOpenGestioneAssemblee?: (condominioId: number) => void;
  templateVersion?: number;
}

const STORAGE_KEY_SCHEDE = 'studio_serra_modello5_schede_v3';
const STORAGE_KEY_ACTIVE_SCHEDA = 'studio_serra_modello5_active_scheda_id';

const RAW_PASSI_BY_ORDINE = new Map(RAW_PASSI_MODELLO_5.map((rp) => [rp.ordine, rp]));

export const saveSchedeToStorage = (schedeList: SchedaRendiconto[]) => {
  try {
    // Compatta i testi statici (descrizione passo, sezione, allegati ricalcolati, prompt standard)
    // per ridurre il payload da ~6MB a ~350KB ed evitare QuotaExceededError su localStorage!
    const compact = schedeList.map((s) => ({
      ...s,
      documenti_allegati: [],
      prompt_slide_notebooklm:
        s.prompt_slide_notebooklm === PROMPT_SLIDE_NOTEBOOKLM ? '' : s.prompt_slide_notebooklm,
      prompt_podcast_notebooklm:
        s.prompt_podcast_notebooklm === PROMPT_PODCAST_NOTEBOOKLM ? '' : s.prompt_podcast_notebooklm,
      passi: (s.passi || []).map((p) => ({
        ...p,
        sezione: '',
        descrizione: '',
      })),
    }));
    localStorage.setItem(STORAGE_KEY_SCHEDE, JSON.stringify(compact));
  } catch (e) {
    console.warn('Errore salvataggio localStorage:', e);
  }
};

export const rehydrateScheda = (s: SchedaRendiconto): SchedaRendiconto => {
  const customTpl = getCustomPassiTemplate();
  const tplByCode = new Map(customTpl.map((tp) => [String(tp.numero_codice), tp]));
  const passiRehydrated = (s.passi || []).map((p) => {
    const tpl = tplByCode.get(String(p.numero_codice)) || RAW_PASSI_BY_ORDINE.get(p.ordine);
    return {
      ...p,
      sezione: p.sezione || tpl?.sezione || '',
      descrizione: p.descrizione || tpl?.descrizione || '',
      ha_pagine: p.ha_pagine ?? tpl?.ha_pagine ?? false,
      doc_codice: p.doc_codice ?? tpl?.doc_codice ?? null,
    };
  });
  const baseRehydrated = {
    ...s,
    prompt_slide_notebooklm: s.prompt_slide_notebooklm || PROMPT_SLIDE_NOTEBOOKLM,
    prompt_podcast_notebooklm: s.prompt_podcast_notebooklm || PROMPT_PODCAST_NOTEBOOKLM,
    passi: passiRehydrated,
  };
  return syncSchedaWithTemplate(baseRehydrated, customTpl);
};

const computeNextYearGestione = (gestioneStr: string): string => {
  const m = gestioneStr.match(
    /^(\d{2}\/\d{2}\/)(\d{4})\s*-\s*(\d{2}\/\d{2}\/)(\d{4})$/
  );
  if (m) {
    return `${m[1]}${Number(m[2]) + 1} - ${m[3]}${Number(m[4]) + 1}`;
  }
  return '01/01/2026 - 31/12/2026';
};

export const loadInitialSchede = (): SchedaRendiconto[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCHEDE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        Array.isArray(parsed[0]?.passi) &&
        parsed[0].passi.length > 0
      ) {
        return parsed.map((s: SchedaRendiconto) => rehydrateScheda(s));
      }
    }
  } catch (e) {
    console.warn('Ripristino fallback Modello 5:', e);
  }
  const tpl = getCustomPassiTemplate();
  return FALLBACK_SCHEDE_RENDICONTO.map((s) => syncSchedaWithTemplate(s, tpl));
};

/**
 * Unisce le schede provenienti dal server preservando eventuali modifiche locali in corso di digitazione
 * senza scatenare raffiche di richieste PATCH o sovrascrivere stati già salvati sul backend.
 */
const mergeServerWithLocalSchede = (
  serverSchede: SchedaRendiconto[],
  localSchede: SchedaRendiconto[],
  pendingStep: { schedaId: number; passoId: number; patch: Record<string, any> } | null,
  pendingHeader: { schedaId: number; patch: Record<string, any> } | null
): SchedaRendiconto[] => {
  return serverSchede.map((srv) => {
    let merged = srv;
    const localScheda = localSchede.find((ls) => ls.id === srv.id);
    if (localScheda && Array.isArray(localScheda.passi)) {
      const srvDoneCount = (srv.passi || []).filter((p) => p.fatto).length;
      const locDoneCount = localScheda.passi.filter((p) => p.fatto).length;
      if (locDoneCount >= srvDoneCount) {
        merged = {
          ...merged,
          passi: merged.passi.map((sp) => {
            const lp = localScheda.passi.find(
              (x) => x.id === sp.id || x.numero_codice === sp.numero_codice
            );
            if (!lp) return sp;
            return {
              ...sp,
              fatto: sp.fatto || lp.fatto,
              data_spunta: sp.data_spunta || lp.data_spunta,
              note_passo: sp.note_passo || lp.note_passo,
              campi_extra:
                sp.campi_extra && Object.keys(sp.campi_extra).length > 0
                  ? { ...(lp.campi_extra || {}), ...sp.campi_extra }
                  : lp.campi_extra || sp.campi_extra,
            };
          }),
        };
      }
    }
    if (pendingHeader && pendingHeader.schedaId === srv.id) {
      merged = { ...merged, ...pendingHeader.patch };
    }
    if (pendingStep && pendingStep.schedaId === srv.id) {
      merged = {
        ...merged,
        passi: merged.passi.map((sp) =>
          sp.id === pendingStep.passoId ? { ...sp, ...pendingStep.patch } : sp
        ),
      };
    }
    return ricalcolaSchedaFrontend(merged);
  });
};

export const ProceduraRendicontoView: React.FC<Props> = ({
  apiBase,
  condomini,
  selectedCondominioId,
  onNotify,
  onRinnovaEsercizio,
  onProgressChange,
  onOpenImpostazioni,
  onOpenGestioneAssemblee,
  templateVersion,
}) => {
  const [schede, setSchede] = useState<SchedaRendiconto[]>(() => loadInitialSchede());
  const schedeRef = useRef<SchedaRendiconto[]>(schede);
  useEffect(() => {
    schedeRef.current = schede;
  }, [schede]);

  useEffect(() => {
    if (templateVersion === undefined) return;
    const tpl = getCustomPassiTemplate();
    setSchede((prev) => {
      const updated = prev.map((s) => syncSchedaWithTemplate(s, tpl));
      saveSchedeToStorage(updated);
      return updated;
    });
  }, [templateVersion]);

  const [activeSchedaId, setActiveSchedaIdState] = useState<number | null>(() => {
    const init = loadInitialSchede();
    if (selectedCondominioId) {
      const latestForCondo = [...init]
        .reverse()
        .find((s) => s.condominio_id === selectedCondominioId);
      if (latestForCondo) return latestForCondo.id;
    }
    try {
      const savedId = Number(localStorage.getItem(STORAGE_KEY_ACTIVE_SCHEDA));
      if (savedId && init.some((s) => s.id === savedId)) {
        return savedId;
      }
    } catch {
      // ignore
    }
    return init[0]?.id || 1;
  });

  const activeSchedaIdRef = useRef<number | null>(activeSchedaId);
  useEffect(() => {
    activeSchedaIdRef.current = activeSchedaId;
  }, [activeSchedaId]);

  const setActiveSchedaId = (id: number | null | ((prev: number | null) => number | null)) => {
    setActiveSchedaIdState((prev) => {
      const nextId = typeof id === 'function' ? id(prev) : id;
      activeSchedaIdRef.current = nextId;
      if (nextId !== null) {
        try {
          localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDA, String(nextId));
        } catch {
          // ignore
        }
      }
      return nextId;
    });
  };

  // Sotto-schede della vista Procedura 002
  const [subTab, setSubTab] = useState<'scaletta' | 'allegati' | 'nota_acqua' | 'prompts'>('scaletta');

  // Filtri vista generale a sinistra
  const [searchStep, setSearchStep] = useState('');
  const [filterStato, setFilterStato] = useState<'tutti' | 'da_fare' | 'fatti'>('tutti');
  const [filterSezione, setFilterSezione] = useState<string>('Tutte');

  // Indice della carta attiva (0..62) nella sequenza dei passi
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [cardDirection, setCardDirection] = useState<'next' | 'prev' | null>(null);

  // Riferimenti per auto-scroll dell'elemento attivo nella scaletta di sinistra
  const stepItemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Nuova scheda modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCondominioId, setNewCondominioId] = useState<number>(condomini[0]?.id || 1);
  const [newGestione, setNewGestione] = useState<string>('01/01/2026 - 31/12/2026');
  const [newNote, setNewNote] = useState<string>('');

  // Stato copia prompt e finestra modifica testi prompt
  const [copiedPrompt, setCopiedPrompt] = useState<'slide' | 'podcast' | null>(null);
  const [showPromptsModal, setShowPromptsModal] = useState(false);
  const [draftPromptSlide, setDraftPromptSlide] = useState<string>('');
  const [draftPromptPodcast, setDraftPromptPodcast] = useState<string>('');

  // Stato Foglio di Riassunto PDF
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryOnlyFilled, setSummaryOnlyFilled] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Stato salvataggio per feedback visivo immediato da cellulare/PC
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inFlightSavesRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<{
    schedaId: number;
    passoId: number;
    patch: Record<string, any>;
  } | null>(null);

  const headerSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHeaderPatchRef = useRef<{
    schedaId: number;
    patch: Record<string, any>;
  } | null>(null);

  const persistSchede = (next: SchedaRendiconto[]) => {
    const recalculatedAll = next.map((s) => ricalcolaSchedaFrontend(s));
    schedeRef.current = recalculatedAll;
    setSchede(recalculatedAll);
    saveSchedeToStorage(recalculatedAll);
    for (const s of recalculatedAll) {
      if (s.in_attesa_assemblea || s.percentuale_fatto >= 100) {
        void syncAssembleaOrdinariaFromScheda(s, apiBase);
      }
    }
  };

  const fetchSchede = async (preferredCondoId?: number | null, silent = false) => {
    try {
      let res = await fetch(`${apiBase}/api/rendiconti`);
      if (!res.ok && apiBase === '') {
        res = await fetch(`http://${window.location.hostname}:8018/api/rendiconti`);
      }
      if (res.ok) {
        const data: SchedaRendiconto[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const merged = mergeServerWithLocalSchede(
            data,
            schedeRef.current,
            pendingPatchRef.current,
            pendingHeaderPatchRef.current
          );
          persistSchede(merged);
          if (!silent) {
            if (preferredCondoId) {
              // Seleziona la gestione più recente del condominio richiesto
              const found = [...merged]
                .reverse()
                .find((s) => s.condominio_id === preferredCondoId);
              if (found) {
                setActiveSchedaId(found.id);
                return;
              }
            }
            setActiveSchedaId((prev) => {
              if (prev && merged.some((s) => s.id === prev)) return prev;
              try {
                const saved = Number(localStorage.getItem(STORAGE_KEY_ACTIVE_SCHEDA));
                if (saved && merged.some((s) => s.id === saved)) return saved;
              } catch {
                // ignore
              }
              return merged[0].id;
            });
          }
        }
      }
    } catch {
      if (!silent && preferredCondoId) {
        const found = [...schedeRef.current]
          .reverse()
          .find((s) => s.condominio_id === preferredCondoId);
        if (found) setActiveSchedaId(found.id);
      }
    }
  };

  const fetchActiveSchedaSilent = async () => {
    const currentId = activeSchedaIdRef.current;
    if (!currentId || inFlightSavesRef.current > 0) return;
    try {
      let res = await fetch(`${apiBase}/api/rendiconti/${currentId}`);
      if (!res.ok && apiBase === '') {
        res = await fetch(`http://${window.location.hostname}:8018/api/rendiconti/${currentId}`);
      }
      if (res.ok && inFlightSavesRef.current === 0 && !pendingPatchRef.current && !pendingHeaderPatchRef.current) {
        const srvScheda: SchedaRendiconto = await res.json();
        replaceSchedaInState(srvScheda);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSchede(selectedCondominioId);
  }, [selectedCondominioId]);

  // Quando il componente viene smontato (es. cambio tab e poi rientro), salva subito eventuali modifiche pendenti
  useEffect(() => {
    return () => {
      flushPendingSave();
      flushPendingHeaderSave();
    };
  }, []);

  // Sincronizzazione automatica bidirezionale Cellulare <-> PC (leggera: aggiorna solo la scheda attiva)
  useEffect(() => {
    const isEditingField = () => {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        !isEditingField() &&
        !pendingPatchRef.current &&
        !pendingHeaderPatchRef.current &&
        inFlightSavesRef.current === 0
      ) {
        fetchActiveSchedaSilent();
      }
    };

    const interval = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !isEditingField() &&
        !pendingPatchRef.current &&
        !pendingHeaderPatchRef.current &&
        inFlightSavesRef.current === 0
      ) {
        fetchActiveSchedaSilent();
      }
    }, 8000);

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [apiBase]);

  const activeScheda =
    schede.find((s) => s.id === activeSchedaId) ||
    schede[0] ||
    FALLBACK_SCHEDE_RENDICONTO[0];

  // Notifica il componente padre (App) sullo stato di avanzamento della scheda attiva per il pannello laterale
  useEffect(() => {
    if (!activeScheda || !onProgressChange) return;
    const currentPasso = activeScheda.passi?.[currentCardIndex];
    onProgressChange({
      schedaId: activeScheda.id,
      condominioId: activeScheda.condominio_id,
      condominioNome: activeScheda.condominio_nome,
      condominioCodiceDanea: activeScheda.condominio_codice_danea,
      gestione: activeScheda.gestione,
      percentualeFatto: activeScheda.percentuale_fatto,
      passiCompletati: activeScheda.passi_completati,
      totalePassi: activeScheda.totale_passi,
      postAssembleaCompletati: activeScheda.post_assemblea_completati ?? 0,
      postAssembleaTotale: activeScheda.post_assemblea_totale ?? 5,
      inAttesaAssemblea: Boolean(activeScheda.in_attesa_assemblea),
      passoAttivoCodice: currentPasso?.numero_codice,
      passoAttivoIndice: currentCardIndex + 1,
    });
  }, [
    activeScheda?.id,
    activeScheda?.condominio_id,
    activeScheda?.condominio_nome,
    activeScheda?.condominio_codice_danea,
    activeScheda?.gestione,
    activeScheda?.percentuale_fatto,
    activeScheda?.passi_completati,
    activeScheda?.totale_passi,
    activeScheda?.post_assemblea_completati,
    activeScheda?.post_assemblea_totale,
    activeScheda?.in_attesa_assemblea,
    currentCardIndex,
  ]);

  const lastInitializedSchedaIdRef = useRef<number | null>(null);
  const skipBlurSaveRef = useRef<boolean>(false);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);

  // Quando si cambia scheda condominio, posizionati automaticamente sulla prima carta "da fare"
  useEffect(() => {
    if (!activeScheda?.id || !activeScheda?.passi?.length) return;
    if (lastInitializedSchedaIdRef.current === activeScheda.id) return;
    lastInitializedSchedaIdRef.current = activeScheda.id;
    const firstTodoIdx = activeScheda.passi.findIndex((p) => !p.fatto);
    setCurrentCardIndex(firstTodoIdx >= 0 ? firstTodoIdx : 0);
  }, [activeScheda?.id, activeScheda?.passi?.length]);

  // Scorri dolcemente la lista di sinistra per mantenere visibile il passo selezionato
  useEffect(() => {
    const passo = activeScheda?.passi?.[currentCardIndex];
    if (passo && stepItemRefs.current[passo.id]) {
      stepItemRefs.current[passo.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentCardIndex, activeScheda.id]);

  // Navigazione con frecce della tastiera (quando non si sta scrivendo in un input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (subTab !== 'scaletta') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToCard(currentCardIndex + 1, 'next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToCard(currentCardIndex - 1, 'prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCardIndex, subTab, activeScheda]);

  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingPatchRef.current;
    if (!pending) return;
    pendingPatchRef.current = null;
    inFlightSavesRef.current += 1;
    try {
      setSaveStatus('saving');
      let res = await fetch(
        `${apiBase}/api/rendiconti/${pending.schedaId}/passi/${pending.passoId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending.patch),
        }
      );
      if (!res.ok && apiBase === '') {
        res = await fetch(
          `http://${window.location.hostname}:8018/api/rendiconti/${pending.schedaId}/passi/${pending.passoId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending.patch),
          }
        );
      }
      if (res.ok && inFlightSavesRef.current === 1) {
        const updated: SchedaRendiconto = await res.json();
        replaceSchedaInState(updated);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    } finally {
      inFlightSavesRef.current = Math.max(0, inFlightSavesRef.current - 1);
    }
  };

  const flushPendingHeaderSave = async () => {
    if (headerSaveTimerRef.current) {
      clearTimeout(headerSaveTimerRef.current);
      headerSaveTimerRef.current = null;
    }
    const pending = pendingHeaderPatchRef.current;
    if (!pending) return;
    pendingHeaderPatchRef.current = null;
    inFlightSavesRef.current += 1;
    try {
      setSaveStatus('saving');
      let res = await fetch(`${apiBase}/api/rendiconti/${pending.schedaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.patch),
      });
      if (!res.ok && apiBase === '') {
        res = await fetch(`http://${window.location.hostname}:8018/api/rendiconti/${pending.schedaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending.patch),
        });
      }
      if (res.ok && inFlightSavesRef.current === 1) {
        const updated: SchedaRendiconto = await res.json();
        replaceSchedaInState(updated);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    } finally {
      inFlightSavesRef.current = Math.max(0, inFlightSavesRef.current - 1);
    }
  };

  const scheduleHeaderAutoSave = (schedaId: number, patch: Record<string, any>) => {
    const prevPatch =
      pendingHeaderPatchRef.current && pendingHeaderPatchRef.current.schedaId === schedaId
        ? pendingHeaderPatchRef.current.patch
        : {};
    pendingHeaderPatchRef.current = {
      schedaId,
      patch: { ...prevPatch, ...patch },
    };
    setSaveStatus('saving');
    if (headerSaveTimerRef.current) {
      clearTimeout(headerSaveTimerRef.current);
    }
    headerSaveTimerRef.current = setTimeout(() => {
      flushPendingHeaderSave();
    }, 450);
  };

  const schedulePassoAutoSave = (
    schedaId: number,
    passoId: number,
    patch: Record<string, any>
  ) => {
    const prevPatch =
      pendingPatchRef.current &&
      pendingPatchRef.current.schedaId === schedaId &&
      pendingPatchRef.current.passoId === passoId
        ? pendingPatchRef.current.patch
        : {};
    pendingPatchRef.current = {
      schedaId,
      passoId,
      patch: { ...prevPatch, ...patch },
    };
    setSaveStatus('saving');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      flushPendingSave();
    }, 450);
  };

  const goToCard = (index: number, dir: 'next' | 'prev' = 'next') => {
    if (!activeScheda?.passi?.length) return;
    flushPendingSave();
    const clamped = Math.max(0, Math.min(activeScheda.passi.length - 1, index));
    setCardDirection(dir);
    setCurrentCardIndex(clamped);
    setTimeout(() => setCardDirection(null), 220);
  };

  const goToFirstTodo = () => {
    const idx = activeScheda.passi.findIndex((p) => !p.fatto);
    if (idx >= 0) {
      goToCard(idx, idx >= currentCardIndex ? 'next' : 'prev');
      onNotify(`Posizionato sul prossimo passo da completare: #${activeScheda.passi[idx].numero_codice}`);
    } else {
      onNotify('Tutti i 63 passaggi di questa scheda sono già completati!');
    }
  };

  const replaceSchedaInState = (updated: SchedaRendiconto) => {
    const recalculated = ricalcolaSchedaFrontend(updated);
    const next = schedeRef.current.map((s) =>
      s.id === recalculated.id ? recalculated : s
    );
    schedeRef.current = next;
    saveSchedeToStorage(next);
    setSchede(next);
    if (recalculated.in_attesa_assemblea || recalculated.percentuale_fatto >= 100) {
      void syncAssembleaOrdinariaFromScheda(recalculated, apiBase);
    }
  };

  const handleTogglePasso = async (passo: PassoRendiconto, forceValue?: boolean) => {
    const currentScheda =
      schedeRef.current.find((s) => s.id === activeSchedaIdRef.current) || activeScheda;
    if (!currentScheda) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pendingForThisStep =
      pendingPatchRef.current &&
      pendingPatchRef.current.schedaId === currentScheda.id &&
      pendingPatchRef.current.passoId === passo.id
        ? pendingPatchRef.current.patch
        : {};
    pendingPatchRef.current = null;

    // Prendi la versione più aggiornata del passo da schedeRef (include quanto appena digitato o modificato su onBlur)
    const basePasso = currentScheda.passi.find((p) => p.id === passo.id) || passo;
    const latestPasso: PassoRendiconto = {
      ...basePasso,
      ...pendingForThisStep,
      campi_extra: {
        ...(basePasso.campi_extra || {}),
        ...(pendingForThisStep.campi_extra || {}),
      },
    };
    const nuovoFatto = forceValue !== undefined ? forceValue : !latestPasso.fatto;
    const oggi = new Date().toLocaleDateString('it-IT');
    const codiceStr = String(latestPasso.numero_codice ?? '').trim();
    const isClosingStep62 = codiceStr === '62' && nuovoFatto === true;
    const postCodes = new Set(['58', '59', '60', '61', '62']);

    const localUpdated: SchedaRendiconto = {
      ...currentScheda,
      passi: currentScheda.passi.map((p) => {
        if (p.id === latestPasso.id) {
          return {
            ...latestPasso,
            fatto: nuovoFatto,
            data_spunta: nuovoFatto ? oggi : null,
          };
        }
        const pCode = String(p.numero_codice ?? '').trim();
        // Spuntando il Passo #62 ("Invio eventuali MAV"), si chiude l'intera procedura post-assemblea (58–62)
        if (isClosingStep62 && postCodes.has(pCode) && !p.fatto) {
          return {
            ...p,
            fatto: true,
            data_spunta: p.data_spunta || oggi,
          };
        }
        // Deselezionando un passo 58–61 quando il 62 era spuntato, si riapre anche il 62
        if (!nuovoFatto && postCodes.has(codiceStr) && codiceStr !== '62' && pCode === '62' && p.fatto) {
          return {
            ...p,
            fatto: false,
            data_spunta: null,
          };
        }
        return p;
      }),
    };
    replaceSchedaInState(localUpdated);
    if (codiceStr === '57' && nuovoFatto) {
      onNotify(
        "Passo #57 completato: Rendiconto 100% Eseguito! La fase post-assemblea (Passi 58–62) è ora unificata nella procedura Gestione Assemblee."
      );
    } else if (codiceStr === '62' && nuovoFatto) {
      onNotify(
        "✓ Passo #62 (Invio eventuali MAV) completato: Procedura Assemblea e Rendiconto chiusa al 100%!"
      );
    }

    const payload = {
      fatto: nuovoFatto,
      chi_lo_fa: latestPasso.chi_lo_fa,
      num_pagine: latestPasso.num_pagine,
      campi_extra: latestPasso.campi_extra,
      note_passo: latestPasso.note_passo || '',
    };

    inFlightSavesRef.current += 1;
    try {
      setSaveStatus('saving');
      let res = await fetch(
        `${apiBase}/api/rendiconti/${currentScheda.id}/passi/${latestPasso.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok && apiBase === '') {
        res = await fetch(
          `http://${window.location.hostname}:8018/api/rendiconti/${currentScheda.id}/passi/${latestPasso.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      }
      if (res.ok && inFlightSavesRef.current === 1) {
        const updated: SchedaRendiconto = await res.json();
        replaceSchedaInState(updated);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    } finally {
      inFlightSavesRef.current = Math.max(0, inFlightSavesRef.current - 1);
    }
  };

  const handleCompleteAndNext = (passo: PassoRendiconto) => {
    const currentScheda =
      schedeRef.current.find((s) => s.id === activeSchedaIdRef.current) || activeScheda;
    const passiList = currentScheda?.passi || activeScheda?.passi || [];
    const totalPassi = passiList.length || 63;

    // Evita che un eventuale input attivo scateni onBlur con stato vecchio durante il cambio scheda
    skipBlurSaveRef.current = true;
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      skipBlurSaveRef.current = false;
    }, 80);

    const foundIdx = passiList.findIndex(
      (p) =>
        p.id === passo.id ||
        p.numero_codice === passo.numero_codice ||
        p.ordine === passo.ordine
    );
    const baseIdx = foundIdx >= 0 ? foundIdx : currentCardIndex;
    const nextIdx = baseIdx + 1;

    // Aggiorna subito lo stato locale e avvia il salvataggio in background senza bloccare il cambio pagina!
    void handleTogglePasso(passo, true);

    if (nextIdx < totalPassi) {
      setCardDirection('next');
      setCurrentCardIndex(nextIdx);
      setTimeout(() => {
        setCardDirection(null);
        cardContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } else {
      onNotify('Complimenti! Hai raggiunto l’ultimo passaggio della Procedura Rendiconto.');
    }
  };

  const handleUpdatePassoField = async (
    passo: PassoRendiconto,
    patch: {
      num_pagine?: number;
      chi_lo_fa?: string;
      campi_extra?: Record<string, string>;
      note_passo?: string;
    }
  ) => {
    if (skipBlurSaveRef.current) return;
    const currentScheda =
      schedeRef.current.find((s) => s.id === activeSchedaIdRef.current) || activeScheda;
    if (!currentScheda) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingPatchRef.current = null;

    const latestPasso = currentScheda.passi.find((p) => p.id === passo.id) || passo;
    const mergedStep: PassoRendiconto = {
      ...latestPasso,
      num_pagine: patch.num_pagine !== undefined ? patch.num_pagine : latestPasso.num_pagine,
      chi_lo_fa: patch.chi_lo_fa !== undefined ? patch.chi_lo_fa : latestPasso.chi_lo_fa,
      campi_extra:
        patch.campi_extra !== undefined
          ? { ...(latestPasso.campi_extra || {}), ...patch.campi_extra }
          : latestPasso.campi_extra,
      note_passo: patch.note_passo !== undefined ? patch.note_passo : latestPasso.note_passo,
    };

    const localUpdated: SchedaRendiconto = {
      ...currentScheda,
      passi: currentScheda.passi.map((p) => (p.id === passo.id ? mergedStep : p)),
    };
    replaceSchedaInState(localUpdated);

    // Non inviamo 'fatto' nel salvataggio dei campi per non sovrascrivere mai lo stato di spunta!
    const payload = {
      chi_lo_fa: mergedStep.chi_lo_fa,
      num_pagine: mergedStep.num_pagine,
      campi_extra: mergedStep.campi_extra,
      note_passo: mergedStep.note_passo || '',
    };

    inFlightSavesRef.current += 1;
    try {
      setSaveStatus('saving');
      let res = await fetch(`${apiBase}/api/rendiconti/${currentScheda.id}/passi/${passo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok && apiBase === '') {
        res = await fetch(
          `http://${window.location.hostname}:8018/api/rendiconti/${currentScheda.id}/passi/${passo.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      }
      if (res.ok && inFlightSavesRef.current === 1) {
        const updated: SchedaRendiconto = await res.json();
        replaceSchedaInState(updated);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    } finally {
      inFlightSavesRef.current = Math.max(0, inFlightSavesRef.current - 1);
    }
  };

  const handleUpdateSchedaHeader = async (patch: Record<string, any>) => {
    if (!activeScheda) return;
    if (headerSaveTimerRef.current) {
      clearTimeout(headerSaveTimerRef.current);
      headerSaveTimerRef.current = null;
    }
    pendingHeaderPatchRef.current = null;

    const nextAcqua = {
      ...activeScheda.calcolatore_acqua,
      consumo_contabilizzatori:
        patch.acqua_consumo_contabilizzatori !== undefined
          ? Number(patch.acqua_consumo_contabilizzatori)
          : activeScheda.calcolatore_acqua.consumo_contabilizzatori,
      mc_fatture:
        patch.acqua_mc_fatture !== undefined
          ? Number(patch.acqua_mc_fatture)
          : activeScheda.calcolatore_acqua.mc_fatture,
      costo_fatture_h2o:
        patch.acqua_costo_fatture !== undefined
          ? Number(patch.acqua_costo_fatture)
          : activeScheda.calcolatore_acqua.costo_fatture_h2o,
    };

    const localUpdated: SchedaRendiconto = {
      ...activeScheda,
      gestione: patch.gestione !== undefined ? patch.gestione : activeScheda.gestione,
      fatto_il: patch.fatto_il !== undefined ? patch.fatto_il : activeScheda.fatto_il,
      note_intestazione:
        patch.note_intestazione !== undefined
          ? patch.note_intestazione
          : activeScheda.note_intestazione,
      nota_esplicativa_checks:
        patch.nota_esplicativa_checks !== undefined
          ? patch.nota_esplicativa_checks
          : activeScheda.nota_esplicativa_checks,
      calcolatore_acqua: nextAcqua,
    };
    replaceSchedaInState(localUpdated);

    try {
      setSaveStatus('saving');
      const res = await fetch(`${apiBase}/api/rendiconti/${activeScheda.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated: SchedaRendiconto = await res.json();
        replaceSchedaInState(updated);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleToggleNotaCheck = async (index: number) => {
    if (!activeScheda) return;
    const nextChecks = activeScheda.nota_esplicativa_checks.map((c, idx) =>
      idx === index ? { ...c, fatto: !c.fatto } : c
    );
    await handleUpdateSchedaHeader({ nota_esplicativa_checks: nextChecks });
  };

  const handleNotaCheckNoteChange = async (index: number, note: string) => {
    if (!activeScheda) return;
    const nextChecks = activeScheda.nota_esplicativa_checks.map((c, idx) =>
      idx === index ? { ...c, note } : c
    );
    await handleUpdateSchedaHeader({ nota_esplicativa_checks: nextChecks });
  };

  const openNewGestioneModal = () => {
    const targetCondoId = activeScheda?.condominio_id || condomini[0]?.id || 1;
    const prevForCondo = [...schedeRef.current]
      .reverse()
      .find((s) => s.condominio_id === targetCondoId);
    setNewCondominioId(targetCondoId);
    setNewGestione(
      prevForCondo ? computeNextYearGestione(prevForCondo.gestione) : '01/01/2026 - 31/12/2026'
    );
    setNewNote(prevForCondo?.note_intestazione || '');
    setShowNewModal(true);
  };

  const handleCreateScheda = async (e: React.FormEvent) => {
    e.preventDefault();
    await flushPendingSave();
    await flushPendingHeaderSave();

    try {
      const res = await fetch(`${apiBase}/api/rendiconti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condominio_id: newCondominioId,
          gestione: newGestione,
          note_intestazione: newNote,
          chi_lo_fa_default: 'G',
        }),
      });
      if (res.ok) {
        const created: SchedaRendiconto = await res.json();
        const next = [...schedeRef.current, created];
        persistSchede(next);
        setActiveSchedaId(created.id);
        setShowNewModal(false);
        onNotify(
          `Creata nuova gestione (${created.gestione}) per ${created.condominio_nome} con riporto di tutte le note e appunti`
        );
        return;
      }
    } catch {
      // Creazione locale se backend spento
    }

    const condoObj = condomini.find((c) => c.id === newCondominioId);
    const prevScheda = [...schedeRef.current]
      .reverse()
      .find((s) => s.condominio_id === newCondominioId);
    const newId = Math.max(0, ...schedeRef.current.map((s) => s.id)) + 1;
    const baseCreated = buildSchedaIniziale(
      newId,
      newCondominioId,
      condoObj?.nome || prevScheda?.condominio_nome || `Condominio #${newCondominioId}`,
      condoObj?.codice_danea || prevScheda?.condominio_codice_danea || `DN-00${newCondominioId}`,
      prevScheda?.condominio_iban || 'IT60X0306909400100000012345',
      newGestione,
      newNote || prevScheda?.note_intestazione || 'Nuova Scheda Bilancio Procedura 002 - Modello 5',
      0,
      0,
      0,
      0
    );

    // Riporta le note e gli appunti di tutti i passi dalla gestione precedente anche in modalità offline
    const carriedCreated: SchedaRendiconto = prevScheda
      ? ricalcolaSchedaFrontend({
          ...baseCreated,
          note_intestazione: newNote || prevScheda.note_intestazione || '',
          nota_esplicativa_checks: baseCreated.nota_esplicativa_checks.map((c, idx) => ({
            ...c,
            fatto: false,
            note: prevScheda.nota_esplicativa_checks?.[idx]?.note || c.note || '',
          })),
          passi: baseCreated.passi.map((p) => {
            const prevP =
              prevScheda.passi.find((x) => x.ordine === p.ordine) ||
              prevScheda.passi.find((x) => x.numero_codice === p.numero_codice);
            if (!prevP) return p;
            const nextExtra: Record<string, string> = { ...(p.campi_extra || {}) };
            for (const [k, v] of Object.entries(prevP.campi_extra || {})) {
              if (v && String(v).trim() !== '') {
                if (p.numero_codice === '24' && /^Eseguito(?:\s+\d+)?$/.test(k)) {
                  nextExtra[k] = 'false';
                } else {
                  nextExtra[k] = v;
                }
              }
            }
            if (p.numero_codice === '30' && prevP.campi_extra?.['Attuale (€)']) {
              nextExtra['Precedente (€)'] = prevP.campi_extra['Attuale (€)'];
              nextExtra['Attuale (€)'] = '';
            }
            if (p.numero_codice === '31' && 'Attuale (€)' in nextExtra) {
              delete nextExtra['Attuale (€)'];
            }
            return {
              ...p,
              fatto: false,
              data_spunta: null,
              chi_lo_fa: prevP.chi_lo_fa || p.chi_lo_fa,
              num_pagine: prevP.num_pagine || p.num_pagine,
              campi_extra: nextExtra,
              note_passo: prevP.note_passo || '',
            };
          }),
        })
      : baseCreated;

    const oggi = new Date().toLocaleDateString('it-IT');
    const updatedPrevList = schedeRef.current.map((s) =>
      prevScheda && s.id === prevScheda.id && !s.fatto_il ? { ...s, fatto_il: oggi } : s
    );
    const next = [...updatedPrevList, carriedCreated];
    persistSchede(next);
    setActiveSchedaId(carriedCreated.id);
    setShowNewModal(false);
    onNotify(
      `Creata nuova gestione (${carriedCreated.gestione}) per ${carriedCreated.condominio_nome} con riporto di tutte le note e appunti`
    );
  };

  const copyToClipboard = (text: string, type: 'slide' | 'podcast') => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(type);
    onNotify(
      type === 'slide'
        ? 'Prompt Slide NotebookLM copiato negli appunti!'
        : 'Prompt Podcast NotebookLM copiato negli appunti!'
    );
    setTimeout(() => setCopiedPrompt(null), 2500);
  };

  const passo54ForPrompts = activeScheda.passi.find((p) => p.numero_codice === '54');
  const passo25ForPrompts = activeScheda.passi.find((p) => p.numero_codice === '25');
  const effectivePromptSlide =
    passo54ForPrompts?.campi_extra?.['__prompt_slide_notebooklm'] ||
    passo25ForPrompts?.campi_extra?.['__prompt_slide_notebooklm'] ||
    activeScheda.prompt_slide_notebooklm ||
    PROMPT_SLIDE_NOTEBOOKLM;
  const effectivePromptPodcast =
    passo54ForPrompts?.campi_extra?.['__prompt_podcast_notebooklm'] ||
    passo25ForPrompts?.campi_extra?.['__prompt_podcast_notebooklm'] ||
    activeScheda.prompt_podcast_notebooklm ||
    PROMPT_PODCAST_NOTEBOOKLM;

  const openPromptsModal = () => {
    setDraftPromptSlide(effectivePromptSlide);
    setDraftPromptPodcast(effectivePromptPodcast);
    setShowPromptsModal(true);
  };

  const handleSavePrompts = (
    nextSlide: string,
    nextPodcast: string,
    closeAfterSave: boolean = true
  ) => {
    const targetPasso = activeScheda.passi.find((p) => p.numero_codice === '54');
    if (targetPasso) {
      const newExtra = {
        ...(targetPasso.campi_extra || {}),
        __prompt_slide_notebooklm: nextSlide,
        __prompt_podcast_notebooklm: nextPodcast,
      };
      const nextPassi = activeScheda.passi.map((p) =>
        p.id === targetPasso.id ? { ...p, campi_extra: newExtra } : p
      );
      replaceSchedaInState({
        ...activeScheda,
        passi: nextPassi,
        prompt_slide_notebooklm: nextSlide,
        prompt_podcast_notebooklm: nextPodcast,
      });
      handleUpdatePassoField(targetPasso, { campi_extra: newExtra });
    } else {
      replaceSchedaInState({
        ...activeScheda,
        prompt_slide_notebooklm: nextSlide,
        prompt_podcast_notebooklm: nextPodcast,
      });
    }
    if (closeAfterSave) {
      setShowPromptsModal(false);
      onNotify('Testi dei Prompt NotebookLM aggiornati e salvati!');
    }
  };

  const sezioniUniche = Array.from(new Set(activeScheda.passi.map((p) => p.sezione)));

  const passiFiltrati = activeScheda.passi.filter((p) => {
    if (filterStato === 'da_fare' && p.fatto) return false;
    if (filterStato === 'fatti' && !p.fatto) return false;
    if (filterSezione !== 'Tutte' && p.sezione !== filterSezione) return false;
    if (searchStep.trim() !== '') {
      const q = searchStep.toLowerCase();
      const matchDesc = p.descrizione.toLowerCase().includes(q);
      const matchNum = p.numero_codice.toLowerCase().includes(q);
      return matchDesc || matchNum;
    }
    return true;
  });

  // Raggruppa per sezione per la colonna sinistra
  const passiPerSezione: Record<string, PassoRendiconto[]> = {};
  for (const p of passiFiltrati) {
    if (!passiPerSezione[p.sezione]) passiPerSezione[p.sezione] = [];
    passiPerSezione[p.sezione].push(p);
  }

  // Raggruppa i controlli della Nota Esplicativa
  const notaChecksPerGruppo: Record<string, { item: NotaCheckItem; index: number }[]> = {};
  activeScheda.nota_esplicativa_checks.forEach((item, index) => {
    if (!notaChecksPerGruppo[item.gruppo]) notaChecksPerGruppo[item.gruppo] = [];
    notaChecksPerGruppo[item.gruppo].push({ item, index });
  });

  // Carta attualmente aperta a destra
  const currentCard = activeScheda.passi[currentCardIndex] || activeScheda.passi[0];
  const baseExtraKeys =
    currentCard?.numero_codice === '30'
      ? Array.from(
          new Set([
            'Precedente (€)',
            'Attuale (€)',
            ...Object.keys(currentCard?.campi_extra || {}),
          ])
        )
      : currentCard?.numero_codice === '51'
      ? Array.from(
          new Set([
            'Presso',
            'Data riunione',
            'Ora riunione',
            ...Object.keys(currentCard?.campi_extra || {}),
          ])
        )
      : Object.keys(currentCard?.campi_extra || {});

  const currentExtraKeys = baseExtraKeys.filter((k) => {
    if (
      k.startsWith('__prompt_') ||
      k.startsWith('__doc_predisposto_') ||
      k === 'Esito / Valore'
    ) {
      return false;
    }
    if (
      currentCard?.numero_codice === '8' &&
      (k === 'N. unità con gestione inquilino' ||
        k === 'Quota gestione per unità (€)' ||
        k === 'Compenso Gestione Inquilini (€)')
    ) {
      return false;
    }
    if (
      currentCard?.numero_codice === '6' &&
      (/^Data assemblea straord\.(?:\s+\d+)?$/.test(k) || /^Oggetto(?:\s+\d+)?$/.test(k))
    ) {
      return false;
    }
    if (
      currentCard?.numero_codice === '24' &&
      (/^Voce spesa personale(?:\s+\d+)?$/.test(k) || /^Eseguito(?:\s+\d+)?$/.test(k))
    ) {
      return false;
    }
    if (
      currentCard?.numero_codice === '33' &&
      (/^Importo Fondo \(€\)(?:\s+\d+)?$/.test(k) || /^Natura Fondo(?:\s+\d+)?$/.test(k))
    ) {
      return false;
    }
    if (
      currentCard?.numero_codice === '39' &&
      (/^Data sinistro(?:\s+\d+)?$/.test(k) ||
        /^Oggetto sinistro(?:\s+\d+)?$/.test(k) ||
        k === 'Data e Oggetto sinistri')
    ) {
      return false;
    }
    if (currentCard?.numero_codice === '31' && k === 'Attuale (€)') {
      return false;
    }
    if (currentCard?.numero_codice === '51' && (k === 'Data assemblea' || k === 'Ora assemblea')) {
      return false;
    }
    if (currentCard?.numero_codice === '52' && k === 'Data assemblea') {
      return false;
    }
    if (currentCard?.numero_codice === '53' && k === 'Ora assemblea') {
      return false;
    }
    return true;
  });

  // Verifica speciale Passo 33: se almeno un Importo Fondo > 0 mostra avviso rosso
  const showCurrentFondoWarning =
    currentCard?.numero_codice === '33' &&
    Object.entries(currentCard?.campi_extra || {}).some(([k, v]) => {
      if (!/^Importo Fondo \(€\)(?:\s+\d+)?$/.test(k)) return false;
      const val = parseFloat(String(v || '0').replace(/\./g, '').replace(',', '.'));
      const simpleVal = parseFloat(String(v || '0').replace(',', '.'));
      return (!isNaN(val) && val > 0) || (!isNaN(simpleVal) && simpleVal > 0);
    });

  // Verifica speciale Passo 43 (MioCondominio): % accessi = Accessi / Utenti
  let currentMioCondominioPerc: string | null = null;
  if (currentCard?.numero_codice === '43') {
    const ut = parseFloat(currentCard.campi_extra?.['Utenti'] || '0');
    const acc = parseFloat(currentCard.campi_extra?.['Accessi'] || '0');
    if (ut > 0) {
      currentMioCondominioPerc = `${Math.round((acc / ut) * 100)}%`;
    }
  }

  // Trova eventuale documento allegato collegato a questa carta (supporta passo singolo e passi combinati come 46 + 33)
  const linkedDocAllegato = activeScheda.documenti_allegati.find((d) => {
    if (!currentCard) return false;
    const pCode = (currentCard.numero_codice || '').toLowerCase();
    const ref = (d.riferimento_passo || '').toLowerCase();
    return (
      ref.includes(`passo ${pCode}`) ||
      ref.includes(`passi ${pCode}`) ||
      ref.includes(`+ ${pCode}`) ||
      ref.includes(`${pCode} +`)
    );
  });

  const jumpToStepByCode = (stepCode: string) => {
    const idx = activeScheda.passi.findIndex(
      (p) => p.numero_codice.toLowerCase() === stepCode.toLowerCase()
    );
    if (idx >= 0) {
      setSubTab('scaletta');
      goToCard(idx, idx >= currentCardIndex ? 'next' : 'prev');
      onNotify(`Aperto Passaggio #${stepCode}`);
    }
  };

  // Scarica / Apri il PDF Ufficiale generato dal backend (fpdf2) con tutti i dati attuali di activeScheda
  const handleDownloadRiepilogoPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await flushPendingSave();
      await flushPendingHeaderSave();

      const payload = JSON.stringify(activeScheda);
      let res: Response | null = null;
      try {
        res = await fetch(`${apiBase}/api/rendiconti/riepilogo-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
      } catch {
        res = null;
      }
      if ((!res || !res.ok) && apiBase === '') {
        try {
          res = await fetch(`http://${window.location.hostname}:8018/api/rendiconti/riepilogo-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
        } catch {
          res = null;
        }
      }

      if (res && res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const safeCondo = (activeScheda.condominio_nome || 'Condominio').replace(/[^a-zA-Z0-9_-]+/g, '_');
        const safeGest = (activeScheda.gestione || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
        const filename = `Riepilogo_Procedura_${safeCondo}_${safeGest}.pdf`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Apri anche in nuova scheda per visualizzazione/stampa immediata
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        onNotify(`PDF Riassunto generato: ${filename}`);
      } else {
        // Fallback: apri finestra di stampa A4
        handlePrintRiepilogoWindow();
      }
    } catch {
      handlePrintRiepilogoWindow();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Apre finestra A4 pulita per Stampa Diretta / Salva come PDF dal browser
  const handlePrintRiepilogoWindow = () => {
    const el = document.getElementById('printable-riepilogo-procedura');
    const win = window.open('', '_blank', 'width=1050,height=850');
    if (!win) {
      window.print();
      return;
    }
    const contentHtml = el ? el.innerHTML : '';
    win.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>Foglio di Riassunto Procedura - ${activeScheda.condominio_nome} (${activeScheda.gestione})</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    tr { page-break-inside: avoid; }
    .no-print { display: none !important; }
  </style>
</head>
<body class="p-4">
  ${contentHtml}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 450);
    };
  </script>
</body>
</html>`);
    win.document.close();
  };

  // Calcola i passaggi vicini per la striscia inferiore
  const startWindow = Math.max(0, Math.min(currentCardIndex - 2, activeScheda.passi.length - 6));
  const nearbyCards = activeScheda.passi.slice(startWindow, startWindow + 6);

  return (
    <div className="space-y-5">
      {/* INTESTAZIONE MODELLO SCHEDA BILANCIO 3 (MODELLO 5 - PROCEDURA 002) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] sm:text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 font-semibold">
                    {activeScheda.procedura_codice}
                  </span>
                  <span className="text-xs text-slate-300 hidden sm:inline">
                    MODELLO SCHEDA BILANCIO3.xlsm • Studio Serra
                  </span>
                </div>
                <h2 className="text-base sm:text-xl font-bold mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="truncate">BILANCIO: {activeScheda.condominio_nome}</span>
                  {activeScheda.condominio_codice_danea && (
                    <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded text-indigo-200">
                      {activeScheda.condominio_codice_danea}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            {/* Selettore Scheda / Condominio + Stampa Riassunto PDF + Nuova Scheda */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={activeScheda.id}
                onChange={(e) => {
                  flushPendingSave();
                  flushPendingHeaderSave();
                  setActiveSchedaId(Number(e.target.value));
                }}
                className="flex-1 sm:flex-initial max-w-full bg-slate-800/90 text-white text-xs sm:text-sm rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-amber-400"
              >
                {schede.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.condominio_nome} ({s.gestione}) — {s.percentuale_fatto}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowSummaryModal(true)}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-2 font-extrabold text-xs sm:text-sm rounded-xl transition shadow-sm shrink-0 cursor-pointer border ${
                  Number(activeScheda.percentuale_fatto) >= 100
                    ? 'bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 border-cyan-200 ring-2 ring-cyan-400/40'
                    : 'bg-indigo-500/30 hover:bg-indigo-500/50 text-white border-indigo-400/40'
                }`}
                title="Apri anteprima e stampa/scarica il Foglio di Riassunto in PDF con tutti i dati immessi, calcoli e note della procedura"
              >
                <Printer className="w-4 h-4" />
                <span>Stampa Riassunto PDF</span>
              </button>
              {onRinnovaEsercizio && (
                <button
                  type="button"
                  onClick={async () => {
                    await flushPendingSave();
                    await flushPendingHeaderSave();
                    const oggi = new Date().toLocaleDateString('it-IT');
                    if (!activeScheda.fatto_il) {
                      await handleUpdateSchedaHeader({ fatto_il: oggi });
                    }
                    await onRinnovaEsercizio(activeScheda.condominio_id);
                    await fetchSchede(activeScheda.condominio_id);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl transition shadow-sm shrink-0 cursor-pointer"
                  title="Chiude la gestione attuale, avanza le scadenze all'anno successivo (+1 anno) e crea la nuova gestione riportando tutte le note e gli appunti dei 63 passi"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Fatto & Rinnova (+1 Anno)</span>
                </button>
              )}
              <button
                type="button"
                onClick={openNewGestioneModal}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs sm:text-sm rounded-xl transition shadow-sm shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuova Gestione</span>
              </button>
              {onOpenImpostazioni && (
                <button
                  type="button"
                  onClick={onOpenImpostazioni}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm rounded-xl border border-white/20 transition shadow-sm shrink-0 cursor-pointer"
                  title="Apri Impostazioni per modificare, aggiungere o eliminare i passaggi del Rendiconto"
                >
                  <Settings className="w-4 h-4 text-amber-300" />
                  <span>Modifica Passaggi</span>
                </button>
              )}
            </div>
          </div>

          {/* SELETTORE RAPIDO STORICO GESTIONI DEL CONDOMINIO (per riaprire e verificare gestioni precedenti) */}
          {(() => {
            const schedeDelCondominio = schede.filter(
              (s) => s.condominio_id === activeScheda.condominio_id
            );
            const idxInCondo = schedeDelCondominio.findIndex((s) => s.id === activeScheda.id);
            const prevGestioneScheda =
              idxInCondo > 0 ? schedeDelCondominio[idxInCondo - 1] : null;
            const latestGestioneScheda =
              schedeDelCondominio.length > 0
                ? schedeDelCondominio[schedeDelCondominio.length - 1]
                : null;
            const isViewingOldGestione =
              latestGestioneScheda && latestGestioneScheda.id !== activeScheda.id;

            return (
              <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mr-1">
                    Storico Gestioni {activeScheda.condominio_nome}:
                  </span>
                  {schedeDelCondominio.map((s, idx) => {
                    const isCurrent = s.id === activeScheda.id;
                    const isLatest = idx === schedeDelCondominio.length - 1;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          flushPendingSave();
                          flushPendingHeaderSave();
                          setActiveSchedaId(s.id);
                          onNotify(
                            `Aperta gestione ${s.gestione} di ${s.condominio_nome} (${s.percentuale_fatto}% completato)`
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                          isCurrent
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-600'
                        }`}
                        title={`Apri la scheda rendiconto della gestione ${s.gestione}`}
                      >
                        <span>{s.gestione}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded ${
                            isCurrent
                              ? 'bg-slate-950/20 text-slate-950 font-black'
                              : 'bg-white/10 text-amber-300'
                          }`}
                        >
                          {s.percentuale_fatto}%
                        </span>
                        {!isLatest && (
                          <span className="text-[10px] uppercase opacity-80">(Precedente)</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  {prevGestioneScheda && (
                    <button
                      type="button"
                      onClick={() => {
                        flushPendingSave();
                        flushPendingHeaderSave();
                        setActiveSchedaId(prevGestioneScheda.id);
                        onNotify(
                          `Riaperta gestione precedente (${prevGestioneScheda.gestione}) per verifica`
                        );
                      }}
                      className="px-3 py-1 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-100 border border-indigo-400/40 text-xs font-bold transition cursor-pointer"
                    >
                      ⏪ Riapri Gestione Precedente ({prevGestioneScheda.gestione})
                    </button>
                  )}
                  {isViewingOldGestione && latestGestioneScheda && (
                    <button
                      type="button"
                      onClick={() => {
                        flushPendingSave();
                        flushPendingHeaderSave();
                        setActiveSchedaId(latestGestioneScheda.id);
                        onNotify(
                          `Tornato alla gestione attuale (${latestGestioneScheda.gestione})`
                        );
                      }}
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold transition cursor-pointer shadow-xs"
                    >
                      ⏩ Torna a Gestione Attuale ({latestGestioneScheda.gestione})
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Barra % FATTO e metadati di testata */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 mt-4 pt-3.5 border-t border-white/10 items-center">
            <div className="lg:col-span-4 bg-white/5 rounded-xl p-3 border border-white/15 shadow-inner">
              {(() => {
                const rawPct = Math.min(100, Math.max(0, Number(activeScheda.percentuale_fatto) || 0));
                const pctFormatted = rawPct.toFixed(1).replace('.0', '').replace('.', ',');
                const remPctFormatted = Math.max(0, 100 - rawPct)
                  .toFixed(1)
                  .replace('.0', '')
                  .replace('.', ',');
                const indicatorLeft = Math.min(92, Math.max(8, rawPct));
                const postDone = activeScheda.post_assemblea_completati ?? 0;
                const postTot = activeScheda.post_assemblea_totale ?? 5;
                const inAttesaAssemblea = Boolean(activeScheda.in_attesa_assemblea);
                const postAllDone = rawPct >= 100 && postDone >= postTot;
                return (
                  <>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-amber-300 uppercase tracking-wider">
                        % FATTO (Passi 1–57)
                      </span>
                      <span className="font-extrabold text-sm text-white flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md border ${
                            rawPct >= 100
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-black'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          }`}
                        >
                          {rawPct >= 100 ? '100% ESEGUITO' : `${pctFormatted}%`}
                        </span>
                        <span className="text-slate-300 text-xs font-semibold">
                          ({activeScheda.passi_completati}/{activeScheda.totale_passi})
                        </span>
                      </span>
                    </div>

                    {/* Barra con indicatore di posizione della % effettivamente lavorata */}
                    <div className="relative pt-5 pb-1">
                      {/* Indicatore mobile posizionato esattamente sulla % lavorata */}
                      <div
                        className="absolute top-0 -translate-x-1/2 z-10 flex flex-col items-center transition-all duration-300"
                        style={{ left: `${indicatorLeft}%` }}
                      >
                        <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-black text-[10px] leading-none shadow-md border border-white/60 whitespace-nowrap">
                          {pctFormatted}%
                        </span>
                        <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-emerald-400" />
                      </div>

                      {/* Traccia 0% - 100% ben visibile con tacche 25% / 50% / 75% */}
                      <div className="w-full h-3.5 bg-slate-950/90 rounded-full overflow-hidden border border-white/20 relative shadow-inner">
                        <div className="absolute inset-0 grid grid-cols-4 pointer-events-none">
                          <div className="border-r border-white/10" />
                          <div className="border-r border-white/15" />
                          <div className="border-r border-white/10" />
                          <div />
                        </div>
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 via-teal-400 to-emerald-400 transition-all duration-300 relative rounded-r-full shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                          style={{ width: `${rawPct}%` }}
                        >
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white ring-2 ring-emerald-400 shadow" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] mt-1 text-slate-300 font-medium">
                      <span className="text-emerald-300 font-bold">
                        Pre-Assemblea: {pctFormatted}% ({activeScheda.passi_completati}/{activeScheda.totale_passi})
                      </span>
                      <span className="text-slate-400">
                        {rawPct >= 100
                          ? 'Pronto per Assemblea ✓'
                          : `Restano: ${remPctFormatted}% (${Math.max(0, activeScheda.totale_passi - activeScheda.passi_completati)})`}
                      </span>
                    </div>

                    {/* Stato Fase Post-Assemblea (Passi 58-62) */}
                    <div
                      className={`mt-2 pt-2 border-t flex items-center justify-between gap-2 text-[11px] ${
                        inAttesaAssemblea
                          ? 'border-amber-400/40 text-amber-200'
                          : postAllDone
                            ? 'border-emerald-400/30 text-emerald-300'
                            : 'border-white/10 text-slate-300'
                      }`}
                    >
                      <span className="font-bold flex items-center gap-1.5 truncate">
                        <span>🏛️</span>
                        <span>
                          {inAttesaAssemblea
                            ? `In Attesa Assemblea • Post (58-62): ${postDone}/${postTot}`
                            : postAllDone
                              ? `Post-Assemblea (58-62): Completati ${postDone}/${postTot} ✓`
                              : `Post-Assemblea (Passi 58-62): ${postDone}/${postTot}`}
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onOpenGestioneAssemblee && (
                          <button
                            type="button"
                            onClick={() => {
                              void syncAssembleaOrdinariaFromScheda(activeScheda, apiBase);
                              onOpenGestioneAssemblee(activeScheda.condominio_id);
                            }}
                            className="px-2 py-0.5 rounded bg-purple-500/30 hover:bg-purple-500/50 text-purple-100 border border-purple-400/50 font-extrabold text-[10px] shrink-0 transition cursor-pointer"
                            title="Gestisci i Passi 58–62 nella procedura unificata Gestione Assemblee"
                          >
                            Apri in Gestione Assemblee →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const firstPostTodo = activeScheda.passi.find(
                              (p) =>
                                (['58', '59', '60', '61', '62'].includes(String(p.numero_codice)) ||
                                  p.ordine >= 59) &&
                                !p.fatto
                            );
                            jumpToStepByCode(firstPostTodo?.numero_codice || '58');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/35 text-amber-200 border border-amber-400/40 font-bold text-[10px] shrink-0 transition cursor-pointer"
                          title="Vai agli ultimi 5 passi post-assemblea (58-62)"
                        >
                          Passi 58–62 →
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="lg:col-span-3 flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
                GESTIONE (Esercizio):
              </label>
              <input
                type="text"
                value={activeScheda.gestione}
                onChange={(e) => {
                  const val = e.target.value;
                  replaceSchedaInState({ ...activeScheda, gestione: val });
                  scheduleHeaderAutoSave(activeScheda.id, { gestione: val });
                }}
                onBlur={(e) => handleUpdateSchedaHeader({ gestione: e.target.value })}
                className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="lg:col-span-2 flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
                FATTO IL (Chiusura):
              </label>
              <input
                type="text"
                placeholder="gg/mm/aaaa"
                value={activeScheda.fatto_il || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  replaceSchedaInState({ ...activeScheda, fatto_il: val });
                  scheduleHeaderAutoSave(activeScheda.id, { fatto_il: val });
                }}
                onBlur={(e) => handleUpdateSchedaHeader({ fatto_il: e.target.value })}
                className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="lg:col-span-3 flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
                NOTE DI TESTATA:
              </label>
              <input
                type="text"
                placeholder="Note operative sul bilancio..."
                value={activeScheda.note_intestazione || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  replaceSchedaInState({ ...activeScheda, note_intestazione: val });
                  scheduleHeaderAutoSave(activeScheda.id, { note_intestazione: val });
                }}
                onBlur={(e) => handleUpdateSchedaHeader({ note_intestazione: e.target.value })}
                className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* BANNER 100% ESEGUITO -> INVITO ALLA STAMPA DEL FOGLIO DI RIASSUNTO PDF */}
          {Number(activeScheda.percentuale_fatto) >= 100 && (
            <div className="mt-3 pt-3 border-t border-emerald-400/30 flex flex-wrap items-center justify-between gap-3 bg-emerald-500/15 rounded-xl px-3.5 py-2.5 border">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🖨️</span>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-emerald-300">
                    Procedura al 100% Completata — Foglio di Riassunto Pronto per la Stampa PDF
                  </div>
                  <div className="text-[11px] text-emerald-100/90">
                    Stampa o scarica il riepilogo completo con tutti i dati immessi, i calcoli, le pagine allegati e tutte le note dei passaggi.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSummaryModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-slate-950 font-extrabold text-xs transition shadow-sm cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Anteprima Foglio Riassunto</span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPdf}
                  onClick={handleDownloadRiepilogoPdf}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isGeneratingPdf ? 'Generazione PDF...' : 'Scarica / Stampa PDF (.pdf)'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SOTTO-NAVIGAZIONE PROCEDURA 002 */}
        <div className="bg-slate-50 px-3 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSubTab('scaletta')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                subTab === 'scaletta'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CheckSquare className="w-4 h-4 shrink-0" />
              <span>1. Scaletta & Passaggi</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/15">
                {activeScheda.passi_completati}/{activeScheda.totale_passi}
              </span>
            </button>

            <button
              onClick={() => setSubTab('allegati')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                subTab === 'allegati'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>2. Allegati & Pagine</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 font-bold">
                {activeScheda.totale_pagine_fascicolo} pag.
              </span>
            </button>

            <button
              onClick={() => setSubTab('nota_acqua')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                subTab === 'nota_acqua'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Droplets className="w-4 h-4 shrink-0" />
              <span>3. Nota & Acqua</span>
            </button>

            <button
              onClick={() => setSubTab('prompts')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                subTab === 'prompts'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>4. Prompt AI</span>
            </button>
          </div>

          {activeScheda.condominio_iban && (
            <div className="text-[11px] sm:text-xs text-slate-500 font-mono bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 truncate max-w-full">
              IBAN (Passo 38):{' '}
              <strong className="text-slate-800">{activeScheda.condominio_iban}</strong>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: SPLIT VIEW
          - SINISTRA: VISTA GENERALE DELLA PROCEDURA CON LE SPUNTE
          - DESTRA: PASSAGGI SFOGLIABILI E COMPILABILI UNO AD UNO IN SEQUENZA
         ===================================================================== */}
      {subTab === 'scaletta' && currentCard && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* =================================================================
              COLONNA SINISTRA (5 col): VISTA GENERALE PROCEDURA CON SPUNTE
              (Su mobile appare sotto il passaggio attivo grazie a order-2 lg:order-1)
             ================================================================= */}
          <div className="order-2 lg:order-1 lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:sticky lg:top-4 max-h-[520px] lg:max-h-[calc(100vh-120px)]">
            {/* Header & Filtri Vista Generale */}
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Vista Generale Procedura ({activeScheda.passi_completati}/{activeScheda.totale_passi})
                </span>
              </div>
              <button
                onClick={goToFirstTodo}
                className="flex items-center gap-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg transition"
                title="Salta subito al primo passaggio non ancora spuntato"
              >
                <Play className="w-3 h-3 fill-current" />
                Primo da fare
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchStep}
                  onChange={(e) => setSearchStep(e.target.value)}
                  placeholder="Filtra scaletta (es. acqua, Danea, fondo...)"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <select
                  value={filterSezione}
                  onChange={(e) => setFilterSezione(e.target.value)}
                  className="text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 flex-1 truncate focus:outline-none focus:border-indigo-500"
                >
                  <option value="Tutte">Tutte le 5 Fasi</option>
                  {sezioniUniche.map((sez) => (
                    <option key={sez} value={sez}>
                      {sez}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                  <button
                    onClick={() => setFilterStato('tutti')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                      filterStato === 'tutti'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tutti
                  </button>
                  <button
                    onClick={() => setFilterStato('da_fare')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                      filterStato === 'da_fare'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Da fare
                  </button>
                  <button
                    onClick={() => setFilterStato('fatti')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                      filterStato === 'fatti'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Fatti
                  </button>
                </div>
              </div>
            </div>

            {/* Elenco scorrevole con spunte a sinistra */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {Object.entries(passiPerSezione).map(([sezioneNome, listaPassi]) => {
                const completatiSezione = listaPassi.filter((x) => x.fatto).length;
                return (
                  <div key={sezioneNome}>
                    <div className="bg-slate-100/90 sticky top-0 z-10 px-3.5 py-2 border-y border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider truncate pr-2">
                        {sezioneNome}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 flex-shrink-0">
                        {completatiSezione}/{listaPassi.length}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {listaPassi.map((passo) => {
                        const globalIdx = activeScheda.passi.findIndex((x) => x.id === passo.id);
                        const isSelected = globalIdx === currentCardIndex;
                        const filledExtraCount = Object.entries(passo.campi_extra || {}).filter(
                          ([k, v]) => {
                            if (k.startsWith('__prompt_') || k.startsWith('__doc_predisposto_')) {
                              return false;
                            }
                            if (passo.numero_codice === '24' && /^Eseguito(?:\s+\d+)?$/.test(k)) {
                              return false;
                            }
                            if (passo.numero_codice === '52' && k === 'Data assemblea') {
                              return false;
                            }
                            if (passo.numero_codice === '53' && k === 'Ora assemblea') {
                              return false;
                            }
                            return v && v.trim() !== '' && v !== '0' && v !== 'false';
                          }
                        ).length;

                        const isPostAssembleaStep = ['58', '59', '60', '61', '62'].includes(
                          String(passo.numero_codice || '').trim()
                        );
                        const isStep57 = String(passo.numero_codice || '').trim() === '57';

                        return (
                          <div key={passo.id}>
                            {String(passo.numero_codice || '').trim() === '58' && (
                              <div className="px-3.5 py-2.5 bg-violet-100/90 border-y border-violet-300 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-extrabold text-violet-900 uppercase tracking-wider flex items-center gap-1">
                                    🏛️ Fase Post-Assemblea (Passi 58–62)
                                  </span>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-200 text-violet-900">
                                    Procedura Unificata Assemblee
                                  </span>
                                </div>
                                {onOpenGestioneAssemblee && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void syncAssembleaOrdinariaFromScheda(activeScheda, apiBase);
                                      onOpenGestioneAssemblee(activeScheda.condominio_id);
                                    }}
                                    className="w-full py-1.5 px-2.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                                  >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>Gestisci Passi 58–62 in Gestione Assemblee →</span>
                                  </button>
                                )}
                              </div>
                            )}
                            <div
                              ref={(el) => {
                                stepItemRefs.current[passo.id] = el;
                              }}
                              onClick={() =>
                                goToCard(globalIdx, globalIdx >= currentCardIndex ? 'next' : 'prev')
                              }
                              className={`group px-3.5 py-2.5 flex items-start gap-2.5 cursor-pointer transition relative ${
                                isSelected
                                  ? 'bg-indigo-50/90 border-l-4 border-l-indigo-600'
                                  : passo.fatto
                                  ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                                  : isPostAssembleaStep
                                  ? 'bg-violet-50/30 hover:bg-violet-50/60'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              {/* Finestrella al passaggio del mouse con la scritta completa */}
                              <div className="hidden group-hover:block absolute left-12 bottom-full mb-1.5 z-50 w-72 sm:w-80 bg-slate-900 text-white text-xs font-medium p-3 rounded-xl shadow-2xl border border-indigo-400/60 pointer-events-none whitespace-normal break-words leading-relaxed">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 mb-1">
                                  Passo #{passo.numero_codice} • Passaggio {globalIdx + 1} di {activeScheda.passi.length}
                                </div>
                                <div className="text-white font-semibold">{passo.descrizione}</div>
                              </div>
                            {/* Spunta a sinistra */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePasso(passo);
                              }}
                              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition ${
                                passo.fatto
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'border-2 border-slate-300 text-transparent hover:border-indigo-500 bg-white'
                              }`}
                              title={passo.fatto ? 'Segna come da fare' : 'Spunta passaggio'}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            {/* Numero passo */}
                            <span
                              className={`inline-flex items-center justify-center min-w-[30px] h-5 px-1 rounded text-[11px] font-bold font-mono flex-shrink-0 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : passo.fatto
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isPostAssembleaStep
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              #{passo.numero_codice}
                            </span>

                            {/* Testo e badge stato compilazione */}
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs leading-snug line-clamp-2 ${
                                  isSelected
                                    ? 'font-bold text-indigo-950'
                                    : passo.fatto
                                    ? 'line-through text-slate-400'
                                    : 'font-medium text-slate-800'
                                }`}
                              >
                                {passo.descrizione}
                              </p>

                              {/* Indicatori compatti di dati compilati nel passaggio */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {isStep57 && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                                    🎯 Traguardo 100% Pre-Assemblea
                                  </span>
                                )}
                                {isPostAssembleaStep && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-900 border border-violet-300">
                                    🏛️ Dopo Assemblea (escluso da %)
                                  </span>
                                )}
                                {passo.ha_pagine && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    <FileText className="w-2.5 h-2.5" />
                                    {passo.num_pagine} pag.
                                  </span>
                                )}
                                {passo.numero_codice === '6' && (() => {
                                  const extra = passo.campi_extra || {};
                                  const datesCount = Object.entries(extra).filter(
                                    ([k, v]) => /^Data assemblea straord\.(?:\s+\d+)?$/.test(k) && String(v || '').trim() !== ''
                                  ).length;
                                  if (datesCount === 0) return null;
                                  return (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                                      {datesCount} {datesCount === 1 ? 'assemblea straord.' : 'assemblee straord.'}
                                    </span>
                                  );
                                })()}
                                {passo.numero_codice === '24' && (() => {
                                  const extra = passo.campi_extra || {};
                                  const itemIndices = Object.entries(extra)
                                    .filter(([k, v]) => /^Voce spesa personale(?:\s+\d+)?$/.test(k) && String(v || '').trim() !== '')
                                    .map(([k]) => {
                                      const m = k.match(/^Voce spesa personale(?:\s+(\d+))?$/);
                                      return m ? (m[1] ? parseInt(m[1], 10) : 1) : 1;
                                    });
                                  if (itemIndices.length === 0) return null;
                                  const doneCount = itemIndices.filter(
                                    (idx) =>
                                      extra[`Eseguito ${idx}`] === 'true' ||
                                      (idx === 1 && extra['Eseguito'] === 'true')
                                  ).length;
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                        doneCount === itemIndices.length
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-900'
                                      }`}
                                    >
                                      Spese pers.: {doneCount}/{itemIndices.length} eseguite
                                    </span>
                                  );
                                })()}
                                {passo.numero_codice === '33' && (() => {
                                  const extra = passo.campi_extra || {};
                                  const activeFunds = Object.entries(extra).filter(([k, v]) => {
                                    if (!/^Importo Fondo \(€\)(?:\s+\d+)?$/.test(k)) return false;
                                    const s = String(v || '').trim();
                                    return s !== '' && s !== '0' && s !== '0,00' && s !== '0.00';
                                  }).length;
                                  if (activeFunds === 0) return null;
                                  return (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-900">
                                      {activeFunds} {activeFunds === 1 ? 'fondo attivo' : 'fondi attivi'}
                                    </span>
                                  );
                                })()}
                                {passo.numero_codice === '39' && (() => {
                                  const extra = passo.campi_extra || {};
                                  const indicesSet = new Set<number>([1]);
                                  Object.keys(extra).forEach((k) => {
                                    const mData = k.match(/^Data sinistro(?:\s+(\d+))?$/);
                                    if (mData) indicesSet.add(mData[1] ? parseInt(mData[1], 10) : 1);
                                    const mOgg = k.match(/^Oggetto sinistro(?:\s+(\d+))?$/);
                                    if (mOgg) indicesSet.add(mOgg[1] ? parseInt(mOgg[1], 10) : 1);
                                  });
                                  const activeSinistri = Array.from(indicesSet).filter((idx) => {
                                    const dKey = idx === 1 ? 'Data sinistro' : `Data sinistro ${idx}`;
                                    const oKey = idx === 1 ? 'Oggetto sinistro' : `Oggetto sinistro ${idx}`;
                                    const dVal = String(extra[dKey] || '').trim();
                                    const oVal = String(extra[oKey] || '').trim();
                                    return dVal !== '' || (oVal !== '' && oVal !== 'Nessun sinistro aperto');
                                  }).length;
                                  if (activeSinistri === 0) return null;
                                  return (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                                      {activeSinistri} {activeSinistri === 1 ? 'sinistro' : 'sinistri'}
                                    </span>
                                  );
                                })()}
                                {passo.numero_codice === '48' && (() => {
                                  const extra = passo.campi_extra || {};
                                  const inclusiDocs = activeScheda.documenti_allegati.filter((d) => d.incluso);
                                  if (inclusiDocs.length === 0) return null;
                                  const doneDocs = inclusiDocs.filter(
                                    (d) => extra[`__doc_predisposto_${d.id_riga}`] === 'true'
                                  ).length;
                                  if (doneDocs === 0) return null;
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                        doneDocs === inclusiDocs.length
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-900'
                                      }`}
                                    >
                                      Doc. predisposti: {doneDocs}/{inclusiDocs.length}
                                    </span>
                                  );
                                })()}
                                {passo.numero_codice === '8' &&
                                  passo.campi_extra?.['N. unità con gestione inquilino'] &&
                                  String(passo.campi_extra['N. unità con gestione inquilino']).trim() !== '' && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                      Inquilini: {passo.campi_extra['N. unità con gestione inquilino']} u. • €{' '}
                                      {passo.campi_extra['Compenso Gestione Inquilini (€)'] || '0,00'}
                                    </span>
                                  )}
                                {filledExtraCount > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                                    {filledExtraCount} dati compilati
                                  </span>
                                )}
                                {passo.note_passo && passo.note_passo.trim() !== '' && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                    <StickyNote className="w-2.5 h-2.5" />
                                    Nota
                                  </span>
                                )}
                              </div>
                            </div>

                            {isSelected && (
                              <ChevronRight className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                            )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* =================================================================
              COLONNA DESTRA (7 col): PASSAGGI SFOGLIABILI IN SEQUENZA
             ================================================================= */}
          <div className="lg:col-span-7 space-y-4 order-1 lg:order-2">
            {/* Barra Superiore dei Passaggi (Controlli Sfoglia + Stato Sequenza) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={currentCardIndex === 0}
                  onClick={() => goToCard(currentCardIndex - 1, 'prev')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Passaggio Prec.
                </button>

                <div className="text-center px-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    Compilazione Sequenziale dei Passaggi
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    Passaggio {currentCardIndex + 1} di {activeScheda.passi.length}{' '}
                    <span className="text-slate-400 font-normal">•</span>{' '}
                    <span className="font-mono text-indigo-700">
                      Passo #{currentCard.numero_codice}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={currentCardIndex === activeScheda.passi.length - 1}
                  onClick={() => goToCard(currentCardIndex + 1, 'next')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition"
                >
                  Passaggio Succ.
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Usa anche frecce ◀ ▶
                </span>
                <button
                  type="button"
                  onClick={goToFirstTodo}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition"
                >
                  <Play className="w-3.5 h-3.5 fill-amber-600 text-amber-600" />
                  Vai al 1° da fare
                </button>
              </div>
            </div>

            {/* CONTENITORE PASSAGGIO CON EFFETTO STACK SFOGLIABILE */}
            <div className="relative pb-4">
              {/* Passaggi sottostanti (effetto profondità) */}
              <div className="absolute inset-x-6 -bottom-1 h-8 bg-slate-200/70 rounded-3xl border border-slate-300/60 pointer-events-none" />
              <div className="absolute inset-x-3 -bottom-0.5 h-6 bg-slate-100 rounded-3xl border border-slate-200 pointer-events-none" />

              {/* PASSAGGIO PRINCIPALE ATTIVO */}
              <div
                key={currentCard.id}
                ref={cardContainerRef}
                className={`relative bg-white rounded-3xl border-2 shadow-md overflow-hidden transition-all duration-200 ${
                  currentCard.fatto
                    ? 'border-emerald-400/80'
                    : 'border-indigo-500/80'
                } ${
                  cardDirection === 'next'
                    ? 'translate-x-1'
                    : cardDirection === 'prev'
                    ? '-translate-x-1'
                    : ''
                }`}
              >
                {/* INTESTAZIONE DEL PASSAGGIO */}
                <div
                  className={`px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3 ${
                    currentCard.fatto
                      ? 'bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900'
                      : 'bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-amber-300">
                        {currentCard.sezione}
                      </span>
                      <span className="text-xs text-slate-300 font-mono">
                        Passaggio {currentCardIndex + 1}/{activeScheda.passi.length}
                      </span>
                      {String(currentCard.numero_codice || '').trim() === '57' && (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 shadow-sm">
                          🎯 Traguardo 100% Pre-Assemblea (Sposta in Attesa Assemblea)
                        </span>
                      )}
                      {['58', '59', '60', '61', '62'].includes(String(currentCard.numero_codice || '').trim()) && (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-violet-400 text-slate-950 shadow-sm">
                          🏛️ Fase Post-Assemblea (Passi 58–62 • Escluso dal 100% Pre-Assemblea)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-extrabold font-mono text-white tracking-tight">
                        PASSO #{currentCard.numero_codice}
                      </span>
                      {currentCard.fatto ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-400 text-slate-950">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          COMPLETATO {currentCard.data_spunta ? `IL ${currentCard.data_spunta}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950">
                          <Circle className="w-3 h-3" />
                          DA COMPILARE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operatore ("Chi lo fa") */}
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/15">
                    <User className="w-4 h-4 text-amber-300" />
                    <label className="text-xs font-semibold text-slate-200">
                      Chi lo fa:
                    </label>
                    <input
                      type="text"
                      value={currentCard.chi_lo_fa}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, chi_lo_fa: val } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        schedulePassoAutoSave(activeScheda.id, currentCard.id, { chi_lo_fa: val });
                      }}
                      onBlur={(e) =>
                        handleUpdatePassoField(currentCard, { chi_lo_fa: e.target.value })
                      }
                      className="w-12 text-center font-bold text-sm bg-slate-900/90 text-amber-300 border border-amber-400/40 rounded-lg py-0.5 focus:outline-none focus:border-amber-300"
                    />
                  </div>
                </div>

                {/* CORPO DEL PASSAGGIO */}
                <div className="p-6 space-y-6">
                  {/* 1. Box Istruzione Operativa del Passo */}
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/90">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Istruzione Operativa del Passaggio (Modello 5)
                    </div>
                    <p className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
                      {currentCard.descrizione}
                    </p>
                  </div>

                  {/* 2. Campi di Compilazione Specifici del Passaggio */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                        Dati da Compilare in questo Passaggio
                      </h4>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full transition ${
                          saveStatus === 'saving'
                            ? 'bg-amber-100 text-amber-800'
                            : saveStatus === 'saved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {saveStatus === 'saving'
                          ? 'Salvataggio su PC...'
                          : saveStatus === 'saved'
                          ? '✓ Salvato su PC'
                          : 'Salvataggio automatico attivo'}
                      </span>
                    </div>

                    {/* Riga dedicata Passo 6: Elenco Assemblee Straordinarie (Data + Oggetto) con tasto + per aggiungerne più di una */}
                    {currentCard.numero_codice === '6' && (() => {
                      const extra = currentCard.campi_extra || {};
                      const idxSet = new Set<number>([1]);
                      Object.keys(extra).forEach((k) => {
                        const mData = k.match(/^Data assemblea straord\.(?:\s+(\d+))?$/);
                        if (mData) idxSet.add(mData[1] ? parseInt(mData[1], 10) : 1);
                        const mOgg = k.match(/^Oggetto(?:\s+(\d+))?$/);
                        if (mOgg) idxSet.add(mOgg[1] ? parseInt(mOgg[1], 10) : 1);
                      });
                      const assembleeIndices = Array.from(idxSet).sort((a, b) => a - b);

                      const getDataKey = (idx: number) =>
                        idx === 1 ? 'Data assemblea straord.' : `Data assemblea straord. ${idx}`;
                      const getOggettoKey = (idx: number) =>
                        idx === 1 ? 'Oggetto' : `Oggetto ${idx}`;

                      const handleUpdateAssembleaField = (
                        key: string,
                        val: string,
                        commitToBackend: boolean
                      ) => {
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [key]: val,
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        if (commitToBackend) {
                          handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                        } else {
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            campi_extra: newExtra,
                          });
                        }
                      };

                      const handleAddAssembleaRow = () => {
                        const maxIdx = Math.max(...assembleeIndices, 1);
                        const nextIdx = maxIdx + 1;
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [getDataKey(nextIdx)]: '',
                          [getOggettoKey(nextIdx)]: '',
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      const handleRemoveAssembleaRow = (idxToRemove: number) => {
                        if (idxToRemove === 1) return;
                        const newExtra = { ...(currentCard.campi_extra || {}) };
                        delete newExtra[getDataKey(idxToRemove)];
                        delete newExtra[getOggettoKey(idxToRemove)];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      return (
                        <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
                              Assemblee Straordinarie Svolte ({assembleeIndices.length})
                            </span>
                            <button
                              type="button"
                              onClick={handleAddAssembleaRow}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
                              title="Aggiungi un'altra assemblea straordinaria (Data + Oggetto)"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              <span>+ Aggiungi Assemblea</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            {assembleeIndices.map((idx, position) => {
                              const dKey = getDataKey(idx);
                              const oKey = getOggettoKey(idx);
                              const isLast = position === assembleeIndices.length - 1;

                              return (
                                <div
                                  key={idx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white border border-indigo-200/90 rounded-xl p-3.5 items-end shadow-2xs"
                                >
                                  <div className="sm:col-span-4">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {assembleeIndices.length > 1
                                        ? `Data assemblea straord. #${position + 1}`
                                        : 'Data assemblea straord.'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[dKey] || ''}
                                      placeholder="es. 15/05/2026"
                                      onChange={(e) =>
                                        handleUpdateAssembleaField(dKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateAssembleaField(dKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-6">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {assembleeIndices.length > 1
                                        ? `Oggetto assemblea #${position + 1}`
                                        : 'Oggetto assemblea'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[oKey] || ''}
                                      placeholder="Inserisci oggetto assemblea straordinaria..."
                                      onChange={(e) =>
                                        handleUpdateAssembleaField(oKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateAssembleaField(oKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                    {idx > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAssembleaRow(idx)}
                                        className="p-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                        title="Rimuovi questa riga assemblea"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isLast && (
                                      <button
                                        type="button"
                                        onClick={handleAddAssembleaRow}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                                        title="Aggiungi un'altra riga Data e Oggetto assemblea"
                                      >
                                        <Plus className="w-4 h-4 stroke-[3]" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Riga dedicata Passo 8: Numero unità con gestione inquilino + Quota gestione per unità (default 35 €) + Calcolo Compenso (N × Quota × 1,04 × 1,22) */}
                    {currentCard.numero_codice === '8' && (() => {
                      const rawUnits = currentCard.campi_extra?.['N. unità con gestione inquilino'] ?? '';
                      const rawQuota = currentCard.campi_extra?.['Quota gestione per unità (€)'] ?? '35';
                      const parsedUnits = parseFloat(String(rawUnits).replace(',', '.'));
                      const parsedQuota = parseFloat(String(rawQuota).replace(',', '.'));
                      const numUnits = !isNaN(parsedUnits) && parsedUnits > 0 ? parsedUnits : 0;
                      const quotaUnitaria = !isNaN(parsedQuota) && parsedQuota >= 0 ? parsedQuota : 35;
                      const compensoTotale = numUnits * quotaUnitaria * 1.04 * 1.22;
                      const costoIvatoPerUnita = quotaUnitaria * 1.04 * 1.22;
                      const compensoFormatted = compensoTotale.toLocaleString('it-IT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                      const quotaFormatted = quotaUnitaria.toLocaleString('it-IT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                      const costoIvatoUnitaFormatted = costoIvatoPerUnita.toLocaleString('it-IT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });

                      const updateCampiInquilini = (
                        nextUnitsStr: string,
                        nextQuotaStr: string,
                        commitToBackend: boolean
                      ) => {
                        const n = parseFloat(nextUnitsStr.replace(',', '.'));
                        const validN = !isNaN(n) && n > 0 ? n : 0;
                        const q = parseFloat(nextQuotaStr.replace(',', '.'));
                        const validQ = !isNaN(q) && q >= 0 ? q : 35;
                        const calc = (validN * validQ * 1.04 * 1.22).toLocaleString('it-IT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          'N. unità con gestione inquilino': nextUnitsStr,
                          'Quota gestione per unità (€)': nextQuotaStr,
                          'Compenso Gestione Inquilini (€)': nextUnitsStr.trim() === '' ? '' : calc,
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        if (commitToBackend) {
                          handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                        } else {
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            campi_extra: newExtra,
                          });
                        }
                      };

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gradient-to-r from-indigo-50/90 via-emerald-50/60 to-indigo-50/90 border-2 border-indigo-200 rounded-2xl p-4 shadow-2xs">
                          {/* Casella 1: Inserimento numero di unità con gestione dell'inquilino */}
                          <div className="bg-white/90 border border-indigo-200 rounded-xl p-3.5 flex flex-col justify-between">
                            <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-950 mb-1.5">
                              N. unità con gestione dell&apos;inquilino
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={rawUnits}
                              placeholder="Es. 3"
                              onChange={(e) => updateCampiInquilini(e.target.value, String(rawQuota), false)}
                              onBlur={(e) => updateCampiInquilini(e.target.value, String(rawQuota), true)}
                              className="w-full px-3.5 py-2.5 text-base bg-white border-2 border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-extrabold text-slate-900 shadow-2xs"
                            />
                            <span className="text-[11px] text-slate-500 mt-1.5">
                              Numero di unità con gestione inquilino attiva
                            </span>
                          </div>

                          {/* Casella 2: Quota gestione per ogni unità (default 35 €, modificabile di anno in anno) */}
                          <div className="bg-white/90 border border-amber-300 rounded-xl p-3.5 flex flex-col justify-between">
                            <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-950 mb-1.5">
                              Valore gestione per unità (€)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              value={rawQuota}
                              placeholder="35"
                              onChange={(e) => updateCampiInquilini(String(rawUnits), e.target.value, false)}
                              onBlur={(e) => updateCampiInquilini(String(rawUnits), e.target.value, true)}
                              className="w-full px-3.5 py-2.5 text-base bg-white border-2 border-amber-300 rounded-xl focus:outline-none focus:border-amber-600 font-extrabold text-slate-900 shadow-2xs"
                            />
                            <span className="text-[11px] text-slate-500 mt-1.5">
                              Compenso netto per ogni unità (modificabile di anno in anno)
                            </span>
                          </div>

                          {/* Casella 3: Calcolo automatico del compenso (N × Quota × 1,04 × 1,22) */}
                          <div className="bg-emerald-50/90 border-2 border-emerald-300 rounded-xl p-3.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                                <Calculator className="w-4 h-4 text-emerald-700" />
                                Compenso Fattura
                              </span>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-950">
                                N × {quotaFormatted} × 1,04 × 1,22
                              </span>
                            </div>
                            <input
                              type="text"
                              readOnly
                              value={`€ ${compensoFormatted}`}
                              className="w-full px-3.5 py-2 text-lg bg-white border-2 border-emerald-400 rounded-xl font-extrabold text-emerald-900 shadow-2xs cursor-default focus:outline-none"
                            />
                            <div className="text-[11px] text-emerald-900 mt-1.5 font-medium flex flex-wrap items-center justify-between gap-1">
                              <span>
                                <strong>{numUnits}</strong> × {quotaFormatted} € × 1,04 × 1,22
                              </span>
                              <span className="font-mono text-[10px] text-emerald-700">
                                ({costoIvatoUnitaFormatted} € / unità)
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sezione dedicata Passo 24: Lista Spese Personali / Ricorrenti con casella testo, spunta Eseguito e pulsante + */}
                    {currentCard.numero_codice === '24' && (() => {
                      const extra = currentCard.campi_extra || {};
                      const indicesSet = new Set<number>();
                      Object.keys(extra).forEach((k) => {
                        const mVoce = k.match(/^Voce spesa personale(?:\s+(\d+))?$/);
                        if (mVoce) indicesSet.add(mVoce[1] ? parseInt(mVoce[1], 10) : 1);
                        const mDone = k.match(/^Eseguito(?:\s+(\d+))?$/);
                        if (mDone) indicesSet.add(mDone[1] ? parseInt(mDone[1], 10) : 1);
                      });
                      if (indicesSet.size === 0) indicesSet.add(1);
                      const rowIndices = Array.from(indicesSet).sort((a, b) => a - b);

                      const getVoceKey = (idx: number) =>
                        idx === 1 &&
                        'Voce spesa personale' in extra &&
                        !('Voce spesa personale 1' in extra)
                          ? 'Voce spesa personale'
                          : `Voce spesa personale ${idx}`;

                      const getDoneKey = (idx: number) =>
                        idx === 1 && 'Eseguito' in extra && !('Eseguito 1' in extra)
                          ? 'Eseguito'
                          : `Eseguito ${idx}`;

                      const handleUpdateSpeseRow = (
                        idx: number,
                        nextVoce: string,
                        nextDone: boolean,
                        commitToBackend: boolean
                      ) => {
                        const newExtra = { ...(currentCard.campi_extra || {}) };
                        const vKey = getVoceKey(idx);
                        const dKey = getDoneKey(idx);
                        newExtra[vKey] = nextVoce;
                        newExtra[dKey] = nextDone ? 'true' : 'false';
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        if (commitToBackend) {
                          handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                        } else {
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            campi_extra: newExtra,
                          });
                        }
                      };

                      const handleAddSpeseRow = () => {
                        const maxIdx = rowIndices.length > 0 ? Math.max(...rowIndices) : 1;
                        const nextIdx = maxIdx + 1;
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [`Voce spesa personale ${nextIdx}`]: '',
                          [`Eseguito ${nextIdx}`]: 'false',
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      const handleRemoveSpeseRow = (idxToRemove: number) => {
                        if (rowIndices.length <= 1) return;
                        const newExtra = { ...(currentCard.campi_extra || {}) };
                        delete newExtra[getVoceKey(idxToRemove)];
                        delete newExtra[getDoneKey(idxToRemove)];
                        delete newExtra[`Voce spesa personale ${idxToRemove}`];
                        delete newExtra[`Eseguito ${idxToRemove}`];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      const completedCount = rowIndices.filter(
                        (idx) => extra[getDoneKey(idx)] === 'true'
                      ).length;

                      return (
                        <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 block">
                                Lista Spese Personali / Ricorrenti da Verificare ({rowIndices.length}{' '}
                                {rowIndices.length === 1 ? 'voce' : 'voci'} • {completedCount} eseguite)
                              </span>
                              <span className="text-[11px] text-slate-600">
                                Inserisci le spese personali o ricorrenti (parcheggi, rimborsi acqua, ecc.) e spunta man mano quelle eseguite. Usa <strong>+</strong> per aggiungere altre righe.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddSpeseRow}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
                              title="Aggiungi una nuova riga con casella di testo e spunta eseguito"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              + Aggiungi Voce
                            </button>
                          </div>

                          <div className="space-y-2.5">
                            {rowIndices.map((idx, pos) => {
                              const voceVal = extra[getVoceKey(idx)] || '';
                              const isDone = extra[getDoneKey(idx)] === 'true';
                              const isLast = pos === rowIndices.length - 1;

                              return (
                                <div
                                  key={idx}
                                  className={`flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl border transition ${
                                    isDone
                                      ? 'bg-emerald-50/90 border-emerald-300 shadow-2xs'
                                      : 'bg-white/95 border-indigo-200 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 flex-1">
                                    <span
                                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-extrabold font-mono flex-shrink-0 ${
                                        isDone
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-indigo-100 text-indigo-900'
                                      }`}
                                    >
                                      #{pos + 1}
                                    </span>

                                    <div className="relative group flex-1">
                                      <input
                                        type="text"
                                        value={voceVal}
                                        title={voceVal}
                                        placeholder="Es. Spese parcheggi, rimborso acqua, spesa ricorrente..."
                                        onChange={(e) =>
                                          handleUpdateSpeseRow(idx, e.target.value, isDone, false)
                                        }
                                        onBlur={(e) =>
                                          handleUpdateSpeseRow(idx, e.target.value, isDone, true)
                                        }
                                        className={`w-full px-3.5 py-2 text-sm bg-white border rounded-xl focus:outline-none font-semibold transition ${
                                          isDone
                                            ? 'border-emerald-300 text-emerald-950 focus:border-emerald-600 line-through decoration-emerald-600/60'
                                            : 'border-indigo-300 text-slate-900 focus:border-indigo-600'
                                        }`}
                                      />
                                      {voceVal.trim().length > 0 && (
                                        <div className="hidden group-hover:block group-focus-within:block absolute bottom-full left-0 mb-2 z-50 w-max max-w-xs sm:max-w-md md:max-w-lg bg-slate-900 text-white text-xs sm:text-sm font-medium p-3 rounded-xl shadow-2xl border border-indigo-400/60 pointer-events-none whitespace-pre-wrap break-words leading-relaxed">
                                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 mb-1">
                                            Testo completo voce #{pos + 1}
                                          </div>
                                          <div>{voceVal}</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2">
                                    {/* Casella spunta Eseguito / Non eseguito */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateSpeseRow(idx, voceVal, !isDone, true)
                                      }
                                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-xs font-extrabold transition cursor-pointer select-none ${
                                        isDone
                                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                          : 'bg-white border-slate-300 hover:border-indigo-500 text-slate-700'
                                      }`}
                                      title={
                                        isDone
                                          ? 'Clicca per segnare come NON eseguito'
                                          : 'Clicca per spuntare come Eseguito'
                                      }
                                    >
                                      <span
                                        className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                          isDone
                                            ? 'bg-white border-white text-emerald-700'
                                            : 'border-slate-400 bg-slate-50 text-transparent'
                                        }`}
                                      >
                                        <Check className="w-3 h-3 stroke-[3]" />
                                      </span>
                                      {isDone ? 'Eseguito' : 'Da eseguire'}
                                    </button>

                                    {rowIndices.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSpeseRow(idx)}
                                        className="p-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                        title="Rimuovi questa riga"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}

                                    {isLast && (
                                      <button
                                        type="button"
                                        onClick={handleAddSpeseRow}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                                        title="Aggiungi la casella successiva con spunta"
                                      >
                                        <Plus className="w-4 h-4 stroke-[3]" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sezione dedicata Passo 33: Elenco Fondi (Importo Fondo + Natura Fondo) con tasto + per creare più fondi */}
                    {currentCard.numero_codice === '33' && (() => {
                      const extra = currentCard.campi_extra || {};
                      const idxSet = new Set<number>([1]);
                      Object.keys(extra).forEach((k) => {
                        const mImp = k.match(/^Importo Fondo \(€\)(?:\s+(\d+))?$/);
                        if (mImp) idxSet.add(mImp[1] ? parseInt(mImp[1], 10) : 1);
                        const mNat = k.match(/^Natura Fondo(?:\s+(\d+))?$/);
                        if (mNat) idxSet.add(mNat[1] ? parseInt(mNat[1], 10) : 1);
                      });
                      const fondiIndices = Array.from(idxSet).sort((a, b) => a - b);

                      const getImportoKey = (idx: number) =>
                        idx === 1 ? 'Importo Fondo (€)' : `Importo Fondo (€) ${idx}`;
                      const getNaturaKey = (idx: number) =>
                        idx === 1 ? 'Natura Fondo' : `Natura Fondo ${idx}`;

                      const handleUpdateFondoField = (
                        key: string,
                        val: string,
                        commitToBackend: boolean
                      ) => {
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [key]: val,
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        if (commitToBackend) {
                          handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                        } else {
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            campi_extra: newExtra,
                          });
                        }
                      };

                      const handleAddFondoRow = () => {
                        const maxIdx = Math.max(...fondiIndices, 1);
                        const nextIdx = maxIdx + 1;
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [getImportoKey(nextIdx)]: '0',
                          [getNaturaKey(nextIdx)]: '',
                        };
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      const handleRemoveFondoRow = (idxToRemove: number) => {
                        if (idxToRemove === 1) return;
                        const newExtra = { ...(currentCard.campi_extra || {}) };
                        delete newExtra[getImportoKey(idxToRemove)];
                        delete newExtra[getNaturaKey(idxToRemove)];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      return (
                        <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 block">
                                Fondi Condominiali ({fondiIndices.length})
                              </span>
                              <span className="text-[11px] text-slate-600">
                                Inserisci importo e natura del fondo. Usa <strong>+</strong> per aggiungere ulteriori fondi se presenti.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddFondoRow}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
                              title="Aggiungi un altro fondo (Importo + Natura Fondo)"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              <span>+ Aggiungi Fondo</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            {fondiIndices.map((idx, position) => {
                              const impKey = getImportoKey(idx);
                              const natKey = getNaturaKey(idx);
                              const isLast = position === fondiIndices.length - 1;

                              return (
                                <div
                                  key={idx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white border border-indigo-200/90 rounded-xl p-3.5 items-end shadow-2xs"
                                >
                                  <div className="sm:col-span-4">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {fondiIndices.length > 1
                                        ? `Importo Fondo (€) #${position + 1}`
                                        : 'Importo Fondo (€)'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[impKey] ?? '0'}
                                      placeholder="es. 2.500,00"
                                      onChange={(e) =>
                                        handleUpdateFondoField(impKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateFondoField(impKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-6">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {fondiIndices.length > 1
                                        ? `Natura Fondo #${position + 1}`
                                        : 'Natura Fondo'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[natKey] || ''}
                                      placeholder="Inserisci natura del fondo (es. Fondo TFR, Fondo Lavori, Fondo Morosità)..."
                                      onChange={(e) =>
                                        handleUpdateFondoField(natKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateFondoField(natKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                    {idx > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFondoRow(idx)}
                                        className="p-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                        title="Rimuovi questo fondo"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isLast && (
                                      <button
                                        type="button"
                                        onClick={handleAddFondoRow}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                                        title="Aggiungi un altro fondo (Importo + Natura Fondo)"
                                      >
                                        <Plus className="w-4 h-4 stroke-[3]" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Gestione multi-riga per Passo 39: Sinistri aperti o chiusi (Data + Oggetto + pulsante +) */}
                    {currentCard.numero_codice === '39' && (() => {
                      const extra = currentCard.campi_extra || {};
                      const indicesSet = new Set<number>([1]);
                      Object.keys(extra).forEach((k) => {
                        const mData = k.match(/^Data sinistro(?:\s+(\d+))?$/);
                        if (mData) {
                          indicesSet.add(mData[1] ? parseInt(mData[1], 10) : 1);
                        }
                        const mOgg = k.match(/^Oggetto sinistro(?:\s+(\d+))?$/);
                        if (mOgg) {
                          indicesSet.add(mOgg[1] ? parseInt(mOgg[1], 10) : 1);
                        }
                      });
                      const sinistriIndices = Array.from(indicesSet).sort((a, b) => a - b);

                      const getDataSinistroKey = (idx: number) =>
                        idx === 1 ? 'Data sinistro' : `Data sinistro ${idx}`;
                      const getOggettoSinistroKey = (idx: number) =>
                        idx === 1 ? 'Oggetto sinistro' : `Oggetto sinistro ${idx}`;

                      const handleUpdateSinistroField = (
                        key: string,
                        val: string,
                        immediate: boolean
                      ) => {
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [key]: val,
                        };
                        delete newExtra['Data e Oggetto sinistri'];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        if (immediate) {
                          handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                        } else {
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            campi_extra: newExtra,
                          });
                        }
                      };

                      const handleAddSinistroRow = () => {
                        const maxIdx = sinistriIndices[sinistriIndices.length - 1] || 1;
                        const nextIdx = maxIdx + 1;
                        const newExtra = {
                          ...(currentCard.campi_extra || {}),
                          [getDataSinistroKey(1)]: extra[getDataSinistroKey(1)] ?? '',
                          [getOggettoSinistroKey(1)]: extra[getOggettoSinistroKey(1)] ?? '',
                          [getDataSinistroKey(nextIdx)]: '',
                          [getOggettoSinistroKey(nextIdx)]: '',
                        };
                        delete newExtra['Data e Oggetto sinistri'];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      const handleRemoveSinistroRow = (idxToRemove: number) => {
                        if (idxToRemove === 1) return;
                        const newExtra = { ...(currentCard.campi_extra || {}) };
                        delete newExtra[getDataSinistroKey(idxToRemove)];
                        delete newExtra[getOggettoSinistroKey(idxToRemove)];
                        const nextPassi = activeScheda.passi.map((p) =>
                          p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                        );
                        replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      return (
                        <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 block">
                                Sinistri Aperti o Chiusi ({sinistriIndices.length})
                              </span>
                              <span className="text-[11px] text-slate-600">
                                Inserisci data e oggetto del sinistro. Usa <strong>+</strong> per registrare ulteriori sinistri.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddSinistroRow}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
                              title="Registra un altro sinistro (Data + Oggetto)"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              <span>+ Aggiungi Sinistro</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            {sinistriIndices.map((idx, position) => {
                              const dataKey = getDataSinistroKey(idx);
                              const oggKey = getOggettoSinistroKey(idx);
                              const isLast = position === sinistriIndices.length - 1;
                              const fallbackLegacyOgg =
                                idx === 1 &&
                                !extra[oggKey] &&
                                extra['Data e Oggetto sinistri'] &&
                                extra['Data e Oggetto sinistri'] !== 'Nessun sinistro aperto'
                                  ? extra['Data e Oggetto sinistri']
                                  : '';

                              return (
                                <div
                                  key={idx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white border border-indigo-200/90 rounded-xl p-3.5 items-end shadow-2xs"
                                >
                                  <div className="sm:col-span-4">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {sinistriIndices.length > 1
                                        ? `Data sinistro #${position + 1}`
                                        : 'Data sinistro'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[dataKey] || ''}
                                      placeholder="es. 15/03/2026"
                                      onChange={(e) =>
                                        handleUpdateSinistroField(dataKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateSinistroField(dataKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-6">
                                    <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                      {sinistriIndices.length > 1
                                        ? `Oggetto sinistro #${position + 1}`
                                        : 'Oggetto sinistro'}
                                    </label>
                                    <input
                                      type="text"
                                      value={extra[oggKey] ?? fallbackLegacyOgg}
                                      placeholder="Inserisci oggetto / descrizione del sinistro (aperto o chiuso)..."
                                      onChange={(e) =>
                                        handleUpdateSinistroField(oggKey, e.target.value, false)
                                      }
                                      onBlur={(e) =>
                                        handleUpdateSinistroField(oggKey, e.target.value, true)
                                      }
                                      className="w-full px-3.5 py-2 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900"
                                    />
                                  </div>

                                  <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                    {idx > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSinistroRow(idx)}
                                        className="p-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                        title="Rimuovi questo sinistro"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isLast && (
                                      <button
                                        type="button"
                                        onClick={handleAddSinistroRow}
                                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                                        title="Aggiungi un altro sinistro (Data + Oggetto)"
                                      >
                                        <Plus className="w-4 h-4 stroke-[3]" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Griglia Campi Extra del Passo + Campo Esito/Valore sempre disponibile */}
                    <div
                      className={`grid grid-cols-1 ${
                        currentCard.numero_codice === '51' || currentExtraKeys.length === 3
                          ? 'sm:grid-cols-3'
                          : currentCard.numero_codice === '47'
                          ? 'sm:grid-cols-12 items-stretch'
                          : 'sm:grid-cols-2'
                      } gap-4`}
                    >
                      {currentExtraKeys.length > 0 ? (
                        currentExtraKeys.map((k) => {
                          const rawVal =
                            currentCard.campi_extra?.[k] ||
                            (currentCard.numero_codice === '30' && k === 'Attuale (€)'
                              ? activeScheda.passi.find((p) => p.numero_codice === '31')
                                  ?.campi_extra?.['Attuale (€)'] || ''
                              : currentCard.numero_codice === '51' && k === 'Data riunione'
                              ? activeScheda.passi.find((p) => p.numero_codice === '52')
                                  ?.campi_extra?.['Data assemblea'] || ''
                              : currentCard.numero_codice === '51' && k === 'Ora riunione'
                              ? activeScheda.passi.find((p) => p.numero_codice === '53')
                                  ?.campi_extra?.['Ora assemblea'] || ''
                              : '');
                          const displayLabel =
                            currentCard.numero_codice === '51'
                              ? k === 'Presso'
                                ? 'Luogo Riunione (Presso)'
                                : k === 'Data riunione'
                                ? 'Data della Riunione'
                                : k === 'Ora riunione'
                                ? 'Ora della Riunione'
                                : k
                              : k;
                          const displayPlaceholder =
                            currentCard.numero_codice === '51'
                              ? k === 'Presso'
                                ? 'Es. Sala Riunioni Studio Serra...'
                                : k === 'Data riunione'
                                ? 'Es. gg/mm/aaaa'
                                : k === 'Ora riunione'
                                ? 'Es. 18:00'
                                : `Inserisci ${k}...`
                              : `Inserisci ${k}...`;
                          return (
                            <div
                              key={k}
                              className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-4"
                            >
                              <label className="block text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-1.5">
                                {displayLabel}
                              </label>
                              <div className="relative group">
                                <input
                                  type="text"
                                  value={rawVal}
                                  title={rawVal}
                                  placeholder={displayPlaceholder}
                                  onChange={(e) => {
                                    const newExtra = {
                                      ...(currentCard.campi_extra || {}),
                                      [k]: e.target.value,
                                    };
                                    const nextPassi = activeScheda.passi.map((p) =>
                                      p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                                    );
                                    replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                                    schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                                      campi_extra: newExtra,
                                    });
                                  }}
                                  onBlur={(e) => {
                                    const newExtra = {
                                      ...(currentCard.campi_extra || {}),
                                      [k]: e.target.value,
                                    };
                                    handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                                  }}
                                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-900 shadow-2xs"
                                />
                                {String(rawVal || '').trim().length > 0 && (
                                  <div className="hidden group-hover:block group-focus-within:block absolute bottom-full left-0 mb-2 z-50 w-max max-w-xs sm:max-w-md md:max-w-lg bg-slate-900 text-white text-xs sm:text-sm font-medium p-3 rounded-xl shadow-2xl border border-indigo-400/60 pointer-events-none whitespace-pre-wrap break-words leading-relaxed">
                                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 mb-1">
                                      {displayLabel}
                                    </div>
                                    <div>{rawVal}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : currentCard.numero_codice !== '6' &&
                        currentCard.numero_codice !== '8' &&
                        currentCard.numero_codice !== '24' &&
                        currentCard.numero_codice !== '33' &&
                        currentCard.numero_codice !== '39' &&
                        currentCard.numero_codice !== '47' ? (
                        <div className="sm:col-span-2 bg-slate-50/80 border border-slate-200 rounded-2xl p-4">
                          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                            Esito Verifica / Valore Riscontrato (Opzionale)
                          </label>
                          <div className="relative group">
                            <input
                              type="text"
                              value={currentCard.campi_extra?.['Esito / Valore'] || ''}
                              title={currentCard.campi_extra?.['Esito / Valore'] || ''}
                              placeholder="Es. Verificato OK in Danea, quadratura confermata, importo o riferimento..."
                              onChange={(e) => {
                                const newExtra = {
                                  ...(currentCard.campi_extra || {}),
                                  'Esito / Valore': e.target.value,
                                };
                                const nextPassi = activeScheda.passi.map((p) =>
                                  p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p
                                );
                                replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                                schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                                  campi_extra: newExtra,
                                });
                              }}
                              onBlur={(e) => {
                                const newExtra = {
                                  ...(currentCard.campi_extra || {}),
                                  'Esito / Valore': e.target.value,
                                };
                                handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                              }}
                              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-medium text-slate-900"
                            />
                            {String(currentCard.campi_extra?.['Esito / Valore'] || '').trim().length > 0 && (
                              <div className="hidden group-hover:block group-focus-within:block absolute bottom-full left-0 mb-2 z-50 w-max max-w-xs sm:max-w-md md:max-w-lg bg-slate-900 text-white text-xs sm:text-sm font-medium p-3 rounded-xl shadow-2xl border border-indigo-400/60 pointer-events-none whitespace-pre-wrap break-words leading-relaxed">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 mb-1">
                                  Esito Verifica / Valore Riscontrato (Passo #{currentCard.numero_codice})
                                </div>
                                <div>{currentCard.campi_extra?.['Esito / Valore']}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {/* Box Numero Pagine (PAG.) se il passo produce un documento allegato */}
                      {currentCard.ha_pagine && (
                        <div
                          className={`bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 flex flex-col justify-between ${
                            currentCard.numero_codice === '47' ? 'sm:col-span-5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2 gap-1.5 flex-wrap">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-amber-700" />
                              Numero Pagine Documento (Col. PAG.)
                            </span>
                            {linkedDocAllegato && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950">
                                Allegato #{linkedDocAllegato.numero_allegato || '-'} • 1° pag:{' '}
                                {linkedDocAllegato.incluso ? linkedDocAllegato.prima_pagina : '-'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min={0}
                              value={currentCard.num_pagine}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                const nextPassi = activeScheda.passi.map((p) =>
                                  p.id === currentCard.id ? { ...p, num_pagine: val } : p
                                );
                                replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                                schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                                  num_pagine: val,
                                });
                              }}
                              onBlur={(e) => {
                                const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                handleUpdatePassoField(currentCard, { num_pagine: val });
                              }}
                              className="w-24 sm:w-28 text-center font-extrabold text-lg bg-white border-2 border-amber-400 rounded-xl py-1.5 text-slate-900 focus:outline-none focus:border-amber-600"
                            />
                            <div className="text-xs text-amber-900 leading-snug">
                              Aggiorna in automatico la numerazione del fascicolo (Totale attuale:{' '}
                              <strong>{activeScheda.totale_pagine_fascicolo} pag.</strong>)
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Riquadro affiancato al Numero Pagine nella Scheda #47: Dati richiamati dai Punti #3, #6, #11, #33, #34, #37, #39 e #43 per scrivere la Nota Esplicativa */}
                      {currentCard.numero_codice === '47' && (() => {
                        const passo3 = activeScheda.passi.find((p) => p.numero_codice === '3');
                        const passo6 = activeScheda.passi.find((p) => p.numero_codice === '6');
                        const passo11 = activeScheda.passi.find((p) => p.numero_codice === '11');
                        const passo33 = activeScheda.passi.find((p) => p.numero_codice === '33');
                        const passo34 = activeScheda.passi.find((p) => p.numero_codice === '34');
                        const passo37 = activeScheda.passi.find((p) => p.numero_codice === '37');
                        const passo39 = activeScheda.passi.find((p) => p.numero_codice === '39');
                        const passo43 = activeScheda.passi.find((p) => p.numero_codice === '43');

                        const rateRegistrate3 =
                          passo3?.campi_extra?.['Rate registrate sino al giorno'] ??
                          passo3?.campi_extra?.['Esito / Valore'] ??
                          '';
                        const interessiMorosita11 =
                          passo11?.campi_extra?.['% e gg'] ??
                          passo11?.campi_extra?.['Esito / Valore'] ??
                          '';
                        const importoPrev34 =
                          passo34?.campi_extra?.['Importo Preventivo (€)'] ??
                          passo34?.campi_extra?.['Esito / Valore'] ??
                          '';
                        const scadenzeRate37 =
                          passo37?.campi_extra?.['Date scadenze rate'] ??
                          passo37?.campi_extra?.['Esito / Valore'] ??
                          '';

                        // Tutte le assemblee straordinarie registrate nella Scheda #6 (Data assemblea straord. + Oggetto)
                        const extra6 = passo6?.campi_extra || {};
                        const assembleeIdxSet6 = new Set<number>([1]);
                        Object.keys(extra6).forEach((k) => {
                          const mData = k.match(/^Data assemblea straord\.(?:\s+(\d+))?$/);
                          if (mData) assembleeIdxSet6.add(mData[1] ? parseInt(mData[1], 10) : 1);
                          const mOgg = k.match(/^Oggetto(?:\s+(\d+))?$/);
                          if (mOgg) assembleeIdxSet6.add(mOgg[1] ? parseInt(mOgg[1], 10) : 1);
                        });
                        const assembleeIndices6 = Array.from(assembleeIdxSet6).sort((a, b) => a - b);
                        const getDataAssembleaKey6 = (idx: number) =>
                          idx === 1 ? 'Data assemblea straord.' : `Data assemblea straord. ${idx}`;
                        const getOggettoAssembleaKey6 = (idx: number) =>
                          idx === 1 ? 'Oggetto' : `Oggetto ${idx}`;

                        const handleAddAssemblea6From47 = () => {
                          if (!passo6) return;
                          const maxIdx = Math.max(...assembleeIndices6, 1);
                          const nextIdx = maxIdx + 1;
                          const newExtra = {
                            ...(passo6.campi_extra || {}),
                            [getDataAssembleaKey6(nextIdx)]: '',
                            [getOggettoAssembleaKey6(nextIdx)]: '',
                          };
                          const nextPassi = activeScheda.passi.map((p) =>
                            p.id === passo6.id ? { ...p, campi_extra: newExtra } : p
                          );
                          replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                          handleUpdatePassoField(passo6, { campi_extra: newExtra });
                        };

                        // Tutti i fondi esistenti nella Scheda #33 (Importo Fondo (€) + Natura Fondo)
                        const extra33 = passo33?.campi_extra || {};
                        const fondiIdxSet = new Set<number>([1]);
                        Object.keys(extra33).forEach((k) => {
                          const mImp = k.match(/^Importo Fondo \(€\)(?:\s+(\d+))?$/);
                          if (mImp) fondiIdxSet.add(mImp[1] ? parseInt(mImp[1], 10) : 1);
                          const mNat = k.match(/^Natura Fondo(?:\s+(\d+))?$/);
                          if (mNat) fondiIdxSet.add(mNat[1] ? parseInt(mNat[1], 10) : 1);
                        });
                        const fondiIndices33 = Array.from(fondiIdxSet).sort((a, b) => a - b);
                        const getImportoFondoKey33 = (idx: number) =>
                          idx === 1 ? 'Importo Fondo (€)' : `Importo Fondo (€) ${idx}`;
                        const getNaturaFondoKey33 = (idx: number) =>
                          idx === 1 ? 'Natura Fondo' : `Natura Fondo ${idx}`;

                        const handleAddFondo33From47 = () => {
                          if (!passo33) return;
                          const maxIdx = Math.max(...fondiIndices33, 1);
                          const nextIdx = maxIdx + 1;
                          const newExtra = {
                            ...(passo33.campi_extra || {}),
                            [getImportoFondoKey33(nextIdx)]: '0',
                            [getNaturaFondoKey33(nextIdx)]: '',
                          };
                          const nextPassi = activeScheda.passi.map((p) =>
                            p.id === passo33.id ? { ...p, campi_extra: newExtra } : p
                          );
                          replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                          handleUpdatePassoField(passo33, { campi_extra: newExtra });
                        };

                        // Tutti i sinistri registrati nella Scheda #39 (Data sinistro + Oggetto sinistro)
                        const extra39 = passo39?.campi_extra || {};
                        const sinistriIdxSet = new Set<number>([1]);
                        Object.keys(extra39).forEach((k) => {
                          const mData = k.match(/^Data sinistro(?:\s+(\d+))?$/);
                          if (mData) sinistriIdxSet.add(mData[1] ? parseInt(mData[1], 10) : 1);
                          const mOgg = k.match(/^Oggetto sinistro(?:\s+(\d+))?$/);
                          if (mOgg) sinistriIdxSet.add(mOgg[1] ? parseInt(mOgg[1], 10) : 1);
                        });
                        const sinistriIndices39 = Array.from(sinistriIdxSet).sort((a, b) => a - b);
                        const getDataSinistroKey39 = (idx: number) =>
                          idx === 1 ? 'Data sinistro' : `Data sinistro ${idx}`;
                        const getOggettoSinistroKey39 = (idx: number) =>
                          idx === 1 ? 'Oggetto sinistro' : `Oggetto sinistro ${idx}`;

                        const handleAddSinistro39From47 = () => {
                          if (!passo39) return;
                          const maxIdx = sinistriIndices39[sinistriIndices39.length - 1] || 1;
                          const nextIdx = maxIdx + 1;
                          const newExtra = {
                            ...(passo39.campi_extra || {}),
                            [getDataSinistroKey39(1)]: extra39[getDataSinistroKey39(1)] ?? '',
                            [getOggettoSinistroKey39(1)]: extra39[getOggettoSinistroKey39(1)] ?? '',
                            [getDataSinistroKey39(nextIdx)]: '',
                            [getOggettoSinistroKey39(nextIdx)]: '',
                          };
                          delete newExtra['Data e Oggetto sinistri'];
                          const nextPassi = activeScheda.passi.map((p) =>
                            p.id === passo39.id ? { ...p, campi_extra: newExtra } : p
                          );
                          replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                          handleUpdatePassoField(passo39, { campi_extra: newExtra });
                        };

                        const utenti43 = passo43?.campi_extra?.['Utenti'] ?? '';
                        const accessi43 = passo43?.campi_extra?.['Accessi'] ?? '';
                        const mail43 = passo43?.campi_extra?.['Mail'] ?? '';

                        const utNum = parseFloat(utenti43 || '0');
                        const accNum = parseFloat(accessi43 || '0');
                        const percAccessi43 =
                          utNum > 0 ? `${Math.round((accNum / utNum) * 100)}%` : null;

                        const updateLinkedStepExtra = (
                          targetPasso: PassoRendiconto | undefined,
                          key: string,
                          value: string,
                          commitToBackend: boolean
                        ) => {
                          if (!targetPasso) return;
                          const newExtra = {
                            ...(targetPasso.campi_extra || {}),
                            [key]: value,
                          };
                          const nextPassi = activeScheda.passi.map((p) =>
                            p.id === targetPasso.id ? { ...p, campi_extra: newExtra } : p
                          );
                          replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                          if (commitToBackend) {
                            handleUpdatePassoField(targetPasso, { campi_extra: newExtra });
                          } else {
                            schedulePassoAutoSave(activeScheda.id, targetPasso.id, {
                              campi_extra: newExtra,
                            });
                          }
                        };

                        return (
                          <div className="sm:col-span-7 bg-indigo-50/80 border-2 border-indigo-300 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-indigo-200/80 pb-2">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                                <BookOpen className="w-4 h-4 text-indigo-700" />
                                Dati per Scrivere la Nota (da Punti #3, #6, #11, #33, #34, #37, #39 e #43)
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-950">
                                Sincronizzati con i punti
                              </span>
                            </div>

                            {/* Riga 1: Punto #3 (Rate registrate sino al giorno) + Punto #34 (Importo Preventivo) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* Punto #3: Rate registrate sino al giorno */}
                              <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <label className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                    Rate: registrate sino al giorno
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('3')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer shrink-0"
                                    title="Vai al Punto #3"
                                  >
                                    Punto #3 ↗
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={rateRegistrate3}
                                  placeholder="Es. 15/10/2026"
                                  onChange={(e) =>
                                    updateLinkedStepExtra(
                                      passo3,
                                      'Rate registrate sino al giorno',
                                      e.target.value,
                                      false
                                    )
                                  }
                                  onBlur={(e) =>
                                    updateLinkedStepExtra(
                                      passo3,
                                      'Rate registrate sino al giorno',
                                      e.target.value,
                                      true
                                    )
                                  }
                                  className="w-full px-2.5 py-1.5 text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                                />
                                {passo3?.note_passo && passo3.note_passo.trim() !== '' && (
                                  <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo3.note_passo}>
                                    📝 {passo3.note_passo}
                                  </div>
                                )}
                              </div>

                              {/* Punto #34: Importo Preventivo */}
                              <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <label className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                    Importo Preventivo (€)
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('34')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer shrink-0"
                                    title="Vai al Punto #34"
                                  >
                                    Punto #34 ↗
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={importoPrev34}
                                  placeholder="Es. 19.800,00"
                                  onChange={(e) =>
                                    updateLinkedStepExtra(
                                      passo34,
                                      'Importo Preventivo (€)',
                                      e.target.value,
                                      false
                                    )
                                  }
                                  onBlur={(e) =>
                                    updateLinkedStepExtra(
                                      passo34,
                                      'Importo Preventivo (€)',
                                      e.target.value,
                                      true
                                    )
                                  }
                                  className="w-full px-2.5 py-1.5 text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                                />
                                {passo34?.note_passo && passo34.note_passo.trim() !== '' && (
                                  <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo34.note_passo}>
                                    📝 {passo34.note_passo}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Riga 2: Punto #6 (Tutte le Assemblee Straordinarie: Data assemblea straord. + Oggetto) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Assemblee Straordinarie ({assembleeIndices6.length})
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleAddAssemblea6From47}
                                    className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] transition cursor-pointer inline-flex items-center gap-0.5"
                                    title="Aggiungi un'altra assemblea straordinaria al Punto #6"
                                  >
                                    <Plus className="w-3 h-3 stroke-[3]" />
                                    <span>Assemblea</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('6')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer"
                                    title="Vai al Punto #6"
                                  >
                                    Punto #6 ↗
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {assembleeIndices6.map((idx, pos) => {
                                  const dKey = getDataAssembleaKey6(idx);
                                  const oKey = getOggettoAssembleaKey6(idx);
                                  return (
                                    <div
                                      key={idx}
                                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-indigo-50/30 border border-indigo-100 rounded-lg p-2"
                                    >
                                      <div className="sm:col-span-4">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {assembleeIndices6.length > 1
                                            ? `Data assemblea straord. #${pos + 1}`
                                            : 'Data assemblea straord.'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra6[dKey] || ''}
                                          placeholder="Es. 12/05/2026"
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo6,
                                              dKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo6,
                                              dKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-extrabold font-mono bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                      <div className="sm:col-span-8">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {assembleeIndices6.length > 1
                                            ? `Oggetto assemblea #${pos + 1}`
                                            : 'Oggetto assemblea'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra6[oKey] || ''}
                                          placeholder="Oggetto / delibera assemblea straordinaria..."
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo6,
                                              oKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo6,
                                              oKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-bold bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {passo6?.note_passo && passo6.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo6.note_passo}>
                                  📝 {passo6.note_passo}
                                </div>
                              )}
                            </div>

                            {/* Riga 2b: Punto #11 (Interessi di morosità: % e gg) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Interessi di morosità (% e gg)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => jumpToStepByCode('11')}
                                  className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer shrink-0"
                                  title="Vai al Punto #11"
                                >
                                  Punto #11 ↗
                                </button>
                              </div>
                              <input
                                type="text"
                                value={interessiMorosita11}
                                placeholder="Es. Tasso legale 2,5% dopo 30 gg dalla scadenza"
                                onChange={(e) =>
                                  updateLinkedStepExtra(
                                    passo11,
                                    '% e gg',
                                    e.target.value,
                                    false
                                  )
                                }
                                onBlur={(e) =>
                                  updateLinkedStepExtra(
                                    passo11,
                                    '% e gg',
                                    e.target.value,
                                    true
                                  )
                                }
                                className="w-full px-2.5 py-1.5 text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                              />
                              {passo11?.note_passo && passo11.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo11.note_passo}>
                                  📝 {passo11.note_passo}
                                </div>
                              )}
                            </div>

                            {/* Riga 3: Punto #33 (Tutti i Fondi esistenti: Importo Fondo (€) + Natura Fondo) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Fondi Condominiali Esistenti ({fondiIndices33.length})
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleAddFondo33From47}
                                    className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] transition cursor-pointer inline-flex items-center gap-0.5"
                                    title="Aggiungi un altro fondo al Punto #33"
                                  >
                                    <Plus className="w-3 h-3 stroke-[3]" />
                                    <span>Fondo</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('33')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer"
                                    title="Vai al Punto #33"
                                  >
                                    Punto #33 ↗
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {fondiIndices33.map((idx, pos) => {
                                  const impKey = getImportoFondoKey33(idx);
                                  const natKey = getNaturaFondoKey33(idx);
                                  return (
                                    <div
                                      key={idx}
                                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-indigo-50/30 border border-indigo-100 rounded-lg p-2"
                                    >
                                      <div className="sm:col-span-4">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {fondiIndices33.length > 1
                                            ? `Importo Fondo (€) #${pos + 1}`
                                            : 'Importo Fondo (€)'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra33[impKey] ?? '0'}
                                          placeholder="Es. 2.500,00"
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo33,
                                              impKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo33,
                                              impKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-extrabold font-mono bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                      <div className="sm:col-span-8">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {fondiIndices33.length > 1
                                            ? `Natura Fondo #${pos + 1}`
                                            : 'Natura Fondo'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra33[natKey] || ''}
                                          placeholder="Natura del fondo (es. Fondo TFR, Fondo Lavori)..."
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo33,
                                              natKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo33,
                                              natKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-bold bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {passo33?.note_passo && passo33.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo33.note_passo}>
                                  📝 {passo33.note_passo}
                                </div>
                              )}
                            </div>

                            {/* Riga 4: Punto #37 (Date Scadenze Rate) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Date Scadenze Rate
                                </label>
                                <button
                                  type="button"
                                  onClick={() => jumpToStepByCode('37')}
                                  className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer shrink-0"
                                  title="Vai al Punto #37"
                                >
                                  Punto #37 ↗
                                </button>
                              </div>
                              <input
                                type="text"
                                value={scadenzeRate37}
                                placeholder="Es. 01/03 - 01/06 - 01/09 - 01/12"
                                onChange={(e) =>
                                  updateLinkedStepExtra(
                                    passo37,
                                    'Date scadenze rate',
                                    e.target.value,
                                    false
                                  )
                                }
                                onBlur={(e) =>
                                  updateLinkedStepExtra(
                                    passo37,
                                    'Date scadenze rate',
                                    e.target.value,
                                    true
                                  )
                                }
                                className="w-full px-2.5 py-1.5 text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                              />
                              {passo37?.note_passo && passo37.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo37.note_passo}>
                                  📝 {passo37.note_passo}
                                </div>
                              )}
                            </div>

                            {/* Riga 5: Punto #39 (Tutti i Sinistri creati: Data sinistro + Oggetto sinistro) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Sinistri Aperti o Chiusi ({sinistriIndices39.length})
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleAddSinistro39From47}
                                    className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] transition cursor-pointer inline-flex items-center gap-0.5"
                                    title="Aggiungi un altro sinistro al Punto #39"
                                  >
                                    <Plus className="w-3 h-3 stroke-[3]" />
                                    <span>Sinistro</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('39')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer"
                                    title="Vai al Punto #39"
                                  >
                                    Punto #39 ↗
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {sinistriIndices39.map((idx, pos) => {
                                  const dKey = getDataSinistroKey39(idx);
                                  const oKey = getOggettoSinistroKey39(idx);
                                  const fallbackLegacyOgg =
                                    idx === 1 &&
                                    !extra39[oKey] &&
                                    extra39['Data e Oggetto sinistri'] &&
                                    extra39['Data e Oggetto sinistri'] !== 'Nessun sinistro aperto'
                                      ? extra39['Data e Oggetto sinistri']
                                      : '';
                                  return (
                                    <div
                                      key={idx}
                                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-indigo-50/30 border border-indigo-100 rounded-lg p-2"
                                    >
                                      <div className="sm:col-span-4">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {sinistriIndices39.length > 1
                                            ? `Data sinistro #${pos + 1}`
                                            : 'Data sinistro'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra39[dKey] || ''}
                                          placeholder="Es. 15/03/2026"
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo39,
                                              dKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo39,
                                              dKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-extrabold font-mono bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                      <div className="sm:col-span-8">
                                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                          {sinistriIndices39.length > 1
                                            ? `Oggetto sinistro #${pos + 1}`
                                            : 'Oggetto sinistro'}
                                        </label>
                                        <input
                                          type="text"
                                          value={extra39[oKey] ?? fallbackLegacyOgg}
                                          placeholder="Oggetto / descrizione sinistro..."
                                          onChange={(e) =>
                                            updateLinkedStepExtra(
                                              passo39,
                                              oKey,
                                              e.target.value,
                                              false
                                            )
                                          }
                                          onBlur={(e) =>
                                            updateLinkedStepExtra(
                                              passo39,
                                              oKey,
                                              e.target.value,
                                              true
                                            )
                                          }
                                          className="w-full px-2 py-1 text-xs font-bold bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {passo39?.note_passo && passo39.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo39.note_passo}>
                                  📝 {passo39.note_passo}
                                </div>
                              )}
                            </div>

                            {/* Riga 6: Punto #43 (Valore Utenti, Accessi e Mail MioCondominio) */}
                            <div className="bg-white border border-indigo-200 rounded-xl p-2.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap mb-1.5">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-950">
                                  Valori Utenti, Accessi e Mail — MioCondominio
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {percAccessi43 && (
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-extrabold text-[10px]">
                                      Accessi: {percAccessi43}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => jumpToStepByCode('43')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-extrabold text-[10px] transition cursor-pointer"
                                    title="Vai al Punto #43"
                                  >
                                    Punto #43 ↗
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                    Utenti
                                  </label>
                                  <input
                                    type="text"
                                    value={utenti43}
                                    placeholder="0"
                                    onChange={(e) =>
                                      updateLinkedStepExtra(passo43, 'Utenti', e.target.value, false)
                                    }
                                    onBlur={(e) =>
                                      updateLinkedStepExtra(passo43, 'Utenti', e.target.value, true)
                                    }
                                    className="w-full px-2.5 py-1 text-center text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                    Accessi
                                  </label>
                                  <input
                                    type="text"
                                    value={accessi43}
                                    placeholder="0"
                                    onChange={(e) =>
                                      updateLinkedStepExtra(passo43, 'Accessi', e.target.value, false)
                                    }
                                    onBlur={(e) =>
                                      updateLinkedStepExtra(passo43, 'Accessi', e.target.value, true)
                                    }
                                    className="w-full px-2.5 py-1 text-center text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-0.5">
                                    Mail
                                  </label>
                                  <input
                                    type="text"
                                    value={mail43}
                                    placeholder="0"
                                    onChange={(e) =>
                                      updateLinkedStepExtra(passo43, 'Mail', e.target.value, false)
                                    }
                                    onBlur={(e) =>
                                      updateLinkedStepExtra(passo43, 'Mail', e.target.value, true)
                                    }
                                    className="w-full px-2.5 py-1 text-center text-sm font-extrabold font-mono bg-indigo-50/40 border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                                  />
                                </div>
                              </div>
                              {passo43?.note_passo && passo43.note_passo.trim() !== '' && (
                                <div className="mt-1 text-[10px] text-slate-600 truncate" title={passo43.note_passo}>
                                  📝 {passo43.note_passo}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Avviso Formula Excel Passo 33 */}
                    {showCurrentFondoWarning && (
                      <div className="p-4 rounded-2xl bg-rose-100 border-2 border-rose-400 text-rose-900 flex items-center gap-3 animate-pulse">
                        <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0" />
                        <div>
                          <div className="text-xs font-bold uppercase text-rose-700">
                            Avviso Automatico Modello 5 (Formula Cella K38)
                          </div>
                          <div className="text-sm font-extrabold">
                            CREA IL RIPARTO DEL FONDO e salvalo!
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Badge % Accessi MioCondominio Passo 43 */}
                    {currentMioCondominioPerc && (
                      <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 uppercase">
                          Percentuale Accessi Portale MioCondominio Calcolata:
                        </span>
                        <span className="text-lg font-extrabold text-indigo-700 font-mono">
                          {currentMioCondominioPerc}
                        </span>
                      </div>
                    )}

                    {/* =========================================================
                        STRUMENTI INTEGRATI DIRETTAMENTE NELLA CARTA QUANDO SERVONO
                       ========================================================= */}

                    {/* Se siamo sulla Carta #15b -> Mostra il Calcolatore Acqua Eccedente direttamente nella Carta! */}
                    {currentCard.numero_codice === '15b' && (
                      <div className="bg-sky-50/90 border-2 border-sky-300 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Droplets className="w-5 h-5 text-sky-700" />
                            <h5 className="text-sm font-extrabold uppercase text-sky-950">
                              Calcolatore Acqua Eccedente Integrato (Celle O17:P23)
                            </h5>
                          </div>
                          <span className="text-xs font-bold text-sky-800 bg-sky-200/70 px-2.5 py-0.5 rounded-full">
                            Compila qui sotto
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-white p-3 rounded-xl border border-sky-200">
                            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                              Consumo Contabilizzatori (mc)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={activeScheda.calcolatore_acqua.consumo_contabilizzatori}
                              onChange={(e) =>
                                handleUpdateSchedaHeader({
                                  acqua_consumo_contabilizzatori: parseFloat(e.target.value || '0'),
                                })
                              }
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-bold"
                            />
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-sky-200">
                            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                              mc delle Fatture (mc)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={activeScheda.calcolatore_acqua.mc_fatture}
                              onChange={(e) =>
                                handleUpdateSchedaHeader({
                                  acqua_mc_fatture: parseFloat(e.target.value || '0'),
                                })
                              }
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-bold"
                            />
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-sky-200">
                            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                              Costo Fatture H2O (€)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={activeScheda.calcolatore_acqua.costo_fatture_h2o}
                              onChange={(e) =>
                                handleUpdateSchedaHeader({
                                  acqua_costo_fatture: parseFloat(e.target.value || '0'),
                                })
                              }
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div className="bg-white/80 px-3.5 py-2.5 rounded-xl border border-sky-200 flex items-center justify-between">
                            <span className="text-xs text-slate-600 font-semibold">
                              mc oltre letture:
                            </span>
                            <span className="font-mono font-extrabold text-sm text-slate-900">
                              {activeScheda.calcolatore_acqua.mc_oltre_letture} mc
                            </span>
                          </div>
                          <div className="bg-white/80 px-3.5 py-2.5 rounded-xl border border-sky-200 flex items-center justify-between">
                            <span className="text-xs text-slate-600 font-semibold">
                              Costo al mc:
                            </span>
                            <span className="font-mono font-extrabold text-sm text-slate-900">
                              € {activeScheda.calcolatore_acqua.costo_al_mc.toFixed(4)}
                            </span>
                          </div>
                          <div
                            className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between ${
                              activeScheda.calcolatore_acqua.soglia_eccedenza_superata
                                ? 'bg-amber-100 border-amber-400 text-amber-950'
                                : 'bg-emerald-100 border-emerald-300 text-emerald-950'
                            }`}
                          >
                            <span className="text-xs font-bold uppercase">Quota Eccedente:</span>
                            <span className="font-mono font-extrabold text-base">
                              € {activeScheda.calcolatore_acqua.quota_acqua_eccedente.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Se siamo sulla Carta #47 -> Mostra la Checklist dei 23 controlli della Nota Esplicativa */}
                    {currentCard.numero_codice === '47' && (
                      <div className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-amber-800" />
                            <h5 className="text-xs font-extrabold uppercase text-amber-950">
                              Sotto-Checklist Verifiche Nota Esplicativa (23 Controlli Modello 5)
                            </h5>
                          </div>
                          <span className="text-xs font-bold text-amber-900">
                            {activeScheda.nota_esplicativa_checks.filter((c) => c.fatto).length}/
                            {activeScheda.nota_esplicativa_checks.length} spuntati
                          </span>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                          {activeScheda.nota_esplicativa_checks.map((item, idx) => (
                            <div
                              key={item.codice}
                              className="bg-white p-2.5 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <label className="flex items-center gap-2 cursor-pointer flex-1">
                                <input
                                  type="checkbox"
                                  checked={item.fatto}
                                  onChange={() => handleToggleNotaCheck(idx)}
                                  className="w-4 h-4 rounded text-emerald-600"
                                />
                                <span
                                  className={`text-xs font-semibold ${
                                    item.fatto ? 'line-through text-slate-400' : 'text-slate-800'
                                  }`}
                                >
                                  {item.titolo}
                                </span>
                              </label>
                              <input
                                type="text"
                                placeholder="Annotazione nota..."
                                value={item.note || ''}
                                onChange={(e) => {
                                  const nextChecks = activeScheda.nota_esplicativa_checks.map(
                                    (c, i) => (i === idx ? { ...c, note: e.target.value } : c)
                                  );
                                  replaceSchedaInState({
                                    ...activeScheda,
                                    nota_esplicativa_checks: nextChecks,
                                  });
                                  scheduleHeaderAutoSave(activeScheda.id, {
                                    nota_esplicativa_checks: nextChecks,
                                  });
                                }}
                                onBlur={(e) => handleNotaCheckNoteChange(idx, e.target.value)}
                                className="sm:w-52 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Se siamo sulla Carta #48 -> Mostra l'anteprima della Numerazione Pagine con spunta "Predisposto" */}
                    {currentCard.numero_codice === '48' && (() => {
                      const docInclusi = activeScheda.documenti_allegati.filter((d) => d.incluso);
                      const predispostiCount = docInclusi.filter(
                        (d) => currentCard.campi_extra?.[`__doc_predisposto_${d.id_riga}`] === 'true',
                      ).length;

                      const toggleDocPredisposto = (idRiga: number, nextChecked: boolean) => {
                        const key = `__doc_predisposto_${idRiga}`;
                        const newExtra: Record<string, string> = {
                          ...(currentCard.campi_extra || {}),
                          [key]: nextChecked ? 'true' : 'false',
                        };
                        replaceSchedaInState({
                          ...activeScheda,
                          passi: activeScheda.passi.map((p) =>
                            p.id === currentCard.id ? { ...p, campi_extra: newExtra } : p,
                          ),
                        });
                        handleUpdatePassoField(currentCard, { campi_extra: newExtra });
                      };

                      return (
                        <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Printer className="w-4 h-4 text-indigo-700" />
                              <h5 className="text-xs font-extrabold uppercase text-indigo-950">
                                Quadro Numerazione Pagine Fascicolo ({activeScheda.totale_pagine_fascicolo} pag. totali)
                              </h5>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                  predispostiCount === docInclusi.length && docInclusi.length > 0
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                }`}
                              >
                                {predispostiCount}/{docInclusi.length} predisposti
                              </span>
                              <button
                                type="button"
                                onClick={() => setSubTab('allegati')}
                                className="text-xs font-bold text-indigo-700 underline hover:text-indigo-900"
                              >
                                Apri tabella a schermo intero
                              </button>
                            </div>
                          </div>
                          <div className="max-h-72 overflow-y-auto bg-white rounded-xl border border-indigo-100 divide-y divide-slate-100 text-xs">
                            {docInclusi.map((d) => {
                              const isPredisposto =
                                currentCard.campi_extra?.[`__doc_predisposto_${d.id_riga}`] === 'true';
                              return (
                                <label
                                  key={d.id_riga}
                                  className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                    isPredisposto
                                      ? 'bg-emerald-50/70 hover:bg-emerald-50'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isPredisposto}
                                      onChange={(e) => toggleDocPredisposto(d.id_riga, e.target.checked)}
                                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                      title={
                                        isPredisposto
                                          ? 'Segna documento come non predisposto'
                                          : 'Segna documento come predisposto'
                                      }
                                    />
                                    <span
                                      className={`font-semibold truncate ${
                                        isPredisposto
                                          ? 'text-emerald-900 line-through decoration-emerald-500/70'
                                          : 'text-slate-800'
                                      }`}
                                    >
                                      All. #{d.numero_allegato} — {d.titolo}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isPredisposto && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                                        Predisposto
                                      </span>
                                    )}
                                    <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                                      1° pag: {d.prima_pagina} ({d.pagine_documento} pag.)
                                    </span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Se siamo sulla Carta #54 -> Mostra i pulsanti rapidi per copiare o modificare i Prompt NotebookLM */}
                    {currentCard.numero_codice === '54' && (
                      <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-purple-700" />
                          <div>
                            <div className="text-xs font-extrabold uppercase text-purple-950">
                              Prompt AI per NotebookLM Pronti
                            </div>
                            <div className="text-xs text-purple-800">
                              Apri la finestra per visualizzare e modificare i testi dei prompt oppure copiali con un clic
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={openPromptsModal}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                            title="Apri la finestra per leggere e modificare i testi dei prompt NotebookLM"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Apri / Modifica Testi Prompt
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(effectivePromptSlide, 'slide')}
                            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copia Prompt Slide
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(effectivePromptPodcast, 'podcast')}
                            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copia Prompt Podcast
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Banner unificato Fase Assemblea & Post-Assemblea (Passi 58–62 gestiti in Gestione Assemblee) */}
                    {['57', '58', '59', '60', '61', '62'].includes(String(currentCard.numero_codice).trim()) && (
                      <div className="bg-gradient-to-r from-indigo-950 via-purple-950 to-indigo-900 border-2 border-indigo-400/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-white shadow-md">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                                {String(currentCard.numero_codice).trim() === '57'
                                  ? 'Passaggio a Gestione Assemblee (Dopo Passo #57)'
                                  : `Fase Post-Assemblea Unificata • Passo #${currentCard.numero_codice}`}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/40 text-indigo-100 border border-indigo-400/50">
                                Sincronizzato con Gestione Assemblee
                              </span>
                            </div>
                            <div className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                              Completati i punti fino al <strong>#57</strong>, la fase post-assemblea dai punti{' '}
                              <strong>#58 a #62</strong> (Stampa registro, Firma Presidente, Invio verbale ai condomini, Delibere e Archiviazione) è unificata nella procedura <strong>Gestione Assemblee</strong> con data, ora, luogo e scaletta unica.
                            </div>
                          </div>
                        </div>
                        {onOpenGestioneAssemblee && (
                          <button
                            type="button"
                            onClick={() => onOpenGestioneAssemblee(activeScheda.condominio_id)}
                            className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
                          >
                            <Users className="w-4 h-4" />
                            <span>Vai a Gestione Assemblee (Passi 58–62) →</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Se siamo sulla Carta #57 (100% Pre-Assemblea) o #62 (Chiusura Post-Assemblea) -> Mostra il Box Stampa Foglio di Riassunto PDF */}
                    {(currentCard.numero_codice === '57' || currentCard.numero_codice === '62') && (
                      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Printer className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-extrabold uppercase text-emerald-950">
                              {currentCard.numero_codice === '57'
                                ? 'Fine Fase Pre-Assemblea (100%) • Foglio di Riassunto PDF'
                                : 'Chiusura Definitiva Procedura • Foglio di Riassunto PDF'}
                            </div>
                            <div className="text-xs text-emerald-800">
                              Stampa o scarica in PDF il riepilogo completo di tutti i dati immessi, calcoli, allegati e note di questo condominio.
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowSummaryModal(true)}
                            className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-700" />
                            Anteprima Foglio Riassunto
                          </button>
                          <button
                            type="button"
                            disabled={isGeneratingPdf}
                            onClick={handleDownloadRiepilogoPdf}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-60"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {isGeneratingPdf ? 'Generazione PDF...' : 'Stampa / Scarica PDF (.pdf)'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 3. Note / Appunti Operativi su questo Passaggio */}
                    <div className="pt-1">
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-600" />
                        Note / Appunti Operativi su questo Passaggio
                      </label>
                      <textarea
                        rows={2}
                        value={currentCard.note_passo || ''}
                        placeholder="Annota qui eventuali particolarità, importi da verificare o promemoria relativi a questo passaggio..."
                        onChange={(e) => {
                          const val = e.target.value;
                          const nextPassi = activeScheda.passi.map((p) =>
                            p.id === currentCard.id ? { ...p, note_passo: val } : p
                          );
                          replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                          schedulePassoAutoSave(activeScheda.id, currentCard.id, {
                            note_passo: val,
                          });
                        }}
                        onBlur={(e) =>
                          handleUpdatePassoField(currentCard, { note_passo: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* FOOTER DEL PASSAGGIO: AZIONI DI SPUNTA E SFOGLIA SEQUENZIALE */}
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={currentCardIndex === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToCard(currentCardIndex - 1, 'prev')}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-40 disabled:pointer-events-none transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Indietro
                  </button>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Bottone Spunta/Togli spunta restando sul passaggio */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleTogglePasso(currentCard)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                        currentCard.fatto
                          ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      {currentCard.fatto ? 'Segna come Da Fare' : 'Spunta Passaggio'}
                    </button>

                    {/* CTA Principale: Spunta come Fatto e Vai al Passaggio Successivo! */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleCompleteAndNext(currentCard)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm transition cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      Completa e Vai al Passaggio Successivo
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* STRISCIA DI ANTEPRIMA PASSAGGI ADIACENTI (CAROSELLO SEQUENZIALE) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                <span>Sequenza Passaggi Adiacenti</span>
                <span>Clicca un passaggio per aprirlo</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {nearbyCards.map((c) => {
                  const idx = activeScheda.passi.findIndex((p) => p.id === c.id);
                  const active = idx === currentCardIndex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => goToCard(idx, idx >= currentCardIndex ? 'next' : 'prev')}
                      className={`group relative p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-20 ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm scale-[1.02]'
                          : c.fatto
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 hover:bg-emerald-100/70'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-[11px] font-mono font-extrabold ${
                            active ? 'text-amber-300' : c.fatto ? 'text-emerald-700' : 'text-indigo-700'
                          }`}
                        >
                          #{c.numero_codice}
                        </span>
                        {c.fatto && (
                          <Check
                            className={`w-3.5 h-3.5 stroke-[3] ${
                              active ? 'text-emerald-300' : 'text-emerald-600'
                            }`}
                          />
                        )}
                      </div>
                      <div
                        className={`text-[11px] leading-tight line-clamp-2 font-medium ${
                          active ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {c.descrizione}
                      </div>

                      {/* Finestrella al passaggio del mouse con la scritta completa */}
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 sm:w-72 bg-slate-900 text-white text-xs font-medium p-3 rounded-xl shadow-2xl border border-indigo-400/60 pointer-events-none whitespace-normal break-words leading-relaxed text-left">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 mb-1">
                          <span>Passo #{c.numero_codice} (Passaggio {idx + 1} di {activeScheda.passi.length})</span>
                          {c.fatto && <span className="text-emerald-400">✓ Fatto</span>}
                        </div>
                        <div className="text-white font-semibold">{c.descrizione}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: DOCUMENTI DA ALLEGARE AL RENDICONTO (CALCOLO PAGINE R66-R85)
         ===================================================================== */}
      {subTab === 'allegati' && (() => {
        const passo48 = activeScheda.passi.find((p) => p.numero_codice === '48');
        const docInclusiAll = activeScheda.documenti_allegati.filter((d) => d.incluso);
        const predispostiAllCount = docInclusiAll.filter(
          (d) => passo48?.campi_extra?.[`__doc_predisposto_${d.id_riga}`] === 'true',
        ).length;

        const toggleAllegatoPredisposto = (idRiga: number, nextChecked: boolean) => {
          if (!passo48) return;
          const key = `__doc_predisposto_${idRiga}`;
          const newExtra: Record<string, string> = {
            ...(passo48.campi_extra || {}),
            [key]: nextChecked ? 'true' : 'false',
          };
          replaceSchedaInState({
            ...activeScheda,
            passi: activeScheda.passi.map((p) =>
              p.id === passo48.id ? { ...p, campi_extra: newExtra } : p,
            ),
          });
          handleUpdatePassoField(passo48, { campi_extra: newExtra });
        };

        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Barra superiore rapida per tornare al passaggio */}
            <div className="bg-indigo-950 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSubTab('scaletta')}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white text-indigo-950 hover:bg-indigo-50 font-extrabold text-xs shadow-sm transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-indigo-700" />
                <span>
                  Torna al Passaggio #{currentCard?.numero_codice || '48'}
                  {currentCard?.descrizione ? ` (${currentCard.descrizione.slice(0, 42)}...)` : ''}
                </span>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-indigo-200">
                  Documenti predisposti:{' '}
                  <strong className="text-emerald-300">
                    {predispostiAllCount}/{docInclusiAll.length}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => jumpToStepByCode('48')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-white font-bold text-xs border border-indigo-600 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Vai al Passo #48</span>
                </button>
              </div>
            </div>

            <div className="p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Righe 65-85 • Colonne L-R di Modello 5
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  DOCUMENTI DA ALLEGARE AL RENDICONTO (Numerazione Automatica Pagine)
                </h3>
                <p className="text-sm text-slate-500">
                  Spunta a sinistra i documenti man mano che vengono predisposti. Il numero di prima
                  pagina (<strong>n.1° pag</strong>) e il progressivo allegato (<strong>n.</strong>)
                  si aggiornano automaticamente.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-right">
                  <div className="text-xs text-emerald-700 font-semibold uppercase">
                    Doc. Predisposti
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-900">
                    {predispostiAllCount} / {docInclusiAll.length}
                  </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-right">
                  <div className="text-xs text-indigo-700 font-semibold uppercase">
                    Totale Pagine Fascicolo
                  </div>
                  <div className="text-2xl font-extrabold text-indigo-950">
                    {activeScheda.totale_pagine_fascicolo} pagine
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 text-center w-28 bg-emerald-900/60 text-emerald-200">
                      Predisposto
                    </th>
                    <th className="py-3 px-4 text-center w-20">n. (All.)</th>
                    <th className="py-3 px-4 text-center w-24">Incluso</th>
                    <th className="py-3 px-4">DOCUMENTI DA ALLEGARE AL RENDICONTO</th>
                    <th className="py-3 px-4 text-center">Rif. Scaletta</th>
                    <th className="py-3 px-4 text-center w-32 bg-amber-500/20 text-amber-200">
                      n. 1° pag
                    </th>
                    <th className="py-3 px-4 text-center w-36 bg-indigo-500/20 text-indigo-200">
                      pag doc
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {activeScheda.documenti_allegati.map((doc) => {
                    // Estrai i codici passo dal riferimento (es. "Passo 47", "Passi 46 + 33")
                    const matches = doc.riferimento_passo.match(/\b\d+[ab]?\b/g) || [];
                    const stepCodes = Array.from(new Set(matches));
                    const isMultiStep = stepCodes.length > 1;
                    const isPredisposto =
                      passo48?.campi_extra?.[`__doc_predisposto_${doc.id_riga}`] === 'true';

                    return (
                      <tr
                        key={doc.id_riga}
                        className={
                          !doc.incluso
                            ? 'bg-slate-50/60 text-slate-400 hover:bg-slate-100/60'
                            : isPredisposto
                              ? 'bg-emerald-50/60 hover:bg-emerald-50'
                              : 'bg-white hover:bg-slate-50'
                        }
                      >
                        {/* Spunta documento predisposto (a sinistra di ogni riga) */}
                        <td className="py-3 px-4 text-center">
                          {doc.incluso ? (
                            <label className="inline-flex items-center justify-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isPredisposto}
                                onChange={(e) =>
                                  toggleAllegatoPredisposto(doc.id_riga, e.target.checked)
                                }
                                className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <span
                                className={`text-xs font-bold ${
                                  isPredisposto ? 'text-emerald-800' : 'text-slate-400'
                                }`}
                              >
                                {isPredisposto ? 'Sì' : 'No'}
                              </span>
                            </label>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Numero progressivo allegato (colonna L/M di Excel) */}
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          {doc.numero_allegato > 0 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-extrabold shadow-sm">
                              {doc.numero_allegato}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">0</span>
                          )}
                        </td>

                        {/* Stato Incluso (colonna M di Excel) */}
                        <td className="py-3 px-4 text-center">
                          {doc.incluso ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              1 (Sì)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-500">
                              0 (No)
                            </span>
                          )}
                        </td>

                        {/* Titolo documento (colonna N di Excel) */}
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <span
                            className={
                              isPredisposto && doc.incluso
                                ? 'text-emerald-900 line-through decoration-emerald-500/70'
                                : ''
                            }
                          >
                            {doc.titolo}
                          </span>
                        </td>

                        {/* Riferimento passo scaletta con navigazione diretta */}
                        <td className="py-3 px-4 text-center text-xs font-mono">
                          {stepCodes.length === 0 ? (
                            <span className="text-slate-400 italic">{doc.riferimento_passo}</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {stepCodes.map((code) => (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => jumpToStepByCode(code)}
                                  title={`Vai al Passaggio #${code}`}
                                  className="px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 transition"
                                >
                                  <span>Passo #{code}</span>
                                  <ArrowRight className="w-3 h-3 text-indigo-500" />
                                </button>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Prima pagina (colonna Q di Excel: n. 1° pag) */}
                        <td className="py-3 px-4 text-center font-mono font-extrabold text-base text-amber-700 bg-amber-50/40">
                          {doc.incluso ? (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-100/70 text-amber-900 border border-amber-300">
                              pag. {doc.prima_pagina}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* Pagine documento (colonna R di Excel: pag doc) con editing diretto */}
                        <td className="py-3 px-4 text-center bg-indigo-50/30">
                          {doc.fisso ? (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-mono text-xs font-bold">
                              1 (Fisso)
                            </span>
                          ) : !isMultiStep && stepCodes.length === 1 ? (
                            // Modifica diretta del singolo passo collegato
                            (() => {
                              const passoCollegato = activeScheda.passi.find(
                                (p) => p.numero_codice.toLowerCase() === stepCodes[0].toLowerCase(),
                              );
                              if (!passoCollegato) {
                                return (
                                  <span className="font-mono font-bold text-slate-800">
                                    {doc.pagine_documento}
                                  </span>
                                );
                              }
                              return (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={passoCollegato.num_pagine || 0}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                      const nextPassi = activeScheda.passi.map((p) =>
                                        p.id === passoCollegato.id ? { ...p, num_pagine: val } : p,
                                      );
                                      replaceSchedaInState({ ...activeScheda, passi: nextPassi });
                                      schedulePassoAutoSave(activeScheda.id, passoCollegato.id, {
                                        num_pagine: val,
                                      });
                                    }}
                                    onBlur={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                      handleUpdatePassoField(passoCollegato, { num_pagine: val });
                                    }}
                                    className="w-16 text-center font-mono font-extrabold text-sm py-1 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-600 text-indigo-950 shadow-inner"
                                  />
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    pag.
                                  </span>
                                </div>
                              );
                            })()
                          ) : isMultiStep ? (
                            // Documento composito (es. D53 + D38 per Passo 46 e Passo 33)
                            <div className="space-y-1">
                              <div className="font-mono font-extrabold text-sm text-indigo-950">
                                {doc.pagine_documento} pag. totali
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono flex items-center justify-center gap-2">
                                {stepCodes.map((code) => {
                                  const pCol = activeScheda.passi.find(
                                    (p) => p.numero_codice.toLowerCase() === code.toLowerCase(),
                                  );
                                  return (
                                    <span
                                      key={code}
                                      className="bg-white px-1.5 py-0.5 rounded border border-slate-200"
                                    >
                                      P.{code}: <strong>{pCol?.num_pagine || 0}</strong>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-slate-800">
                              {doc.pagine_documento}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Barra inferiore per tornare al passaggio */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSubTab('scaletta')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Torna al Passaggio #{currentCard?.numero_codice || '48'}</span>
              </button>
              <span className="text-xs font-semibold text-slate-500">
                Totale fascicolo: <strong>{activeScheda.totale_pagine_fascicolo} pagine</strong> •{' '}
                Predisposti: <strong>{predispostiAllCount}/{docInclusiAll.length}</strong>
              </span>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          TAB 3: NOTA ESPLICATIVA CHECKS & CALCOLATORE ACQUA ECCEDENTE
         ===================================================================== */}
      {subTab === 'nota_acqua' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonna Sinistra (5 cols): Calcolatore Acqua Eccedente (O17:P23) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-sky-900 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Droplets className="w-5 h-5 text-sky-300" />
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider">
                      Calcolatore Acqua Eccedente
                    </h3>
                    <p className="text-xs text-sky-200">
                      Celle O17:P23 di Modello 5 (Passo 15b Contatori Acqua)
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Consumo dei contabilizzatori (mc) [Cella P17]
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={activeScheda.calcolatore_acqua.consumo_contabilizzatori}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0');
                      handleUpdateSchedaHeader({ acqua_consumo_contabilizzatori: val });
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    mc delle fatture (mc) [Cella P18]
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={activeScheda.calcolatore_acqua.mc_fatture}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0');
                      handleUpdateSchedaHeader({ acqua_mc_fatture: val });
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Costo fatture H2O (€) [Cella P21]
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={activeScheda.calcolatore_acqua.costo_fatture_h2o}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || '0');
                      handleUpdateSchedaHeader({ acqua_costo_fatture: val });
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-600 font-medium">
                      mc oltre le letture (<code>=P18-P17</code>):
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {activeScheda.calcolatore_acqua.mc_oltre_letture} mc
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-600 font-medium">
                      Costo al mc (<code>=P21/P18</code>):
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      € {activeScheda.calcolatore_acqua.costo_al_mc.toFixed(4)} / mc
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between p-4 rounded-xl border ${
                      activeScheda.calcolatore_acqua.soglia_eccedenza_superata
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold uppercase">
                        Quota Acqua Eccedente (<code>=IF(P19&lt;50, 0, P22*P19)</code>)
                      </div>
                      <div className="text-[11px] opacity-80">
                        {activeScheda.calcolatore_acqua.soglia_eccedenza_superata
                          ? 'Eccedenza >= 50 mc: da ripartire'
                          : 'Eccedenza < 50 mc: quota azzerata (0 €)'}
                      </div>
                    </div>
                    <div className="text-xl font-mono font-extrabold">
                      € {activeScheda.calcolatore_acqua.quota_acqua_eccedente.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Colonna Destra (7 cols): Checklist Nota Esplicativa & Senza Periodo Gestito */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-4">
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Controlli Nota Esplicativa &quot;DA FARE / SENZA PERIODO GESTITO&quot;
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Righe 54-62 e 70-89 di Modello 5: spunta le verifiche inserite nella Nota
                  Esplicativa
                </p>
              </div>

              <div className="p-5 space-y-6">
                {Object.entries(notaChecksPerGruppo).map(([gruppo, items]) => (
                  <div key={gruppo} className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                      {gruppo}
                    </h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {items.map(({ item, index }) => (
                        <div
                          key={item.codice}
                          className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            item.fatto ? 'bg-emerald-50/40' : 'bg-white'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={item.fatto}
                              onChange={() => handleToggleNotaCheck(index)}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span
                              className={`text-sm font-medium ${
                                item.fatto ? 'line-through text-slate-400' : 'text-slate-800'
                              }`}
                            >
                              {item.titolo}
                            </span>
                          </label>
                          <input
                            type="text"
                            placeholder="Note / dettagli per Nota Esplicativa..."
                            value={item.note || ''}
                            onChange={(e) => {
                              const nextChecks = activeScheda.nota_esplicativa_checks.map(
                                (c, idx) => (idx === index ? { ...c, note: e.target.value } : c)
                              );
                              replaceSchedaInState({
                                ...activeScheda,
                                nota_esplicativa_checks: nextChecks,
                              });
                              scheduleHeaderAutoSave(activeScheda.id, {
                                nota_esplicativa_checks: nextChecks,
                              });
                            }}
                            onBlur={(e) => handleNotaCheckNoteChange(index, e.target.value)}
                            className="sm:w-64 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PROMPT AI NOTEBOOK LM (SLIDE & PODCAST - RIGHE 95-99)
         ===================================================================== */}
      {subTab === 'prompts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PROMPT SLIDE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                  Passo 54 • Cella E95-E96
                </span>
                <h3 className="text-base font-bold mt-1">
                  PROMPT SLIDE / INFOGRAFICA (Presentazione Assemblea NotebookLM)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPromptsModal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Modifica Testi
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(effectivePromptSlide, 'slide')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer"
                >
                  {copiedPrompt === 'slide' ? (
                    <>
                      <Check className="w-4 h-4" /> Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copia Prompt Slide
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-5 flex-1 bg-slate-50">
              <pre className="whitespace-pre-wrap text-xs text-slate-800 font-sans leading-relaxed bg-white p-4 rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto">
                {effectivePromptSlide}
              </pre>
            </div>
          </div>

          {/* PROMPT PODCAST */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-purple-900 to-slate-900 text-white p-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-purple-400/20 text-purple-200 font-semibold">
                  Passo 54 • Cella E98-E99
                </span>
                <h3 className="text-base font-bold mt-1">
                  PROMPT PODCAST (Audio Informativo Residenti NotebookLM)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPromptsModal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Modifica Testi
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(effectivePromptPodcast, 'podcast')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-400 hover:bg-purple-300 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer"
                >
                  {copiedPrompt === 'podcast' ? (
                    <>
                      <Check className="w-4 h-4" /> Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copia Prompt Podcast
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-5 flex-1 bg-slate-50">
              <pre className="whitespace-pre-wrap text-xs text-slate-800 font-sans leading-relaxed bg-white p-4 rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto">
                {effectivePromptPodcast}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* FINESTRA MODALE PER VISUALIZZARE E MODIFICARE I TESTI DEI PROMPT NOTEBOOKLM (PASSAGGIO #54) */}
      {showPromptsModal && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPromptsModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Finestra Prompt */}
            <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 text-white px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                      Passaggio #54
                    </span>
                    <span className="text-xs text-purple-200 font-medium">
                      {activeScheda.condominio_nome} ({activeScheda.gestione})
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight mt-0.5">
                    Testi dei Prompt AI per NotebookLM (Personalizzabili)
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptsModal(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Chiudi finestra"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo Finestra con i due editor di testo affiancati */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Editor 1: Prompt Slide / Infografica */}
              <div className="bg-white rounded-2xl border-2 border-indigo-200 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      Prompt 1 • Infografica & Slide
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-1">
                      Prompt Slide / Infografica Bilancio Consuntivo
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDraftPromptSlide(PROMPT_SLIDE_NOTEBOOKLM)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Ripristina il testo predefinito per le Slide"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSavePrompts(draftPromptSlide, draftPromptPodcast, false);
                        copyToClipboard(draftPromptSlide, 'slide');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      {copiedPrompt === 'slide' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copiato!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salva e Copia
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={14}
                  value={draftPromptSlide}
                  onChange={(e) => setDraftPromptSlide(e.target.value)}
                  placeholder="Inserisci o modifica il testo del prompt per creare l'Infografica / Presentazione Slide su NotebookLM..."
                  className="w-full flex-1 p-3.5 text-xs leading-relaxed font-sans text-slate-900 bg-slate-50/70 border border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white resize-y"
                />
              </div>

              {/* Editor 2: Prompt Podcast / Audio Overview */}
              <div className="bg-white rounded-2xl border-2 border-purple-200 p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      Prompt 2 • Audio Overview
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-1">
                      Prompt Podcast Informativo per i Condomini
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDraftPromptPodcast(PROMPT_PODCAST_NOTEBOOKLM)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Ripristina il testo predefinito per il Podcast"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSavePrompts(draftPromptSlide, draftPromptPodcast, false);
                        copyToClipboard(draftPromptPodcast, 'podcast');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      {copiedPrompt === 'podcast' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copiato!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salva e Copia
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={14}
                  value={draftPromptPodcast}
                  onChange={(e) => setDraftPromptPodcast(e.target.value)}
                  placeholder="Inserisci o modifica il testo del prompt per generare il Podcast su NotebookLM..."
                  className="w-full flex-1 p-3.5 text-xs leading-relaxed font-sans text-slate-900 bg-slate-50/70 border border-purple-200 rounded-xl focus:outline-none focus:border-purple-600 focus:bg-white resize-y"
                />
              </div>
            </div>

            {/* Footer Finestra Prompt */}
            <div className="bg-white px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftPromptSlide(PROMPT_SLIDE_NOTEBOOKLM);
                  setDraftPromptPodcast(PROMPT_PODCAST_NOTEBOOKLM);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ripristina Entrambi i Testi Predefiniti
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPromptsModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                >
                  Chiudi
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePrompts(draftPromptSlide, draftPromptPodcast, true)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-extrabold shadow-sm transition cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Salva Modifiche Prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ANTEPRIMA E STAMPA FOGLIO DI RIASSUNTO PROCEDURA (PDF) */}
      {showSummaryModal && (() => {
        const getStepByCode = (code: string) =>
          activeScheda.passi.find((p) => String(p.numero_codice).toLowerCase() === code.toLowerCase());

        const p6 = getStepByCode('6');
        const p8 = getStepByCode('8');
        const p15b = getStepByCode('15b');
        const p24 = getStepByCode('24');
        const p30 = getStepByCode('30');
        const p31 = getStepByCode('31');
        const p33 = getStepByCode('33');
        const p36 = getStepByCode('36');
        const p38 = getStepByCode('38');
        const p39 = getStepByCode('39');
        const p43 = getStepByCode('43');
        const p48 = getStepByCode('48');
        const p51 = getStepByCode('51');
        const p52 = getStepByCode('52');
        const p53 = getStepByCode('53');

        const stepsToDisplay = summaryOnlyFilled
          ? activeScheda.passi.filter((p) => {
              const hasExtra = Object.entries(p.campi_extra || {}).some(
                ([k, v]) => !k.startsWith('__') && String(v || '').trim() !== ''
              );
              const hasNote = Boolean(String(p.note_passo || '').trim());
              return p.fatto || hasExtra || hasNote || (p.ha_pagine && p.num_pagine > 0);
            })
          : activeScheda.passi;

        const docInclusi = (activeScheda.documenti_allegati || []).filter((d) => d.incluso);
        const notaChecks = activeScheda.nota_esplicativa_checks || [];

        return (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              {/* Header Finestra Riassunto */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        FOGLIO DI RIASSUNTO PROCEDURA • {activeScheda.percentuale_fatto}% ESEGUITO
                      </span>
                      <span className="text-xs text-slate-300 font-mono">
                        {activeScheda.procedura_codice}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold">
                      Riepilogo Completo: {activeScheda.condominio_nome} ({activeScheda.gestione})
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Toggle Filtro Tutti / Solo Compilati */}
                  <button
                    type="button"
                    onClick={() => setSummaryOnlyFilled((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      summaryOnlyFilled
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                    }`}
                  >
                    {summaryOnlyFilled ? 'Mostra: Solo Passi Compilati' : 'Mostra: Tutti i 63 Passi'}
                  </button>

                  {/* Stampa Diretta / Salva in PDF dal Browser */}
                  <button
                    type="button"
                    onClick={handlePrintRiepilogoWindow}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-extrabold transition shadow-xs cursor-pointer"
                    title="Apre la finestra di stampa A4 diretta (stampante o Salva come PDF)"
                  >
                    <Printer className="w-4 h-4 text-indigo-700" />
                    <span>Stampa Diretta A4</span>
                  </button>

                  {/* Scarica / Apri PDF Ufficiale fpdf2 */}
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadRiepilogoPdf}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 text-xs font-black transition shadow-sm cursor-pointer disabled:opacity-60"
                    title="Genera e scarica il file PDF ufficiale A4 con tutti i dati immessi e le note"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isGeneratingPdf ? 'Generazione PDF...' : 'Scarica / Apri PDF (.pdf)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                    title="Chiudi anteprima"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Corpo Stampabile A4 del Foglio di Riassunto */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100">
                <div
                  id="printable-riepilogo-procedura"
                  className="bg-white max-w-5xl mx-auto rounded-2xl border border-slate-300 shadow-sm p-5 sm:p-8 space-y-6 text-slate-900"
                >
                  {/* 1. INTESTAZIONE FOGLIO DI RIASSUNTO */}
                  <div className="border-b-2 border-slate-900 pb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-700">
                        STUDIO SERRA • {activeScheda.procedura_codice} (MODELLO 5)
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-950 mt-0.5">
                        FOGLIO DI RIASSUNTO PROCEDURA CONDOMINIO
                      </h1>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Stampato il {new Date().toLocaleDateString('it-IT')} alle{' '}
                        {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-lg text-xs font-black border ${
                          Number(activeScheda.percentuale_fatto) >= 100
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}
                      >
                        AVANZAMENTO PRE-ASSEMBLEA (1–57): {activeScheda.percentuale_fatto}% (
                        {activeScheda.passi_completati}/{activeScheda.totale_passi})
                      </span>
                      <div className="text-xs font-bold text-slate-700 mt-1">
                        Fase Post-Assemblea (Passi 58–62):{' '}
                        {activeScheda.post_assemblea_completati ?? 0}/
                        {activeScheda.post_assemblea_totale ?? 5}{' '}
                        {activeScheda.in_attesa_assemblea ? '• IN ATTESA DI ASSEMBLEA' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Griglia Dati Condominio e Testata */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        Condominio
                      </span>
                      <span className="font-extrabold text-sm text-slate-950">
                        {activeScheda.condominio_nome}
                      </span>
                      {activeScheda.condominio_codice_danea && (
                        <span className="ml-1.5 font-mono text-indigo-700 font-bold">
                          ({activeScheda.condominio_codice_danea})
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        Gestione / Esercizio
                      </span>
                      <span className="font-extrabold text-slate-900">{activeScheda.gestione}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        IBAN Condominio
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeScheda.condominio_iban || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        Fatto il (Chiusura) / Operatore
                      </span>
                      <span className="font-bold text-slate-900">
                        {activeScheda.fatto_il || 'In corso'} • Op. {activeScheda.chi_lo_fa_default}
                      </span>
                    </div>
                    {activeScheda.note_intestazione && (
                      <div className="sm:col-span-4 pt-2 border-t border-slate-200">
                        <span className="text-[10px] font-extrabold uppercase text-amber-800 mr-2">
                          NOTE DI TESTATA BILANCIO:
                        </span>
                        <span className="font-semibold text-slate-900">
                          {activeScheda.note_intestazione}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 2. QUADRO SINTETICO DATI CHIAVE E CALCOLI */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white bg-slate-900 px-3 py-1.5 rounded-lg">
                      1. Quadro Sintetico Dati Contabili, Calcoli e Assemblea
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Convocazione Assemblea (Passi 51-53) */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Convocazione Assemblea Ordinaria (Passi #51–53)
                        </div>
                        <div className="space-y-0.5 text-slate-700">
                          <div>
                            <strong>Data e Ora:</strong>{' '}
                            {p51?.campi_extra?.['Data assemblea'] ||
                              p52?.campi_extra?.['Data assemblea'] ||
                              '—'}{' '}
                            ore{' '}
                            {p51?.campi_extra?.['Ora assemblea'] ||
                              p53?.campi_extra?.['Ora assemblea'] ||
                              '—'}
                          </div>
                          <div>
                            <strong>Sede / Luogo:</strong> {p51?.campi_extra?.['Sede / Luogo'] || '—'}
                          </div>
                          {p51?.note_passo && (
                            <div className="text-amber-900 bg-amber-50 px-2 py-0.5 rounded mt-1">
                              <strong>Nota #51:</strong> {p51.note_passo}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Saldi e Conto Corrente (Passi 30, 31, 36, 38) */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Quadratura Saldi e C/C (Passi #30, #31, #36, #38)
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-slate-700">
                          <div>
                            <strong>Saldo Finale #30:</strong>{' '}
                            {p30?.campi_extra?.['Saldo finale (€)'] || '—'}
                          </div>
                          <div>
                            <strong>Saldo Iniziale #31:</strong>{' '}
                            {p31?.campi_extra?.['Iniziale (€)'] || '—'}
                          </div>
                          <div>
                            <strong>Saldo C/C Fine #36:</strong>{' '}
                            {p36?.campi_extra?.['Saldo C/C fine esercizio (€)'] || '—'}
                          </div>
                          <div>
                            <strong>Differenza #38:</strong>{' '}
                            {p38?.campi_extra?.['Differenza da giustificare (€)'] || '—'}
                          </div>
                        </div>
                      </div>

                      {/* Compenso Gestione Inquilini (#8) & portale MioCondominio (#43) */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Gestione Inquilini (#8) & Portale MioCondominio (#43)
                        </div>
                        <div className="space-y-0.5 text-slate-700">
                          <div>
                            <strong>Compenso Inquilini (#8):</strong> N. unità:{' '}
                            {p8?.campi_extra?.['N. unità con gestione inquilino'] || '0'} × €{' '}
                            {p8?.campi_extra?.['Quota gestione per unità (€)'] || '0'} ={' '}
                            <strong className="text-emerald-800">
                              € {p8?.campi_extra?.['Compenso Gestione Inquilini (€)'] || '0,00'}
                            </strong>
                          </div>
                          <div>
                            <strong>Accessi MioCondominio (#43):</strong> Utenti:{' '}
                            {p43?.campi_extra?.['Utenti'] || '0'} • Accessi:{' '}
                            {p43?.campi_extra?.['Accessi'] || '0'} •{' '}
                            <strong>{p43?.campi_extra?.['% accessi'] || '—'}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Calcolatore Acqua (#15b) */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Calcolatore Eccedenza Acqua (Passo #15b)
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-slate-700">
                          <div>
                            <strong>Contabilizzatori:</strong>{' '}
                            {activeScheda.calcolatore_acqua?.consumo_contabilizzatori ?? 0} mc
                          </div>
                          <div>
                            <strong>MC Fatture:</strong>{' '}
                            {activeScheda.calcolatore_acqua?.mc_fatture ?? 0} mc
                          </div>
                          <div>
                            <strong>Eccedenza:</strong>{' '}
                            {activeScheda.calcolatore_acqua?.mc_oltre_letture ?? 0} mc (€{' '}
                            {activeScheda.calcolatore_acqua?.quota_acqua_eccedente ?? 0})
                          </div>
                          <div>
                            <strong>Costo Fatture H2O:</strong> €{' '}
                            {activeScheda.calcolatore_acqua?.costo_fatture_h2o ?? 0}
                          </div>
                        </div>
                        {p15b?.note_passo && (
                          <div className="text-amber-900 bg-amber-50 px-2 py-0.5 rounded mt-1">
                            <strong>Nota #15b:</strong> {p15b.note_passo}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Righe multiple: Assemblee Straordinarie (#6), Spese Personali (#24), Fondi (#33), Sinistri (#39) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Assemblee Straordinarie #6 */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Assemblee Straordinarie (Passo #6)
                        </div>
                        {(() => {
                          const rows: { d: string; o: string }[] = [];
                          const ex = p6?.campi_extra || {};
                          for (let i = 1; i <= 15; i++) {
                            const d = (
                              ex[i === 1 ? 'Data assemblea straord.' : `Data assemblea straord. ${i}`] || ''
                            ).trim();
                            const o = (ex[i === 1 ? 'Oggetto' : `Oggetto ${i}`] || '').trim();
                            if (d || o) rows.push({ d, o });
                          }
                          return rows.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {rows.map((r, i) => (
                                <li key={i}>
                                  <strong>{r.d || 'Data n.d.'}:</strong> {r.o || '—'}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-slate-400 italic">Nessuna assemblea straordinaria inserita</div>
                          );
                        })()}
                      </div>

                      {/* Spese Personali #24 */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Voci Spese Personali (Passo #24)
                        </div>
                        {(() => {
                          const rows: { v: string; e: string }[] = [];
                          const ex = p24?.campi_extra || {};
                          for (let i = 1; i <= 20; i++) {
                            const v = (
                              ex[i === 1 ? 'Voce spesa personale' : `Voce spesa personale ${i}`] || ''
                            ).trim();
                            const e = (ex[i === 1 ? 'Eseguito' : `Eseguito ${i}`] || '').trim();
                            if (v || e) rows.push({ v, e });
                          }
                          return rows.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {rows.map((r, i) => (
                                <li key={i}>
                                  {r.v} — <strong>Esito: {r.e || 'NO'}</strong>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-slate-400 italic">Nessuna voce spesa personale inserita</div>
                          );
                        })()}
                      </div>

                      {/* Fondi #33 */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Fondi di Accantonamento / Riserva (Passo #33)
                        </div>
                        {(() => {
                          const rows: { imp: string; nat: string }[] = [];
                          const ex = p33?.campi_extra || {};
                          for (let i = 1; i <= 15; i++) {
                            const imp = (
                              ex[i === 1 ? 'Importo Fondo (€)' : `Importo Fondo (€) ${i}`] || ''
                            ).trim();
                            const nat = (ex[i === 1 ? 'Natura Fondo' : `Natura Fondo ${i}`] || '').trim();
                            if (imp || nat) rows.push({ imp, nat });
                          }
                          return rows.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {rows.map((r, i) => (
                                <li key={i}>
                                  <strong>€ {r.imp || '0,00'}</strong> — {r.nat || '—'}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-slate-400 italic">Nessun fondo inserito</div>
                          );
                        })()}
                      </div>

                      {/* Sinistri #39 */}
                      <div className="border border-slate-200 rounded-xl p-3 bg-white">
                        <div className="font-extrabold text-indigo-900 uppercase text-[11px] mb-1">
                          Sinistri Assicurativi (Passo #39)
                        </div>
                        {(() => {
                          const rows: { d: string; o: string }[] = [];
                          const ex = p39?.campi_extra || {};
                          for (let i = 1; i <= 15; i++) {
                            const d = (ex[i === 1 ? 'Data sinistro' : `Data sinistro ${i}`] || '').trim();
                            const o = (
                              ex[i === 1 ? 'Oggetto sinistro' : `Oggetto sinistro ${i}`] || ''
                            ).trim();
                            if (d || o) rows.push({ d, o });
                          }
                          if (rows.length === 0 && ex['Data e Oggetto sinistri']) {
                            rows.push({ d: '', o: ex['Data e Oggetto sinistri'] });
                          }
                          return rows.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                              {rows.map((r, i) => (
                                <li key={i}>
                                  {r.d ? <strong>{r.d}: </strong> : null}
                                  {r.o || '—'}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-slate-400 italic">Nessun sinistro inserito</div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* 3. ELENCO COMPLETO PASSAGGI CON DATI IMMESSI E NOTE */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white bg-slate-900 px-3 py-1.5 rounded-lg">
                      2. Dettaglio Passaggi Procedura ({stepsToDisplay.length} passi visualizzati) — Dati Immessi e Note
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800">
                            <th className="border border-slate-300 px-2 py-1.5 w-12 text-center">#</th>
                            <th className="border border-slate-300 px-2 py-1.5 w-28">Stato / Data</th>
                            <th className="border border-slate-300 px-2.5 py-1.5">
                              Passaggio, Dati Immessi e Note Operative
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 w-20 text-center">
                              Op. / Pag.
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stepsToDisplay.map((p) => {
                            const visibleExtras = Object.entries(p.campi_extra || {}).filter(
                              ([k, v]) => !k.startsWith('__') && String(v || '').trim() !== ''
                            );
                            const isPostStep = ['58', '59', '60', '61', '62'].includes(
                              String(p.numero_codice)
                            );
                            return (
                              <tr
                                key={p.id}
                                className={
                                  p.fatto
                                    ? 'bg-white'
                                    : isPostStep
                                      ? 'bg-amber-50/40'
                                      : 'bg-rose-50/30'
                                }
                              >
                                <td className="border border-slate-300 px-2 py-1.5 font-mono font-black text-center text-indigo-950">
                                  #{p.numero_codice}
                                </td>
                                <td className="border border-slate-300 px-2 py-1.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                      p.fatto
                                        ? 'bg-emerald-100 text-emerald-900'
                                        : isPostStep
                                          ? 'bg-amber-100 text-amber-900'
                                          : 'bg-rose-100 text-rose-900'
                                    }`}
                                  >
                                    {p.fatto ? '✓ FATTO' : isPostStep ? 'POST-ASS.' : 'DA FARE'}
                                  </span>
                                  {p.data_spunta && (
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      {p.data_spunta}
                                    </div>
                                  )}
                                </td>
                                <td className="border border-slate-300 px-2.5 py-1.5 space-y-1">
                                  <div className="text-[10px] font-bold uppercase text-slate-400">
                                    {p.sezione}
                                  </div>
                                  <div className="font-bold text-slate-900">{p.descrizione}</div>

                                  {visibleExtras.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {visibleExtras.map(([k, v]) => (
                                        <span
                                          key={k}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-950 text-[11px]"
                                        >
                                          <strong className="font-bold">{k}:</strong>{' '}
                                          <span>{v}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {p.note_passo && String(p.note_passo).trim() !== '' && (
                                    <div className="mt-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-[11px]">
                                      <strong className="uppercase text-[10px] text-amber-800 mr-1.5">
                                        Nota Passo #{p.numero_codice}:
                                      </strong>
                                      <span className="font-semibold whitespace-pre-wrap">
                                        {p.note_passo}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="border border-slate-300 px-2 py-1.5 text-center text-[11px]">
                                  <div className="font-bold text-slate-700">
                                    Op: {p.chi_lo_fa || activeScheda.chi_lo_fa_default}
                                  </div>
                                  {p.ha_pagine && (
                                    <div className="font-mono font-bold text-amber-800 mt-0.5">
                                      {p.num_pagine} pag.
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 4. QUADRO NUMERAZIONE PAGINE FASCICOLO ALLEGATI (PASSO 48) */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white bg-slate-900 px-3 py-1.5 rounded-lg">
                      3. Quadro Numerazione Pagine Fascicolo Allegati ({activeScheda.totale_pagine_fascicolo} Pagine Totali)
                    </h4>
                    <table className="w-full text-xs border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800">
                          <th className="border border-slate-300 px-2 py-1 w-14 text-center">All.</th>
                          <th className="border border-slate-300 px-2.5 py-1">Documento Allegato</th>
                          <th className="border border-slate-300 px-2 py-1 w-28 text-center">
                            Predisposto
                          </th>
                          <th className="border border-slate-300 px-2 py-1 w-24 text-center">
                            1° Pagina
                          </th>
                          <th className="border border-slate-300 px-2 py-1 w-20 text-center">
                            N. Pagine
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {docInclusi.map((d) => {
                          const pred =
                            p48?.campi_extra?.[`__doc_predisposto_${d.id_riga}`] === 'true';
                          return (
                            <tr key={d.id_riga}>
                              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">
                                #{d.numero_allegato}
                              </td>
                              <td className="border border-slate-300 px-2.5 py-1 font-semibold">
                                {d.titolo}{' '}
                                <span className="text-[10px] text-slate-400">
                                  ({d.riferimento_passo})
                                </span>
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                                {pred ? '✓ SÌ' : '—'}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold text-indigo-900">
                                Pag. {d.prima_pagina}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-mono">
                                {d.pagine_documento}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 5. CONTROLLI NOTA ESPLICATIVA (PASSO 47) */}
                  {notaChecks.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white bg-slate-900 px-3 py-1.5 rounded-lg">
                        4. Controlli Nota Sintetica Esplicativa (Passo #47 — {notaChecks.filter((c) => c.fatto).length}/{notaChecks.length} Verificati)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        {notaChecks.map((c) => (
                          <div
                            key={c.codice}
                            className="border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-start justify-between gap-2"
                          >
                            <div>
                              <span className="font-mono font-bold text-indigo-800 mr-1">
                                [{c.codice}]
                              </span>
                              <span className="font-semibold text-slate-800">{c.titolo}</span>
                              {c.note && (
                                <div className="text-[11px] text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                                  Nota: {c.note}
                                </div>
                              )}
                            </div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                c.fatto
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {c.fatto ? '✓ OK' : 'NO'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Modal Riassunto */}
              <div className="bg-white px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Puoi scaricare il <strong>PDF Ufficiale (.pdf)</strong> oppure stampare direttamente su carta/PDF tramite <strong>Stampa Diretta A4</strong>.
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                  >
                    Chiudi
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintRiepilogoWindow}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Stampa Diretta A4
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadRiepilogoPdf}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-sm transition cursor-pointer disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" />
                    {isGeneratingPdf ? 'Generazione PDF...' : 'Scarica / Apri PDF Ufficiale (.pdf)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL NUOVA SCHEDA BILANCIO */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Nuova Gestione Successiva (Procedura 002)
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Chiude la gestione precedente e inizializza i 63 passaggi del Modello 5 per il nuovo
              esercizio, <strong>riportando automaticamente tutte le note e gli appunti</strong>{' '}
              compilati nei passi precedenti (sempre modificabili).
            </p>
            <form onSubmit={handleCreateScheda} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Condominio
                </label>
                <select
                  value={newCondominioId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setNewCondominioId(nextId);
                    const prev = [...schedeRef.current]
                      .reverse()
                      .find((s) => s.condominio_id === nextId);
                    if (prev) {
                      setNewGestione(computeNextYearGestione(prev.gestione));
                      setNewNote(prev.note_intestazione || '');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                >
                  {condomini.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.codice_danea})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Nuova Gestione / Esercizio
                </label>
                <input
                  type="text"
                  required
                  value={newGestione}
                  onChange={(e) => setNewGestione(e.target.value)}
                  placeholder="es. 01/01/2026 - 31/12/2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Note di testata (ereditate e modificabili)
                </label>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Note opzionali..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
                >
                  Crea Nuova Gestione con Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
