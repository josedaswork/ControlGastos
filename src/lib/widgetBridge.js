import { Capacitor, registerPlugin } from '@capacitor/core'
import { getCachedExpenses } from './sheetsApi'

const WidgetBridge = registerPlugin('WidgetBridge')

let lastSentKey = ''

export async function syncCategoryWidget(month) {
  if (!month) return
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  } catch {
    return
  }

  const counts = {}
  ;(getCachedExpenses(month)?.expenses || []).forEach((e) => {
    const cat = String(e.category || '').trim()
    if (cat) counts[cat] = (counts[cat] || 0) + 1
  })

  const entries = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const key = month + '|' + JSON.stringify(entries)
  if (key === lastSentKey) return

  try {
    await WidgetBridge.updateCategoryCounts({ month, entries })
    lastSentKey = key
  } catch (err) {
    console.warn('No se pudo actualizar el widget:', err?.message || err)
  }
}
