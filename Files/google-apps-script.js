/**
 * ============================================================
 *  Google Apps Script — Backend para Control Gastos App (v3.6.0)
 *  Soporte Local-First con "Push Changes" en lote y sincronización
 * ============================================================
 *
 *  ESTRUCTURA DE COLUMNAS DEL SPREADSHEET (Control Dinero 2026):
 *
 *  Meses Marzo a Diciembre (Con Casillas de Verificación):
 *    - Fila 10 Totales:
 *        C10: INGRESOS TOTALES          =SUM(C13:C993)
 *        G10: GASTOS FIJOS TOTALES      =SUM(G13:G993)
 *        K10: GASTOS VARIABLES TOTALES  =SUM(K13:K993)
 *    - Fila 12 Encabezados:
 *        B12: Categoría | C12: Cantidad (Ingresos)
 *        E12: Categoría | F12: [Casilla] | G12: Cantidad (Gastos Fijos)
 *        I12: Categoría | K12: Cantidad (Gastos Variables)
 *    - Filas 13 a 21 (Gastos Fijos):
 *        Col E (5): Categoría / Concepto
 *        Col F (6): Casilla de verificación (TRUE / FALSE / 1 / 0)
 *        Col G (7): Importe condicional: =IF(F13, 470, 0)
 *    - Filas 13+ (Gastos Variables):
 *        Col I (9): Categoría
 *        Col K (11): Cantidad / Importe
 *    - Filas 13+ (Ingresos):
 *        Col B (2): Categoría
 *        Col C (3): Cantidad / Importe
 *    - Meta de Ahorro: Celda I3 (Fila 3, Columna 9)
 *
 *  Meses Enero y Febrero (Sin Casillas):
 *    - C10: Ingresos | F10: Gastos Fijos | J10: Gastos Variables
 *    - Ingresos: Col B (2) y Col C (3)
 *    - Gastos Fijos: Col E (5) y Col F (6)
 *    - Gastos Variables: Col H (8) y Col J (10)
 *
 *  INSTRUCCIONES DE DESPLIEGUE:
 *  1. Abre tu hoja en Google Sheets.
 *  2. Ve a Extensiones → Apps Script.
 *  3. Borra todo y pega ESTE archivo completo.
 *  4. Guarda (Ctrl+S).
 *  5. Haz clic en Implementar → Nueva implementación:
 *       • Tipo: Aplicación web
 *       • Ejecutar como: Tu cuenta (yo@gmail.com)
 *       • Acceso: Cualquier persona (Anyone)
 *  6. Haz clic en "Implementar" y copia la URL terminada en "/exec".
 * ============================================================
 */

/* ---- Punto de entrada GET (lectura + escritura) ---- */

