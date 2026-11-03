import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMsg, ServerMsg } from "../shared/types";

export type SocketStatus = "connecting" | "open" | "closed";

/** A WebSocket that reconnects with backoff. Pass null to stay disconnected. */
export function useSocket(path: string | null, onMessage: (m: ServerMsg) => void) {
  const cb = useRef(onMessage);
  cb.current = onMessage;
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");

  useEffect(() => {
    if (!path) return;
    let stopped = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      setStatus("connecting");
      const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`);
      ws.current = s;
      s.onopen = () => {
        retry = 0;
        setStatus("open");
      };
      s.onmessage = (e) => {
        try {
          cb.current(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      };
      s.onclose = () => {
        if (stopped) return;
        setStatus("closed");
        timer = window.setTimeout(connect, Math.min(10_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws.current?.close();
    };
  }, [path]);

  const send = useCallback((m: ClientMsg) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return false;
    ws.current.send(JSON.stringify(m));
    return true;
  }, []);

  return { send, status };
}
