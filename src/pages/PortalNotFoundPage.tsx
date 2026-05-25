/**
 * PortalNotFoundPage
 *
 * Shown when hostname resolution fails (tenant_not_found or network_error).
 * Zero tenant data leaked — generic message only.
 */

export default function PortalNotFoundPage({ reason }: { reason: 'tenant_not_found' | 'network_error' }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6 text-2xl">
          <span className="text-zinc-500">!</span>
        </div>
        <h1 className="text-white text-xl font-bold mb-2">
          {reason === 'network_error' ? 'Connection error' : 'Portal not found'}
        </h1>
        <p className="text-zinc-500 text-sm leading-relaxed">
          {reason === 'network_error'
            ? 'We could not reach the portal. Check your connection and try again.'
            : 'This portal is not configured. Contact support.'}
        </p>
        {reason === 'network_error' && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 bg-zinc-800 text-white text-sm rounded-xl hover:bg-zinc-700 transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
