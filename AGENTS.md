# GitHub Copilot Instructions

## Reglas Críticas del Agente (Importadas de AGENTS.md)

Estas reglas son de obligado cumplimiento en cada interacción y tienen prioridad sobre cualquier otra instrucción. En caso de conflicto entre reglas, la prioridad es: 1) Preservación de contexto, 2) Estilo y estructura, 3) Validación, 4) Herramientas de edición. Si el usuario solicita explícitamente una acción que contradice estas reglas, informa del conflicto y pide confirmación antes de continuar.



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

9. **PNPM**:
    - Usa `pnpm` para la gestión de dependencias y scripts. Evita usar `npm` o `yarn` para estas tareas, ya que pueden causar inconsistencias en el entorno de desarrollo.