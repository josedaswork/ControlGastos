package com.controlgastos.app.sync;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cliente HTTP nativo para Google Apps Script Web Apps.
 * Gestiona explícitamente las redirecciones 302 de POST->GET hacia script.googleusercontent.com
 * y la detección de errores HTML de permisos o URL inválida.
 */
public final class AppsScriptHttpClient {

    public interface Transport {
        String get(String url) throws IOException;
        String postJson(String url, String jsonBody) throws IOException;
    }

    public static final class HttpException extends IOException {
        public final String errorCode;

        public HttpException(String errorCode, String message) {
            super(message);
            this.errorCode = errorCode;
        }
    }

    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 50_000;
    private static final int MAX_REDIRECTS = 6;

    public static final class HttpUrlConnectionTransport implements Transport {

        @Override
        public String get(String url) throws IOException {
            return executeWithRedirects("GET", url, null);
        }

        @Override
        public String postJson(String url, String jsonBody) throws IOException {
            return executeWithRedirects("POST", url, jsonBody);
        }

        private String executeWithRedirects(String initialMethod, String initialUrl, String body) throws IOException {
            String currentUrl = initialUrl;
            String currentMethod = initialMethod;
            String currentBody = body;

            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    conn.setReadTimeout(READ_TIMEOUT_MS);
                    conn.setRequestMethod(currentMethod);
                    conn.setRequestProperty("Accept", "application/json, text/plain, */*");

                    if ("POST".equals(currentMethod) && currentBody != null) {
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
                        byte[] payloadBytes = currentBody.getBytes(StandardCharsets.UTF_8);
                        conn.setFixedLengthStreamingMode(payloadBytes.length);
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(payloadBytes);
                        }
                    }

                    int status = conn.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP
                            || status == HttpURLConnection.HTTP_MOVED_PERM
                            || status == HttpURLConnection.HTTP_SEE_OTHER
                            || status == 307
                            || status == 308) {
                        String location = conn.getHeaderField("Location");
                        if (location == null || location.trim().isEmpty()) {
                            throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT,
                                    "Redirección sin cabecera Location (HTTP " + status + ")");
                        }
                        URL nextUrl = new URL(url, location);
                        currentUrl = nextUrl.toString();
                        // Apps Script responde 302 en POST tras ejecutar doPost; el resultado se lee por GET
                        if (status == HttpURLConnection.HTTP_MOVED_TEMP
                                || status == HttpURLConnection.HTTP_MOVED_PERM
                                || status == HttpURLConnection.HTTP_SEE_OTHER) {
                            currentMethod = "GET";
                            currentBody = null;
                        }
                        continue;
                    }

                    InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    String responseText = readStream(stream);
                    if (status >= 400) {
                        throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT,
                                "Error HTTP " + status + " desde Google Apps Script: " + summarizeNonJsonError(responseText));
                    }
                    return responseText;
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }

            throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT, "Demasiadas redirecciones al conectar con Apps Script");
        }

        private static String readStream(InputStream stream) throws IOException {
            if (stream == null) return "";
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append('\n');
                }
            }
            return sb.toString().trim();
        }
    }

    public static JSONObject parseJsonResponse(String rawText) throws HttpException {
        if (rawText == null || rawText.trim().isEmpty()) {
            throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT,
                    "Respuesta vacía de Google Apps Script.");
        }
        try {
            JSONObject json = new JSONObject(rawText);
            if (json.has("error") && !json.isNull("error")) {
                String err = json.optString("error", "");
                if (!err.isEmpty()) {
                    throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT, err);
                }
            }
            return json;
        } catch (JSONException e) {
            throw new HttpException(SyncConstants.ERROR_REMOTE_SCRIPT, summarizeNonJsonError(rawText));
        }
    }

    public static String summarizeNonJsonError(String text) {
        if (text == null) return "Respuesta no válida de Google Apps Script";
        if (text.contains("No se puede abrir el archivo") || text.contains("Página no encontrada")) {
            return "URL de Apps Script inaccesible (\"Página no encontrada\"). Revisa que termine en \"/exec\" y tenga acceso para \"Cualquier persona\".";
        }
        if (text.contains("Authorization is required")
                || text.contains("accounts.google.com")
                || text.contains("Sign in")) {
            return "Permisos pendientes en Google Sheets: abre Apps Script y autoriza la implementación con acceso \"Cualquier persona\".";
        }
        if (text.contains("Script function not found")) {
            return "Función no encontrada en el script remoto. Actualiza Google Apps Script a la versión v4.1.";
        }
        Matcher exMatcher = Pattern.compile("Exception:[^<\\r\\n]+").matcher(text);
        if (exMatcher.find()) {
            return exMatcher.group().trim();
        }
        String stripped = text
                .replaceAll("(?is)<style[^>]*>.*?</style>", " ")
                .replaceAll("(?is)<script[^>]*>.*?</script>", " ")
                .replaceAll("<[^>]+>", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (stripped.length() > 180) {
            stripped = stripped.substring(0, 180) + "…";
        }
        if (!stripped.isEmpty() && !stripped.toLowerCase().contains("doctype")) {
            return stripped;
        }
        return "Google Apps Script devolvió una respuesta HTML inesperada. Revisa la implementación.";
    }
}
