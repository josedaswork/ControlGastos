import { useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { SHORT_MONTHS, MONTHS } from '@/lib/monthStatus'

export default function MonthSelector({
  selected,
  onChange,
  finalizedMonths = [],
  effectiveCurrentMonth = 0,
  onOpenFinalize,
}) {
  const itemRefs = useRef([])

  useEffect(() => {
    itemRefs.current[selected]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [selected])

  const handlePrev = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onChange((selected - 1 + 12) % 12)
  }

  const handleNext = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onChange((selected + 1) % 12)
  }

  const handleSelect = (idx) => {
    if (idx !== selected) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      onChange(idx)
    } else if (onOpenFinalize) {
      // Si ya está seleccionado y se vuelve a pulsar, abrir modal de finalizar mes
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      onOpenFinalize(idx)
    }
  }

  const isCurrentMonthFinalized = finalizedMonths.includes(selected)
  const isCurrentEffective = selected === effectiveCurrentMonth

  return (
    <div className="px-4 pb-3 space-y-2">
      {/* Quick Month Bar with Chevron Controls & Direct Finalize Trigger */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-1.5 border border-slate-200/80 shadow-xs">
        <motion.button
          type="button"
          onClick={handlePrev}
          aria-label="Mes anterior"
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>

        {/* Central interactive month badge */}
        <motion.button
          type="button"
          onClick={() => onOpenFinalize && onOpenFinalize(selected)}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
          title="Haz clic para ver el estado o finalizar este mes"
        >
          <div className="flex items-center gap-1.5">
            <AnimatePresence mode="wait">
              <motion.span
                key={selected}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="text-xs font-bold uppercase tracking-wider text-slate-900 group-hover:text-primary transition-colors"
              >
                {MONTHS[selected]}
              </motion.span>
            </AnimatePresence>
            <span className="text-xs font-medium text-slate-400">2026</span>
          </div>

          {/* Estado del mes: Finalizado o Botón para Finalizar */}
          {isCurrentMonthFinalized ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300/60 shadow-2xs">
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Finalizado</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 group-hover:bg-primary/10 group-hover:text-primary px-2 py-0.5 rounded-full transition-colors border border-slate-200/60">
              <CheckCircle2 className="w-3 h-3 text-slate-400 group-hover:text-primary" />
              <span>{isCurrentEffective ? 'Finalizar mes' : 'Marcar final'}</span>
            </span>
          )}
        </motion.button>

        <motion.button
          type="button"
          onClick={handleNext}
          aria-label="Mes siguiente"
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Touch Carousel Pills with Button on each month */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-0.5 relative">
        {SHORT_MONTHS.map((m, i) => {
          const isActive = i === selected
          const isFinalized = finalizedMonths.includes(i)
          const isEffective = i === effectiveCurrentMonth

          return (
            <div
              key={m}
              ref={(el) => (itemRefs.current[i] = el)}
              className="relative flex-shrink-0"
            >
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelect(i)
                  }
                }}
                whileTap={{ scale: 0.94 }}
                className={`relative min-h-[40px] pl-3 pr-2 py-1.5 rounded-xl text-xs font-semibold transition-colors select-none flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'text-white'
                    : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeMonthIndicator"
                    className="absolute inset-0 bg-primary rounded-xl shadow-sm shadow-primary/30 pointer-events-none"
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                  />
                )}

                <span className="relative z-10 font-bold">{m}</span>

                {/* Botón/Check individual por cada mes */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    if (onOpenFinalize) onOpenFinalize(i)
                  }}
                  title={
                    isFinalized
                      ? `Mes de ${MONTHS[i]} finalizado (haz clic para opciones)`
                      : `Finalizar mes de ${MONTHS[i]}`
                  }
                  className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isFinalized
                      ? isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : isActive
                      ? 'text-white/60 hover:text-white hover:bg-white/20'
                      : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isFinalized ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  ) : isEffective ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-200/60" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 opacity-60" />
                  )}
                </button>
              </motion.div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
