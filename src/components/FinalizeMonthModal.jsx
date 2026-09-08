import { CalendarCheck, CheckCircle2, RotateCcw, ArrowRight, X, Sparkles, Check } from 'lucide-react'
import { motion } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Button } from '@/components/ui/button'
import { MONTHS } from '@/lib/monthStatus'

export default function FinalizeMonthModal({
  monthIndex,
  isFinalized,
  isCurrentInCourse,
  onToggleFinalize,
  onSelectMonth,
  onClose,
}) {
  const monthName = MONTHS[monthIndex]
  const nextMonthIndex = (monthIndex + 1) % 12
  const nextMonthName = MONTHS[nextMonthIndex]

  const handleFinalize = () => {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    onToggleFinalize(monthIndex, true)
    onClose()
  }

  const handleReopen = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onToggleFinalize(monthIndex, false)
    onClose()
  }

  const handleGoToNext = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onSelectMonth(nextMonthIndex)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <motion.div
        initial={{ y: '100%', opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.9 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-5 pb-8 sm:p-6 space-y-5"
      >
        {/* Handle bar for mobile sheet */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto sm:hidden -mt-1 mb-2" />

        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isFinalized
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {isFinalized ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <CalendarCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {isFinalized ? 'Mes Finalizado' : 'Finalizar Mes'}
              </h3>
              <p className="text-xs text-slate-500">
                {monthName} 2026
                {isCurrentInCourse && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                    Mes en curso
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Card & Explanation */}
        {!isFinalized ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Cierre de mes anticipado
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Has cobrado tu nómina antes de tiempo o ya quieres dar por cerrado este mes?
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Al marcar <strong className="text-slate-900">{monthName}</strong> como finalizado, la aplicación detectará automáticamente que el mes en curso es{' '}
                <strong className="text-primary">{nextMonthName}</strong> y pasará a él para que empieces a registrar tus movimientos.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-2.5">
              <RotateCcw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-snug">
                <strong>Acción 100% reversible:</strong> Puedes desmarcar o reabrir este mes en cualquier momento haciendo clic de nuevo sobre él.
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="button"
                onClick={handleFinalize}
                className="w-full h-12 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Finalizar {monthName} y pasar a {nextMonthName}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="w-full h-10 rounded-xl text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Mes marcado como finalizado
                </span>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed">
                El mes de <strong>{monthName}</strong> está completado. La aplicación considera que el mes en curso activo es <strong>{nextMonthName}</strong>.
              </p>
            </div>

            {/* Reversible Action */}
            <div className="pt-2 flex flex-col gap-2.5">
              <Button
                type="button"
                onClick={handleReopen}
                variant="outline"
                className="w-full h-12 rounded-xl text-sm font-semibold border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span>Reabrir mes (Desmarcar finalizado)</span>
              </Button>

              <Button
                type="button"
                onClick={handleGoToNext}
                className="w-full h-11 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-2"
              >
                <span>Ir al siguiente mes ({nextMonthName})</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
