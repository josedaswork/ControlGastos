/**
 * ============================================================
 *  Google Apps Script — Backend para Control Gastos App (v4.0.2)
 *  Versión Ultra-Optimizada: Alto rendimiento, menor tamaño,
 *  Sincronización Total en 1 llamada (Full Sync), Local-First y Checkboxes.
 *
 *  LÍMITE DE LECTURA: Gastos Fijos admite 20 filas, Ingresos 10 filas
 *  y Gastos Variables tiene una excepción vertical de 90 filas.
 * ============================================================
 *
 *  ESTRUCTURA DE COLUMNAS DEL SPREADSHEET (Control Dinero 2026):
 *    - Meses Marzo a Diciembre (Con Casillas de Verificación):
 *        Col B (2) / C (3): Ingresos (Fila 10: C10 Total)
 *        Col E (5): Categoría Gasto Fijo
 *        Col F (6): Importe condicional: =IF(G13, 470, 0) (Fila 10: F10 Total)
 *        Col G (7): Casilla de verificación (TRUE / FALSE)
 *        Col I (9) / K (11): Gastos Variables (Fila 10: K10 Total)
 *        Celda I3: Meta de ahorro mensual
 *    - Meses Enero y Febrero (Sin Casillas):
 *        Col B/C: Ingresos | Col E/F: Gastos Fijos | Col H/J: Gastos Variables
 *    - Hojas Anuales:
 *        'Data gráficos', 'Panel de control', 'Plan de Ahorro', '(Categorías)'
 *
 *  INSTRUCCIONES DE INSTALACIÓN:
 *  1. Abre tu hoja en Google Sheets.
 *  2. Ve a Extensiones → Apps Script.
 *  3. Borra todo el código anterior y pega este archivo completo.
 *  4. Guarda (Ctrl+S / Cmd+S).
 *  5. Haz clic en "Implementar" → "Administrar implementaciones" o "Nueva implementación"
 *     (Versión: Nueva, Ejecutar como: Tu cuenta, Quién tiene acceso: Cualquier persona).
 *  6. Copia la URL de la aplicación web terminada en "/exec".
 * ============================================================
 */

/** Máximo de casillas que se leen/escanean en cualquier dirección (filas o columnas). */
var MAX_CELLS = 60;
var MAX_FIXED_ROWS = 20;
var MAX_INCOME_ROWS = 10;
/** Gastos Variables admite excepcionalmente hasta 90 filas verticales. */
var MAX_VARIABLE_ROWS = 90;

var ALL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
var SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

var FIXED_DEFAULT_CATEGORIES = {
  13: 'Alquiler',
  14: 'Bono metro',
  15: 'Gimnasio',
  16: 'Disney',
  17: 'Spotify',
  18: 'Comida Base',
  19: 'Comida Base',
  20: 'Servicios',
  21: 'Inversión'
};

var FIXED_DEFAULT_AMOUNTS = {
  13: 470,
  14: 10,
  15: 24.99,
  16: 6.99,
  17: 3.5,
  18: 41.62,
  19: 57.36,
  20: 36,
  21: 0
};

/* ---- Router Unificado (GET y POST) ---- */

function doGet(e) {
  return handleRequest(e, false);
}

function doPost(e) {
  return handleRequest(e, true);
}

