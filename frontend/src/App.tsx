import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock,
  Check,
  X,
  Trash2,
  Droplets,
  Flame,
  Landmark,
  FileText,
  Receipt,
  HelpCircle,
  Calendar,
  AlertCircle,
  Filter,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Smartphone,
  QrCode,
  Wifi,
  Users,
  Settings,
  MapPin,
  Send,
  FileSignature,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { AUTH_UNAUTHORIZED_EVENT, clearStoredToken, getStoredToken } from './auth';
import {
  ProceduraRendicontoView,
  ActiveRendicontoProgress,
  loadInitialSchede,
  saveSchedeToStorage,
  getRuntimeSchedeCache,
} from './components/ProceduraRendicontoView';
import {
  GestioneAssembleeView,
  AssembleaStraordinariaItem,
  readLocalAssembleeStraordinarie,
  writeLocalAssembleeStraordinarie,
  calcolaMetricheAssemblea,
  STORAGE_KEY_ASSEMBLEE_STRAORDINARIE,
  syncPassoAssembleaToRendiconto,
  POST_ASSEMBLEA_STEP_IDS,
  isAssembleaGiaSvolta,
  ensureAllOrdinarieInAssembleeList,
  deduplicateAssembleeList,
  formatDataAssembleaIt,
} from './components/GestioneAssembleeView';
import { ImpostazioniView } from './components/ImpostazioniView';
import { ReportSopralluoghiView } from './components/ReportSopralluoghiView';
import { MobileConnectModal } from './components/MobileConnectModal';
import {
  calcolaMetrichePassiRendiconto,
  getCustomPassiTemplate,
  saveCustomPassiTemplate,
  syncSchedaWithTemplate,
  CustomPassoTemplate,
} from './data/modello5Fallback';
import condominiStudioSerra from './data/condominiStudioSerra.json';

const API_BASE =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/assistente')
    ? '/assistente'
    : '';
const IS_EMBED_MODE =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('embed') === '1' ||
    window.location.pathname.startsWith('/assistente'));
const HIDE_SIDEBAR =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('hide_sidebar') === '1' ||
    new URLSearchParams(window.location.search).get('single_tab') === '1');
const DATA_SYNC_VERSION = '2026-10-18-v5';

type TabType = 'dashboard' | 'condomini' | 'rendiconto' | 'assemblee' | 'sopralluoghi' | 'impostazioni';

interface DocumentoNecessario {
  id: string;
  titolo: string;
  richiesto: boolean;
  richiesta_inviata?: boolean;
  data_richiesta_inviata?: string | null;
  recuperato: boolean;
  data_recupero?: string | null;
  note?: string;
  valore?: string;
}

