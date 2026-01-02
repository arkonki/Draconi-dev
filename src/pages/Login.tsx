import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Mail, Lock, LogIn } from 'lucide-react';
import { loginSchema } from '../lib/auth/validation';
import { Button } from '../components/shared/Button';

export function Login() {
  // Removed isLoginView, username, confirmPassword, role state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Removed signUp from destructuring
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const dragonBaneIcon = "/dragonbane-icon.png";

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const clearForm = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setSuccessMessage(null);
    setValidationErrors({});
  }

  const handleLoginSubmit = async () => {
    const validationResult = loginSchema.safeParse({ email: email.trim(), password });
    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[String(err.path[0])] = err.message;
      });
      setValidationErrors(fieldErrors);
      setError('Please fix the errors in the form.');
      return false;
    }

    try {
      setLoading(true);
      const { email: validatedEmail, password: validatedPassword } = validationResult.data;
      await signIn(validatedEmail, validatedPassword);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null); 
    setValidationErrors({});

    if (!isOnline) {
      setError('No internet connection');
      return;
    }

    // Directly call login logic
    await handleLoginSubmit();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          
          {/* Logo Container */}
          <div className="relative mx-auto w-fit mb-8 group">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] h-[130%] bg-green-900/20 blur-[60px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[110%] h-[90%] bg-gradient-to-t from-green-800 via-green-600 to-transparent blur-[40px] rounded-full animate-pulse duration-1000 pointer-events-none"></div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] h-[80%] bg-gradient-to-t from-emerald-600 via-emerald-400 to-transparent blur-[30px] rounded-[40%] animate-pulse delay-150 pointer-events-none opacity-80"></div>
            <img 
              src={dragonBaneIcon} 
              alt="DragonBane Logo" 
              className="relative z-10 h-72 w-auto drop-shadow-2xl transform transition-transform duration-700 group-hover:scale-[1.02]" 
            />
          </div>

          <h2 className="text-3xl font-bold text-gray-900">
            Sign In
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter your details to access your account
          </p>
        </div>

        {!isOnline && (
          <div className="mb-6 rounded-md bg-yellow-50 p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">No internet connection</h3>
                <p className="mt-2 text-sm text-yellow-700">Please check your internet connection and try again.</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Login Error</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-green-400 mr-2" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Success</h3>
                <p className="mt-2 text-sm text-green-700">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email" name="email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className={`pl-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${validationErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="Enter email address"
                  disabled={loading}
                />
              </div>
              {validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password" name="password" type="password" required
                  autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`pl-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${validationErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="Enter password"
                  disabled={loading}
                />
              </div>
              {validationErrors.password && <p className="mt-1 text-xs text-red-600">{validationErrors.password}</p>}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            disabled={!isOnline || loading}
            icon={LogIn}
            iconPosition="left"
          >
            Sign in
          </Button>
        </form>
        
        {/* Removed the "Don't have an account?" toggle link */}
      </div>
    </div>
  );
}
