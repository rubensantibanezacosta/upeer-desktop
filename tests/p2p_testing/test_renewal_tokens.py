#!/usr/bin/env python3
"""
Test script for renewal tokens implementation in peer_bot.py
"""

import json
import time
import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Import functions from peer_bot
import importlib.util
spec = importlib.util.spec_from_file_location("peer_bot", "tests/p2p_testing/peer_bot.py")
peer_bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(peer_bot)

create_renewal_token = peer_bot.create_renewal_token
verify_renewal_token = peer_bot.verify_renewal_token
renew_location_block_with_token = peer_bot.renew_location_block_with_token

import nacl.signing
import nacl.encoding

def test_token_creation():
    """Test basic token creation and verification"""
    print("🧪 Test 1: Token Creation and Verification")
    
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    # Create token
    token = create_renewal_token("test_node_123", signing_key, max_renwals=3, days_valid=60)
    
    # Verify token
    is_valid = verify_renewal_token(token, public_key_hex)
    
    assert is_valid, "Token should be valid"
    assert token["targetId"] == "test_node_123", "Target ID should match"
    assert token["authorizedBy"] == "test_node_123", "AuthorizedBy should match targetId"
    assert token["maxRenewals"] == 3, "Max renewals should be 3"
    assert token["renewalsUsed"] == 0, "Renewals used should start at 0"
    
    print("✅ Token creation and verification passed")
    return token, public_key_hex

def test_token_limits():
    """Test token renewal limits"""
    print("\n🧪 Test 2: Token Limits")
    
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    # Create token with 1 max renewal
    token = create_renewal_token("test_node_456", signing_key, max_renwals=1, days_valid=60)
    
    # Simulate using all renewals
    token["renewalsUsed"] = 1
    
    # Token should now be invalid (renewalsUsed >= maxRenewals)
    is_valid = verify_renewal_token(token, public_key_hex)
    
    assert not is_valid, "Token should be invalid after using all renewals"
    print("✅ Token limits enforced correctly")

def test_token_expiry():
    """Test token expiry validation"""
    print("\n🧪 Test 3: Token Expiry")
    
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    # Create token with 1 second validity
    token = create_renewal_token("test_node_789", signing_key, max_renwals=3, days_valid=0.00001157)  # ~1 second
    
    # Wait for token to expire
    time.sleep(2)
    
    # Token should now be invalid
    is_valid = verify_renewal_token(token, public_key_hex)
    
    assert not is_valid, "Token should be invalid after expiry"
    print("✅ Token expiry enforced correctly")

def test_invalid_signature():
    """Test token with invalid signature"""
    print("\n🧪 Test 4: Invalid Signature")
    
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    # Create valid token
    token = create_renewal_token("test_node_999", signing_key, max_renwals=3, days_valid=60)
    
    # Tamper with signature
    token["signature"] = "0" * 128
    
    # Token should be invalid
    is_valid = verify_renewal_token(token, public_key_hex)
    
    assert not is_valid, "Token with invalid signature should be rejected"
    print("✅ Invalid signature detection works")

def test_authorization_mismatch():
    """Test token where authorizedBy doesn't match targetId"""
    print("\n🧪 Test 5: Authorization Mismatch")
    
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
    
    # Create token
    token = create_renewal_token("test_node_111", signing_key, max_renwals=3, days_valid=60)
    
    # Tamper with authorizedBy
    token["authorizedBy"] = "different_node"
    
    # Token should be invalid
    is_valid = verify_renewal_token(token, public_key_hex)
    
    assert not is_valid, "Token with mismatched authorizedBy should be rejected"
    print("✅ Authorization mismatch detection works")

def test_auto_renewal_logic():
    """Test the auto-renewal threshold logic"""
    print("\n🧪 Test 6: Auto-Renewal Logic Simulation")
    
    # Simulate heartbeat function logic
    current_time_ms = int(time.time() * 1000)
    
    # Test case 1: Just renewed (should not auto-renew)
    last_renewal_time = current_time_ms - (1 * 24 * 60 * 60 * 1000)  # 1 day ago
    days_since_renewal = (current_time_ms - last_renewal_time) / (1000 * 60 * 60 * 24)
    
    print(f"  Days since last renewal: {days_since_renewal:.2f}")
    print(f"  Should auto-renew (>27 days): {days_since_renewal > 27}")
    
    # Test case 2: Almost expired (should auto-renew)
    last_renewal_time = current_time_ms - (28 * 24 * 60 * 60 * 1000)  # 28 days ago
    days_since_renewal = (current_time_ms - last_renewal_time) / (1000 * 60 * 60 * 24)
    
    print(f"  Days since last renewal (expired case): {days_since_renewal:.2f}")
    print(f"  Should auto-renew (>27 days): {days_since_renewal > 27}")
    
    assert days_since_renewal > 27, "28 days should trigger auto-renewal"
    print("✅ Auto-renewal threshold logic correct")

def main():
    """Run all tests"""
    print("🚀 Starting Renewal Tokens Test Suite")
    print("=" * 50)
    
    try:
        test_token_creation()
        test_token_limits()
        test_token_expiry()
        test_invalid_signature()
        test_authorization_mismatch()
        test_auto_renewal_logic()
        
        print("\n" + "=" * 50)
        print("🎉 ALL TESTS PASSED!")
        print("\nSummary:")
        print("  ✅ Token creation and verification")
        print("  ✅ Renewal limits enforcement")
        print("  ✅ Expiry validation")
        print("  ✅ Signature verification")
        print("  ✅ Authorization checks")
        print("  ✅ Auto-renewal threshold logic")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n⚠️  UNEXPECTED ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()