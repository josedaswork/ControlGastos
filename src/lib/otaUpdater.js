import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { toast } from 'sonner'
import { isDebugEnabled, logTask } from './debugLogger.js'

export const UPDATE_MANIFEST_URL =
  'https://github.com/josedaswork/ControlGastos/releases/latest/download/update.json'

const FETCH_TIMEOUT_MS = 12000

let appReadyPromise = null
let activeCheckPromise = null

function debugLog(status, title, details = null, error = null) {
  if (!isDebugEnabled()) return
  logTask({
    status,
    action: 'ota_update',
    title,
    details,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  })
}

function getBakedAppVersion() {
  try {
    const v = import.meta?.env?.VITE_APP_VERSION
    if (v && String(v).trim()) return cleanVersion(String(v))
  } catch (_) {}
  return '1.0.0'
}

export function cleanVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[vV]/, '')
    .split('+')[0]
}

function parseSemver(raw) {
  const cleaned = cleanVersion(raw)
  if (!cleaned) return null
  const [core, ...preParts] = cleaned.split('-')
  const nums = core.split('.').map((p) => Number.parseInt(p, 10))
  if (nums.length === 0 || nums.some((n) => Number.isNaN(n) || n < 0)) {
    return null
  }
  return {
    major: nums[0] || 0,
    minor: nums[1] || 0,
    patch: nums[2] || 0,
    prerelease: preParts.join('-') || '',
  }
}

/**
 * Compara dos versiones semver:
 *  > 0 si a > b
 *    0 si a == b (o formato inválido para evitar bucles de actualización)
 *  < 0 si a < b
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return 0

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1

  if (pa.prerelease === pb.prerelease) return 0
  // Sin etiqueta prerelease es mayor que con prerelease (1.0.1 > 1.0.1-beta.1)
  if (!pa.prerelease && pb.prerelease) return 1
  if (pa.prerelease && !pb.prerelease) return -1
  return pa.prerelease > pb.prerelease ? 1 : -1
}

/**
 * Notifica inmediatamente a CapacitorUpdater que el bundle actual arrancó bien.
 * Crítico para evitar que el plugin haga rollback al bundle anterior tras 10s.
 */
export function notifyOtaAppReady() {
  if (appReadyPromise) return appReadyPromise
  appReadyPromise = (async () => {
    try {
      const res = await CapacitorUpdater.notifyAppReady()
      debugLog('info', 'OTA notifyAppReady confirmado', {
        bundleId: res?.bundle?.id || 'builtin',
        version: res?.bundle?.version || getBakedAppVersion(),
      })
      return res
    } catch (err) {
      debugLog('warning', 'Error en notifyAppReady (ignorado)', null, err)
      return null
    }
  })()
  return appReadyPromise
}

export async function getCurrentOtaInfo() {
  const isNative = Capacitor.isNativePlatform()
  const bakedVersion = getBakedAppVersion()
  try {
    const info = await CapacitorUpdater.current()
    const bundle = info?.bundle || {}
    const nativeVersion = cleanVersion(info?.native || '') || bakedVersion
    const isOtaActive = Boolean(bundle?.id && bundle.id !== 'builtin' && bundle?.version)
    const activeVersion = isOtaActive
      ? cleanVersion(bundle.version)
      : cleanVersion(bakedVersion || nativeVersion) || '1.0.0'

    return {
      version: activeVersion,
      nativeVersion: nativeVersion || activeVersion,
      bundleId: bundle?.id || 'builtin',
      isOtaActive,
      isNative,
    }
  } catch (err) {
    debugLog('warning', 'No se pudo leer la versión OTA actual', null, err)
    return {
      version: bakedVersion,
      nativeVersion: bakedVersion,
      bundleId: 'builtin',
      isOtaActive: false,
      isNative,
    }
  }
}

