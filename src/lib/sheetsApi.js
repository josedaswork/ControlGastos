const STORAGE_KEY = 'sheets_script_url'
const SPREADSHEET_URL_STORAGE_KEY = 'sheets_spreadsheet_url'
const DATA_CACHE_KEY = 'sheets_data_cache'
const PENDING_KEY = 'sheets_pending_expenses'

export const DEFAULT_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1KLn5Ow_eoclIyx2LB0P89JC7vwmNSRV60iBjNepoJjA/edit'

export function getScriptUrl() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

export function setScriptUrl(url) {
  localStorage.setItem(STORAGE_KEY, url)
}

export function getSpreadsheetUrl() {
  return localStorage.getItem(SPREADSHEET_URL_STORAGE_KEY) || DEFAULT_SPREADSHEET_URL
}

export function setSpreadsheetUrl(url) {
  if (url && typeof url === 'string') {
    localStorage.setItem(SPREADSHEET_URL_STORAGE_KEY, url.trim())
  } else {
    localStorage.removeItem(SPREADSHEET_URL_STORAGE_KEY)
  }
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

  // Guardar automáticamente la URL del spreadsheet si viene en la respuesta
  if (data.spreadsheetUrl) {
    setSpreadsheetUrl(data.spreadsheetUrl)
  }

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

// Meses del año para agregación y mapeo
const ALL_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]
const ALL_SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

// Datos semilla de fallback basados en la plantilla del Panel de Control 2026
const DEFAULT_CONTROL_PANEL_DATA = {
  monthlyData: [
    { month: 'Enero', shortMonth: 'Ene', monthIndex: 0, income: 1696.87, expenses: 1312.89, fixedExpenses: 662.91, variableExpenses: 649.98, savings: 383.98, netBalance: 383.98, pctFixed: 0.3907, pctVar: 0.383, hasData: true },
    { month: 'Febrero', shortMonth: 'Feb', monthIndex: 1, income: 1664.57, expenses: 1389.94, fixedExpenses: 660.38, variableExpenses: 729.56, savings: 274.63, netBalance: 274.63, pctFixed: 0.3967, pctVar: 0.4383, hasData: true },
    { month: 'Marzo', shortMonth: 'Mar', monthIndex: 2, income: 1634.27, expenses: 1095.52, fixedExpenses: 593.10, variableExpenses: 502.42, savings: 538.75, netBalance: 538.75, pctFixed: 0.3629, pctVar: 0.3074, hasData: true },
    { month: 'Abril', shortMonth: 'Abr', monthIndex: 3, income: 1626.47, expenses: 1048.21, fixedExpenses: 658.65, variableExpenses: 389.56, savings: 578.26, netBalance: 578.26, pctFixed: 0.405, pctVar: 0.2395, hasData: true },
    { month: 'Mayo', shortMonth: 'May', monthIndex: 4, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Junio', shortMonth: 'Jun', monthIndex: 5, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Julio', shortMonth: 'Jul', monthIndex: 6, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Agosto', shortMonth: 'Ago', monthIndex: 7, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Septiembre', shortMonth: 'Sep', monthIndex: 8, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Octubre', shortMonth: 'Oct', monthIndex: 9, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Noviembre', shortMonth: 'Nov', monthIndex: 10, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false },
    { month: 'Diciembre', shortMonth: 'Dic', monthIndex: 11, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savings: 0, netBalance: 0, pctFixed: 0, pctVar: 0, hasData: false }
  ],
  summary: {
    totalIncome: 6622.18,
    totalExpenses: 4846.56,
    totalSavings: 1775.62,
    totalFixed: 2575.04,
    totalVariable: 2271.52,
    netBalance: 1775.62,
    avgIncome: 1655.55,
    avgExpenses: 1211.64,
    avgSavings: 443.91,
    activeMonthsCount: 4
  }
}

/**
 * Recalcula los totales consolidados a partir del array monthlyData
 */
function computeConsolidatedSummary(monthlyData) {
  let totalIncome = 0
  let totalExpenses = 0
  let totalSavings = 0
  let totalFixed = 0
  let totalVariable = 0
  let activeMonthsCount = 0

  monthlyData.forEach((item) => {
    if (item.hasData) {
      activeMonthsCount++
      totalIncome += item.income || 0
      totalExpenses += item.expenses || 0
      totalSavings += item.savings || 0
      totalFixed += item.fixedExpenses || 0
      totalVariable += item.variableExpenses || 0
    }
  })

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalSavings: Math.round(totalSavings * 100) / 100,
    totalFixed: Math.round(totalFixed * 100) / 100,
    totalVariable: Math.round(totalVariable * 100) / 100,
    netBalance: Math.round((totalIncome - totalExpenses) * 100) / 100,
    avgIncome: activeMonthsCount > 0 ? Math.round((totalIncome / activeMonthsCount) * 100) / 100 : 0,
    avgExpenses: activeMonthsCount > 0 ? Math.round((totalExpenses / activeMonthsCount) * 100) / 100 : 0,
    avgSavings: activeMonthsCount > 0 ? Math.round((totalSavings / activeMonthsCount) * 100) / 100 : 0,
    activeMonthsCount
  }
}

