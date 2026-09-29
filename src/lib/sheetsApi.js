import { isDebugEnabled, startTask, logTask } from './debugLogger'

const STORAGE_KEY = 'sheets_script_url'
const SPREADSHEET_URL_STORAGE_KEY = 'sheets_spreadsheet_url'
const DATA_CACHE_KEY = 'sheets_data_cache'
const PENDING_KEY = 'sheets_pending_expenses'
const PUSH_QUEUE_KEY = 'sheets_push_queue'

const pushQueueListeners = new Set()

export function getPushQueue() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function savePushQueue(queue) {
  localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(queue))
  notifyPushQueueListeners()
}

export function subscribePushQueue(fn) {
  pushQueueListeners.add(fn)
  try {
    fn(getPushQueue())
  } catch (_) {}
  return () => pushQueueListeners.delete(fn)
}

function notifyPushQueueListeners() {
  const currentQueue = getPushQueue()
  pushQueueListeners.forEach((fn) => {
    try {
      fn(currentQueue)
    } catch (_) {}
  })
}

export function removePushTask(taskId) {
  const current = getPushQueue()
  const filtered = current.filter((t) => t.id !== taskId)
  savePushQueue(filtered)
}

export function clearPushQueue() {
  localStorage.removeItem(PUSH_QUEUE_KEY)
  notifyPushQueueListeners()
}

export { isDebugEnabled, logTask, startTask } from './debugLogger'

export const DEFAULT_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1KLn5Ow_eoclIyx2LB0P89JC7vwmNSRV60iBjNepoJjA/edit'

export const ALL_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]
export const ALL_SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

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

/* ================================================================
 *  LOCAL-FIRST STAGING SYSTEM (PILA / PAQUETE PENDIENTE DE PUSH)
 * ================================================================ */

export function stageAddExpense(month, category, amount) {
  const cleanCat = String(category || '').trim()
  const numAmt = parseFloat(String(amount).replace(',', '.'))
  if (!cleanCat || isNaN(numAmt) || numAmt <= 0) {
    throw new Error('Categoría o importe no válido')
  }

  // 1. Guardar en gastos locales del mes
  const cachedExp = getCachedExpenses(month) || { expenses: [], month }
  const localRow = `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const newExpense = {
    row: localRow,
    category: cleanCat,
    amount: numAmt,
    isLocal: true,
  }
  const updatedExpenses = [...(cachedExp.expenses || []), newExpense]
  setCacheEntry('expenses_' + month, { ...cachedExp, expenses: updatedExpenses })

  // 2. Recalcular y guardar resumen local
  const cachedSum = getCachedSummary(month) || {
    month,
    income: 0,
    fixedExpenses: 0,
    variableExpenses: 0,
    desiredSavings: 0,
    totalExpenses: 0,
    remainingMonth: 0,
    savings: 0,
  }
  const newVar = (cachedSum.variableExpenses || 0) + numAmt
  const newTot = (cachedSum.fixedExpenses || 0) + newVar
  const rem = (cachedSum.income || 0) - newTot - (cachedSum.desiredSavings || 0)
  const updatedSummary = {
    ...cachedSum,
    variableExpenses: Math.round(newVar * 100) / 100,
    totalExpenses: Math.round(newTot * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  // 3. Añadir categoría a caché local si es nueva
  const cachedCats = getCacheEntry('categories')
  if (cachedCats && Array.isArray(cachedCats.categories) && !cachedCats.categories.includes(cleanCat)) {
    setCacheEntry('categories', { ...cachedCats, categories: [...cachedCats.categories, cleanCat] })
  }

  // 4. Encolar tarea en la pila de Push
  const queue = getPushQueue()
  const task = {
    id: `add_exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: 'addExpense',
    month,
    payload: { category: cleanCat, amount: numAmt, localRow },
    title: 'Añadir gasto',
    description: `${cleanCat} · ${numAmt.toFixed(2)} €`,
    badge: `+${numAmt.toFixed(2)} €`,
    category: cleanCat,
    amount: numAmt,
    timestamp: Date.now(),
  }
  savePushQueue([...queue, task])

  return { success: true, summary: updatedSummary, expenses: updatedExpenses, expense: newExpense }
}

