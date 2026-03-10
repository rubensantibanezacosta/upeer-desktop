# Diseño: Sistema de Renewal Tokens para upeer

## 📋 Contexto y Problema

Tras la eliminación de `contactCache` en upeer (Fase 14), los nodos ya no almacenan localmente información de contactos. Esto mejora la privacidad pero introduce un problema de **persistencia a largo plazo**:

- Los location blocks en DHT tienen TTL (30 días por diseño)
- Si un nodo está offline por más de 30 días, su location block expira
- Sin contactCache, otros nodos no pueden redescubrirlo tras la expiración
- Esto podría causar **pérdida permanente de contactos** tras ausencias prolongadas

## 🎯 Objetivo del Sistema de Renewal Tokens

Implementar un mecanismo de **renovación delegada** que permita:

1. **Renovación por terceros**: Nodos de confianza pueden renovar location blocks durante ausencias
2. **Límites de seguridad**: Prevenir abusos y ataques de denegación de servicio
3. **Auto-renovación**: Renovación automática propia cuando el nodo está activo
4. **Privacidad preservada**: No revelar información adicional sobre el grafo social

## 🔧 Diseño Técnico

### 1. Estructura del Renewal Token

```typescript
interface RenewalToken {
  // Identificación
  targetId: string; // upeer ID del nodo cuyo block se puede renovar
  authorizedBy: string; // ID del nodo que crea el token (el propio nodo target)

  // Límites de seguridad
  allowedUntil: number; // Timestamp máximo (targetId + 60 días)
  maxRenewals: number; // Máximo de renovaciones permitidas (3)
  renewalsUsed: number; // Contador de renovaciones realizadas (0 inicial)

  // Verificación criptográfica
  signature: string; // Firma Ed25519 de authorizedBy sobre el token

  // Metadata opcional
  createdAt: number; // Timestamp de creación
  lastRenewalAt?: number; // Timestamp de última renovación
  renewedBy?: string[]; // IDs de nodos que han realizado renovaciones
}
```

### 2. Flujo de Operación

#### 2.1 Generación de Tokens (Nodo Propietario)

```typescript
// Cuando un nodo está activo y anticipa una posible ausencia
function createRenewalToken(
  targetId: string,
  signerPrivateKey: Ed25519PrivateKey,
): RenewalToken {
  const token: RenewalToken = {
    targetId,
    authorizedBy: targetId, // El propio nodo se autoriza
    allowedUntil: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 días
    maxRenewals: 3,
    renewalsUsed: 0,
    createdAt: Date.now(),
    signature: "", // Firma calculada
  };

  token.signature = signData(token, signerPrivateKey);
  return token;
}
```

#### 2.2 Distribución de Tokens

- **Almacenamiento en DHT**: Token almacenado con clave `renewal:<targetId>:<hash(token)>`
- **Compartir con contactos de confianza**: Enviar token a nodos específicos vía mensaje cifrado
- **Renovación automática**: Incluir token en location block para descubrimiento

#### 2.3 Renovación Delegada (Nodo Amigo)

```typescript
async function renewLocationBlock(
  token: RenewalToken,
  renewerId: string,
): Promise<boolean> {
  // 1. Verificar token
  if (!verifyToken(token)) return false;

  // 2. Verificar límites
  if (token.renewalsUsed >= token.maxRenewals) return false;
  if (Date.now() > token.allowedUntil) return false;

  // 3. Crear nuevo location block
  const newBlock = createLocationBlock(token.targetId, {
    address: getCurrentAddress(token.targetId), // Necesita descubrir IP actual
    dhtSeq: getNextSequence(token.targetId),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 días
  });

  // 4. Publicar en DHT
  await publishToDHT(newBlock);

  // 5. Actualizar contador
  token.renewalsUsed++;
  token.lastRenewalAt = Date.now();
  token.renewedBy = [...(token.renewedBy || []), renewerId];

  // 6. Actualizar token en DHT (opcional)
  await updateTokenInDHT(token);

  return true;
}
```

#### 2.4 Auto-Renovación (Threshold de 3 días)

```typescript
// Monitoreo periódico de expiración propia
function checkAutoRenewal(myId: string, myLocationBlock: LocationBlock) {
  const daysUntilExpiry =
    (myLocationBlock.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);

  if (daysUntilExpiry <= 3) {
    // Renovar automáticamente
    renewOwnLocationBlock(myId);
  }
}
```

### 3. Almacenamiento en DHT

#### Claves DHT para Renewal Tokens

- `renewal:<targetId>:<tokenHash>` - Token individual
- `renewals:<targetId>` - Lista de tokens activos (opcional)

#### Políticas de Almacenamiento

- **TTL de token**: 70 días (10 días más que allowedUntil)
- **Replicación**: K=8 nodos más cercanos a `targetId`
- **Actualización**: Solo `authorizedBy` puede actualizar token

### 4. Mecanismos de Seguridad

#### 4.1 Verificación de Tokens

```typescript
function verifyToken(token: RenewalToken): boolean {
  // 1. Verificar firma
  const isValidSig = verifySignature(token, token.authorizedBy);
  if (!isValidSig) return false;

  // 2. Verificar que authorizedBy es el targetId
  if (token.authorizedBy !== token.targetId) return false;

  // 3. Verificar timestamps
  if (token.createdAt > Date.now()) return false; // Token futuro
  if (token.allowedUntil < Date.now()) return false; // Token expirado

  // 4. Verificar límites de renovación
  if (token.renewalsUsed > token.maxRenewals) return false;

  return true;
}
```

#### 4.2 Prevención de Abusos

- **Rate limiting**: Máximo 1 renovación por token cada 7 días
- **Reputación social**: Solo nodos con alta reputación pueden renovar múltiples tokens
- **Monitoreo**: Alertas por uso anómalo de tokens

