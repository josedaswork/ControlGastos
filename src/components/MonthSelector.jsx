import { useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function MonthSelector({ selected, onChange }) {
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
    }
  }

  return (
    <div className="px-4 pb-3 space-y-2">
      {/* Quick Month Bar with Chevron Controls */}
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

        <div className="flex items-center gap-2 overflow-hidden h-7">
          <AnimatePresence mode="wait">
            <motion.span
              key={selected}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full"
            >
              {FULL[selected]}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs font-medium text-slate-400">2026</span>
        </div>

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

      {/* Touch Carousel Pills with Layout Animation */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-0.5 relative">
        {SHORT.map((m, i) => {
          const isActive = i === selected
          return (
            <motion.button
              key={m}
              ref={(el) => (itemRefs.current[i] = el)}
              onClick={() => handleSelect(i)}
              whileTap={{ scale: 0.92 }}
              className={`relative flex-shrink-0 min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors select-none ${
                isActive
                  ? 'text-white'
                  : 'bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeMonthIndicator"
                  className="absolute inset-0 bg-primary rounded-xl shadow-sm shadow-primary/30"
                  transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                />
              )}
              <span className="relative z-10">{m}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