function doGet(e) {
  var result;
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (eSs) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No se pudo acceder al Spreadsheet activo: ' + eSs.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No se encontró la hoja de cálculo activa' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action;

    if (action === 'ping') {
      result = {
        status: 'ok',
        version: '3.5.0',
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName(),
        timestamp: new Date().toISOString()
      };
    } else if (action === 'getSpreadsheetInfo') {
      result = {
        status: 'ok',
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName()
      };
    } else if (action === 'getMonthData') {
      result = getMonthData(ss, params.month, params.knownRowCount);
    } else if (action === 'getCategories') {
      result = getCategories(ss);
    } else if (action === 'getExpenses') {
      result = getExpenses(ss, params.month);
    } else if (action === 'getSummary') {
      result = getSummary(ss, params.month);
    } else if (action === 'addIncome') {
      result = addIncome(
        ss,
        params.month,
        params.category,
        parseFloat(String(params.amount).replace(',', '.'))
      );
    } else if (action === 'addExpense') {
      result = addExpense(
        ss,
        params.month,
        params.category,
        parseFloat(String(params.amount).replace(',', '.'))
      );
    } else if (action === 'updateExpense') {
      result = updateExpense(
        ss,
        params.month,
        parseInt(params.row, 10),
        params.oldCategory,
        parseFloat(String(params.oldAmount).replace(',', '.')),
        params.newCategory,
        parseFloat(String(params.newAmount).replace(',', '.'))
      );
    } else if (action === 'deleteExpense') {
      result = deleteExpense(
        ss,
        params.month,
        parseInt(params.row, 10),
        params.category,
        parseFloat(String(params.amount).replace(',', '.'))
      );
    } else if (action === 'setSavingsGoal') {
      result = setSavingsGoal(
        ss,
        params.month,
        parseFloat(String(params.amount).replace(',', '.'))
      );
    } else if (action === 'setTotalIncome') {
      result = setTotalIncome(
        ss,
        params.month,
        parseFloat(String(params.amount).replace(',', '.')),
        params.category
      );
    } else if (action === 'getFixedExpenses') {
      result = getFixedExpenses(ss, params.month);
    } else if (action === 'setFixedExpenseStatus' || action === 'toggleFixedExpense') {
      result = setFixedExpenseStatus(
        ss,
        params.month,
        parseInt(params.row, 10),
        params.active === 'true' || params.active === true || params.active === '1' || params.active === 1
      );
    } else if (action === 'setFixedExpenseAmount' || action === 'updateFixedExpenseAmount') {
      result = setFixedExpenseAmount(
        ss,
        params.month,
        parseInt(params.row, 10),
        parseFloat(String(params.amount || params.newAmount).replace(',', '.')),
        params.category || params.newCategory
      );
    } else if (action === 'setFixedExpensesBatch') {
      var batchUpdates = [];
      try {
        batchUpdates = JSON.parse(params.updates || '[]');
      } catch (e) {
        batchUpdates = [];
      }
      result = setFixedExpensesBatch(ss, params.month, batchUpdates);
    } else if (action === 'repairFixedExpenseFormulas') {
      result = repairFixedExpenseFormulas(ss, params.month, params.forceAll === 'true' || params.forceAll === true);
    } else if (action === 'getControlPanelData' || action === 'getDashboardData') {
      result = getControlPanelData(ss);
    } else if (action === 'pushBatchChanges') {
      var batchTasks = [];
      try {
        batchTasks = typeof params.tasks === 'string' ? JSON.parse(params.tasks) : (params.tasks || []);
      } catch (eTasks) {
        batchTasks = [];
      }
      result = pushBatchChanges(ss, batchTasks);
    } else if (action === 'setLocaleSpain') {
      ensureSpanishLocale(ss);
      result = { status: 'ok', locale: ss.getSpreadsheetLocale() };
    } else {
      result = { error: 'Acción desconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  try {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (jsonErr) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Error serializando respuesta: ' + jsonErr.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ---- Punto de entrada POST (escritura) ---- */

function doPost(e) {
  var result;
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (eSs) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No se pudo acceder al Spreadsheet activo: ' + eSs.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No se encontró la hoja de cálculo activa' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        data = {};
      }
    }
    if (!data.action && e && e.parameter) {
      for (var pKey in e.parameter) {
        if (e.parameter.hasOwnProperty(pKey)) {
          data[pKey] = e.parameter[pKey];
        }
      }
    }

    if (data.action === 'ping') {
      result = { status: 'ok', version: '3.5.0' };
    } else if (data.action === 'getMonthData') {
      result = getMonthData(ss, data.month, data.knownRowCount);
    } else if (data.action === 'getCategories') {
      result = getCategories(ss);
    } else if (data.action === 'addIncome') {
      result = addIncome(
        ss,
        data.month,
        data.category,
        parseFloat(String(data.amount).replace(',', '.'))
      );
    } else if (data.action === 'addExpense') {
      result = addExpense(
        ss,
        data.month,
        data.category,
        parseFloat(String(data.amount).replace(',', '.'))
      );
    } else if (data.action === 'updateExpense') {
      result = updateExpense(
        ss,
        data.month,
        parseInt(data.row, 10),
        data.oldCategory,
        parseFloat(String(data.oldAmount).replace(',', '.')),
        data.newCategory,
        parseFloat(String(data.newAmount).replace(',', '.'))
      );
    } else if (data.action === 'deleteExpense') {
      result = deleteExpense(
        ss,
        data.month,
        parseInt(data.row, 10),
        data.category,
        parseFloat(String(data.amount).replace(',', '.'))
      );
    } else if (data.action === 'setSavingsGoal') {
      result = setSavingsGoal(
        ss,
        data.month,
        parseFloat(String(data.amount).replace(',', '.'))
      );
    } else if (data.action === 'setTotalIncome') {
      result = setTotalIncome(
        ss,
        data.month,
        parseFloat(String(data.amount).replace(',', '.')),
        data.category
      );
    } else if (data.action === 'getFixedExpenses') {
      result = getFixedExpenses(ss, data.month);
    } else if (data.action === 'setFixedExpenseStatus' || data.action === 'toggleFixedExpense') {
      result = setFixedExpenseStatus(
        ss,
        data.month,
        parseInt(data.row, 10),
        data.active === true || data.active === 'true' || data.active === 1 || data.active === '1'
      );
    } else if (data.action === 'setFixedExpenseAmount' || data.action === 'updateFixedExpenseAmount') {
      result = setFixedExpenseAmount(
        ss,
        data.month,
        parseInt(data.row, 10),
        parseFloat(String(data.amount || data.newAmount).replace(',', '.')),
        data.category || data.newCategory
      );
    } else if (data.action === 'setFixedExpensesBatch') {
      result = setFixedExpensesBatch(ss, data.month, data.updates || []);
    } else if (data.action === 'repairFixedExpenseFormulas') {
      result = repairFixedExpenseFormulas(ss, data.month, data.forceAll === true || data.forceAll === 'true');
    } else if (data.action === 'getControlPanelData' || data.action === 'getDashboardData') {
      result = getControlPanelData(ss);
    } else if (data.action === 'pushBatchChanges') {
      var postBatchTasks = [];
      try {
        postBatchTasks = typeof data.tasks === 'string' ? JSON.parse(data.tasks) : (data.tasks || []);
      } catch (ePTasks) {
        postBatchTasks = [];
      }
      result = pushBatchChanges(ss, postBatchTasks);
    } else if (data.action === 'setLocaleSpain') {
      ensureSpanishLocale(ss);
      result = { status: 'ok', locale: ss.getSpreadsheetLocale() };
    } else {
      result = { error: 'Acción desconocida' };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  try {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (jsonErr) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Error serializando respuesta: ' + jsonErr.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ================================================================
 *  UTILIDADES Y RESOLUCIÓN EXACTA DE COLUMNAS
 * ================================================================ */

/**
 * Normaliza cadenas para comparaciones seguras (sin tildes, minúsculas, sin espacios extra).
 */
function normalizeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Busca una pestaña en el Spreadsheet ignorando mayúsculas/minúsculas y acentos.
 */
function findSheet(ss, name) {
  if (!name) return null;
  var exact = ss.getSheetByName(name);
  if (exact) return exact;

  var cleanTarget = normalizeStr(name).replace(/[()]/g, '');
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    var cleanName = normalizeStr(sName).replace(/[()]/g, '');
    if (cleanName === cleanTarget) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Devuelve el mapa exacto de columnas para el mes solicitado con inspección dinámica.
 * Estructura nativa:
 *   - Marzo a Diciembre:
 *       Ingresos:      Cat Col B (2), Cant Col C (3), Total en C10
 *       Gastos Fijos:  Cat Col E (5), Checkbox Col F (6), Cant Col G (7), Total en G10
 *       Gastos Var:    Cat Col I (9), Cant Col K (11), Total en K10
 *   - Enero y Febrero:
 *       Ingresos:      Cat Col B (2), Cant Col C (3), Total en C10
 *       Gastos Fijos:  Cat Col E (5), Cant Col F (6) [sin casilla], Total en F10
 *       Gastos Var:    Cat Col H (8), Cant Col J (10), Total en J10
 */
function getSheetColumns(ws) {
  var name = ws.getName();
  var normName = normalizeStr(name);
  var isJanFeb = (normName === 'enero' || normName === 'febrero');

  // Valores predeterminados oficiales de la plantilla
  var varCatCol = isJanFeb ? 8 : 9;        // Col H (8) o Col I (9)
  var varAmtCol = isJanFeb ? 10 : 11;      // Col J (10) o Col K (11)
  var fixedCatCol = 5;                     // Col E (5)
  var fixedCheckCol = isJanFeb ? null : 6; // Col F (6) Casilla para Marzo-Diciembre
  var fixedAmtCol = isJanFeb ? 6 : 7;      // Col F (6) o Col G (7)
  var incomeCatCol = 2;                    // Col B (2)
  var incomeAmtCol = 3;                    // Col C (3)
  var hasCheckbox = !isJanFeb;

  // Verificación dinámica en filas 10 a 12 si la hoja tiene encabezados personalizados
  try {
    var scanCols = Math.min(ws.getLastColumn(), 15);
    if (scanCols >= 7 && ws.getLastRow() >= 12) {
      var r12 = ws.getRange(12, 1, 1, scanCols).getValues()[0];
      var f12 = normalizeStr(r12[5] || ''); // Col F (idx 5)
      var g12 = normalizeStr(r12[6] || ''); // Col G (idx 6)
      var h12 = normalizeStr(r12[7] || ''); // Col H (idx 7)
      var i12 = normalizeStr(r12[8] || ''); // Col I (idx 8)

      // Comprobar si Col F es la cantidad (Enero/Febrero) o si es Col G (Marzo-Diciembre)
      if (f12.indexOf('cant') >= 0 || f12.indexOf('imp') >= 0) {
        hasCheckbox = false;
        fixedCheckCol = null;
        fixedAmtCol = 6;
      } else if (g12.indexOf('cant') >= 0 || g12.indexOf('imp') >= 0) {
        hasCheckbox = true;
        fixedCheckCol = 6;
        fixedAmtCol = 7;
      }

      // Columnas de Gastos Variables
      if (h12.indexOf('cat') >= 0) {
        varCatCol = 8;
        varAmtCol = 10;
      } else if (i12.indexOf('cat') >= 0) {
        varCatCol = 9;
        varAmtCol = 11;
      }
    }
  } catch (e) {}

  return {
    isJanFeb: isJanFeb,
    hasCheckbox: hasCheckbox,
    income: {
      catCol: incomeCatCol,
      amtCol: incomeAmtCol,
      totalCell: 'C10'
    },
    fixed: {
      catCol: fixedCatCol,
      checkCol: fixedCheckCol,
      amtCol: fixedAmtCol,
      totalCell: hasCheckbox ? 'G10' : 'F10'
    },
    variable: {
      catCol: varCatCol,
      amtCol: varAmtCol,
      totalCell: (varAmtCol === 10) ? 'J10' : 'K10'
    }
  };
}

/**
 * Localiza la hoja de categorías (ej. "(Categorías)", "Categorías", etc.).
 */
function findCategoriesSheet(ss) {
  var exact = ss.getSheetByName('(Categorías)');
  if (exact) return exact;

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    var norm = normalizeStr(sName);
    if (norm.indexOf('categor') >= 0) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Devuelve la lista de categorías registradas en la hoja (Categorías).
 */
function getCategories(ss) {
  var variableCategories = [];
  var incomeCategories = [];
  var fixedCategories = [];

  var catSheet = findCategoriesSheet(ss);
  if (catSheet) {
    try {
      var lastRow = Math.min(catSheet.getLastRow(), 60);
      if (lastRow >= 3) {
        var numRows = lastRow - 2;
        var matrix = catSheet.getRange(3, 2, numRows, 5).getValues();
        for (var r = 0; r < matrix.length; r++) {
          var b = String(matrix[r][0] || '').trim();
          var d = String(matrix[r][2] || '').trim();
          var f = String(matrix[r][4] || '').trim();

          if (b && b.toLowerCase() !== 'ingresos' && incomeCategories.indexOf(b) === -1) {
            incomeCategories.push(b);
          }
          if (d && d.toLowerCase() !== 'gastos fijos' && fixedCategories.indexOf(d) === -1) {
            fixedCategories.push(d);
          }
          if (f && f.toLowerCase() !== 'gastos variables' && variableCategories.indexOf(f) === -1) {
            variableCategories.push(f);
          }
        }
      }
    } catch (e) {}
  }

  if (incomeCategories.length === 0) {
    incomeCategories = ['Euromar', 'Euromar Extra', 'Bizzum Tarjeta Rest', 'Bizz', 'Nómina', 'Extra'];
  }
  if (variableCategories.length === 0) {
    variableCategories = [
      'Fiesta bebida', 'Fiesta entradas', 'Restaurante', 'Bebidas',
      'Bizzum', 'Viajes tickets', 'Peluquerias', 'Cosmetico',
      'Chino Bazar', 'Cafetería', 'Restaurante (Tarjeta Rest)', 'Ocio',
      'Supermecado', 'Museo', 'Regalos', 'Transporte',
      'Musica Tickets', 'Tramites'
    ];
  }

  return {
    categories: variableCategories,
    variableCategories: variableCategories,
    incomeCategories: incomeCategories,
    fixedCategories: fixedCategories
  };
}

/**
 * Nombres por defecto de categorías para filas 13 a 21 de Gastos Fijos.
 */
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

/**
 * Importes por defecto para filas 13 a 21.
 */
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

/**
 * Comprueba si una casilla está marcada basándose en su valor (booleano, 1/0 o texto).
 */
function isCheckboxChecked(rawVal, displayVal) {
  if (rawVal === true) return true;
  if (rawVal === false) return false;
  if (rawVal === 1 || rawVal === '1') return true;
  if (rawVal === 0 || rawVal === '0') return false;
  if (rawVal === null || rawVal === undefined || rawVal === '') return false;

  var s = String(rawVal).trim().toLowerCase();
  var ds = String(displayVal || '').trim().toLowerCase();

  var truthy = ['true', 'verdadero', 'v', 'si', 'sí', 'yes', 'y', 'checked', 'ok', 'x', '✓', '✔'];
  if (truthy.indexOf(s) !== -1 || truthy.indexOf(ds) !== -1) return true;

  var falsy = ['false', 'falso', 'f', 'no', 'unchecked', '', 'null', 'undefined'];
  if (falsy.indexOf(s) !== -1 || falsy.indexOf(ds) !== -1) return false;

  return false;
}

/**
 * Asegura la configuración regional de España (es_ES) en segundo plano si es necesario.
 */
function ensureSpanishLocale(ss) {
  try {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && ss.getSpreadsheetLocale) {
      var currentLocale = ss.getSpreadsheetLocale();
      if (currentLocale !== 'es_ES' && currentLocale !== 'es_es') {
        ss.setSpreadsheetLocale('es_ES');
      }
    }
  } catch (e) {}
}

/* ================================================================
 *  LECTURA INTEGRAL Y RÁPIDA: getMonthData
 * ================================================================ */

/**
 * Lee en 1 sola llamada a Sheets todo el contenido del mes:
 * Resumen, Gastos Variables, Gastos Fijos con casillas, e Ingresos.
 */
function getMonthData(ss, month, knownRowCount) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var lastRow = ws.getLastRow();
  var cols = getSheetColumns(ws);

  // Lectura completa en 1 solo bloque en memoria (hasta 150 filas x 13 cols)
  var maxScan = Math.min(Math.max(lastRow, 25), 250);
  var maxCols = Math.max(cols.variable.amtCol, 11);
  var rangeBlock = ws.getRange(1, 1, maxScan, maxCols);
  var allVals = rangeBlock.getValues();
  var allFormulas = rangeBlock.getFormulas();

  // 1. Extraer Gastos Variables (Filas 13 en adelante)
  var expenses = [];
  var totalVarCalculated = 0;
  for (var rV = 12; rV < maxScan; rV++) {
    var vCat = String(allVals[rV][cols.variable.catCol - 1] || '').trim();
    var vAmt = parseFloat(String(allVals[rV][cols.variable.amtCol - 1]).replace(',', '.')) || 0;
    var vNorm = normalizeStr(vCat);
    if (vNorm.indexOf('total') !== -1 || vNorm.indexOf('subtotal') !== -1) continue;
    if (vCat !== '' || vAmt > 0) {
      expenses.push({
        row: rV + 1,
        category: vCat || 'General',
        amount: vAmt
      });
      totalVarCalculated += vAmt;
    }
  }

  // 2. Extraer Gastos Fijos (Filas 13 a 21)
  var fixedExpenses = [];
  var totalFixedCalculated = 0;
  var fixedEnd = Math.min(maxScan, 22);
  for (var rF = 12; rF < fixedEnd && rF <= 20; rF++) {
    var rowNum = rF + 1;
    var fCat = String(allVals[rF][cols.fixed.catCol - 1] || '').trim();
    if (!fCat && FIXED_DEFAULT_CATEGORIES[rowNum]) fCat = FIXED_DEFAULT_CATEGORIES[rowNum];
    if (!fCat) continue;

    var isChecked = true;
    if (cols.hasCheckbox && cols.fixed.checkCol) {
      var checkVal = allVals[rF][cols.fixed.checkCol - 1];
      isChecked = isCheckboxChecked(checkVal);
    }

    var fAmt = parseFloat(String(allVals[rF][cols.fixed.amtCol - 1]).replace(',', '.')) || 0;
    if (fAmt === 0 && allFormulas && allFormulas[rF]) {
      var fForm = String(allFormulas[rF][cols.fixed.amtCol - 1] || '');
      var m = fForm.match(/IF\s*\(\s*[^,;]+[,;]\s*([0-9.,]+)/i);
      if (m && m[1]) {
        var parsedForm = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(parsedForm) && parsedForm > 0) {
          fAmt = parsedForm;
        }
      }
    }
    if (fAmt === 0 && FIXED_DEFAULT_AMOUNTS[rowNum]) {
      fAmt = FIXED_DEFAULT_AMOUNTS[rowNum];
    }

    if (isChecked) {
      totalFixedCalculated += fAmt;
    }

    fixedExpenses.push({
      row: rowNum,
      category: fCat,
      amount: fAmt,
      active: isChecked,
      hasCheckbox: cols.hasCheckbox
    });
  }

  // 3. Extraer Ingresos (Col B y Col C, Filas 13 en adelante)
  var incomes = [];
  var totalIncCalculated = 0;
  for (var rI = 12; rI < maxScan; rI++) {
    var iCat = String(allVals[rI][cols.income.catCol - 1] || '').trim();
    var iAmt = parseFloat(String(allVals[rI][cols.income.amtCol - 1]).replace(',', '.')) || 0;
    if (iCat !== '' || iAmt > 0) {
      incomes.push({ row: rI + 1, category: iCat || 'Ingreso', amount: iAmt });
      totalIncCalculated += iAmt;
    }
  }

  // 4. Meta de ahorro (Fila 3, Col I = 9)
  var desiredSavings = 0;
  if (allVals[2] && allVals[2][8]) {
    desiredSavings = parseFloat(String(allVals[2][8]).replace(',', '.')) || 0;
  }

  // 5. Ingresos Totales de C10 o de la suma calculada
  var c10Income = (allVals[9] && allVals[9][cols.income.amtCol - 1])
    ? (parseFloat(String(allVals[9][cols.income.amtCol - 1]).replace(',', '.')) || 0)
    : 0;
  var finalIncome = c10Income > 0 ? c10Income : totalIncCalculated;

  var totalExpenses = Math.round((totalFixedCalculated + totalVarCalculated) * 100) / 100;
  var remainingMonth = Math.round((finalIncome - totalExpenses - desiredSavings) * 100) / 100;

  var summary = {
    month: ws.getName(),
    income: Math.round(finalIncome * 100) / 100,
    fixedExpenses: Math.round(totalFixedCalculated * 100) / 100,
    variableExpenses: Math.round(totalVarCalculated * 100) / 100,
    totalExpenses: totalExpenses,
    desiredSavings: Math.round(desiredSavings * 100) / 100,
    remainingMonth: remainingMonth,
    savings: remainingMonth
  };

  return {
    success: true,
    month: ws.getName(),
    summary: summary,
    expenses: expenses,
    fixedExpenses: fixedExpenses,
    incomes: incomes,
    lastRow: lastRow,
    expensesCount: expenses.length,
    totalActiveFixed: Math.round(totalFixedCalculated * 100) / 100,
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
  var data = getMonthData(ss, month);
  if (data.error) return data;
  return {
    month: data.month,
    fixedExpenses: data.fixedExpenses,
    totalActive: data.totalActiveFixed,
    hasCheckbox: data.hasCheckbox,
    summary: data.summary
  };
}

/* ================================================================
 *  MUTACIÓN DE GASTOS VARIABLES: ADD, UPDATE, DELETE
 * ================================================================ */

/**
 * Añade un gasto variable al mes con localización instantánea y respuesta inmediata.
 */
function addExpense(ss, month, category, amount) {
  var cleanCat = String(category || '').trim();
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));

  if (!cleanCat) return { error: 'La categoría no puede estar vacía' };
  if (isNaN(parsedAmt) || parsedAmt <= 0) return { error: 'Importe inválido' };

  // Salvaguarda: Si la categoría es de tipo ingresos, redirigir a addIncome
  var normCat = normalizeStr(cleanCat);
  var incomeKeywords = ['euromar', 'euromar extra', 'bizzum tarjeta rest', 'bizum', 'bizz', 'bizzum', 'nomina', 'sueldo', 'salario', 'ingreso', 'ingresos', 'extra', 'trabajo', 'paga'];
  if (incomeKeywords.indexOf(normCat) !== -1) {
    return addIncome(ss, month, cleanCat, parsedAmt);
  }

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var lastRow = Math.max(ws.getLastRow(), 12);
  var nextRow = 13;

  // Encontrar la primera fila libre en la columna de gastos variables (Col I o Col H)
  if (lastRow >= 13) {
    var numRows = lastRow - 12;
    var catVals = ws.getRange(13, cols.variable.catCol, numRows, 1).getValues();
    nextRow = lastRow + 1;
    for (var i = 0; i < catVals.length; i++) {
      if (String(catVals[i][0] || '').trim() === '') {
        nextRow = i + 13;
        break;
      }
    }
  }

  // Asegurar filas en la hoja
  if (nextRow > ws.getMaxRows()) {
    ws.insertRowsAfter(ws.getMaxRows(), 10);
  }

  // Escribir categoría e importe directamente
  var catCell = ws.getRange(nextRow, cols.variable.catCol);
  var amtCell = ws.getRange(nextRow, cols.variable.amtCol);

  try {
    catCell.setValue(cleanCat);
  } catch (eCat) {
    try {
      catCell.clearDataValidations();
      catCell.setValue(cleanCat);
    } catch (eCat2) {}
  }

  amtCell.setValue(parsedAmt);

  // Asegurar que la fórmula en la celda de total esté activa (K10 o J10)
  try {
    var totColLetter = cols.variable.amtCol === 10 ? 'J' : 'K';
    var totCell = ws.getRange(10, cols.variable.amtCol);
    var curF = String(totCell.getFormula() || '');
    if (!curF || curF.indexOf('SUM') === -1) {
      totCell.setFormula('=SUM(' + totColLetter + '13:' + totColLetter + '993)');
    }
  } catch (eTot) {}

  SpreadsheetApp.flush();

  // Devolver inmediatamente los datos actualizados del mes
  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    row: nextRow,
    category: cleanCat,
    amount: parsedAmt,
    month: ws.getName(),
    summary: updated.summary,
    expenses: updated.expenses,
    lastRow: updated.lastRow
  };
}

/**
 * Modifica un gasto variable existente.
 * Sabe exactamente en qué fila y columna escribir de forma directa y ultra rápida.
 */
function updateExpense(ss, month, row, oldCategory, oldAmount, newCategory, newAmount) {
  var cleanNewCat = String(newCategory || '').trim();
  var parsedNewAmt = parseFloat(String(newAmount).replace(',', '.'));

  if (!cleanNewCat) return { error: 'La categoría no puede estar vacía' };
  if (isNaN(parsedNewAmt) || parsedNewAmt <= 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  var lastRow = Math.max(ws.getLastRow(), 13);

  var found = false;
  var oldNorm = normalizeStr(oldCategory);
  var parsedOldAmt = parseFloat(String(oldAmount).replace(',', '.')) || 0;

  // 1. Comprobación directa en la fila especificada
  if (!isNaN(targetRow) && targetRow >= 13 && targetRow <= ws.getMaxRows()) {
    var curCat = String(ws.getRange(targetRow, cols.variable.catCol).getValue() || '').trim();
    var curAmt = parseFloat(String(ws.getRange(targetRow, cols.variable.amtCol).getValue()).replace(',', '.')) || 0;

    // Si coincide con oldCategory o si ya fue actualizada con newCategory/newAmount
    if (normalizeStr(curCat) === oldNorm || Math.abs(curAmt - parsedOldAmt) < 0.02 ||
        (normalizeStr(curCat) === normalizeStr(cleanNewCat) && Math.abs(curAmt - parsedNewAmt) < 0.02)) {
      found = true;
    }
  }

  // 2. Si la fila se movió o no coincidió exactamente, buscar en memoria rápidamente
  if (!found) {
    var numRows = lastRow - 12;
    if (numRows > 0) {
      var catVals = ws.getRange(13, cols.variable.catCol, numRows, 1).getValues();
      var amtVals = ws.getRange(13, cols.variable.amtCol, numRows, 1).getValues();
      var bestDist = Infinity;

      for (var i = 0; i < catVals.length; i++) {
        var r = i + 13;
        var rCat = normalizeStr(catVals[i][0] || '');
        var rAmt = parseFloat(String(amtVals[i][0]).replace(',', '.')) || 0;

        if (rCat === oldNorm && Math.abs(rAmt - parsedOldAmt) < 0.05) {
          var dist = isNaN(targetRow) ? i : Math.abs(r - targetRow);
          if (dist < bestDist) {
            bestDist = dist;
            targetRow = r;
            found = true;
          }
        }
      }

      // Si no encontramos por categoría+importe, intentar por categoría si es única
      if (!found && oldNorm) {
        for (var j = 0; j < catVals.length; j++) {
          var r2 = j + 13;
          var rCat2 = normalizeStr(catVals[j][0] || '');
          if (rCat2 === oldNorm) {
            targetRow = r2;
            found = true;
            break;
          }
        }
      }
    }
  }

  // Salvaguarda: Si aún no se encontró pero el número de fila es válido, usar la fila solicitada
  if (!found && !isNaN(targetRow) && targetRow >= 13 && targetRow <= ws.getMaxRows()) {
    found = true;
  }

  if (!found || isNaN(targetRow) || targetRow < 13) {
    return { error: 'No se encontró el gasto a actualizar' };
  }

  // Escribir directamente los nuevos valores
  var catCell = ws.getRange(targetRow, cols.variable.catCol);
  var amtCell = ws.getRange(targetRow, cols.variable.amtCol);

  try {
    catCell.setValue(cleanNewCat);
  } catch (e) {
    try {
      catCell.clearDataValidations();
      catCell.setValue(cleanNewCat);
    } catch (e2) {}
  }

  amtCell.setValue(parsedNewAmt);
  SpreadsheetApp.flush();

  // Devolver el estado fresco para que la app se actualice sin peticiones adicionales
  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    row: targetRow,
    category: cleanNewCat,
    amount: parsedNewAmt,
    month: ws.getName(),
    summary: updated.summary,
    expenses: updated.expenses,
    lastRow: updated.lastRow
  };
}

/**
 * Elimina un gasto variable limpiando su celda de categoría e importe.
 */
function deleteExpense(ss, month, row, category, amount) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  var lastRow = Math.max(ws.getLastRow(), 13);

  var found = false;
  var catNorm = normalizeStr(category);
  var parsedAmt = parseFloat(String(amount).replace(',', '.')) || 0;

  // 1. Comprobación en la fila solicitada
  if (!isNaN(targetRow) && targetRow >= 13 && targetRow <= ws.getMaxRows()) {
    var curCat = String(ws.getRange(targetRow, cols.variable.catCol).getValue() || '').trim();
    var curAmt = parseFloat(String(ws.getRange(targetRow, cols.variable.amtCol).getValue()).replace(',', '.')) || 0;

    if (normalizeStr(curCat) === catNorm || Math.abs(curAmt - parsedAmt) < 0.02) {
      found = true;
    }
  }

  // 2. Si no coincide exactamente, buscar en el rango
  if (!found) {
    var numRows = lastRow - 12;
    if (numRows > 0) {
      var catVals = ws.getRange(13, cols.variable.catCol, numRows, 1).getValues();
      var amtVals = ws.getRange(13, cols.variable.amtCol, numRows, 1).getValues();
      var bestDist = Infinity;

      for (var i = 0; i < catVals.length; i++) {
        var r = i + 13;
        var rCat = normalizeStr(catVals[i][0] || '');
        var rAmt = parseFloat(String(amtVals[i][0]).replace(',', '.')) || 0;

        if (rCat === catNorm && Math.abs(rAmt - parsedAmt) < 0.05) {
          var dist = isNaN(targetRow) ? i : Math.abs(r - targetRow);
          if (dist < bestDist) {
            bestDist = dist;
            targetRow = r;
            found = true;
          }
        }
      }
    }
  }

  if (!found && !isNaN(targetRow) && targetRow >= 13 && targetRow <= ws.getMaxRows()) {
    found = true;
  }

  if (!found || isNaN(targetRow) || targetRow < 13) {
    return { error: 'No se encontró el gasto a eliminar' };
  }

  // Limpiar contenido de la categoría e importe
  ws.getRange(targetRow, cols.variable.catCol).clearContent();
  ws.getRange(targetRow, cols.variable.amtCol).clearContent();
  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    row: targetRow,
    category: category,
    amount: parsedAmt,
    month: ws.getName(),
    summary: updated.summary,
    expenses: updated.expenses,
    lastRow: updated.lastRow
  };
}

