import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Toaster, toast } from 'sonner'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import {
  RefreshCw,
  Plus,
  Settings,
  WalletCards,
  AlertTriangle,
  ArrowUpRight,
  Bug,
  UploadCloud,
  Download,
  Sun,
  Moon,
} from 'lucide-react'
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
  syncPendingExpenses,
  getPendingForMonth,
  getPendingExpenses,
  clearAllCache,
  getCachedSummary,
  getCachedExpenses,
  getCachedFixedExpenses,
  getCachedCategories,
  getCachedIncomeCategories,
  normalizeScriptUrl,
  getPushQueue,
  subscribePushQueue,
  stageAddExpense,
  stageUpdateExpense,
  stageDeleteExpense,
  stageSetTotalIncome,
  stageSetSavingsGoal,
  stageSetMonthFinalized,
  getMonthFinalizedStatuses,
  stageAddIncome,
  recordCategoryUsage,
} from '@/lib/sheetsApi'
import {
  initSyncCoordinator,
  subscribeSyncState,
  getSyncSnapshot,
  startPushSync,
  startPullMonthSync,
  startFullSync,
  clearLastSyncNotice,
} from '@/lib/syncManager'
import { isNativeBackgroundSyncAvailable } from '@/lib/backgroundSyncPlugin'
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
import PushChangesModal from '@/components/PushChangesModal'
import {
  MONTHS,
  getFinalizedMonths,
  setMonthFinalized,
  getEffectiveCurrentMonth,
} from '@/lib/monthStatus'
import { useTheme } from '@/lib/theme'

