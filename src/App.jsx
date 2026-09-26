import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Toaster, toast } from 'sonner'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { RefreshCw, Plus, Settings, WalletCards, AlertTriangle, ArrowUpRight, Bug } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { fmt } from '@/lib/utils'
import {
  getScriptUrl,
  setScriptUrl as saveScriptUrl,
  getSpreadsheetUrl,
  getCategories as fetchCategories,
  getExpenses as fetchExpenses,
  getSummary as fetchSummary,
  getMonthData,
  reconcilePendingExpenses,
  addExpenseDirect,
  addIncomeDirect as apiAddIncome,
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
  getCachedIncomeCategories,
  normalizeScriptUrl,
} from '@/lib/sheetsApi'
import { isDebugEnabled, subscribeLogs } from '@/lib/debugLogger'
import MonthSelector from '@/components/MonthSelector'
import MonthlySummary from '@/components/MonthlySummary'
import ExpenseList from '@/components/ExpenseList'
import AddExpenseModal from '@/components/AddExpenseModal'
import EditExpenseModal from '@/components/EditExpenseModal'
import EditIncomeModal from '@/components/EditIncomeModal'
import EditSavingsGoalModal from '@/components/EditSavingsGoalModal'
import FixedExpensesModal from '@/components/FixedExpensesModal'
import FinalizeMonthModal from '@/components/FinalizeMonthModal'
import ChartsModal from '@/components/ChartsModal'
import SetupScreen from '@/components/SetupScreen'
import DebugLogViewer from '@/components/DebugLogViewer'
import {
  MONTHS,
  getFinalizedMonths,
  setMonthFinalized,
  getEffectiveCurrentMonth,
} from '@/lib/monthStatus'