async function fetchManifest() {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null
  try {
    const res = await fetch(UPDATE_MANIFEST_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    })
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`)
      err.httpStatus = res.status
      throw err
    }
    const manifest = await res.json()
    if (!manifest || !manifest.version || !manifest.url) {
      throw new Error('Manifiesto update.json incompleto')
    }
    return {
      version: cleanVersion(manifest.version),
      url: String(manifest.url).trim(),
      notes: manifest.notes ? String(manifest.notes) : '',
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Comprueba si existe una actualización OTA en GitHub Releases.
 * En modo automático (manual=false) captura errores silenciosamente para no afectar offline.
 * En modo manual (manual=true) muestra feedback claro al usuario.
 */
export async function checkForOtaUpdate({ manual = false } = {}) {
  await notifyOtaAppReady()

  if (activeCheckPromise) {
    return activeCheckPromise
  }

  activeCheckPromise = (async () => {
    let manualToastId = null
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        debugLog('info', 'Comprobación OTA omitida: sin conexión a internet')
        if (manual) {
          toast.info('Sin conexión a internet. Conéctate para buscar actualizaciones.')
        }
        return { status: 'offline' }
      }

      if (manual) {
        manualToastId = toast.loading('Buscando actualizaciones…')
      }

      const currentInfo = await getCurrentOtaInfo()
      const manifest = await fetchManifest()
      const cmp = compareSemver(manifest.version, currentInfo.version)

      debugLog('info', 'Manifiesto OTA consultado', {
        currentVersion: currentInfo.version,
        remoteVersion: manifest.version,
        bundleId: currentInfo.bundleId,
        updateAvailable: cmp > 0,
      })

      if (cmp <= 0) {
        if (manual) {
          toast.success(`Ya tienes la última versión (v${currentInfo.version})`, {
            id: manualToastId,
          })
        }
        return {
          status: 'up_to_date',
          currentVersion: currentInfo.version,
          remoteVersion: manifest.version,
          manifest,
        }
      }

      if (!Capacitor.isNativePlatform()) {
        if (manual) {
          toast.info(
            `Nueva versión v${manifest.version} disponible (actual: v${currentInfo.version}). Las OTA se aplican en la app Android.`,
            { id: manualToastId, duration: 5000 }
          )
        }
        return {
          status: 'available_web_only',
          currentVersion: currentInfo.version,
          remoteVersion: manifest.version,
          manifest,
        }
      }

      // Nueva versión disponible en Android nativo: descargar y aplicar
      const downloadToastId = manualToastId || toast.loading('Descargando actualización…')
      if (manualToastId) {
        toast.loading('Descargando actualización…', { id: downloadToastId })
      }

      debugLog('info', `Descargando bundle OTA v${manifest.version}`, { url: manifest.url })
      const downloaded = await CapacitorUpdater.download({
        url: manifest.url,
        version: manifest.version,
      })

      if (!downloaded || !downloaded.id || downloaded.id === 'builtin') {
        throw new Error('El bundle descargado no devolvió un identificador válido')
      }

      toast.loading(`Actualizando a v${manifest.version}…`, { id: downloadToastId })
      debugLog('success', `Aplicando bundle OTA v${manifest.version}`, {
        downloadedBundleId: downloaded.id,
      })

      // Breve pausa para que el toast sea visible antes de que set() recargue el WebView
      await new Promise((resolve) => setTimeout(resolve, 350))
      await CapacitorUpdater.set({ id: downloaded.id })

      return {
        status: 'applied',
        currentVersion: currentInfo.version,
        remoteVersion: manifest.version,
        bundle: downloaded,
      }
    } catch (err) {
      debugLog('warning', 'Comprobación OTA fallida o no disponible', null, err)
      if (manual) {
        const msg =
          err?.httpStatus === 404
            ? 'Todavía no hay ninguna actualización publicada en GitHub Releases.'
            : `No se pudo comprobar actualizaciones: ${err?.message || 'Error de red'}`
        if (manualToastId) {
          toast.error(msg, { id: manualToastId, duration: 5000 })
        } else {
          toast.error(msg, { duration: 5000 })
        }
      }
      return {
        status: 'error',
        error: err?.message || 'Error desconocido',
      }
    } finally {
      activeCheckPromise = null
    }
  })()

  return activeCheckPromise
}