/* ================================================================
 *  GESTIÓN DE GASTOS FIJOS Y CASILLAS (CHECKBOXES)
 * ================================================================ */

/**
 * Modifica el estado de la casilla de un gasto fijo (Marzo a Diciembre: Columna F).
 * Respuesta ultra rápida (< 250ms) y sin bucles lentos de locale.
 */
function setFixedExpenseStatus(ss, month, row, active) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > 25) {
    return { error: 'Fila de gasto fijo inválida: ' + row };
  }

  var isActive = (active === true || active === 'true' || active === 1 || active === '1');

  if (cols.hasCheckbox && cols.fixed.checkCol) {
    // 1. Escribir booleano en Col F (6)
    ws.getRange(targetRow, cols.fixed.checkCol).setValue(isActive);

    // 2. Comprobar que Col G (7) tenga la fórmula =IF(F#, importe, 0)
    var amtCell = ws.getRange(targetRow, cols.fixed.amtCol);
    var curF = String(amtCell.getFormula() || '');
    if (!curF || (curF.indexOf('IF') === -1 && curF.indexOf('SI') === -1)) {
      var defaultAmt = FIXED_DEFAULT_AMOUNTS[targetRow] || 0;
      var curVal = parseFloat(String(amtCell.getValue()).replace(',', '.')) || defaultAmt;
      amtCell.setFormula('=IF(F' + targetRow + ', ' + curVal + ', 0)');
    }
  } else {
    // En meses sin casilla (Enero/Febrero)
    if (!isActive) {
      ws.getRange(targetRow, cols.fixed.amtCol).setValue(0);
    }
  }

  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    month: ws.getName(),
    row: targetRow,
    active: isActive,
    summary: updated.summary,
    fixedExpenses: updated.fixedExpenses,
    totalActive: updated.totalActiveFixed
  };
}

