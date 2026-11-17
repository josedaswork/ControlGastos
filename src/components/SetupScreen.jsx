import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Copy,
  Check,
  Table2,
  ArrowRight,
  ShieldCheck,
  X,
  Trash2,
  Globe,
  Loader2,
  AlertCircle,
  Bug,
  Eye,
  FileText,
  ChevronRight,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useTheme } from '@/lib/theme'
import scriptCode from '../../Files/google-apps-script.js?raw'
import {
  getPendingExpenses,
  clearPendingExpenses,
  setLocaleSpain,
  validateScriptUrl,
  testConnection,
  normalizeScriptUrl,
} from '../lib/sheetsApi'
import {
  isDebugEnabled,
  setDebugEnabled,
  subscribeLogs,
  formatLogsAsText,
  clearLogs,
} from '../lib/debugLogger'
import DebugLogViewer from './DebugLogViewer'
import { getCurrentOtaInfo, checkForOtaUpdate } from '../lib/otaUpdater'
import { toast } from 'sonner'

export default function SetupScreen({ onSave, onClose, initialUrl }) {
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  const [url, setUrl] = useState(initialUrl || '')
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [settingLocale, setSettingLocale] = useState(false)
  const [pendingCount, setPendingCount] = useState(() => getPendingExpenses().length)
  const [debugMode, setDebugMode] = useState(() => isDebugEnabled())
  const [logs, setLogs] = useState([])
  const [showLogViewer, setShowLogViewer] = useState(false)
  const [otaInfo, setOtaInfo] = useState({
    version: '1.0.0',
    nativeVersion: '1.0.0',
    bundleId: 'builtin',
    isOtaActive: false,
    isNative: false,
  })
  const [checkingOta, setCheckingOta] = useState(false)
  const [otaCheckMessage, setOtaCheckMessage] = useState('')

  useEffect(() => {
    let active = true
    getCurrentOtaInfo().then((info) => {
      if (active && info) setOtaInfo(info)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const unsub = subscribeLogs((currentLogs) => {
      setLogs(currentLogs)
    })
    return () => unsub()
  }, [])

  const handleCheckOtaUpdates = async () => {
    if (checkingOta) return
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setCheckingOta(true)
    setOtaCheckMessage('')
    try {
      const result = await checkForOtaUpdate({ manual: true })
      const refreshed = await getCurrentOtaInfo()
      if (refreshed) setOtaInfo(refreshed)

      if (result?.status === 'up_to_date') {
        setOtaCheckMessage(`Actualizada: tienes la última versión (v${result.currentVersion}).`)
      } else if (result?.status === 'available_web_only') {
        setOtaCheckMessage(
          `Disponible v${result.remoteVersion} en GitHub Releases (OTA automático solo en Android).`
        )
      } else if (result?.status === 'offline') {
        setOtaCheckMessage('Sin conexión a internet.')
      } else if (result?.status === 'error') {
        setOtaCheckMessage(result.error || 'No se pudo comprobar actualizaciones.')
      }
    } finally {
      setCheckingOta(false)
    }
  }

  const handleToggleDebug = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const nextState = !debugMode
    setDebugMode(nextState)
    setDebugEnabled(nextState)
    if (nextState) {
      toast.success('Modo DEBUG activado: Se registrarán las tareas y peticiones')
    } else {
      toast.info('Modo DEBUG desactivado: Se detuvo el registro de tareas')
    }
  }

  const handleCopyLogsDirect = async () => {
    try {
      const text = formatLogsAsText()
      await navigator.clipboard.writeText(text)
      toast.success('Registros copiados al portapapeles')
    } catch (_) {
      toast.error('No se pudieron copiar los registros')
    }
  }

  const handleApplyLocaleSpain = async () => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    setSettingLocale(true)
    try {
      await setLocaleSpain()
      toast.success('Configuración regional de España aplicada en tu hoja')
    } catch (err) {
      toast.error('Comprueba la conexión con Google Sheets: ' + err.message)
    } finally {
      setSettingLocale(false)
    }
  }

  const handleCopy = async () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    let success = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(scriptCode)
        success = true
      }
    } catch (_) {}

    if (!success) {
      try {
        const textArea = document.createElement('textarea')
        textArea.value = scriptCode
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        textArea.setAttribute('readonly', '')
        document.body.appendChild(textArea)
        textArea.select()
        success = document.execCommand('copy')
        document.body.removeChild(textArea)
      } catch (_) {}
    }

    if (success) {
      setCopied(true)
      toast.success('¡Código de Apps Script copiado al portapapeles!')
      setTimeout(() => setCopied(false), 2500)
    } else {
      toast.error('No se pudo copiar automáticamente. Comprueba los permisos de tu navegador.')
    }
  }

  const handleConnect = async () => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    const validation = validateScriptUrl(url)
    if (!validation.valid) {
      toast.error(validation.error, { duration: 6000 })
      return
    }

    const cleanUrl = validation.url
    setUrl(cleanUrl)
    setTesting(true)
    const toastId = toast.loading('Verificando conexión con Google Sheets...')

    try {
      await testConnection(cleanUrl)
      toast.success('¡Conectado exitosamente con Google Sheets!', { id: toastId })
      onSave(cleanUrl)
    } catch (err) {
      toast.error(err.message, { id: toastId, duration: 6500 })
    } finally {
      setTesting(false)
    }
  }

  const handleClearPending = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    clearPendingExpenses()
    setPendingCount(0)
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors"
      style={{
        paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 16px), 24px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-xl space-y-5 relative transition-colors"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center space-y-1.5 pt-2">
          <motion.div
            whileHover={{ scale: 1.08, rotate: 4 }}
            className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-3 shadow-md shadow-blue-500/20 border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950"
          >
            <img
              src="/icon-192.png"
              alt="Control Gastos Logo"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </motion.div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Control Gastos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Conecta tu Google Spreadsheet para sincronizar tus finanzas personales.
          </p>
        </div>

        {/* Apariencia / Tema */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Apariencia
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {themePreference === 'dark' ? 'Modo oscuro' : themePreference === 'light' ? 'Modo claro' : 'Automático'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
            {[
              { id: 'system', label: 'Sistema', Icon: Monitor },
              { id: 'light', label: 'Claro', Icon: Sun },
              { id: 'dark', label: 'Oscuro', Icon: Moon },
            ].map(({ id, label, Icon }) => {
              const active = themePreference === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setThemePreference(id)
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active && id === 'dark' ? 'text-amber-400' : active && id === 'light' ? 'text-amber-500' : ''}`} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Input Form */}
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              URL de Google Apps Script (Web App)
            </label>
            <Input
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 rounded-xl focus:bg-white dark:focus:bg-slate-950 text-slate-900 dark:text-slate-100 transition-all font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-tight">
              ⚠️ Debe terminar en <span className="font-semibold text-slate-700 dark:text-slate-200">/exec</span> (no /edit ni el enlace del documento).
            </p>
          </div>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={handleConnect}
              className="w-full h-12 rounded-xl text-base font-semibold shadow-md shadow-primary/25"
              disabled={!url.trim() || testing}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando conexión...
                </>
              ) : (
                <>
                  Conectar Spreadsheet
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </motion.div>
        </div>

        {/* Instructions */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Pasos para conectar:
            </span>
          </div>

          <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-2 pl-4 list-decimal">
            <li>Abre tu hoja de cálculo en <strong className="text-slate-800 dark:text-slate-200">Google Sheets</strong></li>
            <li>Ve al menú <strong className="text-slate-800 dark:text-slate-200">Extensiones → Apps Script</strong></li>
            <li>Pega el código del script (cópialo abajo)</li>
            <li>Haz clic en <strong className="text-slate-800 dark:text-slate-200">Implementar → Nueva implementación</strong></li>
            <li>Tipo: <strong className="text-slate-800 dark:text-slate-200">Aplicación web</strong>, Acceso: <strong className="text-slate-800 dark:text-slate-200">Cualquier persona</strong></li>
            <li>Copia la URL generada y pégala aquí arriba</li>
          </ol>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              className="w-full mt-4 h-11 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={handleCopy}
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.span
                    key="copied"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center"
                  >
                    <Check className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400" />
                    ¡Código copiado al portapapeles!
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center w-full justify-between"
                  >
                    <span className="flex items-center">
                      <Copy className="h-4 w-4 mr-2 text-primary" />
                      Copiar código de Google Apps Script
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 px-2 py-0.5 rounded-full ml-2">
                      v4.1 Sync Segura
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Sintaxis de fórmulas (; y ,)</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Google Sheets muestra en la barra <code className="font-mono font-bold text-slate-700 dark:text-slate-200">fx</code> el separador <code className="font-bold text-slate-700 dark:text-slate-200">;</code> y los decimales con coma <code className="font-bold text-slate-700 dark:text-slate-200">,</code> cuando la <strong className="text-slate-700 dark:text-slate-200">Configuración regional</strong> de la hoja está en <strong className="text-slate-700 dark:text-slate-200">España</strong>.
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              En tu hoja: <strong>Archivo → Configuración → Configuración regional → España</strong>.
            </p>
            {url && (
              <button
                type="button"
                disabled={settingLocale}
                onClick={handleApplyLocaleSpain}
                className="w-full py-2 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold text-xs border border-blue-200/80 dark:border-blue-800/70 shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Globe className={`w-3.5 h-3.5 ${settingLocale ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-blue-600 dark:text-blue-400'}`} />
                {settingLocale ? 'Configurando región...' : 'Ajustar hoja a región España'}
              </button>
            )}
          </div>

          {/* Modo Depuración (DEBUG) */}
          <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    debugMode ? 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Bug className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                    <span>Modo Depuración (DEBUG)</span>
                    {debugMode && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/70">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {debugMode
                      ? 'Registrando tareas, llamadas y errores'
                      : 'Desactivado (sin consumo de memoria)'}
                  </p>
                </div>
              </div>

              {/* Modern Switch Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={debugMode}
                onClick={handleToggleDebug}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  debugMode ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    debugMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Solo si está activado se guarda un registro en vivo de cada acción (meses consultados, importes guardados, errores del servidor y tiempos de respuesta).
            </p>

            {debugMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <span>
                    Tareas registradas: <strong className="text-slate-900 dark:text-slate-100">{logs.length}</strong>
                  </span>
                  {logs.filter((l) => l.status === 'error').length > 0 ? (
                    <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {logs.filter((l) => l.status === 'error').length} fallo(s) detectado(s)
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Sin errores
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowLogViewer(true)}
                    className="py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver registros ({logs.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLogsDirect}
                    disabled={logs.length === 0}
                    className="py-2 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-200/80 dark:border-slate-700 shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Copiar registros
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Actualizaciones OTA */}
          <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                    Actualizaciones (OTA)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Versión actual:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      v{otaInfo.version}
                    </strong>
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                  otaInfo.isOtaActive
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/70'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-700'
                }`}
              >
                {otaInfo.isOtaActive ? 'Bundle OTA' : 'Integrada'}
              </span>
            </div>

            {otaCheckMessage && (
              <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-800 leading-snug">
                {otaCheckMessage}
              </p>
            )}

            <button
              type="button"
              disabled={checkingOta}
              onClick={handleCheckOtaUpdates}
              className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xs border border-slate-200/90 dark:border-slate-700 shadow-2xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-primary ${checkingOta ? 'animate-spin' : ''}`}
              />
              {checkingOta ? 'Buscando actualizaciones…' : 'Buscar actualizaciones'}
            </button>
          </div>

          {pendingCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/60"
            >
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-bold">{pendingCount}</span> gasto(s) pendiente(s) en cola local
              </div>
              <button
                type="button"
                onClick={handleClearPending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/70 shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar cola
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {showLogViewer && (
        <DebugLogViewer onClose={() => setShowLogViewer(false)} />
      )}
    </div>
  )
}
