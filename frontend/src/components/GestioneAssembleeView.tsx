import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Calendar,
  MapPin,
  Send,
  FileSignature,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  Edit3,
  FileText,
  Sparkles,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Receipt,
  Building2,
  ArrowRight,
  X,
  Check,
  Filter,
} from 'lucide-react';

export interface PassoScalettaAssemblea {
  id:
    | 'odg'
    | 'sala'
    | 'convocazioni'
    | 'passo_58'
    | 'firma_presidente'
    | 'invio_condomini'
    | 'passo_61'
    | 'passo_62'
    | string;
  ordine: number;
  titolo: string;
  descrizione: string;
  fatto: boolean;
  data_spunta?: string | null;
  dettaglio?: string;
  note?: string;
  passo_rendiconto_id?: number;
}

export interface AssembleaStraordinariaItem {
  id: number;
  condominio_id: number;
  condominio_nome: string;
  condominio_codice_danea?: string | null;
  condominio_indirizzo?: string | null;
  scheda_rendiconto_id?: number | null;
  esercizio_rendiconto?: string | null;
  titolo: string;
  tipo: 'Straordinaria' | 'Ordinaria' | string;
  data_prima_convocazione?: string | null;
  ora_prima_convocazione?: string | null;
  data_assemblea?: string | null;
  ora_assemblea?: string | null;
  luogo_sala?: string | null;
  ordine_del_giorno?: string | null;
  presidente?: string | null;
  segretario?: string | null;
  modalita_invio?: string | null;
  fatturata: boolean;
  importo_compenso: number;
  stato: 'in_organizzazione' | 'convocata' | 'in_firma' | 'conclusa' | string;
  assemblea_svolta?: boolean;
  data_assemblea_svolta?: string | null;
  note_generali?: string | null;
  scaletta: PassoScalettaAssemblea[];
  passi_completati: number;
  totale_passi: number;
  percentuale: number;
}

import { getRuntimeSchedeCache, saveSchedeToStorage } from './ProceduraRendicontoView';

export const STORAGE_KEY_ASSEMBLEE_STRAORDINARIE = 'studio_serra_assemblee_straordinarie_v1';
export const STORAGE_KEY_RENDICONTI_M5 = 'studio_serra_modello5_schede_v3';

let _runtimeAssembleeCache: AssembleaStraordinariaItem[] = [];

function findPassoByCode(passi: any[], code: string | number): any {
  if (!Array.isArray(passi)) return undefined;
  const target = String(code).trim();
  return (
    passi.find((p) => String(p?.numero_codice ?? '').trim() === target) ||
    passi.find((p) => String(p?.id ?? '').trim() === target)
  );
}

export const STEP_ID_TO_RENDICONTO_PASSO_ID: Record<string, number> = {
  passo_58: 58,
  firma_presidente: 59,
  invio_condomini: 60,
  passo_61: 61,
  passo_62: 62,
};

export const DEFAULT_SCALETTA_PASSI: PassoScalettaAssemblea[] = [
  {
    id: 'odg',
    ordine: 1,
    titolo: '1. Creazione ordine del giorno',
    descrizione:
      "Definizione dei punti all'Ordine del Giorno, verifica capitolati/preventivi e riparti straordinari da sottoporre all'assemblea",
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
  },
  {
    id: 'sala',
    ordine: 2,
    titolo: '2. Prenotazione sala, data e ora',
    descrizione:
      "Scelta e prenotazione del posto/sala riunioni e fissazione della data e dell'ora dell'assemblea (1ª e 2ª convocazione)",
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
  },
  {
    id: 'convocazioni',
    ordine: 3,
    titolo: '3. Invio delle convocazioni',
    descrizione:
      'Trasmissione avviso di convocazione con allegati (almeno 5 giorni liberi prima della 1ª convocazione ex art. 66 disp. att. c.c.)',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
  },
  {
    id: 'firma_presidente',
    ordine: 4,
    titolo: '4. Invio verbale presidente per firma',
    descrizione:
      'Redazione del verbale post-assemblea e trasmissione al Presidente dell’assemblea per lettura, controllo e firma',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
  },
  {
    id: 'invio_condomini',
    ordine: 5,
    titolo: '5. Invio verbale ai condomini',
    descrizione:
      'Trasmissione copia del verbale firmato a tutti i condomini (presenti e assenti ex art. 1137 c.c.) e archiviazione su Danea/MioCondominio',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
  },
];

export const DEFAULT_SCALETTA_ORDINARIA_PASSI: PassoScalettaAssemblea[] = [
  {
    id: 'odg',
    ordine: 1,
    titolo: '1. Creazione ordine del giorno (Passo #52 Rendiconto)',
    descrizione:
      'Ordine del giorno assemblea ordinaria per approvazione rendiconto consuntivo, preventivo e nomina amministratore',
    fatto: true,
    data_spunta: null,
    dettaglio: 'Completato al Passo #52 del Rendiconto',
    note: '',
    passo_rendiconto_id: 52,
  },
  {
    id: 'sala',
    ordine: 2,
    titolo: '2. Prenotazione sala, data e ora (Passo #51 Rendiconto)',
    descrizione:
      'Posto/sala riunioni, data e ora assemblea ordinaria fissati nella procedura Rendiconto (Passi #51–53)',
    fatto: true,
    data_spunta: null,
    dettaglio: 'Completato al Passo #51 del Rendiconto',
    note: '',
    passo_rendiconto_id: 51,
  },
  {
    id: 'convocazioni',
    ordine: 3,
    titolo: '3. Invio convocazioni e Rendiconto (Passi #56–57)',
    descrizione:
      'Fascicolo rendiconto e convocazione inviati ai condomini e inquilini (100% fase pre-assemblea completata al Passo #57)',
    fatto: true,
    data_spunta: null,
    dettaglio: 'Completato al Passo #57 del Rendiconto (100% Pre-Assemblea)',
    note: '',
    passo_rendiconto_id: 57,
  },
  {
    id: 'passo_58',
    ordine: 4,
    titolo: '4. Redigere verbale assemblea (Passo #58)',
    descrizione:
      'Stesura del verbale dell’assemblea ordinaria con esito votazioni, millesimi presenti e delibere approvate (Passo #58 Modello 5)',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
    passo_rendiconto_id: 58,
  },
  {
    id: 'firma_presidente',
    ordine: 5,
    titolo: '5. Invio verbale Presidente e Segretario per firma (Passo #59)',
    descrizione:
      'Trasmissione verbale e raccolta firma del Presidente e del Segretario dell’assemblea sul registro dei verbali (Passo #59 Modello 5)',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
    passo_rendiconto_id: 59,
  },
  {
    id: 'invio_condomini',
    ordine: 6,
    titolo: '6. Invio verbale ai condomini (Passo #60)',
    descrizione:
      'Trasmissione copia del verbale firmato a tutti i condomini presenti e assenti ex art. 1137 c.c. (Passo #60 Modello 5)',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
    passo_rendiconto_id: 60,
  },
  {
    id: 'passo_61',
    ordine: 7,
    titolo: '7. Aggiornare/inviare scadenze RATE su DettoFatto (Passo #61)',
    descrizione:
      "Aggiornare/inviare scadenze RATE su DettoFatto e appuntamenti in condominio dell'amministratore (Passo #61 Modello 5)",
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
    passo_rendiconto_id: 61,
  },
  {
    id: 'passo_62',
    ordine: 8,
    titolo: '8. Invio eventuali MAV (Passo #62)',
    descrizione:
      'Emissione e trasmissione bollettini MAV bancari per le nuove rate ordinarie approvate (Passo #62 Modello 5)',
    fatto: false,
    data_spunta: null,
    dettaglio: '',
    note: '',
    passo_rendiconto_id: 62,
  },
];

const TEMPLATE_ODG_STRAORDINARIA = [
  {
    label: 'Lavori Straordinari / Manutenzione',
    testo:
      "1. Esame preventivi ed eventuale delibera per lavori di manutenzione straordinaria;\n2. Scelta dell'impresa esecutrice e nomina del Direttore Lavori / Coordinatore Sicurezza;\n3. Costituzione fondo speciale obbligatorio ex art. 1135 n. 4 c.c. e approvazione piano di riparto rateale;\n4. Determinazione compenso straordinario amministratore;\n5. Varie ed eventuali.",
  },
  {
    label: 'Impianto Termico / Caldaia',
    testo:
      "1. Relazione tecnica sullo stato della centrale termica ed esame proposte di intervento/sostituzione;\n2. Approvazione preventivo, affidamento incarico e relativo piano di riparto spese;\n3. Costituzione fondo speciale lavori e scadenze rate straordinarie;\n4. Varie ed eventuali.",
  },
  {
    label: 'Questioni Legali / Urgenti',
    testo:
      "1. Informativa dell'Amministratore in merito a vertenza/diffida in corso e determinazioni assembleari;\n2. Eventuale conferimento incarico a legale o consulente tecnico di parte (CTP);\n3. Approvazione fondo spese straordinario;\n4. Varie ed eventuali.",
  },
];

export const POST_ASSEMBLEA_STEP_IDS = new Set([
  'passo_58',
  'firma_presidente',
  'invio_condomini',
  'passo_61',
  'passo_62',
]);

/**
 * Determina se l'assemblea (Ordinaria o Straordinaria) si è già svolta ed è quindi passata
 * dal riquadro "In Attesa Assemblea" al riquadro "Completamento Procedura" (Post-Assemblea).
 */
export function isAssembleaGiaSvolta(item: Partial<AssembleaStraordinariaItem>): boolean {
  if (Boolean(item.assemblea_svolta) || item.stato === 'in_firma' || item.stato === 'conclusa') {
    return true;
  }
  if (Array.isArray(item.scaletta)) {
    const anyPostChecked = item.scaletta.some(
      (s) => POST_ASSEMBLEA_STEP_IDS.has(s.id) && Boolean(s.fatto)
    );
    if (anyPostChecked) return true;
  }
  return false;
}

export function calcolaMetricheAssemblea(
  item: Partial<AssembleaStraordinariaItem>
): {
  scaletta: PassoScalettaAssemblea[];
  passi_completati: number;
  totale_passi: number;
  percentuale: number;
  stato: string;
  assemblea_svolta: boolean;
} {
  const isOrdinaria = item.tipo === 'Ordinaria';
  const defaultTemplate = isOrdinaria ? DEFAULT_SCALETTA_ORDINARIA_PASSI : DEFAULT_SCALETTA_PASSI;

  const rawScaletta =
    Array.isArray(item.scaletta) && item.scaletta.length > 0
      ? item.scaletta
      : defaultTemplate.map((p) => ({ ...p }));

  const scaletta = defaultTemplate.map((def, idx) => {
    const found =
      rawScaletta.find((r) => r.id === def.id) ||
      (rawScaletta.length === defaultTemplate.length
        ? rawScaletta.find((r) => r.ordine === def.ordine) || rawScaletta[idx]
        : undefined);
    return {
      ...def,
      ...(found || {}),
      ordine: def.ordine,
      id: def.id,
      titolo: def.titolo,
      descrizione: def.descrizione,
      passo_rendiconto_id: def.passo_rendiconto_id,
    };
  });

  const totale_passi = scaletta.length;
  const passi_completati_raw = scaletta.filter((s) => Boolean(s.fatto)).length;

  const fattiIds = new Set(scaletta.filter((s) => s.fatto).map((s) => s.id));
  const isPasso62Fatto = fattiIds.has('passo_62');
  const passi_completati =
    isPasso62Fatto || passi_completati_raw >= totale_passi ? totale_passi : passi_completati_raw;
  const percentuale =
    isPasso62Fatto || passi_completati >= totale_passi
      ? 100
      : totale_passi > 0
        ? Math.round((passi_completati / totale_passi) * 100)
        : 0;

  const anyPostFatto =
    fattiIds.has('firma_presidente') ||
    fattiIds.has('passo_58') ||
    fattiIds.has('invio_condomini') ||
    fattiIds.has('passo_61') ||
    fattiIds.has('passo_62');

  const explicitSvolta = Boolean(item.assemblea_svolta) || item.stato === 'in_firma';
  let stato = 'in_organizzazione';
  let assemblea_svolta = false;

  if (isPasso62Fatto || passi_completati >= totale_passi) {
    stato = 'conclusa';
    assemblea_svolta = true;
  } else if (anyPostFatto || explicitSvolta) {
    stato = 'in_firma';
    assemblea_svolta = true;
  } else if (fattiIds.has('convocazioni')) {
    stato = 'convocata';
    assemblea_svolta = false;
  }

  return {
    scaletta,
    passi_completati,
    totale_passi,
    percentuale,
    stato,
    assemblea_svolta,
  };
}