/**
 * Modifica el importe de un gasto fijo en la fórmula de la Columna G (=IF(F#, importe, 0)).
 * Petición directa, rápida y segura.
 */
function setFixedExpenseAmount(ss, month, row, newAmount, newCategory) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > 25) {
    return { error: 'Fila de gasto fijo inválida: ' + row };
  }

  var numAmount = parseFloat(String(newAmount).replace(',', '.'));
  if (isNaN(numAmount) || numAmount < 0) {
    return { error: 'Importe numérico inválido: ' + newAmount };
  }

  // 1. Actualizar nombre en Col E si se especificó
  if (newCategory && String(newCategory).trim()) {
    try {
      ws.getRange(targetRow, cols.fixed.catCol).setValue(String(newCategory).trim());
    } catch (e) {}
  }

  // 2. Actualizar importe en Col G (fórmula condicional) o Col F
  var amtCell = ws.getRange(targetRow, cols.fixed.amtCol);
  if (cols.hasCheckbox && cols.fixed.checkCol) {
    amtCell.setFormula('=IF(F' + targetRow + ', ' + numAmount + ', 0)');
  } else {
    amtCell.setValue(numAmount);
  }

  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    status: 'ok',
    month: ws.getName(),
    row: targetRow,
    newAmount: numAmount,
    summary: updated.summary,
    fixedExpenses: updated.fixedExpenses,
    totalActive: updated.totalActiveFixed
  };
}

