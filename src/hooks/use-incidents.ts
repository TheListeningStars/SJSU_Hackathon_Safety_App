// Live list of active incidents: loads once, then refreshes whenever Supabase Realtime reports a new,
// merged or resolved incident (and every minute, so expired zones drop off the map).

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MapZone } from '@/components/walk-map';
import { listActiveIncidents, type Incident } from '@/lib/api';
import { CATEGORY_LABEL } from '@/lib/safety';
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

  // Same incidents, shaped for <WalkMap zones=…>.
  const mapZones = useMemo<MapZone[]>(
    () =>
      incidents.map((i) => ({
        id: i.id,
        latitude: i.lat,
        longitude: i.lng,
        radius: i.radius_m,
        title: i.title,
        description: CATEGORY_LABEL[i.category] ?? i.summary ?? undefined,
        severity: i.severity,
        category: i.category,
        reports: i.reports_count,
        updatedAt: i.updated_at,
      })),
    [incidents]
  );

  return { incidents, zones, mapZones, refresh, error };
}
