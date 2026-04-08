import React, { useEffect, useRef } from 'react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle → logout
const CHECK_INTERVAL_MS = 10000;          // check every 10 seconds

export default function ActivityTracker({ onIdleTimeout }) {
  const lastActivityRef = useRef(Date.now());
  const onIdleTimeoutRef = useRef(onIdleTimeout);

  useEffect(() => { onIdleTimeoutRef.current = onIdleTimeout; }, [onIdleTimeout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        clearInterval(checkInterval);
        onIdleTimeoutRef.current();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearInterval(checkInterval);
    };
  }, []);

  return null;
}
