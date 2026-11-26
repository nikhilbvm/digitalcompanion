'use client';

import { useEffect, useState } from 'react';

/** Short branded splash. It is mounted only by the companion page. */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 2000);
    const remove = window.setTimeout(() => setVisible(false), 2450);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`splash-screen ${leaving ? 'splash-leave' : ''}`}
      role="status"
      aria-label="Digital Companion is starting"
    >
      <div className="splash-orb">
        <span>Digital Companion</span>
      </div>
    </div>
  );
}
