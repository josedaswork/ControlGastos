import { Capacitor, registerPlugin } from '@capacitor/core'

export const BackgroundSync = registerPlugin('BackgroundSync')

export function isNativeBackgroundSyncAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}
