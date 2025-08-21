import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
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

interface PartyTasksProps {
  partyId: string;
  isDM: boolean;
}

export function PartyTasks({ partyId, isDM }: PartyTasksProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: tasks, isLoading: isLoadingTasks, error: tasksError } = useQuery<PartyTask[], Error>({
    queryKey: ['partyTasks', partyId],
    queryFn: () => fetchTasks(partyId),
    enabled: !!partyId,
  });

  const createTaskMutation = useMutation({
    mutationFn: (newTaskData: NewPartyTaskData) => createTask(newTaskData, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowCreateForm(false);
    },
    onError: (error) => {
      handleError(error, { action: 'creating task' });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: PartyTaskUpdateData }) =>
      updateTask(taskId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] });
    },
    onError: (error) => {
      handleError(error, { action: 'updating task' });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partyTasks', partyId] });
    },
    onError: (error) => {
      handleError(error, { action: 'deleting task' });
    },
  });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      handleError(new Error('Task title cannot be empty.'), { action: 'adding task', showError: true });
      return;
    }
    createTaskMutation.mutate({
      party_id: partyId,
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
    });
  };

  const handleToggleStatus = (task: PartyTask) => {
    updateTaskMutation.mutate({
      taskId: task.id,
      updates: { status: task.status === 'open' ? 'completed' : 'open' },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate(taskId);
    }
  };

  // Determine if the current user can manage a specific task (delete/edit)
  // For now, only DMs or the task creator can delete.
  // Status toggle is generally allowed for any party member if we decide so, or restricted.
  // Let's restrict delete to DM or creator. Toggle status to any party member for now.
  const canManageTask = (task: PartyTask) => {
    return isDM || task.created_by_user_id === user?.id;
  };

  if (isLoadingTasks) {
    return <LoadingSpinner />;
  }

  if (tasksError) {
    return <ErrorMessage message={`Failed to load tasks: ${tasksError.message}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Party Tasks</h2>
        {isDM && (
          <Button
            icon={showCreateForm ? undefined : Plus}
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? "secondary" : "primary"}
          >
            {showCreateForm ? 'Cancel' : 'Add Task'}
          </Button>
        )}
      </div>

      {isDM && showCreateForm && (
        <form onSubmit={handleAddTask} className="p-4 border rounded-lg bg-gray-50 space-y-3">
          <div>
            <label htmlFor="newTaskTitle" className="block text-sm font-medium text-gray-700">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="newTaskTitle"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g., Clear out the goblin cave"
              required
            />
          </div>
          <div>
            <label htmlFor="newTaskDescription" className="block text-sm font-medium text-gray-700">
              Description (Optional)
            </label>
            <textarea
              id="newTaskDescription"
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Any additional details about the task..."
            />
          </div>
          <Button type="submit" loading={createTaskMutation.isPending} icon={Plus}>
            Add Task
          </Button>
        </form>
      )}

      {tasks && tasks.length > 0 ? (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={`p-4 border rounded-lg flex items-start justify-between gap-4 ${
                task.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-white'
              }`}
            >
              <div className="flex-grow">
                <div className="flex items-center gap-2">
                   <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleStatus(task)}
                    loading={updateTaskMutation.isPending && updateTaskMutation.variables?.taskId === task.id}
                    className={task.status === 'completed' ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}
                    aria-label={task.status === 'completed' ? 'Mark as open' : 'Mark as completed'}
                  >
                    {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </Button>
                  <h3 className={`text-lg font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                    {task.title}
                  </h3>
                </div>
                {task.description && (
                  <p className={`mt-1 text-sm ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {task.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Added on: {new Date(task.created_at).toLocaleDateString()}
                  {task.completed_at && task.status === 'completed' && (
                    <span> | Completed on: {new Date(task.completed_at).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                {/* Edit button can be added later if needed */}
                {/* <Button variant="ghost" size="sm" icon={Edit2} onClick={() => { /* Handle edit * / }}>Edit</Button> */}
                {canManageTask(task) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTask(task.id)}
                    loading={deleteTaskMutation.isPending && deleteTaskMutation.variables === task.id}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Delete task"
                  >
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 rounded-lg">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No tasks yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            {isDM ? "Get started by adding a new task for your party." : "The DM hasn't added any tasks yet."}
          </p>
          {isDM && !showCreateForm && (
             <Button
                onClick={() => setShowCreateForm(true)}
                className="mt-4"
                icon={Plus}
              >
                Add First Task
              </Button>
          )}
        </div>
      )}
    </div>
  );
}
