import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { Shield, AlertCircle, Mail, Lock, User, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../components/shared/Button';
import { registrationSchema } from '../lib/auth/validation';
import { checkRateLimit } from '../lib/auth/rateLimit';

export function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    honeypot: '', // Bot trap field
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  // Password strength indicators
  const hasMinLength = formData.password.length >= 8;
  const hasUpper = /[A-Z]/.test(formData.password);
  const hasLower = /[a-z]/.test(formData.password);
  const hasNumber = /[0-9]/.test(formData.password);
  const passwordsMatch = formData.password && formData.password === formData.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. HONEYPOT CHECK (Bot Prevention)
    if (formData.honeypot) {
      console.warn("Bot detected via honeypot.");
      return; // Silently fail
    }

    try {
      setError(null);
      setLoading(true);

      // 2. RATE LIMIT CHECK
      if (!checkRateLimit('register_' + formData.email)) {
        throw new Error('Too many registration attempts. Please try again later.');
      }

      // 3. SCHEMA VALIDATION
      const validationResult = registrationSchema.safeParse({
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        username: formData.username,
        role: 'player',
      });

      if (!validationResult.success) {
        throw new Error(validationResult.error.errors[0].message);
      }

      await signUp(formData.email, formData.password, formData.username, 'player');
      
      navigate('/login', { 
        state: { message: 'Registration successful! Please check your email to verify your account.' }
      });
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-center">
          <div className="mx-auto h-16 w-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Join the Adventure
          </h2>
          <p className="mt-2 text-indigo-100">
            Create your Dragonbane account today
          </p>
        </div>

        <div className="p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {/* Bot Trap (Honeypot) - Hidden from users */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website_url">Website</label>
              <input
                type="text"
                id="website_url"
                name="website_url"
                tabIndex={-1}
                autoComplete="off"
                value={formData.honeypot}
                onChange={(e) => setFormData({ ...formData, honeypot: e.target.value })}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-100 animate-in fade-in slide-in-from-top-2">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-3 shrink-0" />
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            )}

            <div className="space-y-5">
              
              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="pl-10 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Choose a username"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-10 pr-10 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Create a password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                
                {/* Password Strength Meter (Only show when typing) */}
                {formData.password && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div className={`flex items-center gap-1 ${hasMinLength ? 'text-green-600' : ''}`}>
                      {hasMinLength ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} 8+ Characters
                    </div>
                    <div className={`flex items-center gap-1 ${hasUpper ? 'text-green-600' : ''}`}>
                      {hasUpper ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} Uppercase Letter
                    </div>
                    <div className={`flex items-center gap-1 ${hasLower ? 'text-green-600' : ''}`}>
                      {hasLower ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} Lowercase Letter
                    </div>
                    <div className={`flex items-center gap-1 ${hasNumber ? 'text-green-600' : ''}`}>
                      {hasNumber ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} Number
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={`pl-10 block w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${
                      formData.confirmPassword && !passwordsMatch ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-300'
                    }`}
                    placeholder="Confirm your password"
                  />
                </div>
                {formData.confirmPassword && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12}/> Passwords do not match</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={loading || !passwordsMatch || !hasMinLength}
              className="mt-6"
            >
              Create Account
            </Button>

            <div className="mt-6 text-center border-t pt-6">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  Sign in
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