export function formatDataAssembleaIt(val?: string | null): string {
  if (!val || !String(val).trim()) return 'Da fissare';
  const raw = String(val).trim();
  // Se è già in formato DD/MM/YYYY o DD-MM-YY o DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) {
    return raw;
  }
  return dt.toLocaleDateString('it-IT');
}

export function deduplicateAssembleeList(
  list: AssembleaStraordinariaItem[]
): AssembleaStraordinariaItem[] {
  if (!Array.isArray(list)) return [];
  const result: AssembleaStraordinariaItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const rawItem of list) {
    if (!rawItem) continue;
    const m = calcolaMetricheAssemblea(rawItem);
    const item: AssembleaStraordinariaItem = {
      ...rawItem,
      ...m,
      id:
        rawItem.tipo === 'Ordinaria'
          ? rawItem.id || 900000 + Number(rawItem.condominio_id)
          : rawItem.id,
    };
    const key =
      item.tipo === 'Ordinaria'
        ? `ord:${Number(item.condominio_id)}`
        : `str:${Number(item.id)}`;

    const existingIdx = indexByKey.get(key);
    if (existingIdx === undefined) {
      indexByKey.set(key, result.length);
      result.push(item);
    } else {
      const prev = result[existingIdx];
      const mergedScaletta = (prev.scaletta || []).map((sPrev) => {
        const sCurr = (item.scaletta || []).find((x) => x.id === sPrev.id);
        if (!sCurr) return sPrev;
        const mergedFatto = Boolean(sPrev.fatto || sCurr.fatto);
        return {
          ...sPrev,
          ...sCurr,
          fatto: mergedFatto,
          data_spunta: mergedFatto ? sPrev.data_spunta || sCurr.data_spunta || null : null,
          dettaglio: sPrev.dettaglio || sCurr.dettaglio || '',
          note: sPrev.note || sCurr.note || '',
        };
      });
      const baseMerged: AssembleaStraordinariaItem = {
        ...(item.passi_completati >= prev.passi_completati ? { ...prev, ...item } : { ...item, ...prev }),
        id: prev.id >= 900000 ? prev.id : item.id,
        scaletta: mergedScaletta.length > 0 ? mergedScaletta : item.scaletta || prev.scaletta,
        assemblea_svolta: Boolean(prev.assemblea_svolta || item.assemblea_svolta),
      };
      const mMerged = calcolaMetricheAssemblea(baseMerged);
      result[existingIdx] = { ...baseMerged, ...mMerged };
    }
  }

  return result;
}

export function readLocalAssembleeStraordinarie(): AssembleaStraordinariaItem[] {
  return _runtimeAssembleeCache;
}

export function writeLocalAssembleeStraordinarie(list: AssembleaStraordinariaItem[]) {
  _runtimeAssembleeCache = deduplicateAssembleeList(list);
}

/**
 * Sincronizza automaticamente una SchedaRendiconto che ha raggiunto il Passo #57 (100% pre-assemblea)
 * creando o aggiornando la corrispondente Assemblea Ordinaria (Passi 58–62) nella Gestione Assemblee unificata.
 */
export function buildOrUpdateAssembleaOrdinariaInList(
  currentList: AssembleaStraordinariaItem[],
  scheda: any,
  preferExistingScaletta = false
): { list: AssembleaStraordinariaItem[]; item: AssembleaStraordinariaItem | null; changed: boolean } {
  if (!scheda || !scheda.condominio_id || !Array.isArray(scheda.passi)) {
    return { list: currentList, item: null, changed: false };
  }

  const postCodes = new Set(['58', '59', '60', '61', '62']);
  const passiPre = scheda.passi.filter(
    (p: any) => !postCodes.has(String(p?.numero_codice ?? p?.id ?? '').trim())
  );
  const preCompletati = passiPre.filter((p: any) => p.fatto || p.non_applicabile).length;
  const passo57 = findPassoByCode(scheda.passi, '57');
  const hasReached57 =
    (passiPre.length > 0 && preCompletati >= passiPre.length) ||
    Boolean(passo57?.fatto) ||
    Boolean(scheda.in_attesa_assemblea) ||
    scheda.stato === 'in_attesa_assemblea' ||
    scheda.stato === 'completato';

  if (!hasReached57) {
    return { list: currentList, item: null, changed: false };
  }

  const passo51 = findPassoByCode(scheda.passi, '51');
  const passo52 = findPassoByCode(scheda.passi, '52');
  const passo53 = findPassoByCode(scheda.passi, '53');
  const passo56 = findPassoByCode(scheda.passi, '56');
  const passo58 = findPassoByCode(scheda.passi, '58');
  const passo59 = findPassoByCode(scheda.passi, '59');
  const passo60 = findPassoByCode(scheda.passi, '60');
  const passo61 = findPassoByCode(scheda.passi, '61');
  const passo62 = findPassoByCode(scheda.passi, '62');

  const luogoFrom51 =
    passo51?.campi_extra?.['Presso'] ||
    passo51?.valore_testo ||
    'Sala Riunioni Studio Serra';
  const dataFrom51 =
    passo51?.campi_extra?.['Data riunione'] ||
    passo52?.campi_extra?.['Data assemblea'] ||
    scheda.data_assemblea ||
    '';
  const oraFrom51 =
    passo51?.campi_extra?.['Ora riunione'] ||
    passo53?.campi_extra?.['Ora assemblea'] ||
    '18:00';

  const esercizioLabel = scheda.gestione || scheda.esercizio || '';

  const dedupedList = deduplicateAssembleeList(currentList);
  const existingIdx = dedupedList.findIndex(
    (a) =>
      a.tipo === 'Ordinaria' &&
      Number(a.condominio_id) === Number(scheda.condominio_id)
  );

  const existing = existingIdx >= 0 ? dedupedList[existingIdx] : null;
  const nowStr = new Date().toLocaleDateString('it-IT');
  const passo62Done =
    preferExistingScaletta && existing?.scaletta
      ? Boolean(existing.scaletta.find((s) => s.id === 'passo_62')?.fatto)
      : Boolean(passo62?.fatto || passo62?.non_applicabile);

  const scalettaSync: PassoScalettaAssemblea[] = DEFAULT_SCALETTA_ORDINARIA_PASSI.map((def) => {
    const prevStep = existing?.scaletta?.find((s) => s.id === def.id);
    if (def.id === 'odg') {
      return {
        ...def,
        ...(prevStep || {}),
        fatto: true,
        data_spunta:
          passo52?.data_spunta || passo52?.data_esecuzione || prevStep?.data_spunta || nowStr,
        dettaglio:
          prevStep?.dettaglio ||
          'Ordine del giorno assemblea ordinaria predisposto (Passo #52 Rendiconto)',
        note: passo52?.note_passo || passo52?.note || prevStep?.note || '',
      };
    }
    if (def.id === 'sala') {
      return {
        ...def,
        ...(prevStep || {}),
        fatto: true,
        data_spunta:
          passo51?.data_spunta || passo51?.data_esecuzione || prevStep?.data_spunta || nowStr,
        dettaglio: `${luogoFrom51}${dataFrom51 ? ` • ${dataFrom51}` : ''}${oraFrom51 ? ` ore ${oraFrom51}` : ''}`,
        note: passo51?.note_passo || passo51?.note || prevStep?.note || '',
      };
    }
    if (def.id === 'convocazioni') {
      return {
        ...def,
        ...(prevStep || {}),
        fatto: true,
        data_spunta:
          passo57?.data_spunta ||
          passo57?.data_esecuzione ||
          passo56?.data_spunta ||
          passo56?.data_esecuzione ||
          prevStep?.data_spunta ||
          nowStr,
        dettaglio:
          prevStep?.dettaglio ||
          'Rendiconto e convocazione inviati a condomini e inquilini (Passi #56–57)',
        note: passo57?.note_passo || passo57?.note || prevStep?.note || '',
      };
    }

    const rendStepMap: Record<string, any> = {
      passo_58: passo58,
      firma_presidente: passo59,
      invio_condomini: passo60,
      passo_61: passo61,
      passo_62: passo62,
    };
    const rStep = rendStepMap[def.id];
    const rStepFatto = Boolean(rStep?.fatto || rStep?.non_applicabile);
    const fattoRend =
      passo62Done ||
      (preferExistingScaletta && prevStep !== undefined
        ? Boolean(prevStep.fatto)
        : rStep
          ? rStepFatto
          : Boolean(prevStep?.fatto));

    return {
      ...def,
      ...(prevStep || {}),
      fatto: fattoRend,
      data_spunta: fattoRend
        ? rStep?.data_spunta || rStep?.data_esecuzione || prevStep?.data_spunta || nowStr
        : null,
      dettaglio: prevStep?.dettaglio || rStep?.valore_testo || '',
      note: rStep?.note_passo ?? rStep?.note ?? prevStep?.note ?? '',
    };
  });

  const baseItem: AssembleaStraordinariaItem = {
    id: existing?.id || 900000 + Number(scheda.condominio_id),
    condominio_id: Number(scheda.condominio_id),
    condominio_nome: scheda.condominio_nome || existing?.condominio_nome || `Condominio #${scheda.condominio_id}`,
    condominio_codice_danea: scheda.condominio_codice_danea ?? existing?.condominio_codice_danea ?? null,
    condominio_indirizzo: scheda.condominio_indirizzo ?? existing?.condominio_indirizzo ?? null,
    scheda_rendiconto_id: scheda.id ?? existing?.scheda_rendiconto_id ?? null,
    esercizio_rendiconto: esercizioLabel || existing?.esercizio_rendiconto || null,
    titolo:
      existing?.titolo ||
      `Assemblea Ordinaria Approvazione Rendiconto (${esercizioLabel || 'Esercizio in corso'})`,
    tipo: 'Ordinaria',
    data_prima_convocazione: existing?.data_prima_convocazione || null,
    ora_prima_convocazione: existing?.ora_prima_convocazione || '07:00',
    data_assemblea: dataFrom51 || existing?.data_assemblea || null,
    ora_assemblea: oraFrom51 || existing?.ora_assemblea || '18:00',
    luogo_sala: luogoFrom51 || existing?.luogo_sala || 'Sala Riunioni Studio Serra',
    ordine_del_giorno:
      existing?.ordine_del_giorno ||
      `1. Esame ed approvazione Rendiconto Consuntivo esercizio ${esercizioLabel} e relativo stato di riparto;\n2. Esame ed approvazione Preventivo Spese Ordinarie nuovo esercizio e piano rateale;\n3. Nomina/conferma Amministratore e determinazione compenso;\n4. Varie ed eventuali.`,
    presidente: existing?.presidente || '',
    segretario: existing?.segretario || '',
    modalita_invio: existing?.modalita_invio || 'PEC / Raccomandata / Consegna a mano',
    fatturata: existing?.fatturata ?? true,
    importo_compenso: existing?.importo_compenso ?? 0,
    stato: existing?.stato || 'convocata',
    assemblea_svolta: existing?.assemblea_svolta,
    data_assemblea_svolta: existing?.data_assemblea_svolta ?? null,
    note_generali:
      existing?.note_generali ||
      'Fase post-assemblea (Passi 58–62) unificata automaticamente dalla Procedura Rendiconto una volta completato il Passo #57.',
    scaletta: scalettaSync,
    passi_completati: 0,
    totale_passi: 8,
    percentuale: 0,
  };

  const m = calcolaMetricheAssemblea(baseItem);
  const finalItem: AssembleaStraordinariaItem = {
    ...baseItem,
    ...m,
  };

  const nextList = [...dedupedList];
  if (existingIdx >= 0) {
    nextList[existingIdx] = finalItem;
  } else {
    nextList.unshift(finalItem);
  }

  return { list: deduplicateAssembleeList(nextList), item: finalItem, changed: true };
}

