import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';

// Employee's own onboarding checklist ("My Onboarding").
export default function MyOnboardingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome aboard — let&apos;s get you set up to volunteer.
        </p>
      </div>
      <OnboardingChecklist />
    </div>
  );
}
