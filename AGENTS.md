# Guía para agentes

- Python 3.10+ y biblioteca estándar; no hay dependencias, build, lint o formatter configurados. Arranque: `python3 server.py` (solo `127.0.0.1`, puerto 3000). Prueba visual sin red: `python3 server.py --demo`; no presenta datos ficticios como reales.
- Verificación: `python3 -m unittest discover -s tests -v`. Las pruebas no requieren red. No hay una carrera real reproducible en CI: evita depender de llamadas al flujo en vivo para validar cambios.
- El directo no usa OpenF1 (su modo live es de pago). `live_timing.py` conecta con F1 Live Timing mediante SignalR Core; `live_state.py` fusiona deltas y conserva categorías originales; `public/app.js` consume el contrato consolidado. Los cambios de ese contrato exigen actualizar frontend y pruebas.
- El servidor mantiene el estado en memoria y se reconecta automáticamente. El flujo de F1 es no oficial, no está documentado públicamente y su acceso anónimo/cobertura no están garantizados: no afirmes que siempre funciona ni simules directo al fallar.
- `/api/live` y SSE excluyen `CarData.z` y `Position.z` para no transferir miles de muestras en cada refresco. Usa `/api/live/topic?name=...` bajo demanda. No incluyas telemetría completa en el panel periódico.
- Las entradas `.z` son base64 + DEFLATE sin cabecera zlib, no JSON comprimido con gzip. Los deltas deben fusionarse recursivamente; las listas completas se reemplazan, no se concatenan. La retención de cada telemetría está limitada a 20.000 entradas y debe indicarse al usuario si se alcanza.
- `data/demo-live.json` es explícitamente ficticio. Las demás copias de `data/` son históricas y están versionadas; `.cache/` es temporal y está ignorado por Git.
- `f1_data.py`, `/api/season` y `scripts/update_snapshot.py` son legado histórico para el calendario. OpenF1 no alimenta el directo; actualizar snapshots requiere conexión, modifica archivos versionados y debe ejecutarse solo intencionadamente.
