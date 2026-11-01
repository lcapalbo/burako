# Burako de mesa

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
