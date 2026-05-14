import type { RoleTemplate } from './wyscout-analysis';

const STORAGE_KEY = 'wyscout-custom-profiles';

function makeKey(name: string): string {
  return 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Math.random().toString(36).slice(2, 6);
}

export function loadCustomProfiles(): RoleTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(p => p && p.key && p.template) : [];
  } catch {
    return [];
  }
}

export function saveCustomProfiles(profiles: RoleTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch { /* quota / privacy mode — ignore */ }
}

export function upsertCustomProfile(profile: Omit<RoleTemplate, 'key' | 'isCustom' | 'createdAt'> & { key?: string }): RoleTemplate {
  const current = loadCustomProfiles();
  const key = profile.key || makeKey(profile.label);
  const next: RoleTemplate = {
    ...profile,
    key,
    isCustom: true,
    createdAt: Date.now(),
  };
  const idx = current.findIndex(p => p.key === key);
  if (idx >= 0) current[idx] = next;
  else current.push(next);
  saveCustomProfiles(current);
  return next;
}

export function deleteCustomProfile(key: string): RoleTemplate[] {
  const filtered = loadCustomProfiles().filter(p => p.key !== key);
  saveCustomProfiles(filtered);
  return filtered;
}