/**
 * Actualiza múltiples casillas de gastos fijos en Columna F en una sola llamada en bloque.
 */
function setFixedExpensesBatch(ss, month, updates) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  if (!Array.isArray(updates) || updates.length === 0) {
    return { error: 'Lista de actualizaciones vacía' };
  }

  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var row = parseInt(u.row, 10);
    var active = (u.active === true || u.active === 'true' || u.active === 1 || u.active === '1');
    if (!isNaN(row) && row >= 13 && row <= 25) {
      if (cols.hasCheckbox && cols.fixed.checkCol) {
        ws.getRange(row, cols.fixed.checkCol).setValue(active);
      } else {
        if (!active) ws.getRange(row, cols.fixed.amtCol).setValue(0);
      }
    }
  }

  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    month: ws.getName(),
    summary: updated.summary,
    fixedExpenses: updated.fixedExpenses,
    totalActive: updated.totalActiveFixed
  };
}

/**
 * Restaura todas las fórmulas de Gastos Fijos en Columna G: =IF(F#, importe, 0)
 * y asegura que Columna F contenga casillas de verificación válidas.
 */
function repairFixedExpenseFormulas(ss, month, forceAll) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var restored = 0;

  if (cols.hasCheckbox && cols.fixed.checkCol) {
    for (var row = 13; row <= 21; row++) {
      var amtCell = ws.getRange(row, cols.fixed.amtCol); // Col G
      var curF = String(amtCell.getFormula() || '');
      var defaultAmt = FIXED_DEFAULT_AMOUNTS[row] || 0;

      var needsUpdate = forceAll || !curF || (curF.indexOf('IF') === -1 && curF.indexOf('SI') === -1);
      if (needsUpdate) {
        var curVal = parseFloat(String(amtCell.getValue()).replace(',', '.')) || defaultAmt;
        amtCell.setFormula('=IF(F' + row + ', ' + curVal + ', 0)');
        restored++;
      }
    }
    SpreadsheetApp.flush();
  }

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    month: ws.getName(),
    restored: restored,
    summary: updated.summary,
    fixedExpenses: updated.fixedExpenses,
    totalActive: updated.totalActiveFixed
  };
}

