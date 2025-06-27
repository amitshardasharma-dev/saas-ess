'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Link,
  Globe,
  AppWindow,
  Info,
  Timer,
  Key,
  Server,
  ToggleLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth';
import toast from 'react-hot-toast';
import { z } from 'zod';

const settingsSchema = z.object({
  next_erp_url: z.string().url('Must be a valid URL'),
  next_public_frappe_url: z.string().url('Must be a valid URL'),
  next_public_frappe_site_name: z.string().min(1, 'Site name is required'),
  next_public_app_name: z.string().min(1, 'App name is required'),
  next_public_app_description: z.string().min(1, 'App description is required'),
  next_public_session_timeout: z.number().min(0, 'Timeout must be a positive number'),
  next_public_remember_me_days: z.number().min(0, 'Days must be a positive number'),
  next_auth_secret: z.string().min(1, 'Auth secret is required'),
  next_auth_url: z.string().url('Must be a valid URL'),
  next_use_erp: z.enum(['yes', 'no']),
  next_custom1: z.string().min(1, 'Custom field is required'),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { user } = useAuthStore();

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/settings', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.status}`);
        }

        const data = await response.json();
        setSettings(data.settings);
      } catch (error) {
        toast.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchSettings();
    }
  }, [user]);

  // Handle input changes
  const handleInputChange = (field: keyof SettingsFormData, value: string | number) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      settingsSchema.parse(settings);
      setErrors({});

      setIsUpdating(true);
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Update failed');
      }

      toast.success('Settings updated successfully!');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      } else {
        toast.error('Failed to update settings. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center text-red-500">Error loading settings</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Settings Display Card */}
        <Card className="mb-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-primary" />
              Application Settings
            </CardTitle>
            <CardDescription className="text-sm">
              System-wide configuration settings
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  label: 'ERP URL',
                  value: settings.next_erp_url,
                  icon: Link,
                  field: 'next_erp_url',
                },
                {
                  label: 'Frappe URL',
                  value: settings.next_public_frappe_url,
                  icon: Globe,
                  field: 'next_public_frappe_url',
                },
                {
                  label: 'Site Name',
                  value: settings.next_public_frappe_site_name,
                  icon: AppWindow,
                  field: 'next_public_frappe_site_name',
                },
                {
                  label: 'App Name',
                  value: settings.next_public_app_name,
                  icon: AppWindow,
                  field: 'next_public_app_name',
                },
                {
                  label: 'App Description',
                  value: settings.next_public_app_description,
                  icon: Info,
                  field: 'next_public_app_description',
                },
                {
                  label: 'Session Timeout',
                  value: settings.next_public_session_timeout,
                  icon: Timer,
                  field: 'next_public_session_timeout',
                },
                {
                  label: 'Remember Me Days',
                  value: settings.next_public_remember_me_days,
                  icon: Timer,
                  field: 'next_public_remember_me_days',
                },
                {
                  label: 'Auth Secret',
                  value: settings.next_auth_secret,
                  icon: Key,
                  field: 'next_auth_secret',
                },
                {
                  label: 'Auth URL',
                  value: settings.next_auth_url,
                  icon: Server,
                  field: 'next_auth_url',
                },
                {
                  label: 'Use ERP',
                  value: settings.next_use_erp,
                  icon: ToggleLeft,
                  field: 'next_use_erp',
                },
                {
                  label: 'Custom Field 1',
                  value: settings.next_custom1,
                  icon: Info,
                  field: 'next_custom1',
                },
              ].map((item) => (
                <div
                  key={item.field}
                  className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <item.icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {item.label}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {item.value}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Settings Update Card */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50">
          <CardHeader className="pb-6 text-center">
            <CardTitle className="flex items-center justify-center gap-3 text-2xl font-bold">
              <Settings className="h-6 w-6 text-primary" />
              Update Settings
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Modify system configuration settings
            </p>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {[
                {
                  label: 'ERP URL',
                  field: 'next_erp_url',
                  type: 'url',
                  placeholder: 'Enter ERP URL',
                },
                {
                  label: 'Frappe URL',
                  field: 'next_public_frappe_url',
                  type: 'url',
                  placeholder: 'Enter Frappe URL',
                },
                {
                  label: 'Site Name',
                  field: 'next_public_frappe_site_name',
                  type: 'text',
                  placeholder: 'Enter site name',
                },
                {
                  label: 'App Name',
                  field: 'next_public_app_name',
                  type: 'text',
                  placeholder: 'Enter app name',
                },
                {
                  label: 'App Description',
                  field: 'next_public_app_description',
                  type: 'text',
                  placeholder: 'Enter app description',
                },
                {
                  label: 'Session Timeout',
                  field: 'next_public_session_timeout',
                  type: 'number',
                  placeholder: 'Enter session timeout',
                },
                {
                  label: 'Remember Me Days',
                  field: 'next_public_remember_me_days',
                  type: 'number',
                  placeholder: 'Enter remember me days',
                },
                {
                  label: 'Auth Secret',
                  field: 'next_auth_secret',
                  type: 'text',
                  placeholder: 'Enter auth secret',
                },
                {
                  label: 'Auth URL',
                  field: 'next_auth_url',
                  type: 'url',
                  placeholder: 'Enter auth URL',
                },
                {
                  label: 'Use ERP',
                  field: 'next_use_erp',
                  type: 'select',
                  options: ['yes', 'no'],
                },
                {
                  label: 'Custom Field 1',
                  field: 'next_custom1',
                  type: 'text',
                  placeholder: 'Enter custom field',
                },
              ].map((item) => (
                <div key={item.field} className="space-y-3">
                  <Label
                    htmlFor={item.field}
                    className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {item.label}
                  </Label>
                  {item.type === 'select' ? (
                    <select
                      id={item.field}
                      value={settings[item.field as keyof SettingsFormData] as string}
                      onChange={(e) =>
                        handleInputChange(item.field as keyof SettingsFormData, e.target.value)
                      }
                      disabled={isUpdating}
                      className="w-full h-12 px-4 text-lg border-2 border-gray-200 rounded-lg focus:border-primary focus:ring-0"
                    >
                      {item.options!.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={item.field}
                      type={item.type}
                      value={settings[item.field as keyof SettingsFormData] as string | number}
                      onChange={(e) =>
                        handleInputChange(
                          item.field as keyof SettingsFormData,
                          item.type === 'number' ? Number(e.target.value) : e.target.value
                        )
                      }
                      disabled={isUpdating}
                      placeholder={item.placeholder}
                      className={`h-12 text-lg border-2 transition-all focus:border-primary ${
                        errors[item.field] ? 'border-destructive' : 'border-gray-200'
                      }`}
                    />
                  )}
                  {errors[item.field] && (
                    <p className="text-sm text-destructive font-medium">
                      {errors[item.field]}
                    </p>
                  )}
                </div>
              ))}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all"
                >
                  {isUpdating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3" />
                      Updating Settings...
                    </>
                  ) : (
                    <>
                      <Settings className="h-5 w-5 mr-3" />
                      Update Settings
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}