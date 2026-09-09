const STORAGE_KEY = 'sheets_script_url'
const DATA_CACHE_KEY = 'sheets_data_cache'
const PENDING_KEY = 'sheets_pending_expenses'

export function getScriptUrl() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

export function setScriptUrl(url) {
  localStorage.setItem(STORAGE_KEY, url)
}

export const DEFAULT_CATEGORIES = [
  'Fiesta bebida', 'Fiesta entradas', 'Restaurante', 'Bebidas',
  'Bizzum', 'Viajes tickets', 'Peluquerias', 'Cosmetico',
  'Chino Bazar', 'Cafetería', 'Restaurante (Tarjeta Rest)', 'Ocio',
  'Supermecado', 'Museo', 'Regalos', 'NOT TRACKED',
  'Transporte', 'Musica Tickets', 'Tramites',
]

/* ---- Helpers ---- */

async function callApi(params) {
  const url = getScriptUrl()
  if (!url) throw new Error('URL del script no configurada')

  const response = await fetch(url + '?' + new URLSearchParams(params), {
    redirect: 'follow',
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Respuesta no válida del servidor')
  }

  if (data.error) throw new Error(data.error)
  return data
}

function getCacheStore() {
  try {
    return JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || '{}')
  } catch { return {} }
}

function setCacheEntry(key, data) {
  const store = getCacheStore()
  store[key] = { data, ts: Date.now() }
  localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(store))
}

function getCacheEntry(key) {
  const entry = getCacheStore()[key]
  if (!entry) return null
  return entry.data
}

export function getCachedSummary(month) {
  return getCacheEntry('summary_' + month)
}

export function getCachedExpenses(month) {
  return getCacheEntry('expenses_' + month)
}

export function getCachedCategories() {
  return getCacheEntry('categories')
}

/* ---- Categorías ---- */

export async function getCategories() {
  try {
    const data = await callApi({ action: 'getCategories' })
    if (data.categories?.length > 0) {
      setCacheEntry('categories', data)
    }
    return data
  } catch (err) {
    const cached = getCacheEntry('categories')
    if (cached) return cached
    throw err
  }
}

export function clearAllCache() {
  localStorage.removeItem(DATA_CACHE_KEY)
}

/* ---- Datos mensuales con caché offline ---- */

export async function getExpenses(month) {
  try {
    const data = await callApi({ action: 'getExpenses', month })
    setCacheEntry('expenses_' + month, data)
    return data
  } catch (err) {
    const cached = getCacheEntry('expenses_' + month)
    if (cached) return cached
    throw err
  }
}

export async function getSummary(month) {
  try {
    const data = await callApi({ action: 'getSummary', month })
    setCacheEntry('summary_' + month, data)
    return data
  } catch (err) {
    const cached = getCacheEntry('summary_' + month)
    if (cached) return cached
    throw err
  }
}

/* ---- Cola de gastos pendientes (offline) ---- */

export function getPendingExpenses() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  } catch { return [] }
}

