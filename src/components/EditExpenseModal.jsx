import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const QUICK_AMOUNTS = [5, 10, 20, 50]

export default function EditExpenseModal({ expense, categories, onSave, onClose }) {
  const [category, setCategory] = useState(expense.category)
  const [amount, setAmount] = useState(String(expense.amount))
  const [submitting, setSubmitting] = useState(false)

  const handleQuickAddAmount = (extra) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const current = parseFloat(amount) || 0
    setAmount((current + extra).toFixed(2).replace(/\.00$/, ''))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!category || !amount || isNaN(parsed) || parsed <= 0) return

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    setSubmitting(true)
    try {
      await onSave(expense, category, parsed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Material 3 Bottom Sheet with Drag-down gesture */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose()
          }
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="relative w-full max-w-md bg-white rounded-t-[28px] p-6 pb-8 border-t border-slate-200/90 shadow-2xl z-10"
      >
        {/* Drag handle */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing hover:bg-slate-400 transition-colors" />

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Editar Gasto</h2>
            <p className="text-xs text-slate-500 mt-0.5">Modifica los detalles del registro</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.85, rotate: 90 }}
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Categoría
            </label>
            <div className="relative">
              <input
                type="text"
                list="edit-categories-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Escribe o selecciona categoría..."
                className="flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <datalist id="edit-categories-list">
                {Array.from(new Set([expense.category, ...categories].filter(Boolean))).map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            {/* Quick chips for editing */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {categories.slice(0, 4).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setCategory(cat)
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    category === cat
                      ? 'bg-primary text-white border-primary font-semibold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/60 font-medium'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Cantidad (€)
            </label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className="h-12 text-lg font-bold text-slate-900 bg-slate-50/70 border-slate-200 rounded-xl pr-10 focus:bg-white"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                €
              </span>
            </div>

            {/* Quick amount increment pills */}
            <div className="flex gap-2 mt-2.5">
              {QUICK_AMOUNTS.map((val) => (
                <motion.button
                  key={val}
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => handleQuickAddAmount(val)}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70 transition-colors select-none"
                >
                  +{val}€
                </motion.button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold shadow-md shadow-primary/25 transition-all"
                disabled={submitting || !amount}
              >
                {submitting ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </motion.div>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
