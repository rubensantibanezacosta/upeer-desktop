# Arquitectura de Escalabilidad P2P para uPeer

## Objetivo

Definir una evolución de arquitectura que permita escalar uPeer a órdenes de magnitud mucho mayores sin perder su esencia:

- sin servidores centrales de mensajería
- sin autoridad única de descubrimiento
- sin dependencia de un backend propietario para entrega de mensajes
- manteniendo E2EE, soberanía de identidad y resistencia a censura

La meta no es clonar el modelo de WhatsApp, sino acercarse a una experiencia masiva con una arquitectura descentralizada viable.

---

## Resumen Ejecutivo

La arquitectura actual de uPeer es sólida para una red P2P funcional, pero a gran escala tiene varios límites estructurales:

1. demasiado trabajo recae en cada cliente final
2. el fan-out de grupos desde el emisor no escala
3. la replicación de vault multiplica tráfico y almacenamiento
4. la presencia y la conectividad se apoyan en estados demasiado optimistas
5. el plano de control DHT puede crecer más rápido que el tráfico útil

Para mantener la filosofía P2P sin centralizar, la evolución recomendada es:

- pasar de un P2P plano a un P2P por capas
- introducir nodos con roles voluntarios y verificables, no servidores dueños del sistema
- reducir fan-out directo con overlays de difusión
- hacer almacenamiento y entrega offline más selectivos
- desacoplar identidad, descubrimiento, presencia y entrega
- convertir la red en una arquitectura de “edge mesh + custodios + overlays”

---

## Principios No Negociables

### 1. Identidad soberana

La identidad debe seguir residiendo en el dispositivo del usuario.

- claves locales
- firmas end-to-end
- sin registro central obligatorio
- sin cuenta dependiente de proveedor

### 2. Cifrado extremo a extremo real

Todo nodo intermedio debe ver:

- metadatos mínimos
- paquetes opacos siempre que sea posible
- incapacidad de modificar contenido sin detección

### 3. Descentralización práctica

No hace falta que todos los nodos sean iguales, pero sí que ninguno sea imprescindible.

Es aceptable introducir:

- supernodos opt-in
- custodios distribuidos
- relays comunitarios
- nodos especializados verificables

No es aceptable introducir:

- un backend único de entrega
- un directorio central autoritativo
- una cola offline obligatoria controlada por un operador

### 4. Escalabilidad por partición social

La red no debe comportarse como una malla global completa.

Debe explotar que los usuarios reales viven en subgrafos:

- contactos frecuentes
- grupos pequeños o medianos
- comunidades regionales o de afinidad
- overlays temporales para tráfico caliente

---

## Diagnóstico de la Arquitectura Actual

## Fortalezas

### Red P2P real

uPeer ya tiene una base poco común:

- descubrimiento distribuido con Kademlia
- entrega directa entre peers cuando existe conectividad
- almacenamiento offline distribuido mediante vaults
- cifrado y firmas en el plano de mensajería
- identidad local sin servicio de cuentas central

### Buen encaje para redes medianas

La arquitectura actual puede funcionar bien en:

- comunidades técnicas
- redes con usuarios persistentes
- grupos pequeños y medianos
- entornos donde la disponibilidad no necesita SLA estricto

---

## Debilidades de escala

### 1. Exceso de trabajo en el cliente final

Cada cliente hoy participa en demasiadas responsabilidades a la vez:

- transporte
- DHT
- custodia offline
- retries
- fan-out de grupos
- presencia
- sincronización de dispositivos
- almacenamiento local y renderizado

A pequeña escala esto es asumible. A gran escala se traduce en:

- alto consumo de CPU
- memoria más variable
- sobrecoste de red
- mayor sensibilidad a churn
- degradación en dispositivos modestos

### 2. Fan-out de grupos desde el emisor

El patrón actual de grupo consiste, conceptualmente, en cifrar y enviar por miembro.

Esto genera complejidad aproximadamente lineal con el número de miembros para cada mensaje:

- más cifrados
- más paquetes
- más retries
- más posibilidades de estado inconsistente
- más presión sobre el emisor en grupos activos

Este patrón sirve para grupos pequeños, pero no para grupos grandes o masivos.

### 3. Replicación de vault demasiado costosa

Replicar cada entrega a múltiples custodios mejora disponibilidad, pero si se hace de forma demasiado amplia provoca:

- crecimiento fuerte del tráfico de control
- crecimiento del almacenamiento redundante
- hotspots sobre nodos bien reputados
- coste elevado de renovación y consulta

### 4. Presencia demasiado binaria

El estado `connected/offline` es útil en UI, pero a gran escala no refleja bien la realidad:

- peers móviles o intermitentes
- overlays inestables
- direcciones múltiples
- disponibilidad parcial por dispositivo
- nodos alcanzables para vault pero no para chat en tiempo real

La presencia masiva requiere semánticas más suaves:

- alcanzable para entrega
- alcanzable para sesión interactiva
- alcanzable vía custodios
- probablemente disponible
- recientemente visto

### 5. DHT demasiado generalista para tráfico social

