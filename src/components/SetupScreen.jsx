import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy, Check, Table2, ArrowRight, ShieldCheck, X, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import scriptCode from '../../Files/google-apps-script.js?raw'
import { getPendingExpenses, clearPendingExpenses } from '../lib/sheetsApi'

export default function SetupScreen({ onSave, onClose, initialUrl }) {
  const [url, setUrl] = useState(initialUrl || '')
  const [copied, setCopied] = useState(false)
  const [pendingCount, setPendingCount] = useState(() => getPendingExpenses().length)

  const handleCopy = async () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    try {
      await navigator.clipboard.writeText(scriptCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleConnect = () => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    onSave(url)
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
            whileHover={{ scale: 1.08, rotate: 6 }}
            className="w-14 h-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-3 shadow-xs"
          >
            <Table2 className="w-7 h-7" />
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
              URL de Google Apps Script
            </label>
            <Input
              type="url"
              placeholder="https://script.google.com/macros/s/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 text-sm bg-slate-50 border-slate-200 rounded-xl focus:bg-white text-slate-900 transition-all"
            />
          </div>

          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={handleConnect}
              className="w-full h-12 rounded-xl text-base font-semibold shadow-md shadow-primary/25"
              disabled={!url.trim()}
            >
              Conectar Spreadsheet
              <ArrowRight className="w-4 h-4 ml-2" />
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
                    className="flex items-center"
                  >
                    <Copy className="h-4 w-4 mr-2 text-primary" />
                    Copiar código de Google Apps Script
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

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
    </div>
  )
}
