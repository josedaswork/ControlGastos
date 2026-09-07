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

export function getCachedFixedExpenses(month) {
  return getCacheEntry('fixed_expenses_' + month)
}

export async function getFixedExpenses(month) {
  try {
    const data = await callApi({ action: 'getFixedExpenses', month })
    if (data && Array.isArray(data.fixedExpenses)) {
      setCacheEntry('fixed_expenses_' + month, data)
    }
    return data
  } catch (err) {
    const cached = getCacheEntry('fixed_expenses_' + month)
    if (cached) return cached
    throw err
  }
}

export async function setFixedExpenseStatus(month, row, active) {
  // Actualización optimista del caché local
  const cachedFixed = getCacheEntry('fixed_expenses_' + month)
  if (cachedFixed && Array.isArray(cachedFixed.fixedExpenses)) {
    const updatedExpenses = cachedFixed.fixedExpenses.map((fe) =>
      fe.row === row ? { ...fe, active } : fe
    )
    const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      ...cachedFixed,
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
  }

  // Llamada a Google Apps Script
  const result = await callApi({
    action: 'setFixedExpenseStatus',
    month,
    row: String(row),
    active: String(active),
  })

  if (result?.fixedExpenses) {
    const total = result.fixedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: result.fixedExpenses,
      totalActive: total,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return result
}

export async function setFixedExpensesBatch(month, updates) {
  const result = await callApi({
    action: 'setFixedExpensesBatch',
    month,
    updates: JSON.stringify(updates),
  })

  if (result?.fixedExpenses) {
    const total = result.fixedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: result.fixedExpenses,
      totalActive: total,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return result
}

export async function setFixedExpenseAmount(month, row, amount, category) {
  const numAmount = parseFloat(String(amount).replace(',', '.')) || 0

  // Actualización optimista del caché local
  const cachedFixed = getCacheEntry('fixed_expenses_' + month)
  if (cachedFixed && Array.isArray(cachedFixed.fixedExpenses)) {
    const updatedExpenses = cachedFixed.fixedExpenses.map((fe) =>
      fe.row === row ? { ...fe, amount: numAmount, ...(category ? { category } : {}) } : fe
    )
    const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      ...cachedFixed,
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
  }

  const result = await callApi({
    action: 'setFixedExpenseAmount',
    month,
    row: String(row),
    amount: String(numAmount),
    ...(category ? { category } : {}),
  })

  if (result?.fixedExpenses) {
    const total = result.fixedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: result.fixedExpenses,
      totalActive: total,
    })
  }
  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }

  return result
}