Una DHT pura funciona bien para descubrimiento genérico, pero el patrón social real no es uniforme.

En una app de mensajería masiva:

- no todos hablan con todos
- el tráfico se concentra en clusters
- la mayoría de queries útiles son locales al grafo social
- los peers más conocidos se vuelven puntos calientes

La DHT debe seguir existiendo, pero no ser el único mecanismo de localización.

---

## Arquitectura Objetivo: P2P por Capas

La propuesta es evolucionar a cuatro capas lógicas.

## Capa 1: Edge Peers

Son los clientes normales de usuario.

Responsabilidades:

- identidad y claves
- UI
- cifrado E2EE
- contactos y grupos
- cache de rutas y presencia reciente
- fan-out pequeño local

No deberían asumir en grado alto:

- gran custodia de terceros
- routing global frecuente
- replicación masiva
- agregación de overlays grandes

## Capa 2: Custodios Distribuidos

Peers voluntarios con mejor conectividad, uptime y recursos.

Responsabilidades:

- almacenar mensajes offline cifrados
- servir como buzones distribuidos
- responder a consultas de disponibilidad diferida
- actuar como puntos de retransmisión en escenarios de mala conectividad

Características:

- opt-in
- reputación verificable
- límites de cuota
- sin acceso al contenido
- múltiples custodios por identidad, ninguno imprescindible

Esto no centraliza la red: distribuye roles especializados entre múltiples nodos comunitarios.

## Capa 3: Overlays Sociales

Subredes lógicas derivadas del grafo social:

- contactos frecuentes
- grupos
- comunidades activas
- vecindarios de baja latencia

Responsabilidades:

- reducir consultas globales
- acelerar entrega entre miembros frecuentes
- amortiguar fan-out de grupos
- cachear rutas y disponibilidad de corto plazo

La idea es que una gran parte del tráfico se resuelva en overlays locales sin tocar la DHT global.

## Capa 4: DHT Global de Último Recurso

La DHT queda como plano de descubrimiento y recuperación, no como ruta principal de todo.

Responsabilidades:

- bootstrap
- localización cuando falla la cache social
- punteros a custodios
- publicación de capacidad, reputación y roles
- recuperación tras churn o roaming

---

## Correcciones de Arquitectura Recomendadas

## 1. Separar “descubrimiento” de “entrega”

### Problema actual

La localización de un peer y la entrega real están demasiado acopladas.

### Propuesta

Mantener tres planos distintos:

- plano de identidad: quién es el peer
- plano de localización: cómo encontrar rutas/custodios/overlays
- plano de entrega: cómo hacer llegar el mensaje hoy

### Resultado

- menos dependencia del estado `connected`
- mejor tolerancia a churn
- menos queries caras cuando ya existe una ruta válida cacheada

---

## 2. Sustituir fan-out completo por árboles de difusión en grupos

### Problema actual

Cada mensaje de grupo recae demasiado en el emisor.

### Propuesta

Para grupos medianos y grandes:

- construir un árbol o overlay por grupo
- asignar retransmisores temporales por época
- mantener redundancia pequeña, no broadcast total
- usar cifrado por época o clave de grupo con encapsulación por miembro cuando proceda

### Resultado

- coste sublineal para el emisor
- menos paquetes duplicados
- menos saturación del cliente que escribe
- grupos bastante más escalables

### Compatibilidad con E2EE

Se puede mantener E2EE usando:

- claves de grupo rotativas
- firmas por emisor
- rekeying al cambiar miembros
- encapsulación segura de nuevas claves para altas y expulsiones

---

## 3. Vaults por política adaptativa, no por replicación genérica

### Problema actual

Replicar demasiado es caro.

### Propuesta

La política de custodia debe depender de:

- prioridad del mensaje
- reputación del destinatario y su disponibilidad histórica
- tamaño del payload
- tipo de conversación
- cantidad de custodios ya confirmados

### Política sugerida

- mensajes 1:1 normales: 2–4 custodios estables
- grupos: custodios por grupo o por subgrupo, no por mensaje individual indiscriminado
- multimedia: punteros y chunks con TTL y deduplicación agresiva
- mensajes interactivos: preferir entrega directa, vault más selectivo

### Resultado

- menor gasto de red
- menor duplicación de datos
- menor hotspot sobre nodos fiables
- mejor sostenibilidad de almacenamiento

---

## 4. Introducir roles de red sin autoridad central

### Roles sugeridos

#### Relay comunitario

Nodo con buena conectividad que puede reenviar tráfico opaco cuando dos peers no se alcanzan bien.

#### Custodio

Nodo que almacena mensajes cifrados offline.

#### Bootstrap comunitario

Nodo conocido que ayuda a entrar en la red, pero no controla identidad ni mensajes.

#### Indexador de proximidad

Nodo que mantiene caches parciales de overlays o proximidad social, sin ser fuente única de verdad.

### Condiciones

- roles voluntarios
- múltiples operadores
- reputación pública
- verificabilidad criptográfica
- degradación elegante si desaparecen

---

## 5. Presencia probabilística y por capacidad