/**
 * Garantisce che ogni Condominio con Rendiconto arrivato al 100% pre-assemblea (Passo #57)
 * sia presente come Assemblea Ordinaria nella lista unificata delle assemblee.
 */
export function ensureAllOrdinarieInAssembleeList(
  currentList: AssembleaStraordinariaItem[],
  condomini: any[] = [],
  rendicontiByCondo?: Record<number, any>
): AssembleaStraordinariaItem[] {
  let workingList = deduplicateAssembleeList(currentList);
  const parsed = getRuntimeSchedeCache();
  if (Array.isArray(parsed)) {
    // Se ci sono più schede per lo stesso condominio_id, privilegia quella che ha raggiunto il Passo #57 (100% pre-assemblea)
    const latestByCondo = new Map<number, any>();
    for (const scheda of parsed) {
      if (scheda && scheda.condominio_id) {
        const cid = Number(scheda.condominio_id);
        const prev = latestByCondo.get(cid);
        if (!prev) {
          latestByCondo.set(cid, scheda);
        } else {
          const prevHas57 =
            Boolean(findPassoByCode(prev.passi || [], '57')?.fatto) ||
            Number(prev.percentuale_fatto || 0) >= 100;
          const currHas57 =
            Boolean(findPassoByCode(scheda.passi || [], '57')?.fatto) ||
            Number(scheda.percentuale_fatto || 0) >= 100;
          if (currHas57 || !prevHas57) {
            latestByCondo.set(cid, scheda);
          }
        }
      }
    }
    for (const scheda of Array.from(latestByCondo.values())) {
      const res = buildOrUpdateAssembleaOrdinariaInList(workingList, scheda, true);
      if (res.changed) workingList = res.list;
    }
  }

  if (rendicontiByCondo && Array.isArray(condomini)) {
    for (const c of condomini) {
      const prog = rendicontiByCondo[c.id];
      const isRendCompletato =
        c.rendiconto_stato === 'completato' || c.stato_rendiconto === 'completato';
      if (!prog || !prog.inAttesaAssemblea || isRendCompletato) continue;
      const alreadyExists = workingList.some(
        (a) => a.tipo === 'Ordinaria' && Number(a.condominio_id) === Number(c.id)
      );
      if (alreadyExists) continue;

      const postDone = Number(prog.postAssembleaCompletati ?? prog.postCompletati ?? 0);
      const fallbackItem: AssembleaStraordinariaItem = {
        id: 900000 + Number(c.id),
        condominio_id: Number(c.id),
        condominio_nome: c.nome,
        condominio_codice_danea: c.codice_danea || null,
        condominio_indirizzo: `${c.indirizzo || ''}, ${c.citta || 'Bergamo'}`,
        scheda_rendiconto_id: prog.schedaId || null,
        esercizio_rendiconto: prog.gestione || prog.esercizio || `${c.mese_chiusura_rendiconto || 'Dicembre'}`,
        titolo: `Assemblea Ordinaria Approvazione Rendiconto (${prog.gestione || prog.esercizio || c.mese_chiusura_rendiconto || 'Bilancio'})`,
        tipo: 'Ordinaria',
        data_prima_convocazione: null,
        ora_prima_convocazione: '07:00',
        data_assemblea: prog.dataAssemblea || c.scadenza_assemblea || null,
        ora_assemblea: prog.oraAssemblea || '18:00',
        luogo_sala: prog.luogoAssemblea || 'Sala Riunioni Studio Serra',
        ordine_del_giorno: `1. Esame ed approvazione Rendiconto Consuntivo e stato di riparto;\n2. Esame ed approvazione Preventivo Spese Ordinarie e piano rateale;\n3. Nomina/conferma Amministratore e determinazione compenso;\n4. Varie ed eventuali.`,
        presidente: '',
        segretario: '',
        modalita_invio: 'PEC / Raccomandata / Consegna a mano',
        fatturata: true,
        importo_compenso: 0,
        stato: postDone >= 5 ? 'conclusa' : postDone > 0 ? 'in_firma' : 'convocata',
        assemblea_svolta: postDone > 0,
        note_generali:
          'Fase post-assemblea (Passi 58–62) unificata automaticamente dalla Procedura Rendiconto una volta completato il Passo #57.',
        scaletta: DEFAULT_SCALETTA_ORDINARIA_PASSI.map((def, idx) => {
          const isPost = POST_ASSEMBLEA_STEP_IDS.has(def.id);
          const postIdx = idx - 3;
          const fattoPost = isPost && postIdx >= 0 && postIdx < postDone;
          return {
            ...def,
            fatto: !isPost ? true : fattoPost,
          };
        }),
        passi_completati: 3 + postDone,
        totale_passi: 8,
        percentuale: Math.round(((3 + postDone) / 8) * 100),
      };
      const m = calcolaMetricheAssemblea(fallbackItem);
      workingList.push({ ...fallbackItem, ...m });
    }
  }

  return deduplicateAssembleeList(workingList);
}

export async function syncAssembleaOrdinariaFromScheda(
  scheda: any,
  apiBase?: string
): Promise<AssembleaStraordinariaItem | null> {
  const currentList = readLocalAssembleeStraordinarie();
  const { list, item, changed } = buildOrUpdateAssembleaOrdinariaInList(currentList, scheda);
  if (!changed || !item) return null;
  writeLocalAssembleeStraordinarie(list);

  if (apiBase) {
    try {
      const payload = {
        condominio_id: item.condominio_id,
        titolo: item.titolo,
        tipo: 'Ordinaria',
        data_prima_convocazione: item.data_prima_convocazione,
        ora_prima_convocazione: item.ora_prima_convocazione,
        data_assemblea: item.data_assemblea,
        ora_assemblea: item.ora_assemblea,
        luogo_sala: item.luogo_sala,
        ordine_del_giorno: item.ordine_del_giorno,
        presidente: item.presidente,
        segretario: item.segretario,
        modalita_invio: item.modalita_invio,
        fatturata: item.fatturata,
        importo_compenso: item.importo_compenso,
        stato: item.stato,
        note_generali: item.note_generali,
        scaletta: item.scaletta,
      };
      await fetch(`${apiBase}/api/assemblee-straordinarie/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
    } catch {
      // ignore
    }
  }
  return item;
}

/**
 * Quando si spunta un passo 58–62 nella Gestione Assemblee (o dalla Dashboard) per un'Assemblea Ordinaria,
 * aggiorna bidirezionalmente anche la Scheda Rendiconto (Modello 5) in localStorage e sul backend.
 */
export async function syncPassoAssembleaToRendiconto(
  assemblea: AssembleaStraordinariaItem,
  stepId: string,
  nuovoFatto: boolean,
  note?: string,
  apiBase?: string
) {
  if (assemblea.tipo !== 'Ordinaria') return;
  const passoRendCode = STEP_ID_TO_RENDICONTO_PASSO_ID[stepId];
  if (!passoRendCode) return;

  const nowStr = new Date().toLocaleDateString('it-IT');
  let schedaIdToPatch: number | null = assemblea.scheda_rendiconto_id || null;
  let passoDbIdToPatch: number = passoRendCode;
  const isClosingStep62 = stepId === 'passo_62' && nuovoFatto === true;
  let becameCompleted = isClosingStep62;

  try {
    const parsed = getRuntimeSchedeCache();
    if (Array.isArray(parsed)) {
      const condoId = Number(assemblea.condominio_id);
      const postCodes = new Set(['58', '59', '60', '61', '62']);

      const updateSchedaObj = (scheda: any) => {
        if (!scheda || !Array.isArray(scheda.passi)) return scheda;
        schedaIdToPatch = scheda.id || schedaIdToPatch;
        const nextPassi = scheda.passi.map((p: any) => {
          const codeStr = String(p?.numero_codice ?? p?.id ?? '').trim();
          const isMatch =
            String(p?.numero_codice ?? '').trim() === String(passoRendCode) ||
            (p?.numero_codice === undefined && Number(p?.id) === passoRendCode);

          if (isMatch) {
            if (p.id) passoDbIdToPatch = p.id;
            return {
              ...p,
              fatto: nuovoFatto,
              data_spunta: nuovoFatto ? nowStr : null,
              ...(note !== undefined ? { note_passo: note } : {}),
            };
          }

          if (isClosingStep62 && postCodes.has(codeStr) && !p.fatto) {
            return {
              ...p,
              fatto: true,
              data_spunta: p.data_spunta || nowStr,
            };
          }

          if (!nuovoFatto && stepId !== 'passo_62' && codeStr === '62' && p.fatto) {
            return {
              ...p,
              fatto: false,
              data_spunta: null,
            };
          }

          return p;
        });
        const passiPost = nextPassi.filter((p: any) =>
          postCodes.has(String(p?.numero_codice ?? p?.id ?? '').trim())
        );
        const postFatti = passiPost.filter((p: any) => p.fatto || p.non_applicabile).length;
        const tuttiPostFatti =
          isClosingStep62 || (passiPost.length > 0 && postFatti >= passiPost.length);
        if (tuttiPostFatti) becameCompleted = true;

        return {
          ...scheda,
          passi: nextPassi,
          post_assemblea_completati: tuttiPostFatti ? passiPost.length || 5 : postFatti,
          post_assemblea_totale: passiPost.length || 5,
          stato: tuttiPostFatti ? 'completato' : 'in_attesa_assemblea',
          in_attesa_assemblea: !tuttiPostFatti,
        };
      };

      const nextCache = [...parsed];
      let updatedAny = false;
      for (let i = 0; i < nextCache.length; i++) {
        const s = nextCache[i];
        if (
          (schedaIdToPatch && Number(s?.id) === Number(schedaIdToPatch)) ||
          Number(s?.condominio_id) === condoId
        ) {
          const has57 =
            Boolean(findPassoByCode(s?.passi || [], '57')?.fatto) ||
            Number(s?.percentuale_fatto || 0) >= 100 ||
            Boolean(s?.in_attesa_assemblea);
          nextCache[i] = updateSchedaObj(s);
          if (has57 && s?.id) {
            schedaIdToPatch = s.id;
          }
          updatedAny = true;
        }
      }
      if (updatedAny) {
        saveSchedeToStorage(nextCache);
      }
    }
  } catch {
    // ignore runtime cache error
  }

  const base = apiBase || `http://${window.location.hostname}:8018`;
  try {
    if (!schedaIdToPatch && assemblea.condominio_id) {
      let sRes = await fetch(
        `${base}/api/rendiconti?condominio_id=${assemblea.condominio_id}`
      ).catch(() => null);
      if (!sRes || !sRes.ok) {
        sRes = await fetch(
          `http://${window.location.hostname}:8018/api/rendiconti?condominio_id=${assemblea.condominio_id}`
        ).catch(() => null);
      }
      if (sRes && sRes.ok) {
        const sList = await sRes.json();
        if (Array.isArray(sList) && sList.length > 0) {
          const activeScheda =
            [...sList]
              .reverse()
              .find(
                (s: any) =>
                  Boolean(findPassoByCode(s?.passi || [], '57')?.fatto) ||
                  Number(s?.percentuale_fatto || 0) >= 100 ||
                  Boolean(s?.in_attesa_assemblea)
              ) || sList[sList.length - 1];
          schedaIdToPatch = activeScheda.id;
        }
      }
    }

    if (schedaIdToPatch) {
      // Usa passoRendCode (58..62) così il backend risolve sempre il passo per numero_codice
      let pRes = await fetch(`${base}/api/rendiconti/${schedaIdToPatch}/passi/${passoRendCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fatto: nuovoFatto,
          ...(note !== undefined ? { note_passo: note } : {}),
        }),
      }).catch(() => null);
      if ((!pRes || !pRes.ok) && passoDbIdToPatch !== passoRendCode) {
        await fetch(`${base}/api/rendiconti/${schedaIdToPatch}/passi/${passoDbIdToPatch}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fatto: nuovoFatto,
            ...(note !== undefined ? { note_passo: note } : {}),
          }),
        }).catch(() => null);
      }
    }

    if (assemblea.condominio_id && (becameCompleted || !nuovoFatto)) {
      const nuovoStatoCondo = becameCompleted ? 'completato' : 'in_corso';
      await fetch(`${base}/api/condomini/${assemblea.condominio_id}/documenti-necessari`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rendiconto_stato: nuovoStatoCondo }),
      }).catch(() => null);
    }
  } catch {
    // ignore
  }
}

