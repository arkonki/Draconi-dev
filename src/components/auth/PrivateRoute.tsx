import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export function PrivateRoute({ children }: PrivateRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // This log is our most important tool right now.
  console.log('--- PrivateRoute Decision ---', { 
    isLoading, 
    user: user ? `User ID: ${user.id}` : null 
  });

  // If we are still checking for a session, show a loading screen.
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-xl text-gray-600">Loading Session...</p>
      </div>
    );
  }

  // If loading is finished AND there is no user, then redirect.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If loading is finished AND there is a user, show the content.
  return <>{children}</>;
}