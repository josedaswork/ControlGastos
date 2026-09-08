export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

const STORAGE_KEY = 'finalized_months'

/**
 * Obtiene el listado de índices de meses finalizados (0 a 11).
 * @returns {number[]}
 */
export function getFinalizedMonths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => !isNaN(n) && n >= 0 && n <= 11) : []
  } catch (err) {
    console.error('Error leyendo meses finalizados:', err)
    return []
  }
}

/**
 * Comprueba si un mes concreto está marcado como finalizado.
 * @param {number} monthIndex
 * @returns {boolean}
 */
export function isMonthFinalized(monthIndex) {
  const list = getFinalizedMonths()
  return list.includes(Number(monthIndex))
}

/**
 * Guarda el estado de finalización de un mes.
 * @param {number} monthIndex 
 * @param {boolean} finalized 
 * @returns {number[]} Lista actualizada de meses finalizados
 */
export function setMonthFinalized(monthIndex, finalized) {
  const numIdx = Number(monthIndex)
  const current = getFinalizedMonths()
  let updated
  if (finalized) {
    updated = Array.from(new Set([...current, numIdx]))
  } else {
    updated = current.filter((m) => m !== numIdx)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Error guardando meses finalizados:', err)
  }
  return updated
}

/**
 * Detecta qué mes es el "mes en curso" actual.
 * Comienza en el mes del calendario real (new Date().getMonth()).
 * Si el mes del calendario está marcado como finalizado (ej. cobro anticipado),
 * avanza automáticamente al siguiente mes no finalizado.
 * @returns {number} Índice del mes en curso (0 a 11)
 */
export function getEffectiveCurrentMonth() {
  const calendarMonth = new Date().getMonth()
  const finalized = getFinalizedMonths()

  // Si el mes del calendario no está finalizado, ese es el mes en curso
  if (!finalized.includes(calendarMonth)) {
    return calendarMonth
  }

  // Si está finalizado, avanzamos buscando el siguiente mes pendiente
  let candidate = (calendarMonth + 1) % 12
  for (let i = 0; i < 11; i++) {
    if (!finalized.includes(candidate)) {
      return candidate
    }
    candidate = (candidate + 1) % 12
  }

  // Si todos estuvieran finalizados, devolver el siguiente del calendario
  return (calendarMonth + 1) % 12
}
