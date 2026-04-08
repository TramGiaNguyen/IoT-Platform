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
const STORAGE_KEY = 'gc:v1';
const SAVE_DEBOUNCE_MS = 1000;

// ── localStorage helpers ───────────────────────────────────────────────────────

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (data && Date.now() - ts < CACHE_TTL_MS) return data;
  } catch {}
  return null;
};

let _saveTimer = null;
const saveToStorage = (data) => {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {
      // localStorage full or unavailable — ignore silently
    }
  }, SAVE_DEBOUNCE_MS);
};

const clearStorage = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

// ── Provider ───────────────────────────────────────────────────────────────────

export function GlobalCacheProvider({ children, token }) {
  const [cache, setCache] = useState(INITIAL_CACHE);
  const [cacheTimestamp, setCacheTimestamp] = useState(0);
  const initialized = useRef(false);
  const initializing = useRef(false);

  const isCacheFresh = cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL_MS);

  // ── fetchFreshData: gọi API, cập nhật state + localStorage ─────────────────

  const fetchFreshData = useCallback(async () => {
    initializing.current = true;
    try {
      const results = await Promise.allSettled([
        fetchDevices(token),
        fetchDashboards(token),
        fetchRooms(token),
        fetchRules(token),
        axios.get(`${API_BASE}/stats/hourly`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { hours: 24 },
          timeout: 5000,
        }).catch(() => ({ data: { stats: [] } })),
        axios.get(`${API_BASE}/stats/daily`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { days: 7 },
          timeout: 5000,
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
      };

      setCache(next);
      setCacheTimestamp(Date.now());
      initialized.current = true;
      saveToStorage(next);
    } catch (err) {
      console.error('[GlobalCache] initialize failed:', err);
    } finally {
      initializing.current = false;
    }
  }, [token]);

  // ── initialize: hydrate localStorage → instant render → background refresh ──

  const initialize = useCallback(async () => {
    if (!token || initializing.current) return;
    if (isCacheFresh && initialized.current) return;

    // BƯỚC 1: Hydrate từ localStorage — tức thì, không đợi network
    const fromStorage = loadFromStorage();
    if (fromStorage && initialized.current) {
      setCache(fromStorage);
      setCacheTimestamp(Date.now());
      // BƯỚC 2: Refresh background song song
      fetchFreshData();
      return;
    }

    // Chưa có cache → fetch bình thường
    await fetchFreshData();
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
      saveToStorage(next);
      return next;
    });
    setCacheTimestamp(Date.now());
  }, []);

  // ── clearCache ───────────────────────────────────────────────────────────────

  const clearCache = useCallback(() => {
    setCache(INITIAL_CACHE);
    setCacheTimestamp(0);
    initialized.current = false;
    initializing.current = false;
    clearStorage();
  }, []);

  const value = {
    cache,
    token,
    updateCache,
    clearCache,
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
