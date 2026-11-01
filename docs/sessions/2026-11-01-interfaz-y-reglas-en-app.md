# 2026-11-01: Interfaz de juego y reglamento

## Objetivo

Mejorar la legibilidad de la mesa, la información de puntaje y la interacción en pantallas móviles, además de hacer accesibles las reglas desde la aplicación.

## Cambios

- Se incorporó el historial de puntaje por mano y el desglose por concepto, con popup de detalle y totales acumulados. Se cubrió el caso del muerto tomado indirectamente y no jugado: resta 100 puntos y no descuenta las fichas del atril.
- La computadora registra errores técnicos y el estado de partida en consola, mientras muestra un mensaje general al jugador. Se aumentó a 1,5 s el tiempo mínimo visible de pensamiento.
- Se reorganizó la mesa en áreas separadas para Computadora y Vos, con juegos agrupados por tipo y disposición compacta. Se ajustaron tamaños, solapamiento, orden de comodines, color y brillo de fichas.
- Al terminar una mano se revela el atril de la computadora, salvo si fue tomado indirectamente y no jugado. Se añadió el estado del muerto por participante y se quitaron contadores globales redundantes.
- Se actualizaron los textos de bienvenida y objetivos, se simplificaron las acciones de robo y se hicieron interactivas las pilas. Las acciones de robo/descarte enfocan la sección del siguiente jugador.
- En el atril se añadió drag and drop táctil con ficha fantasma. La barra de acciones móvil quedó fija al viewport con soporte para safe area.
- Al seleccionar fichas, se muestran previews de los juegos compatibles; el pie informa cuántos destinos las admiten y permite agregarlas al tocarlos.
- Se añadió un diálogo compartido para leer `reglas-burako.md` desde bienvenida y partida, con tablas GFM y layout modal/fullscreen responsive.

## Decisiones y pendientes

- `reglas-burako.md` sigue siendo la fuente única del reglamento.
- Se registró la decisión 0004 sobre renderizado del reglamento con `react-markdown` y `remark-gfm`.
- No se modificaron las reglas funcionales del juego en esta sesión.

## Verificación

- `npm test`: 52 pruebas aprobadas tras ampliar la cobertura del desglose de puntajes.
- `npm run build`: compilación de producción aprobada después de los cambios de interfaz.
- Vite se usó para revisar la interfaz en `http://localhost:5173/`.