/* ================================================================
 *  GESTIÓN DE INGRESOS Y META DE AHORRO
 * ================================================================ */

/**
 * Añade un ingreso a las columnas correspondientes de Ingresos (Col B y Col C).
 */
function addIncome(ss, month, category, amount) {
  var cleanCat = String(category || '').trim() || 'Euromar';
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));

  if (isNaN(parsedAmt) || parsedAmt <= 0) return { error: 'Importe de ingreso inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = getSheetColumns(ws);
  var maxScan = Math.max(ws.getLastRow(), 25);
  var targetRow = maxScan + 1;

  var bVals = ws.getRange(13, cols.income.catCol, maxScan - 12, 1).getValues();
  for (var i = 0; i < bVals.length; i++) {
    if (String(bVals[i][0] || '').trim() === '') {
      targetRow = i + 13;
      break;
    }
  }

  if (targetRow > ws.getMaxRows()) {
    ws.insertRowsAfter(ws.getMaxRows(), 5);
  }

  var catCell = ws.getRange(targetRow, cols.income.catCol);
  var amtCell = ws.getRange(targetRow, cols.income.amtCol);

  try {
    catCell.setValue(cleanCat);
  } catch (e) {
    try {
      catCell.clearDataValidations();
      catCell.setValue(cleanCat);
    } catch (e2) {}
  }

  amtCell.setValue(parsedAmt);

  // Asegurar fórmula en C10
  try {
    var c10 = ws.getRange(10, cols.income.amtCol);
    var curF = String(c10.getFormula() || '');
    if (!curF || curF.indexOf('SUM') === -1) {
      c10.setFormula('=SUM(C13:C993)');
    }
  } catch (eTot) {}

  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    row: targetRow,
    category: cleanCat,
    amount: parsedAmt,
    month: ws.getName(),
    summary: updated.summary,
    expenses: updated.expenses,
    incomes: updated.incomes,
    lastRow: updated.lastRow
  };
}

