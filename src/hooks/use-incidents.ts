// Live list of active incidents: loads once, then refreshes whenever Supabase Realtime reports a new,
// merged or resolved incident (and every minute, so expired zones drop off the map).

import { useCallback, useEffect, useMemo, useState } from 'react';

import { listActiveIncidents, type Incident } from '@/lib/api';
import type { Zone } from '@/lib/safety';
import { supabase } from '@/lib/supabase';

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listActiveIncidents()
      .then((list) => {
        setIncidents(list);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('incidents-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, refresh)
      .subscribe();
    const timer = setInterval(refresh, 60_000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const zones = useMemo<Zone[]>(
    () =>
      incidents.map((i) => ({
        id: i.id,
        lat: i.lat,
        lng: i.lng,
        radius_m: i.radius_m,
        title: i.title,
        category: i.category,
        severity: i.severity,
      })),
    [incidents]
  );

  return { incidents, zones, refresh, error };
}
