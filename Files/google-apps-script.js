/**
 * ============================================================
 *  Google Apps Script — Backend para Control Gastos App
 * ============================================================
 *
 *  INSTRUCCIONES DE DESPLIEGUE:
 *
 *  1. Abre tu spreadsheet en Google Sheets:
 *     https://docs.google.com/spreadsheets/d/1KLn5Ow_eoclIyx2LB0P89JC7vwmNSRV60iBjNepoJjA/edit
 *
 *  2. Ve a  Extensiones → Apps Script
 *
 *  3. Borra todo el contenido del editor y pega ESTE archivo completo.
 *
 *  4. Guarda el proyecto (Ctrl+S).
 *
 *  5. Haz clic en  Implementar → Nueva implementación
 *       • Tipo:        Aplicación web
 *       • Ejecutar como: Tu cuenta (yo@gmail.com)
 *       • Acceso:      Cualquier persona
 *
 *  6. Haz clic en "Implementar" y copia la URL generada.
 *
 *  7. Pega esa URL en la pantalla de configuración de la app.
 *
 *  IMPORTANTE: Cada vez que modifiques este script debes crear
 *  una NUEVA implementación para que los cambios surtan efecto.
 * ============================================================
 */

/* ---- Punto de entrada GET (lectura + escritura) ---- */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action;
  var result;

  try {
    if (action === 'ping') {
      result = { status: 'ok', version: '2.2.0', timestamp: new Date().toISOString() };
    } else if (action === 'getCategories') {
      result = getCategories(ss);
    } else if (action === 'getExpenses') {
      result = getExpenses(ss, params.month);
    } else if (action === 'getSummary') {
      result = getSummary(ss, params.month);
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
        parseFloat(String(params.amount).replace(',', '.'))
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
    } else {
      result = { error: 'Acción desconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---- Punto de entrada POST (solo escritura) ---- */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {};
  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = {};
    }
  }
  var result;

  try {
    if (data.action === 'ping') {
      result = { status: 'ok', version: '2.1.0' };
    } else if (data.action === 'getCategories') {
      result = getCategories(ss);
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
        parseFloat(String(data.amount).replace(',', '.'))
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
    } else {
      result = { error: 'Acción desconocida' };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
 *  UTILIDADES Y BÚSQUEDA GENÉRICA
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
 * Encuentra dinámicamente la columna de Gastos Variables en la hoja de Categorías.
 * Si no encuentra encabezado explícito, usa por defecto la columna 6 (F).
 */
function findCategorySheetCol(catSheet) {
  if (!catSheet) return { col: 6, startRow: 3 };

  var maxRows = Math.min(catSheet.getLastRow(), 5);
  var maxCols = Math.min(catSheet.getLastColumn(), 15);

  if (maxRows >= 1 && maxCols >= 1) {
    var matrix = catSheet.getRange(1, 1, maxRows, maxCols).getValues();
    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        var cellNorm = normalizeStr(matrix[r][c]);
        if (cellNorm.indexOf('variable') >= 0 || cellNorm === 'gastos variables') {
          return { col: c + 1, startRow: r + 2 };
        }
      }
    }
  }

  return { col: 6, startRow: 3 };
}

/**
 * Asegura que una categoría exista en la pestaña de Categorías de forma genérica.
 * Si existe con espacios residuales (ej. "Transporte "), la limpia en la hoja.
 * Si no existe, la añade automáticamente a la lista para que la validación de Google Sheets la acepte.
 * Devuelve el nombre canónico de la categoría.
 */
function ensureCategoryInCategoriesSheet(ss, category) {
  var cleanCat = String(category || '').trim();
  if (!cleanCat) return '';

  var catSheet = findCategoriesSheet(ss);
  if (!catSheet) return cleanCat;

  var colInfo = findCategorySheetCol(catSheet);
  var lastRow = catSheet.getLastRow();
  var normTarget = normalizeStr(cleanCat);

  // Buscar si ya existe en la columna
  if (lastRow >= colInfo.startRow) {
    var numRows = lastRow - colInfo.startRow + 1;
    var values = catSheet.getRange(colInfo.startRow, colInfo.col, numRows, 1).getValues();

    for (var i = 0; i < values.length; i++) {
      var rawVal = String(values[i][0]);
      var trimmed = rawVal.trim();
      if (trimmed !== '' && normalizeStr(trimmed) === normTarget) {
        // Si tenía espacios al final o al inicio en la hoja (ej. "Transporte "), corregirlo permanentemente
        if (rawVal !== trimmed) {
          try {
            catSheet.getRange(colInfo.startRow + i, colInfo.col).setValue(trimmed);
          } catch (e) {}
        }
        return trimmed;
      }
    }
  }

  // Si no existe, añadirla dinámicamente como nueva categoría
  var nextRow = colInfo.startRow;
  if (lastRow >= colInfo.startRow) {
    var scanRows = lastRow - colInfo.startRow + 1;
    var currentVals = catSheet.getRange(colInfo.startRow, colInfo.col, scanRows, 1).getValues();
    nextRow = lastRow + 1;
    for (var j = 0; j < currentVals.length; j++) {
      if (String(currentVals[j][0]).trim() === '') {
        nextRow = colInfo.startRow + j;
        break;
      }
    }
  }

  if (nextRow > catSheet.getMaxRows()) {
    catSheet.insertRowsAfter(catSheet.getMaxRows(), 10);
  }

  try {
    catSheet.getRange(nextRow, colInfo.col).setValue(cleanCat);
  } catch (err) {
    // Si la celda tuviese alguna restricción, continuar sin bloquear
  }

  return cleanCat;
}

/**
 * Devuelve la lista completa y GENÉRICA de categorías de gastos variables.
 * Las lee dinámicamente desde la hoja de categorías Y de los meses existentes.
 */
function getCategories(ss) {
  var categoriesSet = {};
  var categories = [];

  function addCategory(cat) {
    var trimmed = String(cat || '').trim();
    if (!trimmed) return;
    var norm = normalizeStr(trimmed);
    // Ignorar encabezados comunes
    if (norm === 'gastos variables' || norm === 'categoria' || norm === 'categorias' || norm === 'concepto') {
      return;
    }
    if (!categoriesSet[norm]) {
      categoriesSet[norm] = true;
      categories.push(trimmed);
    }
  }

  // 1. Leer desde la hoja de Categorías
  var catSheet = findCategoriesSheet(ss);
  if (catSheet) {
    var colInfo = findCategorySheetCol(catSheet);
    var lastRow = catSheet.getLastRow();

    if (lastRow >= colInfo.startRow) {
      var numRows = lastRow - colInfo.startRow + 1;
      var data = catSheet.getRange(colInfo.startRow, colInfo.col, numRows, 1).getValues();

      for (var i = 0; i < data.length; i++) {
        var rawVal = String(data[i][0]);
        var cleanVal = rawVal.trim();
        if (cleanVal !== '') {
          // Limpiar celdas con espacios residuales en la hoja
          if (rawVal !== cleanVal) {
            try {
              catSheet.getRange(colInfo.startRow + i, colInfo.col).setValue(cleanVal);
            } catch (e) {}
          }
          addCategory(cleanVal);
        }
      }
    }
  }

  // 2. Escanear meses para incluir cualquier categoría ya utilizada en el pasado
  var months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  for (var m = 0; m < months.length; m++) {
    var ws = findSheet(ss, months[m]);
    if (ws) {
      try {
        var cols = findVariableExpenseCols(ws);
        var mLastRow = ws.getLastRow();
        if (mLastRow >= 13) {
          var mRows = mLastRow - 12;
          var mCatData = ws.getRange(13, cols.catCol, mRows, 1).getValues();
          for (var k = 0; k < mCatData.length; k++) {
            addCategory(mCatData[k][0]);
          }
        }
      } catch (e) {
        // Ignorar hojas que no sigan el formato
      }
    }
  }

  // 3. Fallback en caso de que la hoja esté totalmente vacía
  if (categories.length === 0) {
    var defaults = [
      'Fiesta bebida', 'Fiesta entradas', 'Restaurante', 'Bebidas',
      'Bizzum', 'Viajes tickets', 'Peluquerias', 'Cosmetico',
      'Chino Bazar', 'Cafetería', 'Restaurante (Tarjeta Rest)', 'Ocio',
      'Supermecado', 'Museo', 'Regalos', 'Transporte',
      'Musica Tickets', 'Tramites'
    ];
    for (var d = 0; d < defaults.length; d++) {
      addCategory(defaults[d]);
    }
  }

  return { categories: categories };
}

/**
 * Encuentra dinámicamente las columnas de categoría y cantidad
 * de gastos variables en una hoja de mes.
 *
 * Tolera variaciones de encabezado, diferencias de tilde o mayúsculas.
 * Por defecto en la plantilla: Categoría en col H (8), Cantidad en col J (10).
 */
function findVariableExpenseCols(ws) {
  var catCol = -1;
  var amtCol = -1;

  // Escanear filas 10 a 14 en busca de "Gastos Variables"
  var scanRows = Math.min(ws.getLastRow(), 14);
  if (scanRows >= 10) {
    var headerMatrix = ws.getRange(10, 1, scanRows - 9, 25).getValues();

    // 1. Buscar primero la sección "Gastos Variables"
    var varSectionCol = -1;
    for (var r = 0; r < headerMatrix.length; r++) {
      for (var c = 0; c < headerMatrix[r].length; c++) {
        var norm = normalizeStr(headerMatrix[r][c]);
        if (norm === 'gastos variables' || norm === 'gastos variables totales') {
          varSectionCol = c + 1;
          break;
        }
      }
      if (varSectionCol !== -1) break;
    }

    // 2. Buscar fila de columnas ("Categoría", "Cantidad")
    for (var r2 = 0; r2 < headerMatrix.length; r2++) {
      var rowVals = headerMatrix[r2];
      var catMatches = [];

      for (var c2 = 0; c2 < rowVals.length; c2++) {
        var valNorm = normalizeStr(rowVals[c2]);
        if (valNorm === 'categoria' || valNorm === 'concepto' || valNorm === 'descripcion') {
          catMatches.push(c2 + 1);
        }
      }

      // Si hay 3 ocurrencias (Ingresos, Gastos Fijos, Gastos Variables), tomar la 3.ª
      if (catMatches.length >= 3) {
        catCol = catMatches[2];
      } else if (catMatches.length > 0 && varSectionCol !== -1) {
        // Tomar la que esté más cerca o alineada con la sección de Gastos Variables
        for (var m = 0; m < catMatches.length; m++) {
          if (Math.abs(catMatches[m] - varSectionCol) <= 2) {
            catCol = catMatches[m];
            break;
          }
        }
      }

      if (catCol !== -1) {
        // Buscar la columna de cantidad a la derecha de catCol
        for (var c3 = catCol; c3 < Math.min(catCol + 4, rowVals.length); c3++) {
          var amtNorm = normalizeStr(rowVals[c3]);
          if (amtNorm === 'cantidad' || amtNorm === 'importe' || amtNorm === 'precio' || amtNorm === 'total') {
            amtCol = c3 + 1;
            break;
          }
        }
        break;
      }
    }
  }

  // Fallback seguro a la estructura nativa de la plantilla (Col H = 8, Col J = 10)
  if (catCol === -1) catCol = 8;
  if (amtCol === -1) amtCol = catCol + 2;

  return { catCol: catCol, amtCol: amtCol };
}

/**
 * Devuelve la lista de gastos variables de un mes.
 */
function getExpenses(ss, month) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findVariableExpenseCols(ws);
  var lastRow = ws.getLastRow();
  var expenses = [];

  if (lastRow >= 13) {
    var numRows = lastRow - 12;
    var catData = ws.getRange(13, cols.catCol, numRows, 1).getValues();
    var amtData = ws.getRange(13, cols.amtCol, numRows, 1).getValues();

    for (var i = 0; i < catData.length; i++) {
      var cat = String(catData[i][0]).trim();
      var rawAmt = amtData[i][0];
      var amt = parseFloat(String(rawAmt).replace(',', '.')) || 0;

      if (cat !== '' || amt > 0) {
        expenses.push({
          row: i + 13,
          category: cat || 'General',
          amount: amt
        });
      }
    }
  }

  return { expenses: expenses, month: ws.getName() };
}

