import { useTranslation } from 'react-i18next';
import type { Position } from '@/types/player';

const POSITION_KEYS: Position[] = ['GK', 'DC', 'LD', 'LG', 'MDef', 'MC', 'MO', 'AD', 'AG', 'ATT'];

export function usePositions() {
  const { t } = useTranslation();

  const positions = Object.fromEntries(
    POSITION_KEYS.map(k => [k, t(`positions.${k}`)])
  ) as Record<Position, string>;

  const positionShort = Object.fromEntries(
    POSITION_KEYS.map(k => [k, t(`positions.short_${k}`)])
  ) as Record<Position, string>;

  return { positions, positionShort };
}