function handleRequest(e, isPost) {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return jsonResponse({ error: 'No se encontró la hoja de cálculo activa' });
  } catch (eSs) {
    return jsonResponse({ error: 'Error accediendo al Spreadsheet: ' + eSs.message });
  }

  var params = {};
  if (e && e.parameter) {
    for (var k in e.parameter) {
      if (e.parameter.hasOwnProperty(k)) params[k] = e.parameter[k];
    }
  }
  if (isPost && e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var bKey in body) {
        if (body.hasOwnProperty(bKey)) params[bKey] = body[bKey];
      }
    } catch (_) {}
  }

  var action = params.action || 'ping';
  var result = {};

  try {
    switch (action) {
      case 'ping':
      case 'getSpreadsheetInfo':
        result = {
          status: 'ok',
          version: '4.0.2',
          maxCells: MAX_CELLS,
          maxVariableRows: MAX_VARIABLE_ROWS,
          spreadsheetUrl: ss.getUrl(),
          spreadsheetName: ss.getName(),
          timestamp: new Date().toISOString()
        };
        break;

      case 'getFullSyncData':
      case 'getAllData':
        result = getFullSyncData(ss, params.month);
        break;

      case 'getMonthData':
        result = getMonthData(ss, params.month);
        break;

      case 'getFixedExpenses':
        result = getFixedExpenses(ss, params.month);
        break;

      case 'getExpenses':
        result = getExpenses(ss, params.month);
        break;

      case 'getSummary':
        result = getSummary(ss, params.month);
        break;

      case 'getCategories':
        result = getCategories(ss);
        break;

      case 'getControlPanelData':
      case 'getDashboardData':
        result = getControlPanelData(ss);
        break;

      case 'pushBatchChanges':
        var batchTasks = [];
        try {
          batchTasks = typeof params.tasks === 'string' ? JSON.parse(params.tasks) : (params.tasks || []);
        } catch (_) {
          batchTasks = [];
        }
        result = pushBatchChanges(ss, batchTasks);
        break;

      case 'addExpense':
        result = addExpense(ss, params.month, params.category, parseFloat(String(params.amount).replace(',', '.')));
        break;

      case 'updateExpense':
        result = updateExpense(
          ss,
          params.month,
          parseInt(params.row, 10),
          params.oldCategory,
          parseFloat(String(params.oldAmount).replace(',', '.')),
          params.newCategory,
          parseFloat(String(params.newAmount).replace(',', '.'))
        );
        break;

      case 'deleteExpense':
        result = deleteExpense(ss, params.month, parseInt(params.row, 10), params.category, parseFloat(String(params.amount).replace(',', '.')));
        break;

      case 'addIncome':
        result = addIncome(ss, params.month, params.category, parseFloat(String(params.amount).replace(',', '.')));
        break;

      case 'setTotalIncome':
        result = setTotalIncome(ss, params.month, parseFloat(String(params.amount).replace(',', '.')), params.category);
        break;

      case 'setSavingsGoal':
        result = setSavingsGoal(ss, params.month, parseFloat(String(params.amount).replace(',', '.')));
        break;

      case 'setMonthFinalized':
        result = setMonthFinalized(ss, params.month, params.finalized === true || params.finalized === 'true' || params.finalized === '1');
        break;

      case 'getMonthFinalizedStatuses':
        result = getMonthFinalizedStatuses(ss);
        break;

      case 'setFixedExpenseStatus':
      case 'toggleFixedExpense':
        result = setFixedExpenseStatus(
          ss,
          params.month,
          parseInt(params.row, 10),
          params.active === true || params.active === 'true' || params.active === 1 || params.active === '1'
        );
        break;

      case 'setFixedExpenseAmount':
        result = setFixedExpenseAmount(
          ss,
          params.month,
          parseInt(params.row, 10),
          parseFloat(String(params.amount || params.newAmount).replace(',', '.')),
          params.category || params.newCategory
        );
        break;

      case 'setFixedExpensesBatch':
        var bUpdates = [];
        try {
          bUpdates = typeof params.updates === 'string' ? JSON.parse(params.updates) : (params.updates || []);
        } catch (_) {}
        result = setFixedExpensesBatch(ss, params.month, bUpdates);
        break;

      case 'repairFixedExpenseFormulas':
        result = repairFixedExpenseFormulas(ss, params.month, params.forceAll === 'true' || params.forceAll === true);
        break;

      default:
        result = { error: 'Acción desconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---- Utilidades de Hoja y Columnas ---- */

/** Limita un número de filas/columnas a MAX_CELLS. */
function capCells(n) {
  return Math.min(n, MAX_CELLS);
}

function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function findSheet(ss, name) {
  if (!name) return null;
  var exact = ss.getSheetByName(name);
  if (exact) return exact;

  var norm = normalizeStr(name);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (normalizeStr(sheets[i].getName()) === norm) return sheets[i];
  }
  return null;
}

function getSheetColumns(ws) {
  var normName = normalizeStr(ws.getName());
  var isJanFeb = (normName === 'enero' || normName === 'febrero');

  var cols = {
    isJanFeb: isJanFeb,
    hasCheckbox: !isJanFeb,
    income: { catCol: 2, amtCol: 3, totalCell: 'C10' },
    fixed: { catCol: 5, checkCol: isJanFeb ? null : 7, amtCol: 6, totalCell: 'F10' },
    variable: { catCol: isJanFeb ? 8 : 9, amtCol: isJanFeb ? 10 : 11, totalCell: isJanFeb ? 'J10' : 'K10' }
  };

  return cols;
}

function isCheckboxChecked(rawVal, dispVal) {
  if (rawVal === true || rawVal === 1 || rawVal === '1') return true;
  if (rawVal === false || rawVal === 0 || rawVal === '0') return false;

  var s = String(rawVal != null ? rawVal : '').trim().toUpperCase();
  var ds = String(dispVal != null ? dispVal : '').trim().toUpperCase();

  // Soporte explícito en español e inglés: TRUE, VERDADERO, FALSE, FALSO
  if (s === 'TRUE' || s === 'VERDADERO' || ds === 'TRUE' || ds === 'VERDADERO') return true;
  if (s === 'FALSE' || s === 'FALSO' || ds === 'FALSE' || ds === 'FALSO') return false;

  var truthy = ['V', 'SI', 'SÍ', 'YES', 'Y', '1', 'CHECKED', 'X', '✓', '✔'];
  if (truthy.indexOf(s) !== -1 || truthy.indexOf(ds) !== -1) return true;

  var falsy = ['F', 'NO', 'UNCHECKED', '0', ''];
  if (falsy.indexOf(s) !== -1 || falsy.indexOf(ds) !== -1) return false;

  return false;
}

function isCheckboxLike(rawVal, dispVal) {
  if (rawVal === true || rawVal === false || rawVal === 1 || rawVal === 0) return true;
  var s = String(rawVal != null ? rawVal : '').trim().toUpperCase();
  var ds = String(dispVal != null ? dispVal : '').trim().toUpperCase();
  var values = [s, ds];
  var tokens = ['TRUE', 'VERDADERO', 'FALSE', 'FALSO', 'V', 'F', 'SI', 'SÍ', 'NO', 'YES', 'Y', 'CHECKED', 'UNCHECKED', 'X', '✓', '✔'];
  for (var i = 0; i < values.length; i++) {
    if (tokens.indexOf(values[i]) !== -1) return true;
  }
  return false;
}

/**
 * Extrae los Gastos Fijos de la hoja leyendo exactamente las filas 13 a 30 (18 filas).
 * En hojas con casillas, la estructura real es E=categoría, F=importe calculado,
 * G=casilla. En Enero/Febrero el importe está directamente en F.
 */
function extractFixedExpensesFromSheet(ws, loadedBlock) {
  var fixedExpenses = [];
  var totalActive = 0;
  var cols = getSheetColumns(ws);

  var numRows = MAX_FIXED_ROWS; // Filas 13 a 32 inclusive
  var allVals;
  var allDisp;
  var allForms;
  if (loadedBlock) {
    if (loadedBlock.fixedOnly) {
      allVals = loadedBlock.values;
      allDisp = loadedBlock.displayValues || allVals;
      allForms = loadedBlock.formulas;
    } else {
      allVals = loadedBlock.values.slice(12, 12 + numRows).map(function(row) { return row.slice(4, 7); });
      allDisp = loadedBlock.displayValues
        ? loadedBlock.displayValues.slice(12, 12 + numRows).map(function(row) { return row.slice(4, 7); })
        : allVals;
      allForms = loadedBlock.formulas.slice(12, 12 + numRows).map(function(row) { return row.slice(4, 7); });
    }
  } else {
    var rangeBlock = ws.getRange(13, 5, numRows, 3); // E:G, la única zona necesaria
    allVals = rangeBlock.getValues();
    allDisp = rangeBlock.getDisplayValues();
    allForms = rangeBlock.getFormulas();
  }

  for (var i = 0; i < numRows; i++) {
    var rowNum = 13 + i;
    var rowVals = allVals[i];
    var rowDisp = allDisp[i];
    var rowForms = allForms[i];

    var cat = String(rowVals[0] || '').trim();

    // Una fila sin categoría no es un gasto fijo válido. No aplicar defaults
    // antes de este filtro, porque crearía filas visibles que están vacías.
    if (!cat) {
      continue;
    }

    var amt = 0;
    var fFormula = String(allForms[i][1] || '');
    var gFormula = String(allForms[i][2] || '');
    var amountIndex = 1;
    var checkIndex = 2;

    // Algunas copias antiguas tienen F=casilla y G=importe. Detectarlo por
    // la columna que contiene la fórmula IF, sin depender del idioma visible.
    if (/(?:IF|SI)\s*\(/i.test(gFormula) && !/(?:IF|SI)\s*\(/i.test(fFormula)) {
      amountIndex = 2;
      checkIndex = 1;
    } else if (!/(?:IF|SI)\s*\(/i.test(fFormula) && isCheckboxLike(rowVals[1], rowDisp[1]) && !isCheckboxLike(rowVals[2], rowDisp[2])) {
      amountIndex = 2;
      checkIndex = 1;
    }

    var amountValue = rowVals[amountIndex];
    var amountFormula = String(allForms[i][amountIndex] || '');
    var parsedAmount = parseFloat(String(amountValue).replace(',', '.'));
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      amt = parsedAmount;
    }

    // Las fórmulas IF devuelven 0 cuando la casilla está desactivada;
    // recuperar en ese caso el importe base del segundo argumento.
    var formulaMatch = amountFormula.match(/(?:IF|SI)\s*\(\s*[^,;]+[,;]\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (formulaMatch && formulaMatch[1]) {
      var formulaAmount = parseFloat(formulaMatch[1].replace(',', '.'));
      if (!isNaN(formulaAmount) && formulaAmount > 0) amt = formulaAmount;
    }

    if (amt === 0 && FIXED_DEFAULT_AMOUNTS[rowNum]) {
      amt = FIXED_DEFAULT_AMOUNTS[rowNum];
    }

    var isChecked = cols.hasCheckbox
      ? isCheckboxChecked(rowVals[checkIndex], rowDisp[checkIndex])
      : amt > 0;

    if (isChecked) {
      totalActive += amt;
    }

    fixedExpenses.push({
      row: rowNum,
      category: cat,
      amount: amt,
      active: isChecked,
      hasCheckbox: cols.hasCheckbox
    });
  }

  return {
    fixedExpenses: fixedExpenses,
    totalActive: Math.round(totalActive * 100) / 100
  };
}

/* ================================================================
 *  SINCRONIZACIÓN TOTAL EN 1 LLAMADA (getFullSyncData)
 * ================================================================ */

/**
 * Descarga todo en 1 sola llamada de ultra alta velocidad:
 * 1. Mes actual completo (resumen, variables, fijos con casillas exactas, ingresos).
 * 2. Meses colindantes (mes anterior y posterior con datos completos).
 * 3. Panel de Control y Plan de Ahorro anual directo de 'Data gráficos' / 'Panel de control'.
 * 4. Categorías de gastos e ingresos.
 */
function getFullSyncData(ss, month) {
  var targetMonth = month || 'Septiembre';
  var targetIdx = -1;
  var normTarget = normalizeStr(targetMonth);
  for (var i = 0; i < ALL_MONTHS.length; i++) {
    if (normalizeStr(ALL_MONTHS[i]) === normTarget) {
      targetIdx = i;
      targetMonth = ALL_MONTHS[i];
      break;
    }
  }
  if (targetIdx === -1) targetIdx = 8; // Septiembre por defecto

  // 1. Datos del mes solicitado
  var currentMonthData = getMonthData(ss, targetMonth);

  // 2. Meses colindantes (anterior y siguiente)
  var prevMonthIdx = (targetIdx - 1 + 12) % 12;
  var nextMonthIdx = (targetIdx + 1) % 12;
  var colindantMonths = {};

  colindantMonths[ALL_MONTHS[prevMonthIdx]] = getMonthData(ss, ALL_MONTHS[prevMonthIdx]);
  colindantMonths[ALL_MONTHS[nextMonthIdx]] = getMonthData(ss, ALL_MONTHS[nextMonthIdx]);

  // 3. Panel de control consolidado
  var controlPanel = getControlPanelData(ss);

  // 4. Categorías
  var categories = getCategories(ss);

  return {
    success: true,
    month: targetMonth,
    monthData: currentMonthData,
    colindantMonths: colindantMonths,
    controlPanel: controlPanel,
    categories: categories,
    timestamp: new Date().toISOString()
  };
}

/* ================================================================
 *  LECTURA INTEGRAL DE MES: getMonthData
 * ================================================================ */

function getMonthData(ss, month) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);

  // Cada bloque se limita a sus columnas reales para evitar leer celdas vacías.
  var incomeScan = 12 + MAX_INCOME_ROWS;
  var incomeVals = ws.getRange(1, cols.income.catCol, incomeScan, 2).getValues();
  var fixedRange = ws.getRange(13, cols.fixed.catCol, MAX_FIXED_ROWS, 3);
  var fixedVals = fixedRange.getValues();
  var fixedForms = fixedRange.getFormulas();
  var variableVals = ws.getRange(1, cols.variable.catCol, MAX_VARIABLE_ROWS, 3).getValues();
  var loadedBlock = {
    values: fixedVals,
    formulas: fixedForms,
    displayValues: fixedVals,
    fixedOnly: true
  };

  // Variables se lee siempre hasta la fila 90; las filas vacías se descartan.
  var variableScan = MAX_VARIABLE_ROWS;
  var expenses = [];
  var totalVar = 0;
  for (var rV = 12; rV < variableScan; rV++) {
    var vCat = String(variableVals[rV][0] || '').trim();
    var vAmt = parseFloat(String(variableVals[rV][2]).replace(',', '.')) || 0;
    var vNorm = normalizeStr(vCat);
    if (!vNorm || vNorm.indexOf('total') !== -1 || vNorm.indexOf('subtotal') !== -1) continue;
    if (vCat !== '' || vAmt > 0) {
      expenses.push({ row: rV + 1, category: vCat || 'General', amount: vAmt });
      totalVar += vAmt;
    }
  }

  // 2. Gastos Fijos y Casillas (Filas 13 a 32)
  var fixedData = extractFixedExpensesFromSheet(ws, loadedBlock);
  var fixedExpenses = fixedData.fixedExpenses;
  var totalFixed = fixedData.totalActive;

  // 3. Ingresos (Col B y Col C)
  var incomes = [];
  var totalInc = 0;
  for (var rI = 12; rI < incomeScan; rI++) {
    var iCat = String(incomeVals[rI][0] || '').trim();
    var iAmt = parseFloat(String(incomeVals[rI][1]).replace(',', '.')) || 0;
    if (iCat !== '' || iAmt > 0) {
      incomes.push({ row: rI + 1, category: iCat || 'Ingreso', amount: iAmt });
      totalInc += iAmt;
    }
  }

  // 4. Meta de ahorro (Celda I3)
  var desiredSavings = parseFloat(String(variableVals[2][cols.isJanFeb ? 1 : 0]).replace(',', '.')) || 0;

  var monthFinalized = normalizeStr(variableVals[2][cols.isJanFeb ? 2 : 1]) === 'finalizado';

  // 5. Total Ingresos de C10 o suma directa
  var c10 = incomeVals[9] && incomeVals[9][1]
    ? (parseFloat(String(incomeVals[9][1]).replace(',', '.')) || 0)
    : 0;
  var finalIncome = c10 > 0 ? c10 : totalInc;

  var totalExp = Math.round((totalFixed + totalVar) * 100) / 100;
  var remaining = Math.round((finalIncome - totalExp - desiredSavings) * 100) / 100;

  var summary = {
    month: ws.getName(),
    income: Math.round(finalIncome * 100) / 100,
    fixedExpenses: Math.round(totalFixed * 100) / 100,
    variableExpenses: Math.round(totalVar * 100) / 100,
    totalExpenses: totalExp,
    desiredSavings: Math.round(desiredSavings * 100) / 100,
    remainingMonth: remaining,
    savings: remaining
  };

  return {
    success: true,
    month: ws.getName(),
    summary: summary,
    expenses: expenses,
    fixedExpenses: fixedExpenses,
    incomes: incomes,
    lastRow: ws.getLastRow(),
    variableRowsRead: variableScan,
    monthFinalized: monthFinalized,
    totalActiveFixed: Math.round(totalFixed * 100) / 100,
    hasCheckbox: cols.hasCheckbox
  };
}

function getExpenses(ss, month) {
  var data = getMonthData(ss, month);
  if (data.error) return data;
  return { expenses: data.expenses, month: data.month, lastRow: data.lastRow };
}

function getSummary(ss, month) {
  var data = getMonthData(ss, month);
  if (data.error) return data;
  return data.summary;
}

function getFixedExpenses(ss, month) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var fixedData = extractFixedExpensesFromSheet(ws);

  // Leer totales rápidos de Fila 10 para el resumen
  var row10 = ws.getRange(10, 1, 1, 12).getValues()[0];
  var inc = parseFloat(String(row10[cols.income.amtCol - 1] || 0).replace(',', '.')) || 0;
  var varExp = parseFloat(String(row10[cols.variable.amtCol - 1] || 0).replace(',', '.')) || 0;
  var totalExp = Math.round((fixedData.totalActive + varExp) * 100) / 100;
  var savings = Math.round((inc - totalExp) * 100) / 100;

  var summary = {
    month: ws.getName(),
    income: inc,
    fixedExpenses: fixedData.totalActive,
    variableExpenses: varExp,
    totalExpenses: totalExp,
    remainingMonth: savings,
    savings: savings
  };

  return {
    success: true,
    month: ws.getName(),
    fixedExpenses: fixedData.fixedExpenses,
    totalActive: fixedData.totalActive,
    hasCheckbox: cols.hasCheckbox,
    summary: summary
  };
}

/* ================================================================
 *  PANEL DE CONTROL ANUAL (Lectura Directa < 100ms)
 * ================================================================ */

function getControlPanelData(ss) {
  var wsGraficos = findSheet(ss, 'Data gráficos') || findSheet(ss, 'Data graficos');
  var wsPanel = findSheet(ss, 'Panel de control') || findSheet(ss, 'Panel de Control');
  var wsPlan = findSheet(ss, 'Plan de Ahorro') || findSheet(ss, 'Plan de ahorro');

  var graficosMatrix = wsGraficos ? wsGraficos.getRange(4, 2, 12, 5).getValues() : null;
  var panelRow7 = wsPanel ? wsPanel.getRange(7, 4, 1, 23).getValues()[0] : null; // D7 a Z7
  var panelRow8 = wsPanel ? wsPanel.getRange(8, 4, 1, 23).getValues()[0] : null; // D8 a Z8
  var panelRow10 = wsPanel ? wsPanel.getRange(10, 4, 1, 23).getValues()[0] : null; // D10 a Z10

  var annualSavingsGoal = 0;
  if (wsPlan) {
    try {
      annualSavingsGoal = parseFloat(String(wsPlan.getRange('C5').getValue()).replace(',', '.')) || 0;
    } catch (_) {}
  }

  var monthlyData = [];
  var totalIncome = 0;
  var totalExpenses = 0;
  var totalSavings = 0;
  var totalFixed = 0;
  var totalVariable = 0;

  for (var m = 0; m < 12; m++) {
    var mName = ALL_MONTHS[m];
    var mShort = SHORT_MONTHS[m];

    var income = 0;
    var fixed = 0;
    var variable = 0;
    var expenses = 0;
    var savings = 0;

    if (graficosMatrix && graficosMatrix[m]) {
      var rG = graficosMatrix[m];
      income = parseFloat(String(rG[1]).replace(',', '.')) || 0;
      fixed = parseFloat(String(rG[2]).replace(',', '.')) || 0;
      variable = parseFloat(String(rG[3]).replace(',', '.')) || 0;
      expenses = parseFloat(String(rG[4]).replace(',', '.')) || (fixed + variable);
    }

    // Si Data Gráficos no tenía datos, leer de Panel de Control (D=0, F=2, H=4...)
    var colOffset = m * 2;
    if (income === 0 && panelRow7 && panelRow7[colOffset] !== undefined) {
      income = parseFloat(String(panelRow7[colOffset]).replace(',', '.')) || 0;
    }
    if (expenses === 0 && panelRow8 && panelRow8[colOffset] !== undefined) {
      expenses = parseFloat(String(panelRow8[colOffset]).replace(',', '.')) || 0;
    }
    if (savings === 0 && panelRow10 && panelRow10[colOffset] !== undefined) {
      savings = parseFloat(String(panelRow10[colOffset]).replace(',', '.')) || 0;
    }

    if (savings === 0 && income > 0) {
      savings = Math.max(0, income - expenses);
    }

    var hasData = (income > 0 || expenses > 0 || fixed > 0 || variable > 0);

    monthlyData.push({
      month: mName,
      shortMonth: mShort,
      monthIndex: m,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      fixedExpenses: Math.round(fixed * 100) / 100,
      variableExpenses: Math.round(variable * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      netBalance: Math.round((income - expenses) * 100) / 100,
      pctFixed: income > 0 ? Math.round((fixed / income) * 10000) / 10000 : 0,
      pctVar: income > 0 ? Math.round((variable / income) * 10000) / 10000 : 0,
      hasData: hasData
    });

    if (hasData) {
      totalIncome += income;
      totalExpenses += expenses;
      totalSavings += savings;
      totalFixed += fixed;
      totalVariable += variable;
    }
  }

  var activeMonths = monthlyData.filter(function(d) { return d.hasData; });
  var count = activeMonths.length || 1;

  return {
    success: true,
    monthlyData: monthlyData,
    annualSavingsGoal: annualSavingsGoal,
    summary: {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      totalFixed: Math.round(totalFixed * 100) / 100,
      totalVariable: Math.round(totalVariable * 100) / 100,
      netBalance: Math.round((totalIncome - totalExpenses) * 100) / 100,
      avgIncome: Math.round((totalIncome / count) * 100) / 100,
      avgExpenses: Math.round((totalExpenses / count) * 100) / 100,
      avgSavings: Math.round((totalSavings / count) * 100) / 100,
      activeMonthsCount: activeMonths.length
    }
  };
}

/* ================================================================
 *  CATEGORÍAS DE GASTOS E INGRESOS
 * ================================================================ */

function getCategories(ss) {
  var ws = findSheet(ss, '(Categorías)') || findSheet(ss, 'Categorías');
  var defaultExpenseCats = [
    'Supermercado', 'Comida Base', 'Cafetería', 'Gimnasio', 'Alquiler',
    'Bono metro', 'Disney', 'Spotify', 'Amazon', 'Viajes tickets',
    'Capricho', 'Farmacia', 'Restaurantes', 'Gasolina', 'Ropa', 'Otros'
  ];
  var defaultIncomeCats = ['Euromar', 'Euromar Extra', 'Bizzum Tarjeta Rest', 'Bizz', 'Nómina', 'Extra'];

  if (!ws) return { categories: defaultExpenseCats, incomeCategories: defaultIncomeCats };

  var cats = [];
  var incCats = [];
  try {
    // Lee desde la fila 2 hasta la fila MAX_CELLS (60): 59 filas × 3 columnas
    var maxR = capCells(ws.getLastRow());
    if (maxR >= 2) {
      var vals = ws.getRange(2, 1, maxR - 1, 3).getValues();
      for (var i = 0; i < vals.length; i++) {
        var c = String(vals[i][0] || '').trim();
        if (c && cats.indexOf(c) === -1) cats.push(c);

        var inc = String(vals[i][2] || '').trim();
        if (inc && incCats.indexOf(inc) === -1) incCats.push(inc);
      }
    }
  } catch (_) {}

  return {
    categories: cats.length > 0 ? cats : defaultExpenseCats,
    incomeCategories: incCats.length > 0 ? incCats : defaultIncomeCats
  };
}

/* ================================================================
 *  SINCRONIZACIÓN EN LOTE (PUSH BATCH CHANGES)
 * ================================================================ */

function pushBatchChanges(ss, tasks) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { success: true, processed: 0, message: 'No hay cambios para subir' };
  }

  var monthsAffected = {};
  var processed = 0;

  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i] || {};
    var action = t.action;
    var month = t.month;
    var p = t.payload || t;
    if (month) monthsAffected[month] = true;

    try {
      if (action === 'addExpense') {
        addExpense(ss, month, p.category, parseFloat(String(p.amount).replace(',', '.')));
        processed++;
      } else if (action === 'updateExpense') {
        updateExpense(ss, month, parseInt(p.row, 10), p.oldCategory, parseFloat(String(p.oldAmount).replace(',', '.')), p.newCategory, parseFloat(String(p.newAmount).replace(',', '.')));
        processed++;
      } else if (action === 'deleteExpense') {
        deleteExpense(ss, month, parseInt(p.row, 10), p.category, parseFloat(String(p.amount).replace(',', '.')));
        processed++;
      } else if (action === 'setFixedExpenseStatus') {
        setFixedExpenseStatus(ss, month, parseInt(p.row, 10), p.active === true || p.active === 'true' || p.active === 1 || p.active === '1');
        processed++;
      } else if (action === 'setFixedExpenseAmount') {
        setFixedExpenseAmount(ss, month, parseInt(p.row, 10), parseFloat(String(p.amount).replace(',', '.')), p.category);
        processed++;
      } else if (action === 'addIncome') {
        addIncome(ss, month, p.category, parseFloat(String(p.amount).replace(',', '.')));
        processed++;
      } else if (action === 'setTotalIncome') {
        setTotalIncome(ss, month, parseFloat(String(p.amount).replace(',', '.')), p.category);
        processed++;
      } else if (action === 'setSavingsGoal') {
        setSavingsGoal(ss, month, parseFloat(String(p.amount).replace(',', '.')));
        processed++;
      } else if (action === 'setMonthFinalized') {
        setMonthFinalized(ss, month, p.finalized === true || p.finalized === 'true' || p.finalized === '1');
        processed++;
      }
    } catch (_) {}
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    processed: processed,
    monthsAffected: Object.keys(monthsAffected)
  };
}

