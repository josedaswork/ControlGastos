import { useState, useEffect, useCallback } from 'react'

const THEME_STORAGE_KEY = 'control_gastos_theme'
const THEME_CHANGE_EVENT = 'control-gastos-theme-change'

export function getThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
  } catch (_) {}
  return 'system'
}

export function resolveIsDark(pref = getThemePreference()) {
  if (pref === 'dark') return true
  if (pref === 'light') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

export function applyTheme(pref = getThemePreference()) {
  const isDark = resolveIsDark(pref)
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'

    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDark ? '#090E1A' : '#F8FAFC')
    }

    const appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (appleStatusMeta) {
      appleStatusMeta.setAttribute('content', isDark ? 'black-translucent' : 'default')
    }
  }
  return isDark
}

export function setThemePreference(pref) {
  const nextPref = pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'system'
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextPref)
  } catch (_) {}
  const isDark = applyTheme(nextPref)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: nextPref, isDark } }))
  }
  return { preference: nextPref, isDark }
}

export function useTheme() {
  const [preference, setPrefState] = useState(() => getThemePreference())
  const [isDark, setIsDark] = useState(() => resolveIsDark(getThemePreference()))

  useEffect(() => {
    const sync = () => {
      const currentPref = getThemePreference()
      setPrefState(currentPref)
      setIsDark(applyTheme(currentPref))
    }

    sync()

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const handleMediaChange = () => {
      if (getThemePreference() === 'system') {
        setIsDark(applyTheme('system'))
      }
    }

    const handleCustomEvent = (e) => {
      if (e?.detail) {
        setPrefState(e.detail.preference)
        setIsDark(e.detail.isDark)
      } else {
        sync()
      }
    }

    const handleStorage = (e) => {
      if (e.key === THEME_STORAGE_KEY) {
        sync()
      }
    }

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange)
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleCustomEvent)
    window.addEventListener('storage', handleStorage)

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange)
      }
      window.removeEventListener(THEME_CHANGE_EVENT, handleCustomEvent)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const setPreference = useCallback((nextPref) => {
    const res = setThemePreference(nextPref)
    setPrefState(res.preference)
    setIsDark(res.isDark)
  }, [])

  const toggleTheme = useCallback(() => {
    const nextPref = resolveIsDark(getThemePreference()) ? 'light' : 'dark'
    const res = setThemePreference(nextPref)
    setPrefState(res.preference)
    setIsDark(res.isDark)
  }, [])

  return {
    preference,
    isDark,
    setPreference,
    toggleTheme,
  }
}
