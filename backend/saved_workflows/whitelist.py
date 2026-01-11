import firebase_admin
from firebase_admin import credentials, auth
import argparse

def whitelist_user(uid: str) -> None:
    """
    Add whitelisted role to a user's custom claims in Firebase Auth.
    
    Args:
        uid: The user ID to whitelist
    """
    try:
        # Initialize Firebase Admin SDK if not already initialized
        if not firebase_admin._apps:
            from firebase.firebase_credentials import get_firebase_credentials
            cred = credentials.Certificate(get_firebase_credentials())
            firebase_admin.initialize_app(cred)

        # Get current user claims
        user = auth.get_user(uid)
        current_claims = user.custom_claims or {}
        current_roles = current_claims.get('roles', [])

        # Add whitelisted role if not already present
        if 'whitelisted' not in current_roles:
            current_roles.append('whitelisted')
            auth.set_custom_user_claims(uid, {'roles': current_roles})
            print(f"Success: User {uid} has been whitelisted.")
        else:
            print(f"User {uid} is already whitelisted.")
    
    except Exception as e:
        print(f"Error: Failed to whitelist user. {str(e)}")

def unwhitelist_user(uid: str) -> None:
    """
    Remove whitelisted role from a user's custom claims in Firebase Auth.
    
    Args:
        uid: The user ID to unwhitelist
    """
    try:
        # Initialize Firebase Admin SDK if not already initialized
        if not firebase_admin._apps:
            from firebase.firebase_credentials import get_firebase_credentials
            cred = credentials.Certificate(get_firebase_credentials())
            firebase_admin.initialize_app(cred)

        # Get current user claims
        user = auth.get_user(uid)
        current_claims = user.custom_claims or {}
        current_roles = current_claims.get('roles', [])

        # Remove whitelisted role if present
        if 'whitelisted' in current_roles:
            current_roles.remove('whitelisted')
            auth.set_custom_user_claims(uid, {'roles': current_roles})
            print(f"Success: User {uid} has been unwhitelisted.")
        else:
            print(f"User {uid} is not whitelisted.")
    
    except Exception as e:
        print(f"Error: Failed to unwhitelist user. {str(e)}")

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Whitelist or unwhitelist a user in Firebase')
    parser.add_argument('--uid', required=True, help='The user ID to modify')
    parser.add_argument('--action', required=True, choices=['whitelist', 'unwhitelist'], 
                      help='Action to perform')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Call the appropriate function based on action
    if args.action == 'whitelist':
        whitelist_user(args.uid)
    else:
        unwhitelist_user(args.uid)

if __name__ == "__main__":
    main()