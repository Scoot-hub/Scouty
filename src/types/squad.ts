export interface SquadPlayer {
  id: string;
  organization_id: string;
  name: string;
  photo_url?: string | null;
  date_of_birth?: string | null;
  nationality: string;
  club: string;
  league: string;
  foot: string;
  market_value?: string | null;
  position: string;
  position_secondaire?: string | null;
  jersey_number?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  monthly_salary?: number | null;
  status: SquadPlayerStatus;
  agent_name: string;
  agent_phone: string;
  agent_email: string;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SquadPlayerStatus = 'active' | 'injured' | 'loaned_out' | 'loaned_in' | 'suspended';

export const SQUAD_STATUSES: SquadPlayerStatus[] = ['active', 'injured', 'loaned_out', 'loaned_in', 'suspended'];

export function getSquadPlayerAge(player: SquadPlayer): number | null {
  if (!player.date_of_birth) return null;
  const dob = new Date(player.date_of_birth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function getContractMonthsRemaining(contractEnd?: string | null): number | null {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const now = new Date();
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return months;
}