interface RendicontoProgressEntry {
  schedaId?: number;
  percentualeFatto: number;
  passiCompletati: number;
  totalePassi: number;
  postAssembleaCompletati: number;
  postAssembleaTotale: number;
  inAttesaAssemblea: boolean;
  gestione?: string;
}

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [isWidgetMode, setIsWidgetMode] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('widget') === '1';
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const p = (new URLSearchParams(window.location.search).get('tab') || '').toLowerCase();
      if (p === 'sopralluoghi' || p === 'file' || p === 'reports' || window.location.hash.toLowerCase().includes('sopralluog')) {
        return 'sopralluoghi';
      }
      if (p === 'assemblee') return 'assemblee';
      if (p === 'rendiconto') return 'rendiconto';
      if (p === 'condomini') return 'condomini';
      if (p === 'impostazioni') return 'impostazioni';
    }
    return 'dashboard';
  });
  const [selectedCondoForRendiconto, setSelectedCondoForRendiconto] = useState<number | null>(null);
  const [selectedCondoForAssemblee, setSelectedCondoForAssemblee] = useState<number | null>(null);
  const [initialAssembleeFilter, setInitialAssembleeFilter] = useState<
    'tutte' | 'attive' | 'in_organizzazione' | 'convocata' | 'post_assemblea' | 'concluse' | 'da_fatturare'
  >('tutte');
  const [assembleeStraordinarie, setAssembleeStraordinarie] = useState<AssembleaStraordinariaItem[]>(
    () => readLocalAssembleeStraordinarie()
  );
  const [activeRendicontoProgress, setActiveRendicontoProgress] = useState<ActiveRendicontoProgress | null>(null);
  const [templateVersion, setTemplateVersion] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);

  const handleTemplateUpdated = (newTemplate: CustomPassoTemplate[]) => {
    try {
      const currentSchede = loadInitialSchede();
      const synced = currentSchede.map((s) => syncSchedaWithTemplate(s, newTemplate));
      saveSchedeToStorage(synced);
    } catch {
      // ignore
    }
    setTemplateVersion((v) => v + 1);
    setRendicontiByCondo(readLocalSchedeProgress());
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/impostazioni/passi-rendiconto`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.is_custom && Array.isArray(data.passi) && data.passi.length > 0) {
          const saved = saveCustomPassiTemplate(data.passi);
          handleTemplateUpdated(saved);
        }
      })
      .catch(() => {
        // offline fallback uses localStorage
      });
  }, []);

  // Avanzamento procedura Rendiconto per condominio (sincronizzato da server VPS + sessione attiva)
  // Esclude i 5 passi post-assemblea (58-62) dalla %: al passo 57 è 100% eseguito e passa in Attesa Assemblea.
  const readLocalSchedeProgress = (): Record<number, RendicontoProgressEntry> => {
    const map: Record<number, RendicontoProgressEntry> = {};
    const parsed = getRuntimeSchedeCache();
    if (Array.isArray(parsed)) {
      for (const s of parsed) {
        if (s && typeof s.condominio_id === 'number') {
          const passi = Array.isArray(s.passi) ? s.passi : [];
          let entry: RendicontoProgressEntry;
          if (passi.length > 0) {
            const m = calcolaMetrichePassiRendiconto(passi);
            entry = {
              schedaId: s.id,
              percentualeFatto: m.percentuale_fatto,
              passiCompletati: m.passi_completati,
              totalePassi: m.totale_passi,
              postAssembleaCompletati: m.post_assemblea_completati,
              postAssembleaTotale: m.post_assemblea_totale,
              inAttesaAssemblea: m.in_attesa_assemblea,
              gestione: s.gestione,
            };
          } else {
            const tot = Number(s.totale_passi || 58);
            const done = Math.min(tot, Number(s.passi_completati || 0));
            const pct =
              s.percentuale_fatto !== undefined
                ? Number(s.percentuale_fatto)
                : done >= tot
                  ? 100
                  : Math.round((done / tot) * 1000) / 10;
            const postDone = Number(s.post_assemblea_completati || 0);
            const postTot = Number(s.post_assemblea_totale || 5);
            const inAttesa = Boolean(s.in_attesa_assemblea ?? (pct >= 100 && postDone < postTot));
            entry = {
              schedaId: s.id,
              percentualeFatto: pct,
              passiCompletati: done,
              totalePassi: tot,
              postAssembleaCompletati: postDone,
              postAssembleaTotale: postTot,
              inAttesaAssemblea: inAttesa,
              gestione: s.gestione,
            };
          }
          const existing = map[s.condominio_id];
          const isEntryClosed =
            entry.percentualeFatto >= 100 &&
            entry.postAssembleaCompletati >= (entry.postAssembleaTotale || 5);
          if (
            !existing ||
            isEntryClosed ||
            (entry.percentualeFatto >= existing.percentualeFatto &&
              (entry.percentualeFatto >= 100 ||
                entry.passiCompletati >= existing.passiCompletati ||
                entry.postAssembleaCompletati >= existing.postAssembleaCompletati ||
                entry.inAttesaAssemblea))
          ) {
            map[s.condominio_id] = entry;
          }
        }
      }
    }
    return map;
  };

  const [rendicontiByCondo, setRendicontiByCondo] = useState<Record<number, RendicontoProgressEntry>>(
    () => readLocalSchedeProgress()
  );

  useEffect(() => {
    if (activeRendicontoProgress && activeRendicontoProgress.condominioId) {
      const cid = activeRendicontoProgress.condominioId;
      const tot = activeRendicontoProgress.totalePassi || 58;
      const done = activeRendicontoProgress.passiCompletati;
      const pct = activeRendicontoProgress.percentualeFatto;
      const postDone = activeRendicontoProgress.postAssembleaCompletati ?? 0;
      const postTot = activeRendicontoProgress.postAssembleaTotale ?? 5;
      const inAttesa = Boolean(
        activeRendicontoProgress.inAttesaAssemblea ?? (pct >= 100 && postDone < postTot)
      );
      setRendicontiByCondo((prev) => ({
        ...prev,
        [cid]: {
          percentualeFatto: pct,
          passiCompletati: done,
          totalePassi: tot,
          postAssembleaCompletati: postDone,
          postAssembleaTotale: postTot,
          inAttesaAssemblea: inAttesa,
          gestione: activeRendicontoProgress.gestione,
        },
      }));
    }
  }, [activeRendicontoProgress]);

  const getRendicontoProgressForCondo = (condoId: number) => {
    const localMap = readLocalSchedeProgress();
    const fromState = rendicontiByCondo[condoId];
    const fromLocal = localMap[condoId];
    const fromActive: RendicontoProgressEntry | null =
      activeRendicontoProgress && activeRendicontoProgress.condominioId === condoId
        ? {
            percentualeFatto: activeRendicontoProgress.percentualeFatto,
            passiCompletati: activeRendicontoProgress.passiCompletati,
            totalePassi: activeRendicontoProgress.totalePassi || 58,
            postAssembleaCompletati: activeRendicontoProgress.postAssembleaCompletati ?? 0,
            postAssembleaTotale: activeRendicontoProgress.postAssembleaTotale ?? 5,
            inAttesaAssemblea: Boolean(
              activeRendicontoProgress.inAttesaAssemblea ??
                (activeRendicontoProgress.percentualeFatto >= 100 &&
                  (activeRendicontoProgress.postAssembleaCompletati ?? 0) <
                    (activeRendicontoProgress.postAssembleaTotale ?? 5))
            ),
            gestione: activeRendicontoProgress.gestione,
          }
        : null;

    let best: RendicontoProgressEntry = fromActive ||
      fromState ||
      fromLocal || {
        percentualeFatto: 0,
        passiCompletati: 0,
        totalePassi: 58,
        postAssembleaCompletati: 0,
        postAssembleaTotale: 5,
        inAttesaAssemblea: false,
      };

    const score = (e: RendicontoProgressEntry) =>
      (e.percentualeFatto >= 100 ? 1000 : 0) +
      e.passiCompletati * 10 +
      e.postAssembleaCompletati * 100 +
      (e.inAttesaAssemblea ? 50 : 0);

    if (fromLocal && score(fromLocal) >= score(best)) {
      best = fromLocal;
    }
    if (fromState && score(fromState) > score(best)) {
      best = fromState;
    }
    if (fromActive) {
      best = fromActive;
    }

    const pctFormatted = `${best.percentualeFatto.toFixed(1).replace('.', ',').replace(',0', '')}%`;
    return {
      ...best,
      pctFormatted,
    };
  };

  // Stato in memoria (nessun salvataggio in localStorage) per le modifiche ai documenti in corso d'invio al server VPS
  const runtimeCondoDocsMapRef = React.useRef<
    Record<number, { updatedAt: number; syncedToServer?: boolean; documenti: DocumentoNecessario[] }>
  >({});

  const computeCondoWithDocs = (c: any, docs: DocumentoNecessario[]) => {
    const docRichiesti = docs.filter((d) => d.richiesto);
    const docRecuperati = docRichiesti.filter((d) => d.recuperato);
    return {
      ...c,
      documenti_necessari: docs,
      documenti_necessari_json: JSON.stringify(docs),
      documenti_totali: docRichiesti.length,
      documenti_recuperati: docRecuperati.length,
      percentuale_documenti:
        docRichiesti.length > 0
          ? Math.round((docRecuperati.length / docRichiesti.length) * 100)
          : 100,
    };
  };

  const readLocalCondoDocsMap = (): Record<
    number,
    { updatedAt: number; syncedToServer?: boolean; documenti: DocumentoNecessario[] }
  > => {
    return runtimeCondoDocsMapRef.current;
  };

  const writeLocalCondoDocsEntry = (
    condoId: number,
    documenti: DocumentoNecessario[],
    syncedToServer: boolean,
    updatedAt = Date.now()
  ) => {
    runtimeCondoDocsMapRef.current[condoId] = {
      updatedAt,
      syncedToServer,
      documenti,
    };
  };

  const applyLocalDocsToCondomini = (
    list: any[],
    preferLocalAlways = false
  ): any[] => {
    const localMap = readLocalCondoDocsMap();
    const now = Date.now();
    return list.map((c) => {
      const entry = localMap[c.id];
      if (!entry || !Array.isArray(entry.documenti)) return c;
      const isPending =
        preferLocalAlways ||
        !entry.syncedToServer ||
        Boolean(docSaveTimeoutRef.current[c.id]) ||
        Boolean(inFlightDocSavesRef.current[c.id]) ||
        now - (entry.updatedAt || 0) < 15000;
      if (isPending) {
        return computeCondoWithDocs(c, entry.documenti);
      }
      return c;
    });
  };

  // Dati principali (inizializzati unendo i dati statici con eventuali modifiche salvate in localStorage)
  const docSaveTimeoutRef = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const inFlightDocSavesRef = React.useRef<Record<number, boolean>>({});
  const [condomini, setCondomini] = useState<any[]>(() =>
    applyLocalDocsToCondomini(condominiStudioSerra, true)
  );
  const condominiRef = React.useRef<any[]>(condomini);
  useEffect(() => {
    condominiRef.current = condomini;
  }, [condomini]);

  const [briefing, setBriefing] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Filtri vista condomini e scadenze dashboard
  const [condoSearchFilter, setCondoSearchFilter] = useState('');
  const [filtroStato, setFiltroStato] = useState<
    'tutti' | 'chiuse' | 'urgenti' | 'pronti' | 'attesa_assemblea' | 'mancanti' | 'completati'
  >('tutti');
  const [selectedKpiCard, setSelectedKpiCard] = useState<
    'chiuse' | 'pronti' | 'attesa_assemblea' | 'convocate_verbale' | 'urgenti' | 'mancanti' | 'completati'
  >('pronti');
  const [soloScadenzeImminenti, setSoloScadenzeImminenti] = useState<boolean>(false);
  const [expandedCondoId, setExpandedCondoId] = useState<number | null>(null);

  // Modali
  const [showNewCondoModal, setShowNewCondoModal] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [condoToDelete, setCondoToDelete] = useState<any | null>(null);
  const [isDeletingCondo, setIsDeletingCondo] = useState(false);

  // Modifica periodo gestione esercizio
  const [editingPeriodoCondo, setEditingPeriodoCondo] = useState<{
    id: number;
    nome: string;
    data_inizio_esercizio: string;
    data_fine_esercizio: string;
  } | null>(null);

  // Form nuovo dato necessario
  const [addingDocCondoId, setAddingDocCondoId] = useState<number | null>(null);
  const [newDocTitolo, setNewDocTitolo] = useState('');
  const [newDocNote, setNewDocNote] = useState('');

  // Form nuovo condominio
  const [newCondoForm, setNewCondoForm] = useState({
    nome: '',
    codice_fiscale: '',
    indirizzo: '',
    citta: 'Bergamo',
    cap: '24128',
    esercizio_in_corso: '2026-01-01 - 2026-12-31',
    data_inizio_esercizio: '2026-01-01',
    data_fine_esercizio: '2026-12-31',
    numero_unita: 0,
    note_operative: '',
  });

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Helper per calcolare documenti di un condominio
  const getDocumentiCondominio = (c: any): DocumentoNecessario[] => {
    if (Array.isArray(c.documenti_necessari)) return c.documenti_necessari;
    if (typeof c.documenti_necessari_json === 'string') {
      try {
        return JSON.parse(c.documenti_necessari_json);
      } catch (e) {
        return [];
      }
    }
    return [
      { id: 'acqua', titolo: "Lettura contatori dell'acqua", richiesto: false, richiesta_inviata: false, recuperato: false, note: 'Contatori divisionali idrici' },
      { id: 'riscaldamento', titolo: 'Lettura contatori/ripartitori riscaldamento', richiesto: false, richiesta_inviata: false, recuperato: false, note: 'Ripartitori di calore o conta-calorie' },
      { id: 'estratto_conto', titolo: 'Estratto conto bancario finale', richiesto: false, richiesta_inviata: false, recuperato: false, note: 'Saldi al termine dell\'esercizio' },
      { id: 'fatture_gestione', titolo: 'Tutte le fatture fornitori dell\'esercizio', richiesto: false, richiesta_inviata: false, recuperato: false, note: 'Pezze giustificative di spesa' },
      { id: 'f24_quietanze', titolo: 'Modelli F24 e quietanze ritenute d\'acconto', richiesto: false, richiesta_inviata: false, recuperato: false, note: 'Ritenute 4% versate' },
    ];
  };

  // Calcolo giorni alla scadenza (180 giorni dalla fine esercizio)
  const getScadenzaInfo = (c: any) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseLocalDay = (val: string | undefined | null): Date | null => {
      if (!val || typeof val !== 'string') return null;
      const m = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const fineDt = parseLocalDay(c.data_fine_esercizio);

    let scadenzaDt = parseLocalDay(c.scadenza_rendiconto);
    if (!scadenzaDt && fineDt) {
      scadenzaDt = new Date(fineDt.getTime() + 180 * 24 * 60 * 60 * 1000);
      scadenzaDt.setHours(0, 0, 0, 0);
    }

    // Gestione terminata quando la data di oggi è successiva al termine della gestione
    const isChiusa = fineDt ? today.getTime() > fineDt.getTime() : false;
    let giorniRimanenti: number | null = null;
    if (scadenzaDt) {
      const diffTime = scadenzaDt.getTime() - today.getTime();
      giorniRimanenti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      isChiusa,
      fineDt,
      scadenzaDt,
      giorniRimanenti,
      scadenzaFormatted: scadenzaDt ? scadenzaDt.toLocaleDateString('it-IT') : '-',
      fineFormatted: fineDt ? fineDt.toLocaleDateString('it-IT') : '-',
    };
  };

  // Invia al server eventuali modifiche rimaste in localStorage non ancora sincronizzate
  const flushUnsyncedDocsToServer = async () => {
    const localMap = readLocalCondoDocsMap();
    for (const [idStr, entry] of Object.entries(localMap)) {
      const cid = Number(idStr);
      if (
        cid &&
        entry &&
        !entry.syncedToServer &&
        Array.isArray(entry.documenti) &&
        !inFlightDocSavesRef.current[cid] &&
        !docSaveTimeoutRef.current[cid]
      ) {
        inFlightDocSavesRef.current[cid] = true;
        try {
          let res = await fetch(`${API_BASE}/api/condomini/${cid}/documenti-necessari`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documenti: entry.documenti }),
          }).catch(() => null);
          if (!res || !res.ok) {
            res = await fetch(`http://${window.location.hostname}:8018/api/condomini/${cid}/documenti-necessari`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documenti: entry.documenti }),
            }).catch(() => null);
          }
          if (res && res.ok) {
            writeLocalCondoDocsEntry(cid, entry.documenti, true, entry.updatedAt);
          }
        } finally {
          delete inFlightDocSavesRef.current[cid];
        }
      }
    }
  };

  // Caricamento Dati dal Backend (usa /api/rendiconti/progress ultra-leggero)
  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await flushUnsyncedDocsToServer();

      const [bRes, cRes, rRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/briefing`).catch(() =>
          fetch(`http://${window.location.hostname}:8018/api/dashboard/briefing`).catch(() => null)
        ),
        fetch(`${API_BASE}/api/condomini`).catch(() =>
          fetch(`http://${window.location.hostname}:8018/api/condomini`).catch(() => null)
        ),
        fetch(`${API_BASE}/api/rendiconti/progress`).catch(() =>
          fetch(`http://${window.location.hostname}:8018/api/rendiconti/progress`).catch(() => null)
        ),
        fetch(`${API_BASE}/api/assemblee-straordinarie`).catch(() =>
          fetch(`http://${window.location.hostname}:8018/api/assemblee-straordinarie`).catch(() => null)
        ),
      ]);

      if (bRes && bRes.ok) {
        const bData = await bRes.json();
        setBriefing(bData);
      }
      if (cRes && cRes.ok) {
        const cData = await cRes.json();
        if (Array.isArray(cData) && cData.length > 0) {
          const normalized = cData.map((c: any) =>
            computeCondoWithDocs(c, getDocumentiCondominio(c))
          );
          const merged = applyLocalDocsToCondomini(normalized, false);
          condominiRef.current = merged;
          setCondomini(merged);
        }
      }
      if (rRes && rRes.ok) {
        const rData = await rRes.json();
        if (Array.isArray(rData)) {
          const nextMap: Record<number, RendicontoProgressEntry> = {};
          for (const s of rData) {
            if (s && typeof s.condominio_id === 'number') {
              const passi = Array.isArray(s.passi) ? s.passi : [];
              let srvEntry: RendicontoProgressEntry;
              if (passi.length > 0) {
                const m = calcolaMetrichePassiRendiconto(passi);
                srvEntry = {
                  schedaId: s.id,
                  percentualeFatto: m.percentuale_fatto,
                  passiCompletati: m.passi_completati,
                  totalePassi: m.totale_passi,
                  postAssembleaCompletati: m.post_assemblea_completati,
                  postAssembleaTotale: m.post_assemblea_totale,
                  inAttesaAssemblea: m.in_attesa_assemblea,
                  gestione: s.gestione,
                };
              } else {
                const tot = Number(s.totale_passi || 58);
                const srvDone = Math.min(tot, Number(s.passi_completati || 0));
                const srvPct =
                  s.percentuale_fatto !== undefined
                    ? Number(s.percentuale_fatto)
                    : tot > 0
                      ? Math.round((srvDone / tot) * 1000) / 10
                      : 0;
                const postDone = Number(s.post_assemblea_completati || 0);
                const postTot = Number(s.post_assemblea_totale || 5);
                const inAttesa = Boolean(
                  s.in_attesa_assemblea ?? (srvPct >= 100 && postDone < postTot)
                );
                srvEntry = {
                  schedaId: s.id,
                  percentualeFatto: srvPct,
                  passiCompletati: srvDone,
                  totalePassi: tot,
                  postAssembleaCompletati: postDone,
                  postAssembleaTotale: postTot,
                  inAttesaAssemblea: inAttesa,
                  gestione: s.gestione,
                };
              }
              nextMap[s.condominio_id] = srvEntry;
            }
          }
          setRendicontiByCondo(nextMap);
        }
      }
      if (aRes && aRes.ok) {
        const aData = await aRes.json();
        if (Array.isArray(aData)) {
          const mergedMap = new Map<number, AssembleaStraordinariaItem>();
          for (const s of aData) {
            const m = calcolaMetricheAssemblea(s);
            mergedMap.set(s.id, { ...s, ...m });
          }
          const merged = deduplicateAssembleeList(
            Array.from(mergedMap.values()).sort((a, b) => b.id - a.id)
          );
          writeLocalAssembleeStraordinarie(merged);
          setAssembleeStraordinarie(merged);
        }
      }
    } catch (e) {
      if (!silent) {
        console.warn('Backend non raggiungibile, utilizzo dati locali completi:', e);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Spunta/despunta rapida di un passo della scaletta assemblea straordinaria direttamente dalla Dashboard
  const handleTogglePassoAssembleaFromDashboard = async (
    assemblea: AssembleaStraordinariaItem,
    stepId: string
  ) => {
    const todayStr = new Date().toLocaleDateString('it-IT');
    const targetCurrent = assemblea.scaletta.find((s) => s.id === stepId);
    const nextFattoVal = !targetCurrent?.fatto;
    const isClosingStep62 = stepId === 'passo_62' && nextFattoVal === true;

    const nextScaletta = assemblea.scaletta.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          fatto: nextFattoVal,
          data_spunta: nextFattoVal ? todayStr : null,
        };
      }
      // Spuntando "Invio eventuali MAV" (Passo #62) si chiude l'intera procedura post-assemblea
      if (isClosingStep62 && !s.fatto) {
        return {
          ...s,
          fatto: true,
          data_spunta: s.data_spunta || todayStr,
        };
      }
      // Deselezionando un passo precedente quando il 62 era spuntato, si riapre la procedura
      if (!nextFattoVal && stepId !== 'passo_62' && s.id === 'passo_62' && s.fatto) {
        return {
          ...s,
          fatto: false,
          data_spunta: null,
        };
      }
      return s;
    });

    const allChecked = nextScaletta.every((s) => Boolean(s.fatto));
    const anyPostChecked = nextScaletta.some(
      (s) => POST_ASSEMBLEA_STEP_IDS.has(s.id) && Boolean(s.fatto)
    );
    const m = calcolaMetricheAssemblea({
      ...assemblea,
      scaletta: nextScaletta,
      assemblea_svolta: allChecked || anyPostChecked ? true : assemblea.assemblea_svolta,
      stato: allChecked ? 'conclusa' : anyPostChecked ? 'in_firma' : assemblea.stato,
    });
    const normalized: AssembleaStraordinariaItem = {
      ...assemblea,
      ...m,
    };

    const toggledStep = nextScaletta.find((s) => s.id === stepId);
    // Sincronizza PRIMA la Scheda Rendiconto in localStorage così ensureAllOrdinarieInAssembleeList legge lo stato chiuso
    if (toggledStep && normalized.tipo === 'Ordinaria') {
      const isClosedNow = normalized.passi_completati >= normalized.totale_passi;
      const postDoneCount = normalized.scaletta.filter(
        (s) => POST_ASSEMBLEA_STEP_IDS.has(s.id) && Boolean(s.fatto)
      ).length;
      void syncPassoAssembleaToRendiconto(
        normalized,
        stepId,
        toggledStep.fatto,
        undefined,
        API_BASE
      );
      setRendicontiByCondo((prev) => ({
        ...prev,
        ...readLocalSchedeProgress(),
        [normalized.condominio_id]: {
          ...(prev[normalized.condominio_id] || {
            percentualeFatto: 100,
            passiCompletati: 58,
            totalePassi: 58,
            postAssembleaTotale: 5,
          }),
          percentualeFatto: 100,
          postAssembleaCompletati: isClosedNow ? 5 : postDoneCount,
          postAssembleaTotale: 5,
          inAttesaAssemblea: !isClosedNow,
        },
      }));
      setCondomini((prev) =>
        prev.map((c) =>
          Number(c.id) === Number(normalized.condominio_id)
            ? { ...c, rendiconto_stato: isClosedNow ? 'completato' : 'in_corso' }
            : c
        )
      );
    }

    const baseList = ensureAllOrdinarieInAssembleeList(
      assembleeStraordinarie,
      condomini,
      rendicontiByCondo
    );
    const existsInBase = baseList.some(
      (a) =>
        a.id === normalized.id ||
        (normalized.tipo === 'Ordinaria' &&
          a.tipo === 'Ordinaria' &&
          Number(a.condominio_id) === Number(normalized.condominio_id))
    );
    const nextList = deduplicateAssembleeList(
      existsInBase
        ? baseList.map((a) =>
            a.id === normalized.id ||
            (normalized.tipo === 'Ordinaria' &&
              a.tipo === 'Ordinaria' &&
              Number(a.condominio_id) === Number(normalized.condominio_id))
              ? normalized
              : a
          )
        : [normalized, ...baseList]
    );
    writeLocalAssembleeStraordinarie(nextList);
    setAssembleeStraordinarie(nextList);

    if (toggledStep?.fatto) {
      if (normalized.passi_completati >= normalized.totale_passi) {
        notify(
          `✓ Procedura Assemblea e Rendiconto conclusa al 100% (${assemblea.condominio_nome})!`
        );
      } else {
        notify(`✓ Completato: ${toggledStep.titolo} (${assemblea.condominio_nome})`);
      }
    } else if (toggledStep) {
      notify(`Riaperta fase: ${toggledStep.titolo}`);
    }

    try {
      const payload = {
        titolo: normalized.titolo,
        tipo: normalized.tipo,
        data_prima_convocazione: normalized.data_prima_convocazione,
        ora_prima_convocazione: normalized.ora_prima_convocazione,
        data_assemblea: normalized.data_assemblea,
        ora_assemblea: normalized.ora_assemblea,
        luogo_sala: normalized.luogo_sala,
        ordine_del_giorno: normalized.ordine_del_giorno,
        presidente: normalized.presidente,
        segretario: normalized.segretario,
        modalita_invio: normalized.modalita_invio,
        fatturata: normalized.fatturata,
        importo_compenso: normalized.importo_compenso,
        stato: normalized.stato,
        note_generali: normalized.note_generali,
        scaletta: normalized.scaletta,
      };
      let res = await fetch(`${API_BASE}/api/assemblee-straordinarie/${normalized.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res || !res.ok) {
        await fetch(
          `http://${window.location.hostname}:8018/api/assemblee-straordinarie/${normalized.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        ).catch(() => null);
      }
    } catch {
      // salvato in localStorage
    }
  };

  // Sposta un'assemblea (Ordinaria o Straordinaria) da "In Attesa Assemblea" a "Completamento Procedura" (o viceversa)
  const handleToggleAssembleaSvoltaFromDashboard = async (
    assemblea: AssembleaStraordinariaItem,
    svolta: boolean
  ) => {
    const todayStr = new Date().toLocaleDateString('it-IT');
    const nextScaletta = assemblea.scaletta.map((s) => {
      if (svolta) {
        if (s.id === 'odg' || s.id === 'sala' || s.id === 'convocazioni') {
          return { ...s, fatto: true, data_spunta: s.data_spunta || todayStr };
        }
        return s;
      } else {
        if (POST_ASSEMBLEA_STEP_IDS.has(s.id)) {
          return { ...s, fatto: false, data_spunta: null };
        }
        return s;
      }
    });

    const m = calcolaMetricheAssemblea({
      ...assemblea,
      scaletta: nextScaletta,
      assemblea_svolta: svolta,
      stato: svolta
        ? 'in_firma'
        : nextScaletta.find((s) => s.id === 'convocazioni')?.fatto
        ? 'convocata'
        : 'in_organizzazione',
    });
    const normalized: AssembleaStraordinariaItem = {
      ...assemblea,
      ...m,
      assemblea_svolta: svolta,
      data_assemblea_svolta: svolta ? todayStr : null,
    };

    const baseList = ensureAllOrdinarieInAssembleeList(
      assembleeStraordinarie,
      condomini,
      rendicontiByCondo
    );
    const existsInBase = baseList.some(
      (a) =>
        a.id === normalized.id ||
        (normalized.tipo === 'Ordinaria' &&
          a.tipo === 'Ordinaria' &&
          Number(a.condominio_id) === Number(normalized.condominio_id))
    );
    const nextList = deduplicateAssembleeList(
      existsInBase
        ? baseList.map((a) =>
            a.id === normalized.id ||
            (normalized.tipo === 'Ordinaria' &&
              a.tipo === 'Ordinaria' &&
              Number(a.condominio_id) === Number(normalized.condominio_id))
              ? normalized
              : a
          )
        : [normalized, ...baseList]
    );
    writeLocalAssembleeStraordinarie(nextList);
    setAssembleeStraordinarie(nextList);

    if (!svolta && normalized.tipo === 'Ordinaria') {
      for (const postId of Array.from(POST_ASSEMBLEA_STEP_IDS)) {
        void syncPassoAssembleaToRendiconto(normalized, postId, false, undefined, API_BASE);
      }
      setRendicontiByCondo((prev) => ({ ...prev, ...readLocalSchedeProgress() }));
    }

    notify(
      svolta
        ? `✓ Assemblea svolta per "${assemblea.condominio_nome}": passata al riquadro Completamento Procedura`
        : `↩ Assemblea riportata nel riquadro "In Attesa Assemblea" (${assemblea.condominio_nome})`
    );

    try {
      const payload = {
        titolo: normalized.titolo,
        tipo: normalized.tipo,
        data_prima_convocazione: normalized.data_prima_convocazione,
        ora_prima_convocazione: normalized.ora_prima_convocazione,
        data_assemblea: normalized.data_assemblea,
        ora_assemblea: normalized.ora_assemblea,
        luogo_sala: normalized.luogo_sala,
        ordine_del_giorno: normalized.ordine_del_giorno,
        presidente: normalized.presidente,
        segretario: normalized.segretario,
        modalita_invio: normalized.modalita_invio,
        fatturata: normalized.fatturata,
        importo_compenso: normalized.importo_compenso,
        stato: normalized.stato,
        note_generali: normalized.note_generali,
        scaletta: normalized.scaletta,
      };
      let res = await fetch(`${API_BASE}/api/assemblee-straordinarie/${normalized.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res || !res.ok) {
        await fetch(
          `http://${window.location.hostname}:8018/api/assemblee-straordinarie/${normalized.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        ).catch(() => null);
      }
    } catch {
      // salvato in localStorage
    }
  };

  useEffect(() => {
    const initial = applyLocalDocsToCondomini(condominiStudioSerra, true);
    condominiRef.current = initial;
    setCondomini(initial);
    loadAllData();
  }, [DATA_SYNC_VERSION]);

  // Sincronizzazione automatica continua tra Cellulare, Widget e PC (ogni 8 secondi, al cambio tab e al ritorno sulla finestra)
  useEffect(() => {
    setRendicontiByCondo((prev) => ({ ...prev, ...readLocalSchedeProgress() }));
    loadAllData(true);

    const syncIfIdle = () => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }
      if (
        Object.keys(docSaveTimeoutRef.current).length > 0 ||
        Object.keys(inFlightDocSavesRef.current).length > 0
      ) {
        return;
      }
      loadAllData(true);
    };

    const interval = setInterval(syncIfIdle, 8000);
    window.addEventListener('focus', syncIfIdle);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncIfIdle);
    };
  }, [activeTab, DATA_SYNC_VERSION]);

  // Aggiornamento Documento (Richiesto / Richiesta inviata / Recuperato / Valore / Note)
  const handleUpdateDocumentiCondominio = async (
    condominioId: number,
    updatedDocs: DocumentoNecessario[],
    debounceMs = 0
  ) => {
    const updatedAt = Date.now();
    // 1. Salva subito in localStorage (così anche ricaricando o dal widget non si perde mai nulla)
    writeLocalCondoDocsEntry(condominioId, updatedDocs, false, updatedAt);

    // 2. Aggiornamento sincrono del ref + stato React ottimistico
    const nextCondomini = condominiRef.current.map((c) =>
      c.id === condominioId ? computeCondoWithDocs(c, updatedDocs) : c
    );
    condominiRef.current = nextCondomini;
    setCondomini(nextCondomini);

    const saveToServer = async () => {
      delete docSaveTimeoutRef.current[condominioId];
      inFlightDocSavesRef.current[condominioId] = true;
      try {
        let res = await fetch(`${API_BASE}/api/condomini/${condominioId}/documenti-necessari`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documenti: updatedDocs }),
        }).catch(() => null);

        if (!res || !res.ok) {
          res = await fetch(
            `http://${window.location.hostname}:8018/api/condomini/${condominioId}/documenti-necessari`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documenti: updatedDocs }),
            }
          ).catch(() => null);
        }

        if (res && res.ok) {
          writeLocalCondoDocsEntry(condominioId, updatedDocs, true, updatedAt);
        } else {
          console.error('Errore salvataggio documenti sul server, mantenuto in localStorage per retry');
        }
      } catch (err) {
        console.error(err);
      } finally {
        delete inFlightDocSavesRef.current[condominioId];
      }
    };

    if (debounceMs > 0) {
      if (docSaveTimeoutRef.current[condominioId]) {
        clearTimeout(docSaveTimeoutRef.current[condominioId]);
      }
      docSaveTimeoutRef.current[condominioId] = setTimeout(saveToServer, debounceMs);
    } else {
      await saveToServer();
    }
  };

  // Aggiorna valore / lettura o nota di un documento (anche da cellulare o widget in tempo reale)
  const handleUpdateDocField = (
    condominioId: number,
    docId: string,
    field: 'valore' | 'note',
    value: string
  ) => {
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const updated = docs.map((d) => (d.id === docId ? { ...d, [field]: value } : d));
    handleUpdateDocumentiCondominio(condominioId, updated, 450);
  };

  const handleToggleRichiesto = (condominioId: number, docId: string) => {
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const updated = docs.map((d) => {
      if (d.id === docId) {
        const nuovoRichiesto = !d.richiesto;
        return {
          ...d,
          richiesto: nuovoRichiesto,
          // se non è più richiesto, azzeriamo il recuperato e la richiesta per coerenza
          richiesta_inviata: nuovoRichiesto ? Boolean(d.richiesta_inviata) : false,
          data_richiesta_inviata: nuovoRichiesto ? d.data_richiesta_inviata : null,
          recuperato: nuovoRichiesto ? d.recuperato : false,
        };
      }
      return d;
    });
    handleUpdateDocumentiCondominio(condominioId, updated);
    notify('Necessità documento aggiornata');
  };

  const handleToggleRichiestaInviata = (condominioId: number, docId: string) => {
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = docs.map((d) => {
      if (d.id === docId) {
        const nuovoInviata = !Boolean(d.richiesta_inviata);
        return {
          ...d,
          richiesta_inviata: nuovoInviata,
          data_richiesta_inviata: nuovoInviata ? todayStr : null,
        };
      }
      return d;
    });
    handleUpdateDocumentiCondominio(condominioId, updated);
    notify('Stato "Richiesta inviata" aggiornato');
  };

  const handleToggleRecuperato = (condominioId: number, docId: string) => {
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = docs.map((d) => {
      if (d.id === docId) {
        const nuovoRecuperato = !d.recuperato;
        return {
          ...d,
          recuperato: nuovoRecuperato,
          data_recupero: nuovoRecuperato ? todayStr : null,
        };
      }
      return d;
    });
    handleUpdateDocumentiCondominio(condominioId, updated);
    notify('Stato recupero aggiornato');
  };

  const handleAddCustomDoc = (condominioId: number) => {
    if (!newDocTitolo.trim()) {
      notify('Inserisci il nome del dato o documento da richiedere');
      return;
    }
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const newDoc: DocumentoNecessario = {
      id: `custom_${Date.now()}`,
      titolo: newDocTitolo.trim(),
      richiesto: true,
      richiesta_inviata: false,
      recuperato: false,
      note: newDocNote.trim() || undefined,
    };
    const updated = [...docs, newDoc];
    handleUpdateDocumentiCondominio(condominioId, updated);
    setNewDocTitolo('');
    setNewDocNote('');
    setAddingDocCondoId(null);
    notify(`Dato "${newDoc.titolo}" aggiunto alla checklist del condominio!`);
  };

  const handleDeleteCustomDoc = (condominioId: number, docId: string) => {
    const c = condominiRef.current.find((x) => x.id === condominioId);
    if (!c) return;
    const docs = getDocumentiCondominio(c);
    const updated = docs.filter((d) => d.id !== docId);
    handleUpdateDocumentiCondominio(condominioId, updated);
    notify('Dato rimosso dalla checklist');
  };

  // Modifica e Salvataggio Periodo Gestione (Inizio / Fine Esercizio)
  const handleSavePeriodoGestione = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeriodoCondo) return;
    const { id, data_inizio_esercizio, data_fine_esercizio } = editingPeriodoCondo;

    if (!data_inizio_esercizio || !data_fine_esercizio) {
      notify('Inserisci sia la data di inizio che la data di fine esercizio');
      return;
    }

    // Calcolo automatico della scadenza legale a 180 giorni dalla fine esercizio
    let scadenza_rendiconto: string | null = null;
    try {
      const dtFine = new Date(data_fine_esercizio);
      const dtScad = new Date(dtFine.getTime() + 180 * 24 * 60 * 60 * 1000);
      scadenza_rendiconto = dtScad.toISOString().split('T')[0];
    } catch (e) {
      console.error(e);
    }

    const esercizio_in_corso = `${data_inizio_esercizio} - ${data_fine_esercizio}`;

    // Aggiornamento immediato stato locale
    setCondomini((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            data_inizio_esercizio,
            data_fine_esercizio,
            scadenza_rendiconto,
            esercizio_in_corso,
            rendiconto_stato: 'in_corso',
          };
        }
        return c;
      })
    );

    try {
      const res = await fetch(`${API_BASE}/api/condomini/${id}/documenti-necessari`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_inizio_esercizio,
          data_fine_esercizio,
          scadenza_rendiconto,
          rendiconto_stato: 'in_corso',
        }),
      });

      if (res.ok) {
        notify(`Periodo di gestione di "${editingPeriodoCondo.nome}" salvato con successo!`);
      } else {
        notify('Periodo di gestione aggiornato localmente.');
      }
    } catch {
      notify('Periodo di gestione aggiornato localmente.');
    } finally {
      setEditingPeriodoCondo(null);
    }
  };

  // Creazione Nuovo Condominio
  const handleCreateCondominio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCondoForm.nome.trim()) {
      notify('Inserisci la denominazione del condominio');
      return;
    }

    const defaultDocs = [
      { id: 'acqua', titolo: "Lettura contatori dell'acqua", richiesto: true, recuperato: false, note: 'Contatori divisionali idrici' },
      { id: 'riscaldamento', titolo: 'Lettura contatori/ripartitori riscaldamento', richiesto: true, recuperato: false, note: 'Ripartitori di calore o conta-calorie' },
      { id: 'estratto_conto', titolo: 'Estratto conto bancario finale', richiesto: true, recuperato: false, note: 'Saldi al termine dell\'esercizio' },
      { id: 'fatture_gestione', titolo: 'Tutte le fatture fornitori dell\'esercizio', richiesto: true, recuperato: false, note: 'Pezze giustificative di spesa' },
      { id: 'f24_quietanze', titolo: 'Modelli F24 e quietanze ritenute d\'acconto', richiesto: true, recuperato: false, note: 'Ritenute 4% versate' },
    ];

    try {
      const res = await fetch(`${API_BASE}/api/condomini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCondoForm,
          documenti_necessari_json: JSON.stringify(defaultDocs),
          rendiconto_stato: 'da_iniziare',
        }),
      });

      if (res.ok) {
        const created = await res.json();
        notify(`Condominio "${created.nome}" aggiunto con successo con la sua Scheda Rendiconto!`);
        setShowNewCondoModal(false);
        setNewCondoForm({
          nome: '',
          codice_fiscale: '',
          indirizzo: '',
          citta: 'Bergamo',
          cap: '24128',
          esercizio_in_corso: '2026-01-01 - 2026-12-31',
          data_inizio_esercizio: '2026-01-01',
          data_fine_esercizio: '2026-12-31',
          numero_unita: 0,
          note_operative: '',
        });
        loadAllData();
      } else {
        notify('Errore durante il salvataggio del condominio.');
      }
    } catch (err) {
      console.error(err);
      notify('Errore di connessione con il server.');
    }
  };

  // Eliminazione Condominio non più gestito
  const handleDeleteCondominio = async () => {
    if (!condoToDelete) return;
    setIsDeletingCondo(true);
    try {
      const res = await fetch(`${API_BASE}/api/condomini/${condoToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        notify(`Condominio "${condoToDelete.nome}" eliminato con successo.`);
        setCondomini((prev) => prev.filter((c) => c.id !== condoToDelete.id));
        setCondoToDelete(null);
        loadAllData();
      } else {
        notify('Errore durante l\'eliminazione del condominio.');
      }
    } catch (err) {
      console.error(err);
      notify('Impossibile contattare il server.');
    } finally {
      setIsDeletingCondo(false);
    }
  };

  // Segna rendiconto come completato o riaprilo
  const handleToggleStatoRendiconto = async (
    condominioId: number,
    nuovoStato: 'completato' | 'in_corso'
  ) => {
    const target = condomini.find((c) => c.id === condominioId);
    setCondomini((prev) =>
      prev.map((c) => (c.id === condominioId ? { ...c, rendiconto_stato: nuovoStato } : c))
    );
    try {
      await fetch(`${API_BASE}/api/condomini/${condominioId}/documenti-necessari`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rendiconto_stato: nuovoStato }),
      });
    } catch (e) {
      console.error(e);
    }
    notify(
      nuovoStato === 'completato'
        ? `Rendiconto di "${target?.nome || 'Condominio'}" segnato come COMPLETATO! Ora puoi rinnovare l'esercizio all'anno successivo.`
        : `Rendiconto di "${target?.nome || 'Condominio'}" riaperto in lavorazione.`
    );
  };

  // Avanza una data YYYY-MM-DD di +1 anno gestendo anni bisestili
  const addOneYearIso = (dateStr: string | undefined, fallbackStr: string): string => {
    const raw = (dateStr && dateStr.length >= 10 ? dateStr.slice(0, 10) : fallbackStr).split('-');
    const y = parseInt(raw[0], 10) || new Date().getFullYear();
    const m = parseInt(raw[1], 10) || 1;
    const d = parseInt(raw[2], 10) || 1;
    const nextYear = y + 1;
    const maxDaysInMonth = new Date(nextYear, m, 0).getDate();
    const safeDay = Math.min(d, maxDaysInMonth);
    return `${nextYear}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
  };

  // Calcola l'anteprima delle nuove date (+1 anno) e della nuova scadenza 180gg
  const calcolaRinnovoAnnoSuccessivo = (c: any) => {
    const nuovoInizio = addOneYearIso(c?.data_inizio_esercizio, '2025-01-01');
    const nuovaFine = addOneYearIso(c?.data_fine_esercizio, '2025-12-31');
    const dtFine = new Date(nuovaFine);
    const dtScad = new Date(dtFine.getTime() + 180 * 24 * 60 * 60 * 1000);
    const nuovaScadenza = dtScad.toISOString().split('T')[0];

    const docs = getDocumentiCondominio(c).map((d) => ({
      ...d,
      richiesta_inviata: false,
      data_richiesta_inviata: null,
      recuperato: false,
      data_recupero: null,
    }));

    return {
      nuovoInizio,
      nuovaFine,
      nuovaScadenza,
      nuoviDocs: docs,
      inizioFormatted: new Date(nuovoInizio).toLocaleDateString('it-IT'),
      fineFormatted: dtFine.toLocaleDateString('it-IT'),
      scadenzaFormatted: dtScad.toLocaleDateString('it-IT'),
    };
  };

  // Rinnova automaticamente il condominio all'anno successivo (+1 anno + nuova scadenza 180gg)
  const handleRinnovaEsercizioAnnoSuccessivo = async (condominioId: number) => {
    const target = condomini.find((c) => c.id === condominioId);
    if (!target) return;

    const {
      nuovoInizio,
      nuovaFine,
      nuovaScadenza,
      nuoviDocs,
      inizioFormatted,
      fineFormatted,
      scadenzaFormatted,
    } = calcolaRinnovoAnnoSuccessivo(target);
    const todayIso = new Date().toISOString().split('T')[0];

    setCondomini((prev) =>
      prev.map((c) =>
        c.id === condominioId
          ? {
              ...c,
              data_inizio_esercizio: nuovoInizio,
              data_fine_esercizio: nuovaFine,
              scadenza_rendiconto: nuovaScadenza,
              esercizio_in_corso: `${nuovoInizio} - ${nuovaFine}`,
              data_ultima_assemblea: todayIso,
              rendiconto_stato: 'in_corso',
              documenti_necessari: nuoviDocs,
              documenti_necessari_json: JSON.stringify(nuoviDocs),
            }
          : c
      )
    );

    try {
      const res = await fetch(`${API_BASE}/api/condomini/${condominioId}/rinnova-esercizio`, {
        method: 'POST',
      });
      if (!res.ok) {
        await fetch(`${API_BASE}/api/condomini/${condominioId}/documenti-necessari`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data_inizio_esercizio: nuovoInizio,
            data_fine_esercizio: nuovaFine,
            scadenza_rendiconto: nuovaScadenza,
            esercizio_in_corso: `${nuovoInizio} - ${nuovaFine}`,
            data_ultima_assemblea: todayIso,
            rendiconto_stato: 'in_corso',
            documenti: nuoviDocs,
          }),
        });
      }
      await loadAllData(true);
    } catch (e) {
      console.error(e);
    }

    notify(
      `🔄 Rinnovo automatico eseguito per "${target.nome}": nuovo esercizio ${inizioFormatted} → ${fineFormatted} (Nuova scadenza 180gg: ${scadenzaFormatted})`
    );
  };

  // Rinnova in blocco tutti i condomini attualmente segnati come completati
  const handleRinnovaTuttiCompletati = async (listaCompletati: any[]) => {
    if (!listaCompletati || listaCompletati.length === 0) return;
    for (const c of listaCompletati) {
      await handleRinnovaEsercizioAnnoSuccessivo(c.id);
    }
    notify(
      `🔄 Rinnovati automaticamente all'anno successivo ${listaCompletati.length} condomini completati!`
    );
  };

  // Conteggi e statistiche per la dashboard
  const stats = React.useMemo(() => {
    let chiuse = 0;
    let inCorso = 0;
    let urgenti60gg = 0;
    let datiMancantiCount = 0;
    let completati = 0;

    const condominiChiuseList: any[] = [];
    const condominiUrgenti60ggList: any[] = [];
    const condominiProntiDaFareList: any[] = [];
    const condominiAttesaAssembleaList: any[] = [];
    const condominiDatiMancantiList: any[] = [];
    const condominiCompletatiList: any[] = [];

    condomini.forEach((c) => {
      const sc = getScadenzaInfo(c);
      const docs = getDocumentiCondominio(c);
      const richiesti = docs.filter((d) => d.richiesto);
      const mancanti = richiesti.filter((d) => !d.recuperato);
      const rendProg = getRendicontoProgressForCondo(c.id);

      const enriched = {
        ...c,
        scadenzaInfo: sc,
        richiesti,
        mancanti,
        rendProg,
        percentuale:
          richiesti.length > 0
            ? Math.round(((richiesti.length - mancanti.length) / richiesti.length) * 100)
            : 100,
      };

      const tutti63PassiFatti =
        rendProg.percentualeFatto >= 100 &&
        rendProg.postAssembleaCompletati >= rendProg.postAssembleaTotale;
      const isCompletato = c.rendiconto_stato === 'completato' || tutti63PassiFatti;
      const isInAttesaAssemblea =
        !isCompletato &&
        (Boolean(rendProg.inAttesaAssemblea) || Number(rendProg.percentualeFatto) >= 100);
      const isRendicontoAl100 =
        isCompletato || isInAttesaAssemblea || Number(rendProg.percentualeFatto) >= 100;

      if (isCompletato) {
        completati++;
        condominiCompletatiList.push(enriched);
      } else if (isInAttesaAssemblea) {
        condominiAttesaAssembleaList.push(enriched);
      }

      if (sc.isChiusa) {
        if (!isRendicontoAl100) {
          chiuse++;
          condominiChiuseList.push(enriched);
        }

        // Una volta raggiunto il 100% nella procedura del rendiconto, il condominio esce da tutti i riquadri di allerta
        if (!isRendicontoAl100 && mancanti.length === 0) {
          condominiProntiDaFareList.push(enriched);
        }

        if (!isRendicontoAl100 && sc.giorniRimanenti !== null && sc.giorniRimanenti <= 60) {
          urgenti60gg++;
          condominiUrgenti60ggList.push(enriched);
        }

        // Raccoglie solo i condomini con gestione terminata (data di oggi successiva al termine della gestione)
        if (!isRendicontoAl100 && mancanti.length > 0) {
          datiMancantiCount++;
          condominiDatiMancantiList.push(enriched);
        }
      } else {
        inCorso++;
      }
    });

    // Ordina le gestioni chiuse, quelle imminenti, quelle in attesa assemblea, quelle pronte da fare e i dati mancanti per scadenza più vicina
    const sortByScadenza = (a: any, b: any) => {
      const gA = a.scadenzaInfo.giorniRimanenti ?? 9999;
      const gB = b.scadenzaInfo.giorniRimanenti ?? 9999;
      return gA - gB;
    };

    condominiChiuseList.sort(sortByScadenza);
    condominiUrgenti60ggList.sort(sortByScadenza);
    condominiProntiDaFareList.sort(sortByScadenza);
    condominiAttesaAssembleaList.sort(sortByScadenza);
    condominiDatiMancantiList.sort(sortByScadenza);

    // Unifica tutte le assemblee (Ordinarie da Rendiconto al Passo #57 + Straordinarie)
    // in modo che:
    // 1) Prima dell'assemblea (!isAssembleaGiaSvolta) confluiscano tutte nel riquadro "In Attesa Assemblea"
    // 2) Una volta fatta l'assemblea (isAssembleaGiaSvolta) passino al riquadro "Completamento Procedura"
    const allAssembleeUnificate = ensureAllOrdinarieInAssembleeList(
      assembleeStraordinarie,
      condomini,
      rendicontiByCondo
    );

    const assembleeAttiveList = allAssembleeUnificate.filter(
      (a) => a.passi_completati < a.totale_passi
    );

    // RIQUADRO 1: IN ATTESA ASSEMBLEA (Prima della riunione — sia Ordinarie al passo 57 che Straordinarie passi 1-3)
    const assembleeInAttesaList = assembleeAttiveList.filter((a) => !isAssembleaGiaSvolta(a));
    const assembleeInAttesaOrdinarieCount = assembleeInAttesaList.filter(
      (a) => a.tipo === 'Ordinaria'
    ).length;
    const assembleeInAttesaStraordinarieCount = assembleeInAttesaList.filter(
      (a) => a.tipo !== 'Ordinaria'
    ).length;

    // RIQUADRO 2: COMPLETAMENTO PROCEDURA (Una volta fatta l'assemblea — sia Ordinarie passi 58-62 che Straordinarie passi 4-5)
    const assembleeCompletamentoList = assembleeAttiveList.filter((a) => isAssembleaGiaSvolta(a));
    const assembleeCompletamentoOrdinarieCount = assembleeCompletamentoList.filter(
      (a) => a.tipo === 'Ordinaria'
    ).length;
    const assembleeCompletamentoStraordinarieCount = assembleeCompletamentoList.filter(
      (a) => a.tipo !== 'Ordinaria'
    ).length;

    const assembleeInOrganizzazioneList = assembleeInAttesaList.filter(
      (a) => !a.scaletta?.find((s) => s.id === 'convocazioni')?.fatto
    );

    return {
      totali: condomini.length,
      chiuse,
      inCorso,
      urgenti60gg,
      datiMancantiCount,
      completati,
      prontiDaFareCount: condominiProntiDaFareList.length,
      attesaAssembleaCount: assembleeInAttesaList.length,
      assembleeInAttesaOrdinarieCount,
      assembleeInAttesaStraordinarieCount,
      convocateVerbaleCount: assembleeCompletamentoList.length,
      assembleeCompletamentoOrdinarieCount,
      assembleeCompletamentoStraordinarieCount,
      assembleeInOrganizzazioneCount: assembleeInOrganizzazioneList.length,
      assembleeAttiveCount: assembleeAttiveList.length,
      assembleeInAttesaList,
      assembleeCompletamentoList,
      assembleeConvocateVerbaleList: assembleeCompletamentoList,
      assembleeInOrganizzazioneList,
      assembleeAttiveList,
      allAssembleeUnificate,
      condominiChiuseList,
      condominiUrgenti60ggList,
      condominiProntiDaFareList,
      condominiAttesaAssembleaList,
      condominiDatiMancantiList,
      condominiCompletatiList,
    };
  }, [condomini, rendicontiByCondo, activeRendicontoProgress, assembleeStraordinarie]);

  // Icona documento helper
  const getDocIcon = (docId: string) => {
    if (docId === 'acqua') return <Droplets className="w-4 h-4 text-sky-600" />;
    if (docId === 'riscaldamento') return <Flame className="w-4 h-4 text-orange-600" />;
    if (docId === 'estratto_conto') return <Landmark className="w-4 h-4 text-emerald-600" />;
    if (docId === 'fatture_gestione') return <Receipt className="w-4 h-4 text-indigo-600" />;
    if (docId === 'f24_quietanze') return <FileText className="w-4 h-4 text-purple-600" />;
    return <CheckSquare className="w-4 h-4 text-amber-600" />;
  };

  // Condomini filtrati per il tab Condomini
  const condominiFiltrati = condomini.filter((c) => {
    if (condoSearchFilter.trim()) {
      const q = condoSearchFilter.toLowerCase();
      const match =
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.indirizzo && c.indirizzo.toLowerCase().includes(q)) ||
        (c.codice_danea && c.codice_danea.toLowerCase().includes(q)) ||
        (c.codice_fiscale && c.codice_fiscale.toLowerCase().includes(q));
      if (!match) return false;
    }

    const sc = getScadenzaInfo(c);
    const docs = getDocumentiCondominio(c);
    const mancanti = docs.filter((d) => d.richiesto && !d.recuperato);
    const rendProg = getRendicontoProgressForCondo(c.id);
    const tutti63PassiFatti =
      rendProg.percentualeFatto >= 100 &&
      rendProg.postAssembleaCompletati >= rendProg.postAssembleaTotale;
    const isCompletato = c.rendiconto_stato === 'completato' || tutti63PassiFatti;
    const isInAttesaAssemblea =
      !isCompletato &&
      (Boolean(rendProg.inAttesaAssemblea) || Number(rendProg.percentualeFatto) >= 100);
    const isRendicontoAl100 =
      isCompletato || isInAttesaAssemblea || Number(rendProg.percentualeFatto) >= 100;

    if (filtroStato === 'chiuse') return sc.isChiusa && !isRendicontoAl100;
    if (filtroStato === 'urgenti')
      return (
        sc.isChiusa &&
        !isRendicontoAl100 &&
        sc.giorniRimanenti !== null &&
        sc.giorniRimanenti <= 60
      );
    if (filtroStato === 'pronti') return sc.isChiusa && mancanti.length === 0 && !isRendicontoAl100;
    if (filtroStato === 'attesa_assemblea') return isInAttesaAssemblea;
    if (filtroStato === 'mancanti') return sc.isChiusa && !isRendicontoAl100 && mancanti.length > 0;
    if (filtroStato === 'completati') return isCompletato;
    return true;
  });

  const openDesktopWidgetPopup = () => {
    const width = 450;
    const height = Math.min(860, window.screen.availHeight - 60);
    const left = Math.max(0, window.screen.availWidth - width - 20);
    const top = 20;
    const popup = window.open(
      '/?widget=1',
      'StudioSerraWidgetDesktop',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      setIsWidgetMode(true);
    }
  };

  if (isWidgetMode) {
    const activeWidgetList = (() => {
      let base: any[] = [];
      if (selectedKpiCard === 'pronti') base = stats.condominiProntiDaFareList;
      else if (selectedKpiCard === 'attesa_assemblea') base = stats.condominiAttesaAssembleaList;
      else if (selectedKpiCard === 'urgenti') base = stats.condominiUrgenti60ggList;
      else if (selectedKpiCard === 'chiuse') base = stats.condominiChiuseList;
      else if (selectedKpiCard === 'mancanti') base = stats.condominiDatiMancantiList;
      else if (selectedKpiCard === 'completati') base = stats.condominiCompletatiList;

      if (!condoSearchFilter.trim()) return base;
      const q = condoSearchFilter.toLowerCase();
      return base.filter(
        (c) =>
          (c.nome && c.nome.toLowerCase().includes(q)) ||
          (c.codice_danea && c.codice_danea.toLowerCase().includes(q)) ||
          (c.indirizzo && c.indirizzo.toLowerCase().includes(q))
      );
    })();

    const kpiTitleMap: Record<typeof selectedKpiCard, { title: string; subtitle: string; badgeClass: string }> = {
      pronti: {
        title: 'Pronti da Redigere (100% Dati)',
        subtitle: 'Gestioni chiuse con tutti i dati acquisiti',
        badgeClass: 'bg-emerald-600 text-white',
      },
      attesa_assemblea: {
        title: 'In Attesa Assemblea (Ordinarie & Straord.)',
        subtitle: 'Prima della riunione • 100% Passo 57 & Straordinarie',
        badgeClass: 'bg-purple-600 text-white',
      },
      convocate_verbale: {
        title: 'Completamento Procedura (Post-Assemblea)',
        subtitle: 'Assemblea fatta • Passi 58–62 e Verbale/Firma',
        badgeClass: 'bg-indigo-600 text-white',
      },
      urgenti: {
        title: 'Scadenze Imminenti (≤ 60gg)',
        subtitle: 'Priorità di convocazione assemblea',
        badgeClass: 'bg-rose-600 text-white',
      },
      chiuse: {
        title: 'Gestioni Chiuse (Termine 180gg)',
        subtitle: 'Tutti gli esercizi chiusi da approvare',
        badgeClass: 'bg-amber-500 text-slate-950',
      },
      mancanti: {
        title: 'Dati & Contatori Mancanti',
        subtitle: 'Spunta o inserisci letture in tempo reale',
        badgeClass: 'bg-sky-600 text-white',
      },
      completati: {
        title: 'Rendiconti Completati',
        subtitle: 'Bilanci chiusi / pronti per rinnovo +1 anno',
        badgeClass: 'bg-teal-600 text-white',
      },
    };

    const currentKpiMeta = kpiTitleMap[selectedKpiCard];

    return (
      <div className="flex flex-col h-screen bg-slate-900 font-sans text-slate-100 antialiased overflow-hidden select-none">
        {/* TOP BAR COMPATTA WIDGET DESKTOP */}
        <header className="bg-slate-950 border-b border-slate-800 px-3 py-2.5 flex items-center justify-between gap-2 shrink-0 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/logo-studio-serra.png"
              alt="Studio Serra"
              className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs text-white truncate">Studio Serra</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">Widget Dashboard Scadenze & Dati</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => loadAllData()}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer"
              title="Aggiorna dati adesso"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                window.open(window.location.origin, '_blank');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] transition shadow-xs cursor-pointer"
              title="Apri il programma a schermo intero in una scheda del browser"
            >
              App Completa ↗
            </button>
          </div>
        </header>

        {/* TOAST NOTIFICHE */}
        {toast && (
          <div className="fixed bottom-3 inset-x-3 z-50 bg-slate-950 text-white px-3 py-2 rounded-xl shadow-2xl border border-amber-500/50 flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{toast}</span>
          </div>
        )}

        {/* BARRA KPI COMPATTA (7 PULSANTI) */}
        <div className="bg-slate-900/95 border-b border-slate-800 p-2.5 shrink-0 space-y-2">
          <div className="grid grid-cols-7 gap-1">
            <button
              type="button"
              onClick={() => setSelectedKpiCard('pronti')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'pronti'
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-emerald-300 border border-slate-700/80'
              }`}
              title="Gestioni chiuse con 100% dati pronti"
            >
              <span className="text-base font-black leading-none">{stats.prontiDaFareCount}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Pronti
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('attesa_assemblea')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'attesa_assemblea'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-purple-300 border border-slate-700/80'
              }`}
              title="In Attesa Assemblea (Prima della riunione: Ordinarie al Passo 57 + Straordinarie)"
            >
              <span className="text-base font-black leading-none">{stats.attesaAssembleaCount}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Attesa Ass.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('convocate_verbale')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'convocate_verbale'
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-indigo-300 border border-slate-700/80'
              }`}
              title="Completamento Procedura (Assemblea fatta: Passi 58–62 e Verbale/Firma)"
            >
              <span className="text-base font-black leading-none">{stats.convocateVerbaleCount}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Post-Ass.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('urgenti')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'urgenti'
                  ? 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-rose-300 border border-slate-700/80'
              }`}
              title="Scadenze imminenti entro 60 giorni"
            >
              <span className="text-base font-black leading-none">{stats.urgenti60gg}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                ≤ 60gg
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('chiuse')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'chiuse'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-200 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-amber-300 border border-slate-700/80'
              }`}
              title="Gestioni chiuse (termine 180gg)"
            >
              <span className="text-base font-black leading-none">{stats.chiuse}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Chiuse
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('mancanti')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'mancanti'
                  ? 'bg-sky-600 text-white ring-2 ring-sky-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-sky-300 border border-slate-700/80'
              }`}
              title="Condomini con dati o contatori mancanti"
            >
              <span className="text-base font-black leading-none">{stats.datiMancantiCount}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Mancanti
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpiCard('completati')}
              className={`p-1.5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                selectedKpiCard === 'completati'
                  ? 'bg-teal-600 text-white ring-2 ring-teal-300 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-teal-300 border border-slate-700/80'
              }`}
              title="Rendiconti completati"
            >
              <span className="text-base font-black leading-none">{stats.completati}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-tight mt-1 leading-tight">
                Fatti
              </span>
            </button>
          </div>

          {/* RICERCA RAPIDA NEL WIDGET */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={condoSearchFilter}
              onChange={(e) => setCondoSearchFilter(e.target.value)}
              placeholder="Cerca condominio o codice Danea..."
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            {condoSearchFilter && (
              <button
                type="button"
                onClick={() => setCondoSearchFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* INTESTAZIONE SEZIONE ATTIVA */}
        <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xs font-extrabold text-white truncate">{currentKpiMeta.title}</h2>
            <p className="text-[10px] text-slate-400 truncate">{currentKpiMeta.subtitle}</p>
          </div>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${currentKpiMeta.badgeClass}`}>
            {selectedKpiCard === 'convocate_verbale'
              ? stats.convocateVerbaleCount
              : selectedKpiCard === 'attesa_assemblea'
              ? stats.attesaAssembleaCount
              : activeWidgetList.length}
          </span>
        </div>

        {/* ELENCO SCORREVOLE CONDOMINI DEL KPI SELEZIONATO */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
          {selectedKpiCard === 'attesa_assemblea' || selectedKpiCard === 'convocate_verbale' ? (
            (() => {
              const isFaseCompletamento = selectedKpiCard === 'convocate_verbale';
              const targetAssemblee = isFaseCompletamento
                ? stats.assembleeCompletamentoList
                : stats.assembleeInAttesaList;

              if (targetAssemblee.length === 0) {
                return (
                  <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 text-center space-y-2">
                    <CheckCircle2 className="w-7 h-7 text-indigo-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-200">
                      {isFaseCompletamento
                        ? 'Nessuna assemblea nella fase Completamento Procedura (Post-Assemblea)'
                        : 'Nessuna assemblea in attesa di svolgimento'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setInitialAssembleeFilter(
                          isFaseCompletamento ? 'post_assemblea' : 'in_organizzazione'
                        );
                        setActiveTab('assemblee');
                        setIsWidgetMode(false);
                      }}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold transition cursor-pointer"
                    >
                      Apri Gestione Assemblee
                    </button>
                  </div>
                );
              }

              return targetAssemblee.map((a) => {
                const isOrdinaria = a.tipo === 'Ordinaria';
                return (
                  <div
                    key={a.id}
                    className={`bg-slate-800/90 hover:bg-slate-800 border rounded-xl p-3 shadow-sm space-y-2.5 transition ${
                      isOrdinaria ? 'border-purple-500/40' : 'border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {a.condominio_codice_danea && (
                            <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                              {a.condominio_codice_danea}
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${
                              isOrdinaria
                                ? 'bg-purple-600 text-white'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                          >
                            {isOrdinaria ? 'Ordinaria (58–62)' : 'Straordinaria'}
                          </span>
                          <h3 className="font-extrabold text-xs text-white truncate">
                            {a.condominio_nome}
                          </h3>
                        </div>
                        <p className="text-[11px] font-bold text-amber-300 truncate mt-0.5">
                          {a.titolo}
                        </p>
                      </div>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                        {a.passi_completati}/{a.totale_passi} Passi
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 bg-slate-900/90 rounded-lg p-2 border border-slate-700/70 text-[10px]">
                      <div>
                        <span className="text-slate-400 block uppercase font-bold text-[9px]">Data</span>
                        <span className="text-white font-mono font-bold">
                          {a.data_assemblea
                            ? new Date(a.data_assemblea).toLocaleDateString('it-IT')
                            : 'Da fissare'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-bold text-[9px]">Ora</span>
                        <span className="text-white font-mono font-bold">{a.ora_assemblea || '--:--'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-bold text-[9px]">Posto / Sala</span>
                        <span className="text-white font-semibold truncate block">
                          {a.luogo_sala || 'Non ind.'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {a.scaletta.map((step) => (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => handleTogglePassoAssembleaFromDashboard(a, step.id)}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[10px] font-semibold border transition cursor-pointer ${
                            step.fatto
                              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-indigo-500'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            {step.fatto ? (
                              <CheckSquare className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Square className="w-3 h-3 text-indigo-400 shrink-0" />
                            )}
                            <span className="truncate">{step.titolo}</span>
                          </span>
                          {step.data_spunta && (
                            <span className="text-[9px] text-emerald-400 font-mono shrink-0">
                              {step.data_spunta}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleAssembleaSvoltaFromDashboard(a, !isFaseCompletamento)
                        }
                        className={`flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                          isFaseCompletamento
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {isFaseCompletamento
                          ? '↩ Riporta in Attesa Assemblea'
                          : '✓ Assemblea Fatta → Passa a Completamento'}
                      </button>
                    </div>
                  </div>
                );
              });
            })()
          ) : activeWidgetList.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 text-center space-y-1.5">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
              <p className="text-xs font-bold text-slate-200">Nessun condominio in questa vista</p>
              <p className="text-[11px] text-slate-400">
                Seleziona un altro riquadro KPI in alto per visualizzare le altre scadenze.
              </p>
            </div>
          ) : (
            activeWidgetList.map((c) => {
              const g = c.scadenzaInfo?.giorniRimanenti ?? null;
              const isOltre180 = g !== null && g < 0;
              const isUrgente = g !== null && g <= 60;
              const rendProg = getRendicontoProgressForCondo(c.id);

              return (
                <div
                  key={c.id}
                  className="bg-slate-800/90 hover:bg-slate-800 border border-slate-700/90 rounded-xl p-3 shadow-sm space-y-2.5 transition"
                >
                  {/* RIGA 1: CODICE DANEA, NOME E BADGE GIORNI SCADENZA */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          {c.codice_danea}
                        </span>
                        <h3 className="font-extrabold text-xs text-white truncate">{c.nome}</h3>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        Chiusura: <strong className="text-slate-200">{c.scadenzaInfo?.fineFormatted}</strong> • Limite 180gg:{' '}
                        <strong className="text-slate-200">{c.scadenzaInfo?.scadenzaFormatted}</strong>
                      </p>
                    </div>

                    {g !== null && (
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                          isOltre180
                            ? 'bg-rose-600 text-white'
                            : isUrgente
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isOltre180 ? `Scad. ${Math.abs(g)}gg fa` : `tra ${g}gg`}
                      </span>
                    )}
                  </div>

                  {/* RIGA 2: AVANZAMENTO PROCEDURA (PASSI 1-57 + EVENTUALE ATTESA ASSEMBLEA 58-62) */}
                  <div className="bg-slate-900/90 rounded-lg px-2.5 py-1.5 border border-slate-700/70 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-semibold">
                        {rendProg.inAttesaAssemblea
                          ? '🏛️ Attesa Assemblea (100% al Passo 57)'
                          : 'Avanzamento Rendiconto (Passi 1–57)'}
                      </span>
                      <span className="font-extrabold text-emerald-400">
                        {rendProg.pctFormatted} ({rendProg.passiCompletati}/{rendProg.totalePassi})
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, rendProg.percentualeFatto))}%` }}
                      />
                    </div>
                    {(rendProg.inAttesaAssemblea || rendProg.postAssembleaCompletati > 0) && (
                      <div className="flex items-center justify-between text-[10px] pt-0.5 text-purple-300 font-bold">
                        <span>Ultimi 5 Passi Post-Assemblea (58–62):</span>
                        <span>
                          {rendProg.postAssembleaCompletati}/{rendProg.postAssembleaTotale} completati
                        </span>
                      </div>
                    )}
                  </div>

                  {/* RIGA 3: DATI MANCANTI INTERATTIVI (SE PRESENTI) */}
                  {c.mancanti && c.mancanti.length > 0 && (
                    <div className="bg-sky-950/40 border border-sky-800/60 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-sky-300">
                        <span>Dati da recuperare ({c.mancanti.length}):</span>
                        <span className="text-[9px] text-sky-400">Spunta richiesta o acquisizione</span>
                      </div>
                      <div className="space-y-1.5">
                        {c.mancanti.map((doc: DocumentoNecessario) => (
                          <div
                            key={doc.id}
                            className="bg-slate-900/90 rounded-md p-1.5 border border-slate-700/80 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleRecuperato(c.id, doc.id)}
                                className="flex items-center gap-1.5 text-left text-[11px] font-semibold text-slate-200 hover:text-emerald-300 transition cursor-pointer min-w-0"
                                title="Clicca per segnare come recuperato"
                              >
                                <Square className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="truncate">{doc.titolo}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleRichiestaInviata(c.id, doc.id)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 transition cursor-pointer ${
                                  doc.richiesta_inviata
                                    ? 'bg-sky-600 border-sky-500 text-white'
                                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-sky-500 hover:text-sky-300'
                                }`}
                                title="Spunta se la comunicazione/richiesta dei dati è stata inviata"
                              >
                                {doc.richiesta_inviata ? (
                                  <CheckSquare className="w-3 h-3 shrink-0" />
                                ) : (
                                  <Square className="w-3 h-3 shrink-0" />
                                )}
                                <span>Richiesta inviata</span>
                              </button>
                            </div>
                            <input
                              type="text"
                              value={doc.valore || ''}
                              onChange={(e) => handleUpdateDocField(c.id, doc.id, 'valore', e.target.value)}
                              placeholder="Annota lettura / valore / rif..."
                              className="w-full px-2 py-1 text-[10px] rounded bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RIGA 4: AZIONI RAPIDE */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCondoForRendiconto(c.id);
                        setActiveTab('rendiconto');
                        setIsWidgetMode(false);
                      }}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Apri Procedura 63 Passi</span>
                    </button>

                    {c.rendiconto_stato !== 'completato' ? (
                      <button
                        type="button"
                        onClick={() => handleToggleStatoRendiconto(c.id, 'completato')}
                        className="py-1.5 px-2.5 rounded-lg bg-slate-700 hover:bg-emerald-600 text-slate-200 hover:text-white font-bold text-[10px] transition cursor-pointer shrink-0"
                        title="Segna il rendiconto come completato"
                      >
                        ✓ Fatto
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                        className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition cursor-pointer shrink-0"
                        title="Rinnova esercizio all'anno successivo (+1 anno)"
                      >
                        🔄 +1 Anno
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      {/* SIDEBAR DEDICATA AL RENDICONTO (nascosta su smartphone o se richiesta vista singola/senza sidebar) */}
      {!HIDE_SIDEBAR && (
      <aside className="hidden md:flex w-72 bg-slate-950 text-white flex-col justify-between shrink-0 shadow-2xl z-20">
        <div>
          {/* Logo & Titolo */}
          <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
            <img
              src="/logo-studio-serra.png"
              alt="Studio Serra"
              className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 shadow-lg shrink-0"
            />
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white leading-tight">
                Studio Serra
              </h1>
              <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                <span>Gestione Rendiconti</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-amber-400/20 text-amber-300 rounded">Mod. 5</span>
              </p>
            </div>
          </div>

          {/* Navigazione essenziale: solo Rendiconto e Dati */}
          <nav className="p-3 space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard Scadenze & Dati
              </span>
              {stats.urgenti60gg > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                  {stats.urgenti60gg}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('condomini')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'condomini'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Building2 className="w-4 h-4" />
                Condomini & Checklist Dati
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                {condomini.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rendiconto')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'rendiconto'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <FileSpreadsheet className="w-4 h-4" />
                Procedura Rendiconto
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold">
                58+5 Passi
              </span>
            </button>

            <button
              onClick={() => setActiveTab('assemblee')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'assemblee'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                Gestione Assemblee
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/25 text-purple-200 font-bold">
                {stats.assembleeAttiveCount > 0
                  ? `${stats.assembleeAttiveCount} Attive`
                  : '5 Passi'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('impostazioni')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'impostazioni'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Settings className="w-4 h-4" />
                Impostazioni Passaggi
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 font-bold">
                {getCustomPassiTemplate().length} Passi
              </span>
            </button>

            <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-3">
              <button
                onClick={() => setShowMobileModal(true)}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/60 transition shadow-sm"
              >
                <span className="flex items-center gap-2.5">
                  <QrCode className="w-4 h-4 text-amber-400" />
                  Usa da Cellulare (Wi-Fi)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  QR
                </span>
              </button>

              {/* INDICATORE STATO AVANZAMENTO PROCEDURA RENDICONTO (visibile solo dentro la procedura di rendiconto) */}
              {activeTab === 'rendiconto' && activeRendicontoProgress && (() => {
                const rawPct = Math.min(
                  100,
                  Math.max(0, Number(activeRendicontoProgress.percentualeFatto) || 0)
                );
                const pctFormatted = rawPct.toFixed(1).replace('.0', '').replace('.', ',');
                const remPctFormatted = Math.max(0, 100 - rawPct)
                  .toFixed(1)
                  .replace('.0', '')
                  .replace('.', ',');
                const indicatorLeft = Math.min(90, Math.max(10, rawPct));
                const restanti = Math.max(
                  0,
                  activeRendicontoProgress.totalePassi - activeRendicontoProgress.passiCompletati
                );
                const postDone = activeRendicontoProgress.postAssembleaCompletati ?? 0;
                const postTot = activeRendicontoProgress.postAssembleaTotale ?? 5;
                const inAttesa = Boolean(
                  activeRendicontoProgress.inAttesaAssemblea ?? (rawPct >= 100 && postDone < postTot)
                );

                return (
                  <div className="rounded-xl bg-gradient-to-b from-slate-900 to-indigo-950/90 border border-amber-500/30 p-3.5 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Avanzamento (1–57)</span>
                      </span>
                      {activeRendicontoProgress.condominioCodiceDanea && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-indigo-200 font-bold">
                          {activeRendicontoProgress.condominioCodiceDanea}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-white/10">
                      <div className="text-xs font-extrabold text-white truncate">
                        {activeRendicontoProgress.condominioNome}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {activeRendicontoProgress.gestione}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="font-bold text-amber-300 text-[11px] uppercase tracking-wide">
                        % Pre-Assemblea
                      </span>
                      <span className="font-extrabold text-white flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs">
                          {rawPct >= 100 ? '100% ESEGUITO' : `${pctFormatted}%`}
                        </span>
                        <span className="text-[11px] text-slate-300 font-semibold">
                          ({activeRendicontoProgress.passiCompletati}/{activeRendicontoProgress.totalePassi})
                        </span>
                      </span>
                    </div>

                    {/* Barra di avanzamento con indicatore mobile sulla % effettivamente lavorata */}
                    <div className="relative pt-5 pb-0.5">
                      <div
                        className="absolute top-0 -translate-x-1/2 z-10 flex flex-col items-center transition-all duration-300"
                        style={{ left: `${indicatorLeft}%` }}
                      >
                        <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-black text-[10px] leading-none shadow-md border border-white/60 whitespace-nowrap">
                          {pctFormatted}%
                        </span>
                        <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-emerald-400" />
                      </div>

                      <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-white/20 relative shadow-inner">
                        <div className="absolute inset-0 grid grid-cols-4 pointer-events-none">
                          <div className="border-r border-white/10" />
                          <div className="border-r border-white/15" />
                          <div className="border-r border-white/10" />
                          <div />
                        </div>
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 via-teal-400 to-emerald-400 transition-all duration-300 relative rounded-r-full shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                          style={{ width: `${rawPct}%` }}
                        >
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white ring-2 ring-emerald-400 shadow" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-300 pt-0.5">
                      <span className="text-emerald-300 font-bold">
                        Fatti: {activeRendicontoProgress.passiCompletati} ({pctFormatted}%)
                      </span>
                      <span className="text-slate-400">
                        Da fare: {restanti} ({remPctFormatted}%)
                      </span>
                    </div>

                    <div
                      className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-between ${
                        inAttesa
                          ? 'bg-violet-500/25 border-violet-400/50 text-violet-200'
                          : postDone >= postTot && rawPct >= 100
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                          : 'bg-slate-950/60 border-white/10 text-slate-300'
                      }`}
                    >
                      <span>
                        {inAttesa
                          ? '🏛️ In Attesa Assemblea'
                          : postDone >= postTot && rawPct >= 100
                          ? '✅ Post-Assemblea chiuso'
                          : '🏛️ Post-Assemblea (58–62)'}
                      </span>
                      <span className="font-mono font-extrabold">
                        {postDone}/{postTot}
                      </span>
                    </div>

                    {activeRendicontoProgress.passoAttivoCodice && (
                      <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Scheda attiva:</span>
                        <span className="font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-400/30">
                          Passo #{activeRendicontoProgress.passoAttivoCodice}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </nav>
        </div>

        {/* Footer Sidebar con Manuale PDF e Riferimenti Normativi */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2.5 bg-slate-950/60">
          <a
            href="/Manuale_d_Uso_Studio_Serra_Modello5.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition shadow-md hover:shadow-lg mb-1"
            title="Apri il Manuale d'Uso completo in formato PDF"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-950 shrink-0" />
              <span>Manuale d'Uso (PDF)</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/20 text-slate-950 font-black uppercase">
              Apri
            </span>
          </a>

          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-300 font-medium">Termine 180gg</span>
            <span className="text-amber-400 font-bold">Art. 1130 c.c.</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">Procedura 002</span>
            <span className="text-emerald-400 font-bold">Modello 5</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">Salvataggio Dati</span>
            <span className="text-emerald-400 font-bold">Automatico</span>
          </div>
        </div>
      </aside>
      )}

      {/* AREA PRINCIPALE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER SUPERIORE */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-30 shadow-sm">
          {!IS_EMBED_MODE && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-extrabold text-slate-950 text-sm shadow shrink-0">
                R5
              </div>
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2 sm:px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200 truncate">
                Studio Serra • Rendiconti
              </span>
              <span className="text-xs text-slate-500 hidden xl:inline truncate">
                Controllo adempimenti, recupero contatori acqua/riscaldamento e redazione bilanci
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowMobileModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold transition shadow-sm"
              title="Apri sul cellulare tramite QR Code Wi-Fi"
            >
              <Smartphone className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">Usa da Cellulare (QR)</span>
              <span className="sm:hidden">QR</span>
            </button>

            <button
              onClick={() => setActiveTab('assemblee')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 text-xs font-bold transition shadow-sm"
            >
              <Users className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Gestione Assemblee</span>
            </button>

            <button
              onClick={() => setActiveTab('rendiconto')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Procedura Modello 5</span>
            </button>

            <button
              onClick={() => setActiveTab('impostazioni')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm cursor-pointer ${
                activeTab === 'impostazioni'
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
              title="Impostazioni: modifica, aggiungi o elimina i passaggi del Rendiconto"
            >
              <Settings className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Impostazioni</span>
            </button>

            <button
              onClick={() => loadAllData()}
              disabled={loading}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
              title="Ricarica dati"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {!IS_EMBED_MODE && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 transition"
                title="Esci dall'account"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* TOAST NOTIFICHE */}
        {toast && (
          <div className="fixed bottom-20 md:bottom-5 right-4 md:right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2.5 text-xs sm:text-sm font-medium max-w-[90vw]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* CONTENUTO PRINCIPALE */}
        <main className="p-3 sm:p-6 pb-24 md:pb-6 flex-1 overflow-y-auto">
          {/* TAB 1: DASHBOARD SCADENZE GESTIONI CHIUSE & DATI MANCANTI */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* BANNER DI RIEPILOGO */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-300">
                      Termine ex art. 1130 n. 10 c.c.
                    </span>
                    <span className="text-xs text-slate-400">180 giorni dalla chiusura esercizio</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-white">
                    Pannello Monitoraggio Rendiconti Studio Serra
                  </h2>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Hai <strong className="text-amber-400">{stats.chiuse} gestioni chiuse</strong> in attesa di
                    approvazione consuntivo. Di queste,{' '}
                    <strong className="text-emerald-400">{stats.prontiDaFareCount} rendiconti sono già pronti da redigere</strong>{' '}
                    (tutti i dati reperiti), <strong className="text-rose-400">{stats.urgenti60gg}</strong> hanno scadenza imminente entro 60 giorni
                    e <strong className="text-sky-300">{stats.datiMancantiCount} condomini</strong> necessitano ancora del
                    recupero dei dati essenziali.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('condomini')}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2"
                  >
                    <Building2 className="w-4 h-4" />
                    Gestisci Checklist Condomini
                  </button>
                </div>
              </div>

              {/* KPI TILES RENDICONTI & ASSEMBLEE (TUTTI CLICCABILI CON FINESTRA CORRISPONDENTE SOTTO) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
                {/* 1. GESTIONI CHIUSE (180GG) */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKpiCard('chiuse');
                    setSoloScadenzeImminenti(false);
                  }}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'chiuse'
                      ? 'bg-gradient-to-br from-amber-50 to-orange-50/70 border-2 border-amber-500 ring-4 ring-amber-200/60 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-amber-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span
                        className={`text-xs font-extrabold uppercase block ${
                          selectedKpiCard === 'chiuse' ? 'text-amber-900' : 'text-slate-400'
                        }`}
                      >
                        Gestioni Chiuse (180gg)
                      </span>
                      <div className="text-2xl font-black text-slate-900 mt-1">{stats.chiuse}</div>
                      <span className="text-xs text-slate-500 block">
                        su {stats.totali} condomini totali
                      </span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'chiuse'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'chiuse' ? 'text-amber-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'chiuse' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'chiuse' ? 'text-amber-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 2. PRONTI DA FARE */}
                <button
                  type="button"
                  onClick={() => setSelectedKpiCard('pronti')}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'pronti'
                      ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-500 ring-4 ring-emerald-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span
                        className={`text-xs font-extrabold uppercase block ${
                          selectedKpiCard === 'pronti' ? 'text-emerald-900' : 'text-emerald-700'
                        }`}
                      >
                        Pronti da Fare
                      </span>
                      <div className="text-2xl font-black text-emerald-700 mt-1">
                        {stats.prontiDaFareCount}
                      </div>
                      <span className="text-xs text-emerald-700 font-medium block">
                        scaduti • 100% dati
                      </span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'pronti'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-emerald-200/70 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'pronti' ? 'text-emerald-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'pronti' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'pronti' ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 2B. IN ATTESA ASSEMBLEA (ORDINARIE PASSO 57 + STRAORDINARIE PRIMA DELLA RIUNIONE) */}
                <button
                  type="button"
                  onClick={() => setSelectedKpiCard('attesa_assemblea')}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'attesa_assemblea'
                      ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-500 ring-4 ring-purple-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-purple-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span
                        className={`text-xs font-extrabold uppercase block ${
                          selectedKpiCard === 'attesa_assemblea' ? 'text-purple-900' : 'text-purple-700'
                        }`}
                      >
                        In Attesa Assemblea
                      </span>
                      <div className="text-2xl font-black text-purple-700 mt-1">
                        {stats.attesaAssembleaCount}
                      </div>
                      <span className="text-xs text-purple-700 font-medium block">
                        {stats.assembleeInAttesaOrdinarieCount} ord. (p.57) • {stats.assembleeInAttesaStraordinarieCount} straord.
                      </span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'attesa_assemblea'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-purple-50 text-purple-600'
                      }`}
                    >
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-purple-200/70 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'attesa_assemblea' ? 'text-purple-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'attesa_assemblea' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'attesa_assemblea' ? 'text-purple-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 2C. COMPLETAMENTO PROCEDURA (POST-ASSEMBLEA: PASSI 58–62 & VERBALE) */}
                <button
                  type="button"
                  onClick={() => setSelectedKpiCard('convocate_verbale')}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'convocate_verbale'
                      ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-500 ring-4 ring-indigo-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span
                        className={`text-[11px] font-extrabold uppercase block leading-tight ${
                          selectedKpiCard === 'convocate_verbale' ? 'text-indigo-900' : 'text-indigo-700'
                        }`}
                      >
                        Completamento Procedura
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-black text-indigo-800">
                          {stats.convocateVerbaleCount}
                        </span>
                      </div>
                      <span className="text-xs text-indigo-700 font-medium block">
                        Post-assemblea • {stats.assembleeCompletamentoOrdinarieCount} ord. • {stats.assembleeCompletamentoStraordinarieCount} straord.
                      </span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'convocate_verbale'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-indigo-50 text-indigo-600'
                      }`}
                    >
                      <FileSignature className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-indigo-200/70 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'convocate_verbale' ? 'text-indigo-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'convocate_verbale' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'convocate_verbale' ? 'text-indigo-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 3. SCADENZE IMMINENTI (<= 60GG) */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKpiCard('urgenti');
                    setSoloScadenzeImminenti(true);
                  }}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'urgenti'
                      ? 'bg-gradient-to-br from-rose-50 to-red-50/70 border-2 border-rose-500 ring-4 ring-rose-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-rose-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span className="text-xs font-extrabold uppercase text-rose-600 block">
                        Scadenze Imminenti (≤ 60gg)
                      </span>
                      <div className="text-2xl font-black text-rose-600 mt-1">{stats.urgenti60gg}</div>
                      <span className="text-xs text-rose-500 block">priorità di convocazione</span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'urgenti'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-rose-200/60 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'urgenti' ? 'text-rose-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'urgenti' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'urgenti' ? 'text-rose-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 4. DATI & CONTATORI MANCANTI */}
                <button
                  type="button"
                  onClick={() => setSelectedKpiCard('mancanti')}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'mancanti'
                      ? 'bg-gradient-to-br from-sky-50 to-indigo-50/70 border-2 border-sky-500 ring-4 ring-sky-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-sky-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span className="text-xs font-extrabold uppercase text-sky-600 block">
                        Dati & Contatori Mancanti
                      </span>
                      <div className="text-2xl font-black text-sky-700 mt-1">
                        {stats.datiMancantiCount}
                      </div>
                      <span className="text-xs text-sky-600 block">condomini con dati da reperire</span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'mancanti'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-sky-50 text-sky-600'
                      }`}
                    >
                      <Droplets className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-sky-200/60 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'mancanti' ? 'text-sky-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'mancanti' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'mancanti' ? 'text-sky-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>

                {/* 5. RENDICONTI COMPLETATI */}
                <button
                  type="button"
                  onClick={() => setSelectedKpiCard('completati')}
                  className={`text-left p-4 rounded-2xl transition flex flex-col justify-between cursor-pointer ${
                    selectedKpiCard === 'completati'
                      ? 'bg-gradient-to-br from-teal-50 to-emerald-50/70 border-2 border-teal-500 ring-4 ring-teal-200/70 shadow-md -translate-y-0.5'
                      : 'bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div>
                      <span className="text-xs font-extrabold uppercase text-teal-700 block">
                        Rendiconti Completati
                      </span>
                      <div className="text-2xl font-black text-teal-700 mt-1">{stats.completati}</div>
                      <span className="text-xs text-slate-500 block">bilanci approvati / chiusi</span>
                    </div>
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 transition ${
                        selectedKpiCard === 'completati'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-teal-200/60 flex items-center justify-between text-[11px] font-bold">
                    <span className={selectedKpiCard === 'completati' ? 'text-teal-800' : 'text-slate-400'}>
                      {selectedKpiCard === 'completati' ? '▼ Finestra aperta sotto' : 'Clicca per aprire elenco'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ${
                        selectedKpiCard === 'completati' ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>
              </div>

              {/* ===================================================================== */}
              {/* FINESTRA CORRISPONDENTE AL RIQUADRO KPI SELEZIONATO (APERTA SOTTO)    */}
              {/* ===================================================================== */}

              {/* FINESTRA KPI 2C: COMPLETAMENTO PROCEDURA (POST-ASSEMBLEA: PASSI 58–62 & VERBALE) */}
              {selectedKpiCard === 'convocate_verbale' && (
                <div className="bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/60 rounded-2xl border-2 border-indigo-500 ring-4 ring-indigo-100/70 shadow-lg overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-600/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <FileSignature className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            Completamento Procedura Post-Assemblea (Ordinarie Passi 58–62 & Straordinarie Verbale)
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                            {stats.convocateVerbaleCount} in completamento ({stats.assembleeCompletamentoOrdinarieCount} ord. • {stats.assembleeCompletamentoStraordinarieCount} straord.)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Assemblee <strong>già svolte</strong> (sia <strong>Ordinarie di Bilancio</strong> che <strong>Straordinarie</strong>) passate dalla fase "In Attesa Assemblea" alla fase di <strong>completamento della procedura post-assemblea</strong> (Passi 58–62 del Rendiconto e Passi 4–5 Firma Presidente / Invio Verbale ai condomini).
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCondoForAssemblee(null);
                          setInitialAssembleeFilter('post_assemblea');
                          setActiveTab('assemblee');
                        }}
                        className="text-xs text-white bg-indigo-700 hover:bg-indigo-600 px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <FileSignature className="w-3.5 h-3.5" />
                        <span>Apri Completamento in Gestione Assemblee</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCondoForAssemblee(null);
                          setInitialAssembleeFilter('tutte');
                          setActiveTab('assemblee');
                        }}
                        className="text-xs text-indigo-800 hover:text-indigo-950 bg-white hover:bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-300 font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <span>Tutte le Assemblee ({stats.allAssembleeUnificate.length})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {stats.assembleeCompletamentoList.length === 0 ? (
                    <div className="p-6 text-center space-y-2.5">
                      <p className="text-sm font-bold text-slate-800">
                        Nessuna assemblea si trova attualmente nel riquadro "Completamento Procedura" (Post-Assemblea).
                      </p>
                      <p className="text-xs text-slate-500 max-w-2xl mx-auto">
                        Prima dell'assemblea tutte le riunioni (Ordinarie al Passo 57 e Straordinarie) si trovano nel riquadro <strong>In Attesa Assemblea</strong>. Una volta svolta l'assemblea, clicca su <strong>"✓ Assemblea Fatta → Passa a Completamento"</strong> per trasferirle qui e completare i passaggi post-assemblea (Passi 58–62 o Firma/Invio Verbale).
                      </p>
                      <div className="pt-1 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedKpiCard('attesa_assemblea')}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Vedi Assemblee in Attesa ({stats.attesaAssembleaCount})</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.assembleeCompletamentoList.map((a) => {
                        const isOrdinaria = a.tipo === 'Ordinaria';
                        const postStepIds = isOrdinaria
                          ? ['passo_58', 'firma_presidente', 'invio_condomini', 'passo_61', 'passo_62']
                          : ['firma_presidente', 'invio_condomini'];
                        const postSteps = a.scaletta.filter((s) => postStepIds.includes(s.id));
                        const postFatti = postSteps.filter((s) => s.fatto).length;
                        return (
                          <div
                            key={a.id}
                            className="bg-white rounded-xl border-2 border-indigo-300 hover:border-indigo-500 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3 relative overflow-hidden"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {a.condominio_codice_danea && (
                                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300">
                                      {a.condominio_codice_danea}
                                    </span>
                                  )}
                                  <span
                                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                      isOrdinaria
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : 'bg-purple-100 text-purple-800 border-purple-200'
                                    }`}
                                  >
                                    {isOrdinaria ? 'Ordinaria • Passi 58–62' : 'Straordinaria • Verbale'}
                                  </span>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                                  Post: {postFatti}/{postSteps.length}
                                </span>
                              </div>

                              <div>
                                <h4 className="font-extrabold text-base text-slate-900 leading-snug">
                                  {a.condominio_nome}
                                </h4>
                                <p className="text-xs font-bold text-indigo-700 mt-0.5">{a.titolo}</p>
                              </div>

                              {/* DATA, ORA E POSTO / SALA IN EVIDENZA */}
                              <div className="grid grid-cols-3 gap-2 text-xs bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-200/80">
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-indigo-500 block">
                                    📅 Data Riunione
                                  </span>
                                  <span className="font-mono font-extrabold text-slate-900">
                                    {formatDataAssembleaIt(a.data_assemblea)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-indigo-500 block">
                                    🕒 Ora
                                  </span>
                                  <span className="font-mono font-extrabold text-slate-900">
                                    {a.ora_assemblea || '--:--'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-indigo-500 block">
                                    📍 Posto / Sala
                                  </span>
                                  <span
                                    className="font-bold text-slate-900 truncate block"
                                    title={a.luogo_sala || 'Non indicato'}
                                  >
                                    {a.luogo_sala || 'Non indicato'}
                                  </span>
                                </div>
                              </div>

                              {/* SCALETTA INTERATTIVA DIRETTAMENTE IN DASHBOARD */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700 pb-1 border-b border-slate-200">
                                  <span>
                                    {isOrdinaria
                                      ? 'Passi Post-Assemblea 58–62 (clicca per spuntare)'
                                      : 'Scaletta 5 Passi (clicca per spuntare)'}
                                  </span>
                                  <span className="text-indigo-700">
                                    {a.passi_completati}/{a.totale_passi} ({a.percentuale}%)
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {(isOrdinaria ? postSteps : a.scaletta).map((step) => (
                                    <button
                                      key={step.id}
                                      type="button"
                                      onClick={() => handleTogglePassoAssembleaFromDashboard(a, step.id)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-semibold border transition cursor-pointer ${
                                        step.fatto
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                          : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        {step.fatto ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                        )}
                                        <span className="truncate">{step.titolo}</span>
                                      </span>
                                      {step.data_spunta && (
                                        <span className="text-[10px] font-mono text-emerald-700 shrink-0">
                                          {step.data_spunta}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleAssembleaSvoltaFromDashboard(a, false)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                                title="Riporta questa assemblea nel riquadro 'In Attesa Assemblea'"
                              >
                                ↩ Riporta in Attesa
                              </button>

                              <div className="flex items-center gap-1.5">
                                {isOrdinaria && (
                                  <button
                                    type="button"
                                    onClick={() => handleRinnovaEsercizioAnnoSuccessivo(a.condominio_id)}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                                    title="Assemblea conclusa: rinnova automaticamente l'esercizio all'anno successivo (+1 anno)"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Chiudi & Rinnova (+1a)</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCondoForAssemblee(a.condominio_id);
                                    setInitialAssembleeFilter('post_assemblea');
                                    setActiveTab('assemblee');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                                >
                                  <span>Apri Scheda</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* FINESTRA KPI 2B: IN ATTESA ASSEMBLEA (ORDINARIE PASSO 57 + STRAORDINARIE PRIMA DELLA RIUNIONE) */}
              {selectedKpiCard === 'attesa_assemblea' && (
                <div className="bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/60 rounded-2xl border-2 border-purple-500 ring-4 ring-purple-100/70 shadow-lg overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-600/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            In Attesa dell'Assemblea — Ordinarie (Passo 57) & Straordinarie
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-600 text-white shadow-xs">
                            {stats.attesaAssembleaCount} in attesa ({stats.assembleeInAttesaOrdinarieCount} ord. • {stats.assembleeInAttesaStraordinarieCount} straord.)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Tutte le assemblee <strong>prima dello svolgimento della riunione</strong>: sia le{' '}
                          <strong>Assemblee Ordinarie di Bilancio</strong> arrivate al 100% (Passo #57 inviato), sia le{' '}
                          <strong>Assemblee Straordinarie</strong> in fase pre-assemblea (OdG, Sala, Convocazioni).{' '}
                          <strong>Una volta fatta l'assemblea</strong>, clicca su{' '}
                          <em>"✓ Assemblea Fatta → Passa a Completamento"</em> per spostarla nel riquadro{' '}
                          <strong>Completamento Procedura</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCondoForAssemblee(null);
                          setInitialAssembleeFilter('in_organizzazione');
                          setActiveTab('assemblee');
                        }}
                        className="text-xs text-white bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Apri in Gestione Assemblee</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroStato('attesa_assemblea');
                          setActiveTab('condomini');
                        }}
                        className="text-xs text-purple-800 hover:text-purple-950 bg-white hover:bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-300 font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <span>Filtra nell'elenco condomini</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {stats.assembleeInAttesaList.length === 0 ? (
                    <div className="p-6 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Nessuna assemblea (ordinaria o straordinaria) si trova attualmente in attesa della riunione.
                      </p>
                      <p className="text-xs text-slate-500 max-w-2xl mx-auto">
                        Qui confluiscono automaticamente sia i <strong>Condomini con Rendiconto al 100% (Passo #57)</strong> sia le <strong>Assemblee Straordinarie</strong> prima che si tenga l'assemblea. Una volta svolta la riunione, passano al riquadro <strong>Completamento Procedura</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.assembleeInAttesaList.map((a) => {
                        const isOrdinaria = a.tipo === 'Ordinaria';
                        const condoObj = condomini.find((c) => c.id === a.condominio_id);
                        const scadenzaInfo = condoObj ? getScadenzaInfo(condoObj) : null;
                        const g = scadenzaInfo?.giorniRimanenti ?? null;
                        const isOltre180 = g !== null && g < 0;
                        const isUrgente = g !== null && g <= 60;
                        const preSteps = (a.scaletta || []).filter((s) =>
                          ['odg', 'sala', 'convocazioni'].includes(s.id)
                        );
                        const preFatti = preSteps.filter((s) => s.fatto).length;

                        return (
                          <div
                            key={a.id}
                            className="bg-white rounded-xl border-2 border-purple-300 hover:border-purple-500 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3 relative overflow-hidden"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {a.condominio_codice_danea && (
                                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300">
                                      {a.condominio_codice_danea}
                                    </span>
                                  )}
                                  <span
                                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                      isOrdinaria
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : 'bg-amber-100 text-amber-900 border-amber-300'
                                    }`}
                                  >
                                    {isOrdinaria ? 'Assemblea Ordinaria' : 'Assemblea Straordinaria'}
                                  </span>
                                </div>
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs ${
                                    isOrdinaria
                                      ? 'bg-emerald-600 text-white'
                                      : preFatti === 3
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-amber-500 text-slate-950'
                                  }`}
                                >
                                  {isOrdinaria
                                    ? '✓ 100% (Passo 57)'
                                    : preFatti === 3
                                    ? 'Convocata (3/3)'
                                    : `Pre-Assemblea (${preFatti}/3)`}
                                </span>
                              </div>

                              <div>
                                <h4 className="font-extrabold text-base text-slate-900 leading-snug">
                                  {a.condominio_nome}
                                </h4>
                                <p className="text-xs font-bold text-purple-700 mt-0.5">{a.titolo}</p>
                              </div>

                              {/* DATA, ORA E POSTO / SALA IN EVIDENZA */}
                              <div className="grid grid-cols-3 gap-2 text-xs bg-purple-50/70 p-2.5 rounded-xl border border-purple-200/80">
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-purple-600 block">
                                    📅 Data Riunione
                                  </span>
                                  <span className="font-mono font-extrabold text-slate-900">
                                    {formatDataAssembleaIt(a.data_assemblea)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-purple-600 block">
                                    🕒 Ora
                                  </span>
                                  <span className="font-mono font-extrabold text-slate-900">
                                    {a.ora_assemblea || '--:--'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold text-purple-600 block">
                                    📍 Posto / Sala
                                  </span>
                                  <span
                                    className="font-bold text-slate-900 truncate block"
                                    title={a.luogo_sala || 'Non indicato'}
                                  >
                                    {a.luogo_sala || 'Non indicato'}
                                  </span>
                                </div>
                              </div>

                              {isOrdinaria && scadenzaInfo && (
                                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                      Chiusura Gestione
                                    </span>
                                    <span className="font-mono font-bold text-slate-800">
                                      {scadenzaInfo.fineFormatted}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                      Termine 180gg
                                    </span>
                                    <span
                                      className={`font-mono font-bold ${
                                        isOltre180
                                          ? 'text-rose-600'
                                          : isUrgente
                                          ? 'text-amber-700'
                                          : 'text-slate-800'
                                      }`}
                                    >
                                      {scadenzaInfo.scadenzaFormatted}{' '}
                                      {g !== null && (
                                        <span className="text-[10px]">
                                          ({g < 0 ? `scad. da ${Math.abs(g)}gg` : `${g}gg`})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* PASSI PRE-ASSEMBLEA (1-3: OdG, Sala, Convocazioni) */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700 pb-1 border-b border-slate-200">
                                  <span>Preparazione Assemblea (Passi 1–3)</span>
                                  <span className="text-purple-700">
                                    {preFatti}/{preSteps.length} fatti
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {preSteps.map((step) => (
                                    <button
                                      key={step.id}
                                      type="button"
                                      onClick={() => handleTogglePassoAssembleaFromDashboard(a, step.id)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-semibold border transition cursor-pointer ${
                                        step.fatto
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                          : 'bg-white border-slate-200 text-slate-700 hover:border-purple-400'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        {step.fatto ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                        )}
                                        <span className="truncate">{step.titolo}</span>
                                      </span>
                                      {step.data_spunta && (
                                        <span className="text-[10px] font-mono text-emerald-700 shrink-0">
                                          {step.data_spunta}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleToggleAssembleaSvoltaFromDashboard(a, true)}
                                className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Segna l'assemblea come svolta e trasferiscila nel riquadro 'Completamento Procedura' (Passi 58–62 / Verbale)"
                              >
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>✓ Assemblea Fatta → Passa a Completamento</span>
                              </button>

                              <div className="flex items-center justify-between gap-1.5">
                                {isOrdinaria && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCondoForRendiconto(a.condominio_id);
                                      setActiveTab('rendiconto');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                                  >
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                    <span>Rendiconto</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCondoForAssemblee(a.condominio_id);
                                    setInitialAssembleeFilter('in_organizzazione');
                                    setActiveTab('assemblee');
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <span>Apri in Gestione Assemblee</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* FINESTRA KPI 2: PRONTI DA FARE */}
              {selectedKpiCard === 'pronti' && (
                <div className="bg-gradient-to-br from-emerald-50/90 via-white to-amber-50/60 rounded-2xl border-2 border-emerald-500 ring-4 ring-emerald-100/70 shadow-lg overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-600/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            Rendiconti Scaduti Pronti da Redigere
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                            {stats.prontiDaFareCount}{' '}
                            {stats.prontiDaFareCount === 1 ? 'Condominio Pronto' : 'Condomini Pronti'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Gestioni chiuse per le quali <strong>non ci sono altri dati da reperire</strong> (0 dati richiesti oppure 100% letture acquisite): puoi procedere subito con il rendiconto
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setFiltroStato('pronti');
                        setActiveTab('condomini');
                      }}
                      className="text-xs text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-300 font-bold flex items-center gap-1.5 self-start sm:self-auto shadow-xs transition"
                    >
                      <span>Filtra nell'elenco condomini</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {stats.condominiProntiDaFareList.length === 0 ? (
                    <div className="p-6 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Al momento nessun condominio con gestione chiusa ha completato il 100% dei dati richiesti.
                      </p>
                      <p className="text-xs text-slate-500">
                        Non appena spunterai tutti i documenti necessari (acqua, riscaldamento) di una gestione scaduta, apparirà in evidenza qui.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.condominiProntiDaFareList.map((c) => {
                        const g = c.scadenzaInfo.giorniRimanenti;
                        const isOltre180 = g !== null && g < 0;
                        const isUrgente = g !== null && g <= 60;
                        const rendProg = getRendicontoProgressForCondo(c.id);

                        return (
                          <div
                            key={c.id}
                            className="bg-white rounded-xl border-2 border-emerald-300 hover:border-emerald-500 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3 relative overflow-hidden"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                                  {c.codice_danea}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  100% Dati Pronti
                                </span>
                              </div>

                              <div>
                                <h4 className="font-extrabold text-base text-slate-900 leading-snug">
                                  {c.nome}
                                </h4>
                                <p className="text-xs text-slate-500 truncate">
                                  {c.indirizzo}, {c.citta}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-1 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    Chiusura Gestione
                                  </span>
                                  <span className="font-mono font-bold text-slate-800">
                                    {c.scadenzaInfo.fineFormatted}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    Termine 180gg
                                  </span>
                                  <span
                                    className={`font-mono font-bold ${
                                      isOltre180
                                        ? 'text-rose-600'
                                        : isUrgente
                                        ? 'text-amber-700'
                                        : 'text-slate-800'
                                    }`}
                                  >
                                    {c.scadenzaInfo.scadenzaFormatted}{' '}
                                    {g !== null && (
                                      <span className="text-[10px]">
                                        ({g < 0 ? `scad. da ${Math.abs(g)}gg` : `${g}gg`})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-xs text-emerald-800 bg-emerald-50/80 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                                <span className="font-semibold flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  {c.richiesti.length === 0
                                    ? '0 dati da recuperare'
                                    : 'Tutti i dati acquisiti'}
                                </span>
                                <span className="font-mono font-bold text-[11px]">
                                  {c.richiesti.length === 0
                                    ? 'Pronto'
                                    : `${c.richiesti.length}/${c.richiesti.length} doc`}
                                </span>
                              </div>

                              {/* AVANZAMENTO PROCEDURA RENDICONTO */}
                              <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span>Avanzamento Procedura Rendiconto</span>
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {rendProg.passiCompletati}/{rendProg.totalePassi} passi
                                    </span>
                                    <span
                                      className={`text-xs font-extrabold px-2 py-0.5 rounded-full border shadow-2xs ${
                                        rendProg.percentualeFatto >= 100
                                          ? 'bg-emerald-600 text-white border-emerald-700'
                                          : rendProg.percentualeFatto > 0
                                          ? 'bg-amber-500 text-slate-950 border-amber-600'
                                          : 'bg-slate-200 text-slate-700 border-slate-300'
                                      }`}
                                    >
                                      {rendProg.pctFormatted}
                                    </span>
                                  </div>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200/90 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      rendProg.percentualeFatto >= 100
                                        ? 'bg-emerald-500'
                                        : rendProg.percentualeFatto >= 50
                                        ? 'bg-amber-500'
                                        : rendProg.percentualeFatto > 0
                                        ? 'bg-indigo-500'
                                        : 'bg-slate-300'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, rendProg.percentualeFatto))}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                              <button
                                onClick={() => {
                                  setExpandedCondoId(c.id);
                                  setActiveTab('condomini');
                                }}
                                className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                              >
                                Dati
                              </button>

                              <button
                                onClick={() => handleToggleStatoRendiconto(c.id, 'completato')}
                                className="px-2.5 py-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-xs transition flex items-center gap-1"
                                title="Segna questo rendiconto come completato/approvato"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Fatto</span>
                              </button>

                              <button
                                onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                                className="px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1"
                                title="Rendiconto fatto: rinnova automaticamente l'esercizio all'anno successivo (+1 anno) e ricalcola la scadenza 180gg"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Fatto & Rinnova (+1a)</span>
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedCondoForRendiconto(c.id);
                                  setActiveTab('rendiconto');
                                }}
                                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>Compila</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* FINESTRA KPI 1 & 3: GESTIONI CHIUSE (180GG) oppure SCADENZE IMMINENTI (<= 60GG) */}
              {(selectedKpiCard === 'chiuse' || selectedKpiCard === 'urgenti') && (
                <div
                  className={`bg-white rounded-2xl border-2 shadow-lg overflow-hidden ${
                    selectedKpiCard === 'urgenti'
                      ? 'border-rose-500 ring-4 ring-rose-100/70'
                      : 'border-amber-500 ring-4 ring-amber-100/70'
                  }`}
                >
                  <div
                    className={`p-4 sm:p-5 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                      selectedKpiCard === 'urgenti'
                        ? 'bg-rose-50/80 border-rose-200'
                        : 'bg-amber-50/80 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${
                          selectedKpiCard === 'urgenti'
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {selectedKpiCard === 'urgenti' ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <Clock className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            {selectedKpiCard === 'urgenti'
                              ? 'Scadenze Imminenti (≤ 60 giorni) — Priorità di Convocazione'
                              : 'Elenco Gestioni Chiuse (Termine 180 giorni)'}
                          </h3>
                          <span
                            className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-white ${
                              selectedKpiCard === 'urgenti' ? 'bg-rose-600' : 'bg-amber-600'
                            }`}
                          >
                            {selectedKpiCard === 'urgenti'
                              ? `${stats.urgenti60gg} Condomini Imminenti`
                              : `${stats.condominiChiuseList.length} Gestioni Chiuse`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {selectedKpiCard === 'urgenti'
                            ? 'Condomini con gestione chiusa il cui termine legale di 180 giorni scade entro 60 giorni'
                            : "Tutti i condomini con esercizio chiuso e calcolo automatico del termine legale di 180 giorni ex art. 1130 c.c."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-xl bg-white/90 border border-slate-200 p-1 text-xs shadow-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedKpiCard('chiuse')}
                          className={`px-3 py-1 rounded-lg font-bold transition ${
                            selectedKpiCard === 'chiuse'
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Tutte le Chiuse ({stats.condominiChiuseList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedKpiCard('urgenti')}
                          className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                            selectedKpiCard === 'urgenti'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'text-rose-700 hover:bg-rose-50'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Imminenti ≤ 60gg ({stats.urgenti60gg})
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setFiltroStato(selectedKpiCard === 'urgenti' ? 'urgenti' : 'chiuse');
                          setActiveTab('condomini');
                        }}
                        className="text-xs text-indigo-700 hover:text-indigo-950 bg-white px-3 py-1.5 rounded-xl border border-slate-300 font-bold flex items-center gap-1 shadow-xs"
                      >
                        <span>Filtra nell'elenco</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-100/80 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Condominio</th>
                          <th className="py-3 px-4">Chiusura Esercizio</th>
                          <th className="py-3 px-4">Scadenza Legale (180gg)</th>
                          <th className="py-3 px-4 text-center">Termine Rimanente</th>
                          <th className="py-3 px-4">Stato Documenti & Dati</th>
                          <th className="py-3 px-4">Avanzamento Rendiconto</th>
                          <th className="py-3 px-4 text-right">Azioni Rapide</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(selectedKpiCard === 'urgenti'
                          ? stats.condominiUrgenti60ggList
                          : stats.condominiChiuseList
                        ).map((c) => {
                          const g = c.scadenzaInfo.giorniRimanenti;
                          const rendProg = getRendicontoProgressForCondo(c.id);
                          let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          let labelUrgenza = `${g} giorni`;

                          if (g !== null && g < 0) {
                            badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
                            labelUrgenza = `Scaduto da ${Math.abs(g)} gg`;
                          } else if (g !== null && g <= 30) {
                            badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold animate-pulse';
                            labelUrgenza = `IMMINENTE (${g} gg)`;
                          } else if (g !== null && g <= 60) {
                            badgeColor = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
                            labelUrgenza = `Imminente: ${g} gg`;
                          }

                          return (
                            <tr
                              key={c.id}
                              className={`hover:bg-slate-50 transition ${
                                g !== null && g <= 60 ? 'bg-rose-50/30' : ''
                              }`}
                            >
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                    {c.codice_danea}
                                  </span>
                                  <span>{c.nome}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs font-mono text-slate-600">
                                {c.scadenzaInfo.fineFormatted}
                              </td>
                              <td className="py-3 px-4 text-xs font-mono font-bold text-slate-800">
                                {c.scadenzaInfo.scadenzaFormatted}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`inline-block px-2.5 py-1 text-xs rounded-full border ${badgeColor}`}
                                >
                                  {labelUrgenza}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs gap-2">
                                    <span
                                      className={`font-medium ${
                                        c.mancanti.length === 0
                                          ? 'text-emerald-700 font-bold'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {c.richiesti.length === 0
                                        ? '0 dati da recuperare • Pronto'
                                        : c.mancanti.length === 0
                                        ? `Tutti acquisiti (${c.richiesti.length}/${c.richiesti.length})`
                                        : `${c.mancanti.length} da recuperare (${
                                            c.richiesti.length - c.mancanti.length
                                          }/${c.richiesti.length})`}
                                    </span>
                                    <span className="font-bold text-indigo-600">{c.percentuale}%</span>
                                  </div>
                                  <div className="w-36 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        c.percentuale === 100
                                          ? 'bg-emerald-500'
                                          : c.percentuale >= 50
                                          ? 'bg-amber-500'
                                          : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${c.percentuale}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="space-y-1 min-w-[130px]">
                                  <div className="flex items-center justify-between text-xs gap-2">
                                    <span className="font-mono text-[11px] text-slate-600">
                                      {rendProg.passiCompletati}/{rendProg.totalePassi} passi
                                    </span>
                                    <span
                                      className={`font-extrabold px-1.5 py-0.5 rounded text-[11px] ${
                                        rendProg.percentualeFatto >= 100
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : rendProg.percentualeFatto > 0
                                          ? 'bg-amber-100 text-amber-900'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {rendProg.pctFormatted}
                                    </span>
                                  </div>
                                  <div className="w-32 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        rendProg.percentualeFatto >= 100
                                          ? 'bg-emerald-500'
                                          : rendProg.percentualeFatto >= 50
                                          ? 'bg-amber-500'
                                          : rendProg.percentualeFatto > 0
                                          ? 'bg-indigo-500'
                                          : 'bg-slate-300'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, rendProg.percentualeFatto))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right space-x-1.5">
                                <button
                                  onClick={() => handleToggleStatoRendiconto(c.id, 'completato')}
                                  className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-xs rounded-lg transition inline-flex items-center gap-1"
                                  title="Segna rendiconto come completato"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Fatto</span>
                                </button>
                                <button
                                  onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition inline-flex items-center gap-1 shadow-xs"
                                  title="Rendiconto fatto: rinnova automaticamente le scadenze all'anno successivo (+1 anno)"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Rinnova (+1a)</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCondoForRendiconto(c.id);
                                    setActiveTab('rendiconto');
                                  }}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>Rendiconto</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setExpandedCondoId(c.id);
                                    setActiveTab('condomini');
                                  }}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition inline-flex items-center gap-1"
                                >
                                  <span>Dati</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* FINESTRA KPI 4: DATI & CONTATORI MANCANTI */}
              {selectedKpiCard === 'mancanti' && (
                <div className="bg-white rounded-2xl border-2 border-sky-500 ring-4 ring-sky-100/70 shadow-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4 bg-sky-50/50 -m-5 mb-2 p-5 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Droplets className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            Dati & Contatori Mancanti — Elenco Condomini da Completare
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-600 text-white">
                            {stats.condominiDatiMancantiList.length} Condomini
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Solo condomini con <strong>gestione terminata</strong> (data odierna successiva al termine della gestione) per cui inviare le richieste e acquisire letture contatori o documenti
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFiltroStato('mancanti');
                        setActiveTab('condomini');
                      }}
                      className="text-xs text-sky-800 hover:text-sky-950 bg-white px-3 py-1.5 rounded-xl border border-sky-300 font-bold flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
                    >
                      <span>Gestisci tutti nell'elenco</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
                    {stats.condominiDatiMancantiList.map((c) => {
                      const rendProg = getRendicontoProgressForCondo(c.id);
                      return (
                        <div
                          key={c.id}
                          className="p-4 rounded-xl border-2 border-sky-200/80 bg-sky-50/20 hover:bg-white hover:border-sky-400 transition shadow-sm space-y-3 flex flex-col justify-between"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                    {c.codice_danea}
                                  </span>
                                  {c.scadenzaInfo?.isChiusa && (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                      Chiusa {c.scadenzaInfo.fineFormatted}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 mt-1">{c.nome}</h4>
                              </div>
                              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full shrink-0 border border-rose-200">
                                {c.mancanti.length} da recuperare
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {c.mancanti.map((doc: any) => (
                                <div
                                  key={doc.id}
                                  className={`p-2.5 rounded-lg border space-y-2 transition ${
                                    doc.richiesta_inviata
                                      ? 'bg-sky-50/40 border-sky-200'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="flex items-center gap-1.5 font-semibold text-slate-800 min-w-0">
                                      {getDocIcon(doc.id)}
                                      <span className="truncate">{doc.titolo}</span>
                                    </span>
                                    {doc.richiesta_inviata && doc.data_richiesta_inviata && (
                                      <span className="text-[10px] font-semibold text-sky-700 bg-sky-100/80 px-1.5 py-0.5 rounded shrink-0">
                                        Inviata {new Date(doc.data_richiesta_inviata).toLocaleDateString('it-IT')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRichiestaInviata(c.id, doc.id)}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold text-[11px] border transition cursor-pointer ${
                                        doc.richiesta_inviata
                                          ? 'bg-sky-600 border-sky-700 text-white shadow-xs hover:bg-sky-700'
                                          : 'bg-white border-sky-300 text-sky-800 hover:bg-sky-50'
                                      }`}
                                      title="Spunta per indicare che la comunicazione/richiesta dei dati è stata inviata"
                                    >
                                      {doc.richiesta_inviata ? (
                                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <Square className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                      )}
                                      <span>Richiesta inviata</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleToggleRecuperato(c.id, doc.id)}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-md border border-emerald-200 shrink-0 transition cursor-pointer flex items-center gap-1"
                                      title="Segna subito come recuperato"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Segna Acquisito</span>
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={doc.valore || ''}
                                    onChange={(e) =>
                                      handleUpdateDocField(c.id, doc.id, 'valore', e.target.value)
                                    }
                                    placeholder="Inserisci lettura / valore / nota da cellulare..."
                                    className="w-full px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-none text-slate-800"
                                  />
                                </div>
                              ))}
                            </div>

                            {/* AVANZAMENTO PROCEDURA RENDICONTO */}
                            <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>Procedura Rendiconto</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-slate-500">
                                    {rendProg.passiCompletati}/{rendProg.totalePassi}
                                  </span>
                                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                                    {rendProg.pctFormatted}
                                  </span>
                                </div>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-amber-500 transition-all"
                                  style={{ width: `${Math.min(100, Math.max(0, rendProg.percentualeFatto))}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                            <button
                              onClick={() => {
                                setExpandedCondoId(c.id);
                                setActiveTab('condomini');
                              }}
                              className="text-indigo-600 hover:text-indigo-800 font-bold"
                            >
                              Apri Scheda Dati →
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCondoForRendiconto(c.id);
                                setActiveTab('rendiconto');
                              }}
                              className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
                              Rendiconto ({rendProg.pctFormatted})
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* FINESTRA KPI 5: RENDICONTI COMPLETATI */}
              {selectedKpiCard === 'completati' && (
                <div className="bg-white rounded-2xl border-2 border-teal-500 ring-4 ring-teal-100/70 shadow-lg overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-teal-50/70">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            Rendiconti Completati — Bilanci Approvati / Chiusi
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-600 text-white">
                            {stats.completati} Completati
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Clicca su <strong>"Rinnova all'Anno Successivo (+1 Anno)"</strong> per avanzare date di gestione, scadenza 180gg e azzerare la checklist dati
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      {stats.condominiCompletatiList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRinnovaTuttiCompletati(stats.condominiCompletatiList)}
                          className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          title="Avanza tutti i condomini completati al nuovo esercizio (+1 anno)"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Rinnova Tutti all'Anno Successivo ({stats.condominiCompletatiList.length})</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setFiltroStato('completati');
                          setActiveTab('condomini');
                        }}
                        className="text-xs text-teal-800 hover:text-teal-950 bg-white px-3 py-1.5 rounded-xl border border-teal-300 font-bold flex items-center gap-1.5 shadow-xs"
                      >
                        <span>Vedi nell'elenco condomini</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {stats.condominiCompletatiList.length === 0 ? (
                    <div className="p-6 space-y-4">
                      <div className="text-center space-y-1">
                        <p className="text-sm font-bold text-slate-800">
                          Nessun rendiconto è ancora in attesa di rinnovo tra i completati.
                        </p>
                        <p className="text-xs text-slate-500">
                          Puoi segnare come <strong>Completato</strong> o fare direttamente il <strong>Rinnovo Automatico (+1 Anno)</strong> sui condomini già pronti:
                        </p>
                      </div>

                      {stats.condominiProntiDaFareList.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                          {stats.condominiProntiDaFareList.map((c) => {
                            const rendProg = getRendicontoProgressForCondo(c.id);
                            return (
                              <div
                                key={c.id}
                                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      {c.codice_danea}
                                    </span>
                                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                      Rendiconto: {rendProg.pctFormatted}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-xs text-slate-900 truncate">
                                    {c.nome}
                                  </h4>
                                  <p className="text-[11px] text-slate-500">
                                    Chiusura: {c.scadenzaInfo.fineFormatted} • Scad: {c.scadenzaInfo.scadenzaFormatted}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatoRendiconto(c.id, 'completato')}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Segna Fatto</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                                    title="Rendiconto fatto: rinnova subito le scadenze all'anno successivo (+1 anno)"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Fatto & Rinnova (+1a)</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.condominiCompletatiList.map((c) => {
                        const nextPreview = calcolaRinnovoAnnoSuccessivo(c);
                        const nextFineFmt = new Date(nextPreview.nuovaFine).toLocaleDateString('it-IT');
                        const nextScadFmt = new Date(nextPreview.nuovaScadenza).toLocaleDateString('it-IT');
                        const rendProg = getRendicontoProgressForCondo(c.id);

                        return (
                          <div
                            key={c.id}
                            className="bg-teal-50/40 rounded-xl border-2 border-teal-300 p-4 shadow-sm flex flex-col justify-between gap-3"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-900">
                                  {c.codice_danea}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-600 text-white">
                                  <Check className="w-3 h-3" />
                                  Completato ({rendProg.pctFormatted})
                                </span>
                              </div>
                              <h4 className="font-extrabold text-base text-slate-900">{c.nome}</h4>
                              <p className="text-xs text-slate-500">
                                Chiusura attuale: <strong>{c.scadenzaInfo.fineFormatted}</strong> • Scadenza:{' '}
                                <strong>{c.scadenzaInfo.scadenzaFormatted}</strong>
                              </p>
                              <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                                <span className="font-bold">Prossimo esercizio (+1 anno):</span> chiusura{' '}
                                <strong>{nextFineFmt}</strong> → nuova scadenza 180gg:{' '}
                                <strong className="text-amber-900">{nextScadFmt}</strong>
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-teal-200/60">
                              <button
                                type="button"
                                onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Rinnova all'Anno Successivo (+1 Anno)</span>
                              </button>

                              <div className="flex items-center justify-between gap-2">
                                <button
                                  onClick={() => handleToggleStatoRendiconto(c.id, 'in_corso')}
                                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs transition"
                                >
                                  Riapri in lavorazione
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCondoForRendiconto(c.id);
                                    setActiveTab('rendiconto');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition flex items-center gap-1"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>Apri Scheda</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ELENCO CONDOMINI & CHECKLIST DATI NECESSARI */}
          {activeTab === 'condomini' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* TOOLBAR CONDOMINI */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Condomini & Dati Necessari al Rendiconto
                    </h2>
                    <p className="text-xs text-slate-500">
                      Personalizza i dati necessari per ciascun condominio (acqua, riscaldamento, documenti) e spunta il loro recupero
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Cerca condominio o codice..."
                      value={condoSearchFilter}
                      onChange={(e) => setCondoSearchFilter(e.target.value)}
                      className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 w-48 sm:w-60"
                    />
                  </div>

                  <button
                    onClick={() => setShowNewCondoModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuovo Condominio
                  </button>
                </div>
              </div>

              {/* FILTRI STATO CONDOMINIO */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
                  <Filter className="w-3.5 h-3.5" /> Filtra:
                </span>
                <button
                  onClick={() => setFiltroStato('tutti')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'tutti'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tutti ({condomini.length})
                </button>
                <button
                  onClick={() => setFiltroStato('chiuse')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'chiuse'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ⏰ Gestioni Chiuse ({stats.chiuse})
                </button>
                <button
                  onClick={() => setFiltroStato('urgenti')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'urgenti'
                      ? 'bg-rose-600 text-white font-bold shadow-xs'
                      : 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 font-bold'
                  }`}
                >
                  ⚠️ Scadenze Imminenti ≤ 60gg ({stats.urgenti60gg})
                </button>
                <button
                  onClick={() => setFiltroStato('pronti')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'pronti'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 font-bold'
                  }`}
                >
                  🚀 Pronti da Fare ({stats.prontiDaFareCount})
                </button>
                <button
                  onClick={() => setFiltroStato('attesa_assemblea')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'attesa_assemblea'
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'bg-purple-50 text-purple-800 border border-purple-300 hover:bg-purple-100 font-bold'
                  }`}
                >
                  🏛️ In Attesa Assemblea ({stats.attesaAssembleaCount})
                </button>
                <button
                  onClick={() => setFiltroStato('mancanti')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'mancanti'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  💧 Dati Mancanti ({stats.datiMancantiCount})
                </button>
                <button
                  onClick={() => setFiltroStato('completati')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    filtroStato === 'completati'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ✅ Completati ({stats.completati})
                </button>
              </div>

              {/* LISTA SCHEDE CONDOMINI CON CHECKLIST DATI INTEGRATA */}
              <div className="space-y-4">
                {condominiFiltrati.map((c) => {
                  const sc = getScadenzaInfo(c);
                  const docs = getDocumentiCondominio(c);
                  const docRichiesti = docs.filter((d) => d.richiesto);
                  const docRecuperati = docRichiesti.filter((d) => d.recuperato);
                  const isExpanded = expandedCondoId === c.id;
                  const rendProg = getRendicontoProgressForCondo(c.id);

                  return (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition"
                    >
                      {/* INTESTAZIONE CONDOMINIO */}
                      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/40">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                              {c.codice_danea}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">CF: {c.codice_fiscale}</span>
                            {sc.isChiusa ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                                Gestione Chiusa al {sc.fineFormatted} • Termine: {sc.scadenzaFormatted}
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                                Gestione in corso (chiude il {sc.fineFormatted})
                              </span>
                            )}
                            {rendProg.inAttesaAssemblea && (
                              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-600 text-white font-extrabold shadow-xs">
                                🏛️ In Attesa Assemblea • Passi 58–62 ({rendProg.postAssembleaCompletati}/{rendProg.postAssembleaTotale})
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-extrabold text-slate-900">{c.nome}</h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>
                              {c.indirizzo}, {c.citta} • Esercizio: <strong className="text-slate-800">{c.data_inizio_esercizio || '01/01'}</strong> al{' '}
                              <strong className="text-slate-800">{c.data_fine_esercizio || '31/12'}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingPeriodoCondo({
                                  id: c.id,
                                  nome: c.nome,
                                  data_inizio_esercizio: c.data_inizio_esercizio || '2025-01-01',
                                  data_fine_esercizio: c.data_fine_esercizio || '2025-12-31',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold border border-amber-300 transition shadow-xs cursor-pointer"
                              title="Modifica date di inizio e fine esercizio"
                            >
                              <Calendar className="w-3.5 h-3.5 text-amber-700" />
                              <span>Modifica Periodo di Gestione</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRinnovaEsercizioAnnoSuccessivo(c.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-xs cursor-pointer"
                              title="Rendiconto fatto: avanza automaticamente le date di gestione all'anno successivo (+1 anno), ricalcola la scadenza 180gg e azzera i dati da recuperare"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Rinnova all'Anno Successivo (+1 Anno)</span>
                            </button>
                          </div>
                        </div>

                        {/* AZIONI E STATO AVANZAMENTO DOCUMENTI + PROCEDURA RENDICONTO */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          {/* Badge avanzamento procedura rendiconto */}
                          <div
                            className={`text-right px-2.5 py-1.5 rounded-xl border ${
                              rendProg.inAttesaAssemblea
                                ? 'bg-purple-50/90 border-purple-300'
                                : 'bg-amber-50/80 border-amber-200'
                            }`}
                          >
                            <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-800">
                              <span className="text-[11px] text-slate-600">
                                {rendProg.inAttesaAssemblea ? '100% Eseguito (1–57):' : 'Avanz. Rendiconto:'}
                              </span>
                              <span
                                className={`font-extrabold ${
                                  rendProg.percentualeFatto >= 100 ? 'text-emerald-700' : 'text-amber-900'
                                }`}
                              >
                                {rendProg.pctFormatted}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                ({rendProg.passiCompletati}/{rendProg.totalePassi})
                              </span>
                            </div>
                            <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden mt-1 ml-auto">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  rendProg.percentualeFatto >= 100
                                    ? 'bg-emerald-500'
                                    : rendProg.percentualeFatto > 0
                                    ? 'bg-amber-500'
                                    : 'bg-slate-300'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, rendProg.percentualeFatto))}%` }}
                              />
                            </div>
                            {(rendProg.inAttesaAssemblea || rendProg.postAssembleaCompletati > 0) && (
                              <div className="text-[10px] font-extrabold text-purple-800 mt-1">
                                🏛️ Post-Assemblea (58–62): {rendProg.postAssembleaCompletati}/{rendProg.postAssembleaTotale}
                              </div>
                            )}
                          </div>

                          {/* Badge contatore documenti */}
                          <div className="text-right mr-2">
                            <div className="text-xs font-bold text-slate-800">
                              {docRichiesti.length === 0
                                ? 'Nessun dato da recuperare'
                                : `${docRichiesti.length - docRecuperati.length} da recuperare (${docRecuperati.length}/${docRichiesti.length})`}
                            </div>
                            <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden mt-1 ml-auto">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  docRecuperati.length === docRichiesti.length
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{
                                  width: `${
                                    docRichiesti.length > 0
                                      ? (docRecuperati.length / docRichiesti.length) * 100
                                      : 100
                                  }%`,
                                }}
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => setExpandedCondoId(isExpanded ? null : c.id)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                          >
                            <span>Dati da Recuperare ({docRichiesti.length})</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCondoForAssemblee(c.id);
                              setActiveTab('assemblee');
                            }}
                            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs"
                            title="Organizza o gestisci un'Assemblea Straordinaria per questo condominio"
                          >
                            <Users className="w-3.5 h-3.5 text-purple-700" />
                            <span>Assemblee</span>
                            {assembleeStraordinarie.filter((a) => a.condominio_id === c.id && a.stato !== 'completata').length > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-purple-600 text-white text-[10px] font-extrabold">
                                {assembleeStraordinarie.filter((a) => a.condominio_id === c.id && a.stato !== 'completata').length}
                              </span>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCondoForRendiconto(c.id);
                              setActiveTab('rendiconto');
                            }}
                            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Procedura Rendiconto</span>
                          </button>

                          <button
                            onClick={() => setCondoToDelete(c)}
                            title="Elimina condominio non più gestito"
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition border border-transparent hover:border-rose-200"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* CORPO ESPANDIBILE: CHECKLIST DATI E DOCUMENTI */}
                      {isExpanded && (
                        <div className="p-5 bg-white space-y-4 border-t border-slate-100">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div>
                              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-amber-600" />
                                Dati da Recuperare per "{c.nome}"
                              </h4>
                              <p className="text-xs text-slate-500">
                                Sono visualizzati solo i dati effettivamente da recuperare per questo condominio
                              </p>
                            </div>

                            <button
                              onClick={() => {
                                setAddingDocCondoId(addingDocCondoId === c.id ? null : c.id);
                                setNewDocTitolo('');
                                setNewDocNote('');
                              }}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl flex items-center gap-1 transition self-start sm:self-auto"
                            >
                              <Plus className="w-3.5 h-3.5 text-amber-700" />
                              <span>+ Aggiungi Dato Personalizzato</span>
                            </button>
                          </div>

                          {/* FORM VELOCE AGGIUNTA DATO PERSONALIZZATO */}
                          {addingDocCondoId === c.id && (
                            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2.5">
                              <h5 className="text-xs font-bold text-amber-950">
                                Aggiungi Nuovo Dato o Documento per "{c.nome}"
                              </h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="Es. Lettura contatore gas metano centrale termica..."
                                  value={newDocTitolo}
                                  onChange={(e) => setNewDocTitolo(e.target.value)}
                                  className="px-3 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:bg-white bg-white"
                                />
                                <input
                                  type="text"
                                  placeholder="Note opzionali (es. fornitore Enel o matricola contatore)..."
                                  value={newDocNote}
                                  onChange={(e) => setNewDocNote(e.target.value)}
                                  className="px-3 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:bg-white bg-white"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setAddingDocCondoId(null)}
                                  className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                                >
                                  Annulla
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddCustomDoc(c.id)}
                                  className="px-3.5 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm"
                                >
                                  Salva Dato
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ELENCO SOLO DATI RICHIESTI */}
                          {docRichiesti.length === 0 ? (
                            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Nessun dato o contatore esterno da recuperare per questo condominio.</span>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                              {docRichiesti.map((doc) => {
                                const isCustom = doc.id.startsWith('custom_');

                                return (
                                  <div
                                    key={doc.id}
                                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                                      doc.recuperato
                                        ? 'bg-emerald-50/40'
                                        : doc.richiesta_inviata
                                        ? 'bg-sky-50/30'
                                        : 'bg-white'
                                    }`}
                                  >
                                    {/* Nome, icona e campo valore/lettura editabile */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div className="mt-0.5 shrink-0">{getDocIcon(doc.id)}</div>
                                      <div className="flex-1 min-w-0 space-y-1.5">
                                        <div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={`font-semibold text-xs sm:text-sm ${
                                                doc.recuperato ? 'text-slate-900 font-bold' : 'text-slate-800'
                                              }`}
                                            >
                                              {doc.titolo}
                                            </span>
                                            {isCustom && (
                                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-mono">
                                                personalizzato
                                              </span>
                                            )}
                                          </div>
                                          {doc.note && (
                                            <p className="text-[11px] text-slate-500 mt-0.5">{doc.note}</p>
                                          )}
                                          <div className="flex flex-wrap items-center gap-3 mt-0.5">
                                            {doc.richiesta_inviata && (
                                              <p className="text-[10px] text-sky-700 font-semibold">
                                                ✓ Richiesta inviata
                                                {doc.data_richiesta_inviata
                                                  ? ` il ${new Date(doc.data_richiesta_inviata).toLocaleDateString('it-IT')}`
                                                  : ''}
                                              </p>
                                            )}
                                            {doc.recuperato && doc.data_recupero && (
                                              <p className="text-[10px] text-emerald-700 font-semibold">
                                                ✓ Acquisito il {new Date(doc.data_recupero).toLocaleDateString('it-IT')}
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        <input
                                          type="text"
                                          value={doc.valore || ''}
                                          onChange={(e) =>
                                            handleUpdateDocField(c.id, doc.id, 'valore', e.target.value)
                                          }
                                          placeholder="Scrivi qui lettura contatore, saldo o nota operativa (anche da cellulare)..."
                                          className="w-full max-w-md px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-none text-slate-800"
                                        />
                                      </div>
                                    </div>

                                    {/* Pulsanti Toggle: "Richiesta inviata", "Recuperato / Da Recuperare" e "Rimuovi dai dati richiesti" */}
                                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRichiestaInviata(c.id, doc.id)}
                                        title="Spunta se la comunicazione per richiedere i dati/letture è stata inviata"
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border shadow-sm transition cursor-pointer ${
                                          doc.richiesta_inviata
                                            ? 'bg-sky-600 border-sky-700 text-white hover:bg-sky-700'
                                            : 'bg-white border-sky-300 text-sky-900 hover:bg-sky-50'
                                        }`}
                                      >
                                        {doc.richiesta_inviata ? (
                                          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                        )}
                                        <span>Richiesta inviata</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleToggleRecuperato(c.id, doc.id)}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border shadow-sm transition cursor-pointer ${
                                          doc.recuperato
                                            ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700'
                                            : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50'
                                        }`}
                                      >
                                        {doc.recuperato ? (
                                          <>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Recuperato</span>
                                          </>
                                        ) : (
                                          <>
                                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                                            <span>Da Recuperare</span>
                                          </>
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          isCustom
                                            ? handleDeleteCustomDoc(c.id, doc.id)
                                            : handleToggleRichiesto(c.id, doc.id)
                                        }
                                        title="Rimuovi questo dato per questo condominio"
                                        className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-200 transition flex items-center gap-1 cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        <span>Non serve</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* PULSANTI RAPIDI PER AGGIUNGERE ALTRI DATI NON RICHIESTI */}
                          {docs.some((d) => !d.richiesto) && (
                            <div className="pt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-400 mr-1">
                                Aggiungi se necessario per questo condominio:
                              </span>
                              {docs
                                .filter((d) => !d.richiesto)
                                .map((doc) => (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => handleToggleRichiesto(c.id, doc.id)}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-900 border border-slate-200 hover:border-amber-300 transition flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>{doc.titolo}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PROCEDURA RENDICONTO COMPLETA (MODELLO 5 - 63 SCHEDE SEQUENZIALI & ALLEGATI) */}
          {activeTab === 'rendiconto' && (
            <ProceduraRendicontoView
              apiBase={API_BASE}
              condomini={condomini}
              selectedCondominioId={selectedCondoForRendiconto}
              onNotify={notify}
              onRinnovaEsercizio={handleRinnovaEsercizioAnnoSuccessivo}
              onProgressChange={(prog) => {
                setActiveRendicontoProgress(prog);
                setAssembleeStraordinarie(readLocalAssembleeStraordinarie());
              }}
              onOpenImpostazioni={() => setActiveTab('impostazioni')}
              onOpenGestioneAssemblee={(condoId) => {
                setSelectedCondoForAssemblee(condoId);
                setInitialAssembleeFilter('tutte');
                setActiveTab('assemblee');
              }}
              templateVersion={templateVersion}
            />
          )}

          {/* TAB 4: GESTIONE ASSEMBLEE STRAORDINARIE & ORDINARIE (SCALETTA UNIFICATA) */}
          {activeTab === 'assemblee' && (
            <GestioneAssembleeView
              apiBase={API_BASE}
              condomini={condomini}
              selectedCondominioId={selectedCondoForAssemblee}
              initialFiltroStato={initialAssembleeFilter}
              onNotify={notify}
              onOpenProceduraRendiconto={(condoId) => {
                setSelectedCondoForRendiconto(condoId);
                setActiveTab('rendiconto');
              }}
              onRinnovaEsercizio={handleRinnovaEsercizioAnnoSuccessivo}
              rendicontiProgressByCondo={rendicontiByCondo}
              onAssembleeChange={(nextList) => {
                setAssembleeStraordinarie(nextList);
                const localProg = readLocalSchedeProgress();
                const updatedByCondo: Record<number, RendicontoProgressEntry> = { ...localProg };
                const closedCondoIds = new Set<number>();
                const reopenedCondoIds = new Set<number>();
                for (const a of nextList) {
                  if (a.tipo === 'Ordinaria' && a.condominio_id) {
                    const cid = Number(a.condominio_id);
                    const isClosed = a.passi_completati >= a.totale_passi || a.stato === 'conclusa';
                    const postDone = a.scaletta.filter(
                      (s) => POST_ASSEMBLEA_STEP_IDS.has(s.id) && Boolean(s.fatto)
                    ).length;
                    updatedByCondo[cid] = {
                      ...(updatedByCondo[cid] || {
                        percentualeFatto: 100,
                        passiCompletati: 58,
                        totalePassi: 58,
                        postAssembleaTotale: 5,
                      }),
                      percentualeFatto: 100,
                      postAssembleaCompletati: isClosed ? 5 : postDone,
                      postAssembleaTotale: 5,
                      inAttesaAssemblea: !isClosed,
                    };
                    if (isClosed) closedCondoIds.add(cid);
                    else reopenedCondoIds.add(cid);
                  }
                }
                setRendicontiByCondo((prev) => ({ ...prev, ...updatedByCondo }));
                if (closedCondoIds.size > 0 || reopenedCondoIds.size > 0) {
                  setCondomini((prev) =>
                    prev.map((c) => {
                      const cid = Number(c.id);
                      if (closedCondoIds.has(cid) && c.rendiconto_stato !== 'completato') {
                        return { ...c, rendiconto_stato: 'completato' };
                      }
                      if (reopenedCondoIds.has(cid) && c.rendiconto_stato === 'completato') {
                        return { ...c, rendiconto_stato: 'in_corso' };
                      }
                      return c;
                    })
                  );
                }
              }}
            />
          )}

          {/* TAB: ARCHIVIO FILE & REPORT SOPRALLUOGHI */}
          {activeTab === 'sopralluoghi' && (
            <ReportSopralluoghiView
              apiBase={`${API_BASE}/api`}
              onNotify={notify}
            />
          )}

          {/* TAB 5: IMPOSTAZIONI & PERSONALIZZAZIONE PASSAGGI RENDICONTO */}
          {activeTab === 'impostazioni' && (
            <ImpostazioniView
              apiBase={`${API_BASE}/api`}
              onTemplateUpdated={handleTemplateUpdated}
              onNotify={notify}
              onOpenRendiconto={() => setActiveTab('rendiconto')}
            />
          )}
        </main>
      </div>

      {/* MODAL NUOVO CONDOMINIO */}
      {showNewCondoModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-lg text-slate-900">Nuovo Condominio</h3>
              </div>
              <button
                onClick={() => setShowNewCondoModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCondominio} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Denominazione Condominio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Condominio Residenza Le Rose"
                  value={newCondoForm.nome}
                  onChange={(e) => setNewCondoForm({ ...newCondoForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Codice Fiscale
                  </label>
                  <input
                    type="text"
                    placeholder="Es. 97451200154"
                    value={newCondoForm.codice_fiscale}
                    onChange={(e) =>
                      setNewCondoForm({ ...newCondoForm, codice_fiscale: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Numero Unità
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newCondoForm.numero_unita}
                    onChange={(e) =>
                      setNewCondoForm({
                        ...newCondoForm,
                        numero_unita: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Indirizzo</label>
                <input
                  type="text"
                  placeholder="Es. Via Camozzi 12"
                  value={newCondoForm.indirizzo}
                  onChange={(e) => setNewCondoForm({ ...newCondoForm, indirizzo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Città</label>
                  <input
                    type="text"
                    value={newCondoForm.citta}
                    onChange={(e) => setNewCondoForm({ ...newCondoForm, citta: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">CAP</label>
                  <input
                    type="text"
                    value={newCondoForm.cap}
                    onChange={(e) => setNewCondoForm({ ...newCondoForm, cap: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Inizio Esercizio
                  </label>
                  <input
                    type="date"
                    value={newCondoForm.data_inizio_esercizio}
                    onChange={(e) =>
                      setNewCondoForm({ ...newCondoForm, data_inizio_esercizio: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fine Esercizio
                  </label>
                  <input
                    type="date"
                    value={newCondoForm.data_fine_esercizio}
                    onChange={(e) =>
                      setNewCondoForm({ ...newCondoForm, data_fine_esercizio: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                💡 Il salvataggio creerà in automatico la <strong>Scheda Rendiconto Procedura 002 (Modello 5)</strong> con la checklist completa dei dati e contatori da recuperare.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewCondoModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-sm"
                >
                  Crea Condominio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA ELIMINAZIONE CONDOMINIO */}
      {condoToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-100">
            <div className="flex items-center gap-3 text-rose-600 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Rimuovi Condominio</h3>
                <p className="text-xs text-slate-500">Gestione non più attiva</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Sei sicuro di voler eliminare definitivamente il condominio{' '}
                <strong className="text-slate-900">"{condoToDelete.nome}"</strong>?
              </p>
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs space-y-1">
                <p className="font-semibold">⚠️ Verranno rimossi contestualmente:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  <li>La scheda Rendiconto (Procedura 002) di questo condominio</li>
                  <li>La checklist e lo stato dei dati recuperati</li>
                  <li>Le configurazioni contabili associate</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingCondo}
                onClick={() => setCondoToDelete(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeletingCondo}
                onClick={handleDeleteCondominio}
                className="px-5 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {isDeletingCondo ? 'Eliminazione...' : 'Conferma Eliminazione'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICA PERIODO DI GESTIONE */}
      {editingPeriodoCondo && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-bold text-base text-slate-900">Modifica Periodo di Gestione</h3>
                  <p className="text-xs text-slate-500">{editingPeriodoCondo.nome}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingPeriodoCondo(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePeriodoGestione} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Inizio Esercizio *
                  </label>
                  <input
                    type="date"
                    required
                    value={editingPeriodoCondo.data_inizio_esercizio}
                    onChange={(e) =>
                      setEditingPeriodoCondo({
                        ...editingPeriodoCondo,
                        data_inizio_esercizio: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fine Esercizio (Chiusura) *
                  </label>
                  <input
                    type="date"
                    required
                    value={editingPeriodoCondo.data_fine_esercizio}
                    onChange={(e) =>
                      setEditingPeriodoCondo({
                        ...editingPeriodoCondo,
                        data_fine_esercizio: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Ricalcolo dinamico scadenza 180 giorni */}
              {editingPeriodoCondo.data_fine_esercizio && (() => {
                const dtFine = new Date(editingPeriodoCondo.data_fine_esercizio);
                const dtScad = new Date(dtFine.getTime() + 180 * 24 * 60 * 60 * 1000);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isChiusa = dtFine <= today;
                const diffDays = Math.ceil((dtScad.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                return (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-1.5 text-amber-950">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Termine di Legge (180 gg):</span>
                      <strong className="text-sm font-bold text-amber-900">
                        {dtScad.toLocaleDateString('it-IT')}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-amber-800">
                      <span>Stato Gestione:</span>
                      <span className="font-bold">
                        {isChiusa
                          ? `Esercizio Chiuso (${diffDays >= 0 ? `${diffDays} giorni rimanenti` : `Scaduto da ${Math.abs(diffDays)} gg`})`
                          : 'Esercizio ancora in corso'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    const cid = editingPeriodoCondo.id;
                    setEditingPeriodoCondo(null);
                    handleRinnovaEsercizioAnnoSuccessivo(cid);
                  }}
                  className="px-3 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Avanza automaticamente inizio e fine esercizio di +1 anno, ricalcola scadenza 180gg e azzera checklist dati"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rinnova +1 Anno (Auto)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPeriodoCondo(null)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-sm"
                  >
                    Salva Periodo
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BARRA DI NAVIGAZIONE INFERIORE PER CELLULARE (visibile solo su smartphone) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950 text-white border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition relative ${
            activeTab === 'dashboard'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Scadenze</span>
          {stats.urgenti60gg > 0 && (
            <span className="absolute -top-1 right-1 text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold">
              {stats.urgenti60gg}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('condomini')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'condomini'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4 mb-0.5" />
          <span>Condomini ({condomini.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rendiconto')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'rendiconto'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 mb-0.5" />
          <span>Modello 5</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assemblee')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition relative ${
            activeTab === 'assemblee'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 mb-0.5" />
          <span>Assemblee</span>
          {stats.assembleeAttiveCount > 0 && (
            <span className="absolute -top-1 right-1 text-[9px] px-1.5 py-0.2 rounded-full bg-purple-600 text-white font-extrabold">
              {stats.assembleeAttiveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('impostazioni')}
          className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'impostazioni'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4 mb-0.5" />
          <span>Impostazioni</span>
        </button>

        <button
          type="button"
          onClick={() => setShowMobileModal(true)}
          className="flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-bold text-indigo-300 hover:text-white transition"
        >
          <QrCode className="w-4 h-4 mb-0.5 text-amber-400" />
          <span>Wi-Fi QR</span>
        </button>
      </nav>

      {/* MODALE CONNESSIONE DA CELLULARE VIA WI-FI LOCALE (QR CODE) */}
      <MobileConnectModal
        isOpen={showMobileModal}
        onClose={() => setShowMobileModal(false)}
        apiBase={API_BASE}
        onNotify={notify}
      />
    </div>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : undefined,
          credentials: 'same-origin',
        });
        if (!active) return;
        if (res.ok) {
          setAuthStatus('authenticated');
        } else {
          clearStoredToken();
          setAuthStatus('unauthenticated');
        }
      } catch {
        if (!active) return;
        setAuthStatus('unauthenticated');
      }
    };

    verifySession();

    const handleUnauthorized = () => {
      if (!IS_EMBED_MODE) {
        setAuthStatus('unauthenticated');
      }
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      active = false;
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const handleLogout = async () => {
    clearStoredToken();
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'same-origin' });
    } catch {
      // ignore
    }
    setAuthStatus('unauthenticated');
  };

  if (authStatus === 'checking') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${IS_EMBED_MODE ? 'bg-slate-50 text-slate-700' : 'bg-slate-950 text-white'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-600 rounded-full animate-spin" />
          <span className={`text-sm ${IS_EMBED_MODE ? 'text-slate-600' : 'text-slate-300'}`}>Verifica accesso in corso...</span>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <LoginScreen onSuccess={() => setAuthStatus('authenticated')} />;
  }

  return <AuthenticatedApp onLogout={handleLogout} />;
}
