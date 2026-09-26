import { isDebugEnabled, startTask, logTask } from './debugLogger'

const STORAGE_KEY = 'sheets_script_url'
const SPREADSHEET_URL_STORAGE_KEY = 'sheets_spreadsheet_url'
const DATA_CACHE_KEY = 'sheets_data_cache'
const PENDING_KEY = 'sheets_pending_expenses'

export { isDebugEnabled, logTask, startTask } from './debugLogger'

export const DEFAULT_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1KLn5Ow_eoclIyx2LB0P89JC7vwmNSRV60iBjNepoJjA/edit'

export function normalizeScriptUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return ''
  let url = inputUrl.trim()
  url = url.replace(/^["']|["']$/g, '')
  url = url.replace(/script\.google\.com\/(?:macros\/)?u\/\d+\/(?:macros\/)?/, 'script.google.com/macros/')
  url = url.split('?')[0]
  url = url.replace(/\/+$/, '')
  return url
}

export function validateScriptUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Debes introducir una URL de Google Apps Script' }
  }
  const clean = normalizeScriptUrl(url)

  if (clean.includes('docs.google.com/spreadsheets')) {
    return {
      valid: false,
      error: 'Has introducido el enlace a la hoja de Google Sheets en vez de la Aplicación Web. Sigue los pasos: Extensiones → Apps Script → Implementar → Aplicación Web y copia la URL terminada en "/exec".',
    }
  }

  if (
    clean.includes('/edit') ||
    clean.includes('/view') ||
    clean.includes('script.google.com/home/projects') ||
    clean.includes('script.google.com/d/')
  ) {
    return {
      valid: false,
      error: 'Has pegado la URL del editor de Apps Script. Pulsa el botón azul "Implementar" → "Nueva implementación" (o Administrar implementaciones) → selecciona "Aplicación web", acceso "Cualquier persona" y copia la URL terminada en "/exec".',
    }
  }

  if (!clean.includes('script.google.com/macros/s/')) {
    return {
      valid: false,
      error: 'La URL debe ser de Google Apps Script Web App (ejemplo: https://script.google.com/macros/s/.../exec).',
    }
  }

  if (!clean.endsWith('/exec') && !clean.endsWith('/dev')) {
    return {
      valid: false,
      error: 'La URL de la Aplicación Web debe terminar en "/exec". Comprueba que no esté cortada.',
    }
  }

  return { valid: true, url: clean }
}

export function getScriptUrl() {
  const raw = localStorage.getItem(STORAGE_KEY) || ''
  return normalizeScriptUrl(raw)
}

