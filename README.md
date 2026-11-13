# Burako

Aplicación web para jugar Burako de forma local contra la computadora. Las reglas acordadas para esta mesa están en [reglas-burako.md](reglas-burako.md).

## Requisitos

- Node.js y npm instalados.

## Instalación

Desde la raíz del proyecto, instalá las dependencias con el lockfile:

```sh
npm ci
```

## Desarrollo

Iniciá el servidor local de Vite:

```sh
npm run dev
```

Abrí en el navegador la dirección que indique el comando, normalmente `http://localhost:5173`.

## Pruebas

Ejecutá las pruebas de lógica del juego con:

```sh
npm test
```

## Build de producción

Para comprobar los tipos y generar el build de producción:

```sh
npm run build
```

La partida se guarda localmente en el navegador; el proyecto no requiere backend ni cuenta de usuario.

## Instalar como aplicación

La aplicación se puede instalar desde un navegador compatible cuando está publicada por HTTPS. En Chrome o Edge, usá la opción **Instalar aplicación** del menú o el icono de instalación de la barra de direcciones. En iPhone o iPad, abrí el sitio en Safari, tocá **Compartir** y elegí **Agregar a pantalla de inicio**.

Al abrirla desde el icono instalado, se muestra en una ventana independiente, normalmente sin barra de URL ni pestañas. Si se abre como una pestaña normal, conserva la interfaz del navegador. La disponibilidad de la instalación y algunos detalles visuales dependen del navegador y del sistema operativo.

La primera visita requiere conexión para descargar la aplicación. Después, el service worker guarda los archivos necesarios para poder abrirla y jugar sin conexión. La partida sigue guardándose localmente en el dispositivo y no se sincroniza con otros navegadores o dispositivos.

## Actualizaciones y publicación

Al publicar una versión nueva, no hace falta desinstalar ni volver a instalar la aplicación. El navegador detecta y descarga los archivos actualizados cuando hay conexión. Para no interrumpir una partida abierta, la versión nueva se activa cuando se cierra la aplicación y se vuelve a abrir o recargar.

Para publicar en GitHub Pages, generá el build de producción con `npm run build` y desplegá el contenido actualizado de `dist` en la rama o ruta configurada para Pages. El build genera el manifiesto y el service worker; no requiere cambiar manualmente un número de versión ni realizar un paso adicional.

## Diagnóstico de turnos

Los logs de diagnóstico están desactivados por defecto. Para habilitarlos en la consola del navegador, ejecutá:

```js
window.burakoDebug.enableLogging()
```

Para desactivarlos durante la sesión:

```js
window.burakoDebug.disableLogging()
```

Los eventos usan el prefijo `[Burako]` e incluyen el inicio y los pasos del turno de la computadora, sus decisiones, y las acciones del usuario.

Para mostrar el atril de la computadora durante la partida:

```js
window.burakoDebug.revealOpponentHand()
```

Para volver a ocultarlo:

```js
window.burakoDebug.hideOpponentHand()
```

Los errores se registran siempre con el mensaje y el estado completo de la partida.

El helper también permite recorrer hasta diez turnos anteriores y rehacerlos:

```js
window.burakoDebug.undo()
window.burakoDebug.redo()
```

Si `undo()` o `redo()` deja el turno en manos de la computadora, esta queda pausada para poder inspeccionar el estado. Ejecutá `window.burakoDebug.resumeComputerTurn()` para continuar.