/**
 * Devuelve el resumen económico de un mes.
 */
function getSummary(ss, month) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var income = 0, fixed = 0, variable = 0;

  // Escanear filas 9 a 12 de forma tolerante
  var scanMax = Math.min(ws.getLastRow(), 14);
  var matrix = ws.getRange(9, 1, Math.max(scanMax - 8, 4), 25).getValues();

  for (var r = 0; r < matrix.length; r++) {
    var row = matrix[r];
    for (var i = 0; i < row.length; i++) {
      var valNorm = normalizeStr(row[i]);

      if (valNorm === 'ingresos totales' || (valNorm === 'ingresos' && income === 0)) {
        for (var j1 = i + 1; j1 <= i + 3 && j1 < row.length; j1++) {
          var n1 = parseFloat(String(row[j1]).replace(',', '.'));
          if (!isNaN(n1) && n1 > 0) {
            income = n1;
            break;
          }
        }
      }

      if (valNorm === 'gastos fijos totales' || (valNorm === 'gastos fijos' && fixed === 0)) {
        for (var j2 = i + 1; j2 <= i + 3 && j2 < row.length; j2++) {
          var n2 = parseFloat(String(row[j2]).replace(',', '.'));
          if (!isNaN(n2) && n2 > 0) {
            fixed = n2;
            break;
          }
        }
      }

      if (valNorm.indexOf('gastos variables') >= 0 && valNorm.indexOf('total') >= 0) {
        for (var j3 = i + 1; j3 <= i + 3 && j3 < row.length; j3++) {
          var n3 = parseFloat(String(row[j3]).replace(',', '.'));
          if (!isNaN(n3) && n3 > 0) {
            variable = n3;
            break;
          }
        }
      }
    }
  }

  // Meta ahorro fijada en la plantilla: columna I (9), fila 3
  var desiredSavings = 0;
  try {
    desiredSavings = parseFloat(String(ws.getRange(3, 9).getValue()).replace(',', '.')) || 0;
  } catch (e) {}

  var remainingMonth = income - fixed - variable - desiredSavings;
  var legacyRemaining = income - fixed - variable;

  return {
    month: ws.getName(),
    income: income,
    fixedExpenses: fixed,
    variableExpenses: variable,
    totalExpenses: fixed + variable,
    desiredSavings: desiredSavings,
    remainingMonth: remainingMonth,
    remainingForExpenses: legacyRemaining,
    savings: remainingMonth
  };
}

