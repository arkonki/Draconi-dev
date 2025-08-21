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
  X // Close icon
} from 'lucide-react';

export function Navigation() {
  const location = useLocation();
  const { signOut, isAdmin, isDM, role } = useAuth();
  const { toggleDiceRoller } = useDice();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', label: 'Characters', icon: Users, roles: ['player', 'dm', 'admin'] },
    { path: '/compendium', label: 'Compendium', icon: Book, roles: ['player', 'dm', 'admin'] },
    { path: '/adventure-party', label: 'Adventure Party', icon: Sword, roles: ['player', 'dm', 'admin'] },
    { path: '/notes', label: 'Notes', icon: StickyNote, roles: ['player', 'dm', 'admin'] },
    { path: '/settings', label: 'Settings', icon: Settings, roles: ['player', 'dm', 'admin'] },
  ];

  const handleLinkClick = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  // Close mobile menu if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);


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

            {/* Right side items (Dice, Role, Logout) - Desktop */}
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
              <button
                onClick={() => {
                  signOut();
                  handleLinkClick(); // Close menu if open
                }}
                className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden lg:inline">Log Out</span>
              </button>
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
            
            {/* Role indicator in Mobile Menu */}
            <div className="px-3 py-2">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-gray-700 w-full">
                {isAdmin() ? (
                  <>
                    <Crown className="w-5 h-5 text-yellow-400" />
                    <span className="text-sm font-medium">Admin</span>
                  </>
                ) : isDM() ? (
                  <>
                    <Shield className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-medium">DM</span>
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium">Player</span>
                  </>
                )}
              </div>
            </div>

            {/* Logout Button in Mobile Menu */}
            <button
              onClick={() => {
                signOut();
                handleLinkClick(); // Close menu
              }}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <LogOut className="w-6 h-6" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
