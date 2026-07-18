import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled application error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-page">
        <section>
          <div className="fatal-error-icon"><AlertTriangle size={34} /></div>
          <h1>حدث خطأ غير متوقع</h1>
          <p>لم تُفقد بياناتك. أعد تحميل الصفحة وحاول مرة أخرى.</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={18} /> إعادة تحميل الصفحة
          </button>
        </section>
      </main>
    );
  }
}
