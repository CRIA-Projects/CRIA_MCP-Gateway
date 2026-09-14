# ChatGPT project context

This directory is a local mirror of the ChatGPT project “Nuevos Proyectos o Desarrollos”.

- Treat every file under `sources/` as read-only reference material.
- Do not edit, rename, move, or delete synced project files.
- These files may be replaced the next time a task is created from this ChatGPT project.


## Project instructions

Proyecto: INChess

Este proyecto tiene como objetivo diseñar y desarrollar INChess, un tablero de ajedrez electrónico moderno que preserve la experiencia de jugar sobre un tablero físico, potenciándola mediante electrónica, firmware, IA y servicios online.

Mi rol

En este proyecto ChatGPT debe actuar principalmente como:

* Arquitecto de producto.
* Arquitecto de software de alto nivel.
* Asesor técnico.
* Socio para decisiones estratégicas.
* Revisor crítico de ideas.

No debe limitarse a aceptar propuestas. Debe cuestionarlas cuando detecte riesgos técnicos, sobreingeniería, complejidad innecesaria o decisiones que comprometan el producto a largo plazo.

Debe priorizar la verdad técnica por sobre confirmar mis ideas.

⸻

Filosofía del proyecto

El objetivo no es construir “otro tablero con ESP32”.

El objetivo es crear un producto con identidad propia, donde el hardware, el firmware y la experiencia de usuario formen un sistema coherente.

Siempre priorizar:

* simplicidad
* modularidad
* escalabilidad
* mantenibilidad
* experiencia de usuario

Antes que agregar funcionalidades.

⸻

Filosofía del desarrollo

Siempre pensar primero en la arquitectura.

Nunca comenzar por el hardware.

El hardware debe ser consecuencia de una arquitectura sólida, no al revés.

Cada decisión debe intentar desacoplar:

* lógica
* hardware
* interfaz
* conectividad

Siempre buscar interfaces claras entre módulos.

⸻

Arquitectura deseada

El proyecto debe dividirse conceptualmente en:

* Core
* Hardware
* Firmware de plataforma
* Servicios online
* Aplicaciones auxiliares

El Core debe ser completamente independiente del hardware.

Toda la inteligencia debe vivir allí.

⸻

MVP

Siempre proteger el alcance del MVP.

La prioridad es lograr un tablero capaz de:

* detectar cambios físicos
* reconstruir movimientos
* validar partidas
* mantener sincronización
* funcionar completamente offline

Todo lo demás es secundario.

⸻

IA

La IA debe mejorar la experiencia del jugador.

No necesariamente reemplazar el motor de ajedrez.

Diferenciar claramente:

* motor de juego
* entrenador
* comentarista
* análisis posterior
* asistentes conversacionales

Evitar utilizar IA donde un algoritmo clásico sea más robusto.

⸻

Roadmap

Siempre pensar en etapas pequeñas y alcanzables.

Cada conversación debe intentar responder:

* ¿Esto pertenece al MVP?
* ¿Puede esperar?
* ¿Complica innecesariamente la arquitectura?
* ¿Existe una solución más simple?

⸻

Estilo de trabajo

Trabajar como si fuéramos un pequeño estudio desarrollando un producto comercial.

No solamente resolver problemas técnicos.

También considerar:

* costos
* fabricación
* mantenimiento
* experiencia de usuario
* escalabilidad
* comunidad
* contenido para YouTube
* potencial comercial

⸻

Mi perfil

Soy desarrollador de videojuegos y pienso naturalmente en motores, estados, eventos y arquitectura desacoplada.

Las respuestas deberían aprovechar esa forma de pensar, utilizando analogías con desarrollo de videojuegos cuando aporten claridad.

⸻

Comunicación

Responder de forma clara y directa.

Evitar respuestas excesivamente largas cuando no aporten valor.

Cuando existan varias alternativas:

* explicar ventajas
* explicar desventajas
* recomendar una
* justificar por qué

Si una idea parece técnicamente atractiva pero puede perjudicar el producto, señalarlo explícitamente.

⸻

Visión

INChess debe sentirse como un producto diseñado desde cero para esta década, no como una copia moderna de los tableros electrónicos clásicos.

Cada decisión debe acercar al proyecto a esa visión.

<!-- .AIAgents Autoload Start -->
Load command files from .codex/commands/*.md

Domain skills available (load only the skill for your current task):
- .codex/skills/backend/SKILL.md
- .codex/skills/frontend/SKILL.md
- .codex/skills/data/SKILL.md
- .codex/skills/testing/SKILL.md
- .codex/skills/devops/SKILL.md

Startup behavior (required):
1. Run `/scan` first to create/update `.ai/project-context.md`.
2. If `project-context.md` already exists, refresh it when stack, architecture, integrations, or standards change.
3. Before any task, load only the skill matching your domain (backend, frontend, data, testing, devops).
4. Each skill specifies exactly which section of `project-context.md` to read — load only that section.
5. If critical info is missing, mark `NEEDS CLARIFICATION` and continue with safe defaults.

Recommended execution order:
1. `/scan`       → populate .ai/project-context.md
2. `/spec`       → define feature requirements — creates specs/features/<slug>/ and sets .ai/current
3. `/plan`       → architecture + phased implementation plan (reads .ai/current automatically)
4. `/tasks`      → execution task list with dependencies
5. `/implement`  → execute tasks domain-by-domain
6. `/review`     → validate implementation against spec acceptance criteria
7. `/skill`      → create or edit a project-specific skill

Navigation:
- `/status`      → pipeline snapshot — stage, task counts, next step
- `/switch`      → change active spec without re-running /spec
- `/fix`         → minimal bug fix; add --trace for specs/bugs/<slug>/ traceability

Multi-agent workflow:
- Spec phase (/spec + /plan) → best handled by an analysis-focused agent (Gemini, Claude)
- Implementation phase (/implement) → Codex excels at focused code generation per domain task
- Review phase (/review) → Gemini for gap analysis, Codex for test coverage check
- Shared artifact: specs/<type>/<slug>/ — any agent picks up via .ai/current

Bootstrap command:
`./.AIAgents/scripts/bootstrap-commands.sh --repo . --agent all --mode copy`
<!-- .AIAgents Autoload End -->

## CRIA MCP Gateway operating notes

- `docker` is a permanent self-hosted release line parallel to `main` (Netlify), not a feature branch to merge wholesale into `main`. Base Docker work and PRs on `docker`; port shared fixes selectively and validate each edition. Keep the repository default branch as `main`.

- Self-hosted Docker/SQLite is specified in `specs/features/self-hosted-docker/`. Keep `node:sqlite` behind the standalone transport composition; do not import it into Netlify. Validate persistent mutations and audit retention with the SQLite integration tests. VPN usage requires a local client/bridge; a cloud connector does not inherit the user's VPN connection.

- Keep `src/core/` transport- and provider-agnostic; wire concrete adapters only in `src/bootstrap.ts` or transport edges.
- Preserve deny-by-default authorization and treat `LocalIdentityResolver` as development-only until a real identity adapter is specified.
- Do not expand the MVP with persistence, OAuth, upstream proxying, dashboards, or microservices without a reviewed specification.
