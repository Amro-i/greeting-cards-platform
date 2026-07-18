import { WifiOff } from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';

export default function NetworkStatusBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="network-status-banner" role="status" aria-live="polite">
      <WifiOff size={17} />
      <span>لا يوجد اتصال بالإنترنت. بعض العمليات لن تعمل حتى يعود الاتصال.</span>
    </div>
  );
}
