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
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
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
import { toast } from 'sonner'

export default function SetupScreen({ onSave, onClose, initialUrl }) {
  const [url, setUrl] = useState(initialUrl || '')
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [settingLocale, setSettingLocale] = useState(false)
  const [pendingCount, setPendingCount] = useState(() => getPendingExpenses().length)
  const [debugMode, setDebugMode] = useState(() => isDebugEnabled())
  const [logs, setLogs] = useState([])
  const [showLogViewer, setShowLogViewer] = useState(false)

  useEffect(() => {
    const unsub = subscribeLogs((currentLogs) => {
      setLogs(currentLogs)
    })
    return () => unsub()
  }, [])

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
      className="flex min-h-screen items-center justify-center p-4 bg-slate-50"
      style={{
        paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 16px), 24px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xl space-y-5 relative"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center space-y-1.5 pt-2">
          <motion.div
            whileHover={{ scale: 1.08, rotate: 4 }}
            className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-3 shadow-md shadow-blue-500/20 border border-slate-200/80 bg-white"
          >
            <img
              src="/icon-192.png"
              alt="Control Gastos Logo"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </motion.div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Control Gastos
          </h1>
          <p className="text-sm text-slate-500">
            Conecta tu Google Spreadsheet para sincronizar tus finanzas personales.
          </p>
        </div>

        {/* Input Form */}
        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              URL de Google Apps Script (Web App)
            </label>
            <Input
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 text-sm bg-slate-50 border-slate-200 rounded-xl focus:bg-white text-slate-900 transition-all font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-tight">
              ⚠️ Debe terminar en <span className="font-semibold text-slate-700">/exec</span> (no /edit ni el enlace del documento).
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
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Pasos para conectar:
            </span>
          </div>

          <ol className="text-xs text-slate-600 space-y-2 pl-4 list-decimal">
            <li>Abre tu hoja de cálculo en <strong>Google Sheets</strong></li>
            <li>Ve al menú <strong>Extensiones → Apps Script</strong></li>
            <li>Pega el código del script (cópialo abajo)</li>
            <li>Haz clic en <strong>Implementar → Nueva implementación</strong></li>
            <li>Tipo: <strong>Aplicación web</strong>, Acceso: <strong>Cualquier persona</strong></li>
            <li>Copia la URL generada y pégala aquí arriba</li>
          </ol>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              className="w-full mt-4 h-11 rounded-xl text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
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
                    <Check className="h-4 w-4 mr-2 text-emerald-600" />
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
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full ml-2">
                      v3.5 Rápido
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Sintaxis de fórmulas (; y ,)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Google Sheets muestra en la barra <code className="font-mono font-bold text-slate-700">fx</code> el separador <code className="font-bold text-slate-700">;</code> y los decimales con coma <code className="font-bold text-slate-700">,</code> cuando la <strong>Configuración regional</strong> de la hoja está en <strong>España</strong>.
            </p>
            <p className="text-[11px] text-slate-600 font-medium">
              En tu hoja: <strong>Archivo → Configuración → Configuración regional → España</strong>.
            </p>
            {url && (
              <button
                type="button"
                disabled={settingLocale}
                onClick={handleApplyLocaleSpain}
                className="w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200/80 shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Globe className={`w-3.5 h-3.5 ${settingLocale ? 'animate-spin text-blue-600' : 'text-blue-600'}`} />
                {settingLocale ? 'Configurando región...' : 'Ajustar hoja a región España'}
              </button>
            )}
          </div>

          {/* Modo Depuración (DEBUG) */}
          <div className="mt-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    debugMode ? 'bg-violet-100 text-violet-700' : 'bg-slate-200/80 text-slate-500'
                  }`}
                >
                  <Bug className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span>Modo Depuración (DEBUG)</span>
                    {debugMode && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
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
                  debugMode ? 'bg-violet-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    debugMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Solo si está activado se guarda un registro en vivo de cada acción (meses consultados, importes guardados, errores del servidor y tiempos de respuesta).
            </p>

            {debugMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-2 border-t border-slate-200/70 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/60">
                  <span>
                    Tareas registradas: <strong className="text-slate-900">{logs.length}</strong>
                  </span>
                  {logs.filter((l) => l.status === 'error').length > 0 ? (
                    <span className="font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {logs.filter((l) => l.status === 'error').length} fallo(s) detectado(s)
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
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
                    className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200/80 shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Copiar registros
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {pendingCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between bg-amber-50/70 p-3 rounded-xl border border-amber-200/60"
            >
              <div className="text-xs text-amber-800">
                <span className="font-bold">{pendingCount}</span> gasto(s) pendiente(s) en cola local
              </div>
              <button
                type="button"
                onClick={handleClearPending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white px-2.5 py-1.5 rounded-lg border border-rose-200 shadow-xs transition-colors"
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
