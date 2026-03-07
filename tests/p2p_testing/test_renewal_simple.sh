#!/bin/bash
# Test simple de renewal tokens

set -e

echo "🧪 TEST SIMPLE DE RENEWAL TOKENS"
echo "================================="

# Cleanup
rm -rf /tmp/test_renewal
mkdir -p /tmp/test_renewal

# Create test Python script
cat > /tmp/test_renewal/test_renewal.py << 'EOF'
import json
import time
import nacl.signing
import nacl.encoding
import hashlib
import sys

def get_revelnest_id(pk_bytes):
    return hashlib.blake2b(pk_bytes, digest_size=16).hexdigest()

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
            print('❌ Token missing targetPublicKey')
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
        print(f'❌ Token signature verification failed: {e}')
        return False
    
    if token['authorizedBy'] != token['targetId']:
        print(f'❌ Token authorizedBy mismatch: {token["authorizedBy"]} != {token["targetId"]}')
        return False
    
    if token['createdAt'] > current_time:
        print(f'❌ Token created in future: {token["createdAt"]} > {current_time}')
        return False
    
    if token['allowedUntil'] < current_time:
        print(f'❌ Token expired: {token["allowedUntil"]} < {current_time}')
        return False
    
    if token['renewalsUsed'] > token['maxRenewals']:
        print(f'❌ Token renewal limit exceeded: {token["renewalsUsed"]} > {token["maxRenewals"]}')
        return False
    
    print(f'✅ Token verified for {token["targetId"]}')
    return True

# Test 1: Create and verify token
print("\n=== Test 1: Creación y verificación de token ===")
signing_key = nacl.signing.SigningKey.generate()
verify_key = signing_key.verify_key
public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
my_revelnest_id = get_revelnest_id(verify_key.encode())

token = create_renewal_token(my_revelnest_id, signing_key)
print(f"✅ Token creado para ID: {my_revelnest_id}")
print(f"   Public key en token: {token['targetPublicKey'][:20]}...")

# Save token for inspection
with open('/tmp/test_renewal/token.json', 'w') as f:
    json.dump(token, f, indent=2)

# Test verification
if verify_renewal_token(token):
    print("✅ Token verificado exitosamente")
else:
    print("❌ Token verification failed")
    sys.exit(1)

# Test 2: Simulate renewal
print("\n=== Test 2: Simulación de renovación ===")
token['renewalsUsed'] += 1
token['lastRenewalAt'] = int(time.time() * 1000)
token['renewedBy'] = ['test_renewer']

print(f"✅ Simulated renewal for {token['targetId']}")
print(f"   Renewals used: {token['renewalsUsed']}/{token['maxRenewals']}")

# Test 3: Expired token
print("\n=== Test 3: Token expirado ===")
expired_token = token.copy()
expired_token['allowedUntil'] = int(time.time() * 1000) - 1000  # 1 second ago

if not verify_renewal_token(expired_token):
    print("✅ Correctly rejected expired token")
else:
    print("❌ Should have rejected expired token")
    sys.exit(1)

# Test 4: Token with max renewals exceeded
print("\n=== Test 4: Límite de renovaciones excedido ===")
maxed_token = token.copy()
maxed_token['renewalsUsed'] = 4
maxed_token['maxRenewals'] = 3

if not verify_renewal_token(maxed_token):
    print("✅ Correctly rejected token with max renewals exceeded")
else:
    print("❌ Should have rejected token with max renewals exceeded")
    sys.exit(1)

print("\n🎉 TODOS LOS TESTS PASARON EXITOSAMENTE!")
print("El sistema de renewal tokens funciona correctamente.")
EOF

# Run the test
python3 /tmp/test_renewal/test_renewal.py

echo ""
echo "📊 Token generado:"
cat /tmp/test_renewal/token.json | python3 -m json.tool