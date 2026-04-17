import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';

interface EvolutionChartProps {
  data: { date: string; niveau: number; potentiel: number }[];
  levelLabel: string;
  potentialLabel: string;
}

export default function EvolutionChart({ data, levelLabel, potentialLabel }: EvolutionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
        <Legend />
        <Line type="monotone" dataKey="niveau" stroke="hsl(var(--success))" strokeWidth={2.5} name={levelLabel} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="potentiel" stroke="hsl(var(--primary))" strokeWidth={2.5} name={potentialLabel} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