function savePendingExpenses(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

export async function setSavingsGoal(month, amount) {
  const parsed = parseFloat(String(amount).replace(',', '.'))
  const result = await callApi({
    action: 'setSavingsGoal',
    month,
    amount: String(parsed),
  })

  // Invalidate or update cached summary for this month
  const cacheKey = `summary_${month}`
  const cached = getCacheEntry(cacheKey)
  if (cached) {
    const updatedSummary = {
      ...cached,
      desiredSavings: parsed,
      remainingMonth: (cached.income || 0) - (cached.fixedExpenses || 0) - (cached.variableExpenses || 0) - parsed,
    }
    setCacheEntry(cacheKey, updatedSummary)
  }

  return result
}

export async function setTotalIncome(month, amount) {
  const parsed = parseFloat(String(amount).replace(',', '.'))
  const result = await callApi({
    action: 'setTotalIncome',
    month,
    amount: String(parsed),
  })

  // Invalidate or update cached summary for this month
  const cacheKey = `summary_${month}`
  const cached = getCacheEntry(cacheKey)
  if (cached) {
    const updatedSummary = {
      ...cached,
      income: parsed,
      remainingMonth: parsed - (cached.fixedExpenses || 0) - (cached.variableExpenses || 0) - (cached.desiredSavings || 0),
    }
    setCacheEntry(cacheKey, updatedSummary)
  }

  return result
}

export async function addExpenseDirect(month, category, amount) {
  const cleanCategory = String(category || '').trim()
  const result = await callApi({
    action: 'addExpense',
    month,
    category: cleanCategory,
    amount: String(amount),
  })

  // Add the newly used category to the local cache immediately
  if (cleanCategory) {
    const cached = getCacheEntry('categories')
    if (cached && Array.isArray(cached.categories)) {
      if (!cached.categories.includes(cleanCategory)) {
        setCacheEntry('categories', {
          ...cached,
          categories: [...cached.categories, cleanCategory],
        })
      }
    }
  }

  return result
}

export function addToPending(month, category, amount) {
  const pending = getPendingExpenses()
  pending.push({
    month,
    category: String(category || '').trim(),
    amount,
    id: Date.now() + Math.random(),
  })
  savePendingExpenses(pending)
}

export function clearPendingExpenses() {
  localStorage.removeItem(PENDING_KEY)
}

export function removePendingExpense(id) {
  const pending = getPendingExpenses().filter((e) => e.id !== id)
  savePendingExpenses(pending)
}

export async function updateExpense(month, row, oldCategory, oldAmount, newCategory, newAmount) {
  return await callApi({
    action: 'updateExpense',
    month,
    row: String(row),
    oldCategory: String(oldCategory || '').trim(),
    oldAmount: String(oldAmount),
    newCategory: String(newCategory || '').trim(),
    newAmount: String(newAmount),
  })
}

export async function deleteExpense(month, row, category, amount) {
  return await callApi({
    action: 'deleteExpense',
    month,
    row: String(row),
    category: String(category || '').trim(),
    amount: String(amount),
  })
}

export async function syncPendingExpenses() {
  const pending = getPendingExpenses()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  const failed = []

  for (const expense of pending) {
    try {
      await callApi({
        action: 'addExpense',
        month: expense.month,
        category: String(expense.category || '').trim(),
        amount: String(expense.amount),
      })
      synced++
    } catch {
      failed.push(expense)
    }
  }

  savePendingExpenses(failed)
  return { synced, failed: failed.length }
}

export function getPendingForMonth(month) {
  return getPendingExpenses().filter((e) => e.month === month)
}

/* ---- Gastos Fijos y Casillas ---- */

export const FIXED_DEFAULT_CATEGORIES = {
  13: 'Alquiler',
  14: 'Bono metro',
  15: 'Gimnasio',
  16: 'Disney',
  17: 'Spotify',
  18: 'Comida Base',
  19: 'Comida Base',
  20: 'Servicios',
  21: 'Inversión',
}

export const FIXED_DEFAULT_AMOUNTS = {
  13: 470,
  14: 10,
  15: 24.99,
  16: 6.99,
  17: 3.5,
  18: 41.62,
  19: 57.36,
  20: 36,
  21: 0,
}

/**
 * Fusiona de forma infalible la lista de gastos fijos para evitar:
 * 1. Que se oculten los gastos desmarcados.
 * 2. Que los nombres de categoría sean sustituidos por números (ej. "470").
 * 3. Que respuestas parciales de Google Apps Script borren los demás gastos.
 */
export function sanitizeAndMergeFixedExpenses(existingItems = [], incomingItems = []) {
  const isNumericOrEmpty = (c) => !c || /^[0-9]+([.,][0-9]+)?$/.test(String(c).trim())
  const mapByRow = new Map()

  // 1. Poblamos con los gastos existentes
  if (Array.isArray(existingItems)) {
    existingItems.forEach((it) => {
      let cat = it.category
      if (isNumericOrEmpty(cat)) {
        cat = FIXED_DEFAULT_CATEGORIES[it.row] || `Gasto Fijo #${it.row - 12}`
      }
      let amt = (it.amount !== undefined && it.amount !== null && !isNaN(it.amount)) ? it.amount : (FIXED_DEFAULT_AMOUNTS[it.row] || 0)
      mapByRow.set(it.row, { ...it, category: cat, amount: amt })
    })
  }

  // 2. Si no hay gastos previos, sembramos las filas oficiales (13 a 21)
  if (mapByRow.size === 0) {
    Object.entries(FIXED_DEFAULT_CATEGORIES).forEach(([rStr, catName]) => {
      const r = parseInt(rStr, 10)
      mapByRow.set(r, {
        row: r,
        category: catName,
        amount: FIXED_DEFAULT_AMOUNTS[r] || 0,
        active: false,
        hasCheckbox: true,
      })
    })
  }

  // 3. Fusionamos con los datos entrantes del backend
  if (Array.isArray(incomingItems) && incomingItems.length > 0) {
    incomingItems.forEach((inc) => {
      const existing = mapByRow.get(inc.row)
      let safeCat = inc.category
      if (isNumericOrEmpty(safeCat)) {
        safeCat = existing?.category || FIXED_DEFAULT_CATEGORIES[inc.row] || `Gasto Fijo #${inc.row - 12}`
      }

      let safeAmt = inc.amount
      if (safeAmt === undefined || safeAmt === null || isNaN(safeAmt) || safeAmt <= 0) {
        safeAmt = existing?.amount > 0 ? existing.amount : (FIXED_DEFAULT_AMOUNTS[inc.row] || 0)
      }

      if (existing) {
        mapByRow.set(inc.row, {
          ...existing,
          active: inc.active !== undefined ? inc.active : existing.active,
          amount: safeAmt,
          category: safeCat,
          hasCheckbox: inc.hasCheckbox !== undefined ? inc.hasCheckbox : existing.hasCheckbox,
        })
      } else {
        mapByRow.set(inc.row, {
          row: inc.row,
          category: safeCat,
          amount: safeAmt,
          active: !!inc.active,
          hasCheckbox: inc.hasCheckbox ?? true,
        })
      }
    })
  }

  return Array.from(mapByRow.values()).sort((a, b) => a.row - b.row)
}

export function getCachedFixedExpenses(month) {
  const cached = getCacheEntry('fixed_expenses_' + month)
  if (!cached) return null
  if (Array.isArray(cached.fixedExpenses)) {
    const safeList = sanitizeAndMergeFixedExpenses([], cached.fixedExpenses)
    return {
      ...cached,
      fixedExpenses: safeList,
      totalActive: safeList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    }
  }
  return cached
}

export async function getFixedExpenses(month) {
  try {
    const data = await callApi({ action: 'getFixedExpenses', month })
    const cached = getCacheEntry('fixed_expenses_' + month)
    const existingList = cached?.fixedExpenses || []

    let safeList = existingList
    if (data && Array.isArray(data.fixedExpenses)) {
      safeList = sanitizeAndMergeFixedExpenses(existingList, data.fixedExpenses)
    } else if (existingList.length === 0) {
      safeList = sanitizeAndMergeFixedExpenses([], [])
    }

    const total = safeList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    const safeData = {
      month,
      fixedExpenses: safeList,
      totalActive: total,
      hasCheckbox: data?.hasCheckbox ?? true,
    }
    setCacheEntry('fixed_expenses_' + month, safeData)
    return safeData
  } catch (err) {
    const cached = getCachedFixedExpenses(month)
    if (cached) return cached
    throw err
  }
}

export async function setFixedExpenseStatus(month, row, active) {
  const cachedFixed = getCachedFixedExpenses(month)
  const currentList = cachedFixed?.fixedExpenses || []

  // Actualización optimista del caché local
  const updatedExpenses = sanitizeAndMergeFixedExpenses(
    currentList,
    currentList.map((fe) => (fe.row === row ? { ...fe, active } : fe))
  )
  const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)

  setCacheEntry('fixed_expenses_' + month, {
    month,
    fixedExpenses: updatedExpenses,
    totalActive: newTotalActive,
    hasCheckbox: true,
  })

  const cachedSummary = getCacheEntry('summary_' + month)
  if (cachedSummary) {
    const prevFixed = cachedSummary.fixedExpenses || 0
    const diff = newTotalActive - prevFixed
    const updatedSummary = {
      ...cachedSummary,
      fixedExpenses: newTotalActive,
      remainingMonth: (cachedSummary.remainingMonth ?? cachedSummary.savings ?? 0) - diff,
    }
    setCacheEntry('summary_' + month, updatedSummary)
  }

  // Llamada a Google Apps Script
  const result = await callApi({
    action: 'setFixedExpenseStatus',
    month,
    row: String(row),
    active: String(active),
  })

  if (result?.fixedExpenses) {
    const merged = sanitizeAndMergeFixedExpenses(updatedExpenses, result.fixedExpenses)
    const total = merged.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: merged,
      totalActive: total,
      hasCheckbox: result.hasCheckbox ?? true,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return {
    ...result,
    fixedExpenses: sanitizeAndMergeFixedExpenses(updatedExpenses, result?.fixedExpenses || [])
  }
}

export async function setFixedExpensesBatch(month, updates) {
  const cachedFixed = getCachedFixedExpenses(month)
  const currentList = cachedFixed?.fixedExpenses || []

  const updateMap = new Map(updates.map((u) => [u.row, u.active]))
  const updatedExpenses = sanitizeAndMergeFixedExpenses(
    currentList,
    currentList.map((fe) => (updateMap.has(fe.row) ? { ...fe, active: updateMap.get(fe.row) } : fe))
  )
  const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)

  setCacheEntry('fixed_expenses_' + month, {
    month,
    fixedExpenses: updatedExpenses,
    totalActive: newTotalActive,
    hasCheckbox: true,
  })

  const cachedSummary = getCacheEntry('summary_' + month)
  if (cachedSummary) {
    const prevFixed = cachedSummary.fixedExpenses || 0
    const diff = newTotalActive - prevFixed
    const updatedSummary = {
      ...cachedSummary,
      fixedExpenses: newTotalActive,
      remainingMonth: (cachedSummary.remainingMonth ?? cachedSummary.savings ?? 0) - diff,
    }
    setCacheEntry('summary_' + month, updatedSummary)
  }

  const result = await callApi({
    action: 'setFixedExpensesBatch',
    month,
    updates: JSON.stringify(updates),
  })

  if (result?.fixedExpenses) {
    const merged = sanitizeAndMergeFixedExpenses(updatedExpenses, result.fixedExpenses)
    const total = merged.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: merged,
      totalActive: total,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return {
    ...result,
    fixedExpenses: sanitizeAndMergeFixedExpenses(updatedExpenses, result?.fixedExpenses || [])
  }
}

export async function setFixedExpenseAmount(month, row, amount, category) {
  const numAmount = parseFloat(String(amount).replace(',', '.')) || 0
  const cachedFixed = getCachedFixedExpenses(month)
  const currentList = cachedFixed?.fixedExpenses || []

  // Actualización optimista del caché local
  const updatedExpenses = sanitizeAndMergeFixedExpenses(
    currentList,
    currentList.map((fe) =>
      fe.row === row ? { ...fe, amount: numAmount, ...(category ? { category } : {}) } : fe
    )
  )
  const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)

  setCacheEntry('fixed_expenses_' + month, {
    month,
    fixedExpenses: updatedExpenses,
    totalActive: newTotalActive,
  })

  const cachedSummary = getCacheEntry('summary_' + month)
  if (cachedSummary) {
    const prevFixed = cachedSummary.fixedExpenses || 0
    const diff = newTotalActive - prevFixed
    const updatedSummary = {
      ...cachedSummary,
      fixedExpenses: newTotalActive,
      remainingMonth: (cachedSummary.remainingMonth ?? cachedSummary.savings ?? 0) - diff,
    }
    setCacheEntry('summary_' + month, updatedSummary)
  }

  const result = await callApi({
    action: 'setFixedExpenseAmount',
    month,
    row: String(row),
    amount: String(numAmount),
    ...(category ? { category } : {}),
  })

  if (result?.fixedExpenses) {
    const merged = sanitizeAndMergeFixedExpenses(updatedExpenses, result.fixedExpenses)
    const total = merged.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: merged,
      totalActive: total,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return {
    ...result,
    fixedExpenses: sanitizeAndMergeFixedExpenses(updatedExpenses, result?.fixedExpenses || [])
  }
}

export async function setLocaleSpain() {
  return await callApi({
    action: 'setLocaleSpain'
  })
}

export async function repairFixedExpenseFormulas(month, forceAll = true) {
  const result = await callApi({
    action: 'repairFixedExpenseFormulas',
    month,
    forceAll: forceAll ? 'true' : 'false'
  })

  if (result?.fixedExpenses) {
    const safeList = sanitizeAndMergeFixedExpenses([], result.fixedExpenses)
    const total = safeList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: safeList,
      totalActive: total,
      hasCheckbox: true,
    })
  }

  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return result
}

