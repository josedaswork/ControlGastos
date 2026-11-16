import { App as CapacitorApp } from '@capacitor/app'
import { toast } from 'sonner'
import { BackgroundSync, isNativeBackgroundSyncAvailable } from './backgroundSyncPlugin'
import {
  getScriptUrl,
  getPushQueue,
  ensureQueueMutationIds,
  applyPushResultsToQueue,
  applyMonthsDataCache,
  applyPulledSyncPayloadToCache,
  pushAllChanges,
  pullMonthDataFromSheets,
  fullSyncFromSheets,
  ALL_MONTHS,
} from './sheetsApi'
import { setMonthFinalized } from './monthStatus'

const TERMINAL_STATUSES = new Set(['succeeded', 'partial', 'failed', 'uncertain', 'cancelled'])
const ACTIVE_STATUSES = new Set(['queued', 'running'])

const stateListeners = new Set()
const pendingWaiters = new Map() // requestId -> { resolve, reject, onProgress }
const processingAckIds = new Set()

let syncState = {
  activeSync: null,
  lastNotice: null,
  isNative: isNativeBackgroundSyncAvailable(),
}

let webInFlight = false
let coordinatorInitialized = false
let onDataChangedCallback = null
let activeToastMap = new Map()
const silentRequestIds = new Set()

function emitState() {
  const snapshot = getSyncSnapshot()
  stateListeners.forEach((fn) => {
    try {
      fn(snapshot)
    } catch (_) {}
  })
}

export function getSyncSnapshot() {
  const active = syncState.activeSync
  const status = active?.status || ''
  const isActive = Boolean(active && ACTIVE_STATUSES.has(status)) || webInFlight
  const isPushing = Boolean(active && active.type === 'push' && ACTIVE_STATUSES.has(status)) || (webInFlight && syncState.activeSync?.type === 'push')
  const isPulling = Boolean(active && (active.type === 'pull_month' || active.type === 'pull_full') && ACTIVE_STATUSES.has(status)) || (webInFlight && (syncState.activeSync?.type === 'pull_month' || syncState.activeSync?.type === 'pull_full'))

  return {
    ...syncState,
    isSyncing: isActive,
    isPushing,
    isPulling,
  }
}

export function subscribeSyncState(fn) {
  stateListeners.add(fn)
  try {
    fn(getSyncSnapshot())
  } catch (_) {}
  return () => stateListeners.delete(fn)
}

export function clearLastSyncNotice() {
  syncState = { ...syncState, lastNotice: null }
  emitState()
}

function applyMonthFinalizedFromPayload(type, result) {
  if (!result || typeof result !== 'object') return false
  const queue = getPushQueue()
  const monthsWithPendingFinalized = new Set(
    queue.filter((t) => t.action === 'setMonthFinalized').map((t) => t.month)
  )

  let updated = false
  const applyOne = (mData) => {
    if (!mData || typeof mData.monthFinalized !== 'boolean' || !mData.month) return
    if (monthsWithPendingFinalized.has(mData.month)) return
    const idx = ALL_MONTHS.indexOf(mData.month)
    if (idx >= 0) {
      setMonthFinalized(idx, mData.monthFinalized)
      updated = true
    }
  }

  if (result.monthData) applyOne(result.monthData)
  if (type === 'pull_full' && result.colindantMonths && typeof result.colindantMonths === 'object') {
    Object.values(result.colindantMonths).forEach(applyOne)
  }
  return updated
}

