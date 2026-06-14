'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  FileSignature,
  ShieldCheck,
  Upload,
  GraduationCap,
  UserRound,
  Clock,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type {
  OnboardingState,
  OnboardingStep,
  OnboardingStepType,
} from '@/types/onboarding';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/training/progress-bar';

interface OnboardingResponse {
  state: OnboardingState | null;
  steps: OnboardingStep[];
}

// Bearer auth header — the API (withAuth) requires Authorization: Bearer <token>.
function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// Per-step presentation + where the "do this now" CTA routes to. Each typed step
// deep-links to the surface where the volunteer actually completes it; doing the
// action there auto-completes the matching step (see lib/onboarding wiring).
type StepMeta = {
  icon: LucideIcon;
  cta: string | null;
  href: ((s: OnboardingStep) => string) | null;
  /** Volunteer can self-mark (no artifact auto-completes it). */
  selfMark?: boolean;
  /** Completed by staff, not the volunteer. */
  staffMarked?: boolean;
};

const STEP_META: Record<OnboardingStepType, StepMeta> = {
  profile_field: { icon: UserRound, cta: 'Complete profile', href: () => '/dashboard/profile', selfMark: true },
  doc_sign: { icon: FileSignature, cta: 'Review & sign', href: (s) => `/dashboard/documents/${s.ref_id}` },
  doc_ack: { icon: ShieldCheck, cta: 'Read & acknowledge', href: (s) => `/dashboard/documents/${s.ref_id}` },
  certification: { icon: Upload, cta: 'Add certificate', href: () => '/dashboard/compliance' },
  training: { icon: GraduationCap, cta: 'Start training', href: () => '/dashboard/training' },
  manual: { icon: Clock, cta: null, href: null, staffMarked: true },
};

const STATE_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  not_started: { label: 'Not started', variant: 'outline' },
  in_progress: { label: 'In progress', variant: 'secondary' },
  blocked: { label: 'Blocked', variant: 'destructive' },
  completed: { label: 'Completed', variant: 'default' },
};

export function OnboardingChecklist({ employeeId }: { employeeId?: string }) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
      const res = await fetch(`/api/onboarding${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as OnboardingResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const markDone = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await fetch(`/api/onboarding/steps/${id}`, {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: 'done' }),
        });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading your onboarding…</CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive" role="alert">
          Could not load onboarding: {error}
        </CardContent>
      </Card>
    );
  }

  const steps = [...(data?.steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const stateStatus = data?.state?.status ?? 'not_started';
  const total = steps.length;
  const resolved = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const badge = STATE_BADGE[stateStatus] ?? STATE_BADGE.not_started;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Your onboarding</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete each step below to get ready to volunteer with Birch Foundation.
              </p>
            </div>
            <Badge variant={badge.variant} className="text-sm">{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ProgressBar percent={pct} />
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{resolved}</span> of {total} steps complete
          </p>
          {data?.state?.blocked_reason ? (
            <p className="mt-2 text-sm text-destructive">Blocked: {data.state.blocked_reason}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Steps */}
      {total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No onboarding steps assigned yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {steps.map((step, i) => {
              const meta = STEP_META[step.step_type] ?? STEP_META.manual;
              const Icon = meta.icon;
              const isDone = step.status === 'done';
              const isSkipped = step.status === 'skipped';
              // doc_sign / doc_ack need a ref_id to build the link; the others
              // (profile / certification / training) route to a fixed surface.
              const needsRef = step.step_type === 'doc_sign' || step.step_type === 'doc_ack';
              const href = meta.href && (!needsRef || step.ref_id) ? meta.href(step) : null;

              return (
                <div key={step.id} className="flex items-start gap-4 p-4">
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" aria-label="Done" />
                    ) : (
                      <span className="relative inline-flex h-6 w-6 items-center justify-center">
                        <Circle className="h-6 w-6 text-muted-foreground/30" />
                        <span className="absolute text-xs font-medium text-muted-foreground">{i + 1}</span>
                      </span>
                    )}
                  </div>

                  {/* Title + description */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className={`font-medium ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {step.title}
                      </p>
                    </div>
                    {step.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                    ) : null}
                  </div>

                  {/* Action / status */}
                  <div className="flex shrink-0 items-center gap-2">
                    {isDone ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Done</Badge>
                    ) : isSkipped ? (
                      <Badge variant="outline">Skipped</Badge>
                    ) : meta.staffMarked ? (
                      <Badge variant="outline">Awaiting staff</Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        {href && meta.cta ? (
                          <Button asChild size="sm">
                            <Link href={href}>
                              {meta.cta}
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : null}
                        {meta.selfMark ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === step.id}
                            onClick={() => markDone(step.id)}
                          >
                            {busyId === step.id ? 'Saving…' : 'Mark done'}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
