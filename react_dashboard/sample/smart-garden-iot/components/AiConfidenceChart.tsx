import React from 'react';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';

interface AiConfidenceChartProps {
    data: { name: string; value: number }[];
}

const AiConfidenceChart: React.FC<AiConfidenceChartProps> = ({ data }) => {
    return (
        <div className="h-16 w-32">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} barCategoryGap={4}>
                    <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                        {data.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={index === 3 ? '#fbbf24' : '#3b82f6'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default AiConfidenceChart;
