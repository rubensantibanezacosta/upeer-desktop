import React, { useState } from 'react';
import {
    ComposableMap,
    Geographies,
    Geography,
    Line,
    Marker,
    ZoomableGroup,
} from 'react-simple-maps';
import { Box, Typography } from '@mui/joy';
import worldAtlas from 'world-atlas/countries-110m.json';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PeerStat {
    host: string;
    country: string;
    latencyMs: number | null;
    score: number;
    alive: boolean;
    lat: number | null;
    lon: number | null;
}

interface NetworkMapProps {
    peers: PeerStat[];
    selfLat: number | null;
    selfLon: number | null;
}

// ─── Fallback por nombre de país ──────────────────────────────────────────────

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
    'Germany': [10.45, 51.16], 'DE': [10.45, 51.16],
    'France': [2.21, 46.23], 'FR': [2.21, 46.23],
    'United Kingdom': [-3.44, 55.37], 'UK': [-3.44, 55.37], 'GB': [-3.44, 55.37],
    'Netherlands': [5.29, 52.13], 'NL': [5.29, 52.13],
    'Sweden': [18.64, 60.13], 'SE': [18.64, 60.13],
    'Norway': [8.47, 60.47], 'NO': [8.47, 60.47],
    'Denmark': [9.50, 56.26], 'DK': [9.50, 56.26],
    'Finland': [25.75, 61.92], 'FI': [25.75, 61.92],
    'Poland': [19.14, 51.92], 'PL': [19.14, 51.92],
    'Czech Republic': [15.47, 49.82], 'CZ': [15.47, 49.82],
    'Austria': [14.55, 47.52], 'AT': [14.55, 47.52],
    'Switzerland': [8.23, 46.82], 'CH': [8.23, 46.82],
    'Belgium': [4.47, 50.50], 'BE': [4.47, 50.50],
    'Spain': [-3.75, 40.46], 'ES': [-3.75, 40.46],
    'Italy': [12.57, 41.87], 'IT': [12.57, 41.87],
    'Portugal': [-8.22, 39.40], 'PT': [-8.22, 39.40],
    'Romania': [24.97, 45.94], 'RO': [24.97, 45.94],
    'Ukraine': [31.16, 48.38], 'UA': [31.16, 48.38],
    'Russia': [105.31, 61.52], 'RU': [105.31, 61.52],
    'Hungary': [19.50, 47.16], 'HU': [19.50, 47.16],
    'Slovakia': [19.70, 48.67], 'SK': [19.70, 48.67],
    'Bulgaria': [25.49, 42.73], 'BG': [25.49, 42.73],
    'Latvia': [24.60, 56.88], 'LV': [24.60, 56.88],
    'Lithuania': [23.88, 55.17], 'LT': [23.88, 55.17],
    'Estonia': [25.01, 58.60], 'EE': [25.01, 58.60],
    'Iceland': [-19.02, 64.96], 'IS': [-19.02, 64.96],
    'Ireland': [-8.24, 53.41], 'IE': [-8.24, 53.41],
    'Serbia': [21.01, 44.02], 'RS': [21.01, 44.02],
    'Croatia': [16.45, 45.10], 'HR': [16.45, 45.10],
    'Greece': [21.82, 39.07], 'GR': [21.82, 39.07],
    'Kazakhstan': [66.92, 48.02], 'KZ': [66.92, 48.02],
    'Belarus': [27.95, 53.71], 'BY': [27.95, 53.71],
    'United States': [-95.71, 37.09], 'US': [-95.71, 37.09],
    'Canada': [-106.35, 56.13], 'CA': [-106.35, 56.13],
    'Brazil': [-51.93, -14.24], 'BR': [-51.93, -14.24],
    'Mexico': [-102.55, 23.63], 'MX': [-102.55, 23.63],
    'Argentina': [-63.62, -38.42], 'AR': [-63.62, -38.42],
    'Chile': [-71.54, -35.68], 'CL': [-71.54, -35.68],
    'Colombia': [-74.30, 4.57], 'CO': [-74.30, 4.57],
    'China': [104.19, 35.86], 'CN': [104.19, 35.86],
    'Japan': [138.25, 36.20], 'JP': [138.25, 36.20],
    'South Korea': [127.77, 35.91], 'KR': [127.77, 35.91],
    'India': [78.96, 20.59], 'IN': [78.96, 20.59],
    'Taiwan': [121.00, 23.70], 'TW': [121.00, 23.70],
    'Singapore': [103.82, 1.35], 'SG': [103.82, 1.35],
    'Hong Kong': [114.11, 22.40], 'HK': [114.11, 22.40],
    'Vietnam': [108.28, 14.06], 'VN': [108.28, 14.06],
    'Turkey': [35.24, 38.96], 'TR': [35.24, 38.96],
    'Israel': [34.85, 31.05], 'IL': [34.85, 31.05],
    'Australia': [133.78, -25.27], 'AU': [133.78, -25.27],
    'New Zealand': [174.89, -40.90], 'NZ': [174.89, -40.90],
    'South Africa': [22.94, -30.56], 'ZA': [22.94, -30.56],
    'Egypt': [30.80, 26.82], 'EG': [30.80, 26.82],
    'Nigeria': [8.68, 9.08], 'NG': [8.68, 9.08],
    'Morocco': [-7.09, 31.79], 'MA': [-7.09, 31.79],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const latencyColor = (ms: number | null, alive: boolean): string => {
    if (!alive || ms === null) return '#4b5563';
    if (ms < 100) return '#22c55e';
    if (ms < 250) return '#f59e0b';
    return '#ef4444';
};

