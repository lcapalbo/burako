# 0002: Lógica de juego independiente y pruebas con Node

- Estado: Aceptada
- Fecha: 2026-10-30

## Contexto

Las reglas de turnos, combinaciones y puntaje deben poder verificarse sin depender de la interfaz. El proyecto ya separa estas operaciones de los componentes React.

## Decisión

Mantener la lógica de dominio en `src/game.ts`, sin dependencia de React, y probarla con el módulo nativo `node:test`. La estrategia de la computadora vive en `src/computer.ts` y compone transiciones del motor, sin duplicar sus reglas. Sus preferencias se configuran en los perfiles tipados de `src/aiProfiles.ts`; modifican decisiones estratégicas, no las reglas del motor. Las reglas funcionales de referencia se mantienen en `reglas-burako.md`.

## Consecuencias

- Los cambios en reglas o transiciones de estado deben incluir pruebas enfocadas en `tests/`.
- Las pruebas se ejecutan con `npm test`.
- La interfaz debe invocar las operaciones del motor en vez de duplicar sus reglas.
- En parejas, cada IA decide con su propia mano y los juegos expuestos de ambos equipos; nunca usa la mano oculta de su compañero. Los juegos bajados y el puntaje sí pertenecen al equipo.