/* ================================================================
 *  MUTACIONES (ESCRITURA RÁPIDA)
 * ================================================================ */

function addExpense(ss, month, category, amount) {
  var cleanCat = String(category || '').trim();
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (!cleanCat || isNaN(parsedAmt) || parsedAmt <= 0) return { error: 'Datos de gasto inválidos' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  // Gastos Variables permite buscar huecos hasta la fila 90.
  var maxScan = MAX_VARIABLE_ROWS;
  var nextRow = maxScan + 1;

  if (maxScan >= 13) {
    var numRowsToScan = maxScan - 12; // filas 13..90
    var catVals = ws.getRange(13, cols.variable.catCol, numRowsToScan, 1).getValues();
    for (var i = 0; i < catVals.length; i++) {
      if (String(catVals[i][0] || '').trim() === '') {
        nextRow = i + 13;
        break;
      }
    }
  }

  // Si no queda hueco dentro de la zona leída, no se escribe fuera de ella.
  if (nextRow > MAX_VARIABLE_ROWS) return { error: 'No hay filas libres: límite de ' + MAX_VARIABLE_ROWS + ' filas alcanzado' };

  if (nextRow > ws.getMaxRows()) ws.insertRowsAfter(ws.getMaxRows(), 5);

  ws.getRange(nextRow, cols.variable.catCol).setValue(cleanCat);
  ws.getRange(nextRow, cols.variable.amtCol).setValue(parsedAmt);

  return { success: true, row: nextRow, category: cleanCat, amount: parsedAmt };
}

function updateExpense(ss, month, row, oldCategory, oldAmount, newCategory, newAmount) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > MAX_VARIABLE_ROWS) return { error: 'Fila inválida: ' + row };

  if (newCategory) ws.getRange(targetRow, cols.variable.catCol).setValue(String(newCategory).trim());
  if (!isNaN(newAmount)) ws.getRange(targetRow, cols.variable.amtCol).setValue(newAmount);

  return { success: true, row: targetRow };
}

