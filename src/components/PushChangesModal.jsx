import { useState, useEffect } from 'react'
import {
  UploadCloud,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Edit3,
  Layers,
  ArrowUpRight,
  Target,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Button } from '@/components/ui/button'
import { removePushTask, clearPushQueue } from '@/lib/sheetsApi'
import {
  startPushSync,
  subscribeSyncState,
  getSyncSnapshot,
} from '@/lib/syncManager'
import { isNativeBackgroundSyncAvailable } from '@/lib/backgroundSyncPlugin'
import { fmt } from '@/lib/utils'
import { toast } from 'sonner'

export default function PushChangesModal({ isOpen, onClose, queue = [], onPushed }) {
  const [syncSnap, setSyncSnap] = useState(() => getSyncSnapshot())
  const [progress, setProgress] = useState(null) // { current: 1, total: 3, message?: string }
  const isNative = isNativeBackgroundSyncAvailable()

  useEffect(() => {
    const unsub = subscribeSyncState((snap) => {
      setSyncSnap(snap)
      if (snap?.activeSync?.type === 'push' && snap.activeSync.progressTotal > 0) {
        setProgress({
          current: snap.activeSync.progressCurrent || 0,
          total: snap.activeSync.progressTotal,
          message: snap.activeSync.progressMessage,
        })
      } else if (!snap?.isPushing) {
        setProgress(null)
      }
    })
    return () => unsub()
  }, [])

  if (!isOpen) return null

  const pushing = Boolean(syncSnap.isPushing)
  const pulling = Boolean(syncSnap.isPulling)

  const handlePush = async () => {
    if (pushing || pulling || queue.length === 0) return
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
    setProgress({ current: 0, total: queue.length, message: 'Iniciando subida segura…' })

    const toastId = toast.loading('Subiendo paquete de cambios a Google Sheets...')

    try {
      const res = await startPushSync({
        toastId,
        onProgress: (p) => setProgress(p),
      })

      Haptics.notification({ type: 'success' }).catch(() => {})
      if (res?.mode !== 'native') {
        toast.success(`¡${res.count} cambios subidos con éxito al Excel!`, { id: toastId, duration: 4000 })
      }
      onPushed?.()
      onClose()
    } catch (err) {
      Haptics.notification({ type: 'error' }).catch(() => {})
      if (!isNative) {
        toast.error('Error al subir cambios: ' + err.message, { id: toastId, duration: 6000 })
      }
      onPushed?.()
    }
  }

  const handleRemove = (taskId) => {
    if (pushing) return
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    removePushTask(taskId)
    onPushed?.()
  }

  const handleClearAll = () => {
    if (pushing) return
    if (window.confirm('¿Deseas descartar todas las tareas pendientes de subir?')) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      clearPushQueue()
      onPushed?.()
      onClose()
      toast.info('Se han limpiado las tareas pendientes')
    }
  }

  const getActionIcon = (action) => {
    switch (action) {
      case 'addExpense':
        return <PlusCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case 'updateExpense':
        return <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      case 'deleteExpense':
        return <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
      case 'setFixedExpenseStatus':
        return <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
      case 'setFixedExpenseAmount':
        return <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      case 'setTotalIncome':
      case 'addIncome':
        return <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case 'setSavingsGoal':
        return <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
      default:
        return <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
    }
  }

  const getActionBg = (action) => {
    switch (action) {
      case 'addExpense':
      case 'addIncome':
        return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60'
      case 'updateExpense':
        return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/70 dark:border-blue-800/60'
      case 'deleteExpense':
        return 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/60'
      case 'setFixedExpenseStatus':
        return 'bg-purple-50 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-800/60'
      case 'setFixedExpenseAmount':
        return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60'
      case 'setTotalIncome':
        return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60'
      case 'setSavingsGoal':
        return 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-800/60'
      default:
        return 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs touch-none overscroll-none"
        onClick={!pushing || isNative ? onClose : undefined}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ y: '100%', opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.9 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl p-4 sm:p-6 space-y-4 max-h-[88vh] flex flex-col overscroll-contain"
      >
        {/* Handle bar on mobile */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto sm:hidden -mt-1 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <UploadCloud className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">Push Changes</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300">
                  {queue.length} pendiente{queue.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paquete de datos en local listo para subir al Excel
              </p>
            </div>
          </div>
          {(!pushing || isNative) && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Description Banner */}
        <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-3 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              Todos tus cambios se han aplicado instantáneamente en la app y están guardados en tu dispositivo. Al pulsar{' '}
              <strong className="text-slate-800 dark:text-slate-200">Subir cambios a Excel</strong>, cada tarea se envía con identificador único anti-duplicados.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isNative
                ? 'En Android, WorkManager continúa la subida en segundo plano aunque cambies de app o bloquees la pantalla (no sobrevive a «Forzar detención»).'
                : 'En navegador web, mantén la pestaña abierta hasta que finalice la subida.'}
            </p>
          </div>
        </div>

        {syncSnap.lastNotice && (syncSnap.lastNotice.level === 'warning' || syncSnap.lastNotice.level === 'error') && (
          <div className="p-3 rounded-2xl border border-amber-300/80 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>{syncSnap.lastNotice.message}</span>
          </div>
        )}

        {/* Task List (Scrollable) */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[46vh] min-h-[140px]">
          {queue.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/40 mb-2" />
              <p className="font-semibold text-sm text-slate-600 dark:text-slate-300">No hay cambios pendientes</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Todo está sincronizado con tu hoja de cálculo</p>
            </div>
          ) : (
            <AnimatePresence>
              {queue.map((task, idx) => (
                <motion.div
                  key={task.mutationId || task.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${getActionBg(task.action)}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 shadow-2xs flex items-center justify-center shrink-0">
                      {getActionIcon(task.action)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{task.title}</span>
                        {task.month && (
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-300 bg-white/70 dark:bg-slate-900/70 px-1.5 py-0.2 rounded-md">
                            {task.month}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate font-medium mt-0.5">
                        {task.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {task.badge && (
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 shadow-2xs text-slate-700 dark:text-slate-200">
                        {task.badge}
                      </span>
                    )}
                    {!pushing && (
                      <button
                        type="button"
                        onClick={() => handleRemove(task.id)}
                        title="Cancelar este cambio"
                        className="w-7 h-7 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center justify-center transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Progress or Push Button Footer */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          {pushing ? (
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/50 rounded-2xl border border-blue-200/80 dark:border-blue-800/70 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-200">
                <UploadCloud className="w-4 h-4 animate-bounce text-blue-600 dark:text-blue-400" />
                <span>
                  {progress?.message
                    ? progress.message
                    : progress?.total
                      ? `Subiendo ${progress.current} de ${progress.total} cambios...`
                      : 'Conectando con Google Sheets...'}
                </span>
              </div>
              <div className="w-full bg-blue-200/60 dark:bg-blue-900/60 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="bg-blue-600 h-full rounded-full"
                  initial={{ width: '15%' }}
                  animate={{
                    width: progress?.total
                      ? `${Math.max(15, (progress.current / progress.total) * 100)}%`
                      : '80%',
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              {isNative && (
                <p className="text-[10px] text-blue-700/80 dark:text-blue-300/80">
                  Puedes cerrar esta ventana: la sincronización seguirá en segundo plano.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {queue.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearAll}
                  className="rounded-2xl h-12 px-3 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 text-xs font-semibold"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5 text-slate-500 dark:text-slate-400" />
                  Deshacer todo
                </Button>
              )}
              <Button
                type="button"
                onClick={handlePush}
                disabled={queue.length === 0 || pulling}
                className="flex-1 rounded-2xl h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UploadCloud className="w-5 h-5 stroke-[2.2]" />
                <span>{pulling ? 'Descarga en curso…' : 'Subir cambios a Excel (Push)'}</span>
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
