import React from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../shared/DropdownMenu';
import { UserPlus, Trash2, MoreVertical } from 'lucide-react';

interface PartyHeaderProps {
  partyName: string;
  onInvite: () => void;
  onDelete: () => void;
}

export function PartyHeader({ partyName, onInvite, onDelete }: PartyHeaderProps) {
  return (
    <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
      <h1 className="text-2xl font-bold text-gray-900">{partyName}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreVertical className="w-6 h-6 text-gray-600" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onInvite}>
            <UserPlus className="w-4 h-4" />
            Invite Player
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-red-500 hover:text-red-700 hover:bg-red-50 focus:bg-red-50">
            <Trash2 className="w-4 h-4" />
            Delete Party
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
