import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { getApiToken } from './auth';

type PolygonGeometry = { type: 'Polygon'; coordinates: number[][][] };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: number[][][][] };
type SupportedGeometry = PolygonGeometry | MultiPolygonGeometry;

export type GeoField = {
  id: string;
  farm_id: string;
  code: string;
  name: string | null;
  area_ha: string | number | null;
  variety: string | null;
  cycle: string | null;
  active: boolean;
  geometry: Record<string, unknown> | null;
};

type Props = {
  fields: GeoField[];
  farmId: string;
  selectedFieldId: string;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
};

type ApiEnvelope<T> = { data: T };
const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  if (!token) throw new Error('Sessão expirada.');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'api_error');
  return body as T;
}

function parseGeometry(value: unknown): SupportedGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  return geometry as SupportedGeometry;
}

function editablePolygon(geometry: Record<string, unknown> | null): PolygonGeometry | null {
  const parsed = parseGeometry(geometry);
  if (!parsed) return null;
  if (parsed.type === 'Polygon') return parsed;
  if (parsed.coordinates.length !== 1) return null;
  return { type: 'Polygon', coordinates: parsed.coordinates[0] };
}

function firstPolygonFromGeoJson(value: unknown): SupportedGeometry | null {
  const direct = parseGeometry(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object') return null;
  const item = value as { type?: unknown; geometry?: unknown; features?: unknown };
  if (item.type === 'Feature') return parseGeometry(item.geometry);
  if (item.type === 'FeatureCollection' && Array.isArray(item.features)) {
    for (const feature of item.features) {
      const geometry = firstPolygonFromGeoJson(feature);
      if (geometry) return geometry;
    }
  }
  return null;
}

export function GeoFieldMap({ fields, farmId, selectedFieldId, onSelect, onChanged }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const fieldsRef = useRef(fields);
  const [draftGeometry, setDraftGeometry] = useState<SupportedGeometry | null>(null);
  const [draftDrawId, setDraftDrawId] = useState<string | number | null>(null);
  const [editingFieldId, setEditingFieldId] = useState('');
  const [code, setCode] = useState('');
  const [variety, setVariety] = useState('');
  const [cycle, setCycle] = useState('');
  const [status, setStatus] = useState('Selecione “Novo talhão” para desenhar uma quadra.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  fieldsRef.current = fields;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-50.08, -21.42],
      zoom: 8,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            showCoordinatePoints: true,
            editable: true,
            snapping: { toCoordinate: true, toLine: true },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: false,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });

      draw.start();
      draw.setMode('select');
      draw.on('finish', (id, context) => {
        const feature = draw.getSnapshotFeature(id);
        if (!feature || feature.geometry.type !== 'Polygon') return;
        const geometry = feature.geometry as PolygonGeometry;
        if (context.action === 'draw') {
          setDraftDrawId(id);
          setDraftGeometry(geometry);
          setEditingFieldId('');
          setStatus('Polígono concluído. Informe os dados do talhão e salve.');
          draw.setMode('select');
          return;
        }
        setDraftGeometry(geometry);
        setEditingFieldId(String(id));
        setStatus('Geometria alterada. Clique em “Salvar geometria”.');
      });
      draw.on('select', (id) => {
        const idString = String(id);
        if (fieldsRef.current.some((field) => field.id === idString)) {
          onSelect(idString);
          setEditingFieldId(idString);
        }
      });
      drawRef.current = draw;
    });

    map.on('click', (event) => {
      if (!map.getLayer('fields-fill')) return;
      const matches = map.queryRenderedFeatures(event.point, { layers: ['fields-fill'] });
      const id = matches[0]?.properties?.id as string | undefined;
      if (id) onSelect(id);
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = {
      type: 'FeatureCollection' as const,
      features: fields
        .filter((field) => parseGeometry(field.geometry))
        .map((field) => ({
          type: 'Feature' as const,
          geometry: parseGeometry(field.geometry) as SupportedGeometry,
          properties: { id: field.id, code: field.code, variety: field.variety ?? '' },
        })),
    };

    const sync = () => {
      const source = map.getSource('fields') as GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else {
        map.addSource('fields', { type: 'geojson', data });
        map.addLayer({ id: 'fields-fill', type: 'fill', source: 'fields', paint: { 'fill-color': '#5c8a3f', 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'fields-line', type: 'line', source: 'fields', paint: { 'line-color': '#2f4f35', 'line-width': 2 } });
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  }, [fields]);

  function clearEditor() {
    const draw = drawRef.current;
    if (draw) {
      draw.deselectFeature();
      draw.clear();
      draw.setMode('select');
    }
    setDraftGeometry(null);
    setDraftDrawId(null);
    setEditingFieldId('');
    setCode('');
    setVariety('');
    setCycle('');
    setError('');
  }

  function startDraw() {
    if (!farmId) {
      setError('Cadastre ou selecione uma fazenda antes de desenhar.');
      return;
    }
    clearEditor();
    drawRef.current?.setMode('polygon');
    setStatus('Clique no mapa para marcar os vértices. Feche o polígono no ponto inicial.');
  }

  function startEdit() {
    const field = fields.find((item) => item.id === selectedFieldId);
    if (!field) {
      setError('Selecione um talhão na tabela ou no mapa.');
      return;
    }
    const geometry = editablePolygon(field.geometry);
    if (!geometry) {
      setError('Este talhão não possui um polígono simples editável. MultiPolygon com várias partes permanece preservado e pode ser substituído por importação.');
      return;
    }
    const draw = drawRef.current;
    if (!draw) return;
    clearEditor();
    const result = draw.addFeatures([{
      id: field.id,
      type: 'Feature',
      geometry,
      properties: { mode: 'polygon' },
    } as never]);
    if (!result[0]?.valid) {
      setError(result[0]?.reason ?? 'Não foi possível carregar a geometria para edição.');
      return;
    }
    draw.setMode('select');
    draw.selectFeature(field.id);
    setEditingFieldId(field.id);
    setDraftGeometry(geometry);
    setStatus('Arraste os vértices ou os pontos médios e salve a geometria.');
  }

  async function saveNewField(event: React.FormEvent) {
    event.preventDefault();
    if (!draftGeometry || !farmId || !code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api<ApiEnvelope<GeoField>>('/api/v1/fields', {
        method: 'POST',
        body: JSON.stringify({
          farmId,
          code: code.trim(),
          variety: variety.trim() || undefined,
          cycle: cycle.trim() || undefined,
          geometry: draftGeometry,
        }),
      });
      clearEditor();
      setStatus('Talhão salvo. A área oficial foi calculada pelo PostGIS.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar talhão.');
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedGeometry() {
    const draw = drawRef.current;
    if (!draw || !editingFieldId) return;
    const feature = draw.getSnapshotFeature(editingFieldId);
    if (!feature || feature.geometry.type !== 'Polygon') {
      setError('Geometria de edição inválida.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api<ApiEnvelope<GeoField>>(`/api/v1/fields/${encodeURIComponent(editingFieldId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ geometry: feature.geometry }),
      });
      clearEditor();
      setStatus('Geometria atualizada e hectares recalculados pelo PostGIS.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar geometria.');
    } finally {
      setBusy(false);
    }
  }

  async function importGeoJson(file: File) {
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const geometry = firstPolygonFromGeoJson(parsed);
      if (!geometry) throw new Error('O arquivo não contém Polygon ou MultiPolygon válido.');
      clearEditor();
      setDraftGeometry(geometry);
      setDraftDrawId(null);
      setStatus('GeoJSON carregado. Informe os dados e salve para calcular a área oficial.');
      if (geometry.type === 'Polygon' && drawRef.current) {
        const id = drawRef.current.getFeatureId();
        const [result] = drawRef.current.addFeatures([{
          id,
          type: 'Feature',
          geometry,
          properties: { mode: 'polygon' },
        } as never]);
        if (result?.valid) {
          setDraftDrawId(id);
          drawRef.current.setMode('select');
          drawRef.current.selectFeature(id);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao importar GeoJSON.');
    }
  }

  return (
    <div className="geoEditor">
      <div className="geoToolbar">
        <button type="button" onClick={startDraw}>+ Novo talhão</button>
        <button type="button" onClick={startEdit} disabled={!selectedFieldId}>Editar selecionado</button>
        <label className="geoImport">Importar GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importGeoJson(file); event.currentTarget.value = ''; }} /></label>
        {(draftGeometry || editingFieldId) && <button type="button" className="secondaryGeo" onClick={clearEditor}>Cancelar</button>}
      </div>
      <div className="geoStatus">{status}</div>
      {error && <div className="geoError">{error}</div>}
      <div className="map" ref={containerRef} aria-label="Mapa georreferenciado da propriedade" />

      {draftGeometry && !editingFieldId && (
        <form className="geoForm" onSubmit={saveNewField}>
          <strong>Novo talhão</strong>
          <span>Área: calculada pelo PostGIS ao salvar</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código, ex.: Q32" required maxLength={40} />
          <input value={variety} onChange={(event) => setVariety(event.target.value)} placeholder="Variedade, ex.: CTC9001" maxLength={80} />
          <input value={cycle} onChange={(event) => setCycle(event.target.value)} placeholder="Ciclo/corte, ex.: 2º corte" maxLength={80} />
          <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar talhão'}</button>
        </form>
      )}

      {editingFieldId && (
        <div className="geoForm geoEditForm">
          <strong>Editando {fields.find((field) => field.id === editingFieldId)?.code ?? 'talhão'}</strong>
          <span>O servidor validará o polígono e recalculará hectares.</span>
          <button type="button" onClick={saveEditedGeometry} disabled={busy}>{busy ? 'Salvando…' : 'Salvar geometria'}</button>
        </div>
      )}

      {draftDrawId && <span className="srOnly">Geometria temporária {String(draftDrawId)}</span>}
    </div>
  );
}
