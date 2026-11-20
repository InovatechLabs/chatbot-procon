import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ConversationEvents { connected: boolean; waiting: number; revision: number; focus: (id: string | null, bot?: boolean, watchBot?: boolean) => void; refresh: () => void }
export const ConversationEventsContext = createContext<ConversationEvents>({ connected: false, waiting: 0, revision: 0, focus: () => {}, refresh: () => {} });
export const useConversationEvents = () => useContext(ConversationEventsContext);

export function useConversationStream(enabled: boolean) {
  const [query, setQuery] = useState('');
  const focus = useCallback((id: string | null, bot = false, watchBot = false) => {
    const params = new URLSearchParams();
    if (id) params.set(bot ? 'selectedBot' : 'selected', id);
    if (watchBot) params.set('watchBot', 'true');
    setQuery(params.toString());
  }, []);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [revision, setRevision] = useState(0);
  const [notification, setNotification] = useState(false);
  const refreshSnapshots = useCallback(() => setRevision(value => value + 1), []);
  const previous = useRef<{ count: number; last: number | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const stream = new EventSource(`/api/conversations/events${query ? `?${query}` : ''}`);
    const refresh = (event: MessageEvent<string>) => {
      const data: { waiting: number; latestRequestedAt: number | null } = JSON.parse(event.data);
      setConnected(true);
      setWaiting(data.waiting);
      if (previous.current && (data.waiting > previous.current.count || (data.latestRequestedAt !== null && data.latestRequestedAt > (previous.current.last ?? 0)))) setNotification(true);
      previous.current = { count: data.waiting, last: data.latestRequestedAt };
      setRevision(value => value + 1);
    };
    stream.addEventListener('refresh', refresh);
    stream.addEventListener('access-changed', (event: MessageEvent<string>) => {
      stream.close(); setConnected(false); setWaiting(0); setNotification(false); setRevision(value => value + 1);
      if (JSON.parse(event.data).reason === 'session') window.dispatchEvent(new Event('panel-session-expired'));
    });
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, [enabled, query]);
  return { connected, waiting, revision, focus, refresh: refreshSnapshots, notification, dismiss: () => setNotification(false) };
}
