'use client';

import React from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'error' | 'disconnected' | 'rate_limited';

interface ConnectionStatusProps {
  chain: string;
  status: ConnectionState;
  error?: string;
  lastUpdated?: Date;
  onRetry?: () => void;
}

const statusConfig = {
  connected: {
    color: 'green',
    icon: '✅',
    text: 'Connected',
    bgColor: 'bg-good-soft',
    borderColor: 'border-good-line',
    textColor: 'text-good',
    dotColor: 'bg-up'
  },
  connecting: {
    color: 'blue',
    icon: '🔄',
    text: 'Connecting',
    bgColor: 'bg-info-soft',
    borderColor: 'border-info-line',
    textColor: 'text-info',
    dotColor: 'bg-info-solid'
  },
  error: {
    color: 'red',
    icon: '❌',
    text: 'Error',
    bgColor: 'bg-bad-soft',
    borderColor: 'border-bad-line',
    textColor: 'text-bad',
    dotColor: 'bg-down'
  },
  disconnected: {
    color: 'gray',
    icon: '⚫',
    text: 'Disconnected',
    bgColor: 'bg-soft/60',
    borderColor: 'border-line',
    textColor: 'text-ink',
    dotColor: 'bg-muted'
  },
  rate_limited: {
    color: 'yellow',
    icon: '⚠️',
    text: 'Rate Limited',
    bgColor: 'bg-warn-soft',
    borderColor: 'border-warn-line',
    textColor: 'text-warn',
    dotColor: 'bg-warn-solid'
  }
};

export function ConnectionStatus({ chain, status, error, lastUpdated, onRetry }: ConnectionStatusProps) {
  const config = statusConfig[status];

  return (
    <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative">
            <div className={`w-2 h-2 ${config.dotColor} rounded-full`} />
            {status === 'connecting' && (
              <div className={`absolute inset-0 w-2 h-2 ${config.dotColor} rounded-full animate-ping`} />
            )}
          </div>
          <span className={`font-medium ${config.textColor}`}>{chain}</span>
          <span className={`text-sm ${config.textColor} opacity-75`}>{config.text}</span>
        </div>

        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="text-sm px-2 py-1 bg-surface border border-bad-line rounded hover:bg-bad-soft transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {error && (
        <p className={`mt-2 text-xs ${config.textColor} opacity-75`}>{error}</p>
      )}

      {lastUpdated && (
        <p className="mt-1 text-xs text-muted">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

interface ChainStatusIndicatorProps {
  status: ConnectionState;
  size?: 'sm' | 'md' | 'lg';
}

export function ChainStatusIndicator({ status, size = 'sm' }: ChainStatusIndicatorProps) {
  const config = statusConfig[status];

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <div className="relative inline-flex items-center">
      <div className={`${sizeClasses[size]} ${config.dotColor} rounded-full`} />
      {status === 'connecting' && (
        <div className={`absolute inset-0 ${sizeClasses[size]} ${config.dotColor} rounded-full animate-ping`} />
      )}
    </div>
  );
}

export function ConnectionStatusBar({
  statuses,
  chains = ['Bitcoin', 'Ethereum', 'Pulsechain', 'Base', 'Robinhood'],
}: {
  statuses: Map<string, ConnectionState>;
  chains?: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-2 bg-soft/60 rounded-lg">
      {chains.map(chain => {
        const status = statuses.get(chain.toLowerCase()) || 'disconnected';
        const config = statusConfig[status];

        return (
          <div key={chain} className="flex items-center space-x-1">
            <ChainStatusIndicator status={status} size="sm" />
            <span className="text-xs text-muted">{chain}</span>
          </div>
        );
      })}
    </div>
  );
}