async function processTerminalNativeRequest(req) {
  const requestId = req?.requestId
  if (!requestId || processingAckIds.has(requestId)) return
  processingAckIds.add(requestId)

  try {
    const status = req.status
    const type = req.type
    let toastMsg = req.progressMessage || req.errorMessage || ''
    let toastLevel = 'info'

    if (type === 'push') {
      const results = Array.isArray(req.result?.results) ? req.result.results : []
      if (results.length > 0) {
        applyPushResultsToQueue(req.tasks || [], results)
      }
      if (req.result?.monthsData) {
        applyMonthsDataCache(req.result.monthsData, { preserveLocalQueue: true })
      }

      const confirmed = req.result?.processed ?? 0
      const failedCount = req.result?.failedCount ?? 0

      if (status === 'succeeded') {
        toastLevel = 'success'
        toastMsg = `¡${confirmed} cambio(s) subidos con éxito al Excel!`
      } else if (status === 'partial') {
        toastLevel = 'warning'
        toastMsg = req.errorMessage || `Subidos ${confirmed} cambio(s), pero fallaron ${failedCount}.`
      } else if (status === 'uncertain') {
        toastLevel = 'warning'
        toastMsg = req.errorMessage || 'Conexión interrumpida tras enviar cambios. Revisa tu hoja y reintenta.'
      } else if (status === 'cancelled') {
        toastLevel = 'info'
        toastMsg = 'Subida cancelada'
      } else {
        toastLevel = 'error'
        toastMsg = req.errorMessage || 'No se pudieron subir los cambios'
      }
    } else if (type === 'pull_month' || type === 'pull_full') {
      if (req.result && (status === 'succeeded' || status === 'partial')) {
        applyPulledSyncPayloadToCache(type, req.result, { preserveLocalQueue: true })
        applyMonthFinalizedFromPayload(type, req.result)
      }

      const targetLabel = req.targetMonth || req.result?.month || 'Google Sheets'
      if (status === 'succeeded') {
        toastLevel = 'success'
        toastMsg = type === 'pull_full'
          ? `¡Sincronización completa de ${targetLabel} finalizada!`
          : `¡${targetLabel} descargado correctamente!`
      } else if (status === 'partial') {
        toastLevel = 'warning'
        toastMsg = req.errorMessage || `Descarga parcial de ${targetLabel}. Algunas secciones fallaron.`
      } else if (status === 'cancelled') {
        toastLevel = 'info'
        toastMsg = 'Descarga cancelada'
      } else {
        toastLevel = 'error'
        toastMsg = req.errorMessage || `Error descargando ${targetLabel}`
      }
    }

    // Confirmar ACK en almacenamiento nativo SOLO tras persistir en caché/cola local
    await BackgroundSync.acknowledgeSync({ requestId })

    syncState = {
      ...syncState,
      activeSync: syncState.activeSync?.requestId === requestId ? null : syncState.activeSync,
      lastNotice: {
        requestId,
        type,
        status,
        message: toastMsg,
        level: toastLevel,
        errorCode: req.errorCode || null,
        timestamp: Date.now(),
      },
    }
    emitState()

    const existingToastId = activeToastMap.get(requestId)
    const isSilent = silentRequestIds.has(requestId)
    activeToastMap.delete(requestId)
    silentRequestIds.delete(requestId)
    if (toastLevel === 'success') {
      if (!isSilent) {
        toast.success(toastMsg, existingToastId ? { id: existingToastId, duration: 4000 } : { duration: 4000 })
      }
    } else if (toastLevel === 'warning') {
      toast.warning(toastMsg, existingToastId ? { id: existingToastId, duration: 6500 } : { duration: 6500 })
    } else if (toastLevel === 'error') {
      toast.error(toastMsg, existingToastId ? { id: existingToastId, duration: 6500 } : { duration: 6500 })
    } else if (existingToastId) {
      toast.info(toastMsg, { id: existingToastId, duration: 3500 })
    }

    try {
      onDataChangedCallback?.({ type, status, request: req })
    } catch (_) {}

    const waiter = pendingWaiters.get(requestId)
    if (waiter) {
      pendingWaiters.delete(requestId)
      if (status === 'succeeded') {
        waiter.resolve({
          success: true,
          partial: false,
          count: req.result?.processed ?? 0,
          result: req.result,
          request: req,
        })
      } else if (status === 'partial') {
        if (type === 'push') {
          const err = new Error(toastMsg)
          err.partial = true
          err.request = req
          waiter.reject(err)
        } else {
          waiter.resolve({
            success: false,
            partial: true,
            failedParts: req.result?.failedParts || [],
            result: req.result,
            request: req,
          })
        }
      } else {
        const err = new Error(toastMsg || 'Error de sincronización')
        err.code = req.errorCode
        err.request = req
        waiter.reject(err)
      }
    }
  } finally {
    processingAckIds.delete(requestId)
  }
}

function handleNativeStateUpdate(req) {
  if (!req || !req.requestId) return
  if (TERMINAL_STATUSES.has(req.status)) {
    processTerminalNativeRequest(req)
    return
  }

  syncState = { ...syncState, activeSync: req }
  emitState()

  const waiter = pendingWaiters.get(req.requestId)
  if (waiter?.onProgress && req.progressTotal > 0) {
    waiter.onProgress({
      current: req.progressCurrent || 0,
      total: req.progressTotal,
      message: req.progressMessage,
    })
  }
}

