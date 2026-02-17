import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, AlertCircle, Edit3, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { UserCreationModal } from './UserCreationModal';
import { supabase } from '../../lib/supabase'; // Import Supabase client

// Updated User interface to reflect data from Supabase 'users' table
interface User {
  id: string;
  email: string;
  username: string | null;
  role: 'player' | 'dm' | 'admin' | string; // Role from public.users
  created_at: string; // Timestamp
  last_login?: string | null; // Timestamp or null
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean;
  // Add other fields like account_status, is_email_verified if needed for display
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'player' | 'dm' | 'admin' | string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  // const [editingUser, setEditingUser] = useState<User | null>(null); // For future edit functionality

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('users') // Assuming your table is named 'users' in the public schema
        .select('id, email, username, role, created_at, last_login, first_name, last_name, is_active')
        .order('created_at', { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }
      
      setUsers(data as User[] || []); // Ensure data is cast to User[] and handle null
    } catch (err: unknown) {
      console.error("Error fetching users:", err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load users: ${message}`);
      setUsers([]); // Clear users on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUserCreated = () => {
    setShowCreateModal(false);
    fetchUsers(); // Reload user list after a new user is created
  };

  // const handleEditUser = (user: User) => {
  //   setEditingUser(user);
  //   // setShowEditModal(true); // If you have an edit modal
  //   console.log("Editing user:", user);
  // };

  // const handleDeleteUser = async (userId: string) => {
  //   if (window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
  //     // Implement deletion logic here, e.g., call Supabase
  //     console.log("Deleting user:", userId);
  //     // After deletion, refresh the list:
  //     // fetchUsers();
  //   }
  // };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (user.username && user.username.toLowerCase().includes(searchLower)) ||
      (user.email && user.email.toLowerCase().includes(searchLower)) ||
      (user.first_name && user.first_name.toLowerCase().includes(searchLower)) ||
      (user.last_name && user.last_name.toLowerCase().includes(searchLower));
      
    const matchesRole = roleFilter === 'all' || (user.role && user.role.toLowerCase() === roleFilter.toLowerCase());
    return matchesSearch && matchesRole;
  });

  const getRoleDisplayClass = (role: string) => {
    const roleLower = role?.toLowerCase();
    if (roleLower === 'admin') return 'bg-purple-100 text-purple-800';
    if (roleLower === 'dm' || roleLower === 'dungeon master') return 'bg-blue-100 text-blue-800';
    if (roleLower === 'player') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800'; // Default for other roles
  };
  
  const formatUserDisplayName = (user: User) => {
    if (user.username) return user.username;
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
    if (user.first_name) return user.first_name;
    return user.email.split('@')[0]; // Fallback to part of email
  };


  return (
    <div className="space-y-6 p-4 md:p-6 bg-white shadow-lg rounded-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-2xl font-semibold text-gray-800">User Management</h3>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto"
        >
          Create User
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm">
          <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800">Error Loading Users</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 pb-4 border-b border-gray-200">
        <div className="relative flex-grow">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-colors"
            disabled={loading}
          />
        </div>
        
        <div className="relative md:min-w-[200px]">
          <Filter className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="w-full pl-11 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white shadow-sm transition-colors"
            disabled={loading}
          >
            <option value="all">All Roles</option>
            <option value="player">Players</option>
            <option value="dm">Dungeon Masters</option>
            <option value="admin">Administrators</option>
            {/* Dynamically add other roles if necessary */}
          </select>
           <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
      </div>

      {/* User List */}
      {loading && users.length === 0 ? (
         <div className="text-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      ) : !loading && users.length === 0 && !error ? (
        <div className="text-center py-10 px-4">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h4 className="text-xl font-semibold text-gray-700 mb-1">No Users Found</h4>
            <p className="text-gray-500">There are currently no users to display. Try creating one!</p>
        </div>
      ) : (
        <div className="overflow-x-auto shadow-md rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">
                        {user.first_name ? user.first_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                        {user.last_name ? user.last_name.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : '')}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{formatUserDisplayName(user)}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getRoleDisplayClass(user.role || 'N/A')}`}>
                      {user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'N/A'}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {user.is_active === undefined || user.is_active === null ? (
                       <span className="text-xs text-gray-500">Unknown</span>
                    ) : user.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        <XCircle className="w-3.5 h-3.5 mr-1.5" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="icon"
                        size="sm"
                        // onClick={() => handleEditUser(user)} // Uncomment when edit is implemented
                        title="Edit User"
                        className="text-gray-500 hover:text-blue-600"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="icon"
                        size="sm"
                        // onClick={() => handleDeleteUser(user.id)} // Uncomment when delete is implemented
                        title="Delete User"
                        className="text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filteredUsers.length === 0 && !loading && users.length > 0 && (
        <div className="text-center py-10 px-4">
            <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h4 className="text-xl font-semibold text-gray-700 mb-1">No Users Match Your Search</h4>
            <p className="text-gray-500">Try adjusting your search term or role filter.</p>
        </div>
      )}


      {/* Create User Modal */}
      {showCreateModal && (
        <UserCreationModal
          onClose={() => setShowCreateModal(false)}
          onUserCreated={handleUserCreated}
        />
      )}

      {/* Edit User Modal (Example, implement if needed) */}
      {/* {editingUser && showEditModal && (
        <UserEditModal
          user={editingUser}
          onClose={() => setShowEditModal(false)}
          onUserUpdated={() => {
            setShowEditModal(false);
            fetchUsers();
          }}
        />
      )} */}
    </div>
  );
}
