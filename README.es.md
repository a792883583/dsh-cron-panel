# dsh-cron-panel

[中文](README.md) · [English](README.en.md)

Un panel de tareas programadas para la GUI web de DSH: se sitúa entre el selector de workspace y los ajustes en la barra lateral, gestionando tareas de DSH y tareas del sistema (crontab) en secciones separadas, con creación por lenguaje natural, edición a pantalla completa y registros de ejecución.

## Características

- **Panel lateral**: debajo del selector de workspace y encima de los ajustes; ➕ en la cabecera para crear, ▾ para contraer (se pliega a una barra de título fina; el estado se guarda)
- **Secciones separadas e indicadores de estado**: las tareas de DSH y del sistema se muestran por separado, con puntos indicadores de estado (🟢 éxito / 🔴 error / ⚪ no ejecutado aún)
- **Registros de ejecución y limpieza en un clic**: las tareas registran automáticamente con actualización en vivo y botón para limpiar registros y evitar acumulación
- **Creación por lenguaje natural**: escribe «ejecutar copia cada día a las 9am», «limpiar temporales cada 30 minutos», «cada lunes a las 20h» y se parsea automáticamente a una expresión cron; también se admiten expresiones manuales
  - **Análisis local instantáneo**: las frases habituales en chino/inglés se resuelven sin latencia y el «qué hacer» extraído se rellena automáticamente en el Agent Prompt
  - **Refinado con LLM** (nuevo en v0.1.12): los idiomas y frases que los patrones locales no cubren (japonés, coreano, oraciones complejas) se analizan con tu modelo por defecto; si no hay modelo configurado o la llamada falla, se vuelve silenciosamente al resultado local
- **Detalles a pantalla completa**: haz clic en una tarea para abrir una superposición sobre la conversación, cierra con la ✕ arriba a la derecha; editar / guardar / eliminar / activar
- **Vista previa de la próxima ejecución**: al editar, se muestran automáticamente las próximas 5 ejecuciones a partir de la expresión cron (evita errores)
  - Corregido en v0.1.12: expresiones como `30 13 * * 3` (cada miércoles a las 13:30) se previsualizaban como «cada día» por un error en la comparación día-del-mes / día-de-semana; ya se ajusta a la especificación cron y el recorrido avanza día a día, por lo que las expresiones poco frecuentes (p. ej. `0 0 29 2 *`) ya no bloquean
- **Automatización con Prompt del Agente**: Además de los comandos Shell estándar, active el modo "🤖 Automatización con Prompt del Agente" para ejecutar prompts de IA programados en segundo plano (p. ej. inspección de código o informe diario) y enviar el resultado a WeCom o Telegram
- **Notificar al finalizar**: al editar una tarea puede configurar "notificar al finalizar" — tras terminar, el resultado se envía a la plataforma seleccionada (Telegram / Discord / Bot de IA de WeCom / Email); requiere `dsh-message-gateway` instalado y conectado (QQ no admite push activo). El envío usa `/gateway/push`; al comando cron se le añade automáticamente el segmento de push (código de salida + descripción), sin configuración adicional
  - Nota (v0.1.12): **las tareas con Prompt del Agente omiten este push automático**. La sesión del agente ya emite mensajes, por lo que reenviarlos duplicaría el ruido; pide al agente que llame a una herramienta de push dentro del prompt si quieres un recordatorio
- **Ejecutar ahora**: en los detalles de la tarea, pulse "Ejecutar ahora" para ejecutar el comando una vez inmediatamente (sin programación cron) y ver el código de salida y la salida — verifique una tarea justo tras crearla en lugar de esperar su horario
  - Nota (v0.1.12): actualmente solo comandos Shell. Las tareas con Prompt del Agente devuelven un aviso en lugar de lanzar la sesión (evita una espera larga sin feedback); la ejecución en streaming está prevista para una versión posterior
- **Reintento automático**: configure el número de reintentos y la espera entre intentos (el comando corre en un subshell; un código de salida fallido dispara el reintento)
- **Copia de seguridad antes de escribir**: cada reescritura de crontab se antecede de una copia del contenido actual en `~/.local/share/dsh-cron-backups/` (conserva las 20 más recientes), de modo que los errores siempre se pueden revertir

- **Multilingüe**: sigue el idioma de la interfaz web de DSH (chino / inglés); los navegadores en español reciben automáticamente el texto en español; por defecto chino simplificado
- **Compatibilidad multiplataforma y mejoras de temas**:
  - Compatibilidad total con Windows: evita el error `spawn /usr/bin/crontab ENOENT` con persistencia local alternativa.
  - Mayor contraste y adaptación de variables de color en temas claros y oscuros, evitando texto invisible.
- Tema claro / oscuro siguiendo la GUI web de DSH


## Estado colapsado del panel lateral (nuevo en v0.1.13)

Cuando el usuario colapsa la barra lateral de workbench, el panel completo se sustituye por un **botón de entrada 36×36 adaptable al tema** (en la parte inferior de la barra, justo encima de Settings). Al hacer clic se abre un **overlay a pantalla completa con la lista de tareas**:

- Cabecera con número total, botón '+ Nueva' y botón cerrar
- Tareas agrupadas en  y , cada fila con punto de estado (🟢 ok / 🔴 err / ⚪ none)
- Clic en cualquier fila abre el  para editar;  para cerrar
- Misma fuente de datos (parseo de  del backend) que en estado expandido
- Botón adaptable al tema (claro: fondo gris muy tenue; oscuro: blanco semitransparente)

## Capturas de pantalla

**Panel lateral** (secciones DSH / sistema + añadir + contraer):

![Panel de tareas programadas](docs/cron-panel.png?v=0.1.13)

**Detalles a pantalla completa** (formulario de edición + registro de ejecución, cerrar arriba a la derecha):

![Detalles de la tarea](docs/cron-detail.png?v=0.1.13)

## Instalación

```sh
dsh plugin --profile web add dsh-cron-panel
```

Reinicia `dsh web` y el panel «Tareas programadas» aparece debajo del selector de workspace en la barra lateral.

> Para desarrollo local, instala mediante un enlace: `dsh plugin --profile web add link:/path/to/dsh-cron-panel`. Tras editar el código, ejecuta `npm run build` y actualiza la página para ver los cambios.

## Comentarios

¿Encontró un error o tiene una sugerencia? Abra un issue en [GitHub Issues](https://github.com/a792883583/dsh-cron-panel/issues) — sus comentarios nos ayudan a mejorar el plugin.

## Licencia

MIT
