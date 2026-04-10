'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { CreateTenantInput, PlatformPlan } from '@/types/platform'
import { ChevronLeft, ChevronRight, Building2, User, CreditCard, Check } from 'lucide-react'

interface TenantCreateWizardProps {
  plans: PlatformPlan[]
  onSubmit: (input: CreateTenantInput) => Promise<void>
  onCancel: () => void
}

const STEP_LABELS = [
  { label: 'Company Details', icon: Building2 },
  { label: 'Admin User', icon: User },
  { label: 'Plan & Modules', icon: CreditCard },
]

const ALL_MODULES = [
  { value: 'leave', label: 'Leave Management' },
  { value: 'expense', label: 'Expense Claims' },
  { value: 'timesheets', label: 'Timesheets' },
  { value: 'documents', label: 'Documents' },
  { value: 'appraisals', label: 'Appraisals' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'team_calendar', label: 'Team Calendar' },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function TenantCreateWizard({ plans, onSubmit, onCancel }: TenantCreateWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Step 1 fields
  const [companyName, setCompanyName] = useState('')
  const [companySlug, setCompanySlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  // Step 2 fields
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  // Step 3 fields
  const [selectedPlanSlug, setSelectedPlanSlug] = useState(plans[0]?.slug || 'free')
  const [modulesEnabled, setModulesEnabled] = useState<string[]>(
    plans[0]?.modules_allowed || ['leave', 'expense']
  )

  const handleNameChange = (val: string) => {
    setCompanyName(val)
    if (!slugManuallyEdited) {
      setCompanySlug(slugify(val))
    }
  }

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true)
    setCompanySlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  const handlePlanChange = (planSlug: string) => {
    setSelectedPlanSlug(planSlug)
    const plan = plans.find(p => p.slug === planSlug)
    if (plan) {
      setModulesEnabled([...plan.modules_allowed])
    }
  }

  const toggleModule = (mod: string) => {
    setModulesEnabled(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    )
  }

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {}
    if (s === 1) {
      if (!companyName.trim()) errs.companyName = 'Company name is required'
      if (!companySlug.trim()) errs.companySlug = 'Company slug is required'
      else if (!/^[a-z0-9-]+$/.test(companySlug)) errs.companySlug = 'Slug must be lowercase letters, numbers, and hyphens only'
    }
    if (s === 2) {
      if (!adminName.trim()) errs.adminName = 'Admin name is required'
      if (!adminEmail.trim()) errs.adminEmail = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) errs.adminEmail = 'Enter a valid email address'
      if (!adminPassword) errs.adminPassword = 'Password is required'
      else if (adminPassword.length < 8) errs.adminPassword = 'Password must be at least 8 characters'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (validateStep(step)) setStep(s => s + 1)
  }

  const handleBack = () => {
    setErrors({})
    setStep(s => s - 1)
  }

  const handleSubmit = async () => {
    if (!validateStep(step)) return
    setSubmitting(true)
    try {
      await onSubmit({
        company_name: companyName.trim(),
        company_slug: companySlug.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
        admin_name: adminName.trim(),
        plan_slug: selectedPlanSlug,
        modules_enabled: modulesEnabled,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const selectedPlan = plans.find(p => p.slug === selectedPlanSlug)

  return (
    <form onSubmit={e => e.preventDefault()} className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((s, idx) => {
          const stepNum = idx + 1
          const isComplete = step > stepNum
          const isCurrent = step === stepNum
          const Icon = s.icon
          return (
            <div key={stepNum} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isComplete
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-muted text-muted-foreground bg-background'
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span
                  className={`text-xs mt-1 font-medium ${
                    isCurrent ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-4 rounded ${
                    step > stepNum ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step 1: Company Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name <span className="text-red-500">*</span></Label>
            <Input
              id="companyName"
              placeholder="Acme Corporation"
              value={companyName}
              onChange={e => handleNameChange(e.target.value)}
            />
            {errors.companyName && <p className="text-xs text-red-500">{errors.companyName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="companySlug">
              Company Slug <span className="text-red-500">*</span>
            </Label>
            <Input
              id="companySlug"
              placeholder="acme-corporation"
              value={companySlug}
              onChange={e => handleSlugChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier used in URLs. Lowercase letters, numbers, and hyphens only.
            </p>
            {errors.companySlug && <p className="text-xs text-red-500">{errors.companySlug}</p>}
          </div>
        </div>
      )}

      {/* Step 2: Admin User */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminName">Full Name <span className="text-red-500">*</span></Label>
            <Input
              id="adminName"
              placeholder="Jane Smith"
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
            />
            {errors.adminName && <p className="text-xs text-red-500">{errors.adminName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Email Address <span className="text-red-500">*</span></Label>
            <Input
              id="adminEmail"
              type="email"
              placeholder="admin@acme.com"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
            />
            {errors.adminEmail && <p className="text-xs text-red-500">{errors.adminEmail}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminPassword">Password <span className="text-red-500">*</span></Label>
            <Input
              id="adminPassword"
              type="password"
              placeholder="Min. 8 characters"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
            />
            {errors.adminPassword && <p className="text-xs text-red-500">{errors.adminPassword}</p>}
          </div>
        </div>
      )}

      {/* Step 3: Plan & Modules */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Plan Selector */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Plan</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plans.map(plan => (
                <div
                  key={plan.slug}
                  onClick={() => handlePlanChange(plan.slug)}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                    selectedPlanSlug === plan.slug
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-foreground">{plan.name}</span>
                    {selectedPlanSlug === plan.slug && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {plan.max_users} users &middot; {plan.max_storage_mb >= 1000
                      ? `${plan.max_storage_mb / 1000} GB`
                      : `${plan.max_storage_mb} MB`} storage
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {plan.price_monthly === 0
                      ? 'Free'
                      : `$${plan.price_monthly}/mo`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Module Checkboxes */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Enabled Modules</Label>
            {selectedPlan && (
              <p className="text-xs text-muted-foreground">
                Pre-selected based on {selectedPlan.name} plan. Uncheck to restrict access.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_MODULES.map(mod => {
                const allowedByPlan = selectedPlan?.modules_allowed.includes(mod.value) ?? false
                return (
                  <div key={mod.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`mod-${mod.value}`}
                      checked={modulesEnabled.includes(mod.value)}
                      onCheckedChange={() => toggleModule(mod.value)}
                      disabled={!allowedByPlan}
                    />
                    <Label
                      htmlFor={`mod-${mod.value}`}
                      className={`text-sm cursor-pointer ${
                        !allowedByPlan ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {mod.label}
                    </Label>
                    {!allowedByPlan && (
                      <span className="text-xs text-muted-foreground">(not in plan)</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={step === 1 ? onCancel : handleBack}>
          {step === 1 ? 'Cancel' : (
            <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>
          )}
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block" />
                Creating...
              </>
            ) : (
              'Create Tenant'
            )}
          </Button>
        )}
      </div>
    </form>
  )
}
