'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { SettingsForm } from '@/components/settings/settings-form';
import { useAuthStore } from '@/stores/auth';
import { Toaster } from 'react-hot-toast';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();

  if (!user) {
    return null;
  }
 
  return (
    <DashboardLayout>
      <Toaster position="top-center" />
      <div className="min-h-screen fluid-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <SettingsForm />
        </div>
      </div>
    </DashboardLayout>
  );
}