# Presentación de la mesa en parejas

## Resumen

Se incorporaron múltiples perfiles de IA con nombres y avatares propios, y se adaptó el juego para incluir el modo por parejas, adaptando textos, mensajes e identificadores. También se refinó la distribución visual de esa modalidad para dar más espacio al paño, mantener visibles las fichas y distinguir visualmente a los compañeros.

## Cambios

- Se agregaron perfiles de IA con nombres, avatares y preferencias individuales; en parejas, cada partida usa perfiles distintos.
- Se adaptaron la lógica y la interfaz para jugar en parejas, con dos equipos de dos jugadores.
- Los atriles laterales quedan fuera del paño y sus fichas se muestran horizontales, orientadas hacia la mesa.
- Las columnas laterales se redujeron a 28 px; las fichas visibles miden 24 × 34 px y los dorsos 16 × 22 px, con mayor superposición.
- Se ajustaron las posiciones de los atriles derechos y de los avatares flotantes para que no cubran las fichas.
- Los avatares laterales usan el mismo tamaño que los de arriba y abajo. En parejas, el avatar superior toma el tono naranja del jugador humano; en partidas individuales conserva su color original.

## Decisiones técnicas

No se modificaron las decisiones vigentes ni las reglas funcionales. El ajuste es de presentación y mantiene el modelo de parejas descrito en [0002](../decisions/0002-logica-y-pruebas.md).

### PWA y ejecución local

- El service worker ahora precachea los bundles, estilos, imágenes e íconos estáticos, incluidos los 18 avatares SVG. Las rutas de avatar respetan el prefijo `/burako/` de producción.
- Se agregó `npm run preview` y se ajustó la base de publicación para que la previsualización sirva correctamente los recursos bajo `/burako/`, mientras que el servidor de desarrollo conserva su ruta raíz.
- Se documentó en el README cómo probar el build con `npm run build` y `npm run preview`, y cómo comprobar el service worker. En `localhost` puede probarse el caché local; para acceder desde otra dirección HTTP de la red local hace falta HTTPS para que el navegador permita registrar el worker. El service worker de desarrollo no se activa por defecto.

### Turnos, mensajes y puntajes

- No se pueden seleccionar fichas del atril antes de robar del montón o levantar del pozo. Se conserva el reordenamiento del atril y la selección cuando es válida para conservar el robo inicial o cerrar la mano por agotamiento del montón; el estado también se expone para accesibilidad.
- Al iniciar una partida o repartir la siguiente mano, se ocultan los tooltips con nombres de usuario.
- Los mensajes de victoria y derrota de mano y partida distinguen el modo por parejas: la victoria usa «ganaron» y la derrota «Otra vez será: el equipo rival ganó…». Los textos individuales se mantienen.
- Los puntajes de cabecera y cierre usan «Puntos:» y solo identifican la puntuación propia («vos» o «tu equipo»); el puntaje rival queda sin nombre ni etiqueta.

### Atriles laterales y móvil

- Se ajustó el solapamiento vertical de las fichas visibles y ocultas de los atriles laterales para que avancen hacia el lado opuesto al avatar y se aprecien con una superposición similar a la del atril superior.
- En pantallas de hasta 680 px, el área de juego usa 2 px de espacio horizontal y se añadió espacio interior a la cabecera y al control de ordenar el atril para evitar que queden pegados al borde.

### Verificación de la actualización

- `npm test`: 81 pruebas aprobadas en las sesiones que ajustaron la lógica y los mensajes.
- `npm run build`: compilación aprobada en las tres sesiones.
- El build de la PWA confirmó los 18 avatares en el precache; también se verificaron las rutas y tipos MIME de los recursos servidos por `preview`.
- `git diff --check` pasó en las sesiones que verificaron los cambios de estilos y puntajes.
- Inspección en escritorio y móvil: sin scroll horizontal y sin superposición entre avatares y fichas laterales.