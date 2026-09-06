import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const fmt = (v) =>
  v != null
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v)
    : '—'
