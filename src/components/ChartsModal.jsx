import { useState, useEffect, useMemo } from 'react'
import {
  X,
  RefreshCw,
  Maximize2,
  Minimize2,
  TrendingUp,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Layers,
  BarChart3,
  Calendar
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts'
import { getControlPanelData } from '@/lib/sheetsApi'
import { fmt } from '@/lib/utils'
import { toast } from 'sonner'

export default function ChartsModal({ isOpen, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedChart, setExpandedChart] = useState(null) // null | 'incomeVsExpenses' | 'fixedVsVariable'
  const [showOnlyActive, setShowOnlyActive] = useState(false)

  const loadData = async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await getControlPanelData(force)
      if (res?.monthlyData) {
        setData(res)
      }
      if (force) {
        toast.success('Datos actualizados desde Google Sheets')
      }
    } catch (err) {
      toast.error('Error al cargar datos del Panel de control: ' + err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadData(false)
    }
  }, [isOpen])

  const filteredData = useMemo(() => {
    if (!data?.monthlyData) return []
    if (showOnlyActive) {
      return data.monthlyData.filter((d) => d.hasData)
    }
    return data.monthlyData
  }, [data, showOnlyActive])

  if (!isOpen) return null

  const summary = data?.summary || {
    totalIncome: 0,
    totalExpenses: 0,
    totalSavings: 0,
    totalFixed: 0,
    totalVariable: 0,
    netBalance: 0,
    avgIncome: 0,
    avgExpenses: 0,
    avgSavings: 0,
    activeMonthsCount: 0
  }

  const handleToggleExpand = (chartKey) => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    setExpandedChart((prev) => (prev === chartKey ? null : chartKey))
  }

  // Custom Tooltip para Recharts
  const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null
    const monthObj = filteredData.find((d) => d.shortMonth === label)
    const income = payload.find((p) => p.dataKey === 'income')?.value || 0
    const expenses = payload.find((p) => p.dataKey === 'expenses')?.value || 0
    const balance = income - expenses

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/80 text-xs min-w-[170px] z-50">
        <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
          <span>{monthObj?.month || label} 2026</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${balance >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
            {balance >= 0 ? 'Superávit' : 'Déficit'}
          </span>
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-emerald-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Ingresos:</span>
            </span>
            <span className="font-bold font-mono">{fmt(income)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-rose-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Gastos:</span>
            </span>
            <span className="font-bold font-mono">{fmt(expenses)}</span>
          </div>
          <div className="pt-1 mt-1 border-t border-slate-800 flex items-center justify-between text-slate-300 font-semibold">
            <span>Balance neto:</span>
            <span className={`font-mono ${balance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {balance > 0 ? `+${fmt(balance)}` : fmt(balance)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const CustomLineTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null
    const monthObj = filteredData.find((d) => d.shortMonth === label)
    const fixed = payload.find((p) => p.dataKey === 'fixedExpenses')?.value || 0
    const variable = payload.find((p) => p.dataKey === 'variableExpenses')?.value || 0
    const total = fixed + variable

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/80 text-xs min-w-[170px] z-50">
        <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
          <span>{monthObj?.month || label} 2026</span>
          <span className="text-[10px] text-slate-400 font-mono">Total: {fmt(total)}</span>
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-indigo-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Gastos Fijos:</span>
            </span>
            <span className="font-bold font-mono">{fmt(fixed)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-amber-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Gastos Variables:</span>
            </span>
            <span className="font-bold font-mono">{fmt(variable)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto bg-slate-950/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col max-h-[92vh] overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 sm:px-4 py-2 sm:py-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-2xs">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-snug">
                  Panel de Control — Gráficos 2026
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">
                  Datos consolidados de la pestaña <span className="font-semibold text-slate-700">Panel de control</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={refreshing || loading}
                title="Actualizar datos desde Google Sheets"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                  onClose()
                }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 transition-colors"
                aria-label="Cerrar gráficos"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="p-2.5 sm:p-4 overflow-y-auto space-y-2.5 sm:space-y-3">
            {/* KPI Summary Strip - Más compacto para no empujar el gráfico hacia abajo en móvil */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100/90 shadow-2xs">
                <div className="flex items-center justify-between text-emerald-600 text-[10px] sm:text-[11px] font-semibold mb-0.5">
                  <span>Ingresos Totales</span>
                  <ArrowUpRight className="w-3 h-3" />
                </div>
                <p className="text-sm sm:text-base font-bold text-slate-900 font-mono tracking-tight">
                  {fmt(summary.totalIncome)}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
                  Media: <strong className="text-slate-700">{fmt(summary.avgIncome)}/m</strong>
                </p>
              </div>

              <div className="p-2 sm:p-2.5 rounded-xl bg-rose-50/70 border border-rose-100/90 shadow-2xs">
                <div className="flex items-center justify-between text-rose-600 text-[10px] sm:text-[11px] font-semibold mb-0.5">
                  <span>Gastos Totales</span>
                  <ArrowDownRight className="w-3 h-3" />
                </div>
                <p className="text-sm sm:text-base font-bold text-slate-900 font-mono tracking-tight">
                  {fmt(summary.totalExpenses)}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
                  Media: <strong className="text-slate-700">{fmt(summary.avgExpenses)}/m</strong>
                </p>
              </div>

              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50/70 border border-blue-100/90 shadow-2xs">
                <div className="flex items-center justify-between text-blue-600 text-[10px] sm:text-[11px] font-semibold mb-0.5">
                  <span>Balance Neto</span>
                  <Wallet className="w-3 h-3" />
                </div>
                <p className={`text-sm sm:text-base font-bold font-mono tracking-tight ${summary.netBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {summary.netBalance > 0 ? `+${fmt(summary.netBalance)}` : fmt(summary.netBalance)}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
                  Ahorro: <strong className="text-slate-700">{fmt(summary.avgSavings)}/m</strong>
                </p>
              </div>

              <div className="p-2 sm:p-2.5 rounded-xl bg-amber-50/70 border border-amber-100/90 shadow-2xs">
                <div className="flex items-center justify-between text-amber-600 text-[10px] sm:text-[11px] font-semibold mb-0.5">
                  <span>Costes F/V</span>
                  <Layers className="w-3 h-3" />
                </div>
                <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5">
                  <span className="text-indigo-600 font-mono">F: {fmt(summary.totalFixed)}</span>
                  <span className="text-amber-600 font-mono">V: {fmt(summary.totalVariable)}</span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
                  {summary.activeMonthsCount} meses contabilizados
                </p>
              </div>
            </div>

            {/* Filter / View Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 pb-0.5">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setExpandedChart(null)
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                    expandedChart === null
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cuadrícula (2 gráficos)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setExpandedChart('incomeVsExpenses')
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                    expandedChart === 'incomeVsExpenses'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ingresos vs Gastos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
                    setExpandedChart('fixedVsVariable')
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                    expandedChart === 'fixedVsVariable'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Fijos vs Variables
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowOnlyActive(!showOnlyActive)}
                  className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                    showOnlyActive
                      ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {showOnlyActive ? 'Solo meses con datos' : 'Ver los 12 meses'}
                </button>
              </div>
            </div>

            {/* Cuadrícula / Vista ampliada con animaciones */}
            <div
              className={`grid gap-3 transition-all duration-300 ${
                expandedChart ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
              }`}
            >
              {/* Gráfico 1: Columnas Ingresos vs Gastos */}
              {(!expandedChart || expandedChart === 'incomeVsExpenses') && (
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs flex flex-col ${
                    expandedChart === 'incomeVsExpenses' ? 'ring-2 ring-primary/20' : ''
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          Ingresos vs. Gastos Totales
                        </h3>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                        Gráfico de columnas comparativo mes a mes
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand('incomeVsExpenses')}
                        title={expandedChart === 'incomeVsExpenses' ? 'Minimizar a cuadrícula' : 'Agrandar gráfico'}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        {expandedChart === 'incomeVsExpenses' ? (
                          <Minimize2 className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Leyenda visual explícita */}
                  <div className="flex items-center gap-3 text-[11px] font-semibold mb-1 px-0.5">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                      <span className="text-slate-700">Ingresos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                      <span className="text-slate-700">Gastos</span>
                    </div>
                    {expandedChart === 'incomeVsExpenses' && (
                      <span className="text-[10px] text-slate-400 font-normal ml-auto">
                        Toca una barra para ver detalle
                      </span>
                    )}
                  </div>

                  {/* Chart container - Reducido un 30% en altura para evitar scroll en móvil */}
                  <div
                    className={`w-full transition-all duration-300 ${
                      expandedChart === 'incomeVsExpenses' ? 'h-[245px] sm:h-[285px]' : 'h-[175px] sm:h-[195px]'
                    }`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={filteredData}
                        margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="shortMonth"
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={9}
                          width={34}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`)}
                        />
                        <Tooltip content={<CustomBarTooltip />} />
                        <Bar
                          dataKey="income"
                          name="Ingresos"
                          fill="#10b981"
                          maxBarSize={15}
                          radius={[3, 3, 0, 0]}
                          animationDuration={700}
                        />
                        <Bar
                          dataKey="expenses"
                          name="Gastos"
                          fill="#f43f5e"
                          maxBarSize={15}
                          radius={[3, 3, 0, 0]}
                          animationDuration={700}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Expanded mode: mini detail table */}
                  {expandedChart === 'incomeVsExpenses' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 pt-2.5 border-t border-slate-100"
                    >
                      <h4 className="text-[11px] font-bold text-slate-800 mb-1.5">Desglose mensual</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                        {filteredData.filter((d) => d.hasData).map((item) => (
                          <div key={item.month} className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="font-bold text-slate-800 text-[11px]">{item.month}</span>
                            <div className="flex justify-between text-[10px] text-emerald-600 mt-0.5">
                              <span>Ing:</span>
                              <span className="font-mono font-semibold">{fmt(item.income)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-rose-600">
                              <span>Gas:</span>
                              <span className="font-mono font-semibold">{fmt(item.expenses)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-700 pt-0.5 border-t border-slate-200 mt-0.5">
                              <span>Neto:</span>
                              <span className={`font-mono ${item.netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {fmt(item.netBalance)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Gráfico 2: Líneas Gastos Fijos vs Gastos Variables */}
              {(!expandedChart || expandedChart === 'fixedVsVariable') && (
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs flex flex-col ${
                    expandedChart === 'fixedVsVariable' ? 'ring-2 ring-primary/20' : ''
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          Gastos Fijos vs. Gastos Variables
                        </h3>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                        Gráfico de líneas con la evolución de costes
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand('fixedVsVariable')}
                        title={expandedChart === 'fixedVsVariable' ? 'Minimizar a cuadrícula' : 'Agrandar gráfico'}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        {expandedChart === 'fixedVsVariable' ? (
                          <Minimize2 className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Leyenda visual explícita */}
                  <div className="flex items-center gap-3 text-[11px] font-semibold mb-1 px-0.5">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-0.5 bg-indigo-500 rounded-full" />
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="text-slate-700">Gastos Fijos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-0.5 bg-amber-500 rounded-full" />
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-slate-700">Gastos Variables</span>
                    </div>
                    {expandedChart === 'fixedVsVariable' && (
                      <span className="text-[10px] text-slate-400 font-normal ml-auto">
                        Toca un punto para ver desglose
                      </span>
                    )}
                  </div>

                  {/* Chart container - Reducido un 30% en altura */}
                  <div
                    className={`w-full transition-all duration-300 ${
                      expandedChart === 'fixedVsVariable' ? 'h-[245px] sm:h-[285px]' : 'h-[175px] sm:h-[195px]'
                    }`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={filteredData}
                        margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="shortMonth"
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={9}
                          width={34}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`)}
                        />
                        <Tooltip content={<CustomLineTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="fixedExpenses"
                          name="Gastos Fijos"
                          stroke="#6366f1"
                          strokeWidth={2.2}
                          dot={{ r: 3, fill: '#6366f1', strokeWidth: 1.5, stroke: '#ffffff' }}
                          activeDot={{ r: 5, fill: '#6366f1' }}
                          animationDuration={800}
                        />
                        <Line
                          type="monotone"
                          dataKey="variableExpenses"
                          name="Gastos Variables"
                          stroke="#f59e0b"
                          strokeWidth={2.2}
                          dot={{ r: 3, fill: '#f59e0b', strokeWidth: 1.5, stroke: '#ffffff' }}
                          activeDot={{ r: 5, fill: '#f59e0b' }}
                          animationDuration={800}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Expanded mode: mini detail table */}
                  {expandedChart === 'fixedVsVariable' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 pt-2.5 border-t border-slate-100"
                    >
                      <h4 className="text-[11px] font-bold text-slate-800 mb-1.5">Desglose Fijos vs Variables</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                        {filteredData.filter((d) => d.hasData).map((item) => (
                          <div key={item.month} className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="font-bold text-slate-800 text-[11px]">{item.month}</span>
                            <div className="flex justify-between text-[10px] text-indigo-600 mt-0.5">
                              <span>Fijos:</span>
                              <span className="font-mono font-semibold">{fmt(item.fixedExpenses)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-amber-600">
                              <span>Var:</span>
                              <span className="font-mono font-semibold">{fmt(item.variableExpenses)}</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500 pt-0.5 border-t border-slate-200 mt-0.5">
                              <span>% Fijos:</span>
                              <span className="font-mono font-semibold">
                                {item.income > 0 ? `${Math.round((item.fixedExpenses / item.income) * 100)}%` : '-'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
