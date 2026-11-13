import { useState } from 'react'
import { Target, X, Check, Euro } from 'lucide-react'
import { motion } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function EditSavingsGoalModal({ month, currentGoal = 0, onSave, onClose }) {
  const [amount, setAmount] = useState(currentGoal > 0 ? String(currentGoal) : '')
  const [submitting, setSubmitting] = useState(false)

  const parsedAmount = parseFloat(amount.replace(',', '.'))
  const isValid = !isNaN(parsedAmount) && parsedAmount >= 0

  const handleQuickAdd = (extra) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const current = parseFloat(amount.replace(',', '.')) || 0
    setAmount((current + extra).toFixed(2).replace(/\.00$/, ''))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    setSubmitting(true)
    try {
      await onSave(parsedAmount)
      onClose()
    } finally {
      setSubmitting(false)
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
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/65 backdrop-blur-xs touch-none overscroll-none"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Sheet Content */}
      <motion.div
        initial={{ y: '100%', opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.9 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl p-5 pb-8 sm:p-6 space-y-5 overscroll-contain transition-colors"
      >
        {/* Handle bar for bottom sheet */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto sm:hidden -mt-1 mb-2" />

        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Target className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Meta de Ahorro</h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Mes de {month}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              Cantidad que vas a ahorrar (€)
            </label>
            <div className="relative">
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-14 pl-11 pr-4 text-xl font-bold bg-slate-50/70 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 rounded-2xl focus:bg-white dark:focus:bg-slate-950 text-slate-900 dark:text-slate-100 transition-all"
              />
              <Euro className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>

            {/* Quick Adjustment Chips */}
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto py-0.5 no-scrollbar">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap mr-0.5">
                Rápido:
              </span>
              {[25, 50, 100, 200].map((extra) => (
                <button
                  key={extra}
                  type="button"
                  onClick={() => handleQuickAdd(extra)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 transition-colors whitespace-nowrap active:scale-95"
                >
                  +{extra}€
                </button>
              ))}
              {amount && (
                <button
                  type="button"
                  onClick={() => setAmount('')}
                  className="text-xs font-semibold px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors active:scale-95"
                >
                  Borrar
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">
            Se registrará en la casilla de ahorro mensual de <strong className="text-slate-700 dark:text-slate-200">{month}</strong>. El dinero restante disponible se recalculará automáticamente.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 h-12 rounded-xl text-sm font-semibold border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 h-12 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 disabled:opacity-50"
            >
              {submitting ? (
                'Guardando...'
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Guardar Meta
                </span>
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
