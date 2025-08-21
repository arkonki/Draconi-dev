import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, AlertCircle, Mail, Lock, User as UserIcon, LogIn, UserPlus } from 'lucide-react';
import { loginSchema, signupSchema } from '../lib/auth/validation';
import { Button } from '../components/shared/Button';

export function Login() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'player' | 'dm'>('player');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
    setUsername('');
    setConfirmPassword('');
    setRole('player');
    setError(null);
    setSuccessMessage(null);
    setValidationErrors({});
  }

  const toggleView = () => {
    setIsLoginView(!isLoginView);
    clearForm();
  };

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
      // Navigate on success is handled by AuthContext listener in App.tsx or similar
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async () => {
    const validationResult = signupSchema.safeParse({
      username: username.trim(),
      email: email.trim(),
      password,
      confirmPassword,
      role,
    });

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
      const { email: validatedEmail, password: validatedPassword, username: validatedUsername, role: validatedRole } = validationResult.data;
      await signUp(validatedEmail, validatedPassword, validatedUsername, validatedRole);
      setSuccessMessage('Registration successful! Please check your email to verify your account before logging in.');
      setIsLoginView(true); // Switch to login view after successful signup
      clearForm(); // Clear form fields
      setEmail(validatedEmail); // Pre-fill email for convenience
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null); // Clear previous success messages on new submit
    setValidationErrors({});

    if (!isOnline) {
      setError('No internet connection');
      return;
    }

    if (isLoginView) {
      await handleLoginSubmit();
    } else {
      await handleSignupSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            {isLoginView ? 'Log in to DragonBane' : 'Create your DragonBane Account'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isLoginView ? 'Enter your details to access your account' : 'Fill in the details to register'}
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
                <h3 className="text-sm font-medium text-red-800">{isLoginView ? 'Login Error' : 'Signup Error'}</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-green-400 mr-2" /> {/* Use green icon */}
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Success</h3>
                <p className="mt-2 text-sm text-green-700">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            {!isLoginView && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username</label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username" name="username" type="text" required autoComplete="username"
                    value={username} onChange={(e) => setUsername(e.target.value)}
                    className={`pl-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${validationErrors.username ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Choose a username"
                    disabled={loading} // Disable input when loading
                  />
                </div>
                {validationErrors.username && <p className="mt-1 text-xs text-red-600">{validationErrors.username}</p>}
              </div>
            )}

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
                  disabled={loading} // Disable input when loading
                />
              </div>
              {validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password" name="password" type="password" required
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`pl-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${validationErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="Enter password"
                  disabled={loading} // Disable input when loading
                />
              </div>
              {validationErrors.password && <p className="mt-1 text-xs text-red-600">{validationErrors.password}</p>}
            </div>

            {!isLoginView && (
              <>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password"
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`pl-10 w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Confirm password"
                      disabled={loading} // Disable input when loading
                    />
                  </div>
                  {validationErrors.confirmPassword && <p className="mt-1 text-xs text-red-600">{validationErrors.confirmPassword}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Register as</label>
                  <div className="mt-2 flex items-center space-x-4">
                    <label className="inline-flex items-center">
                      <input type="radio" className="form-radio text-blue-600" name="role" value="player" checked={role === 'player'} onChange={() => setRole('player')} disabled={loading} />
                      <span className="ml-2 text-sm text-gray-700">Player</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input type="radio" className="form-radio text-blue-600" name="role" value="dm" checked={role === 'dm'} onChange={() => setRole('dm')} disabled={loading} />
                      <span className="ml-2 text-sm text-gray-700">Dungeon Master (DM)</span>
                    </label>
                  </div>
                   {validationErrors.role && <p className="mt-1 text-xs text-red-600">{validationErrors.role}</p>}
                </div>
              </>
            )}
          </div>

          <Button
            type="submit"
            variant="primary" // Changed from default to primary
            fullWidth
            loading={loading}
            disabled={!isOnline || loading} // Disable if offline OR loading
            icon={isLoginView ? LogIn : UserPlus}
            iconPosition="left"
          >
            {isLoginView ? 'Log in' : 'Sign up'}
          </Button>
        </form>

        <div className="text-sm text-center">
          <button
            type="button"
            onClick={toggleView}
            className="font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
            disabled={loading} // Disable toggle button when loading
          >
            {isLoginView ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
