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
import { WS_URL, getWsUrl } from '../config/api';

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
  // aiAnalyticsVersions: { [deviceId]: number } - bump khi co AI event
  const [aiAnalyticsVersions, setAiAnalyticsVersions] = useState({});

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

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

    if (ev.category === 'ai_update') {
      // AI analytics events: bump version for device
      const deviceId = ev.device_id;
      if (deviceId) {
        setAiAnalyticsVersions((prev) => ({
          ...prev,
          [deviceId]: (prev[deviceId] || 0) + 1,
        }));
      }
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
            // Normalize to Unix seconds: if > 1e12 it's ms, divide by 1000
            const rawTs = v.ts || v.timestamp || ev.timestamp || Date.now();
            const ts = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
            next[k] = { value: v.value, ts };
          } else {
            const rawTs = ev.timestamp || Date.now();
            const ts = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
            next[k] = { value: v, ts };
          }
        }
      }

      // Flat fields (sensor payload tu kafka)
      const skip = new Set([
        'device_id', 'timestamp', 'ts', 'category', 'entity', 'action',
        'id', 'actor_id', 'payload', 'type', 'data',
      ]);
      const processedKeys = [];
      for (const [k, v] of Object.entries(ev)) {
        if (skip.has(k)) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object') continue;
        const rawTs = ev.timestamp || Date.now();
        const ts = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
        // Strip $ prefix so field names like $humidity match event keys like humidity
        const storageKey = k.replace(/^\$/, '');
        next[storageKey] = { value: v, ts };
        processedKeys.push(storageKey);
      }
      return { ...prev, [deviceId]: next };
    });
  }, []);

  // Connect / reconnect loop
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      connectingRef.current = true;
      if (!mountedRef.current || wsRef.current) {
        connectingRef.current = false;
        return;
      }
      try {
        // Lay WS_URL moi (vi hostname co the thay doi khi user chuyen tu localhost -> LAN)
        const wsUrl = typeof getWsUrl === 'function' ? getWsUrl() : WS_URL;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) {
            try { ws.close(); } catch (_) {}
            connectingRef.current = false;
            return;
          }
          connectingRef.current = false;
          setConnected(true);
          reconnectDelayRef.current = 1000;
          console.debug('[Realtime] WS connected to', wsUrl);
        };

        ws.onmessage = (e) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(e.data);
            // #region agent debug
            fetch('http://127.0.0.1:7721/ingest/65710bb3-39d6-4a6e-af4f-54599ce6de3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5618e8'},body:JSON.stringify({sessionId:'5618e8',location:'RealtimeProvider.js:ws.onmessage',message:'WS message received',data:{deviceId:msg.device_id,msgKeys:Object.keys(msg)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            handleEvent(msg);
          } catch (err) {
            console.warn('[Realtime] Cannot parse message:', err);
          }
        };

        ws.onerror = (err) => {
          // Only log errors when component is still mounted
          if (mountedRef.current) {
            console.warn('[Realtime] WS error:', err && err.message ? err.message : 'unknown');
          }
          connectingRef.current = false;
        };

        ws.onclose = (ev) => {
          connectingRef.current = false;
          // Clear wsRef BEFORE unmount check so reconnect doesn't see stale ws
          wsRef.current = null;
          if (!mountedRef.current) return;
          setConnected(false);
          console.debug(`[Realtime] WS closed (code=${ev?.code}, reason=${ev?.reason || ''}). Reconnecting...`);
          // Backoff max 5s (was 30s) de reconnect nhanh qua LAN khi mang chop chop
          const delay = Math.min(reconnectDelayRef.current, 5000);
          reconnectDelayRef.current = Math.min(Math.max(delay * 2, 1000), 5000);
          reconnectRef.current = setTimeout(connect, delay);
        };
      } catch (err) {
        connectingRef.current = false;
        if (mountedRef.current) {
          console.error('[Realtime] WS connect error:', err);
        }
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    // Visibilitychange: khi tab chuyen tu hidden -> visible, neu WS dang closed
    // thi reset delay va reconnect ngay (truong hop user chuyen tab qua lau)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const isClosed = !wsRef.current ||
          (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN);
        if (isClosed && mountedRef.current) {
          console.debug('[Realtime] Tab visible, forcing reconnect...');
          reconnectDelayRef.current = 500;
          if (reconnectRef.current) {
            clearTimeout(reconnectRef.current);
            reconnectRef.current = null;
          }
          if (wsRef.current) {
            try { wsRef.current.close(); } catch (_) {}
            wsRef.current = null;
          }
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      connectingRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
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

  // forceReconnect: user click nut reconnect -> dong WS + reconnect ngay
  const forceReconnect = useCallback(() => {
    console.debug('[Realtime] forceReconnect called by user');
    reconnectDelayRef.current = 500;
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }
    // Trigger reconnect through the same closure: schedule via setTimeout 100ms
    setTimeout(() => {
      // Re-create connect (use same logic as useEffect)
      const connect = () => {
        connectingRef.current = true;
        if (!mountedRef.current || wsRef.current) {
          connectingRef.current = false;
          return;
        }
        try {
          const wsUrl = typeof getWsUrl === 'function' ? getWsUrl() : WS_URL;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;
          ws.onopen = () => {
            connectingRef.current = false;
            if (!mountedRef.current) { try { ws.close(); } catch (_) {} return; }
            setConnected(true);
            reconnectDelayRef.current = 1000;
          };
          ws.onmessage = (e) => {
            if (!mountedRef.current) return;
            try { handleEvent(JSON.parse(e.data)); } catch (err) {}
          };
          ws.onerror = () => {
            // Only log when mounted
            connectingRef.current = false;
          };
          ws.onclose = () => {
            connectingRef.current = false;
            wsRef.current = null;
            if (!mountedRef.current) return;
            setConnected(false);
            const delay = Math.min(reconnectDelayRef.current, 5000);
            reconnectDelayRef.current = Math.min(Math.max(delay * 2, 1000), 5000);
            reconnectRef.current = setTimeout(connect, delay);
          };
        } catch (err) {
          connectingRef.current = false;
          reconnectRef.current = setTimeout(connect, 3000);
        }
      };
      connect();
    }, 100);
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
      aiAnalyticsVersions,
      getDeviceLatest,
      getLatestByKey,
      forceReconnect,
    }),
    [connected, lastEventAt, latestByDevice, crudVersion, aiAnalyticsVersions, getDeviceLatest, getLatestByKey, forceReconnect],
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

// Hook cho AI Analytics: tra ve AI data cho 1 device (update realtime khong can reload)
export function useAIDeviceData(deviceId) {
  const { aiAnalyticsVersions } = useRealtime();
  const [data, setData] = useState({
    hasAnomalyUpdate: false,
    hasHealthUpdate: false,
    hasProfileUpdate: false,
    hasThresholdUpdate: false,
    lastUpdate: null,
  });

  useEffect(() => {
    if (aiAnalyticsVersions[deviceId]) {
      setData(prev => ({
        hasAnomalyUpdate: true,
        hasHealthUpdate: true,
        hasProfileUpdate: true,
        hasThresholdUpdate: true,
        lastUpdate: Date.now(),
      }));
      // Reset flags after a short delay to allow re-trigger
      const timer = setTimeout(() => {
        setData(prev => ({
          ...prev,
          hasAnomalyUpdate: false,
          hasHealthUpdate: false,
          hasProfileUpdate: false,
          hasThresholdUpdate: false,
        }));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [aiAnalyticsVersions[deviceId], deviceId]);

  return data;
}

// Hook cho AI Analytics: version counter (backward compat)
export function useAIUpdate(deviceId) {
  const { aiAnalyticsVersions } = useRealtime();
  return aiAnalyticsVersions[deviceId] || 0;
}

/**
 * Hook fallback polling khi WS disconnected.
 * - Khi realtime connected: chi can subscribe version (realtime thay the polling)
 * - Khi realtime disconnected: tu dong polling moi `intervalMs` de bu CRUD events
 *
 * Usage:
 *   const roomsVersion = useCrudVersion('room');
 *   useRealtimePolling(roomsVersion, loadRooms, [loadRooms]);
 */
export function useRealtimePolling(version, refetch, deps = [], intervalMs = 30000) {
  const { connected } = useRealtime();
  // Realtime trigger
  useEffect(() => {
    if (version > 0 && connected) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, connected]);

  // Polling fallback when disconnected
  useEffect(() => {
    if (connected) return undefined;
    const id = setInterval(() => {
      try { refetch(); } catch (e) { /* swallow */ }
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, intervalMs, ...deps]);
}