import { Component, type ReactNode } from 'react';

/** Stops one broken card or page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; resetKey?: unknown }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('VitalNest UI error:', err); }
  componentDidUpdate(prev: { resetKey?: unknown }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="mx-4 mt-6 rounded-3xl bg-white p-5 text-center shadow-sm dark:bg-night-2">
        <div className="text-[1.5rem]">⚠️</div>
        <div className="mt-1 font-bold">Something went wrong on this screen</div>
        <p className="mt-1 text-[0.8125rem] text-slate-500">Your data is safe. Go back or reload the app.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => history.back()} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold dark:bg-white/5">Back</button>
          <button onClick={() => location.reload()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Reload</button>
        </div>
      </div>
    );
  }
}
