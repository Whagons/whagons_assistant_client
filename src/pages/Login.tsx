import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || 'google';
const AUTH_TENANT = import.meta.env.VITE_AUTH_TENANT || '';
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Assistant';

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <rect fill="#F25022" x="1" y="1" width="10" height="10" />
      <rect fill="#7FBA00" x="13" y="1" width="10" height="10" />
      <rect fill="#00A4EF" x="1" y="13" width="10" height="10" />
      <rect fill="#FFB900" x="13" y="13" width="10" height="10" />
    </svg>
  );
}

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      let provider;
      if (AUTH_PROVIDER === 'microsoft') {
        const msProvider = new OAuthProvider('microsoft.com');
        if (AUTH_TENANT) {
          msProvider.setCustomParameters({ tenant: AUTH_TENANT });
        }
        provider = msProvider;
      } else {
        provider = new GoogleAuthProvider();
      }
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (error: any) {
      setError(error.message || `Failed to sign in`);
    } finally {
      setLoading(false);
    }
  };

  const providerLabel = AUTH_PROVIDER === 'microsoft' ? 'Microsoft' : 'Google';
  const ProviderIcon = AUTH_PROVIDER === 'microsoft' ? MicrosoftIcon : GoogleIcon;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Login</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Sign in to {APP_NAME}</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <Button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
            disabled={loading}
          >
            <ProviderIcon />
            Sign in with {providerLabel}
          </Button>
        </div>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
          </div>
        </div>
        
      </div>
    </div>
  );
}