// Coordenadas en formato [lon, lat] que usa react-simple-maps
const toCoords = (lat: number, lon: number): [number, number] => [lon, lat];

// ─── Componente principal ─────────────────────────────────────────────────────

export const NetworkMap: React.FC<NetworkMapProps> = ({ peers, selfLat, selfLon }) => {
    const [tooltip, setTooltip] = useState<{ peer: PeerStat; x: number; y: number } | null>(null);

    const homeLat = selfLat ?? 40.4168;
    const homeLon = selfLon ?? -3.7038;
    const homeCoords: [number, number] = toCoords(homeLat, homeLon);

    type ResolvedPeer = PeerStat & { coords: [number, number] };
    const resolved: ResolvedPeer[] = [];

    peers.forEach(peer => {
        let lat: number | null = peer.lat ?? null;
        let lon: number | null = peer.lon ?? null;
        if (lat == null || lon == null) {
            const c = COUNTRY_CENTROIDS[peer.country];
            if (c) { [lon, lat] = c; }
        }
        if (lat != null && lon != null) {
            resolved.push({ ...peer, coords: toCoords(lat, lon) });
        }
    });

    return (
        <Box sx={{
            mx: 'auto',
            mb: 1.5,
            maxWidth: 460,
            borderRadius: 'md',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: '#060e1a',
            position: 'relative',
            userSelect: 'none',
        }}>
            <ComposableMap
                projection="geoNaturalEarth1"
                style={{ width: '100%', height: 280, display: 'block' }}
                projectionConfig={{ scale: 147 }}
            >
                <ZoomableGroup center={[10, 48]} zoom={1.6} minZoom={0.8} maxZoom={8}>
                    {/* Continentes */}
                    <Geographies geography={worldAtlas}>
                        {({ geographies }: { geographies: any[] }) =>
                            geographies.map((geo: any) => (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    style={{
                                        default: { fill: '#0f2135', stroke: '#1e3a5f', strokeWidth: 0.4, outline: 'none' },
                                        hover: { fill: '#0f2135', outline: 'none' },
                                        pressed: { fill: '#0f2135', outline: 'none' },
                                    }}
                                />
                            ))
                        }
                    </Geographies>

                    {/* Líneas de conexión */}
                    {resolved.map(peer => (
                        <Line
                            key={`line-${peer.host}`}
                            from={homeCoords}
                            to={peer.coords}
                            stroke={latencyColor(peer.latencyMs, peer.alive)}
                            strokeWidth={peer.alive ? 1.2 : 0.6}
                            strokeOpacity={peer.alive ? 0.55 : 0.2}
                            strokeDasharray={peer.alive ? undefined : ' 3'}
                            strokeLinecap="round"
                        />
                    ))}

                    {/* Dots de peers */}
                    {resolved.map(peer => {
                        const color = latencyColor(peer.latencyMs, peer.alive);
                        return (
                            <Marker
                                key={`peer-${peer.host}`}
                                coordinates={peer.coords}
                                onMouseEnter={(e: any) => {
                                    const svgEl = (e.target as Element).closest('svg');
                                    const svgRect = svgEl?.getBoundingClientRect();
                                    setTooltip({
                                        peer,
                                        x: (e as MouseEvent).clientX - (svgRect?.left ?? 0),
                                        y: (e as MouseEvent).clientY - (svgRect?.top ?? 0),
                                    });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            >
                                <circle r={1} fill={color} fillOpacity={0.9} stroke={color} strokeWidth={1} strokeOpacity={0.4} style={{ cursor: 'crosshair' }} />
                            </Marker>
                        );
                    })}

                    {/* Nodo local */}
                    <Marker coordinates={homeCoords}>
                        <circle r={2} fill="white" fillOpacity={0.92} stroke="white" strokeWidth={1.5} strokeOpacity={0.3} />
                        <text textAnchor="middle" y={-8} style={{ fontSize: 6, fill: 'white', fillOpacity: 0.75, fontFamily: 'monospace', fontWeight: 700 }}>Tú</text>
                    </Marker>
                </ZoomableGroup>
            </ComposableMap>

            {/* Tooltip flotante */}
            {tooltip && (() => {
                const { peer, x, y } = tooltip;
                const color = latencyColor(peer.latencyMs, peer.alive);
                return (
                    <Box sx={{
                        position: 'absolute',
                        left: x + 10,
                        top: y - 10,
                        pointerEvents: 'none',
                        backgroundColor: '#0b1929',
                        border: '1px solid',
                        borderColor: color,
                        borderRadius: 'sm',
                        px: 1.25,
                        py: 0.75,
                        zIndex: 10,
                        minWidth: 130,
                    }}>
                        <Typography level="body-xs" sx={{ fontWeight: 700, color, mb: 0.25 }}>
                            {peer.country || 'Desconocido'}
                        </Typography>
                        {peer.latencyMs !== null && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                                {peer.latencyMs} ms · score {peer.score}
                            </Typography>
                        )}
                        <Typography level="body-xs" sx={{
                            color: 'text.tertiary', fontSize: '0.65rem',
                            fontFamily: 'monospace', mt: 0.25,
                            wordBreak: 'break-all',
                        }}>
                            {peer.host.length > 22 ? peer.host.slice(0, 10) + '…' + peer.host.slice(-9) : peer.host}
                        </Typography>
                    </Box>
                );
            })()}

            {/* Leyenda */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: 1.5, py: 0.75, flexWrap: 'wrap',
                borderTop: '1px solid', borderColor: 'divider',
            }}>
                {[
                    { color: '#22c55e', label: '< 100 ms' },
                    { color: '#f59e0b', label: '100–250 ms' },
                    { color: '#ef4444', label: '> 250 ms' },
                    { color: '#4b5563', label: 'Sin respuesta' },
                ].map(({ color, label }) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.62rem' }}>{label}</Typography>
                    </Box>
                ))}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'white', opacity: 0.85, flexShrink: 0 }} />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '0.62rem' }}>Tu posición</Typography>
                </Box>
            </Box>
        </Box>
    );
};