export async function recoverPendingSyncStates() {
  if (!isNativeBackgroundSyncAvailable()) return []
  try {
    const res = await BackgroundSync.getSyncStates()
    const requests = Array.isArray(res?.requests) ? res.requests : []

    let latestActive = null
    for (const req of requests) {
      if (TERMINAL_STATUSES.has(req.status)) {
        await processTerminalNativeRequest(req)
      } else if (ACTIVE_STATUSES.has(req.status)) {
        latestActive = req
      }
    }

    if (latestActive) {
      syncState = { ...syncState, activeSync: latestActive }
      emitState()
    } else if (syncState.activeSync && !requests.some((r) => r.requestId === syncState.activeSync.requestId && ACTIVE_STATUSES.has(r.status))) {
      syncState = { ...syncState, activeSync: null }
      emitState()
    }

    return requests
  } catch (err) {
    console.warn('Error recuperando estados nativos de sincronización:', err.message)
    return []
  }
}

export function initSyncCoordinator({ onDataChanged } = {}) {
  if (onDataChanged) {
    onDataChangedCallback = onDataChanged
  }

  if (coordinatorInitialized) return () => {}
  coordinatorInitialized = true

  if (!isNativeBackgroundSyncAvailable()) {
    return () => {
      coordinatorInitialized = false
    }
  }

  let pluginListener = null
  let appStateListener = null

  Promise.resolve(
    BackgroundSync.addListener('syncStateChanged', (req) => {
      handleNativeStateUpdate(req)
    })
  )
    .then((handle) => {
      pluginListener = handle
    })
    .catch(() => {})

  Promise.resolve(
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        recoverPendingSyncStates()
      }
    })
  )
    .then((handle) => {
      appStateListener = handle
    })
    .catch(() => {})

  // Recuperar inmediatamente tras arranque en frío o muerte del proceso
  recoverPendingSyncStates()

  return () => {
    pluginListener?.remove?.()
    appStateListener?.remove?.()
    coordinatorInitialized = false
  }
}

function waitForNativeRequest(requestId, onProgress) {
  return new Promise((resolve, reject) => {
    pendingWaiters.set(requestId, { resolve, reject, onProgress })
  })
}

/**
 * Inicia un Push coordinado (WorkManager nativo en Android o ejecución serializada en Web).
 */
export async function startPushSync({ onProgress, toastId } = {}) {
  const tasks = ensureQueueMutationIds()
  if (tasks.length === 0) {
    return { success: true, count: 0, mode: isNativeBackgroundSyncAvailable() ? 'native' : 'web' }
  }

  const currentSnapshot = getSyncSnapshot()
  if (currentSnapshot.isPulling) {
    throw new Error('Hay una descarga en curso. Espera a que termine antes de subir cambios.')
  }

  if (isNativeBackgroundSyncAvailable()) {
    const scriptUrl = getScriptUrl()
    if (!scriptUrl) throw new Error('URL de Google Apps Script no configurada')

    // Si ya hay un push en curso con exactamente las mismas tareas, adjuntarse sin duplicar
    const enqueued = await BackgroundSync.enqueuePush({ scriptUrl, tasks })
    const requestId = enqueued.requestId

    if (toastId) activeToastMap.set(requestId, toastId)
    syncState = { ...syncState, activeSync: enqueued }
    emitState()

    if (TERMINAL_STATUSES.has(enqueued.status)) {
      await processTerminalNativeRequest(enqueued)
      return { mode: 'native', request: enqueued, count: enqueued.result?.processed ?? 0 }
    }

    const result = await waitForNativeRequest(requestId, onProgress)
    return { mode: 'native', ...result }
  }

  // Fallback Web (navegador sin Android WorkManager)
  if (webInFlight) {
    throw new Error('Ya hay una sincronización en curso en esta pestaña.')
  }

  webInFlight = true
  syncState = {
    ...syncState,
    activeSync: {
      requestId: 'web_push',
      type: 'push',
      status: 'running',
      progressCurrent: 0,
      progressTotal: tasks.length,
      progressMessage: 'Subiendo cambios a Google Sheets (no cierres esta pestaña)…',
    },
  }
  emitState()

  try {
    const res = await pushAllChanges((p) => {
      syncState = {
        ...syncState,
        activeSync: {
          ...syncState.activeSync,
          progressCurrent: p.current,
          progressTotal: p.total,
        },
      }
      emitState()
      onProgress?.(p)
    })
    onDataChangedCallback?.({ type: 'push', status: 'succeeded', result: res })
    return { mode: 'web', ...res }
  } finally {
    webInFlight = false
    syncState = { ...syncState, activeSync: null }
    emitState()
  }
}