function deleteExpense(ss, month, row, category, amount) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > MAX_VARIABLE_ROWS) return { error: 'Fila inválida: ' + row };

  ws.getRange(targetRow, cols.variable.catCol).clearContent();
  ws.getRange(targetRow, cols.variable.amtCol).clearContent();

  return { success: true, row: targetRow };
}

function setFixedExpenseStatus(ss, month, row, active) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > 12 + MAX_FIXED_ROWS) return { error: 'Fila inválida: ' + row };

  var isActive = (active === true || active === 'true' || active === 1);

  if (cols.hasCheckbox && cols.fixed.checkCol) {
    ws.getRange(targetRow, cols.fixed.checkCol).setValue(isActive);
    // Asegurar fórmula condicional
    var amtCell = ws.getRange(targetRow, cols.fixed.amtCol);
    var curF = String(amtCell.getFormula() || '');
    if (!curF || (curF.indexOf('IF') === -1 && curF.indexOf('SI') === -1)) {
      var defaultAmt = FIXED_DEFAULT_AMOUNTS[targetRow] || 0;
      var curVal = parseFloat(String(amtCell.getValue()).replace(',', '.')) || defaultAmt;
      amtCell.setFormula('=IF(G' + targetRow + ', ' + curVal + ', 0)');
    }
  } else {
    if (!isActive) ws.getRange(targetRow, cols.fixed.amtCol).setValue(0);
  }

  return { success: true, row: targetRow, active: isActive };
}

