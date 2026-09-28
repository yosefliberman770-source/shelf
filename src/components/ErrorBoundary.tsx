import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from taking down the app. Data lives in IndexedDB and is unaffected. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
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
            <button className="btn mt-8" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
