#!/usr/bin/env python3
"""
Auditoría de privacidad para upeer P2P.
Verifica que los mensajes no contengan información sensible de contactos.
"""

import json
import sys
import re
from typing import Dict, List, Tuple

class PrivacyAuditor:
    """Auditor de privacidad para mensajes upeer."""
    
    # Campos prohibidos que NUNCA deben aparecer en mensajes
    FORBIDDEN_KEYS = [
        'contactCache',
        'contacts',
        'cachedContacts',
        'contactList',
        'addressBook',
        'friendList'
    ]
    
    # Patrones de datos sensibles (expresiones regulares)
    SENSITIVE_PATTERNS = [
        r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',  # IPv4
        r'\b[a-f0-9:]+(:[a-f0-9:]+)+\b',  # IPv6 (simplificado)
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',  # Emails
        r'\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})\b',  # Teléfonos
    ]
    
    def __init__(self):
        self.violations = []
        self.messages_audited = 0
        self.messages_clean = 0
        
    def audit_message(self, message: Dict) -> Tuple[bool, List[str]]:
        """
        Audita un mensaje JSON.
        Retorna (es_válido, lista_de_violaciones).
        """
        self.messages_audited += 1
        violations = []
        
        # 1. Verificar campos prohibidos
        for key in self.FORBIDDEN_KEYS:
            if self._key_in_dict(key, message):
                violations.append(f"Campo prohibido '{key}' encontrado")
        
        # 2. Verificar patrones sensibles en valores de texto
        message_str = json.dumps(message)
        for pattern in self.SENSITIVE_PATTERNS:
            matches = re.findall(pattern, message_str)
            if matches:
                violations.append(f"Patrón sensible '{pattern}' encontrado: {matches[:3]}")
        
        # 3. Verificar estructura de mensaje upeer esperada
        expected_types = ['CHAT', 'DHT_UPDATE', 'DHT_QUERY', 'DHT_RESPONSE', 
                         'DHT_EXCHANGE', 'PING', 'PONG', 'HANDSHAKE_REQ', 
                         'HANDSHAKE_ACCEPT', 'CHAT_REACTION', 'CHAT_UPDATE', 
                         'CHAT_DELETE', 'RENEWAL_TOKEN', 'RENEWAL_REQUEST',
                         'RENEWAL_RESPONSE']
        
        # Tipos de comandos internos que pueden aparecer en logs pero no son mensajes de protocolo
        internal_commands = ['SEND_CHAT', 'PROCESS_COMMAND', 'HEARTBEAT', 'METRICS']
        
        msg_type = message.get('type')
        if msg_type and msg_type not in expected_types:
            # Ignorar comandos internos que no son mensajes de protocolo
            if msg_type not in internal_commands:
                violations.append(f"Tipo de mensaje desconocido: '{msg_type}'")
        
        # 4. Verificar que los mensajes CHAT no tengan campos de contacto
        if msg_type == 'CHAT':
            forbidden_in_chat = ['contactCache', 'contacts', 'addressBook']
            for key in forbidden_in_chat:
                if self._key_in_dict(key, message):
                    violations.append(f"Mensaje CHAT contiene campo de contacto: '{key}'")
        
        if not violations:
            self.messages_clean += 1
            return True, []
        
        self.violations.extend(violations)
        return False, violations
    
    def _key_in_dict(self, key: str, d: Dict) -> bool:
        """Busca recursivamente una clave en un diccionario."""
        if key in d:
            return True
        
        for value in d.values():
            if isinstance(value, dict):
                if self._key_in_dict(key, value):
                    return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        if self._key_in_dict(key, item):
                            return True
        
        return False
    
    def get_stats(self) -> Dict:
        """Retorna estadísticas de auditoría."""
        total = self.messages_audited
        clean = self.messages_clean
        dirty = total - clean
        
        return {
            'messages_audited': total,
            'messages_clean': clean,
            'messages_with_violations': dirty,
            'clean_rate': (clean / total * 100) if total > 0 else 100.0,
            'total_violations': len(self.violations),
            'violations_by_type': self._count_violations_by_type()
        }
    
    def _count_violations_by_type(self) -> Dict:
        """Agrupa violaciones por tipo."""
        counts = {}
        for violation in self.violations:
            # Extraer tipo de violación
            if 'Campo prohibido' in violation:
                key = 'forbidden_fields'
            elif 'Patrón sensible' in violation:
                key = 'sensitive_patterns'
            elif 'Tipo de mensaje' in violation:
                key = 'unknown_message_types'
            elif 'Mensaje CHAT' in violation:
                key = 'chat_contact_fields'
            else:
                key = 'other'
            
            counts[key] = counts.get(key, 0) + 1
        
        return counts
    
    def print_report(self):
        """Imprime un reporte de auditoría."""
        stats = self.get_stats()
        
        print("\n" + "="*60)
        print("📊 REPORTE DE AUDITORÍA DE PRIVACIDAD upeer")
        print("="*60)
        print(f"Mensajes auditados: {stats['messages_audited']}")
        print(f"Mensajes limpios: {stats['messages_clean']} ({stats['clean_rate']:.1f}%)")
        print(f"Mensajes con violaciones: {stats['messages_with_violations']}")
        print(f"Total violaciones: {stats['total_violations']}")
        
        if stats['violations_by_type']:
            print("\n🔍 Violaciones por tipo:")
            for violation_type, count in stats['violations_by_type'].items():
                print(f"  - {violation_type}: {count}")
        
        if self.violations:
            print("\n🚫 Violaciones encontradas (primeras 10):")
            for i, violation in enumerate(self.violations[:10]):
                print(f"  {i+1}. {violation}")
            
            if len(self.violations) > 10:
                print(f"  ... y {len(self.violations) - 10} más")
        
        print("="*60)
        
        if stats['clean_rate'] == 100.0:
            print("✅ ¡TODOS LOS MENSAJES CUMPLEN CON LA PRIVACIDAD!")
        elif stats['clean_rate'] >= 95.0:
            print("⚠️  Alerta: Se encontraron algunas violaciones menores")
        else:
            print("❌ CRÍTICO: Múltiples violaciones de privacidad detectadas")


