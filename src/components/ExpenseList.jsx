import { useState, useRef, useCallback } from 'react'
import { ArrowUpDown, Trash2, Clock, Send, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { fmt } from '@/lib/utils'

const THEME_PALETTES = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200/60' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200/60' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200/60' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200/60' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200/60' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200/60' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200/60' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200/60' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200/60' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200/60' },
]

function getCategoryColor(str = '') {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return THEME_PALETTES[Math.abs(h) % THEME_PALETTES.length]
}

export default function ExpenseList({ expenses, loading, pending = [], sending = [], onEdit, onDelete }) {
  const [reversed, setReversed] = useState(true)

  const handleToggleOrder = () => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setReversed((r) => !r)
  }

  if (loading && expenses.length === 0 && pending.length === 0 && sending.length === 0) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-3.5 flex items-center gap-3 border border-slate-200/80 shadow-xs">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (expenses.length === 0 && pending.length === 0 && sending.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-xs my-2"
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 mx-auto flex items-center justify-center text-xl mb-3">
          🧾
        </div>
        <p className="text-sm font-semibold text-slate-800">No hay gastos variables este mes</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
          Toca el botón + para registrar compras del supermercado, ocio, transporte o cualquier gasto.
        </p>
      </motion.div>
    )
  }

  const displayExpenses = reversed ? [...expenses].reverse() : expenses

  return (
    <div className="space-y-2.5">
      {expenses.length > 1 && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-slate-500">
            {expenses.length} {expenses.length === 1 ? 'registro' : 'registros'}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={handleToggleOrder}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-xs transition-colors"
          >
            <ArrowUpDown className="h-3 w-3 text-primary" />
            {reversed ? 'Recientes primero' : 'Antiguos primero'}
          </motion.button>
        </div>
      )}

      {/* Sending queue items */}
      <AnimatePresence initial={false}>
        {sending.map((exp) => {
          const color = getCategoryColor(exp.category)
          return (
            <motion.div
              key={exp.id}
              layout
              initial={{ opacity: 0, y: -15, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="bg-white/90 rounded-2xl p-3.5 flex items-center gap-3 border border-dashed border-primary/50 shadow-xs"
            >
              <div
                className={`w-11 h-11 rounded-2xl ${color.bg} ${color.text} flex items-center justify-center font-bold text-sm border ${color.border}`}
              >
                {exp.category.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {exp.category}
                </p>
                <p className="text-[11px] text-primary font-medium flex items-center gap-1 mt-0.5 animate-pulse">
                  <Send className="w-3 h-3" />
                  Enviando a Sheets...
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900 whitespace-nowrap">
                {fmt(exp.amount)}
              </p>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Pending offline items */}
      <AnimatePresence initial={false}>
        {pending.map((exp) => {
          const color = getCategoryColor(exp.category)
          return (
            <motion.div
              key={exp.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-amber-50/40 rounded-2xl p-3.5 flex items-center gap-3 border border-dashed border-amber-300 shadow-xs"
            >
              <div
                className={`w-11 h-11 rounded-2xl ${color.bg} ${color.text} flex items-center justify-center font-bold text-sm border ${color.border}`}
              >
                {exp.category.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {exp.category}
                </p>
                <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  Pendiente de sync
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900 whitespace-nowrap">
                {fmt(exp.amount)}
              </p>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Regular expense rows with spring layout reordering and entry animations */}
      <AnimatePresence initial={false}>
        {displayExpenses.map((exp) => (
          <motion.div
            key={exp.row ?? `${exp.category}-${exp.amount}`}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, x: -80, transition: { duration: 0.22 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <SwipeableRow
              expense={exp}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function SwipeableRow({ expense, onEdit, onDelete }) {
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const rowRef = useRef(null)
  const [swiped, setSwiped] = useState(false)
  const swipingRef = useRef(false)

  const THRESHOLD = 75
  const color = getCategoryColor(expense.category)

  const handleTouchStart = useCallback((e) => {
    startXRef.current = e.touches[0].clientX
    currentXRef.current = 0
    swipingRef.current = false
  }, [])

  const handleTouchMove = useCallback((e) => {
    const diff = startXRef.current - e.touches[0].clientX
    currentXRef.current = diff
    if (diff > 10) swipingRef.current = true
    const translateX = Math.max(-THRESHOLD, Math.min(0, -diff))
    if (rowRef.current) {
      rowRef.current.style.transform = `translateX(${translateX}px)`
      rowRef.current.style.transition = 'none'
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!rowRef.current) return
    rowRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
    if (currentXRef.current >= THRESHOLD / 2) {
      rowRef.current.style.transform = `translateX(-${THRESHOLD}px)`
      setSwiped(true)
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    } else {
      rowRef.current.style.transform = 'translateX(0)'
      setSwiped(false)
    }
  }, [])

  const handleClick = useCallback(() => {
    if (swipingRef.current) return
    if (swiped) {
      if (rowRef.current) {
        rowRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        rowRef.current.style.transform = 'translateX(0)'
      }
      setSwiped(false)
      return
    }
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    onEdit?.(expense)
  }, [swiped, onEdit, expense])

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    onDelete?.(expense)
  }, [onDelete, expense])

  return (
    <div className="relative overflow-hidden rounded-2xl group shadow-xs">
      {/* Delete button behind row */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end z-0 w-full bg-red-50 rounded-2xl">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          className="h-full w-[75px] bg-red-500 hover:bg-red-600 active:bg-red-700 flex flex-col items-center justify-center text-white transition-colors select-none"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-[10px] font-bold mt-1">Borrar</span>
        </motion.button>
      </div>

      {/* Swipeable card front */}
      <motion.div
        ref={rowRef}
        whileTap={{ scale: 0.985 }}
        className="bg-white rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer border border-slate-200/80 hover:border-slate-300 transition-colors relative z-10"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div
          className={`w-11 h-11 rounded-2xl ${color.bg} ${color.text} flex items-center justify-center font-bold text-sm border ${color.border} flex-shrink-0 shadow-xs`}
        >
          {expense.category.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {expense.category}
          </p>
          <p className="text-[11px] text-slate-400">Toca para editar</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
            {fmt(expense.amount)}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </div>
      </motion.div>
    </div>
  )
}
