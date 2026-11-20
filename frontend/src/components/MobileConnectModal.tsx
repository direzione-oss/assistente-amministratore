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
  Send,
  ExternalLink,
  Bot,
  Zap,
  Camera,
  Wrench,
  Flame,
  Users
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

const DEFAULT_MOBILE_PORT = 8502;
const FALLBACK_LAN_IP = '192.168.1.101';
const TELEGRAM_BOT_URL = 'https://t.me/AssistenteStudioSerra_bot';
const TELEGRAM_BOT_USERNAME = '@AssistenteStudioSerra_bot';

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  apiBase,
  onNotify,
}) => {
  const [modalTab, setModalTab] = useState<'telegram' | 'wifi'>('telegram');
  const initialIp =
    typeof window !== 'undefined' &&
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
  const [botStatus, setBotStatus] = useState<{
    attivo?: boolean;
    bot_in_esecuzione?: boolean;
    gemini_abilitato?: boolean;
    totale_sopralluoghi?: number;
  } | null>(null);

  const fetchBotStatus = async () => {
    try {
      const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      const res = await fetch(`${base}/api/serra-mobile/status`);
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
      }
    } catch {
      // ignore
    }
  };

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
      fetchBotStatus();
    }
  }, [isOpen]);

  const effectiveIp =
    selectedIp && !selectedIp.startsWith('127.') && selectedIp !== 'localhost'
      ? selectedIp
      : netInfo?.primary_ip && !netInfo.primary_ip.startsWith('127.')
      ? netInfo.primary_ip
      : FALLBACK_LAN_IP;

  const displayUrl = `http://${effectiveIp}:${selectedPort}`;

  // QR per WiFi LAN
  const localQrMatrix = useMemo<boolean[][]>(() => {
    try {
      const qr = QRCode.create(displayUrl, { errorCorrectionLevel: 'M' });
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
    } catch {
      return netInfo?.qr_matrix || [];
    }
  }, [displayUrl, netInfo]);

  // QR per Bot Telegram
  const telegramQrMatrix = useMemo<boolean[][]>(() => {
    try {
      const qr = QRCode.create(TELEGRAM_BOT_URL, { errorCorrectionLevel: 'M' });
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
    } catch {
      return [];
    }
  }, []);

  const handleCopyUrl = async () => {
    const textToCopy = modalTab === 'telegram' ? TELEGRAM_BOT_URL : displayUrl;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      onNotify('Indirizzo copiato negli appunti!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify('Seleziona il link e premi Ctrl+C');
    }
  };

  const handleSelectIp = (ip: string) => {
    setSelectedIp(ip);
    fetchNetworkInfo(ip, selectedPort);
  };

  const handleSelectPort = (port: number) => {
    setSelectedPort(port);
    fetchNetworkInfo(selectedIp, port);
  };

  if (!isOpen) return null;

  const currentMatrix = modalTab === 'telegram' ? telegramQrMatrix : localQrMatrix;
  const matrixSize = currentMatrix.length;
  const availableIps =
    netInfo?.all_ips && netInfo.all_ips.length > 0
      ? netInfo.all_ips.filter((ip) => !ip.startsWith('127.'))
      : [effectiveIp];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-400 text-slate-950 font-black shadow-md">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-300">
                Studio Serra Mobile
              </span>
              <h3 className="font-extrabold text-base text-white mt-0.5">
                Connessione Cellulare & Telegram
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="p-4 pb-0 bg-slate-100 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setModalTab('telegram')}
            className={`flex-1 py-2.5 px-3 rounded-t-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              modalTab === 'telegram'
                ? 'bg-white text-indigo-950 shadow-sm border-t-2 border-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-600" />
            <span>Bot Telegram CRM</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
              Consigliato
            </span>
          </button>

          <button
            onClick={() => setModalTab('wifi')}
            className={`flex-1 py-2.5 px-3 rounded-t-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              modalTab === 'wifi'
                ? 'bg-white text-indigo-950 shadow-sm border-t-2 border-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wifi className="w-4 h-4 text-slate-600" />
            <span>Web App Wi-Fi</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {modalTab === 'telegram' ? (
            /* TAB TELEGRAM BOT */
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center space-y-2.5">
                <div className="p-3 bg-white rounded-2xl border-2 border-indigo-500 shadow-md">
                  {matrixSize > 0 && (
                    <svg
                      viewBox={`0 0 ${matrixSize} ${matrixSize}`}
                      className="w-48 h-48 block"
                      shapeRendering="crispEdges"
                    >
                      <rect width={matrixSize} height={matrixSize} fill="#ffffff" />
                      {currentMatrix.map((row, y) =>
                        row.map((cell, x) =>
                          cell ? (
                            <rect
                              key={`${x}-${y}`}
                              x={x}
                              y={y}
                              width={1}
                              height={1}
                              fill="#1e1b4b"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    Inquadra con la fotocamera per aprire Telegram
                  </p>
                  <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Bot Ufficiale: <strong className="text-indigo-900">{TELEGRAM_BOT_USERNAME}</strong></span>
                  </p>
                </div>
              </div>

              {/* Azioni Rapide Bot */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wide">
                    Link Diretto:
                  </span>
                  <a
                    href={TELEGRAM_BOT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                  >
                    <span>Apri subito</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-indigo-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-indigo-950 truncate select-all">
                    {TELEGRAM_BOT_URL}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-900 hover:bg-indigo-800 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiato' : 'Copia'}</span>
                  </button>
                </div>
              </div>

              {/* Funzionalità Integrate */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-semibold text-slate-700">Verbali con Foto & IA</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-semibold text-slate-700">Ticket & Guasti CRM</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5 text-rose-600" />
                  <span className="font-semibold text-slate-700">Scadenze & CPI</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span className="font-semibold text-slate-700">Rubrica Fornitori</span>
                </div>
              </div>
            </div>
          ) : (
            /* TAB WI-FI LAN */
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center space-y-2.5">
                <div className="p-3.5 bg-white rounded-2xl border-2 border-amber-400 shadow-md">
                  {matrixSize > 0 && (
                    <svg
                      viewBox={`0 0 ${matrixSize} ${matrixSize}`}
                      className="w-48 h-48 block"
                      shapeRendering="crispEdges"
                    >
                      <rect width={matrixSize} height={matrixSize} fill="#ffffff" />
                      {currentMatrix.map((row, y) =>
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
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                    Inquadra collegato al Wi-Fi dello Studio
                  </p>
                  <p className="text-xs text-slate-500">
                    Accesso diretto browser al PC ({netInfo?.hostname || 'PC Studio Serra'})
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Indirizzo diretto:</span>
                  <button
                    type="button"
                    onClick={() => fetchNetworkInfo(effectiveIp, selectedPort)}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Aggiorna
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs font-extrabold text-indigo-950 truncate select-all">
                    {displayUrl}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