function setFixedExpenseAmount(ss, month, row, newAmount, newCategory) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > 12 + MAX_FIXED_ROWS) return { error: 'Fila inválida: ' + row };

  var numAmount = parseFloat(String(newAmount).replace(',', '.'));
  if (isNaN(numAmount) || numAmount < 0) return { error: 'Importe inválido' };

  if (newCategory) ws.getRange(targetRow, cols.fixed.catCol).setValue(String(newCategory).trim());

  var amtCell = ws.getRange(targetRow, cols.fixed.amtCol);
  if (cols.hasCheckbox && cols.fixed.checkCol) {
    amtCell.setFormula('=IF(G' + targetRow + ', ' + numAmount + ', 0)');
  } else {
    amtCell.setValue(numAmount);
  }

  return { success: true, row: targetRow, newAmount: numAmount };
}

function setFixedExpensesBatch(ss, month, updates) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);

  if (!Array.isArray(updates)) return { error: 'Formato incorrecto' };
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var r = parseInt(u.row, 10);
    var act = (u.active === true || u.active === 'true' || u.active === 1);
    if (!isNaN(r) && r >= 13 && r <= 12 + MAX_FIXED_ROWS) {
      if (cols.hasCheckbox && cols.fixed.checkCol) {
        ws.getRange(r, cols.fixed.checkCol).setValue(act);
      } else {
        if (!act) ws.getRange(r, cols.fixed.amtCol).setValue(0);
      }
    }
  }
  return { success: true };
}

