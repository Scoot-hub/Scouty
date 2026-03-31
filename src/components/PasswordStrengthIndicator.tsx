import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

const RULES = [
  { key: 'minLength', test: (p: string) => p.length >= 8 },
  { key: 'lowercase', test: (p: string) => /[a-z]/.test(p) },
  { key: 'uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'symbol', test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
] as const;

export function validatePassword(password: string): boolean {
  return RULES.every(r => r.test(password));
}

export default function PasswordStrengthIndicator({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return null;

  const passed = RULES.filter(r => r.test(password)).length;
  const strength = passed <= 2 ? 'weak' : passed <= 4 ? 'medium' : 'strong';
  const colors = { weak: 'bg-red-500', medium: 'bg-yellow-500', strong: 'bg-green-500' };

  return (
    <div className="space-y-2 mt-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < passed ? colors[strength] : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Rules checklist */}
      <ul className="space-y-0.5">
        {RULES.map(rule => {
          const ok = rule.test(password);
          return (
            <li key={rule.key} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-green-500' : 'text-muted-foreground'}`}>
              {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {t(`auth.pwd_rule_${rule.key}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
