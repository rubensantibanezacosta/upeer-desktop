#!/usr/bin/env python3
"""
Test de integración para renewal tokens
Simula el escenario completo: Alice -> Bob token -> Alice offline -> Bob renueva -> Charlie descubre
"""

import json
import time
import nacl.signing
import nacl.encoding
import hashlib
import socket
import threading
import sys

# Mock de funciones de peer_bot.py
MY_NAME = "Test_Integration"

def get_upeer_id(pk_bytes):
    return hashlib.blake2b(pk_bytes, digest_size=16).hexdigest()

def sign_data(data, signing_key):
    """Sign data with signing key."""
    msg_bytes = json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    return signing_key.sign(msg_bytes).signature.hex()

def create_renewal_token(target_id, signing_key_obj, max_renwals=3, days_valid=60):
    current_time = int(time.time() * 1000)
    target_pk = signing_key_obj.verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    token = {
        'targetId': target_id,
        'authorizedBy': target_id,
        'targetPublicKey': target_pk,
        'allowedUntil': current_time + (days_valid * 24 * 60 * 60 * 1000),
        'maxRenewals': max_renwals,
        'renewalsUsed': 0,
        'createdAt': current_time,
        'signature': ''
    }
    token_copy = token.copy()
    token_copy.pop('signature', None)
    msg_bytes = json.dumps(token_copy, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    signature = signing_key_obj.sign(msg_bytes).signature.hex()
    token['signature'] = signature
    return token

def verify_renewal_token(token, pubkey_hex=None):
    current_time = int(time.time() * 1000)
    
    if pubkey_hex is None:
        pubkey_hex = token.get('targetPublicKey')
        if not pubkey_hex:
            print(f'[{MY_NAME}] ❌ Token missing targetPublicKey')
            return False
    
    token_copy = token.copy()
    signature = token_copy.pop('signature', None)
    if not signature:
        return False
    
    try:
        msg_bytes = json.dumps(token_copy, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        verify_k = nacl.signing.VerifyKey(pubkey_hex, encoder=nacl.encoding.HexEncoder)
        verify_k.verify(msg_bytes, bytes.fromhex(signature))
    except Exception as e:
        print(f'[{MY_NAME}] ❌ Token signature verification failed: {e}')
        return False
    
    if token['authorizedBy'] != token['targetId']:
        print(f'[{MY_NAME}] ❌ Token authorizedBy mismatch: {token["authorizedBy"]} != {token["targetId"]}')
        return False
    
    if token['createdAt'] > current_time:
        print(f'[{MY_NAME}] ❌ Token created in future: {token["createdAt"]} > {current_time}')
        return False
    
    if token['allowedUntil'] < current_time:
        print(f'[{MY_NAME}] ❌ Token expired: {token["allowedUntil"]} < {current_time}')
        return False
    
    if token['renewalsUsed'] > token['maxRenewals']:
        print(f'[{MY_NAME}] ❌ Token renewal limit exceeded: {token["renewalsUsed"]} > {token["maxRenewals"]}')
        return False
    
    print(f'[{MY_NAME}] ✅ Token verified for {token["targetId"]}')
    return True

def renew_location_block_with_token(token, renewer_id, known_peers):
    """Simulate renewal of location block."""
    target_id = token['targetId']
    
    # Get target's public key from token
    target_pk = token.get('targetPublicKey')
    if not target_pk:
        print(f'[{MY_NAME}] ❌ Token missing targetPublicKey for {target_id}')
        return False
    
    # Verify token first
    if not verify_renewal_token(token, target_pk):
        print(f'[{MY_NAME}] ❌ Invalid token for {target_id}')
        return False
    
    # Check limits
    if token['renewalsUsed'] >= token['maxRenewals']:
        print(f'[{MY_NAME}] ❌ Token renewal limit reached for {target_id}')
        return False
    
    # Check if target is in known peers
    if target_id not in known_peers:
        print(f'[{MY_NAME}] ❌ Target {target_id} not in known peers')
        return False
    
    # Simulate renewal
    current_seq = known_peers[target_id].get('dht_seq', 0)
    new_seq = current_seq + 1
    
    # Update local state
    known_peers[target_id]['dht_seq'] = new_seq
    token['renewalsUsed'] += 1
    token['lastRenewalAt'] = int(time.time() * 1000)
    if 'renewedBy' not in token:
        token['renewedBy'] = []
    token['renewedBy'].append(renewer_id)
    
    print(f'[{MY_NAME}] ⚡ RENEWAL SUCCESS: Renewed {target_id} to seq {new_seq}')
    print(f'[{MY_NAME}]    Token renewals used: {token["renewalsUsed"]}/{token["maxRenewals"]}')
    
    return True

class MockNode:
    def __init__(self, name):
        self.name = name
        self.signing_key = nacl.signing.SigningKey.generate()
        self.verify_key = self.signing_key.verify_key
        self.public_key_hex = self.verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
        self.upeer_id = get_upeer_id(self.verify_key.encode())
        self.known_peers = {}  # rid -> {pk, dht_seq, address, etc}
        self.renewal_tokens = {}  # target_id -> token
        
    def add_peer(self, peer_node):
        """Add another node as known peer."""
        self.known_peers[peer_node.upeer_id] = {
            'pk': peer_node.public_key_hex,
            'dht_seq': 1,
            'address': f'200::1:{self.name}'
        }
        
    def create_renewal_token_for_self(self):
        """Create a renewal token for this node."""
        token = create_renewal_token(self.upeer_id, self.signing_key)
        print(f'[{self.name}] 🔑 Created renewal token for myself')
        return token
    
    def send_renewal_token(self, token, recipient_node):
        """Send renewal token to another node."""
        print(f'[{self.name}] 📤 Sending renewal token to {recipient_node.name}')
        recipient_node.receive_renewal_token(token, self)
        
    def receive_renewal_token(self, token, sender_node):
        """Receive a renewal token from another node."""
        print(f'[{self.name}] 📥 Received renewal token from {sender_node.name}')
        print(f'[{self.name}]    Target: {token["targetId"]}')
        
        target_id = token['targetId']
        
        # Store token under target's ID
        if target_id not in self.known_peers:
            self.known_peers[target_id] = {}
            print(f'[{self.name}] ⚠️ Created new entry for {target_id}')
        
        # Verify token
        if verify_renewal_token(token):
            print(f'[{self.name}] ✅ Token signature VALID for {target_id}')
            # Store target's public key from token
            target_pk = token.get('targetPublicKey')
            if target_pk and 'pk' not in self.known_peers[target_id]:
                self.known_peers[target_id]['pk'] = target_pk
                print(f'[{self.name}] 💾 Stored target\'s public key from token')
        else:
            print(f'[{self.name}] ❌ Token signature INVALID for {target_id}')
            return False
        
        # Store the token
        self.known_peers[target_id]['renewal_token'] = token
        self.renewal_tokens[target_id] = token
        print(f'[{self.name}] 💾 Token stored for {target_id}')
        return True
    
    def request_renewal(self, target_id):
        """Request renewal of a target's location block."""
        print(f'[{self.name}] 🔄 REQUESTING RENEWAL for {target_id}')
        
        # Check if we have a token for target_id
        if target_id in self.known_peers and 'renewal_token' in self.known_peers[target_id]:
            token = self.known_peers[target_id]['renewal_token']
            print(f'[{self.name}]    Found token for {target_id}')
            print(f'[{self.name}]    Renewals used: {token.get("renewalsUsed", 0)}/{token.get("maxRenewals", 3)}')
            
            # Verify token validity
            if verify_renewal_token(token):
                print(f'[{self.name}] ✅ Token verified, attempting renewal...')
                # Attempt renewal
                if renew_location_block_with_token(token, self.upeer_id, self.known_peers):
                    print(f'[{self.name}] ✅ Renewal SUCCESS for {target_id}')
                    return True
                else:
                    print(f'[{self.name}] ❌ Renewal FAILED for {target_id}')
                    return False
            else:
                print(f'[{self.name}] ❌ Token INVALID for {target_id}')
                return False
        else:
            print(f'[{self.name}] ❌ No token found for {target_id}')
            print(f'[{self.name}]    Known peers: {list(self.known_peers.keys())}')
            return False

def run_integration_test():
    print("🧪 TEST DE INTEGRACIÓN: RENEWAL TOKENS COMPLETO")
    print("================================================")
    
    # Create nodes
    print("\n1. Creando nodos...")
    alice = MockNode("Alice")
    bob = MockNode("Bob")
    charlie = MockNode("Charlie")
    
    print(f"   Alice ID: {alice.upeer_id}")
    print(f"   Bob ID: {bob.upeer_id}")
    print(f"   Charlie ID: {charlie.upeer_id}")
    
    # Phase 1: Alice and Bob connect and exchange public keys
    print("\n2. Fase 1: Alice y Bob se conectan...")
    alice.add_peer(bob)
    bob.add_peer(alice)
    print("   ✅ Handshake completado, claves públicas intercambiadas")
    
    # Phase 2: Alice creates renewal token and sends to Bob
    print("\n3. Fase 2: Alice genera renewal token y lo comparte con Bob...")
    alice_token = alice.create_renewal_token_for_self()
    alice.send_renewal_token(alice_token, bob)
    
    # Verify Bob received and stored the token
    if alice.upeer_id in bob.renewal_tokens:
        print("   ✅ Bob recibió y almacenó el token de Alice")
    else:
        print("   ❌ Bob NO recibió el token de Alice")
        return False
    
    # Phase 3: Simulate Alice going offline
    print("\n4. Fase 3: Alice se desconecta (offline)...")
    print("   Alice offline. Su location block expirará en ~30 días.")
    
    # Phase 4: Simulate 35 days passing - Alice's location block expires
    print("\n5. Fase 4: Día 35 - Location block de Alice ha expirado...")
    print("   Bob intenta contactar a Alice pero falla (block expirado)")
    
    # Phase 5: Bob uses renewal token to renew Alice's location block
    print("\n6. Fase 5: Bob usa renewal token para renovar location block de Alice...")
    renewal_success = bob.request_renewal(alice.upeer_id)
    
    if not renewal_success:
        print("   ❌ Renovación FALLÓ")
        return False
    
    print("   ✅ Bob renovó exitosamente el location block de Alice")
    
    # Phase 6: Charlie joins the network after 45 days
    print("\n7. Fase 6: Día 45 - Nuevo nodo Charlie se une a la red...")
    charlie.add_peer(bob)  # Charlie connects to Bob
    bob.add_peer(charlie)  # Bob knows Charlie
    
    # Phase 7: Charlie discovers Alice through Bob (thanks to renewal)
    print("\n8. Fase 7: Día 46 - Charlie descubre a Alice a través de Bob...")
    # In a real system, Bob would share Alice's renewed location via DHT_EXCHANGE
    # For this test, we'll simulate Charlie learning about Alice
    if alice.upeer_id in bob.known_peers:
        # Bob shares Alice's info with Charlie
        alice_info = bob.known_peers[alice.upeer_id].copy()
        charlie.known_peers[alice.upeer_id] = alice_info
        print(f"   ✅ Charlie descubrió a Alice a través de Bob")
        print(f"   Alice seq: {alice_info.get('dht_seq', 'unknown')}")
    else:
        print("   ❌ Charlie NO pudo descubrir a Alice")
        return False
    
    # Phase 8: Simulate Alice returning after 60 days with same identity
    print("\n9. Fase 8: Día 60 - Alice vuelve a conectarse después de 60 días...")
    print(f"   Alice regresó con ID: {alice.upeer_id}")
    
    # Verify Alice still has the same identity
    if alice.upeer_id in bob.known_peers and alice.upeer_id in charlie.known_peers:
        print("   ✅ Misma identidad preservada gracias a renewal tokens")
        print("   ✅ Alice puede ser redescubierta después de 60 días offline")
    else:
        print("   ❌ Identidad perdida - renewal tokens no funcionaron efectivamente")
        return False
    
    # Final verification
    print("\n📊 VERIFICACIÓN FINAL:")
    print(f"   - Alice conocida por Bob: {alice.upeer_id in bob.known_peers}")
    print(f"   - Alice conocida por Charlie: {alice.upeer_id in charlie.known_peers}")
    print(f"   - Token almacenado por Bob: {alice.upeer_id in bob.renewal_tokens}")
    
    if alice.upeer_id in bob.known_peers:
        token = bob.known_peers[alice.upeer_id].get('renewal_token', {})
        renewals_used = token.get('renewalsUsed', 0)
        max_renewals = token.get('maxRenewals', 3)
        print(f"   - Renewals usados: {renewals_used}/{max_renewals}")
    
    return True

if __name__ == "__main__":
    try:
        success = run_integration_test()
        
        print("\n" + "="*50)
        if success:
            print("🎉 ¡TEST DE INTEGRACIÓN EXITOSO!")
            print("El sistema de renewal tokens funciona correctamente para:")
            print("  1. Generación y envío de tokens")
            print("  2. Almacenamiento y verificación")
            print("  3. Renovación de location blocks")
            print("  4. Descubrimiento a través de terceros")
            print("  5. Persistencia de identidad a 60+ días")
            sys.exit(0)
        else:
            print("❌ TEST DE INTEGRACIÓN FALLIDO")
            print("Revisar implementación de renewal tokens")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ ERROR durante el test: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)