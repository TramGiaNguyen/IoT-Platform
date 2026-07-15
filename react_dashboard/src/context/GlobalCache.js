import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { fetchDevices, fetchDashboards, fetchRules, fetchRooms } from '../services';
import axios from 'axios';
import { API_BASE } from '../config/api';

const GlobalCacheContext = createContext(null);

const INITIAL_CACHE = {
  devices: [],
  dashboards: [],
  rooms: [],
  rules: [],
  hourlyStats: [],
  dailyStats: [],
};

const CACHE_TTL_MS = 60_000; // 60 seconds
const PREFIX = 'gc:v1';
const SAVE_DEBOUNCE_MS = 1000;

const _storageKey = (token) => {
  if (!token) return `${PREFIX}:anon`;
  try { return `${PREFIX}:${btoa(token).replace(/=/g, '')}`; } catch (_) { return `${PREFIX}:anon`; }
};

// ── localStorage helpers ───────────────────────────────────────────────────────

const loadFromStorage = (token) => {
  const key = _storageKey(token);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (data && Date.now() - ts < CACHE_TTL_MS) return data;
  } catch {}
  return null;
};

let _saveTimer = null;
const saveToStorage = (token, data) => {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(_storageKey(token), JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {
      // localStorage full or unavailable — ignore silently
    }
  }, SAVE_DEBOUNCE_MS);
};

const clearStorage = (token) => {
  try { localStorage.removeItem(_storageKey(token)); } catch {}
};

// ── Provider ───────────────────────────────────────────────────────────────────