/**
 * Añade un gasto variable al mes indicado con protección total contra fallos de validación.
 */
function addExpense(ss, month, category, amount) {
  var cleanCat = String(category || '').trim();
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));

  if (!cleanCat) return { error: 'La categoría no puede estar vacía' };
  if (isNaN(parsedAmt) || parsedAmt <= 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  // Garantizar que la categoría exista en la lista y no tenga espacios conflictivos
  var canonicalCat = ensureCategoryInCategoriesSheet(ss, cleanCat);

  var cols = findVariableExpenseCols(ws);
  var lastRow = Math.max(ws.getLastRow(), 12);
  var nextRow = 13;

  if (lastRow >= 13) {
    var numRows = lastRow - 12;
    var catData = ws.getRange(13, cols.catCol, numRows, 1).getValues();

    nextRow = lastRow + 1; // Por defecto al final
    for (var i = 0; i < catData.length; i++) {
      var existingCat = String(catData[i][0]).trim();
      if (existingCat === '') {
        nextRow = i + 13; // Primera fila disponible
        break;
      }
    }
  }

  // Asegurar que la hoja tenga suficientes filas
  if (nextRow > ws.getMaxRows()) {
    ws.insertRowsAfter(ws.getMaxRows(), 10);
  }

  var catCell = ws.getRange(nextRow, cols.catCol);
  var amtCell = ws.getRange(nextRow, cols.amtCol);

  // Escribir categoría con salvaguarda contra errores de validación de Google Sheets
  try {
    catCell.setValue(canonicalCat);
  } catch (valErr) {
    // Si la validación de Google Sheets rechaza el valor por conflicto estricto,
    // limpiamos la validación de esa celda concreta para permitir el registro sin bloquear la sincronización
    try {
      catCell.clearDataValidations();
      catCell.setValue(canonicalCat);
    } catch (retryErr) {
      catCell.setValue(cleanCat);
    }
  }

  amtCell.setValue(parsedAmt);

  return {
    success: true,
    row: nextRow,
    category: canonicalCat,
    amount: parsedAmt,
    month: ws.getName()
  };
}

