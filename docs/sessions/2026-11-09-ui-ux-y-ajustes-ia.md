# UI/UX y ajustes acotados de la IA

**Período:** 4 al 9 de noviembre de 2026

## Interfaz y experiencia de juego

- Se consolidó la identidad visual de la aplicación con una ficha azul con la letra B como marca en las cabeceras y como favicon. También se ajustaron los símbolos de color de la ficha para distinguirlos mejor.
- Se reorganizó la mesa en zonas más claras para los atriles, las pilas y los juegos. Los avatares quedaron flotantes y con etiquetas activables; las mesas de ambos equipos mantienen dimensiones coherentes. El área de juegos aprovecha el espacio vertical y puede crecer cuando el contenido lo necesita.
- Se unificó la presentación de escaleras y piernas en un área de juegos compartida, conservando el orden acordado: primero escaleras por color y luego piernas por número. Los modos compacto y mínimo responden al desbordamiento real, conservan separación entre juegos y ajustan la presentación de las fichas y los badges de canasta.
- Se simplificó el pozo para mostrar directamente sus fichas apiladas y su cantidad, con disposición y control coherentes con el montón. Se retiró el paso de diálogo para ordenar el pozo.
- Los previews indican cuándo la ficha seleccionada puede descartarse y se aplican también al descarte de apertura.
- Se hicieron explícitas las acciones posibles: conservar o rechazar el primer robo, descartar una ficha desde el pozo y bajar una combinación válida desde su preview en la mesa. Los previews se ubican según el orden final de escaleras y piernas. La selección del atril solo conserva fichas relacionadas con el conjunto completo; se ajustaron los textos de estado para reflejar las acciones realmente disponibles.
- Se incorporaron animaciones de movimiento entre montón, pozo, atriles y juegos, incluidas las jugadas de la computadora paso a paso. Se eliminó el desplazamiento automático entre turnos y se afinó el ajuste de densidad y espaciado para evitar recortes o solapamientos. El menú de ordenamiento ofrece modos por color, número y orden original, con sus controles visuales ajustados.

## Mejoras puntuales de la computadora

- Se corrigió el inicio del turno de la computadora al repartir una nueva mano: el efecto ahora también reacciona al cambio de fase cuando el jugador actual sigue siendo la computadora, evitando que el turno quede sin iniciar.
- Se agregaron registros de diagnóstico para el pensamiento y los pasos de la computadora, además de acciones del usuario. Permanecen desactivados por defecto y se habilitan desde la consola del navegador con `window.__BURAKO_DEBUG__ = true`.
- Se quitó la espera adicional posterior al descarte que mantenía bloqueada la interfaz aunque ya correspondiera el turno del usuario; se conservaron las pausas breves entre pasos para mostrar la jugada progresivamente.
- Se amplió la evaluación del pozo: la computadora considera hasta diez fichas superiores y busca combinaciones compatibles con su atril, incluidas formaciones de tres o cuatro fichas. Si su equipo aún no tiene canasta, evalúa además si puede extender un juego propio hasta seis fichas o completar una canasta.

## Verificación registrada

En los chats de diagnóstico y estrategia se informó que `npm test` pasó con 52 y, tras agregar casos para la evaluación del pozo, con 57 pruebas; también se informó que `npm run build` finalizó correctamente. Esos resultados corresponden a las verificaciones de dichas sesiones, no a una nueva ejecución al crear este resumen.