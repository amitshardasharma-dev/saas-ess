'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { SettingsForm } from '@/components/settings/settings-form';
import { BrandingCard } from '@/components/settings/branding-card';
import { useAuthStore } from '@/stores/auth';
import { Toaster } from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';
import { hasMinRole, type UserRole } from '@/types/roles';

export default function SettingsPage() {
  const { user } = useAuthStore();

  if (!user) {
    return null;
  }

  // Route guard: system settings is admin-only. The write APIs already return
  // 403 for lower roles (defense-in-depth), but the page must not render its
  // config UI to non-admins who navigate here directly.
  const role = (user.role || 'employee') as UserRole;
  if (!hasMinRole(role, 'admin')) {
    return (
      <DashboardLayout>
        <Toaster position="top-center" />
        <div className="min-h-screen fluid-bg">
          <div className="max-w-2xl mx-auto px-4 py-20 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Access restricted</h1>
            <p className="text-muted-foreground">
              System settings are available to administrators only.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Toaster position="top-center" />
      <div className="min-h-screen fluid-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <BrandingCard />
          <SettingsForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
