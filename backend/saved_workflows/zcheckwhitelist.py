import firebase_admin
from firebase_admin import credentials, auth
import argparse

def check_whitelist_status(uid: str) -> bool:
    """
    Check if a user is whitelisted by checking their roles in Firebase Auth custom claims.
    
    Args:
        uid: The user ID to check
        
    Returns:
        bool: True if user has whitelisted role, False otherwise
    """
    try:
        # Initialize Firebase Admin SDK if not already initialized
        if not firebase_admin._apps:
            from firebase.firebase_credentials import get_firebase_credentials
            cred = credentials.Certificate(get_firebase_credentials())
            firebase_admin.initialize_app(cred)

        # Get the user's custom claims
        user = auth.get_user(uid)
        claims = user.custom_claims or {}
        
        # Get roles array and check if whitelisted role is present
        roles = claims.get('roles', [])
        is_whitelisted = 'whitelisted' in roles
        
        # Print detailed status
        print(f"User {uid} roles: {roles}")
        print(f"Whitelisted status: {is_whitelisted}")
        return is_whitelisted
    
    except Exception as e:
        print(f"Error: Failed to check whitelist status. {str(e)}")
        return False

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Check if a user is whitelisted in Firebase')
    parser.add_argument('--uid', required=True, help='The user ID to check')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Check whitelist status
    check_whitelist_status(args.uid)

if __name__ == "__main__":
    main()
