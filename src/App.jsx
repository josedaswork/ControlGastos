import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Toaster, toast } from 'sonner'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { RefreshCw, Plus, Settings, WalletCards, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { fmt } from '@/lib/utils'
import {
  getScriptUrl,
  setScriptUrl as saveScriptUrl,
  getCategories as fetchCategories,
  getExpenses as fetchExpenses,
  getSummary as fetchSummary,
  addExpenseDirect,
  addToPending,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
  setTotalIncome as apiSetTotalIncome,
  setSavingsGoal as apiSetSavingsGoal,
  syncPendingExpenses,
  getPendingForMonth,
  getPendingExpenses,
  DEFAULT_CATEGORIES,
  clearAllCache,
  getCachedSummary,
  getCachedExpenses,
  getCachedCategories,
} from '@/lib/sheetsApi'
import MonthSelector from '@/components/MonthSelector'
import MonthlySummary from '@/components/MonthlySummary'
import ExpenseList from '@/components/ExpenseList'
import AddExpenseModal from '@/components/AddExpenseModal'
import EditExpenseModal from '@/components/EditExpenseModal'
import EditIncomeModal from '@/components/EditIncomeModal'
import EditSavingsGoalModal from '@/components/EditSavingsGoalModal'
import FixedExpensesModal from '@/components/FixedExpensesModal'
import FinalizeMonthModal from '@/components/FinalizeMonthModal'
import SetupScreen from '@/components/SetupScreen'
import {
  MONTHS,
  getFinalizedMonths,
  setMonthFinalized,
  getEffectiveCurrentMonth,
} from '@/lib/monthStatus'

function App() {
  const [scriptUrl, setScriptUrl] = useState(getScriptUrl())
  const [showSetup, setShowSetup] = useState(!scriptUrl)
  const [finalizedMonths, setFinalizedMonths] = useState(() => getFinalizedMonths())
  const [effectiveCurrentMonth, setEffectiveCurrentMonth] = useState(() => getEffectiveCurrentMonth())
  const [selectedMonth, setSelectedMonth] = useState(() => getEffectiveCurrentMonth())
  const [finalizeModalMonth, setFinalizeModalMonth] = useState(null)
  const [summary, setSummary] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showSavingsGoalModal, setShowSavingsGoalModal] = useState(false)
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(null)
  const [pendingCount, setPendingCount] = useState(getPendingExpenses().length)
  const [syncing, setSyncing] = useState(false)
  const [sendingExpenses, setSendingExpenses] = useState([])
  const queueRef = useRef([])
  const processingRef = useRef(false)
  const loadIdRef = useRef(0)

  const monthName = MONTHS[selectedMonth]

  const loadData = useCallback(async () => {
    if (!scriptUrl) return

    const currentLoadId = ++loadIdRef.current

    // Show cached data instantly, or clear old month's data
    const cachedSummary = getCachedSummary(monthName)
    const cachedExpenses = getCachedExpenses(monthName)
    setSummary(cachedSummary || null)
    setExpenses(cachedExpenses?.expenses || [])

    // Then refresh from server in background
    setLoading(true)
    try {
      const [s, e] = await Promise.all([
        fetchSummary(monthName),
        fetchExpenses(monthName),
      ])
      // Discard if month changed while fetching
      if (currentLoadId !== loadIdRef.current) return
      setSummary(s)
      setExpenses(e.expenses || [])
    } catch (err) {
      if (currentLoadId !== loadIdRef.current) return
      if (!cachedSummary && !cachedExpenses) {
        toast.error('Error cargando datos: ' + err.message)
      }
    } finally {
      if (currentLoadId === loadIdRef.current) setLoading(false)
    }
    setPendingCount(getPendingExpenses().length)
  }, [scriptUrl, monthName])

  const loadCategories = useCallback(async () => {
    if (!scriptUrl) return

    // Show cached categories instantly (or fallback), then refresh in background.
    const cachedCategories = getCachedCategories()
    if (cachedCategories?.categories?.length > 0) {
      setCategories(cachedCategories.categories)
    } else {
      setCategories((prev) => prev.length > 0 ? prev : DEFAULT_CATEGORIES)
    }

    try {
      const data = await fetchCategories()
      if (data.categories?.length > 0) {
        setCategories(data.categories)
        return
      }
    } catch (err) {
      console.warn('Error refrescando categorías en background:', err.message)
    }
  }, [scriptUrl])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadData() }, [loadData])

  const handleOpenAddModal = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setShowAddModal(true)
    if (categories.length === 0) loadCategories()
  }

  const handleAddExpense = (category, amount) => {
    const cleanCat = String(category || '').trim()
    if (cleanCat) {
      setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    }
    const expense = { id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`, month: monthName, category: cleanCat, amount }
    queueRef.current = [...queueRef.current, expense]
    setSendingExpenses([...queueRef.current])
    setShowAddModal(false)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    toast('Enviando gasto...', { icon: '📤', duration: 1500 })
    processQueue()
  }

  const processQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0]
      try {
        await addExpenseDirect(item.month, item.category, item.amount)
        queueRef.current = queueRef.current.slice(1)
        setSendingExpenses([...queueRef.current])
        toast.success(`"${item.category}" añadido`)
      } catch {
        addToPending(item.month, item.category, item.amount)
        queueRef.current = queueRef.current.slice(1)
        setSendingExpenses([...queueRef.current])
        setPendingCount(getPendingExpenses().length)
        toast.error(`Sin conexión — "${item.category}" guardado`)
      }
    }

    processingRef.current = false
    loadData()
  }

  const handleEditExpense = async (expense, newCategory, newAmount) => {
    setEditingExpense(null)
    const cleanCat = String(newCategory || '').trim()
    if (cleanCat) {
      setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    }
    const toastId = toast.loading('Actualizando gasto...')
    try {
      await apiUpdateExpense(monthName, expense.row, expense.category, expense.amount, cleanCat, newAmount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success('Gasto actualizado', { id: toastId })
      loadData()
    } catch (err) {
      toast.error('Error actualizando: ' + err.message, { id: toastId })
    }
  }

  const handleDeleteExpense = (expense) => {
    setDeletingExpense(expense)
  }

  const confirmDeleteExpense = async () => {
    const expense = deletingExpense
    if (!expense) return
    setDeletingExpense(null)
    const toastId = toast.loading('Eliminando gasto...')
    try {
      await apiDeleteExpense(monthName, expense.row, expense.category, expense.amount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success('Gasto eliminado', { id: toastId })
      loadData()
    } catch (err) {
      toast.error('Error eliminando: ' + err.message, { id: toastId })
    }
  }

  const handleSaveIncome = async (newAmount) => {
    // Optimistic UI update
    setSummary((prev) => {
      if (!prev) return prev
      const rem = newAmount - (prev.fixedExpenses || 0) - (prev.variableExpenses || 0) - (prev.desiredSavings || 0)
      return {
        ...prev,
        income: newAmount,
        remainingMonth: rem,
        savings: rem,
      }
    })

    const toastId = toast.loading('Guardando ingresos en Sheets...')
    try {
      await apiSetTotalIncome(monthName, newAmount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success(`Ingresos de ${monthName} actualizados a ${fmt(newAmount)}`, { id: toastId })
      loadData()
    } catch (err) {
      toast.error('Error actualizando ingresos: ' + err.message, { id: toastId })
      loadData()
    }
  }

  const handleSaveSavingsGoal = async (newGoal) => {
    // Optimistic UI update
    setSummary((prev) => {
      if (!prev) return prev
      const rem = (prev.income || 0) - (prev.fixedExpenses || 0) - (prev.variableExpenses || 0) - newGoal
      return {
        ...prev,
        desiredSavings: newGoal,
        remainingMonth: rem,
        savings: rem,
      }
    })

    const toastId = toast.loading('Guardando meta de ahorro...')
    try {
      await apiSetSavingsGoal(monthName, newGoal)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success(`Meta de ahorro de ${monthName} actualizada a ${fmt(newGoal)}`, { id: toastId })
      loadData()
    } catch (err) {
      toast.error('Error actualizando meta: ' + err.message, { id: toastId })
      loadData()
    }
  }

  const handleFixedExpensesUpdate = (newFixedTotal, updatedSummary) => {
    if (updatedSummary) {
      setSummary(updatedSummary)
    } else {
      setSummary((prev) => {
        if (!prev) return prev
        const prevFixed = prev.fixedExpenses ?? 0
        const diff = newFixedTotal - prevFixed
        const prevRemaining = prev.remainingMonth ?? prev.savings ?? 0
        return {
          ...prev,
          fixedExpenses: newFixedTotal,
          remainingMonth: prevRemaining - diff,
        }
      })
    }
  }

  const handleSync = async () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setSyncing(true)
    try {
      const { synced, failed } = await syncPendingExpenses()
      if (synced > 0) {
        toast.success(`${synced} gasto(s) sincronizado(s)`)
      }
      if (failed > 0) {
        toast.error(`${failed} gasto(s) no se pudieron sincronizar`)
      }
      if (synced === 0 && failed === 0) {
        toast.info('Nada pendiente de sincronizar')
      }
      setPendingCount(getPendingExpenses().length)
      if (synced > 0) loadData()
    } catch (err) {
      toast.error('Error sincronizando: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleSetupSave = (url) => {
    if (url !== scriptUrl) clearAllCache()
    saveScriptUrl(url)
    setScriptUrl(url)
    setShowSetup(false)
  }

  const handleToggleFinalizeMonth = (monthIdx, shouldFinalize) => {
    const updated = setMonthFinalized(monthIdx, shouldFinalize)
    setFinalizedMonths(updated)
    const newEffective = getEffectiveCurrentMonth()
    setEffectiveCurrentMonth(newEffective)

    if (shouldFinalize) {
      const nextIdx = (monthIdx + 1) % 12
      setSelectedMonth(nextIdx)
      toast.success(`¡Mes de ${MONTHS[monthIdx]} finalizado! Pasando a ${MONTHS[nextIdx]}`)
    } else {
      toast.info(`Mes de ${MONTHS[monthIdx]} reabierto`)
    }
  }

  const pendingForMonth = useMemo(() => getPendingForMonth(monthName), [monthName, pendingCount])
  const sendingForMonth = useMemo(() => sendingExpenses.filter((e) => e.month === monthName), [sendingExpenses, monthName])

  if (showSetup) {
    return (
      <>
        <SetupScreen
          onSave={handleSetupSave}
          onClose={scriptUrl ? () => setShowSetup(false) : undefined}
          initialUrl={scriptUrl}
        />
        <Toaster position="top-center" theme="light" />
      </>
    )
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 sm:bg-slate-100 flex justify-center">
      {/* Google Pixel 10 Phone Frame Container */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col relative overflow-x-hidden shadow-sm">
        {/* Top App Bar con margen superior para no solaparse con la hora y barra de notificaciones */}
        <header
          className="px-4 pb-2 flex items-center justify-between bg-slate-50 shrink-0"
          style={{
            paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 10px), 36px)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 8, scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xs shadow-primary/30"
            >
              <WalletCards className="w-5 h-5" />
            </motion.div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                Control Gastos
              </h1>
              <button
                type="button"
                onClick={() => setFinalizeModalMonth(selectedMonth)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors group cursor-pointer"
                title="Haz clic para ver opciones o finalizar este mes"
              >
                <span>{monthName} 2026</span>
                {finalizedMonths.includes(selectedMonth) ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full border border-emerald-300">
                    ✓ Finalizado
                  </span>
                ) : selectedMonth === effectiveCurrentMonth ? (
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                    En curso
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Sync Button */}
            <motion.button
              type="button"
              onClick={handleSync}
              disabled={loading || syncing}
              whileTap={{ scale: 0.88, rotate: -45 }}
              aria-label="Sincronizar con Google Sheets"
              className="relative w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || syncing) ? 'animate-spin text-primary' : ''}`} />
              {pendingCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 0.3 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs"
                >
                  {pendingCount}
                </motion.span>
              )}
            </motion.button>

            {/* Settings Button */}
            <motion.button
              type="button"
              onClick={() => {
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                setShowSetup(true)
              }}
              whileTap={{ scale: 0.88, rotate: 25 }}
              aria-label="Configurar Google Apps Script"
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
            >
              <Settings className="h-4 w-4" />
            </motion.button>
          </div>
        </header>

        {/* Month Selector with active pill layout transition and finalize trigger */}
        <MonthSelector
          selected={selectedMonth}
          onChange={setSelectedMonth}
          finalizedMonths={finalizedMonths}
          effectiveCurrentMonth={effectiveCurrentMonth}
          onOpenFinalize={(idx) => setFinalizeModalMonth(idx)}
        />

        {/* Financial Summary */}
        <MonthlySummary
          summary={summary}
          loading={loading}
          onEditIncome={() => setShowIncomeModal(true)}
          onEditSavingsGoal={() => setShowSavingsGoalModal(true)}
          onOpenFixedExpenses={() => setShowFixedExpensesModal(true)}
        />

        {/* Expense List Section */}
        <main className="flex-1 px-4 pb-28">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Gastos Variables
            </h2>
            {summary?.variableExpenses > 0 && (
              <motion.span
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100"
              >
                {fmt(summary.variableExpenses)}
              </motion.span>
            )}
          </div>

          <ExpenseList
            expenses={expenses}
            loading={loading}
            pending={pendingForMonth}
            sending={sendingForMonth}
            onEdit={setEditingExpense}
            onDelete={handleDeleteExpense}
          />
        </main>

        {/* Google Pixel Signature Material 3 Floating Action Button (FAB) */}
        <div className="fixed bottom-6 right-6 z-40 sm:sticky sm:self-end sm:mr-6 sm:bottom-6 sm:mt-auto">
          <motion.button
            type="button"
            onClick={handleOpenAddModal}
            aria-label="Añadir nuevo gasto"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.88, rotate: 15 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            className="w-14 h-14 rounded-2xl bg-primary text-white shadow-lg shadow-primary/35 flex items-center justify-center transition-colors"
          >
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </motion.button>
        </div>
      </div>

      {/* Add Expense Bottom Sheet Modal with AnimatePresence */}
      <AnimatePresence>
        {showAddModal && (
          <AddExpenseModal
            categories={categories}
            onAdd={handleAddExpense}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Edit Expense Bottom Sheet Modal with AnimatePresence */}
      <AnimatePresence>
        {editingExpense && (
          <EditExpenseModal
            expense={editingExpense}
            categories={categories}
            onSave={handleEditExpense}
            onClose={() => setEditingExpense(null)}
          />
        )}
      </AnimatePresence>

      {/* Edit Total Income Modal */}
      <AnimatePresence>
        {showIncomeModal && (
          <EditIncomeModal
            month={monthName}
            currentIncome={summary?.income ?? 0}
            onSave={handleSaveIncome}
            onClose={() => setShowIncomeModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Edit Savings Goal Modal */}
      <AnimatePresence>
        {showSavingsGoalModal && (
          <EditSavingsGoalModal
            month={monthName}
            currentGoal={summary?.desiredSavings ?? 0}
            onSave={handleSaveSavingsGoal}
            onClose={() => setShowSavingsGoalModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Fixed Expenses Checklist Modal */}
      <AnimatePresence>
        {showFixedExpensesModal && (
          <FixedExpensesModal
            month={monthName}
            currentFixedTotal={summary?.fixedExpenses ?? 0}
            onSummaryUpdate={handleFixedExpensesUpdate}
            onClose={() => setShowFixedExpensesModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Finalize Month Modal */}
      <AnimatePresence>
        {finalizeModalMonth !== null && (
          <FinalizeMonthModal
            monthIndex={finalizeModalMonth}
            isFinalized={finalizedMonths.includes(finalizeModalMonth)}
            isCurrentInCourse={finalizeModalMonth === effectiveCurrentMonth}
            onToggleFinalize={handleToggleFinalizeMonth}
            onSelectMonth={setSelectedMonth}
            onClose={() => setFinalizeModalMonth(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Alert Dialog with Spring Fade & Scale */}
      <AnimatePresence>
        {deletingExpense && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setDeletingExpense(null)}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Dialog Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200/80 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                ¿Eliminar este gasto?
              </h3>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Se eliminará <span className="font-bold text-slate-800">{deletingExpense.category}</span> por un importe de <span className="font-bold text-slate-900">{fmt(deletingExpense.amount)}</span> de tu Google Spreadsheet.
              </p>
              <div className="flex gap-2.5 justify-end">
                <motion.div whileTap={{ scale: 0.93 }}>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
                    onClick={() => setDeletingExpense(null)}
                  >
                    Cancelar
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.93 }}>
                  <Button
                    variant="destructive"
                    className="h-11 rounded-xl text-xs font-semibold shadow-xs"
                    onClick={confirmDeleteExpense}
                  >
                    Eliminar
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster position="top-center" theme="light" richColors />
    </div>
  )
}

export default App
