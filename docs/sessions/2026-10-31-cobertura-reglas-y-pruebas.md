# 2026-10-31: Cobertura de reglas y pruebas

## Objetivo

Contrastar las reglas acordadas con el motor y sus tests, cerrar los huecos detectados y organizar la suite por área.

## Cambios

- Se normaliza automáticamente el orden de las escaleras al bajarlas y al agregar fichas, permitiendo reubicar el comodín dentro de la combinación.
- Se amplían las pruebas para escaleras límite, comodines, canastas, puntajes y agotamiento del montón.
- Se verifica que una nueva mano de dos jugadores use una distribución completa nueva y no conserve fichas de la mano anterior.
- Se ajusta el caso de toma indirecta sin jugada posterior para representar el muerto completo de 11 fichas en el atril.
- Se agrupan los tests existentes en siete suites por área, conservando todos los casos y asserts.
- Se agrega cobertura para los tres resultados con el montón agotado: no poder levantar el pozo, elegir no levantarlo y levantarlo para continuar el turno.

## Criterios confirmados

- La restricción de no descartar la única ficha recién levantada del pozo forma parte de las reglas acordadas.
- La opción de terminar la mano se ofrece aunque el pozo todavía pueda levantarse; el jugador puede decidir según su conveniencia.
- La aplicación sigue limitada a dos jugadores por ahora. Las partidas de cuatro quedan para una etapa posterior.
- La lógica de dominio continúa en `src/game.ts` y las pruebas con `node:test`; no hubo cambios en las decisiones técnicas vigentes.

## Verificación

- `npm test`: 39 tests aprobados.
- `npm run build`: compilación de producción aprobada durante la sesión.
- Sin diagnósticos en los archivos de código y pruebas modificados.