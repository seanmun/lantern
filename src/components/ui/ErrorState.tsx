'use client';

import React from 'react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | string;
  onRetry?: () => void;
  suggestions?: string[];
  variant?: 'default' | 'minimal' | 'card';
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  suggestions = [],
  variant = 'default'
}: ErrorStateProps) {
  const errorMessage = message || (error instanceof Error ? error.message : error) || 'An unexpected error occurred';

  if (variant === 'minimal') {
    return (
      <div className="flex items-center justify-between p-3 bg-bad-soft border border-bad-line rounded-lg">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-bad">{errorMessage}</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm text-bad hover:text-bad font-medium"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="bg-surface border border-bad-line rounded-lg p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-lg font-medium text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted">{errorMessage}</p>

            {suggestions.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-ink/85">Try these suggestions:</p>
                <ul className="mt-2 text-sm text-muted list-disc list-inside space-y-1">
                  {suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-4 px-4 py-2 bg-down text-white rounded-md hover:bg-down transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <svg className="mx-auto h-12 w-12 text-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 className="mt-2 text-sm font-medium text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{errorMessage}</p>

      {suggestions.length > 0 && (
        <div className="mt-4 text-left max-w-md mx-auto">
          <p className="text-sm font-medium text-ink/85">Suggestions:</p>
          <ul className="mt-2 text-sm text-muted list-disc list-inside">
            {suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {onRetry && (
        <div className="mt-6">
          <button
            onClick={onRetry}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-info-solid hover:bg-info-solid focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-info-solid"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

interface ChainErrorProps {
  chain: string;
  error: string;
  onRetry: () => void;
}

export function ChainError({ chain, error, onRetry }: ChainErrorProps) {
  const suggestions = getChainSpecificSuggestions(chain, error);

  return (
    <div className="bg-bad-soft border border-bad-line rounded-lg p-4">
      <div className="flex items-start">
        <svg className="w-5 h-5 text-bad mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-bad">{chain} Connection Error</h3>
          <p className="mt-1 text-sm text-bad">{error}</p>

          {suggestions.length > 0 && (
            <ul className="mt-2 text-xs text-bad space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index}>• {suggestion}</li>
              ))}
            </ul>
          )}

          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-bad hover:text-bad"
          >
            Retry Connection →
          </button>
        </div>
      </div>
    </div>
  );
}

function getChainSpecificSuggestions(chain: string, error: string): string[] {
  const suggestions: string[] = [];

  if (error.toLowerCase().includes('rate limit')) {
    suggestions.push('Wait a moment before retrying');
    suggestions.push('Consider using a different RPC endpoint');
  }

  if (error.toLowerCase().includes('timeout')) {
    suggestions.push('Check your internet connection');
    suggestions.push(`${chain} network might be congested`);
  }

  if (error.toLowerCase().includes('invalid address')) {
    suggestions.push('Verify the wallet address format');
    suggestions.push(`Ensure address is valid for ${chain}`);
  }

  if (chain.toLowerCase() === 'bitcoin' && error.toLowerCase().includes('api')) {
    suggestions.push('Blockstream API might be down');
    suggestions.push('Try again in a few minutes');
  }

  if (chain.toLowerCase() === 'ethereum' && error.toLowerCase().includes('api')) {
    suggestions.push('Check your Alchemy/Infura API key');
    suggestions.push('Verify API key has correct permissions');
  }

  return suggestions;
}