export function setScriptUrl(url) {
  if (url && typeof url === 'string') {
    const cleaned = normalizeScriptUrl(url)
    localStorage.setItem(STORAGE_KEY, cleaned)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
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

export async function callApi(params, method = 'GET') {
  const rawUrl = getScriptUrl()
  if (!rawUrl) throw new Error('URL del script no configurada')
  const baseUrl = normalizeScriptUrl(rawUrl)

  const task = isDebugEnabled()
    ? startTask(params.action || 'api_call', params, `${params.action || 'Llamada API'} (${method})`)
    : null

  let response
  let text = ''

  try {
    if (method === 'POST') {
      response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params),
        redirect: 'follow',
      })
    } else {
      const searchParams = new URLSearchParams({ ...params, _t: String(Date.now()) })
      response = await fetch(`${baseUrl}?${searchParams.toString()}`, {
        method: 'GET',
        redirect: 'follow',
      })
    }
    text = await response.text()
  } catch (netErr) {
    const errorMsg = 'No se pudo conectar con Google Sheets: ' + (netErr.message || 'Error de red')
    if (task) task.endError(errorMsg, `Error de red en ${params.action || 'petición'}`)
    throw new Error(errorMsg)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    console.warn('[Google Apps Script non-JSON response]:', text.slice(0, 160))

    const isDriveErrorPage =
      text.includes('<!DOCTYPE html>') ||
      text.includes('Página no encontrada') ||
      text.includes('No se puede abrir el archivo')

    // Solo intentar rescate por POST si NO es una página 404 de Google Drive y el método era GET
    if (
      !isDriveErrorPage &&
      method === 'GET' &&
      params.action &&
      !['ping', 'getMonthData', 'getExpenses', 'getSummary', 'getCategories'].includes(params.action)
    ) {
      try {
        const postResult = await callApi(params, 'POST')
        if (task) task.endSuccess(postResult, `${params.action} completado (vía POST fallback)`)
        return postResult
      } catch (_) {
        // Continuar para extraer el error más informativo
      }
    }

    let errorDetail = ''
    if (text.includes('No se puede abrir el archivo') || text.includes('Página no encontrada')) {
      errorDetail =
        'URL de Apps Script inaccesible ("Página no encontrada"). Comprueba en Ajustes ⚙️: que termine en "/exec" y que en la implementación el acceso esté configurado en "Cualquier persona" (Anyone).'
    } else if (text.includes('Exception:')) {
      const match = text.match(/Exception:[^<\r\n]+/)
      if (match) errorDetail = match[0].trim()
    } else if (
      text.includes('Authorization is required') ||
      text.includes('accounts.google.com') ||
      text.includes('Sign in') ||
      text.includes('accounts.google.com/signin')
    ) {
      errorDetail =
        'Permisos pendientes en Google Sheets: Abre tu hoja → Extensiones → Apps Script, autoriza los permisos y asegúrate de que el acceso sea "Cualquier usuario" (Anyone).'
    } else if (text.includes('Script function not found')) {
      errorDetail = 'Función no encontrada en el script remoto. Actualiza el código de Apps Script desde Ajustes ⚙️.'
    } else if (text.includes('<title>')) {
      const match = text.match(/<title>([^<]+)<\/title>/)
      if (match && !match[1].toLowerCase().includes('error')) {
        errorDetail = match[1].trim()
      }
    }

    if (!errorDetail) {
      const cleanSnippet = text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
      if (cleanSnippet && !cleanSnippet.toLowerCase().includes('doctype')) {
        errorDetail = cleanSnippet
      }
    }

    const finalErrorMsg =
      errorDetail ||
      'El servidor de Google Sheets devolvió un error HTML. Copia el código actualizado desde Ajustes ⚙️ y vuelve a implementarlo en tu Apps Script.'

    if (task) {
      task.endError(finalErrorMsg, `Error HTML de Apps Script en ${params.action}`, text.slice(0, 300))
    }

    throw new Error(finalErrorMsg)
  }

  if (data.error) {
    if (task) {
      task.endError(data.error, `Error devuelto por Apps Script en ${params.action}`, data)
    }
    throw new Error(data.error)
  }

  if (task) {
    const resSummary = {
      status: data.status || 'ok',
      month: data.month,
      income: data.income,
      summary: data.summary
        ? {
            income: data.summary.income,
            fixed: data.summary.fixedExpenses,
            variable: data.summary.variableExpenses,
            remaining: data.summary.remainingMonth,
          }
        : undefined,
      expensesCount: Array.isArray(data.expenses) ? data.expenses.length : undefined,
    }
    task.endSuccess(resSummary, `${params.action || 'Llamada'} exitosa`)
  }

  // Guardar automáticamente la URL del spreadsheet si viene en la respuesta
  if (data.spreadsheetUrl) {
    setSpreadsheetUrl(data.spreadsheetUrl)
  }

  return data
}

