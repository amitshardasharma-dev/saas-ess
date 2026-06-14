'use client';

import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { hasMinRole, type UserRole } from '@/types/roles';

/**
 * Client-side route guard for privileged dashboard pages.
 *
 * The backing APIs already enforce permissions (return 401/403), but pages must
 * not render their privileged UI to users who navigate directly to the URL.
 * Wrap a page's body in <RoleGuard minRole="hr">…</RoleGuard>.
 *
 * Roles: employee < manager < hr (Staff) < admin (Admin). Super Admin is the
 * is_super_admin flag and always satisfies any minRole.
 */
export function RoleGuard({
  minRole,
  children,
  label = 'This page',
}: {
  minRole: UserRole;
  children: React.ReactNode;
  label?: string;
}) {
  const { user } = useAuthStore();

  // Not hydrated yet — render nothing rather than flashing privileged content.
  if (!user) return null;

  const role = (user.role || 'employee') as UserRole;
  const allowed = user.is_super_admin === true || hasMinRole(role, minRole);

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-semibold text-foreground mb-2">Access restricted</h1>
        <p className="text-muted-foreground max-w-md">
          {label} is available to {minRole === 'admin' ? 'administrators' : 'staff and administrators'} only.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
