import React, { useState } from 'react';
import {
  Send,
  X,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  FileText
} from 'lucide-react';
import { getStoredToken } from '../auth';

interface PromemoriaStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onNotify: (msg: string) => void;
}

export const PromemoriaStaffModal: React.FC<PromemoriaStaffModalProps> = ({
  isOpen,
  onClose,
  apiBase,
  onNotify,
}) => {
  const [oggetto, setOggetto] = useState('📌 Promemoria Staff da CRM Studio Serra');
  const [testo, setTesto] = useState('');
  const [priorita, setPriorita] = useState<'Normale' | 'Alta' | 'Urgente'>('Normale');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testo.trim()) {
      onNotify('⚠️ Inserisci il testo del promemoria prima di inviare.');
      return;
    }

    setSending(true);
    try {
      const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      const token = getStoredToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const prefissoPriorita = priorita === 'Urgente' ? '🚨 [URGENTE] ' : (priorita === 'Alta' ? '🟠 [ALTA PRIORITÀ] ' : '');
      const oggettoFinale = `${prefissoPriorita}${oggetto.trim()}`;

      const res = await fetch(`${base}/serra-mobile/promemoria`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          oggetto: oggettoFinale,
          testo: testo.trim()
        })
      });

      if (!res.ok) {
        throw new Error(`Errore server HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        onNotify('✅ Promemoria inviato con successo via email allo staff operativo!');
        setTimeout(() => {
          setSuccess(false);
          setTesto('');
          onClose();
        }, 1500);
      } else {
        throw new Error('Errore durante l\'invio SMTP');
      }
    } catch (err: any) {
      console.error('Errore invio promemoria:', err);
      onNotify(`⚠️ Errore invio promemoria: ${err.message || 'Controlla la configurazione SMTP'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Invia Promemoria allo Staff</h2>
            <p className="text-xs text-slate-400">
              Invia un memo email formattato a <span className="font-mono text-indigo-300 font-bold">operativo@serrastudio.it</span>
            </p>
          </div>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">Email Inviata con Successo!</h3>
            <p className="text-sm text-slate-300">Il promemoria è stato recapitato alla casella email dello staff operativo.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Destinatario Staff
              </label>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-sm font-mono">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>operativo@serrastudio.it</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Priorità
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Normale', 'Alta', 'Urgente'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriorita(p)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                      priorita === p
                        ? p === 'Urgente'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500'
                          : p === 'Alta'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {p === 'Urgente' ? '🚨 Urgente' : p === 'Alta' ? '🟠 Alta' : '🟢 Normale'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Oggetto Email
              </label>
              <input
                type="text"
                value={oggetto}
                onChange={(e) => setOggetto(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition"
                placeholder="Oggetto del promemoria"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Messaggio / Note Operative
              </label>
              <textarea
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                required
                rows={4}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition resize-none"
                placeholder="Scrivi qui le istruzioni, compiti o informazioni da ricordare allo staff..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-sm font-semibold transition"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={sending || !testo.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 cursor-pointer"
              >
                {sending ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Invio in corso...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Invia allo Staff</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
