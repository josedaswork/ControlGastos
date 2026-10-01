import { useState, useEffect } from 'react'
import { Lock, X, Check, CheckSquare, Square, RefreshCw, AlertCircle, Pencil, Wrench, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmt } from '@/lib/utils'
import {
  getFixedExpenses,
  getCachedFixedExpenses,
  stageSetFixedExpenseStatus,
  stageSetFixedExpenseAmount,
  repairFixedExpenseFormulas,
  sanitizeAndMergeFixedExpenses,
  FIXED_DEFAULT_CATEGORIES,
  getPushQueue,
  subscribePushQueue,
} from '@/lib/sheetsApi'
import { toast } from 'sonner'

export default function FixedExpensesModal({ month, currentFixedTotal = 0, onSummaryUpdate, onClose }) {
  // Inicialización síncrona inmediata desde almacenamiento local (0ms de retraso)
  const [items, setItems] = useState(() => {
    const cached = getCachedFixedExpenses(month)
    if (cached?.fixedExpenses && cached.fixedExpenses.length > 0) {
      return sanitizeAndMergeFixedExpenses([], cached.fixedExpenses)
    }
    return sanitizeAndMergeFixedExpenses([], [])
  })
  const [loading, setLoading] = useState(false)
  const [isUsingCache, setIsUsingCache] = useState(true)
  const [backgroundSyncing, setBackgroundSyncing] = useState(false)
  const [syncingRow, setSyncingRow] = useState(null)
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [repairing, setRepairing] = useState(false)

  // Conjunto de filas con cambios pendientes de Push para este mes
  const [pendingRowTasks, setPendingRowTasks] = useState(() => {
    const q = getPushQueue()
    const set = new Set()
    q.forEach((t) => {
      if (t.month === month && (t.action === 'setFixedExpenseStatus' || t.action === 'setFixedExpenseAmount')) {
        set.add(t.payload?.row)
      }
    })
    return set
  })

  // Estado para edición del importe
  const [editingItem, setEditingItem] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [savingAmount, setSavingAmount] = useState(false)

  // Cargar datos locales de inmediato al cambiar de mes
  useEffect(() => {
    const cached = getCachedFixedExpenses(month)
    if (cached?.fixedExpenses && cached.fixedExpenses.length > 0) {
      setItems(sanitizeAndMergeFixedExpenses([], cached.fixedExpenses))
      setIsUsingCache(true)
    } else {
      setItems(sanitizeAndMergeFixedExpenses([], []))
      setIsUsingCache(false)
    }
    setLoading(false)
    setBackgroundSyncing(false)
  }, [month])

  // Escuchar cambios en la pila de push
  useEffect(() => {
    const unsub = subscribePushQueue((q) => {
      const set = new Set()
      q.forEach((t) => {
        if (t.month === month && (t.action === 'setFixedExpenseStatus' || t.action === 'setFixedExpenseAmount')) {
          set.add(t.payload?.row)
        }
      })
      setPendingRowTasks(set)
    })
    return () => unsub()
  }, [month])

  // Descarga desde Excel bajo petición expresa del usuario
  const handleRefresh = async () => {
    const q = getPushQueue()
    const hasUnpushed = q.some(
      (t) => t.month === month && (t.action === 'setFixedExpenseStatus' || t.action === 'setFixedExpenseAmount')
    )
    if (hasUnpushed) {
      const confirmed = window.confirm(
        `Tienes casillas o importes modificados en local que están pendientes de subir al Excel.\n\nSi descargas ahora desde Sheets se sustituirán tus cambios locales.\n\n¿Deseas descargar de todos modos?`
      )
      if (!confirmed) return
    }

    setLoading(true)
    setBackgroundSyncing(true)
    setError(null)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const toastId = toast.loading('Descargando gastos fijos desde Excel...')
    try {
      const res = await getFixedExpenses(month)
      if (res?.fixedExpenses) {
        setItems(sanitizeAndMergeFixedExpenses([], res.fixedExpenses))
      }
      if (onSummaryUpdate) {
        onSummaryUpdate(res?.totalActive, res?.summary)
      }
      setIsUsingCache(false)
      toast.success('Gastos fijos descargados de Google Sheets', { id: toastId })
    } catch (err) {
      setError(err.message || 'Error al actualizar')
      toast.error('Error al actualizar: ' + err.message, { id: toastId })
    } finally {
      setLoading(false)
      setBackgroundSyncing(false)
    }
  }

  // Reparar y re-aplicar fórmulas condicionales con sintaxis España (; y ,)
  const handleRepair = async () => {
    if (repairing || loading) return
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    setRepairing(true)
    try {
      const res = await repairFixedExpenseFormulas(month, true)
      if (res?.fixedExpenses) {
        setItems(sanitizeAndMergeFixedExpenses([], res.fixedExpenses))
      }
      if (onSummaryUpdate) {
        onSummaryUpdate(res?.totalActive, res?.summary)
      }
      toast.success('Fórmulas comprobadas y configuradas con ";" y ","')
    } catch (err) {
      toast.error('Error al reparar fórmulas: ' + err.message)
    } finally {
      setRepairing(false)
    }
  }

  // Cálculo de totales actuales
  const activeCount = items.filter((i) => i.active).length
  const totalItems = items.length
  const totalActiveAmount = items.reduce((sum, i) => (i.active ? sum + (i.amount || 0) : sum), 0)
  const totalPossibleAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0)

  // Cambiar estado de una casilla individual (Instantáneo en local)
  const handleToggle = (item) => {
    const nextActive = !item.active
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})

    try {
      const res = stageSetFixedExpenseStatus(month, item.row, nextActive, item.category, item.amount)
      setItems(res.fixedExpenses)
      onSummaryUpdate?.(res.totalActive, res.summary)
    } catch (err) {
      toast.error('Error al modificar casilla: ' + err.message)
    }
  }

  // Marcar / desmarcar todos en lote (Instantáneo en local)
  const handleToggleAll = (targetActive) => {
    if (items.length === 0) return
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})

    items.forEach((item) => {
      stageSetFixedExpenseStatus(month, item.row, targetActive, item.category, item.amount)
    })

    const cached = getCachedFixedExpenses(month)
    if (cached?.fixedExpenses) {
      setItems(cached.fixedExpenses)
      onSummaryUpdate?.(cached.totalActive)
    }
    toast.success(targetActive ? 'Todas las casillas marcadas (en local)' : 'Todas las casillas desmarcadas (en local)')
  }

  // Abrir editor de importe
  const handleOpenEdit = (item) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setEditingItem(item)
    setEditAmount(item.amount !== undefined && item.amount !== null ? String(item.amount) : '')
    setEditCategory(item.category || '')
  }

  // Guardar nuevo importe (Instantáneo en local)
  const handleSaveAmount = (e) => {
    e?.preventDefault()
    if (!editingItem) return
    const numAmount = parseFloat(String(editAmount).replace(',', '.'))
    if (isNaN(numAmount) || numAmount < 0) {
      toast.error('Por favor introduce un importe numérico válido')
      return
    }

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})

    try {
      const res = stageSetFixedExpenseAmount(month, editingItem.row, numAmount, editCategory.trim())
      setItems(res.fixedExpenses)
      onSummaryUpdate?.(res.totalActive, res.summary)
      toast.success(`Importe actualizado a ${fmt(numAmount)} (en local, pendiente de Push)`)
      setEditingItem(null)
    } catch (err) {
      toast.error('Error al guardar importe: ' + err.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs touch-none overscroll-none"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Modal / Bottom Sheet */}
      <motion.div
        initial={{ y: '100%', opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.9 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-5 pb-8 sm:p-6 space-y-4 max-h-[85vh] flex flex-col overscroll-contain"
      >
        {/* Mobile handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto sm:hidden -mt-1 mb-1" />

        {/* Modal Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
              <Lock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Gastos Fijos</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100/70 text-amber-800 border border-amber-200/60">
                  {month}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/90 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Almacenado en local
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Marca la casilla para computar el gasto en el mes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || backgroundSyncing || repairing}
              title="Descargar datos de gastos fijos desde Google Sheets bajo petición"
              aria-label="Descargar gastos fijos desde Excel"
              className="h-8 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 px-2.5 text-xs font-semibold"
            >
              <Download className={`w-3.5 h-3.5 ${(loading || backgroundSyncing) ? 'animate-bounce text-amber-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{loading || backgroundSyncing ? 'Descargando...' : 'Descargar de Excel'}</span>
              <span className="sm:hidden">{loading || backgroundSyncing ? '...' : 'Descargar'}</span>
            </Button>
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing || loading}
              title="Ajustar y reparar fórmulas con formato España (; y ,)"
              aria-label="Reparar fórmulas"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-700 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 ${repairing ? 'animate-spin text-amber-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Total Metric Card */}
        <div className="bg-amber-50/50 rounded-2xl p-3.5 border border-amber-200/60 shrink-0 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/80 block">
              Total Fijos Aplicados
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-slate-900">
                {fmt(totalActiveAmount)}
              </span>
              {totalPossibleAmount > totalActiveAmount && (
                <span className="text-xs text-slate-400 font-medium line-through">
                  {fmt(totalPossibleAmount)}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-white px-2.5 py-1 rounded-full border border-amber-200 shadow-2xs">
              <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
              {activeCount} de {totalItems} activos
            </span>
          </div>
        </div>

        {/* Quick Batch Actions */}
        {totalItems > 0 && !loading && (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 shrink-0">
            <span>Toca cualquier fila o casilla para activar/desactivar</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                disabled={batchSyncing || activeCount === totalItems}
                className="font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Marcar todos
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                disabled={batchSyncing || activeCount === 0}
                className="font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40"
              >
                Desmarcar
              </button>
            </div>
          </div>
        )}

        {/* Expenses List */}
        <div className="overflow-y-auto space-y-2 flex-1 pr-0.5 -mr-0.5">
          {loading ? (
            <div className="space-y-2.5 py-2">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-slate-200" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                    </div>
                  </div>
                  <div className="h-5 w-16 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-8 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-red-600 font-medium">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="rounded-xl text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reintentar
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Sin gastos fijos</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No se encontraron filas de gastos fijos para el mes de {month} en tu hoja de cálculo.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isSyncing = syncingRow === item.row || batchSyncing
              return (
                <motion.div
                  key={item.row}
                  layout
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleToggle(item)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    item.active
                      ? 'bg-white hover:bg-amber-50/20 border-slate-200/90 shadow-2xs'
                      : 'bg-slate-50/70 hover:bg-slate-100/60 border-slate-200/50 opacity-75'
                  }`}
                >
                  {/* Left: Checkbox & Name */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <button
                      type="button"
                      aria-label={`${item.active ? 'Desmarcar' : 'Marcar'} ${item.category}`}
                      className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                        item.active
                          ? 'bg-amber-500 border-2 border-amber-500 text-white shadow-xs'
                          : 'bg-white border-2 border-slate-300 text-transparent hover:border-amber-400'
                      }`}
                    >
                      {item.active && (
                        <motion.div
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </motion.div>
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p
                          className={`text-sm font-semibold truncate ${
                            item.active ? 'text-slate-900' : 'text-slate-500'
                          }`}
                        >
                          {item.category}
                        </p>
                        {pendingRowTasks.has(item.row) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shrink-0">
                            📦 Pendiente Push
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-slate-400">
                        {item.active ? 'Aplicado este mes' : 'No contabilizado'}
                      </span>
                    </div>
                  </div>

                  {/* Right: Amount & Edit */}
                  <div className="text-right shrink-0 flex items-center gap-1.5">
                    {isSyncing && (
                      <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin mr-0.5" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenEdit(item)
                      }}
                      aria-label={`Editar importe de ${item.category}: ${fmt(item.amount)}`}
                      className="group/amt flex items-center gap-1.5 py-1 px-2 -mr-1 rounded-xl hover:bg-amber-50 active:bg-amber-100/70 border border-transparent hover:border-amber-200/60 transition-all cursor-pointer"
                    >
                      <span
                        className={`text-base font-bold transition-colors ${
                          item.active
                            ? 'text-slate-900 group-hover/amt:text-amber-700'
                            : 'text-slate-400 line-through group-hover/amt:text-slate-600'
                        }`}
                      >
                        {fmt(item.amount)}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-slate-100 group-hover/amt:bg-amber-100/80 text-slate-400 group-hover/amt:text-amber-700 flex items-center justify-center transition-colors">
                        <Pencil className="w-3 h-3" />
                      </span>
                    </button>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 shrink-0">
          <Button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
          >
            Listo
          </Button>
        </div>
      </motion.div>

      {/* Sub-modal para editar importe numérico */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => !savingAmount && setEditingItem(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative z-10 w-full max-w-sm rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Editar Gasto Fijo</h3>
                    <p className="text-[11px] text-slate-400">Modifica el importe base para {month}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingAmount}
                  onClick={() => setEditingItem(null)}
                  aria-label="Cerrar edición"
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleSaveAmount} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 block">
                    Concepto / Categoría
                  </label>
                  <Input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Ej. Alquiler, Spotify..."
                    className="h-10 rounded-xl text-sm"
                    disabled={savingAmount}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 block">
                    Importe (€)
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      autoFocus
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-12 pl-3.5 pr-8 rounded-xl text-lg font-bold text-slate-900"
                      disabled={savingAmount}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      €
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono pt-1">
                    Fórmula en Columna F: =IF(G{editingItem?.row}; {String(editAmount || '0').replace('.', ',')}; 0)
                  </p>
                </div>

                {/* Ajustes rápidos */}
                <div className="flex gap-1.5 pt-0.5">
                  {[5, 10, 50].map((adj) => (
                    <button
                      key={adj}
                      type="button"
                      disabled={savingAmount}
                      onClick={() => {
                        const curr = parseFloat(String(editAmount).replace(',', '.')) || 0
                        setEditAmount(String(+(curr + adj).toFixed(2)))
                      }}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 text-xs font-semibold transition-colors"
                    >
                      +{adj}€
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={savingAmount}
                    onClick={() => {
                      setEditAmount(String(editingItem.amount || 0))
                    }}
                    className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-colors"
                    title="Restablecer importe original"
                  >
                    Reset
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingAmount}
                    onClick={() => setEditingItem(null)}
                    className="flex-1 h-10 rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingAmount || !editAmount}
                    className="flex-1 h-10 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {savingAmount ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Guardando...
                      </>
                    ) : (
                      'Guardar importe'
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