function App() {
  const [scriptUrl, setScriptUrl] = useState(getScriptUrl())
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(() => getSpreadsheetUrl())
  const [showSetup, setShowSetup] = useState(!scriptUrl)
  const [finalizedMonths, setFinalizedMonths] = useState(() => getFinalizedMonths())
  const [effectiveCurrentMonth, setEffectiveCurrentMonth] = useState(() => getEffectiveCurrentMonth())
  const [selectedMonth, setSelectedMonth] = useState(() => getEffectiveCurrentMonth())
  const [finalizeModalMonth, setFinalizeModalMonth] = useState(null)
  const [summary, setSummary] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [incomeCategories, setIncomeCategories] = useState(() => getCachedIncomeCategories())
  const [loading, setLoading] = useState(false)
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showSavingsGoalModal, setShowSavingsGoalModal] = useState(false)
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false)
  const [showChartsModal, setShowChartsModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(null)
  const [pendingCount, setPendingCount] = useState(getPendingExpenses().length)
  const [syncing, setSyncing] = useState(false)
  const [sendingExpenses, setSendingExpenses] = useState([])
  const [debugActive, setDebugActive] = useState(() => isDebugEnabled())
  const [debugErrorCount, setDebugErrorCount] = useState(0)
  const [showDebugModal, setShowDebugModal] = useState(false)
  const queueRef = useRef([])
  const processingRef = useRef(false)
  const loadIdRef = useRef(0)

  useEffect(() => {
    const unsub = subscribeLogs((currentLogs) => {
      setDebugActive(isDebugEnabled())
      const errs = currentLogs.filter((l) => l.status === 'error').length
      setDebugErrorCount(errs)
    })
    return () => unsub()
  }, [])

  const monthName = MONTHS[selectedMonth]

  const loadData = useCallback(async (force = false) => {
    if (!scriptUrl) return

    const currentLoadId = ++loadIdRef.current

    // Show cached data instantly, or reset for the new month to avoid showing old month's data
    const cachedSummary = getCachedSummary(monthName)
    const cachedExpenses = getCachedExpenses(monthName)
    const hasCache = !!(cachedSummary || (cachedExpenses?.expenses && cachedExpenses.expenses.length > 0))

    if (cachedSummary) {
      setSummary(cachedSummary)
    } else {
      setSummary({
        month: monthName,
        income: 0,
        fixedExpenses: 0,
        variableExpenses: 0,
        desiredSavings: 0,
        totalExpenses: 0,
        remainingMonth: 0,
        savings: 0,
      })
    }

    if (cachedExpenses?.expenses) {
      setExpenses(cachedExpenses.expenses)
    } else {
      setExpenses([])
    }

    setIsUsingCache(hasCache)

    // Solo comprobar si el número de filas coincide con las guardadas en caché
    const knownRowCount = (!force && cachedExpenses?.lastRow) ? cachedExpenses.lastRow : null

    // Carga rápida en segundo plano (~80ms si el número de filas no ha cambiado)
    setLoading(!hasCache)
    try {
      const monthData = await getMonthData(monthName, knownRowCount)

      // Discard if month changed while fetching
      if (currentLoadId !== loadIdRef.current) return

      if (monthData?.unchanged) {
        // El número de filas coincide con las guardadas en Sheets, los datos no han cambiado
        setIsUsingCache(false)
        setLoading(false)
        return
      }

      if (monthData?.summary) {
        setSummary(monthData.summary)
      }
      const serverExpenses = monthData?.expenses || []
      setExpenses(serverExpenses)
      setIsUsingCache(false)

      // Reconcile pending expenses to avoid duplicates
      reconcilePendingExpenses(monthName, serverExpenses)
      setPendingCount(getPendingExpenses().length)
    } catch (err) {
      if (currentLoadId !== loadIdRef.current) return
      if (!cachedSummary && !cachedExpenses) {
        toast.error('Error cargando datos: ' + err.message)
      } else {
        toast.info('Sin conexión con Sheets. Mostrando datos cacheados.', { duration: 2500 })
      }
    } finally {
      if (currentLoadId === loadIdRef.current) setLoading(false)
    }
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
    if (cachedCategories?.incomeCategories?.length > 0) {
      setIncomeCategories(cachedCategories.incomeCategories)
    }

    try {
      const data = await fetchCategories()
      if (data.categories?.length > 0) {
        setCategories(data.categories)
      }
      if (data.incomeCategories?.length > 0) {
        setIncomeCategories(data.incomeCategories)
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

  const handleAddExpense = async (category, amount, type = 'expense') => {
    const cleanCat = String(category || '').trim()
    setShowAddModal(false)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})

    // Caso 1: Ingreso (+)
    if (type === 'income') {
      const incCat = cleanCat || 'Euromar'
      const previousSummary = summary
      // Actualización optimista inmediata en UI
      setSummary((prev) => {
        const inc = (prev?.income || 0) + amount
        const fixed = prev?.fixedExpenses || 0
        const variable = prev?.variableExpenses || 0
        const savingsGoal = prev?.desiredSavings || 0
        const rem = inc - fixed - variable - savingsGoal
        return {
          ...prev,
          month: monthName,
          income: inc,
          remainingMonth: rem,
          savings: rem,
        }
      })

      const toastId = toast.loading(`Guardando ingreso "${incCat}" (${fmt(amount)})...`)
      try {
        const res = await apiAddIncome(monthName, incCat, amount)
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
        toast.success(`Ingreso "${incCat}" añadido a la columna de ingresos`, { id: toastId })
        if (res?.summary) {
          setSummary(res.summary)
        }
      } catch (err) {
        if (previousSummary) {
          setSummary(previousSummary)
        }
        toast.error('Error al guardar ingreso: ' + err.message, { id: toastId, duration: 4000 })
      }
      return
    }

    // Caso 2: Gasto variable (-)
    if (cleanCat) {
      setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    }

    // Actualización optimista de resumen en UI
    setSummary((prev) => {
      const fixed = prev?.fixedExpenses || 0
      const variable = (prev?.variableExpenses || 0) + amount
      const total = fixed + variable
      const inc = prev?.income || 0
      const savingsGoal = prev?.desiredSavings || 0
      const rem = inc - total - savingsGoal
      return {
        ...prev,
        month: monthName,
        variableExpenses: variable,
        totalExpenses: total,
        remainingMonth: rem,
        savings: rem,
      }
    })

    const expense = { id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`, month: monthName, category: cleanCat, amount }
    queueRef.current = [...queueRef.current, expense]
    setSendingExpenses([...queueRef.current])
    toast('Enviando gasto...', { icon: '📤', duration: 1500 })
    processQueue()
  }

  const processQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0]
      try {
        const res = await addExpenseDirect(item.month, item.category, item.amount)
        queueRef.current = queueRef.current.slice(1)
        setSendingExpenses([...queueRef.current])
        toast.success(`"${item.category}" añadido`)
        if (item.month === monthName) {
          if (res?.summary) setSummary(res.summary)
          if (res?.expenses) setExpenses(res.expenses)
        }
      } catch {
        addToPending(item.month, item.category, item.amount)
        queueRef.current = queueRef.current.slice(1)
        setSendingExpenses([...queueRef.current])
        setPendingCount(getPendingExpenses().length)
        toast.error(`Sin conexión — "${item.category}" guardado`)
      }
    }

    processingRef.current = false
  }

  const handleEditExpense = async (expense, newCategory, newAmount) => {
    setEditingExpense(null)
    const cleanCat = String(newCategory || '').trim()
    if (cleanCat) {
      setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    }
    const toastId = toast.loading('Actualizando gasto...')
    try {
      const res = await apiUpdateExpense(monthName, expense.row, expense.category, expense.amount, cleanCat, newAmount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success('Gasto actualizado', { id: toastId })
      if (res?.summary) setSummary(res.summary)
      if (res?.expenses) setExpenses(res.expenses)
      else loadData()
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
      const res = await apiDeleteExpense(monthName, expense.row, expense.category, expense.amount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success('Gasto eliminado', { id: toastId })
      if (res?.summary) setSummary(res.summary)
      if (res?.expenses) setExpenses(res.expenses)
      else loadData()
    } catch (err) {
      toast.error('Error eliminando: ' + err.message, { id: toastId })
    }
  }

  const handleSaveIncome = async (newAmount) => {
    const previousSummary = summary

    // Immediate Optimistic UI update
    setSummary((prev) => {
      const fixed = prev?.fixedExpenses || 0
      const variable = prev?.variableExpenses || 0
      const savingsGoal = prev?.desiredSavings || 0
      const rem = newAmount - fixed - variable - savingsGoal
      return {
        ...prev,
        month: monthName,
        income: newAmount,
        remainingMonth: rem,
        savings: rem,
      }
    })

    const toastId = toast.loading('Guardando ingresos en Sheets...')
    try {
      const res = await apiSetTotalIncome(monthName, newAmount)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success(`Ingresos de ${monthName} actualizados a ${fmt(newAmount)}`, { id: toastId })
      if (res?.summary) {
        setSummary(res.summary)
      }
    } catch (err) {
      if (previousSummary) {
        setSummary(previousSummary)
      }
      toast.error('Error actualizando ingresos: ' + err.message, { id: toastId, duration: 5000 })
    }
  }

  const handleSaveSavingsGoal = async (newGoal) => {
    const previousSummary = summary

    // Immediate Optimistic UI update
    setSummary((prev) => {
      const inc = prev?.income || 0
      const fixed = prev?.fixedExpenses || 0
      const variable = prev?.variableExpenses || 0
      const rem = inc - fixed - variable - newGoal
      return {
        ...prev,
        month: monthName,
        desiredSavings: newGoal,
        remainingMonth: rem,
        savings: rem,
      }
    })

    const toastId = toast.loading('Guardando meta de ahorro...')
    try {
      const res = await apiSetSavingsGoal(monthName, newGoal)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      toast.success(`Meta de ahorro de ${monthName} actualizada a ${fmt(newGoal)}`, { id: toastId })
      if (res?.summary) {
        setSummary(res.summary)
      }
    } catch (err) {
      if (previousSummary) {
        setSummary(previousSummary)
      }
      toast.error('Error actualizando meta: ' + err.message, { id: toastId, duration: 5000 })
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
        toast.info('Sincronizando con Google Sheets...')
      }
      setPendingCount(getPendingExpenses().length)
      await loadData(true)
    } catch (err) {
      toast.error('Error sincronizando: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleSetupSave = (url) => {
    const cleanUrl = normalizeScriptUrl(url)
    if (cleanUrl !== scriptUrl) clearAllCache()
    saveScriptUrl(cleanUrl)
    setScriptUrl(cleanUrl)
    setSpreadsheetUrl(getSpreadsheetUrl())
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

  const pendingForMonth = useMemo(() => {
    const list = getPendingForMonth(monthName)
    // Filtrar elementos pendientes que ya figuren en los gastos del servidor
    // para evitar que se visualicen duplicados
    return list.filter((pe) => {
      const peAmt = parseFloat(String(pe.amount).replace(',', '.')) || 0
      const peCat = String(pe.category || '').trim().toLowerCase()
      const alreadyInExpenses = expenses.some((e) => {
        const eAmt = parseFloat(String(e.amount).replace(',', '.')) || 0
        const eCat = String(e.category || '').trim().toLowerCase()
        return eCat === peCat && Math.abs(eAmt - peAmt) < 0.01
      })
      return !alreadyInExpenses
    })
  }, [monthName, pendingCount, expenses])
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
              whileHover={{ rotate: 4, scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              className="w-10 h-10 rounded-2xl overflow-hidden shadow-xs shadow-blue-500/20 shrink-0 border border-slate-200/80 bg-white"
            >
              <img
                src="/icon-192.png"
                alt="Control Gastos Logo"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                Control Gastos
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap">
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

                <AnimatePresence>
                  {isUsingCache && loading && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      title="Mostrando datos de la memoria caché mientras se sincroniza con Google Sheets"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-full shadow-2xs"
                    >
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600" />
                      <span>datos cacheados</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Spreadsheet Link Button (Flecha en diagonal arriba a la derecha) */}
            <motion.a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.88, rotate: 12 }}
              onClick={() => {
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
              }}
              aria-label="Abrir hoja de cálculo en Google Sheets"
              title="Abrir hoja de cálculo en Google Sheets"
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-emerald-700 transition-colors"
            >
              <ArrowUpRight className="h-4.5 w-4.5" />
            </motion.a>

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

            {/* Quick Debug Button (Only if DEBUG is enabled in settings) */}
            {debugActive && (
              <motion.button
                type="button"
                onClick={() => {
                  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                  setShowDebugModal(true)
                }}
                whileTap={{ scale: 0.88 }}
                aria-label="Ver registros de tareas (DEBUG)"
                title="Modo DEBUG activo: ver registro de tareas y errores"
                className="relative w-10 h-10 rounded-2xl bg-violet-50 border border-violet-200/80 shadow-xs hover:bg-violet-100 flex items-center justify-center text-violet-700 transition-colors"
              >
                <Bug className="h-4 w-4" />
                {debugErrorCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-pulse">
                    {debugErrorCount}
                  </span>
                ) : (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                )}
              </motion.button>
            )}

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
          onOpenCharts={() => setShowChartsModal(true)}
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
            incomeCategories={incomeCategories}
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

      {/* Charts / Panel de Control Modal */}
      <ChartsModal
        isOpen={showChartsModal}
        onClose={() => setShowChartsModal(false)}
      />

      {/* Debug Log Viewer Modal */}
      {showDebugModal && (
        <DebugLogViewer onClose={() => setShowDebugModal(false)} />
      )}

      <Toaster position="top-center" theme="light" richColors />
    </div>
  )
}

export default App
