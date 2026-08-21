# dsh-cron-panel

[中文](README.md) · [English](README.en.md)

Un panel de tareas programadas para la GUI web de DSH: se sitúa entre el selector de workspace y los ajustes en la barra lateral, gestionando tareas de DSH y tareas del sistema (crontab) en secciones separadas, con creación por lenguaje natural, edición a pantalla completa y registros de ejecución.

## Características

- **Panel lateral**: debajo del selector de workspace y encima de los ajustes; ➕ en la cabecera para crear, ▾ para contraer (se pliega a una barra de título fina; el estado se guarda)
- **Secciones separadas**: tareas de DSH (creadas desde el panel, marcadas) y tareas del sistema (entradas crontab existentes) se muestran por separado
- **Creación por lenguaje natural**: escribe «ejecutar copia cada día a las 9am», «limpiar temporales cada 30 minutos», «cada lunes a las 20h» y se parsea automáticamente a una expresión cron (chino e inglés, más de 17 patrones); también se admiten expresiones manuales
- **Detalles a pantalla completa**: haz clic en una tarea para abrir una superposición sobre la conversación, cierra con la ✕ arriba a la derecha; editar / guardar / eliminar / activar
- **Vista previa de la próxima ejecución**: al editar, se muestran automáticamente las próximas 5 ejecuciones a partir de la expresión cron (evita errores)
- **Notificar al finalizar**: al editar una tarea puede configurar "notificar al finalizar" — tras terminar, el resultado se envía a la plataforma seleccionada (Telegram / Discord / Bot de IA de WeCom / Email); requiere `dsh-message-gateway` instalado y conectado (QQ no admite push activo). El envío usa `/gateway/push`; al comando cron se le añade automáticamente el segmento de push (código de salida + descripción), sin configuración adicional
- **Registros de ejecución**: las tareas creadas desde el panel registran automáticamente (`~/Library/Logs/dsh-cron-<id>.log`); las tareas del sistema reutilizan su redirección de log existente; más recientes primero, con botón de actualizar
- **Multilingüe**: sigue el idioma de la interfaz web de DSH (chino / inglés); los navegadores en español reciben automáticamente el texto en español; por defecto chino simplificado
- Tema claro / oscuro siguiendo la GUI web de DSH

## Capturas de pantalla

**Panel lateral** (secciones DSH / sistema + añadir + contraer):

![Panel de tareas programadas](docs/cron-panel.png)

**Detalles a pantalla completa** (formulario de edición + registro de ejecución, cerrar arriba a la derecha):

![Detalles de la tarea](docs/cron-detail.png)

## Instalación

```sh
dsh plugin --profile web add dsh-cron-panel
```

Reinicia `dsh web` y el panel «Tareas programadas» aparece debajo del selector de workspace en la barra lateral.

> Para desarrollo local, instala mediante un enlace: `dsh plugin --profile web add link:/path/to/dsh-cron-panel`. Tras editar el código, ejecuta `npm run build` y actualiza la página para ver los cambios.

## Licencia

MIT