/**
 * Establece o actualiza los ingresos totales fijando la fila principal de ingresos (C13).
 */
function setTotalIncome(ss, month, amount, optionalCategory) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) {
    return { error: 'Cantidad de ingresos inválida: ' + amount };
  }

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'No se encontró la hoja para el mes: ' + month };

  var cols = getSheetColumns(ws);

  // 1. Escribir concepto en B13
  var catCell = ws.getRange(13, cols.income.catCol);
  try {
    catCell.setValue(optionalCategory || 'Euromar');
  } catch (e) {
    try {
      catCell.clearDataValidations();
      catCell.setValue(optionalCategory || 'Euromar');
    } catch (e2) {}
  }

  // 2. Escribir importe en C13
  ws.getRange(13, cols.income.amtCol).setValue(parsedAmt);

  // 3. Limpiar ingresos secundarios antiguos en filas 14 a 30
  try {
    var lastRow = Math.min(ws.getLastRow(), 30);
    if (lastRow >= 14) {
      ws.getRange(14, cols.income.catCol, lastRow - 13, 2).clearContent();
    }
  } catch (eClear) {}

  // 4. Asegurar fórmula en C10
  try {
    var c10 = ws.getRange(10, cols.income.amtCol);
    var curF = String(c10.getFormula() || '');
    if (!curF || curF.indexOf('SUM') === -1) {
      c10.setFormula('=SUM(C13:C993)');
    }
  } catch (eF) {}

  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    month: ws.getName(),
    income: parsedAmt,
    summary: updated.summary,
    expenses: updated.expenses,
    incomes: updated.incomes,
    lastRow: updated.lastRow
  };
}

/**
 * Establece o actualiza la meta de ahorro para el mes en la celda I3.
 */