/**
 * Obtiene los datos consolidados del Panel de Control.
 * Realiza múltiples capas de comprobación:
 * 1. Intenta la acción dedicada 'getControlPanelData'.
 * 2. Si falla o no incluye meses posteriores a Abril, consulta en paralelo
 *    las hojas de todos los 12 meses usando 'getSummary', garantizando que ningún
 *    mes quede fuera aunque no se haya redesplegado el script.
 */
export async function getControlPanelData(forceRefresh = false) {
  const cached = getCacheEntry('control_panel_data')
  // Comprobar si el caché actual tiene meses con datos más allá de Abril
  const cachedHasMonthsBeyondApril = cached?.monthlyData?.some((d) => d.monthIndex > 3 && d.hasData)

  if (!forceRefresh && cached?.monthlyData && cachedHasMonthsBeyondApril) {
    return cached
  }

  let liveData = null

  // Intento 1: Acción directa del Apps Script
  try {
    const res = await callApi({
      action: 'getControlPanelData'
    })

    if (res?.monthlyData && Array.isArray(res.monthlyData) && res.monthlyData.length > 0) {
      liveData = res
    }
  } catch (err) {
    console.warn('Acción getControlPanelData no disponible o fallida, usando agregación por meses:', err.message)
  }

  // Verificar si liveData tiene meses más allá de Abril
  const liveHasMonthsBeyondApril = liveData?.monthlyData?.some((d) => d.monthIndex > 3 && d.hasData)

  // Si liveData ya contiene datos completos más allá de Abril, guardamos y retornamos
  if (liveData && liveHasMonthsBeyondApril) {
    setCacheEntry('control_panel_data', liveData)
    return liveData
  }

  // Intento 2: Cargar o verificar todos los 12 meses directamente de las hojas
  try {
    const summariesPromises = ALL_MONTHS.map(async (m, i) => {
      try {
        const sum = await getSummary(m)
        return { month: m, index: i, sum }
      } catch {
        return { month: m, index: i, sum: null }
      }
    })

    const results = await Promise.allSettled(summariesPromises)

    // Base mensual a combinar
    const baseList = liveData?.monthlyData || DEFAULT_CONTROL_PANEL_DATA.monthlyData

    const mergedMonthly = ALL_MONTHS.map((m, i) => {
      const existing = baseList.find((d) => d.month === m) || {}
      const itemResult = results[i]
      const sum = (itemResult.status === 'fulfilled' && itemResult.value?.sum) ? itemResult.value.sum : null

      let income = existing.income || 0
      let fixed = existing.fixedExpenses || 0
      let variable = existing.variableExpenses || 0
      let expenses = existing.expenses || 0
      let savings = existing.savings || 0

      if (sum) {
        if (sum.income > 0 || income === 0) income = sum.income || 0
        if (sum.fixedExpenses > 0 || fixed === 0) fixed = sum.fixedExpenses || 0
        if (sum.variableExpenses > 0 || variable === 0) variable = sum.variableExpenses || 0
        if (sum.totalExpenses > 0 || expenses === 0) {
          expenses = sum.totalExpenses || (fixed + variable)
        }
        if (sum.savings > 0 || savings === 0) {
          savings = sum.savings ?? (income - expenses)
        }
      }

      const hasData = income > 0 || expenses > 0 || fixed > 0 || variable > 0

      return {
        month: m,
        shortMonth: ALL_SHORT_MONTHS[i],
        monthIndex: i,
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        fixedExpenses: Math.round(fixed * 100) / 100,
        variableExpenses: Math.round(variable * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        netBalance: Math.round((income - expenses) * 100) / 100,
        pctFixed: income > 0 ? Math.round((fixed / income) * 10000) / 10000 : 0,
        pctVar: income > 0 ? Math.round((variable / income) * 10000) / 10000 : 0,
        hasData
      }
    })

    const finalSummary = computeConsolidatedSummary(mergedMonthly)
    const consolidated = {
      monthlyData: mergedMonthly,
      summary: finalSummary
    }

    setCacheEntry('control_panel_data', consolidated)
    return consolidated
  } catch (aggErr) {
    console.warn('Error al agregar resúmenes mensuales:', aggErr)
  }

  // Si todo lo anterior falla, devolver lo mejor que tengamos
  if (liveData) {
    setCacheEntry('control_panel_data', liveData)
    return liveData
  }

  if (cached?.monthlyData) {
    return cached
  }

  return DEFAULT_CONTROL_PANEL_DATA
}