### Problema actual

`connected` sugiere más certeza de la que existe.

### Propuesta

Modelar presencia como capacidades observadas:

- `interactive-reachable`
- `deliverable-via-direct`
- `deliverable-via-custodian`
- `recently-seen`
- `multi-device-partial`

### Resultado

- menos falsas expectativas en UI
- menos lógica optimista de entrega
- mejor selección de ruta según contexto

---

## 6. Cache social y rutas calientes

### Problema actual

Mucho tráfico termina consultando mecanismos globales antes de explotar locality.

### Propuesta

Mantener caches activas por:

- conversaciones recientes
- miembros de grupo
- custodios recientes válidos
- relays exitosos
- rutas con baja latencia histórica

Con expiración corta y verificación de firma.

### Resultado

- menor presión sobre la DHT
- menor latencia de primer mensaje tras reconexión
- mejor comportamiento bajo churn moderado

---

## 7. Punteros compactos para multimedia y adjuntos

### Problema actual

El contenido rico y sus previews pueden disparar tamaño, retries y presión de almacenamiento.

### Propuesta

Usar arquitectura por referencias:

- mensaje ligero con metadatos mínimos
- preview compacta y degradable
- chunks direccionados por hash
- deduplicación por contenido
- múltiples custodios por chunk solo cuando el valor lo justifique

### Resultado

- menos presión sobre el plano de mensajería
- mejor resiliencia con archivos grandes
- menor coste de retransmisión

---

## 8. Limitar el plano de control global

### Problema actual

La red puede ahogarse en heartbeats, DHT y consultas de vault.

### Propuesta

Aplicar presupuestos explícitos por nodo:

- ancho de banda para control
- número de queries paralelas
- número de custodias aceptadas
- tamaño máximo de tablas y caches activas
- priorización por conversación activa y reputación

### Resultado

- menos tormentas de control
- mejor estabilidad en churn alto
- mejor previsibilidad de consumo

---

## 9. Reputación orientada a capacidad, no solo confianza social

### Problema actual

La reputación social sirve contra abuso, pero no basta para decidir rol de infraestructura.

### Propuesta

Separar reputación en dos ejes:

- confianza social y autenticidad
- calidad operativa de nodo

Métricas operativas:

- uptime observado
- latencia
- ratio de entrega
- cumplimiento de custodia
- fiabilidad de relay
- consumo de cuota y comportamiento bajo carga

### Resultado

- mejor selección de custodios y relays
- menos sobrecarga sobre peers incorrectos
- mayor estabilidad de la red distribuida

---

## 10. Escalabilidad por comunidades federadas sin federación centralizada

### Idea

La red puede seguir siendo P2P y a la vez segmentarse por dominios sociales:

- comunidades locales
- colectivos técnicos
- nodos regionales
- redes de confianza

Cada comunidad aporta peers, custodios y bootstrap, pero todos hablan el mismo protocolo y ninguna comunidad controla el sistema completo.

### Resultado

- mejor bootstrap
- mejor locality
- menos dependencia de una malla global uniforme
- mayor capacidad de crecer por agregación de subredes

---

## Qué Haría Primero

## Fase 1 — Escalabilidad sin romper compatibilidad

1. cache de rutas y custodios calientes
2. presencia por capacidad en vez de binaria
3. política adaptativa de vault más agresiva contra duplicación
4. límites de presupuesto de control
5. compresión y degradación sistemática de previews y avatares

## Fase 2 — Escalabilidad de grupos

1. overlays por grupo
2. árbol de difusión por época
3. rekeying eficiente de grupo
4. roles de retransmisión para grupos medianos/grandes

## Fase 3 — Escalabilidad de infraestructura distribuida

1. custodios opt-in con reputación operativa
2. relays comunitarios opacos
3. bootstrap multi-fuente estable
4. publicación distribuida de capacidades de nodo

## Fase 4 — Escala masiva no centralizada

1. overlays sociales autoorganizados
2. comunidades interoperables
3. cuotas y mercados/incentivos de custodia
4. analítica descentralizada de salud de red

---

## Qué No Haría

Para mantener la esencia P2P, no recomendaría:

- introducir un backend central de entrega offline
- convertir la DHT en un servicio operado por una sola entidad
- delegar grupos grandes a un servidor coordinador fijo
- almacenar claves o identidad fuera del dispositivo del usuario
- depender de push centralizado como mecanismo principal de entrega

---

## Conclusión

uPeer puede escalar mucho más sin centralizar, pero necesita dejar de ser una red P2P plana.

La clave no es abandonar el P2P, sino hacerlo más estructurado:

- peers normales en el borde
- custodios distribuidos
- relays voluntarios
- overlays sociales
- DHT como red de recuperación y coordinación, no como única autopista

La esencia P2P se mantiene si:

- no hay nodo imprescindible
- no hay autoridad única
- el cifrado sigue siendo extremo a extremo
- los roles son abiertos, verificables y sustituibles

Ese es el camino realista para acercarse a escala masiva sin convertirse en un sistema centralizado disfrazado.
