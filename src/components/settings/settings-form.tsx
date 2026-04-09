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
  Blocks,
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
import { MODULE_IDS, ModuleId } from '@/types/roles';
import { Checkbox } from '@/components/ui/checkbox';

const settingsSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  company_slug: z.string().min(1, 'Company slug is required'),
  bc_enabled: z.boolean(),
  bc_api_url: z.string().optional(),
  bc_company_id: z.string().optional(),
  app_name: z.string().optional(),
  app_description: z.string().optional(),
  session_timeout: z.number().min(0).optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>(['leave', 'expense']);

  const { user } = useAuthStore();

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('ess_access_token')
        const response = await fetch('/api/settings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.status}`);
        }

        const data = await response.json();
        setSettings(data.settings);
        if (Array.isArray(data.settings.modules_enabled)) {
          setEnabledModules(data.settings.modules_enabled);
        }
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

  const handleModuleToggle = (moduleId: ModuleId, checked: boolean) => {
    setEnabledModules(prev =>
      checked ? [...prev, moduleId] : prev.filter(m => m !== moduleId)
    );
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      settingsSchema.parse(settings);
      setErrors({});

      setIsUpdating(true);
      const token = localStorage.getItem('ess_access_token')
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...settings, modules_enabled: enabledModules }),
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
                  label: 'Company Name',
                  value: settings.company_name,
                  icon: AppWindow,
                  field: 'company_name',
                },
                {
                  label: 'Company Slug',
                  value: settings.company_slug,
                  icon: Globe,
                  field: 'company_slug',
                },
                {
                  label: 'BC Enabled',
                  value: settings.bc_enabled ? 'Yes' : 'No',
                  icon: ToggleLeft,
                  field: 'bc_enabled',
                },
                {
                  label: 'BC API URL',
                  value: settings.bc_api_url || 'Not configured',
                  icon: Server,
                  field: 'bc_api_url',
                },
                {
                  label: 'BC Company ID',
                  value: settings.bc_company_id || 'Not configured',
                  icon: Link,
                  field: 'bc_company_id',
                },
                {
                  label: 'App Name',
                  value: settings.app_name || 'ESS System',
                  icon: AppWindow,
                  field: 'app_name',
                },
                {
                  label: 'App Description',
                  value: settings.app_description || '',
                  icon: Info,
                  field: 'app_description',
                },
                {
                  label: 'Session Timeout',
                  value: settings.session_timeout || 3600000,
                  icon: Timer,
                  field: 'session_timeout',
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

        {/* Module Configuration Card */}
        <Card className="mb-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Blocks className="h-5 w-5 text-primary" />
              Enabled Modules
            </CardTitle>
            <CardDescription className="text-sm">
              Toggle which modules are available for your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODULE_IDS.map((moduleId) => {
                const labels: Record<ModuleId, { name: string; desc: string }> = {
                  leave: { name: 'Leave Management', desc: 'Leave applications and approvals' },
                  expense: { name: 'Expense Claims', desc: 'Expense submission and tracking' },
                  timesheets: { name: 'Timesheets', desc: 'Time tracking and approval' },
                  documents: { name: 'Documents', desc: 'Policies and HR documents' },
                  appraisals: { name: 'Appraisals', desc: 'Performance reviews' },
                  contracts: { name: 'Contracts', desc: 'Employment contracts' },
                  team_calendar: { name: 'Team Calendar', desc: 'Team leave calendar view' },
                }
                const label = labels[moduleId]
                return (
                  <div
                    key={moduleId}
                    className="flex items-start space-x-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm"
                  >
                    <Checkbox
                      id={`module-${moduleId}`}
                      checked={enabledModules.includes(moduleId)}
                      onCheckedChange={(checked) =>
                        handleModuleToggle(moduleId, checked === true)
                      }
                      disabled={isUpdating}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`module-${moduleId}`}
                        className="text-sm font-semibold text-gray-900 cursor-pointer"
                      >
                        {label.name}
                      </label>
                      <p className="text-xs text-gray-500 mt-0.5">{label.desc}</p>
                    </div>
                  </div>
                )
              })}
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
                  label: 'App Name',
                  field: 'app_name',
                  type: 'text',
                  placeholder: 'Enter app name',
                },
                {
                  label: 'App Description',
                  field: 'app_description',
                  type: 'text',
                  placeholder: 'Enter app description',
                },
                {
                  label: 'Session Timeout (ms)',
                  field: 'session_timeout',
                  type: 'number',
                  placeholder: 'Enter session timeout in ms',
                },
                {
                  label: 'BC API URL',
                  field: 'bc_api_url',
                  type: 'url',
                  placeholder: 'Enter Business Central API URL',
                },
                {
                  label: 'BC Company ID',
                  field: 'bc_company_id',
                  type: 'text',
                  placeholder: 'Enter BC Company ID',
                },
              ].map((item) => (
                <div key={item.field} className="space-y-3">
                  <Label
                    htmlFor={item.field}
                    className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {item.label}
                  </Label>
                  <Input
                    id={item.field}
                    type={item.type}
                    value={(settings[item.field as keyof SettingsFormData] as string | number) ?? ''}
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