/**
 * Actualiza la categoría y/o importe de un gasto variable existente.
 */
function updateExpense(ss, month, row, oldCategory, oldAmount, newCategory, newAmount) {
  var cleanNewCat = String(newCategory || '').trim();
  var parsedNewAmt = parseFloat(String(newAmount).replace(',', '.'));

  if (!cleanNewCat) return { error: 'La categoría no puede estar vacía' };
  if (isNaN(parsedNewAmt) || parsedNewAmt <= 0) return { error: 'Importe inválido' };

  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var canonicalCat = ensureCategoryInCategoriesSheet(ss, cleanNewCat);
  var cols = findVariableExpenseCols(ws);

  var targetRow = row;
  var currentCat = '';
  var currentAmt = 0;

  if (row >= 13 && row <= ws.getMaxRows()) {
    currentCat = String(ws.getRange(row, cols.catCol).getValue()).trim();
    currentAmt = parseFloat(String(ws.getRange(row, cols.amtCol).getValue()).replace(',', '.')) || 0;
  }

  var oldNorm = normalizeStr(oldCategory);
  var parsedOldAmt = parseFloat(String(oldAmount).replace(',', '.')) || 0;

  if (normalizeStr(currentCat) !== oldNorm || Math.abs(currentAmt - parsedOldAmt) > 0.01) {
    var lastRow = ws.getLastRow();
    targetRow = -1;

    if (lastRow >= 13) {
      var numRows = lastRow - 12;
      var catData = ws.getRange(13, cols.catCol, numRows, 1).getValues();
      var amtData = ws.getRange(13, cols.amtCol, numRows, 1).getValues();
      var bestDist = Infinity;

      for (var i = 0; i < catData.length; i++) {
        var r = i + 13;
        var rCat = String(catData[i][0]).trim();
        var rAmt = parseFloat(String(amtData[i][0]).replace(',', '.')) || 0;

        if (normalizeStr(rCat) === oldNorm && Math.abs(rAmt - parsedOldAmt) < 0.01) {
          var dist = Math.abs(r - row);
          if (dist < bestDist) {
            bestDist = dist;
            targetRow = r;
          }
        }
      }
    }

    if (targetRow === -1) {
      return { error: 'No se encontró el gasto a actualizar' };
    }
  }

  var catCell = ws.getRange(targetRow, cols.catCol);
  var amtCell = ws.getRange(targetRow, cols.amtCol);

  try {
    catCell.setValue(canonicalCat);
  } catch (e) {
    try {
      catCell.clearDataValidations();
      catCell.setValue(canonicalCat);
    } catch (e2) {
      catCell.setValue(cleanNewCat);
    }
  }

  amtCell.setValue(parsedNewAmt);

  return {
    success: true,
    row: targetRow,
    category: canonicalCat,
    amount: parsedNewAmt,
    month: ws.getName()
  };
}

/**
 * Elimina un gasto variable del mes indicado.
 */
function deleteExpense(ss, month, row, category, amount) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findVariableExpenseCols(ws);
  var targetRow = row;
  var currentCat = '';
  var currentAmt = 0;

  if (row >= 13 && row <= ws.getMaxRows()) {
    currentCat = String(ws.getRange(row, cols.catCol).getValue()).trim();
    currentAmt = parseFloat(String(ws.getRange(row, cols.amtCol).getValue()).replace(',', '.')) || 0;
  }

  var catNorm = normalizeStr(category);
  var parsedAmt = parseFloat(String(amount).replace(',', '.')) || 0;

  if (normalizeStr(currentCat) !== catNorm || Math.abs(currentAmt - parsedAmt) > 0.01) {
    var lastRow = ws.getLastRow();
    targetRow = -1;

    if (lastRow >= 13) {
      var numRows = lastRow - 12;
      var catData = ws.getRange(13, cols.catCol, numRows, 1).getValues();
      var amtData = ws.getRange(13, cols.amtCol, numRows, 1).getValues();
      var bestDist = Infinity;

      for (var i = 0; i < catData.length; i++) {
        var r = i + 13;
        var rCat = String(catData[i][0]).trim();
        var rAmt = parseFloat(String(amtData[i][0]).replace(',', '.')) || 0;

        if (normalizeStr(rCat) === catNorm && Math.abs(rAmt - parsedAmt) < 0.01) {
          var dist = Math.abs(r - row);
          if (dist < bestDist) {
            bestDist = dist;
            targetRow = r;
          }
        }
      }
    }

    if (targetRow === -1) {
      return { error: 'No se encontró el gasto a eliminar' };
    }
  }

  ws.getRange(targetRow, cols.catCol).clearContent();
  ws.getRange(targetRow, cols.amtCol).clearContent();

  return {
    success: true,
    row: targetRow,
    category: category,
    amount: parsedAmt,
    month: ws.getName()
  };
}