def audit_log_file(log_file_path: str):
    """Audita un archivo de log con mensajes JSON."""
    auditor = PrivacyAuditor()
    
    try:
        with open(log_file_path, 'r') as f:
            log_content = f.read()
            
        # Buscar todos los JSON y diccionarios Python en el archivo completo
        import re
        import ast
        
        # Patrón para encontrar estructuras similares a JSON/diccionarios
        dict_pattern = r'\{[^{}]*\}(?=\s*\{|\s*$)'
        dict_matches = re.findall(dict_pattern, log_content, re.DOTALL)
        
        for dict_str in dict_matches:
            try:
                # Limpiar el string
                dict_str = dict_str.strip()
                if not dict_str.startswith('{'):
                    continue
                
                # Primero intentar como JSON
                try:
                    # Convertir comillas simples a dobles para JSON
                    json_str = dict_str.replace("'", '"')
                    message = json.loads(json_str)
                    auditor.audit_message(message)
                    continue
                except json.JSONDecodeError:
                    pass
                
                # Luego intentar como diccionario Python con ast.literal_eval
                try:
                    message = ast.literal_eval(dict_str)
                    if isinstance(message, dict):
                        auditor.audit_message(message)
                except (SyntaxError, ValueError):
                    pass
                
                # Finalmente intentar extraer el contenido entre { y }
                try:
                    start = dict_str.find('{')
                    end = dict_str.rfind('}') + 1
                    if start >= 0 and end > start:
                        clean_str = dict_str[start:end]
                        # Intentar como JSON con comillas convertidas
                        json_str = clean_str.replace("'", '"')
                        message = json.loads(json_str)
                        auditor.audit_message(message)
                except:
                    continue
            except Exception as e:
                print(f"Error procesando diccionario: {e}")
                continue
        
        # También buscar mensajes en formato de log común
        # Ejemplo: [Bot_alice] RECIBIDO [CHAT] de 203:6a69:417a:387d:54b8:eeb0:39d:efb8
        log_pattern = r'\[.*?\]\s*(RECIBIDO|Enviando)\s*\[(.*?)\]'
        log_matches = re.findall(log_pattern, log_content)
        
        for action, msg_type in log_matches:
            # Crear un mensaje mínimo para tracking
            message = {"type": msg_type, "action": action}
            auditor.audit_message(message)
        
        auditor.print_report()
        return auditor.get_stats()['clean_rate'] == 100.0
    
    except FileNotFoundError:
        print(f"❌ Archivo no encontrado: {log_file_path}")
        return False


def main():
    """Función principal."""
    if len(sys.argv) != 2:
        print("Uso: python privacy_auditor.py <archivo_log>")
        print("Ejemplo: python privacy_auditor.py /tmp/p2p_shared/node1.log")
        sys.exit(1)
    
    log_file = sys.argv[1]
    print(f"🔍 Auditing {log_file}...")
    
    success = audit_log_file(log_file)
    
    if success:
        print("\n✅ Auditoría completada sin violaciones de privacidad")
        sys.exit(0)
    else:
        print("\n❌ Se encontraron violaciones de privacidad")
        sys.exit(1)


if __name__ == "__main__":
    main()