/**
 * Sincronizza modifiche a Data, Ora o Posto/Sala dall'Assemblea Ordinaria verso il Passo #51 del Rendiconto
 */
export async function syncMetaAssembleaToRendiconto(
  assemblea: AssembleaStraordinariaItem,
  patch: Partial<AssembleaStraordinariaItem>,
  apiBase?: string
) {
  if (assemblea.tipo !== 'Ordinaria') return;
  if (
    patch.luogo_sala === undefined &&
    patch.data_assemblea === undefined &&
    patch.ora_assemblea === undefined
  ) {
    return;
  }

  let schedaIdToPatch: number | null = assemblea.scheda_rendiconto_id || null;
  let passo51DbId = 51;
  let nextCampiExtra51: Record<string, string> | null = null;

  try {
    const parsed = getRuntimeSchedeCache();
    if (Array.isArray(parsed)) {
      const condoId = Number(assemblea.condominio_id);

      const updateSchedaMeta = (scheda: any) => {
        if (!scheda || !Array.isArray(scheda.passi)) return scheda;
        schedaIdToPatch = scheda.id || schedaIdToPatch;
        const nextPassi = scheda.passi.map((p: any) => {
          const is51 =
            String(p?.numero_codice ?? '').trim() === '51' ||
            (p?.numero_codice === undefined && Number(p?.id) === 51);
          if (!is51) return p;
          if (p.id) passo51DbId = p.id;
          const extra = { ...(p.campi_extra || {}) };
          if (patch.luogo_sala !== undefined) extra['Presso'] = patch.luogo_sala || '';
          if (patch.data_assemblea !== undefined) extra['Data riunione'] = patch.data_assemblea || '';
          if (patch.ora_assemblea !== undefined) extra['Ora riunione'] = patch.ora_assemblea || '';
          nextCampiExtra51 = extra;
          return { ...p, campi_extra: extra };
        });
        return {
          ...scheda,
          ...(patch.data_assemblea !== undefined ? { data_assemblea: patch.data_assemblea } : {}),
          passi: nextPassi,
        };
      };

      const nextCache = [...parsed];
      let targetIdx = -1;
      for (let i = nextCache.length - 1; i >= 0; i--) {
        if (
          (schedaIdToPatch && Number(nextCache[i]?.id) === Number(schedaIdToPatch)) ||
          Number(nextCache[i]?.condominio_id) === condoId
        ) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx >= 0) {
        nextCache[targetIdx] = updateSchedaMeta(nextCache[targetIdx]);
        saveSchedeToStorage(nextCache);
      }
    }
  } catch {
    // ignore
  }

  if (schedaIdToPatch && nextCampiExtra51) {
    const base = apiBase || `http://${window.location.hostname}:8018`;
    try {
      await fetch(`${base}/api/rendiconti/${schedaIdToPatch}/passi/${passo51DbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campi_extra: nextCampiExtra51 }),
      }).catch(() => null);
    } catch {
      // ignore
    }
  }
}

interface Props {
  apiBase: string;
  condomini: any[];
  condominiAttesaAssembleaOrdinaria?: any[];
  selectedCondominioId?: number | null;
  initialCondominioId?: number | null;
  initialFiltroStato?:
    | 'tutte'
    | 'attive'
    | 'in_organizzazione'
    | 'convocata'
    | 'post_assemblea'
    | 'concluse'
    | 'da_fatturare';
  onNotify: (msg: string) => void;
  onOpenProceduraRendiconto?: (condominioId: number) => void;
  onOpenRendicontoCondo?: (condominioId: number) => void;
  onRinnovaEsercizio?: (condominioId: number) => void;
  rendicontiProgressByCondo?: Record<number, any>;
  onAssembleeChange?: (list: AssembleaStraordinariaItem[]) => void;
}

export const GestioneAssembleeView: React.FC<Props> = ({
  apiBase,
  condomini,
  condominiAttesaAssembleaOrdinaria: propAttesaList,
  selectedCondominioId,
  initialCondominioId,
  initialFiltroStato,
  onNotify,
  onOpenProceduraRendiconto,
  onOpenRendicontoCondo,
  onRinnovaEsercizio,
  rendicontiProgressByCondo,
  onAssembleeChange,
}) => {
  const effectiveInitialCondoId = selectedCondominioId ?? initialCondominioId ?? null;
  const handleOpenRendiconto = (condoId: number) => {
    if (onOpenProceduraRendiconto) onOpenProceduraRendiconto(condoId);
    else if (onOpenRendicontoCondo) onOpenRendicontoCondo(condoId);
  };
  const handleRinnova = (condoId: number) => {
    if (onRinnovaEsercizio) onRinnovaEsercizio(condoId);
  };

  const condominiAttesaAssembleaOrdinaria = React.useMemo(() => {
    if (Array.isArray(propAttesaList)) return propAttesaList;
    if (!rendicontiProgressByCondo) return [];
    return (condomini || [])
      .filter((c) => {
        const prog = rendicontiProgressByCondo[c.id];
        return prog && prog.inAttesaAssemblea && c.stato_rendiconto !== 'completato';
      })
      .map((c) => ({
        ...c,
        rendProg: rendicontiProgressByCondo[c.id],
      }));
  }, [propAttesaList, condomini, rendicontiProgressByCondo]);

  const [assemblee, setAssemblee] = useState<AssembleaStraordinariaItem[]>(() =>
    readLocalAssembleeStraordinarie()
  );
  const [filtroTipo, setFiltroTipo] = useState<'tutte' | 'ordinarie' | 'straordinarie'>('tutte');
  const [filtroStato, setFiltroStato] = useState<
    'tutte' | 'attive' | 'in_organizzazione' | 'convocata' | 'post_assemblea' | 'concluse' | 'da_fatturare'
  >(initialFiltroStato || 'tutte');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCondoFilter, setSelectedCondoFilter] = useState<number | 'tutti'>(
    effectiveInitialCondoId || 'tutti'
  );
  const [expandedAssembleaId, setExpandedAssembleaId] = useState<number | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [assembleaToDelete, setAssembleaToDelete] = useState<AssembleaStraordinariaItem | null>(null);

  const [newForm, setNewForm] = useState({
    condominio_id: effectiveInitialCondoId || (condomini[0]?.id ?? 0),
    titolo: '',
    tipo: 'Straordinaria',
    data_prima_convocazione: '',
    ora_prima_convocazione: '07:00',
    data_assemblea: '',
    ora_assemblea: '18:00',
    luogo_sala: 'Sala Riunioni Studio Serra',
    ordine_del_giorno: TEMPLATE_ODG_STRAORDINARIA[0].testo,
    presidente: '',
    segretario: '',
    modalita_invio: 'PEC / Raccomandata / Consegna a mano',
    importo_compenso: 0,
    note_generali: '',
  });

  useEffect(() => {
    if (initialFiltroStato) {
      setFiltroStato(initialFiltroStato);
    }
  }, [initialFiltroStato]);

  useEffect(() => {
    if (effectiveInitialCondoId) {
      setSelectedCondoFilter(effectiveInitialCondoId);
      setNewForm((prev) => ({ ...prev, condominio_id: effectiveInitialCondoId }));
      const matching = assemblee.find((a) => Number(a.condominio_id) === Number(effectiveInitialCondoId));
      if (matching) {
        setExpandedAssembleaId(matching.id);
      }
    } else {
      setSelectedCondoFilter('tutti');
    }
  }, [effectiveInitialCondoId]);

  const syncWithParent = (next: AssembleaStraordinariaItem[]) => {
    const deduped = deduplicateAssembleeList(next);
    setAssemblee(deduped);
    writeLocalAssembleeStraordinarie(deduped);
    if (onAssembleeChange) {
      onAssembleeChange(deduped);
    }
  };

  // Sincronizza in automatico nella lista unificata tutte le schede Rendiconto arrivate al Passo #57 (fasi 58–62)
  const ensureOrdinarieFromRendicontoSynced = (baseList: AssembleaStraordinariaItem[]) => {
    const workingList = ensureAllOrdinarieInAssembleeList(
      baseList,
      condomini,
      rendicontiProgressByCondo
    );
    return { list: workingList, anyChanged: workingList.length !== baseList.length };
  };

  // Carica assemblee dal backend VPS e le sincronizza con le Ordinarie da Rendiconto (Passi 58–62)
  const fetchAssemblee = async () => {
    try {
      const res = await fetch(`${apiBase}/api/assemblee-straordinarie`).catch(() => null);
      const mergedMap = new Map<number, AssembleaStraordinariaItem>();

      if (res && res.ok) {
        const srvList: AssembleaStraordinariaItem[] = await res.json();
        for (const s of srvList) {
          const m = calcolaMetricheAssemblea(s);
          mergedMap.set(s.id, { ...s, ...m });
        }
      } else {
        for (const loc of readLocalAssembleeStraordinarie()) {
          mergedMap.set(loc.id, loc);
        }
      }

      const merged = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
      const { list: syncedWithOrdinarie } = ensureOrdinarieFromRendicontoSynced(merged);
      syncWithParent(syncedWithOrdinarie);

      if (effectiveInitialCondoId) {
        const condoMatch = syncedWithOrdinarie.find(
          (a) => Number(a.condominio_id) === Number(effectiveInitialCondoId)
        );
        if (condoMatch) {
          setExpandedAssembleaId(condoMatch.id);
          return;
        }
      }
      if (syncedWithOrdinarie.length > 0 && expandedAssembleaId === null) {
        setExpandedAssembleaId(syncedWithOrdinarie[0].id);
      }
    } catch {
      // fallback su localStorage
    }
  };

  useEffect(() => {
    const initial = readLocalAssembleeStraordinarie();
    const { list: synced } = ensureOrdinarieFromRendicontoSynced(initial);
    syncWithParent(synced);
    if (effectiveInitialCondoId) {
      const match = synced.find((a) => Number(a.condominio_id) === Number(effectiveInitialCondoId));
      if (match) setExpandedAssembleaId(match.id);
    } else if (synced.length > 0 && expandedAssembleaId === null) {
      setExpandedAssembleaId(synced[0].id);
    }
    fetchAssemblee();
  }, []);

  const persistUpdateAssemblea = async (updated: AssembleaStraordinariaItem) => {
    const m = calcolaMetricheAssemblea(updated);
    const normalized: AssembleaStraordinariaItem = {
      ...updated,
      ...m,
    };

    const nextList = deduplicateAssembleeList(
      assemblee.map((a) =>
        a.id === normalized.id ||
        (normalized.tipo === 'Ordinaria' &&
          a.tipo === 'Ordinaria' &&
          Number(a.condominio_id) === Number(normalized.condominio_id))
          ? normalized
          : a
      )
    );
    syncWithParent(nextList);

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
      let res = await fetch(`${apiBase}/api/assemblee-straordinarie/${normalized.id}`, {
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

  const handleCreateAssemblea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.titolo.trim()) {
      onNotify("Inserisci l'oggetto/titolo dell'assemblea straordinaria");
      return;
    }
    const condo = condomini.find((c) => Number(c.id) === Number(newForm.condominio_id)) || condomini[0];
    if (!condo) return;

    const nowFormatted = new Date().toLocaleDateString('it-IT');
    const initialScaletta: PassoScalettaAssemblea[] = DEFAULT_SCALETTA_PASSI.map((p) => {
      if (p.id === 'odg' && newForm.ordine_del_giorno.trim()) {
        return {
          ...p,
          fatto: true,
          data_spunta: nowFormatted,
          dettaglio: 'Ordine del giorno predisposto in apertura',
        };
      }
      if (p.id === 'sala' && newForm.luogo_sala.trim() && newForm.data_assemblea) {
        return {
          ...p,
          fatto: true,
          data_spunta: nowFormatted,
          dettaglio: `${newForm.luogo_sala} (${new Date(newForm.data_assemblea).toLocaleDateString('it-IT')} ore ${newForm.ora_assemblea || '18:00'})`,
        };
      }
      return { ...p };
    });

    const payload = {
      condominio_id: Number(condo.id),
      titolo: newForm.titolo.trim(),
      tipo: newForm.tipo || 'Straordinaria',
      data_prima_convocazione: newForm.data_prima_convocazione || null,
      ora_prima_convocazione: newForm.ora_prima_convocazione || '07:00',
      data_assemblea: newForm.data_assemblea || null,
      ora_assemblea: newForm.ora_assemblea || '18:00',
      luogo_sala: newForm.luogo_sala || 'Sala Riunioni Studio Serra',
      ordine_del_giorno: newForm.ordine_del_giorno || '',
      presidente: newForm.presidente || '',
      segretario: newForm.segretario || '',
      modalita_invio: newForm.modalita_invio || 'PEC / Raccomandata / Consegna a mano',
      fatturata: false,
      importo_compenso: Number(newForm.importo_compenso) || 0,
      note_generali: newForm.note_generali || '',
      scaletta: initialScaletta,
    };

    let createdItem: AssembleaStraordinariaItem | null = null;
    try {
      let res = await fetch(`${apiBase}/api/assemblee-straordinarie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`http://${window.location.hostname}:8018/api/assemblee-straordinarie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
      }
      if (res && res.ok) {
        createdItem = await res.json();
      }
    } catch {
      // fallback locale
    }

    if (!createdItem) {
      const m = calcolaMetricheAssemblea({ scaletta: initialScaletta });
      createdItem = {
        id: Date.now(),
        condominio_id: Number(condo.id),
        condominio_nome: condo.nome,
        condominio_codice_danea: condo.codice_danea,
        condominio_indirizzo: `${condo.indirizzo || ''}, ${condo.citta || 'Bergamo'}`,
        ...payload,
        ...m,
      };
    } else {
      const m = calcolaMetricheAssemblea(createdItem);
      createdItem = { ...createdItem, ...m };
    }

    const next = [createdItem, ...assemblee];
    syncWithParent(next);
    setExpandedAssembleaId(createdItem.id);
    setShowNewModal(false);
    setNewForm((prev) => ({
      ...prev,
      titolo: '',
      data_prima_convocazione: '',
      data_assemblea: '',
      presidente: '',
      segretario: '',
      note_generali: '',
    }));
    onNotify(`Assemblea straordinaria creata per "${condo.nome}"`);
  };

  const handleToggleAssembleaSvolta = (assemblea: AssembleaStraordinariaItem, svolta: boolean) => {
    const nowStr = new Date().toLocaleDateString('it-IT');
    if (svolta) {
      // Quando l'assemblea è fatta, spunta automaticamente i passi pre-assemblea (1–3: OdG, Sala, Convocazioni)
      // e sposta l'assemblea nel riquadro "Completamento Procedura" (stato = 'in_firma')
      const nextScaletta = assemblea.scaletta.map((p) => {
        if (p.id === 'odg' || p.id === 'sala' || p.id === 'convocazioni') {
          return {
            ...p,
            fatto: true,
            data_spunta: p.data_spunta || nowStr,
          };
        }
        return p;
      });
      const updated: AssembleaStraordinariaItem = {
        ...assemblea,
        scaletta: nextScaletta,
        assemblea_svolta: true,
        data_assemblea_svolta: nowStr,
        stato: 'in_firma',
      };
      persistUpdateAssemblea(updated);
      onNotify(
        `✓ Assemblea svolta per "${assemblea.condominio_nome}": spostata nel riquadro Completamento Procedura`
      );
    } else {
      // Riporta l'assemblea nel riquadro "In Attesa Assemblea" (deseleziona eventuali passi post-assemblea)
      const nextScaletta = assemblea.scaletta.map((p) => {
        if (POST_ASSEMBLEA_STEP_IDS.has(p.id)) {
          return {
            ...p,
            fatto: false,
            data_spunta: null,
          };
        }
        return p;
      });
      const updated: AssembleaStraordinariaItem = {
        ...assemblea,
        scaletta: nextScaletta,
        assemblea_svolta: false,
        data_assemblea_svolta: null,
        stato: nextScaletta.find((s) => s.id === 'convocazioni')?.fatto
          ? 'convocata'
          : 'in_organizzazione',
      };
      persistUpdateAssemblea(updated);
      if (assemblea.tipo === 'Ordinaria') {
        for (const postId of Array.from(POST_ASSEMBLEA_STEP_IDS)) {
          syncPassoAssembleaToRendiconto(updated, postId, false, undefined, apiBase);
        }
      }
      onNotify(`↩ Assemblea riportata nel riquadro "In Attesa Assemblea" (${assemblea.condominio_nome})`);
    }
  };

  const handleTogglePassoScaletta = (assemblea: AssembleaStraordinariaItem, passoId: string) => {
    const nowStr = new Date().toLocaleDateString('it-IT');
    const targetCurrent = assemblea.scaletta.find((p) => p.id === passoId);
    const nextFattoVal = !targetCurrent?.fatto;
    const isClosingStep62 = passoId === 'passo_62' && nextFattoVal === true;

    const nextScaletta = assemblea.scaletta.map((p) => {
      if (p.id === passoId) {
        return {
          ...p,
          fatto: nextFattoVal,
          data_spunta: nextFattoVal ? nowStr : null,
        };
      }
      // Spuntando "Invio eventuali MAV" (Passo #62) si chiude l'intera procedura post-assemblea
      if (isClosingStep62 && !p.fatto) {
        return {
          ...p,
          fatto: true,
          data_spunta: p.data_spunta || nowStr,
        };
      }
      // Deselezionando un passo precedente quando il 62 era spuntato, si riapre la procedura
      if (!nextFattoVal && passoId !== 'passo_62' && p.id === 'passo_62' && p.fatto) {
        return {
          ...p,
          fatto: false,
          data_spunta: null,
        };
      }
      return p;
    });

    const allChecked = nextScaletta.every((s) => Boolean(s.fatto));
    const anyPostChecked = nextScaletta.some(
      (s) => POST_ASSEMBLEA_STEP_IDS.has(s.id) && Boolean(s.fatto)
    );
    const updated: AssembleaStraordinariaItem = {
      ...assemblea,
      scaletta: nextScaletta,
      assemblea_svolta: allChecked || anyPostChecked ? true : assemblea.assemblea_svolta,
      stato: allChecked ? 'conclusa' : anyPostChecked ? 'in_firma' : assemblea.stato,
    };

    // Sincronizza PRIMA la Scheda Rendiconto in localStorage così il re-render del parent legge i dati aggiornati
    const toggledStep = nextScaletta.find((p) => p.id === passoId);
    if (assemblea.tipo === 'Ordinaria') {
      void syncPassoAssembleaToRendiconto(
        updated,
        passoId,
        nextFattoVal,
        toggledStep?.note,
        apiBase
      );
    }

    persistUpdateAssemblea(updated);

    if (toggledStep) {
      if (allChecked && toggledStep.fatto) {
        onNotify(
          `✓ Procedura Assemblea e Rendiconto conclusa al 100% (${assemblea.condominio_nome})!`
        );
      } else {
        onNotify(
          toggledStep.fatto
            ? `✓ Completato: ${toggledStep.titolo} (${assemblea.condominio_nome})`
            : `Rimosso completamento: ${toggledStep.titolo}`
        );
      }
    }
  };

  const handleUpdatePassoField = (
    assemblea: AssembleaStraordinariaItem,
    passoId: string,
    field: 'dettaglio' | 'note' | 'data_spunta',
    value: string
  ) => {
    const nextScaletta = assemblea.scaletta.map((p) =>
      p.id === passoId ? { ...p, [field]: value } : p
    );
    const updated: AssembleaStraordinariaItem = {
      ...assemblea,
      scaletta: nextScaletta,
    };
    persistUpdateAssemblea(updated);

    if (assemblea.tipo === 'Ordinaria' && field === 'note') {
      const targetStep = nextScaletta.find((p) => p.id === passoId);
      if (targetStep) {
        syncPassoAssembleaToRendiconto(updated, passoId, Boolean(targetStep.fatto), value, apiBase);
      }
    }
  };

  const handleUpdateAssembleaMeta = (
    assemblea: AssembleaStraordinariaItem,
    patch: Partial<AssembleaStraordinariaItem>
  ) => {
    const updated: AssembleaStraordinariaItem = {
      ...assemblea,
      ...patch,
    };
    persistUpdateAssemblea(updated);
    if (assemblea.tipo === 'Ordinaria') {
      syncMetaAssembleaToRendiconto(updated, patch, apiBase);
    }
  };

  const handleDeleteAssemblea = async () => {
    if (!assembleaToDelete) return;
    const targetId = assembleaToDelete.id;
    const next = assemblee.filter((a) => a.id !== targetId);
    syncWithParent(next);
    setAssembleaToDelete(null);

    try {
      let res = await fetch(`${apiBase}/api/assemblee-straordinarie/${targetId}`, {
        method: 'DELETE',
      }).catch(() => null);
      if (!res || !res.ok) {
        await fetch(`http://${window.location.hostname}:8018/api/assemblee-straordinarie/${targetId}`, {
          method: 'DELETE',
        }).catch(() => null);
      }
    } catch {
      // ignore
    }
    onNotify('Assemblea rimossa dalla lista');
  };

  // Calcola termine ultimo invio convocazioni (almeno 5 giorni liberi prima della 1ª convocazione o data assemblea)
  const getTerminiConvocazioneInfo = (a: AssembleaStraordinariaItem) => {
    const refDateStr = a.data_prima_convocazione || a.data_assemblea;
    if (!refDateStr) return null;
    const dtRiunione = new Date(refDateStr);
    if (isNaN(dtRiunione.getTime())) return null;
    // 5 giorni liberi prima = almeno 6 giorni prima della data di 1ª convocazione
    const dtLimiteInvio = new Date(dtRiunione.getTime() - 6 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const giorniAlLimite = Math.ceil((dtLimiteInvio.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const giorniAllaRiunione = Math.ceil((dtRiunione.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const convocazioniInviate = Boolean(
      a.scaletta.find((s) => s.id === 'convocazioni')?.fatto
    );

    return {
      dtRiunioneFormatted: dtRiunione.toLocaleDateString('it-IT'),
      dtLimiteInvioFormatted: dtLimiteInvio.toLocaleDateString('it-IT'),
      giorniAlLimite,
      giorniAllaRiunione,
      convocazioniInviate,
      isScadutoInvio: !convocazioniInviate && giorniAlLimite < 0,
      isImminenteInvio: !convocazioniInviate && giorniAlLimite >= 0 && giorniAlLimite <= 5,
    };
  };

  // Statistiche KPI Unificate (Assemblee Ordinarie Post-Passo 57 + Assemblee Straordinarie)
  const kpi = React.useMemo(() => {
    const totali = assemblee.length;
    const ordinarieCount = assemblee.filter((a) => a.tipo === 'Ordinaria').length;
    const straordinarieCount = assemblee.filter((a) => a.tipo !== 'Ordinaria').length;
    // In Attesa Assemblea (Prima della riunione): sia Ordinarie (al passo 57) che Straordinarie (passi 1-3)
    const inOrganizzazione = assemblee.filter(
      (a) => a.passi_completati < a.totale_passi && !isAssembleaGiaSvolta(a)
    ).length;
    // Completamento Procedura (Post-Assemblea, una volta fatta): sia Ordinarie (58-62) che Straordinarie (4-5)
    const convocate = assemblee.filter(
      (a) => a.passi_completati < a.totale_passi && isAssembleaGiaSvolta(a)
    ).length;
    const concluse = assemblee.filter((a) => a.passi_completati >= a.totale_passi).length;
    const daFatturare = assemblee.filter((a) => a.tipo !== 'Ordinaria' && !a.fatturata).length;
    return {
      totali,
      ordinarieCount,
      straordinarieCount,
      attive: totali - concluse,
      inOrganizzazione,
      convocate,
      concluse,
      daFatturare,
      ordinarieInAttesa: Math.max(ordinarieCount, condominiAttesaAssembleaOrdinaria.length),
    };
  }, [assemblee, condominiAttesaAssembleaOrdinaria]);

  const assembleeFiltrate = assemblee.filter((a) => {
    if (filtroTipo === 'ordinarie' && a.tipo !== 'Ordinaria') return false;
    if (filtroTipo === 'straordinarie' && a.tipo === 'Ordinaria') return false;

    if (selectedCondoFilter !== 'tutti' && Number(a.condominio_id) !== Number(selectedCondoFilter)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (a.titolo && a.titolo.toLowerCase().includes(q)) ||
        (a.condominio_nome && a.condominio_nome.toLowerCase().includes(q)) ||
        (a.condominio_codice_danea && a.condominio_codice_danea.toLowerCase().includes(q)) ||
        (a.ordine_del_giorno && a.ordine_del_giorno.toLowerCase().includes(q)) ||
        (a.presidente && a.presidente.toLowerCase().includes(q));
      if (!match) return false;
    }

    const isConclusa = a.passi_completati >= a.totale_passi;
    const giaSvolta = isAssembleaGiaSvolta(a);

    if (filtroStato === 'attive') return !isConclusa;
    if (filtroStato === 'in_organizzazione') return !isConclusa && !giaSvolta;
    if (filtroStato === 'convocata') return !isConclusa && !giaSvolta;
    if (filtroStato === 'post_assemblea') return !isConclusa && giaSvolta;
    if (filtroStato === 'concluse') return isConclusa;
    if (filtroStato === 'da_fatturare') return a.tipo !== 'Ordinaria' && !a.fatturata;
    return true;
  });

  const getStepIcon = (stepId: string, fatto: boolean) => {
    const cls = fatto ? 'w-4 h-4 text-emerald-600' : 'w-4 h-4 text-amber-600';
    if (stepId === 'odg') return <FileText className={cls} />;
    if (stepId === 'sala') return <MapPin className={cls} />;
    if (stepId === 'convocazioni') return <Send className={cls} />;
    if (stepId === 'passo_58') return <Edit3 className={cls} />;
    if (stepId === 'firma_presidente') return <FileSignature className={cls} />;
    if (stepId === 'invio_condomini') return <Users className={cls} />;
    if (stepId === 'passo_61') return <Calendar className={cls} />;
    if (stepId === 'passo_62') return <Receipt className={cls} />;
    return <CheckSquare className={cls} />;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* BANNER SUPERIORE UNIFICATO GESTIONE ASSEMBLEE */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-purple-800/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
              Centro Unificato Gestione Assemblee
            </span>
            <span className="text-xs text-purple-200 font-medium">
              Assemblee Straordinarie & Fase Post-Assemblea Rendiconto (Passi 58–62) in un unico posto
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-400 shrink-0" />
            <span>Gestione Unificata Assemblee (Ordinarie Post-Passo 57 & Straordinarie)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            Unico punto di controllo per tutte le assemblee: una volta spuntati i punti fino al{' '}
            <strong className="text-emerald-300">Passo #57 del Rendiconto</strong>, la fase post-assemblea{' '}
            <strong className="text-amber-300">(Passi 58–62)</strong> confluisce automaticamente qui insieme
            alle <strong>Assemblee Straordinarie</strong> per verificare in un unico posto data, ora, sala,
            verbale, firma Presidente e invio ai condomini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuova Assemblea Straordinaria</span>
          </button>
        </div>
      </div>

      {/* FILTRO TIPOLOGIA NELLA VISTA UNIFICATA: TUTTE vs ORDINARIE (58-62) vs STRAORDINARIE */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltroTipo('tutte')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer ${
              filtroTipo === 'tutte'
                ? 'bg-slate-900 text-amber-400 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tutte le Assemblee Unificate</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                filtroTipo === 'tutte'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {kpi.totali}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipo('ordinarie')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer ${
              filtroTipo === 'ordinarie'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-purple-50 hover:text-purple-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Ordinarie • Rendiconto (Passi 58–62)</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                filtroTipo === 'ordinarie'
                  ? 'bg-white text-purple-900'
                  : 'bg-purple-100 text-purple-800'
              }`}
            >
              {kpi.ordinarieCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipo('straordinarie')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 cursor-pointer ${
              filtroTipo === 'straordinarie'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Straordinarie (Scaletta 5 Passi)</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                filtroTipo === 'straordinarie'
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {kpi.straordinarieCount}
            </span>
          </button>
        </div>

        {/* RIEPILOGO VISIVO SCALETTA UNIFICATA */}
        <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-bold text-slate-600 pr-2">
          <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200">1. OdG</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200">2. Sala/Data/Ora</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200">3. Convocazioni</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200">
            Post-Assemblea (Verbale • Firma Presidente • Invio Condomini • Rate/MAV)
          </span>
        </div>
      </div>

      {/* VISTA UNIFICATA ASSEMBLEE (ORDINARIE POST-PASSO 57 + STRAORDINARIE) */}
      <div className="space-y-5">
        {/* KPI RAPIDI UNIFICATI */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => setFiltroStato('tutte')}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
              filtroStato === 'tutte'
                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                : 'bg-white border-slate-200 hover:border-slate-400'
            }`}
          >
            <span
              className={`text-[10px] font-extrabold uppercase block ${
                filtroStato === 'tutte' ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              Totale Assemblee
            </span>
            <div className="text-2xl font-black mt-0.5">{kpi.totali}</div>
            <span
              className={`text-[11px] block ${
                filtroStato === 'tutte' ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              {kpi.ordinarieCount} ordinarie (58–62) • {kpi.straordinarieCount} straord.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStato('in_organizzazione')}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
              filtroStato === 'in_organizzazione'
                ? 'bg-purple-50 border-2 border-purple-500 shadow-md'
                : 'bg-white border-slate-200 hover:border-purple-400'
            }`}
          >
            <span className="text-[10px] font-extrabold uppercase text-purple-700 block">
              In Attesa Assemblea
            </span>
            <div className="text-2xl font-black text-purple-800 mt-0.5">{kpi.inOrganizzazione}</div>
            <span className="text-[11px] text-purple-700 block">
              Prima della riunione (Ord. & Straord.)
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStato('post_assemblea')}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
              filtroStato === 'post_assemblea'
                ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md'
                : 'bg-white border-slate-200 hover:border-indigo-400'
            }`}
          >
            <span className="text-[10px] font-extrabold uppercase text-indigo-700 block">
              Completamento Procedura
            </span>
            <div className="text-2xl font-black text-indigo-800 mt-0.5">{kpi.convocate}</div>
            <span className="text-[11px] text-indigo-700 block">
              Assemblea fatta • Verbale & Passi 58–62
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStato('concluse')}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
              filtroStato === 'concluse'
                ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md'
                : 'bg-white border-slate-200 hover:border-emerald-400'
            }`}
          >
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
              Concluse (100% Passi)
            </span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{kpi.concluse}</div>
            <span className="text-[11px] text-emerald-600 block">Tutti i passaggi verificati</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStato('da_fatturare')}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
              filtroStato === 'da_fatturare'
                ? 'bg-rose-50 border-2 border-rose-500 shadow-md'
                : 'bg-white border-slate-200 hover:border-rose-400'
            }`}
          >
            <span className="text-[10px] font-extrabold uppercase text-rose-700 block">
              Compenso da Fatturare
            </span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">{kpi.daFatturare}</div>
            <span className="text-[11px] text-rose-600 block">Rif. Passo #6 Modello 5</span>
          </button>
        </div>

        {/* BARRA DI RICERCA E FILTRO CONDOMINIO */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca assemblea (ordinaria o straordinaria) per condominio, oggetto, OdG o Presidente..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 shrink-0 hidden sm:inline" />
              <select
                value={selectedCondoFilter}
                onChange={(e) =>
                  setSelectedCondoFilter(e.target.value === 'tutti' ? 'tutti' : Number(e.target.value))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              >
                <option value="tutti">Tutti i Condomini ({condomini.length})</option>
                {condomini.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codice_danea ? `[${c.codice_danea}] ` : ''}
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Organizza Assemblea Straordinaria</span>
          </button>
        </div>

          {/* LISTA ASSEMBLEE STRAORDINARIE */}
          {assembleeFiltrate.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-lg mx-auto">
                <h3 className="text-base font-extrabold text-slate-900">
                  {assemblee.length === 0
                    ? 'Nessuna Assemblea Straordinaria ancora inserita'
                    : 'Nessuna assemblea corrisponde ai filtri selezionati'}
                </h3>
                <p className="text-xs text-slate-500">
                  Crea una nuova Assemblea Straordinaria per seguire passo dopo passo la scaletta operativa:
                  <strong> 1. Creazione OdG</strong>, <strong>2. Prenotazione Sala</strong>,{' '}
                  <strong>3. Invio Convocazioni</strong>, <strong>4. Invio Verbale al Presidente per firma</strong> e{' '}
                  <strong>5. Invio Verbale ai Condomini</strong>.
                </p>
              </div>
              <div className="flex justify-center gap-2">
                {assemblee.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroStato('tutte');
                      setSelectedCondoFilter('tutti');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Mostra tutte ({assemblee.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crea Prima Assemblea Straordinaria</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {assembleeFiltrate.map((a) => {
                const isExpanded = expandedAssembleaId === a.id;
                const isConclusa = a.passi_completati >= a.totale_passi;
                const isOrdinaria = a.tipo === 'Ordinaria';
                const termini = getTerminiConvocazioneInfo(a);

                return (
                  <div
                    key={a.id}
                    className={`bg-white rounded-2xl border-2 transition overflow-hidden shadow-sm ${
                      isConclusa
                        ? 'border-emerald-300'
                        : isOrdinaria
                        ? 'border-purple-300 hover:border-purple-500'
                        : termini?.isScadutoInvio
                        ? 'border-rose-400'
                        : 'border-slate-200 hover:border-amber-400'
                    }`}
                  >
                    {/* INTESTAZIONE CARD ASSEMBLEA UNIFICATA (ORDINARIA POST-57 O STRAORDINARIA) */}
                    <div
                      className={`p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        isOrdinaria ? 'bg-purple-50/50' : 'bg-slate-50/70'
                      }`}
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.condominio_codice_danea && (
                            <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200">
                              {a.condominio_codice_danea}
                            </span>
                          )}
                          <span className="text-xs font-extrabold text-slate-800 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {a.condominio_nome}
                          </span>

                          {/* BADGE TIPO ASSEMBLEA: ORDINARIA (RENDICONTO PASSI 58-62) vs STRAORDINARIA */}
                          {isOrdinaria ? (
                            <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-700 text-white flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              <span>Assemblea Ordinaria • Bilancio (Passi 58–62 Mod. 5)</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              <span>Assemblea Straordinaria</span>
                            </span>
                          )}

                          <span
                            className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                              isConclusa
                                ? 'bg-emerald-600 text-white'
                                : isAssembleaGiaSvolta(a)
                                ? 'bg-indigo-600 text-white'
                                : a.stato === 'convocata'
                                ? 'bg-purple-600 text-white'
                                : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            {isConclusa
                              ? `✅ Assemblea Conclusa (${a.passi_completati}/${a.totale_passi})`
                              : isAssembleaGiaSvolta(a)
                              ? '✍️ Completamento Procedura (Assemblea Fatta)'
                              : a.stato === 'convocata'
                              ? '⏳ In Attesa Assemblea (Convocazioni inviate)'
                              : '⏳ In Attesa Assemblea (In Organizzazione)'}
                          </span>

                          {/* BADGE FATTURAZIONE COMPENSO STRAORDINARIO (SOLO STRAORDINARIE) */}
                          {!isOrdinaria && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateAssembleaMeta(a, { fatturata: !a.fatturata })
                              }
                              title="Clicca per commutare lo stato di fatturazione del compenso straordinario (Rif. Passo #6 Modello 5)"
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition cursor-pointer ${
                                a.fatturata
                                  ? 'bg-teal-50 text-teal-800 border-teal-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                              }`}
                            >
                              <Receipt className="w-3 h-3" />
                              <span>{a.fatturata ? 'Fatturata ✓' : 'Da Fatturare (Passo #6)'}</span>
                            </button>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                          {a.titolo}
                        </h3>

                        {/* CAMPI RAPIDI SEMPRE VISIBILI: DATA, ORA E POSTO / SALA */}
                        <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                          <label className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs">
                            <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="font-bold text-[11px] text-slate-600">Data:</span>
                            <input
                              type="date"
                              value={a.data_assemblea || ''}
                              onChange={(e) =>
                                handleUpdateAssembleaMeta(a, { data_assemblea: e.target.value })
                              }
                              className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                            />
                          </label>

                          <label className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="font-bold text-[11px] text-slate-600">Ora:</span>
                            <input
                              type="time"
                              value={a.ora_assemblea || '18:00'}
                              onChange={(e) =>
                                handleUpdateAssembleaMeta(a, { ora_assemblea: e.target.value })
                              }
                              className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                            />
                          </label>

                          <label className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs flex-1 min-w-[210px] max-w-md">
                            <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="font-bold text-[11px] text-slate-600 shrink-0">Posto / Sala:</span>
                            <input
                              type="text"
                              value={a.luogo_sala || ''}
                              onChange={(e) =>
                                handleUpdateAssembleaMeta(a, { luogo_sala: e.target.value })
                              }
                              placeholder="Inserisci sala o luogo riunione..."
                              className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none w-full"
                            />
                          </label>

                          {a.presidente && (
                            <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                              <FileSignature className="w-3.5 h-3.5 text-purple-600" />
                              <strong>Presidente:</strong> {a.presidente}
                            </span>
                          )}
                          {termini && !termini.convocazioniInviate && (
                            <span
                              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                                termini.isScadutoInvio
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : termini.isImminenteInvio
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-sky-50 text-sky-800 border border-sky-200'
                              }`}
                            >
                              Limite invio convocazioni (5gg liberi): {termini.dtLimiteInvioFormatted}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* BARRA PROGRESSO SCALETTA + PULSANTI */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 min-w-[175px]">
                          <div className="flex items-center justify-between text-xs font-bold mb-1">
                            <span className="text-slate-600">
                              {isOrdinaria ? 'Passi Unificati:' : 'Scaletta:'}
                            </span>
                            <span
                              className={`font-extrabold ${
                                isConclusa
                                  ? 'text-emerald-700'
                                  : isOrdinaria
                                  ? 'text-purple-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {a.passi_completati}/{a.totale_passi} passi ({a.percentuale}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isConclusa
                                  ? 'bg-emerald-500'
                                  : isOrdinaria
                                  ? 'bg-purple-600'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${a.percentuale}%` }}
                            />
                          </div>
                        </div>

                        {!isConclusa && (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAssembleaSvolta(a, !isAssembleaGiaSvolta(a))
                            }
                            className={`px-3 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                              isAssembleaGiaSvolta(a)
                                ? 'bg-white hover:bg-purple-50 text-purple-800 border border-purple-300'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                            title={
                              isAssembleaGiaSvolta(a)
                                ? 'Riporta nel riquadro "In Attesa Assemblea" (Prima della riunione)'
                                : 'Segna che l’assemblea si è svolta e sposta nel riquadro "Completamento Procedura"'
                            }
                          >
                            {isAssembleaGiaSvolta(a) ? (
                              <span>↩ Riporta in Attesa</span>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Assemblea Fatta → Completamento</span>
                              </>
                            )}
                          </button>
                        )}

                        {isOrdinaria && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenRendiconto(a.condominio_id)}
                              className="px-3 py-2 rounded-xl bg-white hover:bg-purple-50 text-purple-800 border border-purple-300 font-bold text-xs transition cursor-pointer"
                              title="Torna alla scheda Procedura Rendiconto (Passi 1–57)"
                            >
                              Scheda Rendiconto
                            </button>
                            {isConclusa && (
                              <button
                                type="button"
                                onClick={() => handleRinnova(a.condominio_id)}
                                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                                title="Tutti i passi 58–62 sono completati: chiudi e rinnova esercizio (+1 anno)"
                              >
                                Fatto & Rinnova (+1a)
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedAssembleaId(isExpanded ? null : a.id)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                            isExpanded
                              ? 'bg-slate-900 text-amber-400'
                              : isOrdinaria
                              ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-xs'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                          }`}
                        >
                          <span>
                            {isExpanded
                              ? 'Chiudi Scaletta'
                              : isOrdinaria
                              ? 'Gestisci Passi 58–62'
                              : 'Apri Scaletta (5 Passi)'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setAssembleaToDelete(a)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                          title="Elimina assemblea"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* STEPPER MINIATURA SEMPRE VISIBILE */}
                    <div
                      className={`px-4 py-2.5 bg-white border-b border-slate-100 grid grid-cols-1 ${
                        a.scaletta.length > 5
                          ? 'sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8'
                          : 'sm:grid-cols-5'
                      } gap-2`}
                    >
                      {a.scaletta.map((step) => (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => handleTogglePassoScaletta(a, step.id)}
                          className={`px-2.5 py-1.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                            step.fatto
                              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                              : 'bg-slate-50 hover:bg-amber-50/60 border-slate-200 text-slate-700'
                          }`}
                          title="Clicca per spuntare o annullare questo passo della scaletta"
                        >
                          {step.fatto ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-extrabold truncate">{step.titolo}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {step.fatto
                                ? `Fatto ${step.data_spunta ? `il ${step.data_spunta}` : ''}`
                                : 'Da fare'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* CORPO ESPANSO: DETTAGLIO SCALETTA 5 PASSI + DATI OPERATIVI */}
                    {isExpanded && (
                      <div className="p-4 sm:p-6 bg-white space-y-6">
                        {/* SEZIONE DATI RIUNIONE E ORDINE DEL GIORNO */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                          <div className="space-y-3 lg:col-span-1">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-amber-600" />
                              <span>Coordinate Riunione & Sala</span>
                            </h4>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                  Data 1ª Convocazione
                                </label>
                                <input
                                  type="date"
                                  value={a.data_prima_convocazione || ''}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, {
                                      data_prima_convocazione: e.target.value,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                  Ora 1ª Conv.
                                </label>
                                <input
                                  type="time"
                                  value={a.ora_prima_convocazione || '07:00'}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, {
                                      ora_prima_convocazione: e.target.value,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                  Data 2ª Conv. (Effettiva)
                                </label>
                                <input
                                  type="date"
                                  value={a.data_assemblea || ''}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, { data_assemblea: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-400 bg-white font-mono font-bold"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                  Ora 2ª Conv.
                                </label>
                                <input
                                  type="time"
                                  value={a.ora_assemblea || '18:00'}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, { ora_assemblea: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-400 bg-white font-mono font-bold"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Sala / Luogo Prenotato
                              </label>
                              <input
                                type="text"
                                value={a.luogo_sala || ''}
                                onChange={(e) =>
                                  handleUpdateAssembleaMeta(a, { luogo_sala: e.target.value })
                                }
                                placeholder="Es. Sala Riunioni Studio Serra..."
                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Presidente Assemblea
                                </label>
                                <input
                                  type="text"
                                  value={a.presidente || ''}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, { presidente: e.target.value })
                                  }
                                  placeholder="Nome Presidente..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Segretario
                                </label>
                                <input
                                  type="text"
                                  value={a.segretario || ''}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, { segretario: e.target.value })
                                  }
                                  placeholder="Nome Segretario..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                                />
                              </div>
                            </div>
                          </div>

                          {/* ORDINE DEL GIORNO EDITABILE */}
                          <div className="space-y-2 lg:col-span-2 flex flex-col justify-between">
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-amber-600" />
                                  <span>Punti all'Ordine del Giorno (OdG)</span>
                                </label>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[10px] text-slate-400 mr-1">Modelli OdG:</span>
                                  {TEMPLATE_ODG_STRAORDINARIA.map((tpl) => (
                                    <button
                                      key={tpl.label}
                                      type="button"
                                      onClick={() =>
                                        handleUpdateAssembleaMeta(a, {
                                          ordine_del_giorno: tpl.testo,
                                        })
                                      }
                                      className="text-[10px] px-2 py-0.5 rounded bg-white hover:bg-amber-50 text-slate-700 border border-slate-200 font-semibold transition cursor-pointer"
                                    >
                                      {tpl.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <textarea
                                rows={5}
                                value={a.ordine_del_giorno || ''}
                                onChange={(e) =>
                                  handleUpdateAssembleaMeta(a, {
                                    ordine_del_giorno: e.target.value,
                                  })
                                }
                                placeholder="Inserisci qui i punti all'Ordine del Giorno dell'assemblea straordinaria..."
                                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-amber-500 font-medium leading-relaxed"
                              />
                            </div>

                            {/* RIGA COMPENSO E FATTURAZIONE */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">
                                  Modalità convocazione:
                                </span>
                                <input
                                  type="text"
                                  value={a.modalita_invio || ''}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, {
                                      modalita_invio: e.target.value,
                                    })
                                  }
                                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white w-56"
                                  placeholder="PEC / Raccomandata / Mano"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">
                                  Compenso Straord. (€):
                                </span>
                                <input
                                  type="number"
                                  step="10"
                                  value={a.importo_compenso || 0}
                                  onChange={(e) =>
                                    handleUpdateAssembleaMeta(a, {
                                      importo_compenso: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  className="w-24 px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white font-mono font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateAssembleaMeta(a, { fatturata: !a.fatturata })
                                  }
                                  className={`px-3 py-1 rounded-lg text-xs font-extrabold border transition cursor-pointer ${
                                    a.fatturata
                                      ? 'bg-emerald-600 text-white border-emerald-700'
                                      : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                                  }`}
                                >
                                  {a.fatturata ? '✓ Fattura Emessa' : 'Segna Fattura Emessa'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ============================================================== */}
                        {/* SCALETTA ORGANIZZATIVA UNIFICATA (ORDINARIA POST-57 / STRAORD) */}
                        {/* ============================================================== */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                              <CheckSquare className={`w-4 h-4 ${isOrdinaria ? 'text-purple-600' : 'text-amber-600'}`} />
                              <span>
                                {isOrdinaria
                                  ? 'Scaletta Unificata Assemblea Ordinaria • Bilancio (Pre-Assemblea #51–57 + Post-Assemblea Passi #58–62)'
                                  : 'Scaletta Organizzazione Assemblea Straordinaria (5 Fasi Operative)'}
                              </span>
                            </h4>
                            <span className="text-xs text-slate-500">
                              {isOrdinaria
                                ? 'Sincronizzata in tempo reale con i Passi 58–62 della Procedura Rendiconto'
                                : 'Spunta ogni fase man mano che viene completata'}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                            {a.scaletta.map((step) => (
                              <div
                                key={step.id}
                                className={`p-4 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                                  step.fatto ? 'bg-emerald-50/40' : 'bg-white hover:bg-slate-50/60'
                                }`}
                              >
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePassoScaletta(a, step.id)}
                                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center border-2 transition shrink-0 cursor-pointer ${
                                      step.fatto
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                        : 'bg-white border-slate-300 hover:border-amber-500 text-transparent'
                                    }`}
                                    title={
                                      step.fatto ? 'Segna come da fare' : 'Segna come completato'
                                    }
                                  >
                                    <Check className="w-4 h-4 stroke-[3]" />
                                  </button>

                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {getStepIcon(step.id, step.fatto)}
                                      <span
                                        className={`text-sm font-extrabold ${
                                          step.fatto ? 'text-emerald-950' : 'text-slate-900'
                                        }`}
                                      >
                                        {step.titolo}
                                      </span>
                                      {step.fatto && (
                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                          ✓ Completato {step.data_spunta ? `il ${step.data_spunta}` : ''}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500">{step.descrizione}</p>

                                    {/* CAMPI DEDICATI PER IL PASSO 2: POSTO / SALA, DATA E ORA DELL'ASSEMBLEA */}
                                    {step.id === 'sala' && (
                                      <div className="mt-2 p-3 rounded-xl bg-amber-50/70 border border-amber-200/90 space-y-2.5">
                                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-amber-700" />
                                          <span>Coordinate Prenotazione: Posto / Sala, Data e Ora Assemblea</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                                          <div className="sm:col-span-6">
                                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                              Posto / Sala Riunioni Prenotata
                                            </label>
                                            <input
                                              type="text"
                                              value={a.luogo_sala || ''}
                                              onChange={(e) =>
                                                handleUpdateAssembleaMeta(a, {
                                                  luogo_sala: e.target.value,
                                                })
                                              }
                                              placeholder="Es. Sala Riunioni Studio Serra / Sala Parrocchiale..."
                                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white font-semibold focus:outline-none focus:border-amber-500"
                                            />
                                          </div>
                                          <div className="sm:col-span-3">
                                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                              Data Assemblea (2ª Conv.)
                                            </label>
                                            <input
                                              type="date"
                                              value={a.data_assemblea || ''}
                                              onChange={(e) =>
                                                handleUpdateAssembleaMeta(a, {
                                                  data_assemblea: e.target.value,
                                                })
                                              }
                                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-400 bg-white font-mono font-bold focus:outline-none focus:border-amber-600"
                                            />
                                          </div>
                                          <div className="sm:col-span-3">
                                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                              Ora Assemblea (2ª Conv.)
                                            </label>
                                            <input
                                              type="time"
                                              value={a.ora_assemblea || '18:00'}
                                              onChange={(e) =>
                                                handleUpdateAssembleaMeta(a, {
                                                  ora_assemblea: e.target.value,
                                                })
                                              }
                                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-400 bg-white font-mono font-bold focus:outline-none focus:border-amber-600"
                                            />
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-amber-200/60">
                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                              Data 1ª Convocazione (opzionale)
                                            </label>
                                            <input
                                              type="date"
                                              value={a.data_prima_convocazione || ''}
                                              onChange={(e) =>
                                                handleUpdateAssembleaMeta(a, {
                                                  data_prima_convocazione: e.target.value,
                                                })
                                              }
                                              className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-mono"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                              Ora 1ª Convocazione
                                            </label>
                                            <input
                                              type="time"
                                              value={a.ora_prima_convocazione || '07:00'}
                                              onChange={(e) =>
                                                handleUpdateAssembleaMeta(a, {
                                                  ora_prima_convocazione: e.target.value,
                                                })
                                              }
                                              className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-mono"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* CAMPI RAPIDI PER OGNI PASSO DELLA SCALETTA */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                      <input
                                        type="text"
                                        value={step.dettaglio || ''}
                                        onChange={(e) =>
                                          handleUpdatePassoField(
                                            a,
                                            step.id,
                                            'dettaglio',
                                            e.target.value
                                          )
                                        }
                                        placeholder={
                                          step.id === 'odg'
                                            ? 'Es. Punti OdG confermati con i consiglieri...'
                                            : step.id === 'sala'
                                            ? 'Es. Sala Studio Serra prenotata per le ore 18:00...'
                                            : step.id === 'convocazioni'
                                            ? 'Es. Inviate 18 PEC + 4 Raccomandate A/R il...'
                                            : step.id === 'firma_presidente'
                                            ? 'Es. Inviato PDF verbale al Presidente Sig. ... per firma'
                                            : 'Es. Verbale firmato inviato a tutti i condomini e caricato su Danea'
                                        }
                                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-none"
                                      />
                                      <input
                                        type="text"
                                        value={step.note || ''}
                                        onChange={(e) =>
                                          handleUpdatePassoField(a, step.id, 'note', e.target.value)
                                        }
                                        placeholder="Note operative o riferimenti protocollo..."
                                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePassoScaletta(a, step.id)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
                                      step.fatto
                                        ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700'
                                        : 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100'
                                    }`}
                                  >
                                    {step.fatto ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                        <span>Fatto</span>
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                                        <span>Segna Fatto</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* ======================================================================== */}
      {/* MODALE NUOVA ASSEMBLEA STRAORDINARIA                                     */}
      {/* ======================================================================== */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-amber-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                    Nuova Assemblea Straordinaria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Crea la scheda con la scaletta organizzativa in 5 passaggi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssemblea} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Condominio *
                  </label>
                  <select
                    required
                    value={newForm.condominio_id}
                    onChange={(e) =>
                      setNewForm({ ...newForm, condominio_id: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:border-amber-500"
                  >
                    {condomini.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codice_danea ? `[${c.codice_danea}] ` : ''}
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Oggetto / Titolo Assemblea Straordinaria *
                  </label>
                  <input
                    type="text"
                    required
                    value={newForm.titolo}
                    onChange={(e) => setNewForm({ ...newForm, titolo: e.target.value })}
                    placeholder="Es. Lavori straordinari facciata / Sostituzione caldaia"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* SEZIONE UNIFICATA: POSTO / SALA, DATA E ORA DELL'ASSEMBLEA */}
              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  <span>Posto / Sala, Data e Ora dell'Assemblea (Passo 2 della scaletta)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Posto / Sala Riunione Prenotata *
                    </label>
                    <input
                      type="text"
                      value={newForm.luogo_sala}
                      onChange={(e) => setNewForm({ ...newForm, luogo_sala: e.target.value })}
                      placeholder="Es. Sala Riunioni Studio Serra / Parrocchia..."
                      className="w-full px-3 py-2 border border-amber-300 bg-white rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-amber-950 mb-1">
                      Data Assemblea (2ª Conv.)
                    </label>
                    <input
                      type="date"
                      value={newForm.data_assemblea}
                      onChange={(e) => setNewForm({ ...newForm, data_assemblea: e.target.value })}
                      className="w-full px-2.5 py-2 border border-amber-400 rounded-xl text-xs font-mono font-bold bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-amber-950 mb-1">
                      Ora Assemblea (2ª Conv.)
                    </label>
                    <input
                      type="time"
                      value={newForm.ora_assemblea}
                      onChange={(e) => setNewForm({ ...newForm, ora_assemblea: e.target.value })}
                      className="w-full px-2.5 py-2 border border-amber-400 rounded-xl text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-amber-200/70">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Data 1ª Convocazione
                    </label>
                    <input
                      type="date"
                      value={newForm.data_prima_convocazione}
                      onChange={(e) =>
                        setNewForm({ ...newForm, data_prima_convocazione: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Ora 1ª Convocazione
                    </label>
                    <input
                      type="time"
                      value={newForm.ora_prima_convocazione}
                      onChange={(e) =>
                        setNewForm({ ...newForm, ora_prima_convocazione: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Modalità Invio Convocazioni
                    </label>
                    <input
                      type="text"
                      value={newForm.modalita_invio}
                      onChange={(e) => setNewForm({ ...newForm, modalita_invio: e.target.value })}
                      placeholder="PEC / Raccomandata A/R / Mano"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Ordine del Giorno (Passo 1 della scaletta)
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    {TEMPLATE_ODG_STRAORDINARIA.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, ordine_del_giorno: tpl.testo })}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={newForm.ordine_del_giorno}
                  onChange={(e) => setNewForm({ ...newForm, ordine_del_giorno: e.target.value })}
                  placeholder="Elenco dei punti all'Ordine del Giorno..."
                  className="w-full p-3 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-950 space-y-1">
                <div className="font-extrabold">
                  📋 Scaletta automatica associata all'assemblea straordinaria:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 pt-1 font-semibold">
                  <span className="bg-white px-2 py-1 rounded border border-amber-200">
                    1. Creazione OdG
                  </span>
                  <span className="bg-white px-2 py-1 rounded border border-amber-200">
                    2. Prenotazione sala
                  </span>
                  <span className="bg-white px-2 py-1 rounded border border-amber-200">
                    3. Invio convocazioni
                  </span>
                  <span className="bg-white px-2 py-1 rounded border border-amber-200">
                    4. Verbale al Presidente
                  </span>
                  <span className="bg-white px-2 py-1 rounded border border-amber-200">
                    5. Verbale ai condomini
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs sm:text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl shadow-sm cursor-pointer"
                >
                  Crea Assemblea Straordinaria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE CONFERMA ELIMINAZIONE ASSEMBLEA */}
      {assembleaToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200">
            <div className="flex items-center gap-3 text-rose-600 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Elimina Assemblea Straordinaria
                </h3>
                <p className="text-xs text-slate-500">{assembleaToDelete.condominio_nome}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-700">
              Confermi la rimozione dell'assemblea straordinaria{' '}
              <strong>"{assembleaToDelete.titolo}"</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssembleaToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteAssemblea}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
