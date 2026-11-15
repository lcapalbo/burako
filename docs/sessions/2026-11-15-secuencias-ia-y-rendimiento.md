# Secuencias de IA y rendimiento

## Resumen

Se mejoraron las decisiones de la computadora cuando puede encadenar jugadas para tomar el muerto o cerrar la mano, y se redujo el costo de evaluar manos grandes. Los cambios se probaron con escenarios de Data, Daneel y Robotina.

## Cambios

- La IA reconoce secuencias completas de combinaciones y extensiones que permiten vaciar el atril y tomar el muerto. Prioriza esas secuencias sobre la retención estratégica de juegos y la probabilidad del perfil de bajar combinaciones.
- La toma del muerto contempla tanto bajar todas las fichas y tomarlo directamente como dejar un descarte legal y tomarlo indirectamente. En estos escenarios, la IA puede usar comodines en varias combinaciones y favorece jugadas que conservan intacta una canasta existente cuando hay alternativas.
- La IA puede encadenar combinaciones para cortar la mano, incluso si el perfil normalmente retendría juegos o rechazaría bajarlos. Si no hay una secuencia legal de cierre o toma del muerto, siguen vigentes las preferencias habituales del perfil.
- Se redujo la búsqueda redundante en manos grandes mediante poda incremental de combinaciones incompatibles, caché de grupos y validación más eficiente de escaleras. El escenario de pozo grande que demoraba cerca de 30 segundos pasó a unos 1,3 segundos.
- Se agregaron regresiones para secuencias naturales y con comodines, toma directa e indirecta del muerto, cierre de mano y evaluación de pozos grandes.

## Decisiones y reglas

La lógica de la IA y sus pruebas siguen separadas de la interfaz, conforme a [0002](../decisions/0002-logica-y-pruebas.md). No se modificaron las reglas funcionales ni se adoptó una nueva decisión técnica.

## Verificación

- `npm test`: 118 pruebas aprobadas; el escenario de pozo grande pasó de unos 30 segundos a aproximadamente 1,3 segundos.
- `npm run build`: compilación aprobada.