export async function startPullMonthSync(month, { toastId, preserveLocalQueue = true, silent = false } = {}) {
  const currentSnapshot = getSyncSnapshot()
  if (currentSnapshot.isPushing) {
    throw new Error('Hay una subida en curso. Espera a que termine antes de descargar.')
  }

  if (isNativeBackgroundSyncAvailable()) {
    const scriptUrl = getScriptUrl()
    if (!scriptUrl) throw new Error('URL de Google Apps Script no configurada')

    const enqueued = await BackgroundSync.enqueuePullMonth({ scriptUrl, month })
    const requestId = enqueued.requestId
    if (toastId) activeToastMap.set(requestId, toastId)
    if (silent) silentRequestIds.add(requestId)
    syncState = { ...syncState, activeSync: enqueued }
    emitState()

    if (TERMINAL_STATUSES.has(enqueued.status)) {
      await processTerminalNativeRequest(enqueued)
      return { mode: 'native', request: enqueued, ...(enqueued.result || {}) }
    }

    const done = await waitForNativeRequest(requestId)
    return { mode: 'native', ...(done.result || {}), request: done.request }
  }

  if (webInFlight) {
    throw new Error('Ya hay una sincronización en curso.')
  }

  webInFlight = true
  syncState = {
    ...syncState,
    activeSync: {
      requestId: 'web_pull_month',
      type: 'pull_month',
      targetMonth: month,
      status: 'running',
      progressCurrent: 0,
      progressTotal: 1,
      progressMessage: `Descargando ${month}…`,
    },
  }
  emitState()

  try {
    const res = await pullMonthDataFromSheets(month, { preserveLocalQueue })
    onDataChangedCallback?.({ type: 'pull_month', status: 'succeeded', result: res })
    return { mode: 'web', ...res }
  } finally {
    webInFlight = false
    syncState = { ...syncState, activeSync: null }
    emitState()
  }
}

export async function startFullSync(month, { toastId, preserveLocalQueue = true } = {}) {
  const currentSnapshot = getSyncSnapshot()
  if (currentSnapshot.isPushing) {
    throw new Error('Hay una subida en curso. Espera a que termine antes de descargar.')
  }

  if (isNativeBackgroundSyncAvailable()) {
    const scriptUrl = getScriptUrl()
    if (!scriptUrl) throw new Error('URL de Google Apps Script no configurada')

    const enqueued = await BackgroundSync.enqueueFullSync({ scriptUrl, month })
    const requestId = enqueued.requestId
    if (toastId) activeToastMap.set(requestId, toastId)
    syncState = { ...syncState, activeSync: enqueued }
    emitState()

    if (TERMINAL_STATUSES.has(enqueued.status)) {
      await processTerminalNativeRequest(enqueued)
      return { mode: 'native', request: enqueued, ...(enqueued.result || {}) }
    }

    const done = await waitForNativeRequest(requestId)
    return { mode: 'native', ...(done.result || {}), request: done.request, partial: done.partial }
  }

  if (webInFlight) {
    throw new Error('Ya hay una sincronización en curso.')
  }

  webInFlight = true
  syncState = {
    ...syncState,
    activeSync: {
      requestId: 'web_pull_full',
      type: 'pull_full',
      targetMonth: month,
      status: 'running',
      progressCurrent: 0,
      progressTotal: 5,
      progressMessage: `Descargando todo (${month})…`,
    },
  }
  emitState()

  try {
    const res = await fullSyncFromSheets(month, { preserveLocalQueue })
    onDataChangedCallback?.({ type: 'pull_full', status: res.partial ? 'partial' : 'succeeded', result: res })
    return { mode: 'web', ...res }
  } finally {
    webInFlight = false
    syncState = { ...syncState, activeSync: null }
    emitState()
  }
}

export async function cancelActiveSync(requestId) {
  if (!requestId || !isNativeBackgroundSyncAvailable()) return
  await BackgroundSync.cancelSync({ requestId })
}
