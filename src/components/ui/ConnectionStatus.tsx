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
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-800',
    dotColor: 'bg-green-500'
  },
  connecting: {
    color: 'blue',
    icon: '🔄',
    text: 'Connecting',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
    dotColor: 'bg-blue-500'
  },
  error: {
    color: 'red',
    icon: '❌',
    text: 'Error',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-800',
    dotColor: 'bg-red-500'
  },
  disconnected: {
    color: 'gray',
    icon: '⚫',
    text: 'Disconnected',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-800',
    dotColor: 'bg-gray-500'
  },
  rate_limited: {
    color: 'yellow',
    icon: '⚠️',
    text: 'Rate Limited',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-800',
    dotColor: 'bg-yellow-500'
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
            className="text-sm px-2 py-1 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {error && (
        <p className={`mt-2 text-xs ${config.textColor} opacity-75`}>{error}</p>
      )}

      {lastUpdated && (
        <p className="mt-1 text-xs text-gray-500">
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

export function ConnectionStatusBar({ statuses }: { statuses: Map<string, ConnectionState> }) {
  const chains = ['Bitcoin', 'Ethereum', 'Pulsechain', 'Base', 'Solana'];

  return (
    <div className="flex items-center space-x-4 p-2 bg-gray-50 rounded-lg">
      {chains.map(chain => {
        const status = statuses.get(chain.toLowerCase()) || 'disconnected';
        const config = statusConfig[status];

        return (
          <div key={chain} className="flex items-center space-x-1">
            <ChainStatusIndicator status={status} size="sm" />
            <span className="text-xs text-gray-600">{chain}</span>
          </div>
        );
      })}
    </div>
  );
}