export function stageUpdateExpense(month, row, oldCategory, oldAmount, newCategory, newAmount) {
  const cleanCat = String(newCategory || '').trim()
  const numAmt = parseFloat(String(newAmount).replace(',', '.'))
  const oldAmt = parseFloat(String(oldAmount).replace(',', '.')) || 0

  if (!cleanCat || isNaN(numAmt) || numAmt <= 0) {
    throw new Error('Categoría o importe no válido')
  }

  // 1. Modificar en gastos locales
  const cachedExp = getCachedExpenses(month) || { expenses: [], month }
  const updatedExpenses = (cachedExp.expenses || []).map((e) =>
    e.row === row ? { ...e, category: cleanCat, amount: numAmt, isLocal: true } : e
  )
  setCacheEntry('expenses_' + month, { ...cachedExp, expenses: updatedExpenses })

  // 2. Modificar resumen local
  const cachedSum = getCachedSummary(month) || {}
  const diff = numAmt - oldAmt
  const newVar = (cachedSum.variableExpenses || 0) + diff
  const newTot = (cachedSum.fixedExpenses || 0) + newVar
  const rem = (cachedSum.income || 0) - newTot - (cachedSum.desiredSavings || 0)
  const updatedSummary = {
    ...cachedSum,
    variableExpenses: Math.round(newVar * 100) / 100,
    totalExpenses: Math.round(newTot * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  // 3. Cola de Push
  const queue = getPushQueue()
  let handled = false
  const updatedQueue = queue.map((t) => {
    if (t.action === 'addExpense' && t.payload?.localRow === row) {
      handled = true
      return {
        ...t,
        payload: { ...t.payload, category: cleanCat, amount: numAmt },
        description: `${cleanCat} · ${numAmt.toFixed(2)} €`,
        badge: `+${numAmt.toFixed(2)} €`,
        category: cleanCat,
        amount: numAmt,
      }
    }
    return t
  })

  if (!handled) {
    updatedQueue.push({
      id: `upd_exp_${month}_${row}_${Date.now()}`,
      action: 'updateExpense',
      month,
      payload: { row, oldCategory, oldAmount, newCategory: cleanCat, newAmount: numAmt },
      title: 'Modificar gasto',
      description: `${oldCategory} → ${cleanCat} (${numAmt.toFixed(2)} €)`,
      badge: `${numAmt.toFixed(2)} €`,
      category: cleanCat,
      amount: numAmt,
      timestamp: Date.now(),
    })
  }

  savePushQueue(updatedQueue)
  return { success: true, summary: updatedSummary, expenses: updatedExpenses }
}

export function stageDeleteExpense(month, row, category, amount) {
  const numAmt = parseFloat(String(amount).replace(',', '.')) || 0

  // 1. Eliminar de gastos locales
  const cachedExp = getCachedExpenses(month) || { expenses: [], month }
  const updatedExpenses = (cachedExp.expenses || []).filter((e) => e.row !== row)
  setCacheEntry('expenses_' + month, { ...cachedExp, expenses: updatedExpenses })

  // 2. Modificar resumen local
  const cachedSum = getCachedSummary(month) || {}
  const newVar = Math.max(0, (cachedSum.variableExpenses || 0) - numAmt)
  const newTot = (cachedSum.fixedExpenses || 0) + newVar
  const rem = (cachedSum.income || 0) - newTot - (cachedSum.desiredSavings || 0)
  const updatedSummary = {
    ...cachedSum,
    variableExpenses: Math.round(newVar * 100) / 100,
    totalExpenses: Math.round(newTot * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  // 3. Cola de Push
  const queue = getPushQueue()
  const isUnpushedAdd = queue.some((t) => t.action === 'addExpense' && t.payload?.localRow === row)
  if (isUnpushedAdd) {
    savePushQueue(queue.filter((t) => !(t.action === 'addExpense' && t.payload?.localRow === row)))
  } else {
    const task = {
      id: `del_exp_${month}_${row}_${Date.now()}`,
      action: 'deleteExpense',
      month,
      payload: { row, category, amount: numAmt },
      title: 'Eliminar gasto',
      description: `${category} · ${numAmt.toFixed(2)} €`,
      badge: `-${numAmt.toFixed(2)} €`,
      category,
      amount: numAmt,
      timestamp: Date.now(),
    }
    savePushQueue([...queue, task])
  }

  return { success: true, summary: updatedSummary, expenses: updatedExpenses }
}

export function stageSetFixedExpenseStatus(month, row, active, category = '', amount = 0) {
  const cachedFixed = getCachedFixedExpenses(month)
  const currentList =
    cachedFixed?.fixedExpenses && cachedFixed.fixedExpenses.length > 0
      ? cachedFixed.fixedExpenses
      : sanitizeAndMergeFixedExpenses([], [])
  const numRow = parseInt(row, 10)

  const updatedExpenses = sanitizeAndMergeFixedExpenses(
    currentList,
    currentList.map((fe) => (fe.row === numRow ? { ...fe, active } : fe))
  )
  const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)

  setCacheEntry('fixed_expenses_' + month, {
    month,
    fixedExpenses: updatedExpenses,
    totalActive: newTotalActive,
    hasCheckbox: true,
  })

  // Summary
  const cachedSum = getCachedSummary(month) || {}
  const prevFixed = cachedSum.fixedExpenses || 0
  const diff = newTotalActive - prevFixed
  const newTot = newTotalActive + (cachedSum.variableExpenses || 0)
  const rem = (cachedSum.income || 0) - newTot - (cachedSum.desiredSavings || 0)
  const updatedSummary = {
    ...cachedSum,
    fixedExpenses: Math.round(newTotalActive * 100) / 100,
    totalExpenses: Math.round(newTot * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  // Push queue
  const queue = getPushQueue()
  const targetId = `fix_status_${month}_${numRow}`
  const catName = category || updatedExpenses.find((e) => e.row === numRow)?.category || 'Gasto fijo'
  const itemAmt = amount || updatedExpenses.find((e) => e.row === numRow)?.amount || 0

  const filteredQueue = queue.filter((t) => t.id !== targetId)
  const task = {
    id: targetId,
    action: 'setFixedExpenseStatus',
    month,
    payload: { row: numRow, active },
    title: active ? 'Activar gasto fijo' : 'Desactivar gasto fijo',
    description: `${catName} (${itemAmt.toFixed(2)} €)`,
    badge: active ? 'Activo' : 'Desactivado',
    category: catName,
    amount: itemAmt,
    timestamp: Date.now(),
  }
  savePushQueue([...filteredQueue, task])

  return { success: true, summary: updatedSummary, fixedExpenses: updatedExpenses, totalActive: newTotalActive }
}

export function stageSetFixedExpenseAmount(month, row, amount, category = '') {
  const numAmount = parseFloat(String(amount).replace(',', '.')) || 0
  const cachedFixed = getCachedFixedExpenses(month)
  const currentList =
    cachedFixed?.fixedExpenses && cachedFixed.fixedExpenses.length > 0
      ? cachedFixed.fixedExpenses
      : sanitizeAndMergeFixedExpenses([], [])
  const numRow = parseInt(row, 10)

  const updatedExpenses = sanitizeAndMergeFixedExpenses(
    currentList,
    currentList.map((fe) =>
      fe.row === numRow ? { ...fe, amount: numAmount, ...(category ? { category } : {}) } : fe
    )
  )
  const newTotalActive = updatedExpenses.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)

  setCacheEntry('fixed_expenses_' + month, {
    month,
    fixedExpenses: updatedExpenses,
    totalActive: newTotalActive,
    hasCheckbox: true,
  })

  // Summary
  const cachedSum = getCachedSummary(month) || {}
  const newTot = newTotalActive + (cachedSum.variableExpenses || 0)
  const rem = (cachedSum.income || 0) - newTot - (cachedSum.desiredSavings || 0)
  const updatedSummary = {
    ...cachedSum,
    fixedExpenses: Math.round(newTotalActive * 100) / 100,
    totalExpenses: Math.round(newTot * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  // Push queue
  const queue = getPushQueue()
  const targetId = `fix_amt_${month}_${numRow}`
  const catName = category || updatedExpenses.find((e) => e.row === numRow)?.category || 'Gasto fijo'

  const filteredQueue = queue.filter((t) => t.id !== targetId)
  const task = {
    id: targetId,
    action: 'setFixedExpenseAmount',
    month,
    payload: { row: numRow, amount: numAmount, category: catName },
    title: 'Modificar importe fijo',
    description: `${catName} · ${numAmount.toFixed(2)} €`,
    badge: `${numAmount.toFixed(2)} €`,
    category: catName,
    amount: numAmount,
    timestamp: Date.now(),
  }
  savePushQueue([...filteredQueue, task])

  return { success: true, summary: updatedSummary, fixedExpenses: updatedExpenses, totalActive: newTotalActive }
}

export function stageSetTotalIncome(month, amount, category = 'Euromar') {
  const numAmount = parseFloat(String(amount).replace(',', '.')) || 0
  const cachedSum = getCachedSummary(month) || {}

  const fixed = cachedSum.fixedExpenses || 0
  const variable = cachedSum.variableExpenses || 0
  const desiredSavings = cachedSum.desiredSavings || 0
  const rem = numAmount - fixed - variable - desiredSavings

  const updatedSummary = {
    ...cachedSum,
    month,
    income: numAmount,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  const queue = getPushQueue()
  const targetId = `income_${month}`
  const filteredQueue = queue.filter((t) => t.id !== targetId)
  const task = {
    id: targetId,
    action: 'setTotalIncome',
    month,
    payload: { amount: numAmount, category },
    title: 'Actualizar ingresos',
    description: `Ingresos ${month} · ${numAmount.toFixed(2)} €`,
    badge: `${numAmount.toFixed(2)} €`,
    amount: numAmount,
    timestamp: Date.now(),
  }
  savePushQueue([...filteredQueue, task])

  return { success: true, summary: updatedSummary }
}

export function stageSetSavingsGoal(month, amount) {
  const numAmount = parseFloat(String(amount).replace(',', '.')) || 0
  const cachedSum = getCachedSummary(month) || {}

  const inc = cachedSum.income || 0
  const fixed = cachedSum.fixedExpenses || 0
  const variable = cachedSum.variableExpenses || 0
  const rem = inc - fixed - variable - numAmount

  const updatedSummary = {
    ...cachedSum,
    month,
    desiredSavings: numAmount,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  const queue = getPushQueue()
  const targetId = `savings_${month}`
  const filteredQueue = queue.filter((t) => t.id !== targetId)
  const task = {
    id: targetId,
    action: 'setSavingsGoal',
    month,
    payload: { amount: numAmount },
    title: 'Meta de ahorro',
    description: `Objetivo ${month} · ${numAmount.toFixed(2)} €`,
    badge: `${numAmount.toFixed(2)} €`,
    amount: numAmount,
    timestamp: Date.now(),
  }
  savePushQueue([...filteredQueue, task])

  return { success: true, summary: updatedSummary }
}

export function stageSetMonthFinalized(month, finalized) {
  const queue = getPushQueue()
  const targetId = `month_status_${month}`
  const filteredQueue = queue.filter((t) => t.id !== targetId)
  const task = {
    id: targetId,
    action: 'setMonthFinalized',
    month,
    payload: { finalized: Boolean(finalized) },
    title: finalized ? 'Finalizar mes' : 'Reabrir mes',
    description: `${month} · ${finalized ? 'Finalizado' : 'Reabierto'}`,
    badge: finalized ? 'Finalizado' : 'Reabierto',
    timestamp: Date.now(),
  }
  savePushQueue([...filteredQueue, task])
  return { success: true }
}

export async function getMonthFinalizedStatuses() {
  const result = await callApi({ action: 'getMonthFinalizedStatuses' })
  return result?.statuses || {}
}

export function stageAddIncome(month, category, amount) {
  const cleanCat = String(category || '').trim() || 'Euromar'
  const numAmt = parseFloat(String(amount).replace(',', '.')) || 0

  const cachedSum = getCachedSummary(month) || {}
  const newInc = (cachedSum.income || 0) + numAmt
  const fixed = cachedSum.fixedExpenses || 0
  const variable = cachedSum.variableExpenses || 0
  const desiredSavings = cachedSum.desiredSavings || 0
  const rem = newInc - fixed - variable - desiredSavings

  const updatedSummary = {
    ...cachedSum,
    month,
    income: Math.round(newInc * 100) / 100,
    remainingMonth: Math.round(rem * 100) / 100,
    savings: Math.round(rem * 100) / 100,
  }
  setCacheEntry('summary_' + month, updatedSummary)

  const queue = getPushQueue()
  const task = {
    id: `add_inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: 'addIncome',
    month,
    payload: { category: cleanCat, amount: numAmt },
    title: 'Añadir ingreso',
    description: `${cleanCat} · ${numAmt.toFixed(2)} € (${month})`,
    badge: `+${numAmt.toFixed(2)} €`,
    category: cleanCat,
    amount: numAmt,
    timestamp: Date.now(),
  }
  savePushQueue([...queue, task])

  return { success: true, summary: updatedSummary }
}

/**
 * Descarga de Google Sheets bajo petición (Pull on Demand)
 */
export async function pullMonthDataFromSheets(month) {
  // getMonthData ya incluye gastos fijos; evitar una segunda lectura completa de la hoja.
  const data = await callApi({ action: 'getMonthData', month })
  const fixedData = data

  // 1. Procesar y guardar gastos fijos
  let fixedExpensesList = []
  let totalFixed = 0
  const rawFixed = (fixedData?.fixedExpenses && fixedData.fixedExpenses.length > 0)
    ? fixedData.fixedExpenses
    : (data?.fixedExpenses && data.fixedExpenses.length > 0 ? data.fixedExpenses : null)

  if (rawFixed && Array.isArray(rawFixed)) {
    fixedExpensesList = sanitizeAndMergeFixedExpenses([], rawFixed)
    totalFixed = fixedExpensesList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: fixedExpensesList,
      totalActive: totalFixed,
      hasCheckbox: fixedData?.hasCheckbox ?? data?.hasCheckbox ?? true,
    })
  } else {
    const cachedFixed = getCachedFixedExpenses(month)
    if (cachedFixed?.fixedExpenses && cachedFixed.fixedExpenses.length > 0) {
      fixedExpensesList = cachedFixed.fixedExpenses
      totalFixed = cachedFixed.totalActive || fixedExpensesList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    }
  }

  // 2. Procesar Gastos Variables
  if (data?.expenses) {
    setCacheEntry('expenses_' + month, { expenses: data.expenses, month, lastRow: data.lastRow })
  }

  // 3. Procesar Ingresos
  if (data?.incomes) {
    setCacheEntry('incomes_' + month, { incomes: data.incomes, month })
  }

  // 4. Consolidar Resumen
  const baseSummary = data?.summary || fixedData?.summary || getCachedSummary(month) || {}
  const income = baseSummary.income ?? baseSummary.totalIncome ?? 0
  const variable = baseSummary.variableExpenses ?? baseSummary.variable ?? 0
  const savingsGoal = baseSummary.desiredSavings || 0

  // El total de gastos fijos: usar totalFixed si las casillas están activas, o baseSummary
  const serverFixed = baseSummary.fixedExpenses ?? baseSummary.fixed ?? 0
  const finalFixed = totalFixed > 0 ? totalFixed : serverFixed
  const totalExp = Math.round((finalFixed + variable) * 100) / 100
  const remaining = Math.round((income - totalExp - savingsGoal) * 100) / 100

  const consolidatedSummary = {
    ...baseSummary,
    month,
    income: Math.round(income * 100) / 100,
    fixedExpenses: Math.round(finalFixed * 100) / 100,
    variableExpenses: Math.round(variable * 100) / 100,
    totalExpenses: totalExp,
    desiredSavings: Math.round(savingsGoal * 100) / 100,
    remainingMonth: remaining,
    savings: remaining,
  }

  setCacheEntry('summary_' + month, consolidatedSummary)

  return {
    ...data,
    summary: consolidatedSummary,
    expenses: data?.expenses || [],
    fixedExpenses: fixedExpensesList,
    totalActiveFixed: finalFixed,
  }
}

/**
 * Ejecuta el Push de todas las tareas acumuladas en la pila a Google Sheets.
 */
export async function pushAllChanges(onProgress = null) {
  const tasks = getPushQueue()
  if (tasks.length === 0) {
    return { success: true, count: 0, message: 'No hay cambios pendientes' }
  }

  // 1. Intento por lote rápido (Batch Push - Apps Script v3.6.0)
  try {
    const batchPayload = tasks.map((t) => ({
      action: t.action,
      month: t.month,
      payload: t.payload,
    }))

    const batchRes = await callApi(
      {
        action: 'pushBatchChanges',
        tasks: JSON.stringify(batchPayload),
      },
      'POST'
    )

    if (batchRes && batchRes.success === true && batchRes.processed >= tasks.length) {
      if (batchRes.monthsData) {
        Object.entries(batchRes.monthsData).forEach(([m, mData]) => {
          if (mData?.summary) setCacheEntry('summary_' + m, mData.summary)
          if (mData?.expenses) {
            setCacheEntry('expenses_' + m, {
              expenses: mData.expenses,
              month: m,
              lastRow: mData.lastRow,
            })
          }
          if (mData?.fixedExpenses) {
            const safeList = sanitizeAndMergeFixedExpenses([], mData.fixedExpenses)
            const total = safeList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
            setCacheEntry('fixed_expenses_' + m, {
              month: m,
              fixedExpenses: safeList,
              totalActive: total,
              hasCheckbox: mData.hasCheckbox ?? true,
            })
          }
        })
      }
      clearPushQueue()
      return { success: true, count: tasks.length }
    }
  } catch (batchErr) {
    console.warn('Batch push falló o versión previa de Apps Script, procediendo secuencialmente:', batchErr.message)
  }

  // 2. Envío secuencial con notificación de progreso
  // Si el lote se aplicó pero se perdió la respuesta, no repetir altas ya visibles.
  // Esto evita duplicados por timeout o cortes de red después de escribir en Sheets.
  let tasksToSend = tasks
  try {
    const addTasks = tasks.filter((task) => task.action === 'addExpense')
    const months = [...new Set(addTasks.map((task) => task.month))]
    const serverCounts = {}
    const baselineCounts = {}
    tasks.forEach((task) => {
      if (task.action !== 'addExpense') return
      const cached = getCachedExpenses(task.month)
      ;(cached?.expenses || []).filter((expense) => !expense.isLocal).forEach((expense) => {
        const key = `${task.month}|${String(expense.category || '').trim().toLowerCase()}|${Number(expense.amount || 0).toFixed(2)}`
        baselineCounts[key] = (baselineCounts[key] || 0) + 1
      })
    })
    for (const month of months) {
      const data = await callApi({ action: 'getMonthData', month })
      ;(data.expenses || []).forEach((expense) => {
        const key = `${month}|${String(expense.category || '').trim().toLowerCase()}|${Number(expense.amount || 0).toFixed(2)}`
        serverCounts[key] = (serverCounts[key] || 0) + 1
      })
    }

    const consumed = {}
    tasksToSend = tasks.filter((task) => {
      if (task.action !== 'addExpense') return true
      const key = `${task.month}|${String(task.payload?.category || '').trim().toLowerCase()}|${Number(task.payload?.amount || 0).toFixed(2)}`
      const alreadyAvailable = Math.max(0, (serverCounts[key] || 0) - (baselineCounts[key] || 0))
      const alreadyConsumed = consumed[key] || 0
      if (alreadyConsumed < alreadyAvailable) {
        consumed[key] = alreadyConsumed + 1
        return false
      }
      consumed[key] = alreadyConsumed + 1
      return true
    })
  } catch (reconcileErr) {
    console.warn('No se pudo reconciliar el lote antes del fallback:', reconcileErr.message)
    tasksToSend = tasks
  }

  let completed = 0
  const failed = []

  for (let i = 0; i < tasksToSend.length; i++) {
    const t = tasksToSend[i]
    onProgress?.({ current: i + 1, total: tasksToSend.length, task: t })

    try {
      if (t.action === 'addExpense') {
        await addExpenseDirect(t.month, t.payload.category, t.payload.amount)
      } else if (t.action === 'updateExpense') {
        await updateExpense(
          t.month,
          t.payload.row,
          t.payload.oldCategory,
          t.payload.oldAmount,
          t.payload.newCategory,
          t.payload.newAmount
        )
      } else if (t.action === 'deleteExpense') {
        await deleteExpense(t.month, t.payload.row, t.payload.category, t.payload.amount)
      } else if (t.action === 'setFixedExpenseStatus') {
        await setFixedExpenseStatus(t.month, t.payload.row, t.payload.active)
      } else if (t.action === 'setFixedExpenseAmount') {
        await setFixedExpenseAmount(t.month, t.payload.row, t.payload.amount, t.payload.category)
      } else if (t.action === 'setTotalIncome') {
        await setTotalIncome(t.month, t.payload.amount, t.payload.category)
      } else if (t.action === 'setSavingsGoal') {
        await setSavingsGoal(t.month, t.payload.amount)
      } else if (t.action === 'setMonthFinalized') {
        await callApi({
          action: 'setMonthFinalized',
          month: t.month,
          finalized: t.payload.finalized ? 'true' : 'false',
        })
      } else if (t.action === 'addIncome') {
        await addIncomeDirect(t.month, t.payload.category, t.payload.amount)
      }
      completed++
    } catch (taskErr) {
      console.error('Error procesando tarea en push secuencial:', t, taskErr)
      failed.push(t)
    }
  }

  savePushQueue(failed)

  if (failed.length > 0) {
    throw new Error(`Se subieron ${completed} de ${tasksToSend.length} cambios. ${failed.length} no pudieron guardarse.`)
  }

  return { success: true, count: tasks.length }
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

const inFlightAddExpenses = new Map()

export async function addExpenseDirect(month, category, amount) {
  const cleanCategory = String(category || '').trim()
  const parsedAmt = parseFloat(String(amount).replace(',', '.'))
  const key = `${month}_${cleanCategory.toLowerCase()}_${parsedAmt}`

  if (inFlightAddExpenses.has(key)) {
    return inFlightAddExpenses.get(key)
  }

  const promise = (async () => {
    try {
      const result = await callApi({
        action: 'addExpense',
        month,
        category: cleanCategory,
        amount: String(parsedAmt),
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
    } finally {
      setTimeout(() => {
        inFlightAddExpenses.delete(key)
      }, 1500)
    }
  })()

  inFlightAddExpenses.set(key, promise)
  return promise
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
  // Avoid duplicate insertion into pending queue
  const cleanCat = String(category || '').trim()
  const numAmt = parseFloat(String(amount).replace(',', '.')) || 0
  const alreadyInPending = pending.some(
    (p) =>
      p.month === month &&
      p.category.toLowerCase() === cleanCat.toLowerCase() &&
      Math.abs((parseFloat(String(p.amount).replace(',', '.')) || 0) - numAmt) < 0.01 &&
      Date.now() - p.createdAt < 30000
  )
  if (alreadyInPending) return

  pending.push({
    month,
    category: cleanCat,
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
  const cleanNewCat = String(newCategory || '').trim()
  const parsedNewAmt = parseFloat(String(newAmount).replace(',', '.'))

  // Optimistic update of local cache
  const cachedExp = getCachedExpenses(month)
  if (cachedExp?.expenses) {
    const updatedExpenses = cachedExp.expenses.map((e) =>
      e.row === row ? { ...e, category: cleanNewCat, amount: parsedNewAmt } : e
    )
    setCacheEntry('expenses_' + month, { ...cachedExp, expenses: updatedExpenses })
  }

  const result = await callApi({
    action: 'updateExpense',
    month,
    row: String(row),
    oldCategory: String(oldCategory || '').trim(),
    oldAmount: String(oldAmount),
    newCategory: cleanNewCat,
    newAmount: String(parsedNewAmt),
  })

  if (result?.summary) setCacheEntry('summary_' + month, result.summary)
  if (result?.expenses) setCacheEntry('expenses_' + month, { expenses: result.expenses, month, lastRow: result.lastRow })
  return result
}

export async function deleteExpense(month, row, category, amount) {
  // Optimistic update of local cache
  const cachedExp = getCachedExpenses(month)
  if (cachedExp?.expenses) {
    const updatedExpenses = cachedExp.expenses.filter((e) => e.row !== row)
    setCacheEntry('expenses_' + month, { ...cachedExp, expenses: updatedExpenses })
  }

  const result = await callApi({
    action: 'deleteExpense',
    month,
    row: String(row),
    category: String(category || '').trim(),
    amount: String(amount),
  })

  if (result?.summary) setCacheEntry('summary_' + month, result.summary)
  if (result?.expenses) setCacheEntry('expenses_' + month, { expenses: result.expenses, month, lastRow: result.lastRow })
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

function parseActiveBoolean(val, fallback = false) {
  if (val === true || val === 1 || val === '1') return true
  if (val === false || val === 0 || val === '0') return false
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase()
    if (['true', 'verdadero', 'v', 'si', 'sí', 'yes', 'y', 'checked', 'ok', 'x', '1'].includes(s)) return true
    if (['false', 'falso', 'f', 'no', 'unchecked', '0', ''].includes(s)) return false
  }
  return fallback
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
      mapByRow.set(it.row, { ...it, category: cat, amount: amt, active: parseActiveBoolean(it.active, false) })
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

      const rawActive = inc.active !== undefined
        ? inc.active
        : (inc.checked !== undefined ? inc.checked : (inc.isChecked !== undefined ? inc.isChecked : inc.status))
      
      const isActive = rawActive !== undefined
        ? parseActiveBoolean(rawActive, existing?.active ?? false)
        : (existing?.active ?? false)

      if (existing) {
        mapByRow.set(inc.row, {
          ...existing,
          active: isActive,
          amount: safeAmt,
          category: safeCat,
          hasCheckbox: inc.hasCheckbox !== undefined ? inc.hasCheckbox : existing.hasCheckbox,
        })
      } else {
        mapByRow.set(inc.row, {
          row: inc.row,
          category: safeCat,
          amount: safeAmt,
          active: isActive,
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
    if (data && Array.isArray(data.fixedExpenses) && data.fixedExpenses.length > 0) {
      safeList = sanitizeAndMergeFixedExpenses([], data.fixedExpenses)
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

    // Actualizar también el resumen mensual en caché
    const cachedSummary = getCachedSummary(month)
    if (cachedSummary) {
      const varExp = cachedSummary.variableExpenses || 0
      const inc = cachedSummary.income || 0
      const sav = cachedSummary.desiredSavings || 0
      const newTotalExp = Math.round((total + varExp) * 100) / 100
      const newRem = Math.round((inc - newTotalExp - sav) * 100) / 100
      const updatedSummary = {
        ...cachedSummary,
        fixedExpenses: total,
        totalExpenses: newTotalExp,
        remainingMonth: newRem,
        savings: newRem,
      }
      setCacheEntry('summary_' + month, updatedSummary)
      safeData.summary = updatedSummary
    }

    return safeData
  } catch (err) {
    const cached = getCachedFixedExpenses(month)
    if (cached) return cached
    throw err
  }
}

/**
 * Guarda los datos de un mes completo en el almacenamiento local:
 * Gastos fijos con casillas, gastos variables, ingresos y resumen mensual consolidado.
 */
export function saveSingleMonthDataToCache(month, data) {
  if (!data || data.error) return null

  // 1. Gastos fijos con estado exacto de casillas (active: true / false)
  let fixedExpensesList = []
  let totalFixed = 0
  if (data.fixedExpenses && Array.isArray(data.fixedExpenses) && data.fixedExpenses.length > 0) {
    fixedExpensesList = sanitizeAndMergeFixedExpenses([], data.fixedExpenses)
    totalFixed = fixedExpensesList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    setCacheEntry('fixed_expenses_' + month, {
      month,
      fixedExpenses: fixedExpensesList,
      totalActive: totalFixed,
      hasCheckbox: data.hasCheckbox ?? true,
    })
  } else {
    const cachedFixed = getCachedFixedExpenses(month)
    if (cachedFixed?.fixedExpenses && cachedFixed.fixedExpenses.length > 0) {
      fixedExpensesList = cachedFixed.fixedExpenses
      totalFixed = cachedFixed.totalActive || fixedExpensesList.reduce((acc, fe) => (fe.active ? acc + (fe.amount || 0) : acc), 0)
    }
  }

  // 2. Gastos Variables
  if (data.expenses && Array.isArray(data.expenses)) {
    setCacheEntry('expenses_' + month, {
      expenses: data.expenses,
      month,
      lastRow: data.lastRow || 22,
    })
  }

  // 3. Ingresos
  if (data.incomes && Array.isArray(data.incomes)) {
    setCacheEntry('incomes_' + month, {
      incomes: data.incomes,
      month,
    })
  }

  // 4. Resumen consolidado
  const baseSummary = data.summary || {}
  const income = baseSummary.income ?? baseSummary.totalIncome ?? 0
  const variable = baseSummary.variableExpenses ?? baseSummary.variable ?? 0
  const savingsGoal = baseSummary.desiredSavings || 0
  const serverFixed = baseSummary.fixedExpenses ?? baseSummary.fixed ?? 0
  const finalFixed = totalFixed > 0 ? totalFixed : serverFixed
  const totalExp = Math.round((finalFixed + variable) * 100) / 100
  const remaining = Math.round((income - totalExp - savingsGoal) * 100) / 100

  const consolidatedSummary = {
    ...baseSummary,
    month,
    income: Math.round(income * 100) / 100,
    fixedExpenses: Math.round(finalFixed * 100) / 100,
    variableExpenses: Math.round(variable * 100) / 100,
    totalExpenses: totalExp,
    desiredSavings: Math.round(savingsGoal * 100) / 100,
    remainingMonth: remaining,
    savings: remaining,
  }
  setCacheEntry('summary_' + month, consolidatedSummary)

  return {
    summary: consolidatedSummary,
    expenses: data.expenses || [],
    fixedExpenses: fixedExpensesList,
    incomes: data.incomes || [],
    totalActiveFixed: finalFixed,
    hasCheckbox: data.hasCheckbox ?? true,
  }
}

/**
 * Sincronización Total bajo petición (Pull Completo de Todo el Spreadsheet):
 * Descarga en 1 sola llamada rápida de ultra alto rendimiento:
 * 1. El mes actual (gastos variables, fijos con casillas, ingresos y resumen).
 * 2. Meses colindantes (mes anterior y siguiente con todos sus datos y casillas).
 * 3. Datos de las pestañas de PANEL DE CONTROL ('Data gráficos', 'Panel de control', 'Plan de ahorro').
 * 4. Categorías de gastos e ingresos.
 */
export async function fullSyncFromSheets(targetMonth) {
  const normMonth = targetMonth || 'Septiembre'

  // Intento 1: Llamada rápida unificada v4.0.0 (getFullSyncData)
  try {
    const res = await callApi({
      action: 'getFullSyncData',
      month: normMonth,
    })

    if (res && res.success && res.monthData) {
      // 1. Guardar mes actual
      saveSingleMonthDataToCache(normMonth, res.monthData)

      // 2. Guardar meses colindantes
      if (res.colindantMonths && typeof res.colindantMonths === 'object') {
        Object.entries(res.colindantMonths).forEach(([mName, mData]) => {
          if (mData && !mData.error) {
            saveSingleMonthDataToCache(mName, mData)
          }
        })
      }

      // 3. Guardar Panel de Control
      if (res.controlPanel && res.controlPanel.success) {
        setCacheEntry('control_panel_data', res.controlPanel)
      }

      // 4. Guardar Categorías
      if (res.categories && (res.categories.categories?.length > 0 || res.categories.incomeCategories?.length > 0)) {
        setCacheEntry('categories', res.categories)
      }

      return {
        success: true,
        month: normMonth,
        monthData: res.monthData,
        colindantMonths: res.colindantMonths,
        controlPanel: res.controlPanel,
        categories: res.categories,
      }
    }
  } catch (syncErr) {
    console.warn('Llamada unificada getFullSyncData no disponible en versión remota, ejecutando descarga paralela modular:', syncErr.message)
  }

  // Fallback transparente: Descarga concurrente de mes actual, colindantes, panel de control y categorías
  const targetIdx = ALL_MONTHS.indexOf(normMonth) !== -1 ? ALL_MONTHS.indexOf(normMonth) : 8
  const prevMonth = ALL_MONTHS[(targetIdx - 1 + 12) % 12]
  const nextMonth = ALL_MONTHS[(targetIdx + 1) % 12]

  const [mainRes, prevRes, nextRes, cpRes, catRes] = await Promise.allSettled([
    pullMonthDataFromSheets(normMonth),
    pullMonthDataFromSheets(prevMonth),
    pullMonthDataFromSheets(nextMonth),
    getControlPanelData(true),
    getCategories(),
  ])

  return {
    success: true,
    month: normMonth,
    monthData: mainRes.status === 'fulfilled' ? mainRes.value : null,
    colindantMonths: {
      [prevMonth]: prevRes.status === 'fulfilled' ? prevRes.value : null,
      [nextMonth]: nextRes.status === 'fulfilled' ? nextRes.value : null,
    },
    controlPanel: cpRes.status === 'fulfilled' ? cpRes.value : null,
    categories: catRes.status === 'fulfilled' ? catRes.value : null,
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

