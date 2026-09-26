// Sistema de registro de tareas y diagnóstico (DEBUG)

const DEBUG_STORAGE_KEY = 'control_gastos_debug_mode'
const LOGS_STORAGE_KEY = 'control_gastos_debug_logs'
const MAX_LOGS = 120

let isDebug = false
try {
  isDebug = localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
} catch (_) {
  isDebug = false
}

// In-memory cache de logs con persistencia
let memoryLogs = []
try {
  const saved = localStorage.getItem(LOGS_STORAGE_KEY)
  if (saved) {
    memoryLogs = JSON.parse(saved)
  }
} catch (_) {
  memoryLogs = []
}

const listeners = new Set()

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(memoryLogs)
    } catch (e) {
      console.error('[DebugLogger] Listener error:', e)
    }
  })
}

function persistLogs() {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(memoryLogs.slice(0, MAX_LOGS)))
  } catch (_) {}
}

export function isDebugEnabled() {
  return isDebug
}

export function setDebugEnabled(enabled) {
  isDebug = Boolean(enabled)
  try {
    localStorage.setItem(DEBUG_STORAGE_KEY, isDebug ? 'true' : 'false')
    if (isDebug) {
      logTask({
        action: 'debug_mode',
        type: 'info',
        status: 'success',
        title: 'Modo DEBUG activado',
        details: { activatedAt: new Date().toLocaleTimeString('es-ES') },
      })
    }
  } catch (_) {}
  notifyListeners()
  return isDebug
}

export function logTask(entry) {
  if (!isDebug) return null

  const timestamp = new Date()
  const timeFormatted = timestamp.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const newLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: timeFormatted,
    isoTime: timestamp.toISOString(),
    status: entry.status || 'info', // 'success' | 'error' | 'pending' | 'warning' | 'info'
    action: entry.action || 'general',
    title: entry.title || entry.action,
    params: entry.params ? JSON.parse(JSON.stringify(entry.params)) : null,
    durationMs: entry.durationMs || null,
    error: entry.error || null,
    response: entry.response ? (typeof entry.response === 'object' ? JSON.parse(JSON.stringify(entry.response)) : String(entry.response).slice(0, 300)) : null,
    details: entry.details || null,
  }

  memoryLogs = [newLog, ...memoryLogs].slice(0, MAX_LOGS)
  persistLogs()
  notifyListeners()
  return newLog.id
}

export function startTask(action, params = null, title = null) {
  if (!isDebug) return null

  const startTime = Date.now()
  const logId = logTask({
    action,
    title: title || `Ejecutando ${action}`,
    status: 'pending',
    params,
    details: { startTime },
  })

  return {
    id: logId,
    endSuccess: (response = null, customTitle = null) => {
      if (!isDebug || !logId) return
      const durationMs = Date.now() - startTime
      updateTask(logId, {
        status: 'success',
        durationMs,
        title: customTitle || `${action} completado con éxito`,
        response,
      })
    },
    endError: (error, customTitle = null, rawResponseSnippet = null) => {
      if (!isDebug || !logId) return
      const durationMs = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      updateTask(logId, {
        status: 'error',
        durationMs,
        title: customTitle || `Fallo en ${action}`,
        error: errorMsg,
        response: rawResponseSnippet,
      })
    },
  }
}

export function updateTask(id, updates) {
  if (!isDebug || !id) return

  let changed = false
  memoryLogs = memoryLogs.map((log) => {
    if (log.id === id) {
      changed = true
      return {
        ...log,
        ...updates,
      }
    }
    return log
  })

  if (changed) {
    persistLogs()
    notifyListeners()
  }
}

export function getLogs() {
  return [...memoryLogs]
}

export function clearLogs() {
  memoryLogs = []
  try {
    localStorage.removeItem(LOGS_STORAGE_KEY)
  } catch (_) {}
  notifyListeners()
}

export function subscribeLogs(callback) {
  listeners.add(callback)
  // Call once immediately with current logs
  callback(memoryLogs)
  return () => {
    listeners.delete(callback)
  }
}

export function formatLogsAsText() {
  if (memoryLogs.length === 0) return 'No hay registros de tareas.'

  return memoryLogs
    .map((l) => {
      const statusIcon = l.status === 'success' ? '✅' : l.status === 'error' ? '❌' : l.status === 'pending' ? '⏳' : 'ℹ️'
      const dur = l.durationMs != null ? ` (${l.durationMs}ms)` : ''
      let out = `[${l.time}] ${statusIcon} [${l.action.toUpperCase()}] ${l.title || ''}${dur}\n`
      if (l.params) {
        out += `   Parámetros: ${JSON.stringify(l.params)}\n`
      }
      if (l.error) {
        out += `   ERROR: ${l.error}\n`
      }
      if (l.response) {
        out += `   Respuesta: ${typeof l.response === 'object' ? JSON.stringify(l.response) : l.response}\n`
      }
      return out
    })
    .join('\n' + '-'.repeat(40) + '\n\n')
}
