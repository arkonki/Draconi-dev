import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDice } from './dice/DiceContext';
import {
  Users,
  Book,
  Sword,
  StickyNote,
  Settings,
  LogOut,
  Shield,
  Crown,
  Dices,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export function Navigation() {
  const location = useLocation();
  const { signOut, isAdmin, isDM, role, user } = useAuth();
  const { toggleDiceRoller } = useDice();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;

  // Safe username display
  const displayName = user?.username || user?.email?.split('@')[0] || 'Adventurer';
  const displayInitials = displayName.charAt(0).toUpperCase();

  const navItems = [
    { path: '/', label: 'Characters', icon: Users, roles: ['player', 'dm', 'admin'] },
    { path: '/compendium', label: 'Compendium', icon: Book, roles: ['player', 'dm', 'admin'] },
    { path: '/adventure-party', label: 'Adventure Party', icon: Sword, roles: ['player', 'dm', 'admin'] },
    { path: '/notes', label: 'Notes', icon: StickyNote, roles: ['player', 'dm', 'admin'] },
  ];

  const handleLinkClick = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleIcon = () => {
    if (isAdmin()) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (isDM()) return <Shield className="w-4 h-4 text-blue-400" />;
    return <Users className="w-4 h-4 text-green-400" />;
  };

  const getRoleName = () => {
    if (isAdmin()) return 'Admin';
    if (isDM()) return 'Gamemaster';
    return 'Player';
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 text-white sticky top-0 z-40" ref={navRef}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          
          {/* --- BRANDING --- */}
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" onClick={handleLinkClick} className="flex items-center opacity-90 hover:opacity-100 transition-opacity">
              <img 
                src="/dragonbane-icon.png" 
                alt="Dragonbane" 
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>

          {/* --- DESKTOP NAV --- */}
          <div className="hidden md:flex flex-1 items-center justify-end space-x-6">
            {/* Navigation Links */}
            <div className="flex items-center space-x-1">
              {navItems
                .filter(item => item.roles.includes(role || 'player'))
                .map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive(path)
                        ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </Link>
                ))}
            </div>

            <div className="h-6 w-px bg-gray-700/50" />

            {/* Right Side Actions */}
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleDiceRoller}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                title="Dice Roller"
              >
                <Dices className="w-5 h-5" />
                <span className="hidden lg:inline">Dice</span>
              </button>

              {/* User Menu Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-lg border border-gray-700/50 hover:border-gray-600 bg-gray-800/50 hover:bg-gray-800 transition-all group"
                >
                  <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-gray-900 group-hover:ring-indigo-500/30 transition-all">
                    {displayInitials}
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-bold text-gray-200 leading-none">{displayName}</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-none mt-1">{getRoleName()}</span>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-gray-500 ml-1 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-gray-800 rounded-xl shadow-xl z-50 border border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    
                    {/* Dropdown Header */}
                    <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Signed in as</p>
                      <div className="flex items-center gap-2">
                        {getRoleIcon()}
                        <p className="text-sm font-bold text-white truncate">{displayName}</p>
                      </div>
                    </div>

                    {/* Dropdown Links */}
                    <div className="p-1.5 space-y-0.5">
                      <Link
                        to="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4 mr-3 text-gray-400" />
                        Settings
                      </Link>
                      <button
                        onClick={() => {
                          signOut();
                          setIsUserMenuOpen(false);
                        }}
                        className="flex items-center w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* --- MOBILE TOGGLE --- */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={toggleDiceRoller}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <Dices className="w-6 h-6" />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* --- MOBILE MENU --- */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bg-gray-900 border-b border-gray-800 shadow-2xl z-50 animate-in slide-in-from-top-2 duration-200">
          
          {/* Mobile User Profile */}
          <div className="bg-gray-800/80 px-4 py-4 border-b border-gray-700 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-gray-700">
              {displayInitials}
            </div>
            <div>
              <div className="text-lg font-bold text-white">{displayName}</div>
              <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-medium uppercase tracking-wide bg-indigo-900/30 px-2 py-0.5 rounded-full w-fit mt-1">
                {getRoleIcon()}
                {getRoleName()}
              </div>
            </div>
          </div>

          {/* Mobile Links */}
          <div className="p-2 space-y-1">
            {navItems
              .filter(item => item.roles.includes(role || 'player'))
              .map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={handleLinkClick}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-colors ${
                    isActive(path)
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive(path) ? 'text-indigo-400' : 'text-gray-500'}`} />
                  {label}
                </Link>
              ))}
          </div>

          {/* Mobile Footer Actions */}
          <div className="p-2 border-t border-gray-800 bg-gray-900/50 grid grid-cols-2 gap-2">
            <Link
              to="/settings"
              onClick={handleLinkClick}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
            <button
              onClick={() => {
                signOut();
                handleLinkClick();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-400 bg-red-900/10 hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
