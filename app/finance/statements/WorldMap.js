'use client';
import { useEffect, useState } from 'react';

// World map with the countries you spent money in lit up. Map data and projection load from a CDN only when opened.
const CDN = 'https://cdn.jsdelivr.net/npm';
// Natural Earth short names that differ from the standard English country names
const ALIAS = { US: 'United States of America', CZ: 'Czechia', BA: 'Bosnia and Herz.', DO: 'Dominican Rep.', CD: 'Dem. Rep. Congo', CF: 'Central African Rep.', SS: 'S. Sudan', KR: 'South Korea', KP: 'North Korea', MK: 'Macedonia', CI: "Côte d'Ivoire", GQ: 'Eq. Guinea', SZ: 'eSwatini', TR: 'Turkey', RU: 'Russia', VN: 'Vietnam', LA: 'Laos', SY: 'Syria', IR: 'Iran', TZ: 'Tanzania', BO: 'Bolivia', VE: 'Venezuela', MD: 'Moldova', PS: 'Palestine', HK: 'Hong Kong', TW: 'Taiwan' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

export default function WorldMap({ countries }) { // [{ code, name, perDay, days, spend }]
  const [state, setState] = useState({ paths: null, err: null });
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const [geo, topo, world] = await Promise.all([
          import(/* webpackIgnore: true */ `${CDN}/d3-geo@3.1.1/+esm`),
          import(/* webpackIgnore: true */ `${CDN}/topojson-client@3.1.0/+esm`),
          fetch(`${CDN}/world-atlas@2.0.2/countries-110m.json`).then((r) => r.json()),
        ]);
        const fc = topo.feature(world, world.objects.countries);
        fc.features = fc.features.filter((f) => f.properties?.name !== 'Antarctica');
        const proj = geo.geoNaturalEarth1().fitSize([720, 370], fc);
        const path = geo.geoPath(proj);
        const byName = new Map(countries.map((c) => [norm(ALIAS[c.code] || c.name), c]));
        const paths = fc.features.map((f, i) => ({ k: f.id || i, d: path(f), c: byName.get(norm(f.properties?.name)), name: f.properties?.name }));
        if (!off) setState({ paths, err: null });
      } catch (e) { if (!off) setState({ paths: null, err: 'The map could not load. Check your connection.' }); }
    })();
    return () => { off = true; };
  }, [countries]);
  if (state.err) return <p className="muted">{state.err}</p>;
  if (!state.paths) return <div className="map-loading muted">Loading map…</div>;
  return (
    <svg viewBox="0 0 720 370" width="100%" role="img" aria-label={`Countries you spent in: ${countries.map((c) => c.name).join(', ')}`} className="world-map">
      {state.paths.map((p) => (
        <path key={p.k} d={p.d} fill={p.c ? '#4A8FE0' : '#2B3A5C'} stroke={p.c ? '#9CC4F2' : '#4E6290'} strokeWidth={p.c ? 0.8 : 0.5}>
          <title>{p.c ? `${p.c.name}: €${Math.round(p.c.perDay)}/day over ${p.c.days} days` : p.name}</title>
        </path>
      ))}
    </svg>
  );
}
