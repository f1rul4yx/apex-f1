# APEX Pit Wall — F1 en vivo, sin suscripción

APEX es una segunda pantalla para seguir una sesión de Fórmula 1 desde tu equipo. Conecta directamente con el flujo de **F1 Live Timing**, muestra los datos más útiles junto a la retransmisión y permite explorar el resto del flujo en JSON.

**Sin paquetes que instalar, compilación, claves ni servicios de pago.** Solo necesitas Python 3.10+ y conexión a internet para los datos.

## Ejecutar

```bash
python3 server.py
```

Abre **http://localhost:3000**. Para cambiar el puerto:

```bash
python3 server.py --port 8080
```

El servidor escucha solo en `127.0.0.1` por defecto, para uso personal en tu equipo. Usa `--host` explícitamente solo si quieres compartirlo en tu red.

### Probar fuera de carrera

```bash
python3 server.py --demo
```

La demostración carga `data/demo-live.json` y está identificada como **REPLAY**. Sus pilotos, equipos, tiempos y audios son ficticios; no depende del estado ni del horario de una carrera real. Los enlaces de audio de la demostración no contienen grabaciones reales.

## Qué ofrece

- **En vivo:** posiciones, intervalos, última vuelta, neumáticos, edad de las tandas, paradas, contador de vueltas, reloj, clima, control de carrera y radios disponibles.
- **Estrategia:** compuestos, tandas, paradas, sectores y velocidades por piloto.
- **Piloto:** última telemetría y gráfico de velocidad cuando llega `CarData.z`.
- **Mapa:** trazado generado automáticamente con las trayectorias de `Position.z` y coches con el color de su equipo. Permite enfocar un piloto o abrir su telemetría; no requiere imágenes ni configuración por circuito.
- **Explorador:** cada categoría recibida, con sus datos originales, búsqueda de campos y descarga JSON.

El mapa puede empezar incompleto y necesitar alrededor de una vuelta para formarse. Es una representación a escala de las coordenadas recibidas, no un mapa geográfico con orientación norte-sur ni curvas numeradas. Solo aparecerá si la sesión proporciona posiciones.

En el acceso anónimo y gratuito, F1 no envía `Position.z` ni `CarData.z`, aunque el resto del cronometraje llega con normalidad. Las posiciones y la telemetría de coche quedan reservadas a cuentas con suscripción de F1 TV. Por eso la vista **Mapa** lo indica y no dibuja un trazado inventado, y la telemetría detallada del piloto tampoco estará disponible. Es una limitación de la fuente, no un fallo de la interfaz.

La fuente no es una API pública documentada ni estable. El acceso anónimo y la cobertura pueden cambiar según la sesión; APEX muestra el estado de la conexión y los errores en lugar de presentar datos guardados como si estuvieran en directo. Está pensado para uso personal; revisa las condiciones de la fuente antes de cualquier otro uso o redistribución.

## Datos y arquitectura

- `live_timing.py`: negociación, WebSocket TLS, protocolo SignalR Core, suscripción y reconexión. No usa OpenF1 para el directo.
- `live_state.py`: une los cambios parciales sin perder los campos anteriores, descomprime telemetría y normaliza la clasificación.
- `server.py`: sirve la SPA y la API local. `/api/live` contiene el panel compacto; `/api/live/events` envía avisos por SSE; `/api/live/topic?name=CarData.z` ofrece una categoría concreta. La telemetría voluminosa solo se descarga bajo demanda.
- `public/`: interfaz responsive sin frameworks ni herramientas de compilación.
- `f1_data.py` y `/api/season`: adaptador histórico de OpenF1 utilizado solo para apoyar el calendario. Los datos de OpenF1 entre 30 minutos antes y 30 minutos después de una sesión requieren suscripción y no se utilizan para el directo.

Las series de telemetría conservan las últimas **20.000 entradas por categoría** para evitar memoria ilimitada. El explorador lo indica cuando se alcanza ese límite. La memoria se reinicia al reiniciar el servidor.

## Pruebas

```bash
python3 -m unittest discover -s tests -v
```

Todas las pruebas usan datos locales o simulados: no necesitan red ni consumen cuota de ninguna fuente.

Las copias históricas siguen pudiendo actualizarse, únicamente si se necesita ese respaldo:

```bash
python3 scripts/update_snapshot.py [--year AÑO]
```

APEX es un proyecto independiente de aficionados y no está afiliado con Formula 1, FIA, OpenF1 ni ningún equipo.