#### 4.3 Recuperación ante Compromiso

- **Revocación**: Nodo propietario puede revocar tokens publicando revocación firmada
- **Rotación**: Generar nuevos tokens y marcar anteriores como obsoletos
- **Auditoría**: Logs de renovaciones accesibles al propietario

## 📊 Escenarios de Uso

### Escenario 1: Vacaciones de 35 días

- **Día 0**: Usuario genera renewal token, lo comparte con 3 amigos
- **Día 1-34**: Usuario offline
- **Día 25**: Amigo 1 renueva location block (dentro de los 30 días iniciales)
- **Día 35**: Usuario regresa, sigue descubrible gracias a renovación

### Escenario 2: Nodo siempre activo

- **Cada 27 días**: Auto-renovación automática (threshold 3 días)
- **Sin intervención manual**: Sistema mantiene disponibilidad continua
- **Tokens de emergencia**: Generados pero no utilizados

### Escenario 3: Pérdida permanente de nodo

- **Día 0-30**: Location block activo
- **Día 31-60**: Posibles renovaciones por amigos (hasta 3)
- **Día 61+**: Block expira definitivamente, nodo marcado como "probablemente offline"
- **Recuperación**: Nodo debe re-publicar manualmente al regresar

## 🧪 Plan de Testing

### Test 1: Funcionalidad Básica

- Generación y verificación de tokens
- Renovación delegada exitosa
- Respeto de límites (maxRenewals)

### Test 2: Seguridad

- Token rechazado con firma inválida
- Token rechazado después de maxRenewals
- Token rechazado después de allowedUntil

### Test 3: Integración con DHT

- Almacenamiento y recuperación de tokens desde DHT
- Actualización de contadores
- Expiración automática de tokens

### Test 4: Escenarios del Mundo Real

- Simulación de 60 días con aceleración temporal
- Red de 10 nodos con ausencias rotativas
- Métricas de éxito de renovación

## 📈 Métricas de Éxito

| Métrica                                       | Objetivo              |
| --------------------------------------------- | --------------------- |
| Tasa de éxito de renovación                   | >95%                  |
| Tiempo medio de rediscovery post-renovación   | <60 segundos          |
| False positives (renovaciones no autorizadas) | 0%                    |
| Cobertura de nodos con tokens de respaldo     | >80% de nodos activos |
| Overhead de almacenamiento DHT                | <5% del total         |

## 🔄 Integración con Sistema Existente

### Módulos a Modificar

1. **DHT Manager**: Soporte para almacenar/recuperar renewal tokens
2. **Location Block Manager**: Lógica de auto-renovación (threshold 3 días)
3. **Protocol Handler**: Nuevos tipos de mensaje `RENEWAL_TOKEN` y `RENEWAL_REQUEST`
4. **UI/UX**: Interfaz para gestionar tokens (generar, revocar, monitorear)

### Compatibilidad con Versiones Anteriores

- **Fallback graceful**: Nodos sin soporte de renewal tokens funcionan normalmente
- **Descubrimiento progresivo**: Tokens solo compartidos con nodos que los soporten
- **Migración automática**: Nodos antiguos pueden ignorar mensajes de renewal

## 🚀 Plan de Implementación

### Fase 1: Core (2 semanas)

- Estructuras de datos y funciones básicas
- Generación y verificación de tokens
- Integración con sistema de firmas existente

### Fase 2: DHT Integration (1 semana)

- Almacenamiento de tokens en DHT
- Recuperación y actualización
- Políticas de expiración y replicación

### Fase 3: Protocolo (1 semana)

- Mensajes `RENEWAL_TOKEN` y `RENEWAL_REQUEST`
- Handshake para negociar soporte
- Integración con flujo de mensajería existente

### Fase 4: UI y UX (1 semana)

- Interfaz para gestión de tokens
- Notificaciones de renovación
- Monitoreo de estado de tokens

### Fase 5: Testing Extenso (2 semanas)

- Tests unitarios y de integración
- Simulaciones de largo plazo
- Pruebas de seguridad y resistencia

## ⚠️ Consideraciones de Seguridad

### Riesgos Identificados

1. **Ataque de denegación de servicio**: Atacante gasta todas las renovaciones de un token
   - **Mitigación**: Rate limiting por token (1 renovación/7 días)
2. **Token theft**: Robo de token permite renovaciones no autorizadas
   - **Mitigación**: Tokens cifrados para amigos específicos
3. **Sybil attacks**: Creación de múltiples identidades para abusar de renovaciones
   - **Mitigación**: Integración con sistema de reputación social

### Decisiones de Diseño Clave

1. **Autorrestricción**: Solo el nodo propietario puede crear tokens para sí mismo
2. **Transitividad no permitida**: Un token no puede ser usado para crear otro token
3. **Auditabilidad completa**: Todas las renovaciones son registradas y verificables
4. **Privacidad por diseño**: Tokens no revelan información del grafo social a terceros

## 📋 Checklist de Implementación

- [ ] Estructuras TypeScript para RenewalToken
- [ ] Funciones de generación y verificación
- [ ] Almacenamiento en DHT
- [ ] Protocolo de mensajes
- [ ] Lógica de auto-renovación (threshold 3 días)
- [ ] Integración con sistema de reputación
- [ ] UI para gestión de tokens
- [ ] Tests unitarios
- [ ] Tests de integración con Docker
- [ ] Documentación para desarrolladores
- [ ] Documentación para usuarios finales

---

**Última actualización**: 5 de marzo de 2026  
**Autor**: Agente de Validación upeer  
**Estado**: Diseño aprobado para implementación en Fase 15
