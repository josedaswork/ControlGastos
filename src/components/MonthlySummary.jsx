import { fmt } from '@/lib/utils'
import { TrendingUp, Lock, ShoppingBag, Target, Wallet, Pencil, CheckSquare, BarChart3 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export default function MonthlySummary({
  summary,
  loading,
  onEditIncome,
  onEditSavingsGoal,
  onOpenFixedExpenses,
  onOpenCharts,
}) {
  const savingTarget = summary?.desiredSavings
  const remainingMonth =
    summary?.remainingMonth ??
    summary?.savings ??
    ((summary?.income ?? summary?.totalIncome ?? 0) - (summary?.fixedExpenses ?? summary?.fixed ?? 0) - (summary?.variableExpenses ?? summary?.variable ?? 0) - (savingTarget ?? 0))

  const totalSpent = (summary?.fixedExpenses ?? summary?.fixed ?? 0) + (summary?.variableExpenses ?? summary?.variable ?? 0)
  const income = summary?.income ?? summary?.totalIncome ?? 0
  const spendPercent = income > 0 ? Math.min(100, Math.round((totalSpent / income) * 100)) : 0
  const isPositive = remainingMonth >= 0

  const handleEditIncomeClick = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onEditIncome?.()
  }

  const handleEditSavingsGoalClick = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onEditSavingsGoal?.()
  }

  const handleOpenFixedExpensesClick = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onOpenFixedExpenses?.()
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Hero Remaining Card */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden transition-colors"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              Restante este mes
            </p>
            {loading && !summary ? (
              <div className="h-9 w-36 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse my-1" />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={remainingMonth}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-baseline gap-2"
                >
                  <h3 className={`text-2xl font-bold tracking-tight tabular-nums ${isPositive ? 'text-slate-900 dark:text-slate-100' : 'text-red-600 dark:text-rose-400'}`}>
                    {fmt(remainingMonth)}
                  </h3>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <motion.button
            type="button"
            layout
            key={isPositive ? 'positive' : 'deficit'}
            onClick={() => {
              Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
              onOpenCharts?.()
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            title="Haz clic para ver los gráficos del Panel de control"
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-2xs transition-all cursor-pointer ${
              isPositive
                ? 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/90 dark:border-emerald-800/70'
                : 'bg-red-50 dark:bg-rose-950/60 hover:bg-red-100 dark:hover:bg-rose-900/60 text-red-700 dark:text-rose-300 border-red-200/90 dark:border-rose-800/70'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 opacity-80" />
            <span>{isPositive ? 'En balance' : 'Déficit'}</span>
          </motion.button>
        </div>

        {/* Spend progress bar with fluid motion */}
        {income > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Gastos ({spendPercent}% del ingreso)</span>
              <span className="tabular-nums">{fmt(totalSpent)} / {fmt(income)}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${spendPercent}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                className={`h-full rounded-full ${
                  spendPercent > 90 ? 'bg-red-500' : spendPercent > 70 ? 'bg-amber-500' : 'bg-primary'
                }`}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* 2x2 Metric Breakdown Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Ingresos (Editable) */}
        <motion.button
          type="button"
          onClick={handleEditIncomeClick}
          whileTap={{ scale: 0.96 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          aria-label="Editar ingresos totales"
          className="bg-white dark:bg-slate-900 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/30 active:bg-emerald-50/40 dark:active:bg-emerald-950/50 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-200/80 dark:hover:border-emerald-800/70 shadow-xs flex flex-col justify-between select-none text-left transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1.5 w-full">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                Ingresos
              </span>
            </div>
            <div className="w-5 h-5 rounded-md text-slate-300 dark:text-slate-600 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center justify-center transition-colors">
              <Pencil className="w-3 h-3" />
            </div>
          </div>
          {loading && !summary ? (
            <div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmt(summary?.income)}
            </p>
          )}
        </motion.button>

        {/* Gastos Fijos (Clicable para ver y marcar casillas) */}
        <motion.button
          type="button"
          onClick={handleOpenFixedExpensesClick}
          whileTap={{ scale: 0.96 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          aria-label="Ver y marcar casillas de gastos fijos"
          className="bg-white dark:bg-slate-900 hover:bg-amber-50/20 dark:hover:bg-amber-950/30 active:bg-amber-50/40 dark:active:bg-amber-950/50 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 hover:border-amber-200/80 dark:hover:border-amber-800/70 shadow-xs flex flex-col justify-between select-none text-left transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1.5 w-full">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/70 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/70 text-amber-600 dark:text-amber-400 flex items-center justify-center transition-colors">
                <Lock className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                Gastos Fijos
              </span>
            </div>
            <div className="w-5 h-5 rounded-md text-slate-300 dark:text-slate-600 group-hover:text-amber-600 dark:group-hover:text-amber-400 flex items-center justify-center transition-colors">
              <CheckSquare className="w-3.5 h-3.5" />
            </div>
          </div>
          {loading && !summary ? (
            <div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums">
              {fmt(summary?.fixedExpenses ?? summary?.fixed ?? 0)}
            </p>
          )}
        </motion.button>

        {/* Gastos Variables */}
        <motion.div
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15 }}
          className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between select-none transition-colors"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Variables</span>
          </div>
          {loading && !summary ? (
            <div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {fmt(summary?.variableExpenses)}
            </p>
          )}
        </motion.div>

        {/* Meta Ahorro (Editable) */}
        <motion.button
          type="button"
          onClick={handleEditSavingsGoalClick}
          whileTap={{ scale: 0.96 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2 }}
          aria-label="Editar meta de ahorro"
          className="bg-white dark:bg-slate-900 hover:bg-blue-50/20 dark:hover:bg-blue-950/30 active:bg-blue-50/40 dark:active:bg-blue-950/50 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800 hover:border-blue-200/80 dark:hover:border-blue-800/70 shadow-xs flex flex-col justify-between select-none text-left transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1.5 w-full">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/70 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/70 text-blue-600 dark:text-blue-400 flex items-center justify-center transition-colors">
                <Target className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                Meta Ahorro
              </span>
            </div>
            <div className="w-5 h-5 rounded-md text-slate-300 dark:text-slate-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-center transition-colors">
              <Pencil className="w-3 h-3" />
            </div>
          </div>
          {loading && !summary ? (
            <div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-base font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {fmt(savingTarget)}
            </p>
          )}
        </motion.button>
      </div>
    </div>
  )
}
