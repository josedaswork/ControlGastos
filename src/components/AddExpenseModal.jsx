import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, ChevronDown, Check, Tag } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const QUICK_AMOUNTS = [5, 10, 20, 50]

export default function AddExpenseModal({ categories, onAdd, onClose }) {
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return categories
    const q = search.toLowerCase()
    return categories.filter((cat) => cat.toLowerCase().includes(q))
  }, [categories, search])

  const effectiveCategory = (category || search).trim()
  const parsedAmount = parseFloat(amount)
  const isValid = Boolean(effectiveCategory && !isNaN(parsedAmount) && parsedAmount > 0)

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (cat) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setCategory(cat)
    setSearch(cat)
    setOpen(false)
  }

  const handleQuickAddAmount = (extra) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    const current = parseFloat(amount) || 0
    setAmount((current + extra).toFixed(2).replace(/\.00$/, ''))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
    setSubmitting(true)
    try {
      await onAdd(effectiveCategory, parsedAmount)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop with Fade */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Material 3 Bottom Sheet with Spring Slide-Up and Drag-down gesture */}
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
        className="relative w-full max-w-md bg-white rounded-t-[28px] p-6 pb-8 border-t border-slate-200/90 shadow-2xl z-10 max-h-[90vh] overflow-y-auto"
      >
        {/* Drag Handle Bar */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing hover:bg-slate-400 transition-colors" />

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Nuevo Gasto</h2>
            <p className="text-xs text-slate-500 mt-0.5">Añade una compra o gasto variable</p>
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

        {categories.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" />
            <p className="text-sm">Cargando categorías...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category selection */}
            <div ref={dropdownRef} className="relative">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Categoría
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Selecciona o busca categoría..."
                  value={search}
                  onFocus={() => setOpen(true)}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCategory('')
                    setOpen(true)
                  }}
                  className="flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => { setOpen(!open); inputRef.current?.focus() }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {/* Quick suggestion chips */}
              {!open && categories.length > 0 && !category && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {categories.slice(0, 4).map((cat) => (
                    <motion.button
                      key={cat}
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      whileHover={{ scale: 1.03 }}
                      onClick={() => handleSelect(cat)}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2.5 py-1 rounded-lg border border-slate-200/60 transition-colors flex items-center gap-1"
                    >
                      <Tag className="w-2.5 h-2.5 text-slate-400" />
                      {cat}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Dropdown menu */}
              <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-20 mt-1.5 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1"
                  >
                    {filtered.length > 0 ? (
                      <>
                        {filtered.map((cat) => {
                          const isSelected = effectiveCategory === cat
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => handleSelect(cat)}
                              className={`w-full text-left px-3.5 py-2.5 text-sm font-medium transition-colors flex items-center justify-between ${
                                isSelected
                                  ? 'bg-primary/10 text-primary font-semibold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{cat}</span>
                              {isSelected && <Check className="w-4 h-4 text-primary" />}
                            </button>
                          )
                        })}
                        {search.trim() && !categories.some(c => c.toLowerCase() === search.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => handleSelect(search.trim())}
                            className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 border-t border-slate-100 flex items-center gap-1.5"
                          >
                            <span>+ Usar nueva categoría: <strong>"{search.trim()}"</strong></span>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="p-2">
                        {search.trim() ? (
                          <button
                            type="button"
                            onClick={() => handleSelect(search.trim())}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <span>+ Usar nueva categoría: <strong>"{search.trim()}"</strong></span>
                          </button>
                        ) : (
                          <p className="px-3 py-2 text-xs text-slate-400 text-center">
                            Escribe para buscar o crear una categoría
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Amount input */}
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
                  className="h-12 text-lg font-bold text-slate-900 bg-slate-50/70 border-slate-200 rounded-xl pr-10 focus:bg-white"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                  €
                </span>
              </div>

              {/* Quick amount increment pills with bouncy taps */}
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

            {/* Submit button */}
            <div className="pt-2">
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-md shadow-primary/25 transition-all"
                  disabled={submitting || !amount || !isValid}
                >
                  {submitting ? 'Añadiendo gasto...' : 'Guardar Gasto'}
                </Button>
              </motion.div>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}