function App() {
  const { isDark, toggleTheme } = useTheme()
  const [scriptUrl, setScriptUrl] = useState(getScriptUrl())
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(() => getSpreadsheetUrl())
  const [showSetup, setShowSetup] = useState(!scriptUrl)
  const [finalizedMonths, setFinalizedMonths] = useState(() => getFinalizedMonths())
  const [effectiveCurrentMonth, setEffectiveCurrentMonth] = useState(() => getEffectiveCurrentMonth())
  const [selectedMonth, setSelectedMonth] = useState(() => getEffectiveCurrentMonth())
  const [finalizeModalMonth, setFinalizeModalMonth] = useState(null)
  const [summary, setSummary] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState(() => getCachedCategories().categories)
  const [incomeCategories, setIncomeCategories] = useState(() => getCachedCategories().incomeCategories)
  const [loading, setLoading] = useState(false)
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showSavingsGoalModal, setShowSavingsGoalModal] = useState(false)
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false)
  const [showChartsModal, setShowChartsModal] = useState(false)
  const [showPushModal, setShowPushModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(null)
  const [pushQueue, setPushQueue] = useState(() => getPushQueue())
  const [syncSnap, setSyncSnap] = useState(() => getSyncSnapshot())
  const [pendingCount, setPendingCount] = useState(getPendingExpenses().length)
  const [syncing, setSyncing] = useState(false)
  const [sendingExpenses, setSendingExpenses] = useState([])
  const [debugActive, setDebugActive] = useState(() => isDebugEnabled())
  const [debugErrorCount, setDebugErrorCount] = useState(0)
  const [showDebugModal, setShowDebugModal] = useState(false)
  const queueRef = useRef([])
  const processingRef = useRef(false)
  const loadIdRef = useRef(0)
  const initialFinalizedSyncRef = useRef(null)
  const monthNameRef = useRef(MONTHS[selectedMonth])

  const pulling = Boolean(syncSnap.isPulling)
  const quickPushing = Boolean(syncSnap.isPushing)

  const isAnyModalOpen = Boolean(
    showAddModal ||
    editingExpense ||
    showIncomeModal ||
    showSavingsGoalModal ||
    showFixedExpensesModal ||
    finalizeModalMonth !== null ||
    deletingExpense ||
    showChartsModal ||
    showPushModal ||
    showDebugModal
  )

  useEffect(() => {
    if (isAnyModalOpen) {
      const originalBodyOverflow = document.body.style.overflow
      const originalHtmlOverflow = document.documentElement.style.overflow
      const originalBodyOverscroll = document.body.style.overscrollBehavior
      const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior

      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overscrollBehavior = 'none'
      document.documentElement.style.overscrollBehavior = 'none'

      return () => {
        document.body.style.overflow = originalBodyOverflow
        document.documentElement.style.overflow = originalHtmlOverflow
        document.body.style.overscrollBehavior = originalBodyOverscroll
        document.documentElement.style.overscrollBehavior = originalHtmlOverscroll
      }
    }
  }, [isAnyModalOpen])

  useEffect(() => {
    const unsub = subscribePushQueue((q) => {
      setPushQueue(q)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribeSyncState((snap) => {
      setSyncSnap(snap)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const cleanup = initSyncCoordinator({
      onDataChanged: () => {
        const activeMonth = monthNameRef.current
        const freshSummary = getCachedSummary(activeMonth)
        const freshExpenses = getCachedExpenses(activeMonth)
        const freshCategories = getCachedCategories()
        if (freshSummary) setSummary(freshSummary)
        if (freshExpenses?.expenses) setExpenses(freshExpenses.expenses)
        if (freshCategories?.categories?.length > 0) setCategories(freshCategories.categories)
        if (freshCategories?.incomeCategories?.length > 0) setIncomeCategories(freshCategories.incomeCategories)
        setFinalizedMonths(getFinalizedMonths())
        setEffectiveCurrentMonth(getEffectiveCurrentMonth())
        setIsUsingCache(false)
      },
    })
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeLogs((currentLogs) => {
      setDebugActive(isDebugEnabled())
      const errs = currentLogs.filter((l) => l.status === 'error').length
      setDebugErrorCount(errs)
    })
    return () => unsub()
  }, [])

  const monthName = MONTHS[selectedMonth]
  monthNameRef.current = monthName

  const applyDownloadedMonthStatus = (monthData) => {
    if (!monthData || typeof monthData.monthFinalized !== 'boolean') return
    const monthIndex = MONTHS.indexOf(monthData.month || monthName)
    if (monthIndex < 0) return
    setFinalizedMonths(setMonthFinalized(monthIndex, monthData.monthFinalized))
    setEffectiveCurrentMonth(getEffectiveCurrentMonth())
  }

  const loadAllFinalizedMonthsFromSheets = async () => {
    const statuses = await getMonthFinalizedStatuses()
    let updated = getFinalizedMonths()
    Object.entries(statuses).forEach(([month, finalized]) => {
      const index = MONTHS.indexOf(month)
      if (index >= 0) updated = setMonthFinalized(index, Boolean(finalized))
    })
    setFinalizedMonths(updated)
    setEffectiveCurrentMonth(getEffectiveCurrentMonth())
  }

  const loadData = useCallback(async (force = false) => {
    if (!scriptUrl) return

    if (initialFinalizedSyncRef.current) {
      await initialFinalizedSyncRef.current
      initialFinalizedSyncRef.current = null
    }

    const currentLoadId = ++loadIdRef.current

    // Cargar datos locales de inmediato (0ms)
    let cachedSummary = getCachedSummary(monthName)
    const cachedExpenses = getCachedExpenses(monthName)
    const cachedFixed = getCachedFixedExpenses(monthName)
    const hasCache = !!(cachedSummary || (cachedExpenses?.expenses && cachedExpenses.expenses.length > 0) || (cachedFixed?.fixedExpenses && cachedFixed.fixedExpenses.length > 0))

    if (cachedSummary) {
      // Sincronizar gastos fijos si en la caché de fijos tenemos casillas activas
      const fixedTot = cachedFixed?.totalActive ?? 0
      const currentFixedInSummary = cachedSummary.fixedExpenses ?? cachedSummary.fixed ?? 0
      if (fixedTot > 0 && currentFixedInSummary === 0) {
        const varExp = cachedSummary.variableExpenses || 0
        const inc = cachedSummary.income || 0
        const sav = cachedSummary.desiredSavings || 0
        const newTotal = Math.round((fixedTot + varExp) * 100) / 100
        const newRem = Math.round((inc - newTotal - sav) * 100) / 100
        cachedSummary = {
          ...cachedSummary,
          fixedExpenses: fixedTot,
          totalExpenses: newTotal,
          remainingMonth: newRem,
          savings: newRem,
        }
      }
      setSummary(cachedSummary)
    } else {
      const fixedTot = cachedFixed?.totalActive || 0
      setSummary({
        month: monthName,
        income: 0,
        fixedExpenses: fixedTot,
        variableExpenses: 0,
        desiredSavings: 0,
        totalExpenses: fixedTot,
        remainingMonth: -fixedTot,
        savings: -fixedTot,
      })
    }

    if (cachedExpenses?.expenses) {
      setExpenses(cachedExpenses.expenses)
    } else {
      setExpenses([])
    }

    setIsUsingCache(hasCache)

    // Las categorías se refrescan aunque el mes ya tenga caché.
    // Así no se mezclan listas antiguas ni se pierden categorías nuevas.
    if (hasCache) {
      fetchCategories().then((data) => {
        if (data?.categories?.length > 0) setCategories(data.categories)
        if (data?.incomeCategories?.length > 0) setIncomeCategories(data.incomeCategories)
      }).catch((err) => console.warn('Error actualizando categorías:', err.message))
    }

    // Si ya tenemos datos en local y no es un force explícito, no bloqueamos la UI con peticiones de red
    if (hasCache && !force) {
      setLoading(false)
      return
    }

    // Solo si no hay datos en caché, cargamos el mes actual y las categorías.
    setLoading(true)
    try {
      const [monthResult, categoriesResult] = await Promise.allSettled([
        startPullMonthSync(monthName, { preserveLocalQueue: true, silent: true }),
        fetchCategories(),
      ])
      if (currentLoadId !== loadIdRef.current) return

      const freshSummary = getCachedSummary(monthName)
      const freshExpenses = getCachedExpenses(monthName)
      if (monthResult.status === 'fulfilled') applyDownloadedMonthStatus(monthResult.value?.monthData || monthResult.value)
      if (freshSummary) setSummary(freshSummary)
      if (freshExpenses?.expenses) setExpenses(freshExpenses.expenses)
      if (categoriesResult.status === 'fulfilled') {
        const freshCategories = categoriesResult.value
        if (freshCategories?.categories?.length > 0) setCategories(freshCategories.categories)
        if (freshCategories?.incomeCategories?.length > 0) setIncomeCategories(freshCategories.incomeCategories)
      }
      if (monthResult.status === 'rejected') throw monthResult.reason
      setIsUsingCache(false)
    } catch (err) {
      if (currentLoadId !== loadIdRef.current) return
      console.warn('Carga inicial de mes:', err.message)
    } finally {
      if (currentLoadId === loadIdRef.current) setLoading(false)
    }
  }, [scriptUrl, monthName])

  const handleFullSync = async (targetUrl = null) => {
    if (syncSnap.isSyncing) return
    const effectiveUrl = targetUrl || scriptUrl
    if (!effectiveUrl) return

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const toastId = toast.loading(`Descargando TODO desde Excel (${monthName}, meses colindantes, casillas y Panel de Control)...`)
    try {
      const syncResult = await startFullSync(monthName, { toastId, preserveLocalQueue: true })
      applyDownloadedMonthStatus(syncResult?.monthData)
      const freshSummary = getCachedSummary(monthName)
      const freshExpenses = getCachedExpenses(monthName)
      if (freshSummary) setSummary(freshSummary)
      if (freshExpenses?.expenses) setExpenses(freshExpenses.expenses)
      setIsUsingCache(false)
      const cachedCategories = getCachedCategories()
      if (cachedCategories?.categories?.length > 0) setCategories(cachedCategories.categories)
      if (cachedCategories?.incomeCategories?.length > 0) setIncomeCategories(cachedCategories.incomeCategories)
      Haptics.notification({ type: 'success' }).catch(() => {})
      if (syncResult?.mode !== 'native') {
        if (syncResult?.partial) {
          toast.warning(
            `Descarga parcial: ${monthName} actualizado, pero fallaron ${syncResult.failedParts?.length || 1} parte(s).`,
            { id: toastId, duration: 5500 }
          )
        } else {
          toast.success(`¡Descargado TODO con éxito! (${monthName}, meses colindantes, casillas y Panel de Control)`, { id: toastId })
        }
      }
    } catch (err) {
      if (!isNativeBackgroundSyncAvailable()) {
        toast.error('Error al descargar del Excel: ' + err.message, { id: toastId })
      }
    }
  }

  const handlePullMonthData = async (forceBypass = false) => {
    if (syncSnap.isSyncing || !scriptUrl) return
    const pendingInThisMonth = pushQueue.filter((t) => t.month === monthName)
    if (!forceBypass && pendingInThisMonth.length > 0) {
      const confirmed = window.confirm(
        `Tienes ${pendingInThisMonth.length} cambio(s) pendiente(s) de subir en ${monthName}.\n\nAl descargar se actualizará con los datos de Google Sheets manteniendo encima tus cambios locales pendientes de Push.\n\n¿Deseas descargar ahora?`
      )
      if (!confirmed) return
    }

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const toastId = toast.loading(`Descargando ${monthName} desde Excel...`)
    try {
      const result = await startPullMonthSync(monthName, { toastId, preserveLocalQueue: true })
      applyDownloadedMonthStatus(result?.monthData || result)
      const freshSummary = result?.summary || getCachedSummary(monthName)
      const freshExpenses = result?.expenses || getCachedExpenses(monthName)?.expenses
      if (freshSummary) setSummary(freshSummary)
      if (freshExpenses) setExpenses(freshExpenses)
      setIsUsingCache(false)
      if (result?.mode !== 'native') {
        toast.success(`¡${monthName} descargado correctamente!`, { id: toastId })
      }
    } catch (err) {
      if (!isNativeBackgroundSyncAvailable()) {
        toast.error('Error al descargar del Excel: ' + err.message, { id: toastId })
      }
    }
  }

  const handleQuickPush = async () => {
    if (syncSnap.isSyncing || pushQueue.length === 0) return
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
    const toastId = toast.loading(`Subiendo ${pushQueue.length} cambio(s) a Google Sheets...`)
    try {
      const res = await startPushSync({ toastId })
      Haptics.notification({ type: 'success' }).catch(() => {})
      if (res?.mode !== 'native') {
        toast.success(`¡${res.count} cambio(s) subidos a Excel con éxito!`, { id: toastId })
      }
      loadData(false)
    } catch (err) {
      Haptics.notification({ type: 'error' }).catch(() => {})
      if (!isNativeBackgroundSyncAvailable()) {
        toast.error('Error al subir cambios: ' + err.message, { id: toastId, duration: 6000 })
      }
    }
  }

  const loadCategories = useCallback(async () => {
    if (!scriptUrl) return

    // Show cached categories instantly (or fallback), then refresh in background.
    const cachedCategories = getCachedCategories()
    if (cachedCategories?.categories?.length > 0) setCategories(cachedCategories.categories)
    if (cachedCategories?.incomeCategories?.length > 0) setIncomeCategories(cachedCategories.incomeCategories)

    try {
      const data = await fetchCategories()
      if (data?.categories?.length > 0) setCategories(data.categories)
      if (data?.incomeCategories?.length > 0) setIncomeCategories(data.incomeCategories)
    } catch (err) {
      console.warn('Error refrescando categorías en background:', err.message)
    }
  }, [scriptUrl])

  useEffect(() => { loadData() }, [loadData])

  const handleOpenAddModal = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setShowAddModal(true)
    if (categories.length === 0) loadCategories()
  }

  const handleAddExpense = (category, amount, type = 'expense') => {
    const cleanCat = String(category || '').trim()
    const numAmount = parseFloat(String(amount).replace(',', '.'))
    if (!cleanCat || isNaN(numAmount) || numAmount <= 0) return

    setShowAddModal(false)
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})

    if (type === 'income') {
      const incCat = cleanCat || 'Euromar'
      recordCategoryUsage(incCat, 'income')
      const res = stageAddIncome(monthName, incCat, numAmount)
      if (res?.summary) setSummary(res.summary)
      toast.success(`Ingreso "${incCat}" guardado en local (pendiente de Push)`)
      return
    }

    recordCategoryUsage(cleanCat, 'expense')
    const res = stageAddExpense(monthName, cleanCat, numAmount)
    if (res?.summary) setSummary(res.summary)
    if (res?.expenses) setExpenses(res.expenses)
    setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    toast.success(`"${cleanCat}" guardado en local (pendiente de Push)`)
  }

  const handleEditExpense = (expense, newCategory, newAmount) => {
    setEditingExpense(null)
    const cleanCat = String(newCategory || '').trim()
    const numAmount = parseFloat(String(newAmount).replace(',', '.'))
    if (!cleanCat || isNaN(numAmount) || numAmount <= 0) return

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    recordCategoryUsage(cleanCat, 'expense')
    const res = stageUpdateExpense(monthName, expense.row, expense.category, expense.amount, cleanCat, numAmount)
    if (res?.summary) setSummary(res.summary)
    if (res?.expenses) setExpenses(res.expenses)
    setCategories((prev) => (prev.includes(cleanCat) ? prev : [...prev, cleanCat]))
    toast.success('Gasto modificado en local (pendiente de Push)')
  }

  const handleDeleteExpense = (expense) => {
    setDeletingExpense(expense)
  }

  const confirmDeleteExpense = () => {
    const expense = deletingExpense
    if (!expense) return
    setDeletingExpense(null)

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    const res = stageDeleteExpense(monthName, expense.row, expense.category, expense.amount)
    if (res?.summary) setSummary(res.summary)
    if (res?.expenses) setExpenses(res.expenses)
    toast.success('Gasto eliminado en local (pendiente de Push)')
  }

  const handleSaveIncome = (newAmount) => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    const res = stageSetTotalIncome(monthName, newAmount)
    if (res?.summary) setSummary(res.summary)
    toast.success(`Ingresos guardados en local (${fmt(newAmount)}, pendiente de Push)`)
  }

  const handleSaveSavingsGoal = (newGoal) => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    const res = stageSetSavingsGoal(monthName, newGoal)
    if (res?.summary) setSummary(res.summary)
    toast.success(`Meta de ahorro guardada en local (${fmt(newGoal)}, pendiente de Push)`)
  }

  const handleFixedExpensesUpdate = (newFixedTotal, updatedSummary) => {
    if (updatedSummary) {
      setSummary(updatedSummary)
    } else if (newFixedTotal !== undefined && !isNaN(newFixedTotal)) {
      setSummary((prev) => {
        if (!prev) return prev
        const prevFixed = prev.fixedExpenses ?? prev.fixed ?? 0
        const diff = newFixedTotal - prevFixed
        const prevRemaining = prev.remainingMonth ?? prev.savings ?? 0
        return {
          ...prev,
          fixedExpenses: newFixedTotal,
          remainingMonth: prevRemaining - diff,
          savings: prevRemaining - diff,
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

    // Leer primero los estados FINALIZADO de todos los meses y después sincronizar.
    initialFinalizedSyncRef.current = loadAllFinalizedMonthsFromSheets().catch((err) => {
      console.warn('No se pudieron leer los estados FINALIZADO:', err.message)
    })
    setTimeout(async () => {
      await initialFinalizedSyncRef.current
      handleFullSync(cleanUrl)
    }, 150)
  }

  const handleToggleFinalizeMonth = (monthIdx, shouldFinalize) => {
    const updated = setMonthFinalized(monthIdx, shouldFinalize)
    setFinalizedMonths(updated)
    const newEffective = getEffectiveCurrentMonth()
    setEffectiveCurrentMonth(newEffective)

    stageSetMonthFinalized(MONTHS[monthIdx], shouldFinalize)

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
        <Toaster position="top-center" theme={isDark ? 'dark' : 'light'} richColors />
      </>
    )
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 sm:bg-slate-100 sm:dark:bg-slate-950 flex justify-center transition-colors">
      {/* Google Pixel 10 Phone Frame Container */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 dark:bg-slate-950 sm:dark:border-x sm:dark:border-slate-800/70 flex flex-col relative overflow-x-hidden shadow-sm transition-colors">
        {/* Top App Bar con margen superior para no solaparse con la hora y barra de notificaciones */}
        <header
          className="px-4 pb-2 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950 shrink-0 transition-colors"
          style={{
            paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 10px), 36px)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <motion.div
              whileHover={{ rotate: 4, scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl overflow-hidden shadow-xs shadow-blue-500/20 shrink-0 border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <img
                src="/icon-192.png"
                alt="Control Gastos Logo"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 leading-tight truncate">
                Control Gastos
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFinalizeModalMonth(selectedMonth)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors group cursor-pointer"
                  title="Haz clic para ver opciones o finalizar este mes"
                >
                  <span>{monthName} 2026</span>
                  {finalizedMonths.includes(selectedMonth) ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.2 rounded-full border border-emerald-300 dark:border-emerald-800/70">
                      ✓ Finalizado
                    </span>
                  ) : selectedMonth === effectiveCurrentMonth ? (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 dark:bg-primary/20 px-1.5 py-0.2 rounded-full">
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
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200/90 dark:border-amber-800/70 px-2 py-0.5 rounded-full shadow-2xs"
                    >
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-600 dark:text-amber-400" />
                      <span>datos cacheados</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Push Changes Button */}
            <motion.button
              type="button"
              onClick={() => {
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                setShowPushModal(true)
              }}
              whileTap={{ scale: 0.88 }}
              aria-label="Ver paquete de cambios pendientes (Push)"
              title={
                pushQueue.length > 0
                  ? `${pushQueue.length} cambio(s) pendiente(s) de subir al Excel (Push)`
                  : 'Cola de Push: Sin cambios pendientes'
              }
              className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border shadow-xs flex items-center justify-center transition-all ${
                pushQueue.length > 0
                  ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/25 ring-2 ring-blue-400/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <UploadCloud className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${quickPushing ? 'animate-bounce' : ''}`} />
              {pushQueue.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 0.3 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs ring-2 ring-white dark:ring-slate-950"
                >
                  {pushQueue.length}
                </motion.span>
              )}
            </motion.button>

            {/* Pull Button (Descargar TODO de Google Sheets bajo petición) */}
            <motion.button
              type="button"
              onClick={() => handlePullMonthData(false)}
              disabled={loading || pulling || quickPushing}
              whileTap={{ scale: 0.88 }}
              aria-label="Descargar datos del Excel"
              title={`Descargar ${monthName} desde Excel`}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
            >
              <Download className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${pulling ? 'animate-bounce text-primary' : ''}`} />
            </motion.button>

            {/* Spreadsheet Link Button */}
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
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </motion.a>

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
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200/80 dark:border-violet-800/70 shadow-xs hover:bg-violet-100 dark:hover:bg-violet-900/60 flex items-center justify-center text-violet-700 dark:text-violet-300 transition-colors"
              >
                <Bug className="h-4 w-4" />
                {debugErrorCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-pulse">
                    {debugErrorCount}
                  </span>
                ) : (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
                )}
              </motion.button>
            )}

            {/* Theme Toggle Button */}
            <motion.button
              type="button"
              onClick={() => {
                Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                toggleTheme()
              }}
              whileTap={{ scale: 0.88, rotate: isDark ? 20 : -20 }}
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-amber-300 transition-colors"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
            >
              <Settings className="h-4 w-4" />
            </motion.button>
          </div>
        </header>

        {/* Banner de estado/recuperación de sincronización en segundo plano */}
        <AnimatePresence>
          {(syncSnap.activeSync || (syncSnap.lastNotice && (syncSnap.lastNotice.level === 'warning' || syncSnap.lastNotice.level === 'error'))) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-2 shrink-0"
            >
              {syncSnap.activeSync ? (
                <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/70 flex items-center gap-2.5 text-xs text-blue-800 dark:text-blue-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {syncSnap.activeSync.progressMessage || 'Sincronizando con Google Sheets…'}
                    </p>
                    {syncSnap.activeSync.progressTotal > 0 && (
                      <div className="w-full h-1 bg-blue-200/70 dark:bg-blue-900/70 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(12, Math.min(100, ((syncSnap.activeSync.progressCurrent || 0) / syncSnap.activeSync.progressTotal) * 100))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 flex items-start justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{syncSnap.lastNotice.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearLastSyncNotice}
                    className="text-[11px] font-bold text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/50 shrink-0"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Gastos Variables
            </h2>
            {summary?.variableExpenses > 0 && (
              <motion.span
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-800/60"
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

        {/* Floating / Sticky Push Changes Action Bar */}
        <AnimatePresence>
          {pushQueue.length > 0 && (
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed bottom-6 left-4 right-22 max-w-sm z-40"
            >
              <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl p-2 pl-3 pr-2 shadow-xl shadow-slate-900/30 dark:shadow-black/50 border border-slate-700/80 dark:border-slate-600/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setShowPushModal(true)
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-400/30">
                    <UploadCloud className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors truncate">
                      {pushQueue.length} {pushQueue.length === 1 ? 'cambio' : 'cambios'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      Toca para ver
                    </p>
                  </div>
                </button>

                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button
                    size="sm"
                    onClick={handleQuickPush}
                    disabled={quickPushing || pulling}
                    className="h-7.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-2.5 shadow-xs border border-blue-400/30 flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                  >
                    <UploadCloud className={`w-3 h-3 ${quickPushing ? 'animate-bounce' : ''}`} />
                    <span>{quickPushing ? 'Subiendo...' : 'Push'}</span>
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            onCategoriesUpdated={(fresh) => {
              if (fresh?.categories) setCategories(fresh.categories)
              if (fresh?.incomeCategories) setIncomeCategories(fresh.incomeCategories)
            }}
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
            onCategoriesUpdated={(fresh) => {
              if (fresh?.categories) setCategories(fresh.categories)
              if (fresh?.incomeCategories) setIncomeCategories(fresh.incomeCategories)
            }}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overscroll-contain"
            onClick={() => setDeletingExpense(null)}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 dark:bg-black/65 backdrop-blur-xs touch-none overscroll-none"
              onTouchMove={(e) => e.preventDefault()}
            />

            {/* Dialog Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200/80 dark:border-slate-800 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-3">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
                ¿Eliminar este gasto?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                Se eliminará <span className="font-bold text-slate-800 dark:text-slate-200">{deletingExpense.category}</span> por un importe de <span className="font-bold text-slate-900 dark:text-slate-100">{fmt(deletingExpense.amount)}</span> de tu Google Spreadsheet.
              </p>
              <div className="flex gap-2.5 justify-end">
                <motion.div whileTap={{ scale: 0.93 }}>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/60"
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

      {/* Push Changes Batch Modal */}
      <AnimatePresence>
        {showPushModal && (
          <PushChangesModal
            isOpen={showPushModal}
            onClose={() => setShowPushModal(false)}
            queue={pushQueue}
            onPushed={() => loadData(false)}
          />
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

      <Toaster position="top-center" theme={isDark ? 'dark' : 'light'} richColors />
    </div>
  )
}

export default App