function addIncome(ss, month, category, amount) {
  var cleanCat = String(category || '').trim() || 'Ingreso';
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt <= 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);
  // Límite vertical de escaneo: máximo MAX_CELLS (60) filas
  var maxScan = 12 + MAX_INCOME_ROWS;
  var targetRow = maxScan + 1;

  if (maxScan >= 13) {
    var numRowsToScan = maxScan - 12; // filas 13..maxScan (máx. 48)
    var bVals = ws.getRange(13, cols.income.catCol, numRowsToScan, 1).getValues();
    for (var i = 0; i < bVals.length; i++) {
      if (String(bVals[i][0] || '').trim() === '') {
        targetRow = i + 13;
        break;
      }
    }
  }

  // Si no queda hueco dentro de las 10 filas de ingresos, no se escribe fuera de ellas.
  if (targetRow > 12 + MAX_INCOME_ROWS) return { error: 'No hay filas libres: límite de ' + MAX_INCOME_ROWS + ' filas alcanzado' };

  if (targetRow > ws.getMaxRows()) ws.insertRowsAfter(ws.getMaxRows(), 5);

  ws.getRange(targetRow, cols.income.catCol).setValue(cleanCat);
  ws.getRange(targetRow, cols.income.amtCol).setValue(parsedAmt);

  return { success: true, row: targetRow, category: cleanCat, amount: parsedAmt };
}

