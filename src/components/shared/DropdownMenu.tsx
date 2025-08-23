import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { MoreVertical } from 'lucide-react';

interface DropdownContextType {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('useDropdown must be used within a DropdownMenu');
  }
  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({ children }: { children: React.ReactNode }) {
  const { isOpen, setIsOpen } = useDropdown();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
      }}
      className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      aria-expanded={isOpen}
      aria-haspopup="true"
    >
      {children || <MoreVertical className="w-5 h-5" />}
    </button>
  );
}

export function DropdownMenuContent({ children }: { children: React.ReactNode }) {
  const { isOpen, setIsOpen } = useDropdown();

  if (!isOpen) return null;

  return (
    <div
      className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
      role="menu"
      aria-orientation="vertical"
      aria-labelledby="menu-button"
    >
      <div className="py-1" role="none" onClick={() => setIsOpen(false)}>
        {children}
      </div>
    </div>
  );
}

interface DropdownMenuItemProps {
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuItem({ onSelect, children, className }: DropdownMenuItemProps) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={`flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${className}`}
      role="menuitem"
    >
      {children}
    </a>
  );
}

export function DropdownMenuSeparator() {
  return <div className="border-t border-gray-100 my-1" />;
}