export function GlobalCacheProvider({ children, token }) {
  const [cache, setCache] = useState(INITIAL_CACHE);
  const [cacheTimestamp, setCacheTimestamp] = useState(0);
  const initialized = useRef(false);
  const initializing = useRef(false);
  const abortRef = useRef(null);

  const isCacheFresh = cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL_MS);

  // ── fetchFreshData: gọi API, cập nhật state + localStorage ─────────────────

  const fetchFreshData = useCallback(async (options = {}) => {
    const { context = null, userInfo = null } = options;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    initializing.current = true;

    // Compute workspace-aware IDs from context string
    let workspaceId = null;
    if (context === 'nhom') {
      workspaceId = userInfo?.primary_nhom_id || null;
    }

    try {
      const results = await Promise.allSettled([
        fetchDevices(token, {
          signal: abortRef.current.signal,
          params: context ? { scope: context } : {},
        }),
        fetchDashboards(token, workspaceId, { signal: abortRef.current.signal }),
        fetchRooms(token, workspaceId, { signal: abortRef.current.signal }),
        fetchRules(token, undefined, workspaceId, { signal: abortRef.current.signal }),
        axios.get(`${API_BASE}/stats/hourly`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { hours: 24, ...(workspaceId ? { workspace_id: workspaceId } : {}) },
          timeout: 5000,
          signal: abortRef.current.signal,
        }).catch(() => ({ data: { stats: [] } })),
        axios.get(`${API_BASE}/stats/daily`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { days: 7, ...(workspaceId ? { workspace_id: workspaceId } : {}) },
          timeout: 5000,
          signal: abortRef.current.signal,
        }).catch(() => ({ data: { stats: [] } })),
      ]);

      const [devicesRes, dashboardsRes, roomsRes, rulesRes, hourlyRes, dailyRes] = results;

      const _rooms = roomsRes.status === 'fulfilled'
        ? (roomsRes.value.data.rooms || roomsRes.value.data || [])
        : [];
      const _rules = rulesRes.status === 'fulfilled'
        ? (rulesRes.value.data?.rules || [])
        : [];

      const next = {
        devices:     devicesRes.status    === 'fulfilled' ? (devicesRes.value.data?.devices    || []) : [],
        dashboards: dashboardsRes.status === 'fulfilled' ? (dashboardsRes.value.data?.dashboards || []) : [],
        rooms:      _rooms,
        rules:      _rules,
        hourlyStats: hourlyRes.status    === 'fulfilled' ? (hourlyRes.value.data?.stats     || []) : [],
        dailyStats:  dailyRes.status     === 'fulfilled' ? (dailyRes.value.data?.stats     || []) : [],
        workspaceContext: context,
      };
      setCache(next);
      setCacheTimestamp(Date.now());
      initialized.current = true;
      saveToStorage(token, next);
    } catch (err) {
      console.error('[GlobalCache] initialize failed:', err);
    } finally {
      initializing.current = false;
    }
  }, [token]);

  // ── initialize: hydrate localStorage → instant render → background refresh ──

  const initialize = useCallback(async () => {
    if (!token || initializing.current) return;
    if (!isCacheFresh || !initialized.current) {
      const fromStorage = loadFromStorage(token);
      console.debug('[DEBUG-B4BD18] GlobalCache initialize: fromStorage', {
        hasData: !!fromStorage,
        'fromStorage.devices length': fromStorage?.devices?.length,
        isCacheFresh,
        initialized: initialized.current,
      });
      if (fromStorage && !initialized.current) {
        console.log('[DBG-ca9780] GlobalCache.initialize fromStorage', { devicesLen: fromStorage.devices?.length, devicesSample: fromStorage.devices?.slice(0,2).map(d=>({id:d.ma_thiet_bi||d.device_id,nhom:d.nhom_id,owner:d.nguoi_so_huu_id})), storedContext: fromStorage.workspaceContext });
        setCache(fromStorage);
        setCacheTimestamp(Date.now());
        fetchFreshData();
        return;
      }
      await fetchFreshData();
    }
  }, [token, isCacheFresh, fetchFreshData]);

  // Initialize on mount if token available and not yet initialized
  useEffect(() => {
    if (token && !initialized.current) {
      initialize();
    }
  }, [token, initialize]);

  // ── updateCache: merge state + debounced save ───────────────────────────────

  const updateCache = useCallback((patch) => {
    setCache(prev => {
      const next = { ...prev, ...patch };
      console.debug('[DEBUG-B4BD18] updateCache: patching cache', {
        patchKeys: Object.keys(patch),
        'patch.devices length': patch.devices?.length,
        'patch.devices[0]': patch.devices?.[0],
        'next.devices length': next.devices?.length,
      });
      saveToStorage(token, next);
      return next;
    });
    setCacheTimestamp(Date.now());
  }, [token]);

  // ── refetch: gọi lại API với options mới (vd đổi workspace context) ─────────
  const refetch = useCallback(async (options = {}) => {
    if (!token) return;
    await fetchFreshData(options);
  }, [token, fetchFreshData]);

  // ── clearCache ───────────────────────────────────────────────────────────────

  const clearCache = useCallback(() => {
    setCache(INITIAL_CACHE);
    setCacheTimestamp(0);
    initialized.current = false;
    initializing.current = false;
    clearStorage(token);
  }, [token]);

  const value = {
    cache,
    token,
    updateCache,
    clearCache,
    refetch,
    isInitialized: initialized.current,
    isCacheFresh,
    initialize,
  };

  return (
    <GlobalCacheContext.Provider value={value}>
      {children}
    </GlobalCacheContext.Provider>
  );
}

export function useGlobalCache() {
  const ctx = useContext(GlobalCacheContext);
  if (!ctx) {
    throw new Error('useGlobalCache must be used inside GlobalCacheProvider');
  }
  return ctx;
}

// ── Realtime extensions (RealtimeProvider goi vao) ─────────────────────────

/**
 * Merge 1 sensor value moi vao device trong cache.
 * - deviceId: id cua thiet bi
 * - key: ten field (Nhiet_do, Do_am, relay_1, ...)
 * - value, ts: gia tri moi nhat
 * Chi tac dong neu device co trong cache (tranh tao "zombie" device).
 */
export function applyRealtimePatch(patch) {
  const { deviceId, key, value, ts } = patch || {};
  if (!deviceId || !key) return;
  const event = new CustomEvent('bdu-realtime-patch', { detail: patch });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(event);
  }
}

/**
 * Tang counter cho 1 entity khi co CRUD event.
 * Page consumer se listen qua useCrudVersion (trong RealtimeProvider).
 * Day la ham tien ich cho cac page muon goi thu cong neu can.
 */
export function bumpEntity(entity) {
  const event = new CustomEvent('bdu-realtime-bump', { detail: { entity } });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(event);
  }
}