/**
 * Establece o actualiza la meta de ahorro para el mes indicado.
 */
function setSavingsGoal(ss, month, amount) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) {
    return { error: 'Cantidad de meta de ahorro inválida' };
  }

  var ws = findSheet(ss, month);
  if (!ws) {
    return { error: 'No se encontró la hoja para el mes: ' + month };
  }

  // Buscar la celda de la meta de ahorro en las filas 1 a 6
  var targetRow = 3;
  var targetCol = 9; // Columna I por defecto
  var found = false;

  var topData = ws.getRange(1, 1, 6, Math.min(15, ws.getLastColumn())).getValues();
  for (var r = 0; r < topData.length; r++) {
    for (var c = 0; c < topData[r].length; c++) {
      var cellVal = normalizeStr(topData[r][c]);
      if (cellVal.indexOf('ahorrar') !== -1 && cellVal.indexOf('cantidad') !== -1) {
        targetRow = r + 1;
        targetCol = 9;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  // Establecer el valor
  ws.getRange(targetRow, targetCol).setValue(parsedAmt);
  try {
    var valH = ws.getRange(targetRow, 8).getValue();
    if (valH !== '' && !isNaN(parseFloat(String(valH).replace(',', '.')))) {
      ws.getRange(targetRow, 8).setValue(parsedAmt);
    }
  } catch (e) {}

  SpreadsheetApp.flush();

  return {
    success: true,
    month: ws.getName(),
    desiredSavings: parsedAmt,
    summary: getSummary(ss, ws.getName())
  };
}

/**
 * Establece o actualiza los ingresos totales para el mes indicado.
 * Mantiene la integridad de las fórmulas del spreadsheet actualizando la
 * fila principal de ingresos (fila 13) y limpiando filas adicionales si fuera necesario.
 */
function setTotalIncome(ss, month, amount) {
  var parsedAmt = parseFloat(String(amount).replace(',', '.'));
  if (isNaN(parsedAmt) || parsedAmt < 0) {
    return { error: 'Cantidad de ingresos inválida' };
  }

  var ws = findSheet(ss, month);
  if (!ws) {
    return { error: 'No se encontró la hoja para el mes: ' + month };
  }

  // 1. Conservar categoría existente en B13 o asignar "Nómina"
  var currentCat = String(ws.getRange(13, 2).getValue()).trim();
  if (!currentCat) {
    ws.getRange(13, 2).setValue('Nómina');
  }

  // 2. Asignar el importe en C13
  ws.getRange(13, 3).setValue(parsedAmt);

  // 3. Limpiar ingresos secundarios antiguos en filas 14-30 para que el total coincida exactamente
  var lastRow = Math.min(ws.getLastRow(), 35);
  if (lastRow >= 14) {
    for (var r = 14; r <= lastRow; r++) {
      var valC = ws.getRange(r, 3).getValue();
      if (valC !== '' && !isNaN(parseFloat(String(valC).replace(',', '.')))) {
        ws.getRange(r, 2).clearContent();
        ws.getRange(r, 3).clearContent();
      }
    }
  }

  // 4. Asegurar fórmula =SUM(C13:C993) en C10 si fue sobreescrita
  var cellC10 = ws.getRange(10, 3);
  var formulaC10 = cellC10.getFormula();
  if (!formulaC10 || formulaC10.indexOf('SUM') === -1) {
    cellC10.setFormula('=SUM(C13:C993)');
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    month: ws.getName(),
    income: parsedAmt,
    summary: getSummary(ss, ws.getName())
  };
}

/* ================================================================
 *  GESTIÓN DE GASTOS FIJOS Y CASILLAS (CHECKBOXES)
 * ================================================================ */

/**
 * Convierte letra de columna (ej. 'A', 'F', 'G') a índice base 1.
 */
function colLetterToIndex(letter) {
  if (!letter) return 0;
  var col = 0;
  var upper = String(letter).toUpperCase();
  for (var i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col;
}

/**
 * Localiza dinámicamente las columnas de Gastos Fijos en una hoja de mes.
 * Estructura estándar:
 *   - Col E (5): Categoría
 *   - Col F (6): Casilla de verificación (checkbox)
 *   - Col G (7): Importe con fórmula =IF(F13, importe, 0)
 *
 * Estructura legacy sin casilla (ej. Enero/Febrero):
 *   - Col E (5): Categoría
 *   - Col F (6): Importe directo
 */
function findFixedExpenseCols(ws) {
  var catCol = 5;       // Por defecto Col E (Categoría de gastos fijos)
  var checkCol = 6;     // Por defecto Col F (Casilla de gastos fijos)
  var amtCol = 7;       // Por defecto Col G (Importe de gastos fijos)
  var hasCheckbox = true;

  // 1. Encontrar con certeza la columna de Categoría de Gastos Fijos (catCol)
  // En todas las hojas de mes:
  // - Filas 10 u 11 tienen la cabecera 'GASTOS FIJOS TOTALES' o 'Gastos Fijos' en la columna de categoría (Col E)
  // - Fila 12 tiene 'Categoría' (la 2ª aparición de Categoría en la fila, tras la de Ingresos)
  var foundCat = false;
  var scanMaxCol = Math.min(ws.getLastColumn(), 15);

  try {
    var headerMatrix = ws.getRange(10, 1, 3, scanMaxCol).getValues();
    // headerMatrix[0] = Fila 10, [1] = Fila 11, [2] = Fila 12

    // Buscar 'gastos fijos' en filas 10 y 11
    for (var r = 0; r <= 1; r++) {
      for (var c = 0; c < headerMatrix[r].length; c++) {
        var valNorm = normalizeStr(headerMatrix[r][c]);
        if (valNorm === 'gastos fijos' || valNorm === 'gastos fijos totales') {
          catCol = c + 1;
          foundCat = true;
          break;
        }
      }
      if (foundCat) break;
    }

    // Si no se encontró por etiqueta de sección, buscar la segunda "categoría" en fila 12
    if (!foundCat && headerMatrix.length >= 3) {
      var catMatches = [];
      for (var c2 = 0; c2 < headerMatrix[2].length; c2++) {
        var hNorm = normalizeStr(headerMatrix[2][c2]);
        if (hNorm === 'categoria' || hNorm === 'concepto') {
          catMatches.push(c2 + 1);
        }
      }
      if (catMatches.length >= 2) {
        catCol = catMatches[1];
        foundCat = true;
      } else if (catMatches.length === 1 && catMatches[0] > 3) {
        catCol = catMatches[0];
        foundCat = true;
      }
    }
  } catch (e) {
    catCol = 5;
  }

  // 2. Determinar amtCol y checkCol inspeccionando las columnas contiguas a catCol:
  // En la estructura:
  // - Legacy (Enero/Febrero): catCol (E), amtCol (F, col 6) [sin casilla]
  // - Estándar con casilla (Marzo-Diciembre): catCol (E, col 5), checkCol (F, col 6), amtCol (G, col 7)
  try {
    var nextCol1 = catCol + 1; // ej. Col 6 (F)
    var nextCol2 = catCol + 2; // ej. Col 7 (G)

    var f10_col1 = String(ws.getRange(10, nextCol1).getFormula() || '').toUpperCase();
    var f10_col2 = (nextCol2 <= ws.getLastColumn()) ? String(ws.getRange(10, nextCol2).getFormula() || '').toUpperCase() : '';

    var h12_col1 = normalizeStr(ws.getRange(12, nextCol1).getValue() || '');
    var h12_col2 = (nextCol2 <= ws.getLastColumn()) ? normalizeStr(ws.getRange(12, nextCol2).getValue() || '') : '';

    var formulaCol1 = '';
    var formulaCol2 = '';
    var lastR = Math.min(ws.getLastRow(), 16);
    if (lastR >= 13) {
      for (var rf = 13; rf <= lastR; rf++) {
        var f1 = String(ws.getRange(rf, nextCol1).getFormula() || '');
        var f2 = (nextCol2 <= ws.getLastColumn()) ? String(ws.getRange(rf, nextCol2).getFormula() || '') : '';
        if (f1 && !formulaCol1) formulaCol1 = f1;
        if (f2 && !formulaCol2) formulaCol2 = f2;
      }
    }

    // Caso A: Si nextCol1 tiene SUM en fila 10 o encabezado 'cantidad'/'importe', y NO tiene fórmula IF,
    // y nextCol2 no es 'cantidad' ni tiene SUM -> Legacy sin casilla (Enero/Febrero)
    if ((f10_col1.indexOf('SUM') !== -1 || h12_col1 === 'cantidad' || h12_col1 === 'importe') &&
        formulaCol1.indexOf('IF') === -1 && formulaCol1.indexOf('SI') === -1 &&
        h12_col2 !== 'cantidad' && f10_col2.indexOf('SUM') === -1) {
      hasCheckbox = false;
      checkCol = null;
      amtCol = nextCol1;
    } else {
      // Caso B: Con casilla
      hasCheckbox = true;
      var col2IsAmt = (h12_col2 === 'cantidad' || h12_col2 === 'importe' || f10_col2.indexOf('SUM') !== -1 ||
                       formulaCol2.indexOf('IF') !== -1 || formulaCol2.indexOf('SI') !== -1);
      var col1IsAmt = (h12_col1 === 'cantidad' || h12_col1 === 'importe' || f10_col1.indexOf('SUM') !== -1 ||
                       formulaCol1.indexOf('IF') !== -1 || formulaCol1.indexOf('SI') !== -1);

      if (col2IsAmt && !col1IsAmt) {
        amtCol = nextCol2; // Col G
        checkCol = nextCol1; // Col F
      } else if (col1IsAmt && !col2IsAmt) {
        amtCol = nextCol1; // Col F
        checkCol = nextCol2; // Col G
      } else {
        amtCol = 7;
        checkCol = 6;
      }

      // Si la fórmula en amtCol referencia explícitamente una celda (=IF(F13, 470, 0)):
      var targetFormula = (amtCol === nextCol1) ? formulaCol1 : formulaCol2;
      var matchCheck = targetFormula.match(/(?:IF|SI)\s*\(\s*([A-Za-z]+)\d+/i);
      if (matchCheck && matchCheck[1]) {
        checkCol = colLetterToIndex(matchCheck[1]);
      }
    }
  } catch (err) {
    catCol = 5;
    checkCol = 6;
    amtCol = 7;
    hasCheckbox = true;
  }

  return {
    catCol: catCol,
    checkCol: checkCol,
    amtCol: amtCol,
    hasCheckbox: hasCheckbox
  };
}

/**
 * Comprueba de forma infalible si una casilla está marcada.
 * Acepta booleanos, números, texto en español/inglés y el valor calculado de la fórmula.
 */
function isCheckboxChecked(rawVal, displayVal, cellVal, hasIfFormula) {
  // 1. Si la fórmula es =IF(F13, importe, 0) y el importe evaluado es > 0,
  // Google Sheets garantiza que la casilla está activa/marcada
  if (hasIfFormula && typeof cellVal === 'number' && cellVal > 0) {
    return true;
  }

  // 2. Comprobación booleana o numérica directa
  if (rawVal === true || rawVal === 1 || rawVal === '1') {
    return true;
  }
  if (rawVal === false || rawVal === 0 || rawVal === '0') {
    // Si la celda de importe tiene valor > 0 a pesar del rawCheck, prevalece el valor calculado
    if (hasIfFormula && typeof cellVal === 'number' && cellVal > 0) {
      return true;
    }
    return false;
  }

  // 3. Comprobación de texto (incluye 'VERDADERO', 'TRUE', etc.)
  var s = String(rawVal || '').trim().toLowerCase();
  var ds = String(displayVal || '').trim().toLowerCase();
  var truthy = ['true', 'verdadero', 'v', 'si', 'sí', 'yes', 'y', '1', 'checked', 'ok', 'x'];
  var falsy = ['false', 'falso', 'f', 'no', '0', 'unchecked', ''];

  if (truthy.indexOf(s) !== -1 || truthy.indexOf(ds) !== -1) {
    return true;
  }
  if (falsy.indexOf(s) !== -1 || falsy.indexOf(ds) !== -1) {
    return false;
  }

  // 4. Si la fórmula es =IF(F13, importe, 0) y cellVal === 0, está desmarcada
  if (hasIfFormula && typeof cellVal === 'number' && cellVal === 0) {
    return false;
  }

  // 5. Para hojas sin casilla (legacy), activo si cellVal > 0
  if (!hasIfFormula && typeof cellVal === 'number') {
    return cellVal > 0;
  }

  return false;
}

/**
 * Devuelve la lista completa de gastos fijos de un mes con el estado de su casilla y su importe.
 */
function getFixedExpenses(ss, month) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findFixedExpenseCols(ws);
  var lastRow = Math.min(ws.getLastRow(), 60);
  var fixedExpenses = [];
  var totalActive = 0;

  if (lastRow >= 13) {
    var numRows = lastRow - 12;
    var catRange = ws.getRange(13, cols.catCol, numRows, 1).getValues();
    var amtRange = ws.getRange(13, cols.amtCol, numRows, 1).getValues();
    var formulas = cols.hasCheckbox ? ws.getRange(13, cols.amtCol, numRows, 1).getFormulas() : [];
    var checkRange = (cols.hasCheckbox && cols.checkCol) ? ws.getRange(13, cols.checkCol, numRows, 1).getValues() : [];
    var checkDisplay = (cols.hasCheckbox && cols.checkCol) ? ws.getRange(13, cols.checkCol, numRows, 1).getDisplayValues() : [];

    for (var i = 0; i < catRange.length; i++) {
      var rowNum = i + 13;
      var cat = String(catRange[i][0] || '').trim();

      var formula = (formulas.length > i && formulas[i] && formulas[i][0]) ? String(formulas[i][0]) : '';
      var cellVal = amtRange[i][0];
      var numCellVal = (typeof cellVal === 'number') ? cellVal : (parseFloat(String(cellVal).replace(',', '.')) || 0);
      var baseAmount = 0;

      // 1. Extraer el importe base de la fórmula tipo =IF(F13, 470, 0) o =SI(F13; 470; 0)
      if (formula) {
        var match = formula.match(/(?:IF|SI)\s*\(\s*[^,;]+[,;]\s*([0-9]+(?:[.,][0-9]+)?)/i);
        if (match && match[1]) {
          baseAmount = parseFloat(match[1].replace(',', '.'));
        } else {
          // Si la fórmula referencia otra celda ej =IF(F13, H13, 0)
          var refMatch = formula.match(/(?:IF|SI)\s*\(\s*[^,;]+[,;]\s*([A-Za-z]+(\d+))/i);
          if (refMatch && refMatch[1]) {
            try {
              var refVal = ws.getRange(refMatch[1]).getValue();
              var pVal = parseFloat(String(refVal).replace(',', '.'));
              if (!isNaN(pVal) && pVal > 0) baseAmount = pVal;
            } catch (e) {}
          }
        }
      }

      // 2. Si no hay fórmula o falló el regex, usar el valor evaluado
      if ((!baseAmount || isNaN(baseAmount)) && cellVal !== '') {
        baseAmount = numCellVal;
      }

      // Si no hay categoría y no hay importe ni fórmula, es una fila vacía de la plantilla
      if (!cat) {
        if (baseAmount > 0 || (formula && formula.length > 3)) {
          cat = 'Gasto Fijo #' + (fixedExpenses.length + 1);
        } else {
          continue;
        }
      }

      // 3. Determinar si está activa
      var hasIf = formula.indexOf('IF') !== -1 || formula.indexOf('SI') !== -1;
      var active = false;

      if (cols.hasCheckbox && cols.checkCol && checkRange.length > i) {
        var rawCheck = checkRange[i][0];
        var dispCheck = (checkDisplay.length > i) ? checkDisplay[i][0] : '';
        active = isCheckboxChecked(rawCheck, dispCheck, numCellVal, hasIf);
      } else {
        active = numCellVal > 0 || baseAmount > 0;
      }

      if (active) {
        totalActive += baseAmount;
      }

      fixedExpenses.push({
        row: rowNum,
        category: cat,
        amount: baseAmount,
        active: active,
        hasCheckbox: cols.hasCheckbox
      });
    }
  }

  return {
    month: ws.getName(),
    fixedExpenses: fixedExpenses,
    totalActive: totalActive,
    hasCheckbox: cols.hasCheckbox
  };
}

/**
 * Modifica el estado de la casilla de un gasto fijo específico.
 */
function setFixedExpenseStatus(ss, month, row, active) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findFixedExpenseCols(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > ws.getMaxRows()) {
    return { error: 'Fila de gasto fijo inválida: ' + row };
  }

  var isActive = (active === true || active === 'true' || active === 1 || active === '1');

  if (cols.hasCheckbox && cols.checkCol) {
    ws.getRange(targetRow, cols.checkCol).setValue(isActive);
  } else {
    if (!isActive) {
      ws.getRange(targetRow, cols.amtCol).setValue(0);
    }
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    month: ws.getName(),
    row: targetRow,
    active: isActive,
    summary: getSummary(ss, ws.getName()),
    fixedExpenses: getFixedExpenses(ss, ws.getName()).fixedExpenses
  };
}

/**
 * Actualiza el importe numérico (dinero) y opcionalmente el nombre de un gasto fijo.
 */
function setFixedExpenseAmount(ss, month, row, newAmount, newCategory) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findFixedExpenseCols(ws);
  var targetRow = parseInt(row, 10);
  if (isNaN(targetRow) || targetRow < 13 || targetRow > ws.getMaxRows()) {
    return { error: 'Fila de gasto fijo inválida: ' + row };
  }

  var numAmount = parseFloat(String(newAmount).replace(',', '.'));
  if (isNaN(numAmount) || numAmount < 0) {
    return { error: 'Importe numérico inválido: ' + newAmount };
  }

  // 1. Si se proporciona nuevo nombre de categoría, actualizarlo
  if (newCategory && String(newCategory).trim()) {
    ws.getRange(targetRow, cols.catCol).setValue(String(newCategory).trim());
  }

  // 2. Actualizar el importe
  var amtCell = ws.getRange(targetRow, cols.amtCol);
  if (cols.hasCheckbox && cols.checkCol) {
    var checkRef = ws.getRange(targetRow, cols.checkCol).getA1Notation();
    amtCell.setFormula('=IF(' + checkRef + ', ' + numAmount + ', 0)');
  } else {
    amtCell.setValue(numAmount);
  }

  SpreadsheetApp.flush();

  var updatedFixed = getFixedExpenses(ss, ws.getName());
  var updatedSummary = getSummary(ss, ws.getName());

  return {
    success: true,
    status: 'ok',
    month: ws.getName(),
    row: targetRow,
    newAmount: numAmount,
    summary: updatedSummary,
    fixedExpenses: updatedFixed.fixedExpenses,
    totalActive: updatedFixed.totalActive
  };
}

/**
 * Actualiza múltiples casillas de gastos fijos en una sola llamada.
 */
function setFixedExpensesBatch(ss, month, updates) {
  var ws = findSheet(ss, month);
  if (!ws) return { error: 'Mes no encontrado: ' + month };

  var cols = findFixedExpenseCols(ws);
  if (!Array.isArray(updates) || updates.length === 0) {
    return { error: 'Lista de actualizaciones vacía' };
  }

  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var row = parseInt(u.row, 10);
    var active = (u.active === true || u.active === 'true' || u.active === 1 || u.active === '1');
    if (!isNaN(row) && row >= 13 && row <= ws.getMaxRows()) {
      if (cols.hasCheckbox && cols.checkCol) {
        ws.getRange(row, cols.checkCol).setValue(active);
      }
    }
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    month: ws.getName(),
    summary: getSummary(ss, ws.getName()),
    fixedExpenses: getFixedExpenses(ss, ws.getName()).fixedExpenses
  };
}


