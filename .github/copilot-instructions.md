# GitHub Copilot Instructions

## Reglas Críticas del Agente (Importadas de AGENTS.md)

Estas reglas son de obligado cumplimiento en cada interacción y tienen prioridad sobre cualquier otra instrucción. En caso de conflicto entre reglas, la prioridad es: 1) Preservación de contexto, 2) Estilo y estructura, 3) Validación, 4) Herramientas de edición. Si el usuario solicita explícitamente una acción que contradice estas reglas, informa del conflicto y pide confirmación antes de continuar.

1.  **PROHIBIDO EDITAR CÓDIGO CON LA TERMINAL**:
    - NUNCA uses comandos como `sed`, `grep -v`, `printf >`, `echo >`, `cat >` o similares para modificar o crear archivos de código fuente o tests.
    - Usa EXCLUSIVAMENTE las herramientas de edición proporcionadas (`replace_string_in_file`, `create_file`, `edit_notebook_file`).
    - La terminal se reserva únicamente para lectura (`cat`, `ls`), ejecución de tests (`pnpm exec vitest`), gestión de dependencias y tareas del sistema que no impliquen escribir código.

2.  **PRESERVACIÓN DE CONTEXTO**:
    - Antes de editar, lee el archivo para asegurar que los bloques de contexto para `replace_string_in_file` coincidan exactamente.
    - Mantén el estilo y las convenciones del proyecto.

3.  **VALIDACIÓN**:
    - Ejecuta `pnpm run lint` y `pnpm test` tras cada edición.
    - Si uno de esos comandos no aplica al cambio o falla por configuración faltante del entorno, reporta el motivo y continúa.

4.  **CERO COMENTARIOS**:
    - No añadir comentarios explicativos en el código.
    - Excepción única: un comentario breve para documentar una limitación externa o contractual que no pueda expresarse de forma fiable en el propio código.

5.  **CERO BLOQUES VACÍOS**:
    - Prohibidos `catch` vacíos, `else` vacíos o funciones sin cuerpo.
    - Si un error debe ignorarse, incluye una llamada `logger.warn("motivo concreto")` o una salida explícita con motivo técnico concreto.

6.  **ARCHIVOS CORTOS**:
    - El límite general es de **300 líneas** por archivo nuevo o modificado.
    - Si un cambio supera ese límite, divide el código en módulos más pequeños dentro de la misma tarea, salvo la excepción aprobada.

7.  **EXCEPCIÓN APROBADA**:
    - `src/main_process/network/file-transfer/transfer-manager.ts` puede mantenerse por encima del límite hasta un máximo de **600 líneas**.
    - No debe seleccionarse como objetivo automático de refactor solo por tamaño. Trátalo como módulo sensible y tócalo únicamente si hay un requerimiento funcional explícito o una necesidad técnica justificada.

8.  **CERO ARCHIVOS DE EXPORTACIÓN**:
    - No crear archivos cuyo único propósito sea reexportar símbolos de otros módulos.
    - Al refactorizar archivos grandes, actualiza los imports de los consumidores para que apunten directamente a los nuevos módulos. No se permiten archivos `index.ts` de reexportación.
