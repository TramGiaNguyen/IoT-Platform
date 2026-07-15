// react_dashboard/src/context/RealtimeProvider.js
//
// Provider duy nhat mo 1 WebSocket den backend (`/ws/events`). Moi event den:
//   - Sensor events (category=sensor hoac khong co category, tu kafka_event_consumer)
//     -> cap nhat RealtimeDataContext (latestByDevice)
//   - CRUD events (category=crud, tu cac route handler)
//     -> bump CrudInvalidationContext (counter cho moi entity)
//   - Control events (category=control)
//     -> cung du dispatch vao data context (de cap nhat trang thai relay)
//
// Frontend chi subscribe 1 lan, khong mo nhieu WS nhu truoc (giam reconnect storms).

import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import { WS_URL } from '../config/api';

const RealtimeContext = createContext(null);

// ── Helpers ──────────────────────────────────────────────────────────────

const normalizeEvent = (msg) => {
  if (!msg || typeof msg !== 'object') return null;
  // Backward-compat: kafka_event_consumer khong set category
  const category = msg.category || 'sensor';
  return { ...msg, category };
};

// ── Provider ─────────────────────────────────────────────────────────────

export function RealtimeProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState(0);
  // latestByDevice: { [deviceId]: { [dataKey]: { value, ts } } }
  const [latestByDevice, setLatestByDevice] = useState({});
  // crudVersion: { [entity]: number }
  const [crudVersion, setCrudVersion] = useState({});

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const mountedRef = useRef(true);

  // Apply event to state
  const handleEvent = useCallback((msg) => {
    const ev = normalizeEvent(msg);
    if (!ev) return;

    setLastEventAt(Date.now());

    if (ev.type === 'ping') return;

    if (ev.category === 'crud') {
      const entity = ev.entity || 'unknown';
      setCrudVersion((prev) => ({ ...prev, [entity]: (prev[entity] || 0) + 1 }));
      return;
    }

    // Sensor or control event: cap nhat latestByDevice
    // Hai kieu payload:
    //   - Raw: { device_id, timestamp, Nhiet_do: 28.4, ... }
    //   - Envelope: { device_id, timestamp, data: { key: { value, ts } } }
    const deviceId = ev.device_id;
    if (!deviceId) return;

    setLatestByDevice((prev) => {
      const cur = prev[deviceId] || {};
      let next = { ...cur };

      if (ev.data && typeof ev.data === 'object') {
        for (const [k, v] of Object.entries(ev.data)) {
          if (v === null || v === undefined) continue;
          if (typeof v === 'object' && 'value' in v) {
            next[k] = { value: v.value, ts: v.ts || v.timestamp || ev.timestamp || Date.now() };
          } else {
            next[k] = { value: v, ts: ev.timestamp || Date.now() };
          }
        }
      }

      // Flat fields (sensor payload tu kafka)
      const skip = new Set([
        'device_id', 'timestamp', 'ts', 'category', 'entity', 'action',
        'id', 'actor_id', 'payload', 'type', 'data',
      ]);
      for (const [k, v] of Object.entries(ev)) {
        if (skip.has(k)) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object') continue;
        next[k] = { value: v, ts: ev.timestamp || Date.now() };
      }

      return { ...prev, [deviceId]: next };
    });
  }, []);

  // Connect / reconnect loop
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) {
            try { ws.close(); } catch (_) {}
            return;
          }
          setConnected(true);
          reconnectDelayRef.current = 1000;
          console.debug('[Realtime] WS connected');
        };

        ws.onmessage = (e) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(e.data);
            handleEvent(msg);
          } catch (err) {
            console.debug('[Realtime] Cannot parse message:', err);
          }
        };

        ws.onerror = () => {
          // onclose se xu ly reconnect
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          const delay = Math.min(reconnectDelayRef.current, 30000);
          reconnectDelayRef.current = Math.min(delay * 2, 30000);
          reconnectRef.current = setTimeout(connect, delay);
        };
      } catch (err) {
        console.error('[Realtime] WS connect error:', err);
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
        wsRef.current = null;
      }
    };
  }, [handleEvent]);

  // Hook helpers
  const getDeviceLatest = useCallback(
    (deviceId) => latestByDevice[deviceId] || {},
    [latestByDevice],
  );

  const getLatestByKey = useCallback(
    (deviceId, key) => {
      const dev = latestByDevice[deviceId];
      return dev ? dev[key] : undefined;
    },
    [latestByDevice],
  );

  const value = useMemo(
    () => ({
      connected,
      lastEventAt,
      latestByDevice,
      crudVersion,
      getDeviceLatest,
      getLatestByKey,
    }),
    [connected, lastEventAt, latestByDevice, crudVersion, getDeviceLatest, getLatestByKey],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used inside RealtimeProvider');
  }
  return ctx;
}

// Hook tien ich: lay version CRUD cho 1 entity (tang moi khi co event CRUD tuong ung)
export function useCrudVersion(entity) {
  const { crudVersion } = useRealtime();
  return crudVersion[entity] || 0;
}