function setTotalIncome(ss, month, amount, optionalCategory) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };
  var cols = getSheetColumns(ws);

  ws.getRange(13, cols.income.catCol).setValue(optionalCategory || 'Euromar');
  ws.getRange(13, cols.income.amtCol).setValue(parsedAmt);

  return { success: true, income: parsedAmt };
}

function setSavingsGoal(ss, month, amount) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  ws.getRange(3, 9).setValue(parsedAmt); // I3
  SpreadsheetApp.flush();

  return { success: true, desiredSavings: parsedAmt };
}

function setMonthFinalized(ss, month, finalized) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  // J3 está libre en la plantilla y queda junto a la meta de ahorro (I3).
  ws.getRange(3, 10).setValue(finalized ? 'FINALIZADO' : '');
  SpreadsheetApp.flush();

  return { success: true, month: ws.getName(), finalized: finalized };
}

function getMonthFinalizedStatuses(ss) {
  var statuses = {};
  for (var i = 0; i < ALL_MONTHS.length; i++) {
    var month = ALL_MONTHS[i];
    var ws = findSheet(ss, month);
    if (!ws) continue;
    statuses[ws.getName()] = normalizeStr(ws.getRange('J3').getValue()) === 'finalizado';
  }
  return { success: true, statuses: statuses };
}

function repairFixedExpenseFormulas(ss, month, forceAll) {
  var targetMonths = forceAll ? ALL_MONTHS : [month || 'Septiembre'];
  var repaired = 0;

  for (var m = 0; m < targetMonths.length; m++) {
    var ws = findSheet(ss, targetMonths[m]);
    if (!ws) continue;
    var cols = getSheetColumns(ws);
    if (!cols.hasCheckbox || !cols.fixed.checkCol) continue;

    for (var r = 13; r <= 12 + MAX_FIXED_ROWS; r++) {
      var amtCell = ws.getRange(r, cols.fixed.amtCol);
      var defaultAmt = FIXED_DEFAULT_AMOUNTS[r] || 0;
      amtCell.setFormula('=IF(G' + r + ', ' + defaultAmt + ', 0)');
      repaired++;
    }
  }

  return { success: true, repairedCount: repaired };
}