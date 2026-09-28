import { Component, type ErrorInfo, type ReactNode } from 'react';

const RETRY_KEY = 'shelf.autoRecover';

/**
 * Keeps one broken screen from taking down the app. Data lives in IndexedDB
 * and is unaffected. On the first error for a screen it quietly reloads once
 * (the same fix as tapping Reload); if the error comes back it shows details
 * the user can copy and send.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error; info?: string }> {
  state: { error?: Error; info?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? undefined });
    try {
      const key = `${location.pathname}|${error.message}`;
      const last = JSON.parse(sessionStorage.getItem(RETRY_KEY) ?? 'null') as { key: string; at: number } | null;
      // Recover automatically once per screen+error every 30 seconds.
      if (!last || last.key !== key || Date.now() - last.at > 30_000) {
        sessionStorage.setItem(RETRY_KEY, JSON.stringify({ key, at: Date.now() }));
        location.reload();
      }
    } catch {
      /* storage unavailable: fall back to the manual screen */
    }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined, info: undefined });
  }

  details(): string {
    const e = this.state.error;
    return [
      `Shelf error on ${location.pathname}${location.search}`,
      `${e?.name}: ${e?.message}`,
      (e?.stack ?? '').split('\n').slice(0, 12).join('\n'),
      'Component:',
      (this.state.info ?? '').trim().split('\n').slice(0, 10).join('\n'),
      `Browser: ${navigator.userAgent}`,
      `Build: ${import.meta.env.MODE} ${document.querySelector('script[type=module][src*="assets/"]')?.getAttribute('src') ?? ''}`,
    ].join('\n');
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card">
          <div className="empty">
            <div className="ico">⚠️</div>
            <h3>Something went wrong on this screen</h3>
            <div className="small" style={{ maxWidth: 480 }}>Your reading data is safe — it’s stored separately. Try another section or reload.</div>
            <code className="tiny faint">{this.state.error.message}</code>
            <div className="row wrap mt-8" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => location.reload()}>Reload</button>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(this.details());
                    alert('Copied. Paste it in your message to Claude.');
                  } catch {
                    prompt('Copy this text:', this.details());
                  }
                }}
              >
                Copy error details
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