function setSavingsGoal(ss, month, amount) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) {
    return { error: 'Cantidad de meta de ahorro inválida' };
  }

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'No se encontró la hoja para el mes: ' + month };

  // Fila 3, Columna 9 (I3)
  ws.getRange(3, 9).setValue(parsedAmt);
  SpreadsheetApp.flush();

  var updated = getMonthData(ss, ws.getName());

  return {
    success: true,
    month: ws.getName(),
    desiredSavings: parsedAmt,
    summary: updated.summary
  };
}

/* ================================================================
 *  CONSOLIDACIÓN ANUAL (PANEL DE CONTROL)
 * ================================================================ */

function getControlPanelData(ss) {
  var months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  var wsPanel = null;
  var wsDataGraficos = null;
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var nameLower = sheets[s].getName().toLowerCase();
    if (nameLower.indexOf('gráfico') !== -1 || nameLower.indexOf('grafico') !== -1) {
      wsDataGraficos = sheets[s];
    } else if (nameLower.indexOf('panel') !== -1) {
      wsPanel = sheets[s];
    }
  }

  var monthlyData = [];
  var totalIncome = 0;
  var totalExpenses = 0;
  var totalSavings = 0;
  var totalFixed = 0;
  var totalVariable = 0;

  var graficosMatrix = null;
  if (wsDataGraficos) {
    try {
      graficosMatrix = wsDataGraficos.getRange(4, 2, 12, 5).getValues();
    } catch (e) {}
  }

  for (var m = 0; m < 12; m++) {
    var mName = months[m];
    var mShort = shortMonths[m];

    var income = 0;
    var expenses = 0;
    var fixed = 0;
    var variable = 0;
    var savings = 0;

    if (graficosMatrix && graficosMatrix[m]) {
      var rowG = graficosMatrix[m];
      var gInc = parseFloat(String(rowG[1]).replace(',', '.')) || 0;
      var gFix = parseFloat(String(rowG[2]).replace(',', '.')) || 0;
      var gVar = parseFloat(String(rowG[3]).replace(',', '.')) || 0;
      var gExp = parseFloat(String(rowG[4]).replace(',', '.')) || (gFix + gVar);

      if (gInc > 0 || gExp > 0 || gFix > 0 || gVar > 0) {
        income = gInc;
        fixed = gFix;
        variable = gVar;
        expenses = gExp;
      }
    }

    if (income === 0 && expenses === 0 && fixed === 0 && variable === 0) {
      try {
        var mSum = getSummary(ss, mName);
        if (mSum && !mSum.error) {
          income = mSum.income || 0;
          fixed = mSum.fixedExpenses || 0;
          variable = mSum.variableExpenses || 0;
          expenses = mSum.totalExpenses || (fixed + variable);
          savings = mSum.savings || (income - expenses);
        }
      } catch (e) {}
    }

    if (savings === 0 && income > 0) {
      savings = income > expenses ? income - expenses : 0;
    }

    var hasData = income > 0 || expenses > 0 || savings > 0 || fixed > 0 || variable > 0;

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
 *  SINCRONIZACIÓN EN LOTE (PUSH BATCH CHANGES)
 * ================================================================ */

/**
 * Procesa un paquete completo de tareas pendientes en 1 sola llamada rápida.
 * Ejecuta cada mutación, hace un único flush y devuelve los datos frescos de los meses afectados.
 */
function pushBatchChanges(ss, tasks) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { success: true, processed: 0, message: 'No hay cambios para subir' };
  }

  var monthsAffected = {};
  var errors = [];
  var processed = 0;

  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i] || {};
    var action = t.action;
    var month = t.month;
    var payload = t.payload || t;
    if (month) monthsAffected[month] = true;

    try {
      if (action === 'addExpense') {
        addExpense(
          ss,
          month,
          payload.category,
          parseFloat(String(payload.amount).replace(',', '.'))
        );
        processed++;
      } else if (action === 'updateExpense') {
        updateExpense(
          ss,
          month,
          parseInt(payload.row, 10),
          payload.oldCategory,
          parseFloat(String(payload.oldAmount).replace(',', '.')),
          payload.newCategory,
          parseFloat(String(payload.newAmount).replace(',', '.'))
        );
        processed++;
      } else if (action === 'deleteExpense') {
        deleteExpense(
          ss,
          month,
          parseInt(payload.row, 10),
          payload.category,
          parseFloat(String(payload.amount).replace(',', '.'))
        );
        processed++;
      } else if (action === 'setFixedExpenseStatus' || action === 'toggleFixedExpense') {
        setFixedExpenseStatus(
          ss,
          month,
          parseInt(payload.row, 10),
          payload.active === true || payload.active === 'true' || payload.active === 1 || payload.active === '1'
        );
        processed++;
      } else if (action === 'setFixedExpenseAmount' || action === 'updateFixedExpenseAmount') {
        setFixedExpenseAmount(
          ss,
          month,
          parseInt(payload.row, 10),
          parseFloat(String(payload.amount || payload.newAmount).replace(',', '.')),
          payload.category || payload.newCategory
        );
        processed++;
      } else if (action === 'setFixedExpensesBatch') {
        setFixedExpensesBatch(ss, month, payload.updates || []);
        processed++;
      } else if (action === 'setTotalIncome') {
        setTotalIncome(
          ss,
          month,
          parseFloat(String(payload.amount).replace(',', '.')),
          payload.category
        );
        processed++;
      } else if (action === 'setSavingsGoal') {
        setSavingsGoal(
          ss,
          month,
          parseFloat(String(payload.amount).replace(',', '.'))
        );
        processed++;
      } else if (action === 'addIncome') {
        addIncome(
          ss,
          month,
          payload.category,
          parseFloat(String(payload.amount).replace(',', '.'))
        );
        processed++;
      }
    } catch (err) {
      errors.push({ taskIndex: i, action: action, error: err.toString() });
    }
  }

  SpreadsheetApp.flush();

  // Devolver el estado fresco de todos los meses involucrados en el Push
  var monthsData = {};
  for (var m in monthsAffected) {
    if (monthsAffected.hasOwnProperty(m)) {
      try {
        monthsData[m] = getMonthData(ss, m);
      } catch (eM) {}
    }
  }

  return {
    success: errors.length === 0,
    processed: processed,
    total: tasks.length,
    errors: errors,
    monthsData: monthsData
  };
}
