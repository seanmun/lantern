'use client';

import { useMemo } from 'react';
import { movingAverage } from '@/utils/hexMath';
import { LineChart } from './LineChart';

interface PayoutHistoryChartProps {
  series: number[];   // daily payout per T-Share, index = HEX day
  color: string;
  label: string;
  assumption: number; // the estimator's payout assumption, drawn as a reference line
}

const SMOOTHING_DAYS = 7;

/** Daily payout per T-Share (7-day average) with the estimator's assumption. */
export function PayoutHistoryChart({ series, color, label, assumption }: PayoutHistoryChartProps) {
  const points = useMemo(
    () => movingAverage(series, SMOOTHING_DAYS).map((value, day) => ({ day, value })).slice(1),
    [series]
  );

  return (
    <LineChart
      title={`Daily payout per T-Share (${SMOOTHING_DAYS}-day avg)`}
      series={[{ key: 'payout', label, color, points }]}
      formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 3 })} HEX`}
      formatAxis={(v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      reference={{ value: assumption, label: `your assumption ${assumption.toFixed(3)}` }}
    />
  );
}