export async function testConnection(urlToTest) {
  const norm = normalizeScriptUrl(urlToTest)
  const validation = validateScriptUrl(norm)
  if (!validation.valid) {
    if (isDebugEnabled()) {
      logTask({
        action: 'testConnection',
        status: 'error',
        title: 'Validación URL fallida',
        error: validation.error,
        params: { url: urlToTest },
      })
    }
    throw new Error(validation.error)
  }

  const task = isDebugEnabled()
    ? startTask('testConnection', { url: norm }, 'Comprobando conexión con Apps Script (ping)')
    : null

  const testUrl = `${norm}?action=ping&_t=${Date.now()}`
  let response
  let text = ''
  try {
    response = await fetch(testUrl, { method: 'GET', redirect: 'follow' })
    text = await response.text()
  } catch (err) {
    const errorMsg = 'No se pudo conectar con el servidor: ' + (err.message || 'Error de conexión')
    if (task) task.endError(errorMsg, 'Fallo de red en ping de conexión')
    throw new Error(errorMsg)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch (_) {
    let errStr = ''
    if (text.includes('No se puede abrir el archivo') || text.includes('Página no encontrada')) {
      errStr =
        'Google devolvió "Página no encontrada". Verifica que la URL termine en "/exec" y que en la configuración de la implementación el acceso sea "Cualquier persona" (Anyone).'
    } else if (text.includes('Authorization is required') || text.includes('accounts.google.com')) {
      errStr =
        'Permisos pendientes en Google Sheets. Abre tu hoja → Extensiones → Apps Script, autoriza los permisos y asegúrate de que el acceso sea "Cualquier persona".'
    } else {
      errStr =
        'El script devolvió una respuesta no válida. Asegúrate de haber copiado el código completo de Apps Script y creado una Nueva Implementación como Aplicación Web.'
    }

    if (task) task.endError(errStr, 'Fallo de respuesta en testConnection', text.slice(0, 300))
    throw new Error(errStr)
  }

  if (data?.error) {
    if (task) task.endError(data.error, 'Apps Script devolvió error en testConnection', data)
    throw new Error(data.error)
  }

  if (task) {
    task.endSuccess(data, `Conexión verificada (Versión ${data.version || '3.0'})`)
  }

  return { success: true, data }
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

export function getCachedIncomeCategories() {
  const cached = getCacheEntry('categories')
  return cached?.incomeCategories || ['Euromar', 'Euromar Extra', 'Bizzum Tarjeta Rest', 'Bizz', 'Nómina', 'Extra']
}

/* ---- Categorías ---- */

export async function getCategories() {
  try {
    const data = await callApi({ action: 'getCategories' })
    if (data.categories?.length > 0 || data.incomeCategories?.length > 0) {
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

export async function getMonthData(month, knownRowCount = null) {
  try {
    const payload = { action: 'getMonthData', month }
    if (knownRowCount != null) payload.knownRowCount = String(knownRowCount)
    const data = await callApi(payload)
    if (data?.unchanged) {
      return data
    }
    if (data?.summary) {
      setCacheEntry('summary_' + month, data.summary)
    }
    if (data?.expenses) {
      setCacheEntry('expenses_' + month, { expenses: data.expenses, month, lastRow: data.lastRow })
    }
    if (data?.incomes) {
      setCacheEntry('incomes_' + month, { incomes: data.incomes, month })
    }
    if (data?.fixedExpenses) {
      const safeList = sanitizeAndMergeFixedExpenses([], data.fixedExpenses)
      const total = safeList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
      setCacheEntry('fixed_expenses_' + month, {
        month,
        fixedExpenses: safeList,
        totalActive: total,
        hasCheckbox: data.hasCheckbox ?? true,
      })
    }
    return data
  } catch (err) {
    // Si la acción unificada getMonthData no estuviera implementada en el Apps Script remoto,
    // fallback transparente a llamadas individuales
    const [summary, expenses] = await Promise.all([
      getSummary(month),
      getExpenses(month),
    ])
    return {
      month,
      summary,
      expenses: expenses.expenses || [],
    }
  }
}

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

export function reconcilePendingExpenses(month, serverExpenses = []) {
  const pending = getPendingExpenses()
  if (pending.length === 0 || !Array.isArray(serverExpenses) || serverExpenses.length === 0) return

  let changed = false
  const remaining = pending.filter((pe) => {
    if (pe.month !== month) return true
    const peAmt = parseFloat(String(pe.amount).replace(',', '.')) || 0
    const peCat = String(pe.category || '').trim().toLowerCase()

    const existsInServer = serverExpenses.some((se) => {
      const seAmt = parseFloat(String(se.amount).replace(',', '.')) || 0
      const seCat = String(se.category || '').trim().toLowerCase()
      return seCat === peCat && Math.abs(seAmt - peAmt) < 0.01
    })

    if (existsInServer) {
      changed = true
      return false
    }
    return true
  })

  if (changed) {
    savePendingExpenses(remaining)
  }
}

export async function setSavingsGoal(month, amount) {
  const parsed = parseFloat(String(amount).replace(',', '.'))
  if (isNaN(parsed) || parsed < 0) throw new Error('Meta de ahorro no válida')

  const cacheKey = `summary_${month}`
  const cached = getCacheEntry(cacheKey) || {}
  const previousSummary = cached ? { ...cached } : null

  const income = cached.income || 0
  const fixed = cached.fixedExpenses || 0
  const variable = cached.variableExpenses || 0
  const remaining = income - fixed - variable - parsed
  const updatedSummary = {
    ...cached,
    month,
    desiredSavings: parsed,
    remainingMonth: remaining,
    savings: remaining,
  }
  setCacheEntry(cacheKey, updatedSummary)

  try {
    const result = await callApi({
      action: 'setSavingsGoal',
      month,
      amount: String(parsed),
    })

    if (result?.summary) {
      setCacheEntry(cacheKey, result.summary)
    }

    return result
  } catch (err) {
    if (previousSummary) {
      setCacheEntry(cacheKey, previousSummary)
    }
    throw err
  }
}

export async function setTotalIncome(month, amount, category) {
  const parsed = parseFloat(String(amount).replace(',', '.'))
  if (isNaN(parsed) || parsed < 0) throw new Error('Importe de ingresos no válido')

  const cacheKey = `summary_${month}`
  const cached = getCacheEntry(cacheKey) || {}
  const previousSummary = cached ? { ...cached } : null

  const fixed = cached.fixedExpenses || 0
  const variable = cached.variableExpenses || 0
  const desiredSavings = cached.desiredSavings || 0
  const remaining = parsed - fixed - variable - desiredSavings
  const updatedSummary = {
    ...cached,
    month,
    income: parsed,
    remainingMonth: remaining,
    savings: remaining,
  }
  setCacheEntry(cacheKey, updatedSummary)

  const payload = {
    action: 'setTotalIncome',
    month,
    amount: String(parsed),
  }
  if (category) {
    payload.category = String(category).trim()
  }

  try {
    const result = await callApi(payload)

    if (result?.summary) {
      const safeSummary = {
        ...result.summary,
        income: result.summary.income > 0 ? result.summary.income : parsed,
        remainingMonth: (result.summary.income > 0 ? result.summary.income : parsed) - (result.summary.fixedExpenses || fixed) - (result.summary.variableExpenses || variable) - (result.summary.desiredSavings || desiredSavings),
      }
      setCacheEntry(cacheKey, safeSummary)
      if (result.lastRow) {
        const expKey = 'expenses_' + month
        const cachedExp = getCacheEntry(expKey) || {}
        setCacheEntry(expKey, { ...cachedExp, lastRow: result.lastRow })
      }
      return { ...result, summary: safeSummary }
    }

    return result
  } catch (err) {
    if (previousSummary) {
      setCacheEntry(cacheKey, previousSummary)
    }
    throw err
  }
}

export async function addExpenseDirect(month, category, amount) {
  const cleanCategory = String(category || '').trim()
  const result = await callApi({
    action: 'addExpense',
    month,
    category: cleanCategory,
    amount: String(amount),
  })

  if (result?.summary) {
    setCacheEntry('summary_' + month, result.summary)
  }
  if (result?.expenses) {
    setCacheEntry('expenses_' + month, { expenses: result.expenses, month, lastRow: result.lastRow })
  }
  if (result?.incomes) {
    setCacheEntry('incomes_' + month, { incomes: result.incomes, month })
  }

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

export async function addIncomeDirect(month, category, amount) {
  const cleanCategory = String(category || '').trim() || 'Euromar'
  const parsedAmt = parseFloat(String(amount).replace(',', '.'))

  // Invalidate or update cached summary immediately for 0ms latency
  const summaryKey = 'summary_' + month
  const cachedSum = getCacheEntry(summaryKey)
  if (cachedSum) {
    const updatedSum = {
      ...cachedSum,
      income: (cachedSum.income || 0) + parsedAmt,
      remainingMonth: (cachedSum.remainingMonth || 0) + parsedAmt,
      savings: (cachedSum.savings || 0) + parsedAmt,
    }
    setCacheEntry(summaryKey, updatedSum)
  }

  const result = await callApi({
    action: 'addIncome',
    month,
    category: cleanCategory,
    amount: String(parsedAmt),
  })

  if (result?.summary) {
    setCacheEntry(summaryKey, result.summary)
  }
  if (result?.lastRow) {
    const expensesKey = 'expenses_' + month
    const cachedExp = getCacheEntry(expensesKey) || {}
    setCacheEntry(expensesKey, { ...cachedExp, lastRow: result.lastRow })
  }
  if (result?.incomes) {
    setCacheEntry('incomes_' + month, { incomes: result.incomes, month })
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
    createdAt: Date.now(),
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
  const result = await callApi({
    action: 'updateExpense',
    month,
    row: String(row),
    oldCategory: String(oldCategory || '').trim(),
    oldAmount: String(oldAmount),
    newCategory: String(newCategory || '').trim(),
    newAmount: String(newAmount),
  })
  if (result?.summary) setCacheEntry('summary_' + month, result.summary)
  if (result?.expenses) setCacheEntry('expenses_' + month, { expenses: result.expenses, month })
  return result
}

export async function deleteExpense(month, row, category, amount) {
  const result = await callApi({
    action: 'deleteExpense',
    month,
    row: String(row),
    category: String(category || '').trim(),
    amount: String(amount),
  })
  if (result?.summary) setCacheEntry('summary_' + month, result.summary)
  if (result?.expenses) setCacheEntry('expenses_' + month, { expenses: result.expenses, month })
  return result
}

export async function syncPendingExpenses() {
  const pending = getPendingExpenses()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  const failed = []

  for (const expense of pending) {
    try {
      // Evitar duplicar gastos si ya existen en las filas del mes (por ejemplo, si el request original
      // se guardó en Google Sheets pero falló el acuse de recibo por corte de conexión)
      const cached = getCachedExpenses(expense.month)
      const serverList = cached?.expenses || []
      const expAmt = parseFloat(String(expense.amount).replace(',', '.')) || 0
      const expCat = String(expense.category || '').trim().toLowerCase()

      const alreadyExists = serverList.some((se) => {
        const seAmt = parseFloat(String(se.amount).replace(',', '.')) || 0
        const seCat = String(se.category || '').trim().toLowerCase()
        return seCat === expCat && Math.abs(seAmt - expAmt) < 0.01
      })

      if (alreadyExists) {
        synced++
        continue
      }

      const res = await callApi({
        action: 'addExpense',
        month: expense.month,
        category: String(expense.category || '').trim(),
        amount: String(expense.amount),
      })
      if (res?.summary) setCacheEntry('summary_' + expense.month, res.summary)
      if (res?.expenses) setCacheEntry('expenses_' + expense.month, { expenses: res.expenses, month: expense.month })
      synced++
    } catch {
      failed.push(expense)
    }
  }

  savePendingExpenses(failed)
  if (isDebugEnabled()) {
    logTask({
      action: 'syncPendingExpenses',
      status: failed.length > 0 ? (synced > 0 ? 'warning' : 'error') : 'success',
      title: `Sincronización de cola: ${synced} sincronizados, ${failed.length} fallidos`,
      params: { totalPending: pending.length, synced, failed: failed.length },
      details: { synced, failedCount: failed.length },
    })
  }
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
 * Obtiene los datos cacheados del Panel de Control de inmediato (0ms)
 */
export function getCachedControlPanelData() {
  const cached = getCacheEntry('control_panel_data')
  if (cached?.monthlyData && Array.isArray(cached.monthlyData)) {
    return cached
  }
  return DEFAULT_CONTROL_PANEL_DATA
}

/**
 * Obtiene los datos consolidados del Panel de Control.
 * Realiza múltiples capas de comprobación:
 * 1. Si no se fuerza refresco y hay caché en memoria, lo devuelve al instante.
 * 2. Consulta la acción rápida 'getControlPanelData'.
 * 3. Si falla la acción rápida, consulta en paralelo las hojas con 'getSummary'.
 */
export async function getControlPanelData(forceRefresh = false) {
  const cached = getCacheEntry('control_panel_data')

  if (!forceRefresh && cached?.monthlyData && Array.isArray(cached.monthlyData)) {
    return cached
  }

  let liveData = null

  // Intento 1: Acción directa y rápida del Apps Script
  try {
    const res = await callApi({
      action: 'getControlPanelData'
    })

    if (res?.monthlyData && Array.isArray(res.monthlyData) && res.monthlyData.length > 0) {
      liveData = res
      setCacheEntry('control_panel_data', liveData)
      return liveData
    }
  } catch (err) {
    console.warn('Acción getControlPanelData no disponible o fallida, usando agregación por meses:', err.message)
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
    const baseList = liveData?.monthlyData || cached?.monthlyData || DEFAULT_CONTROL_PANEL_DATA.monthlyData

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

