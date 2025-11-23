import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Trash2, CheckCircle2, Circle, AlertTriangle, ListTodo, CheckSquare, Square, X
} from 'lucide-react';
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  PartyTask,
  NewPartyTaskData,
  PartyTaskUpdateData,
} from '../../lib/api/tasks';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useErrorHandler } from '../../hooks/useErrorHandler';

// --- TYPES ---
interface PartyTasksProps {
  partyId: string;
  isDM: boolean;
}

// --- HELPER COMPONENT: TASK CARD ---
const TaskCard = ({ 
  task, 
  onToggle, 
  onDelete, 
  canManage 
}: { 
  task: PartyTask; 
  onToggle: (t: PartyTask) => void; 
  onDelete: (id: string) => void;
  canManage: boolean;
}) => {
  const isCompleted = task.status === 'completed';

  return (
    <div className={`
      group relative flex items-start p-4 rounded-xl border transition-all
      ${isCompleted 
        ? 'bg-green-50/50 border-green-200 opacity-80 hover:opacity-100' 
        : 'bg-white border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-200'
      }
    `}>
      {/* Checkbox / Status Toggle */}
      <button
        onClick={() => onToggle(task)}
        className={`mt-0.5 mr-4 flex-shrink-0 transition-colors ${isCompleted ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-indigo-600'}`}
        aria-label={isCompleted ? "Mark as incomplete" : "Mark as completed"}
      >
        {isCompleted ? <CheckCircle2 size={24} /> : <Circle size={24} />}
      </button>

      {/* Content */}
      <div className="flex-grow min-w-0">
        <h3 className={`font-semibold text-gray-900 ${isCompleted ? 'line-through text-gray-500' : ''}`}>
          {task.title}
        </h3>
        {task.description && (
          <p className={`mt-1 text-sm leading-relaxed ${isCompleted ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-600'}`}>
            {task.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 font-medium">
          <span>Added {new Date(task.created_at).toLocaleDateString()}</span>
          {isCompleted && task.completed_at && (
            <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              Completed {new Date(task.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Delete Action (Only visible on hover for desktop, always for mobile if permitted) */}
      {canManage && (
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg absolute top-2 right-2"
          title="Delete Task"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
};

// --- MAIN COMPONENT ---
export function PartyTasks({ partyId, isDM }: PartyTasksProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  // State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: tasks, isLoading, error } = useQuery<PartyTask[], Error>({
    queryKey: ['partyTasks', partyId],
    queryFn: () => fetchTasks(partyId),
    enabled: !!partyId,
  });

  // Mutations
  const createTaskMu = useMutation({
    mutationFn: (data: NewPartyTaskData) => createTask(data, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setIsFormOpen(false);
      setFormError(null);
    },
    onError: (err) => handleError(err, { action: 'creating task' }),
  });

  const updateTaskMu = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: PartyTaskUpdateData }) => updateTask(taskId, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] }),
    onError: (err) => handleError(err, { action: 'updating task' }),
  });

  const deleteTaskMu = useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] }),
    onError: (err) => handleError(err, { action: 'deleting task' }),
  });

  // Handlers
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      setFormError('Task title is required.');
      return;
    }
    createTaskMu.mutate({
      party_id: partyId,
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this task permanently?')) {
      deleteTaskMu.mutate(id);
    }
  };

  const canManage = (task: PartyTask) => isDM || task.created_by_user_id === user?.id;

  // Filter tasks
  const openTasks = tasks?.filter(t => t.status !== 'completed') || [];
  const completedTasks = tasks?.filter(t => t.status === 'completed') || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <LoadingSpinner size="lg" />
        <p className="mt-3">Loading tasks...</p>
      </div>
    );
  }

  if (error) return <ErrorMessage message={`Failed to load tasks: ${error.message}`} />;

  return (
    <div className="max-w-4xl mx-auto p-6 h-full overflow-y-auto">
      
      {/* Header */}
      <div className="flex justify-between items-end mb-8 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListTodo className="w-8 h-8 text-indigo-600" />
            Quest Log
          </h2>
          <p className="text-gray-500 text-sm mt-1">Track your party's objectives and quests.</p>
        </div>
        
        {isDM && !isFormOpen && (
          <Button onClick={() => setIsFormOpen(true)} icon={Plus} variant="primary">
            New Task
          </Button>
        )}
      </div>

      {/* Create Form */}
      {isDM && isFormOpen && (
        <div className="mb-8 bg-white rounded-xl border border-indigo-100 shadow-sm p-5 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-gray-800">Add New Quest / Task</h3>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
          </div>

          {formError && <ErrorMessage message={formError} onClose={() => setFormError(null)} className="mb-4" />}

          <form onSubmit={handleAddTask} className="space-y-4">
            <div>
              <input
                autoFocus
                type="text"
                placeholder="Task Title (e.g., 'Investigate the Old Ruins')"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
            <div>
              <textarea
                rows={2}
                placeholder="Details (optional)..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createTaskMu.isPending} icon={Plus}>Add Task</Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {tasks?.length === 0 && !isFormOpen ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No active quests</h3>
          <p className="text-gray-500 mt-1 max-w-sm mx-auto">
            {isDM ? "Your quest log is empty. Add a task to guide your players." : "The Dungeon Master hasn't assigned any quests yet."}
          </p>
          {isDM && (
            <Button onClick={() => setIsFormOpen(true)} variant="outline" className="mt-6">Create First Task</Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Active Tasks */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Square className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Active ({openTasks.length})</h3>
            </div>
            
            <div className="space-y-3">
              {openTasks.length > 0 ? (
                openTasks.map(task => (
                  <TaskCard 
                    key={task.id} 
                    task={task} 
                    onToggle={(t) => updateTaskMu.mutate({ taskId: t.id, updates: { status: 'completed' } })} 
                    onDelete={handleDelete}
                    canManage={canManage(task)}
                  />
                ))
              ) : (
                <p className="text-center py-8 text-gray-400 italic bg-gray-50 rounded-lg border border-dashed">No active tasks.</p>
              )}
            </div>
          </section>

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <section className="opacity-75 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 mb-4 mt-8 pt-8 border-t border-gray-100">
                <CheckSquare className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Completed ({completedTasks.length})</h3>
              </div>
              
              <div className="space-y-3">
                {completedTasks.map(task => (
                  <TaskCard 
                    key={task.id} 
                    task={task} 
                    onToggle={(t) => updateTaskMu.mutate({ taskId: t.id, updates: { status: 'open' } })} 
                    onDelete={handleDelete}
                    canManage={canManage(task)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
