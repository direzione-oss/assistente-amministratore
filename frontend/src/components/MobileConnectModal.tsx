import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Wifi,
  Copy,
  Check,
  X,
  RefreshCw,
  QrCode,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onNotify: (msg: string) => void;
}

interface NetworkInfo {
  hostname: string;
  primary_ip: string;
  all_ips: string[];
  port: number;
  mobile_url: string;
  qr_matrix?: boolean[][];
}

// Porte già autorizzate nel Windows Firewall del PC (CantinaWeb 8502 / CANTINA VINO 8555)
const DEFAULT_MOBILE_PORT = 8502;
const FALLBACK_LAN_IP = '192.168.1.101';

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  apiBase,
  onNotify,
}) => {
  const initialIp =
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
      ? window.location.hostname
      : FALLBACK_LAN_IP;

  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIp, setSelectedIp] = useState<string>(initialIp);
  const [selectedPort, setSelectedPort] = useState<number>(DEFAULT_MOBILE_PORT);
  const [copied, setCopied] = useState<boolean>(false);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);

  const fetchNetworkInfo = async (customIp?: string, customPort?: number) => {
    setLoading(true);
    const targetPort = customPort || selectedPort || DEFAULT_MOBILE_PORT;
    try {
      const ipToUse = customIp || selectedIp;
      const customUrlParam = ipToUse
        ? `&custom_url=${encodeURIComponent(`http://${ipToUse}:${targetPort}`)}`
        : '';

      let res: Response | null = null;
      try {
        res = await fetch(
          `${apiBase}/api/system/network-info?port=${targetPort}${customUrlParam}`
        );
      } catch {
        res = null;
      }

      if ((!res || !res.ok) && apiBase === '') {
        try {
          res = await fetch(
            `http://${window.location.hostname}:8502/api/system/network-info?port=${targetPort}${customUrlParam}`
          );
        } catch {
          try {
            res = await fetch(
              `http://${window.location.hostname}:8018/api/system/network-info?port=${targetPort}${customUrlParam}`
            );
          } catch {
            res = null;
          }
        }
      }

      if (res && res.ok) {
        const data: NetworkInfo = await res.json();
        setNetInfo(data);
        setServerReachable(true);
        if (!customIp && data.primary_ip && !data.primary_ip.startsWith('127.')) {
          setSelectedIp(data.primary_ip);
        }
      } else {
        setServerReachable(false);
      }
    } catch (e) {
      console.warn('Utilizzo generazione QR locale:', e);
      setServerReachable(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNetworkInfo();
    }
  }, [isOpen]);

  const effectiveIp =
    selectedIp && !selectedIp.startsWith('127.') && selectedIp !== 'localhost'
      ? selectedIp
      : netInfo?.primary_ip && !netInfo.primary_ip.startsWith('127.')
      ? netInfo.primary_ip
      : FALLBACK_LAN_IP;

  const displayUrl = `http://${effectiveIp}:${selectedPort}`;

  // Genera SEMPRE la matrice QR Code direttamente nel browser (100% affidabile anche offline)
  const localQrMatrix = useMemo<boolean[][]>(() => {
    try {
      const qr = QRCode.create(displayUrl, {
        errorCorrectionLevel: 'M',
      });
      const size = qr.modules.size;
      const data = qr.modules.data;
      const border = 2;
      const totalSize = size + border * 2;
      const rows: boolean[][] = [];

      for (let y = 0; y < totalSize; y++) {
        const row: boolean[] = [];
        for (let x = 0; x < totalSize; x++) {
          const mx = x - border;
          const my = y - border;
          if (mx >= 0 && mx < size && my >= 0 && my < size) {
            row.push(Boolean(data[my * size + mx]));
          } else {
            row.push(false);
          }
        }
        rows.push(row);
      }
      return rows;
    } catch (err) {
      console.error('Errore generazione QR locale:', err);
      return netInfo?.qr_matrix || [];
    }
  }, [displayUrl, netInfo]);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(displayUrl);
    setCopied(true);
    onNotify('Indirizzo Wi-Fi copiato negli appunti!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSelectIp = (ip: string) => {
    setSelectedIp(ip);
    fetchNetworkInfo(ip, selectedPort);
  };

  const handleSelectPort = (port: number) => {
    setSelectedPort(port);
    fetchNetworkInfo(effectiveIp, port);
  };

  const matrix = localQrMatrix.length > 0 ? localQrMatrix : netInfo?.qr_matrix || [];
  const matrixSize = matrix.length;
  const availableIps = Array.from(
    new Set([
      ...(netInfo?.all_ips || []).filter((ip) => !ip.startsWith('127.')),
      FALLBACK_LAN_IP,
    ])
  );

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Intestazione Modal */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> Rete Wi-Fi Locale
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Porta {selectedPort} Aperta
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white mt-0.5">
                Usa da Cellulare (Senza Cloud)
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* QR Code Area */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="p-3.5 bg-white rounded-2xl border-2 border-amber-400 shadow-md relative">
              {matrixSize > 0 ? (
                <svg
                  viewBox={`0 0 ${matrixSize} ${matrixSize}`}
                  className="w-52 h-52 block"
                  shapeRendering="crispEdges"
                >
                  <rect width={matrixSize} height={matrixSize} fill="#ffffff" />
                  {matrix.map((row, y) =>
                    row.map((cell, x) =>
                      cell ? (
                        <rect
                          key={`${x}-${y}`}
                          x={x}
                          y={y}
                          width={1}
                          height={1}
                          fill="#0f172a"
                        />
                      ) : null
                    )
                  )}
                </svg>
              ) : (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2 text-slate-500 p-4">
                  <QrCode className="w-10 h-10 text-amber-500" />
                  <span className="text-xs font-semibold">
                    Apri sul browser del telefono l'indirizzo qui sotto
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Inquadra con la fotocamera dello smartphone
              </p>
              <p className="text-xs text-slate-500">
                Collegato direttamente al PC{' '}
                <strong className="text-slate-700">
                  ({netInfo?.hostname || 'PC-Studio-Serra'})
                </strong>
                {serverReachable && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-700 font-bold">
                    • Server Attivo ✓
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Link Diretto + Pulsante Copia */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Indirizzo diretto per lo Smartphone:</span>
              <button
                type="button"
                onClick={() => fetchNetworkInfo(effectiveIp, selectedPort)}
                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Aggiorna
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm font-extrabold text-indigo-950 select-all truncate">
                {displayUrl}
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-xs cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiato' : 'Copia'}</span>
              </button>
            </div>

            {/* Selettore IP */}
            <div className="pt-0.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 font-medium">IP PC:</span>
                {availableIps.map((ip) => (
                  <button
                    key={ip}
                    type="button"
                    onClick={() => handleSelectIp(ip)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition cursor-pointer ${
                      effectiveIp === ip
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {ip}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500 font-medium">Porta:</span>
                {[8502, 8555].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPort(p)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition cursor-pointer ${
                      selectedPort === p
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                    title={`Porta ${p} autorizzata nel Firewall di Windows`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Istruzioni rapide */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 space-y-1.5 text-xs text-emerald-950">
            <div className="font-extrabold flex items-center gap-1.5 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Immissione Dati da Cellulare Attiva (Sincronizzata col PC):</span>
            </div>
            <ul className="space-y-1 text-[11px] text-emerald-900/90 pl-5 list-disc">
              <li>
                <strong>Stesso Wi-Fi:</strong> verifica che lo smartphone sia collegato alla rete Wi-Fi <strong>TIM-14077330</strong> (la stessa del PC).
              </li>
              <li>
                <strong>Inserimento dati in tempo reale:</strong> ogni lettura contatore, nota, operatore o spunta inserita dal telefono viene salvata subito sul PC.
              </li>
              <li>
                <strong>Icona su Home:</strong> dal browser del telefono premi <em>"Aggiungi a schermata Home"</em> per aprirla come un'app nativa.
              </li>
            </ul>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-sm transition cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

