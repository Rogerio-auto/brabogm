import React from 'react';
import { LucideIcon } from 'lucide-react';

type StatCardProps = {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  description?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
};

const colorMap = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
};

export default function StatCard({ title, value, icon: Icon, description, color = 'blue' }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{title}</span>
        {Icon && <Icon size={24} />}
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {description && <p className="text-xs mt-1 opacity-70">{description}</p>}
    </div>
  );
}
