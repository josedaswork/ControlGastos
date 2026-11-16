# Widgets Nativos de Android (`com.controlgastos.app`)

Esta guía documenta la infraestructura de widgets de pantalla de inicio implementada en Android nativo con `AppWidgetProvider`, `RemoteViews` y almacenamiento nativo aislado por instancia.

---

## 1. Estructura implementada

- **Provider y lógica nativa (`android/app/src/main/java/com/controlgastos/app/widget/`)**:
  - `CategoryCountWidgetProvider.java`: `AppWidgetProvider` con soporte de `onUpdate`, `onAppWidgetOptionsChanged`, `onReceive`, `onDeleted` y `onDisabled`.
  - `WidgetDemoStore.java`: persistencia en `SharedPreferences` (`control_gastos_widget_prefs`) aislada por `appWidgetId`, ordenación descendente (de mayor a menor) y adaptación de filas visibles según altura al redimensionar.
  - `WidgetIntentFactory.java`: factoría de `Intent` explícitos y `PendingIntent` (`FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE` en API 23+) únicos por instancia y slot de acción.
  - `WidgetConstants.java`: constantes de acciones explícitas y generadores de URI / `requestCode` sin colisiones.
- **Recursos XML (`android/app/src/main/res/`)**:
  - `xml/category_count_widget_info.xml`: configuración 2×4 (`targetCellWidth="2"`, `targetCellHeight="4"`, `minWidth="110dp"`, `minHeight="250dp"`) y redimensionable (`resizeMode="horizontal|vertical"`).
  - `layout/widget_category_count.xml` y `layout/widget_category_count_preview.xml`: tarjeta 2×4 con lista ordenada de mayor a menor, botón de interacción nativa (`+1`) y acceso directo a la app (`Abrir`).
  - `drawable/widget_*.xml`, `values/widget_colors.xml`, `values-night/widget_colors.xml` y `values/strings.xml`.
- **Manifiesto (`android/app/src/main/AndroidManifest.xml`)**:
  - Receiver `.widget.CategoryCountWidgetProvider` registrado con `android:exported="true"`, `<intent-filter>` para `APPWIDGET_UPDATE` y `<meta-data android:name="android.appwidget.provider" ... />`.
- **Pruebas unitarias (`android/app/src/test/java/com/controlgastos/app/widget/`)**:
  - `WidgetDemoStoreTest.java` y `WidgetConstantsTest.java`.

---

## 2. Comandos de build y sincronización con Capacitor

1. **Compilar la app web y sincronizar Capacitor (mantiene intactos los cambios nativos en `android/`)**:
   ```bash
   npm run build
   npx cap sync android
   ```
2. **Ejecutar pruebas unitarias de Android (JUnit)**:
   ```bash
   cd android
   ./gradlew testDebugUnitTest --no-daemon
   ```
3. **Compilar el APK de depuración**:
   ```bash
   cd android
   ./gradlew assembleDebug --no-daemon
   ```
   El APK generado quedará en:
   `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Instalar en dispositivo o emulador por ADB**:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## 3. Punto de integración futuro con React (`src/lib/sheetsApi.js`)

Actualmente el widget opera con datos de demostración y estado nativo aislado (`control_gastos_widget_prefs`), sin leer `localStorage` ni Google Sheets.

Cuando se defina la integración real del recuento mensual de gastos variables por categoría (ordenado de mayor a menor):
1. Añadir un plugin nativo de Capacitor (por ejemplo `WidgetBridgePlugin` extendiendo `com.getcapacitor.Plugin`) y registrarlo en `MainActivity.java` con `registerPlugin(WidgetBridgePlugin.class)`.
2. Desde React/JS (`src/lib/sheetsApi.js` o capa superior tras actualizar/sincronizar el mes), calcular el resumen mensual de conteos y enviarlo al plugin nativo.
3. El plugin guardará el resumen serializado en `SharedPreferences` (`WidgetConstants.PREFS_NAME`) y lanzará un broadcast explícito con `WidgetConstants.ACTION_REFRESH_ALL` hacia `CategoryCountWidgetProvider`.

---

## 4. Checklist de verificación manual en dispositivo / emulador

1. **Añadir el widget 2×4**:
   - Mantén pulsado un espacio vacío del launcher → *Widgets* → busca **Control Gastos** → **Resumen Categorías (2×4)**.
   - Verifica el nombre, la vista previa y que ocupa 2 columnas × 4 filas al soltarlo.
   - Redimensiona el widget vertical/horizontalmente y comprueba que adapta las filas visibles sin recortarse.
2. **Interactuar con la app cerrada**:
   - Fuerza el cierre de la app (deslízala desde recientes).
   - Pulsa el botón **`+1`** en el widget varias veces.
   - Comprueba que `Toques demo` aumenta y `"Muestra Alfa"` sube posiciones de mayor a menor sin abrir la aplicación ni su WebView.
3. **Abrir la app desde el widget**:
   - Pulsa **`Abrir`** o la cabecera del widget y verifica que se abre `MainActivity`.
4. **Añadir dos instancias independientes**:
   - Añade un segundo widget **Resumen Categorías (2×4)** en la pantalla de inicio (tendrán IDs distintos en el subtítulo, ej. `#12` y `#13`).
   - Pulsa **`+1`** solo en la primera instancia y confirma que la segunda mantiene su propio contador sin mezclarse.
5. **Eliminar una instancia**:
   - Arrastra una de las dos instancias a *Quitar / Eliminar*.
   - Confirma que la instancia restante sigue funcionando con su estado intacto y que al volver a añadir otro widget nuevo arranca desde `Toques demo: 0`.
