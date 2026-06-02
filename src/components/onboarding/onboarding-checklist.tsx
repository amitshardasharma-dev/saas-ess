'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLabels } from '@/hooks/use-labels';
import type {
  OnboardingState,
  OnboardingStep,
  OnboardingStepStatus,
} from '@/types/onboarding';

interface OnboardingResponse {
  state: OnboardingState | null;
  steps: OnboardingStep[];
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
};

// Bearer auth header — the API (withAuth) requires Authorization: Bearer <token>;
// there is no cookie fallback. Mirrors the pattern used across the app's services.
function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function OnboardingChecklist({ employeeId }: { employeeId?: string }) {
  const { t } = useLabels();
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
      const res = await fetch(`/api/onboarding${qs}`, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
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

  const setStepStatus = useCallback(
    async (id: string, status: OnboardingStepStatus) => {
      await fetch(`/api/onboarding/steps/${id}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      await load();
    },
    [load]
  );

  if (loading) {
    return <p>Loading…</p>;
  }
  if (error) {
    return <p role="alert">Could not load onboarding: {error}</p>;
  }

  const steps = data?.steps ?? [];
  const stateStatus = data?.state?.status ?? 'not_started';

  return (
    <section aria-label={t('onboarding.title')}>
      <h2>{t('onboarding.title')}</h2>
      <p>
        Status: <strong>{STATUS_LABEL[stateStatus] ?? stateStatus}</strong>
      </p>
      {data?.state?.blocked_reason ? (
        <p>Blocked: {data.state.blocked_reason}</p>
      ) : null}

      {steps.length === 0 ? (
        <p>No onboarding steps yet.</p>
      ) : (
        <ul>
          {steps.map((step) => (
            <li key={step.id}>
              <label>
                <input
                  type="checkbox"
                  checked={step.status === 'done'}
                  onChange={(e) =>
                    setStepStatus(step.id, e.target.checked ? 'done' : 'pending')
                  }
                />
                {step.title}
              </label>
              {step.description ? <p>{step.description}</p> : null}
              {step.status !== 'done' ? (
                <button type="button" onClick={() => setStepStatus(step.id, 'skipped')}>
                  Skip
                </button>
              ) : null}
              <span>{step.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
