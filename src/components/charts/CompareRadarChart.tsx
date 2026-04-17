import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@/lib/player-stats';
import { PlayerAvatar } from '@/components/ui/player-avatar';

interface ComparePlayer {
  id: string;
  name: string;
  photo_url?: string | null;
}

interface CompareRadarChartProps {
  radarData: Record<string, string | number>[];
  players: ComparePlayer[];
}

export default function CompareRadarChart({ radarData, players }: CompareRadarChartProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="60%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {players.map((p, i) => (
              <Radar key={p.id} name={p.name} dataKey={p.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        {players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
            <span className="text-xs font-medium">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
