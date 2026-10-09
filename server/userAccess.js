import { HttpError } from './http.js';

// What any signed-in user may learn about other accounts (display names in chat, rosters, notifications).
export const USER_PUBLIC_COLUMNS = ['id', 'username', 'first_name', 'last_name', 'avatar_url'];

// Profile fields that the generic data endpoint may change. Everything else on a user
// (role, is_active, account_status, email, is_email_verified, ...) is privileged and can only be
// changed through the dedicated administrator endpoints, which enforce their own safeguards.
export const USER_PROFILE_WRITABLE_COLUMNS = [
  'username', 'first_name', 'last_name', 'avatar_url', 'bio', 'last_login_at', 'updated_at',
];

export function assertUserActionAllowed(action) {
  if (action === 'insert' || action === 'upsert' || action === 'delete') {
    throw new HttpError(
      403,
      'Accounts are created and removed by an administrator through the user management screen.',
      'USER_MANAGEMENT_REQUIRED',
    );
  }
}

export function assertUserUpdateAllowed(preparedKeys) {
  const forbidden = preparedKeys.filter((key) => key !== 'id' && !USER_PROFILE_WRITABLE_COLUMNS.includes(key));
  if (forbidden.length > 0) {
    throw new HttpError(
      403,
      `These account fields can only be changed by an administrator: ${forbidden.join(', ')}`,
      'PRIVILEGED_USER_FIELD',
    );
  }
}

function rootColumn(column) {
  const root = String(column || '').split('.')[0];
  return root === 'last_login' ? 'last_login_at' : root;
}

// Without this, filtering by email/role would let a player probe private fields even though the
// returned rows are projected: `eq('email', 'someone@example.com')` would reveal who is registered.
export function assertUserQueryAllowed({ filters = [], orders = [] }, ctx) {
  if (ctx.admin) return;
  const columns = [];
  const visit = (filter) => {
    if (!filter) return;
    if (filter.column) columns.push(filter.column);
    if (Array.isArray(filter.filters)) filter.filters.forEach(visit);
  };
  filters.forEach(visit);
  orders.forEach((order) => order?.column && columns.push(order.column));
  const hidden = columns.map(rootColumn).filter((column) => !USER_PUBLIC_COLUMNS.includes(column));
  if (hidden.length > 0) {
    throw new HttpError(403, `You cannot filter or sort users by: ${[...new Set(hidden)].join(', ')}`, 'PRIVATE_USER_FIELD');
  }
}

export function projectUserRow(row, ctx) {
  if (!row || ctx.admin || row.id === ctx.user.id) return row;
  return Object.fromEntries(USER_PUBLIC_COLUMNS.filter((column) => column in row).map((column) => [column, row[column]]));
}
