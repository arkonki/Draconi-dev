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
  Menu, // Hamburger icon
  X, // Close icon
  ChevronDown, // Dropdown icon
} from 'lucide-react';

export function Navigation() {
  const location = useLocation();
  // Updated to use 'user' object which contains a 'username' property
  const { signOut, isAdmin, isDM, role, user } = useAuth();
  const { toggleDiceRoller } = useDice();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', label: 'Characters', icon: Users, roles: ['player', 'dm', 'admin'] },
    { path: '/compendium', label: 'Compendium', icon: Book, roles: ['player', 'dm', 'admin'] },
    { path: '/adventure-party', label: 'Adventure Party', icon: Sword, roles: ['player', 'dm', 'admin'] },
    { path: '/notes', label: 'Notes', icon: StickyNote, roles: ['player', 'dm', 'admin'] },
    // Settings has been moved to the user dropdown
  ];

  const handleLinkClick = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  // Close mobile menu or user dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close mobile nav
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
      // Close user dropdown
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  return (
    <nav className="bg-gray-800 text-white" ref={navRef}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand - Can be added here if needed */}
          <div className="flex-shrink-0">
            {/* Example: <Link to="/" className="text-xl font-bold">MyApp</Link> */}
          </div>

          {/* Desktop Menu & Right-side items */}
          <div className="hidden md:flex flex-1 items-center justify-between">
            {/* Desktop Navigation Links */}
            <div className="flex items-center space-x-4">
              {navItems
                .filter(item => item.roles.includes(role || 'player'))
                .map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    onClick={handleLinkClick}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                      isActive(path)
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </Link>
                ))}
            </div>

            {/* Right side items (Dice, Role, User Dropdown) - Desktop */}
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleDiceRoller}
                className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                title="Open Dice Roller"
              >
                <Dices className="w-5 h-5" />
                <span className="hidden lg:inline">Dice</span>
              </button>

              <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-gray-700" title={`Current role: ${role}`}>
                {isAdmin() ? (
                  <Crown className="w-5 h-5 text-yellow-400" />
                ) : isDM() ? (
                  <Shield className="w-5 h-5 text-blue-400" />
                ) : (
                  <Users className="w-5 h-5 text-green-400" />
                )}
                <span className="text-sm font-medium hidden lg:inline">
                  {isAdmin() ? 'Admin' : isDM() ? 'DM' : 'Player'}
                </span>
              </div>

              {/* User Dropdown Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  {/* CHANGED HERE */}
                  <span>{user?.username || 'Account'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg z-50 ring-1 ring-black ring-opacity-5">
                    <div className="py-1">
                      <Link
                        to="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        <Settings className="w-5 h-5 mr-3" />
                        <span>Settings</span>
                      </Link>
                      <button
                        onClick={() => {
                          signOut();
                          setIsUserMenuOpen(false);
                        }}
                        className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        <LogOut className="w-5 h-5 mr-3" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            {/* Mobile Dice Roller - always visible on mobile next to hamburger */}
            <button
              onClick={toggleDiceRoller}
              className="p-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white mr-2"
              title="Open Dice Roller"
            >
              <Dices className="w-6 h-6" />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 inset-x-0 bg-gray-800 z-50 shadow-lg" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems
              .filter(item => item.roles.includes(role || 'player'))
              .map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={handleLinkClick}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md text-base font-medium ${
                    isActive(path)
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span>{label}</span>
                </Link>
              ))}

            {/* Separator */}
            <hr className="border-gray-700 my-2" />

            {/* Settings and Logout in Mobile Menu */}
            <Link
              to="/settings"
              onClick={handleLinkClick}
              className={`flex items-center space-x-3 px-3 py-2 rounded-md text-base font-medium ${
                isActive('/settings')
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <Settings className="w-6 h-6" />
              <span>Settings</span>
            </Link>
            
            <button
              onClick={() => {
                signOut();
                handleLinkClick();
              }}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <LogOut className="w-6 h-6" />
              <span>Log Out</span>
            </button>

            {/* Role indicator in Mobile Menu */}
            <div className="px-3 pt-4">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-gray-700 w-full">
                {/* CHANGED HERE */}
                {isAdmin() ? (
                  <>
                    <Crown className="w-5 h-5 text-yellow-400" />
                    <span className="text-sm font-medium">Admin: {user?.username || ''}</span>
                  </>
                ) : isDM() ? (
                  <>
                    <Shield className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-medium">DM: {user?.username || ''}</span>
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium">Player: {user?.username || ''}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}