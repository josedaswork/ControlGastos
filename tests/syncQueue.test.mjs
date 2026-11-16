import test from 'node:test'
import assert from 'node:assert/strict'

// Polifill mínimo en memoria para probar sheetsApi sin DOM/navegador
const memStorage = new Map()
globalThis.localStorage = {
  getItem: (k) => (memStorage.has(k) ? memStorage.get(k) : null),
  setItem: (k, v) => memStorage.set(k, String(v)),
  removeItem: (k) => memStorage.delete(k),
  clear: () => memStorage.clear(),
}

const sheetsApi = await import('../src/lib/sheetsApi.js')

test('applyPushResultsToQueue elimina solo confirmadas y conserva tareas editadas o añadidas durante el push', () => {
  localStorage.clear()

  sheetsApi.stageAddExpense('Abril', 'Cafetería', 3.5)
  sheetsApi.stageSetFixedExpenseStatus('Abril', 13, true, 'Alquiler', 470)
  sheetsApi.stageAddExpense('Abril', 'Transporte', 12)

  const snapshotSubmitted = sheetsApi.getPushQueue()
  assert.equal(snapshotSubmitted.length, 3)

  // Simulamos que mientras el Worker subía en segundo plano:
  // 1) El usuario volvió a cambiar la casilla fija fila 13 (nuevo mutationId en el mismo id "fix_status_Abril_13")
  // 2) El usuario añadió un cuarto gasto
  sheetsApi.stageSetFixedExpenseStatus('Abril', 13, false, 'Alquiler', 470)
  sheetsApi.stageAddExpense('Abril', 'Ocio', 20)

  // El servidor confirma el paquete original enviado (t0, t1 viejo, t2)
  const serverResults = [
    { id: snapshotSubmitted[0].id, mutationId: snapshotSubmitted[0].mutationId, status: 'applied' },
    { id: snapshotSubmitted[1].id, mutationId: snapshotSubmitted[1].mutationId, status: 'applied' },
    { id: snapshotSubmitted[2].id, mutationId: snapshotSubmitted[2].mutationId, status: 'failed', error: 'Error simulado' },
  ]

  sheetsApi.applyPushResultsToQueue(snapshotSubmitted, serverResults)

  const remaining = sheetsApi.getPushQueue()
  // Debe conservar:
  // - Transporte (falló en el servidor)
  // - fix_status_Abril_13 (se editó localmente tras enviar el snapshot -> nuevo mutationId!)
  // - Ocio (se añadió después de iniciar el push)
  assert.equal(remaining.length, 3)
  assert.equal(remaining.some((t) => t.category === 'Cafetería'), false)
  assert.equal(remaining.some((t) => t.category === 'Transporte'), true)
  assert.equal(remaining.some((t) => t.id === 'fix_status_Abril_13' && t.payload.active === false), true)
  assert.equal(remaining.some((t) => t.category === 'Ocio'), true)
})

test('saveSingleMonthDataToCache preserva cambios locales pendientes de push sobre los datos descargados', () => {
  localStorage.clear()

  // Gasto local aún no subido a Sheets
  sheetsApi.stageAddExpense('Abril', 'Supermercado', 42.5)
  sheetsApi.stageSetFixedExpenseStatus('Abril', 13, true, 'Alquiler', 470)

  // Llega una respuesta de pull desde Google Sheets que todavía no refleja esos 2 cambios locales
  const serverMonthData = {
    month: 'Abril',
    summary: {
      month: 'Abril',
      income: 2000,
      fixedExpenses: 0,
      variableExpenses: 10,
      desiredSavings: 300,
    },
    expenses: [{ row: 13, category: 'Cafetería', amount: 10 }],
    fixedExpenses: [{ row: 13, category: 'Alquiler', amount: 470, active: false, hasCheckbox: true }],
  }

  const saved = sheetsApi.saveSingleMonthDataToCache('Abril', serverMonthData, { preserveLocalQueue: true })

  assert.equal(saved.reappliedLocalCount, 2)
  assert.equal(saved.expenses.length, 2)
  assert.equal(saved.expenses.some((e) => e.category === 'Cafetería' && e.amount === 10), true)
  assert.equal(saved.expenses.some((e) => e.category === 'Supermercado' && e.amount === 42.5), true)
  assert.equal(saved.summary.variableExpenses, 52.5)
  assert.equal(saved.summary.fixedExpenses, 470)
  assert.equal(saved.summary.income, 2000)
})
