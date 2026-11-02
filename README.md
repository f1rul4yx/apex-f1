# APEX — La Fórmula 1, explicada

Aplicación web independiente para seguir y entender la Fórmula 1: calendario en hora local, clasificación, resultados, resúmenes basados en datos y glosario para nuevos aficionados.

## Ejecutar

Solo necesitas Python 3.10 o superior. No hay paquetes que instalar ni proceso de compilación.

```bash
python3 server.py
```

Abre **http://localhost:3000**. Para usar otro puerto:

```bash
python3 server.py --port 8080
```

## Datos: OpenF1

[OpenF1](https://openf1.org/docs/) es la única fuente externa de APEX. El servidor utiliza sus endpoints de Grandes Premios, sesiones, resultados, parrilla, campeonato, pilotos, vueltas, posiciones, paradas, tandas y control de carrera.

- La cobertura disponible es **desde 2023**. El selector incluye las temporadas recientes compatibles.
- Los puntos mostrados son los que publica OpenF1 en `session_result`; no se estiman en el navegador.
- Las victorias se calculan contando los ganadores de las sesiones de carrera de la temporada. Las victorias de constructores se asignan al equipo con el que el piloto disputó cada carrera.
- Si `starting_grid` no contiene datos, se usa la primera posición registrada en la carrera como respaldo.
- Los resúmenes se generan a partir de hechos de los datos: ganador, vuelta más rápida registrada, remontadas, abandonos, paso por boxes, neutralizaciones y compuestos. No se atribuyen intenciones ni causas que los datos no demuestran.
- El servidor limita las peticiones, espacia las llamadas y guarda respuestas en `.cache/` durante 15 minutos.
- Si OpenF1 no está disponible, utiliza primero la caché y después las copias de `data/`, marcadas como datos guardados.
- **No se presentan datos en directo.** Se evita la ventana live de OpenF1 —desde 30 minutos antes hasta 30 minutos después de una carrera—, que requiere suscripción. Cualquier integración futura deberá revisar sus permisos de uso y redistribución.

Para actualizar las copias locales de la temporada configurada:

```bash
python3 scripts/update_snapshot.py
```

## Pruebas

```bash
python3 -m unittest discover -s tests -v
```

Las pruebas usan respuestas simuladas y no consumen la cuota de OpenF1.

## Estructura

- `public/`: interfaz responsive, estilos y lógica de la SPA.
- `f1_data.py`: adaptador de OpenF1, normalización, límite de peticiones y caché.
- `server.py`: servidor HTTP estático y API local.
- `data/`: snapshots de respaldo, sin credenciales ni datos personales.
- `tests/`: pruebas unitarias sin llamadas de red.

APEX es un proyecto de aficionados y no está afiliado con Formula 1, FIA, OpenF1 ni ningún equipo.
