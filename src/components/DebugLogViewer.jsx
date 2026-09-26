import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  X,
  Bug,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getLogs,
  clearLogs,
  subscribeLogs,
  formatLogsAsText,
  logTask,
} from '@/lib/debugLogger'
import { callApi, getScriptUrl } from '@/lib/sheetsApi'
import { toast } from 'sonner'

export default function DebugLogViewer({ onClose }) {
  const [logs, setLogs] = useState(() => getLogs())
  const [filter, setFilter] = useState('all') // 'all' | 'errors' | 'success'
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [testingPing, setTestingPing] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeLogs((updatedLogs) => {
      setLogs(updatedLogs)
    })
    return () => unsubscribe()
  }, [])

  const errorCount = logs.filter((l) => l.status === 'error').length
  const successCount = logs.filter((l) => l.status === 'success').length

  const filteredLogs = logs.filter((log) => {
    if (filter === 'errors' && log.status !== 'error') return false
    if (filter === 'success' && log.status !== 'success') return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const inAction = (log.action || '').toLowerCase().includes(q)
      const inTitle = (log.title || '').toLowerCase().includes(q)
      const inError = (log.error || '').toLowerCase().includes(q)
      const inParams = log.params ? JSON.stringify(log.params).toLowerCase().includes(q) : false
      return inAction || inTitle || inError || inParams
    }
    return true
  })

  const handleCopyLogs = async () => {
    try {
      const text = formatLogsAsText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Registros de depuración copiados al portapapeles')
      setTimeout(() => setCopied(false), 2200)
    } catch (_) {
      toast.error('No se pudieron copiar los registros')
    }
  }

  const handleClear = () => {
    clearLogs()
    toast.info('Registros de depuración vaciados')
  }

  const handleTestPing = async () => {
    const url = getScriptUrl()
    if (!url) {
      toast.error('Configura primero la URL de Google Apps Script')
      return
    }
    setTestingPing(true)
    const toastId = toast.loading('Ejecutando ping de prueba a Google Sheets...')
    try {
      const res = await callApi({ action: 'ping' })
      toast.success(`Ping exitoso (Versión: ${res.version || 'OK'})`, { id: toastId })
    } catch (err) {
      toast.error('Fallo en el ping: ' + err.message, { id: toastId })
    } finally {
      setTestingPing(false)
    }
  }

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="w-full max-w-lg max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shadow-xs">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  Registro de Tareas (DEBUG)
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Activo
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {logs.length} tarea(s) registradas
                {errorCount > 0 && (
                  <span className="ml-1.5 text-rose-600 font-semibold">
                    ({errorCount} {errorCount === 1 ? 'error' : 'errores'})
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTestPing}
              disabled={testingPing}
              title="Lanzar petición ping de prueba"
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${testingPing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Probar</span> Ping
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-white space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('errors')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 flex items-center gap-1 ${
                filter === 'errors'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 border border-rose-200/80 hover:bg-rose-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Solo Errores ({errorCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('success')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 flex items-center gap-1 ${
                filter === 'success'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Éxitos ({successCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por acción, error o datos..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-slate-400 transition-colors"
              />
            </div>
            {logs.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  title="Copiar todos los registros"
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  title="Limpiar registros"
                  className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-xl text-xs transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[260px] bg-slate-50/50">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                <Bug className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {logs.length === 0
                  ? 'No hay tareas registradas aún'
                  : 'Ninguna tarea coincide con el filtro'}
              </p>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                {logs.length === 0
                  ? 'Las peticiones a Google Sheets (cargar mes, actualizar ingresos, sincronizar, etc.) se registrarán aquí en tiempo real.'
                  : 'Prueba a cambiar el filtro o limpiar el campo de búsqueda.'}
              </p>
              {logs.length === 0 && (
                <button
                  type="button"
                  onClick={handleTestPing}
                  className="mt-4 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                >
                  Generar evento de prueba (Ping)
                </button>
              )}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isError = log.status === 'error'
              const isSuccess = log.status === 'success'
              const isPending = log.status === 'pending'
              const isExpanded = expandedId === log.id

              return (
                <div
                  key={log.id}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isError
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                      : isSuccess
                      ? 'bg-white border-slate-200/90 text-slate-800'
                      : isPending
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(log.id)}
                    className="w-full p-3 text-left flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {isError && <AlertCircle className="w-4 h-4 text-rose-600" />}
                        {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {isPending && <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />}
                        {!isError && !isSuccess && !isPending && (
                          <div className="w-2 h-2 rounded-full bg-slate-400 mt-1" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md ${
                              isError
                                ? 'bg-rose-200/80 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.action}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 inline" />
                            {log.time}
                          </span>
                          {log.durationMs != null && (
                            <span className="text-[10px] text-slate-500 font-mono font-medium">
                              {log.durationMs}ms
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-semibold mt-1 leading-snug truncate">
                          {log.title}
                        </p>

                        {log.error && (
                          <p className="text-xs text-rose-700 font-medium mt-1 leading-snug break-words">
                            ❌ {log.error}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-slate-400 pt-0.5">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="px-3.5 pb-3.5 pt-1 border-t border-slate-100/80 space-y-2 text-xs"
                    >
                      {log.params && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Parámetros enviados
                          </div>
                          <pre className="p-2 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-tight">
                            {JSON.stringify(log.params, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.error && (
                        <div>
                          <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-1">
                            Detalle del error
                          </div>
                          <div className="p-2.5 rounded-xl bg-rose-100/90 border border-rose-200 text-rose-900 text-xs font-mono break-words leading-relaxed">
                            {log.error}
                          </div>
                        </div>
                      )}

                      {log.response && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Respuesta del servidor
                          </div>
                          <pre className="p-2 rounded-xl bg-slate-100 text-slate-800 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-tight max-h-40">
                            {typeof log.response === 'object'
                              ? JSON.stringify(log.response, null, 2)
                              : String(log.response)}
                          </pre>
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400 font-mono pt-1">
                        ID: {log.id} • ISO: {log.isoTime}
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Solo activo mientras la opción DEBUG esté activada.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 rounded-xl text-xs font-semibold"
          >
            Cerrar
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
