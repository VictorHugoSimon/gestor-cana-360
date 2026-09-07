import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';

type Field = {
  id: string;
  code: string;
  variety: string;
  areaHa: number;
  tch: number;
  atr: number;
  marginHa: number;
  status: 'ok' | 'attention' | 'risk';
};

const fields: Field[] = [
  { id: 'q08', code: 'Q08', variety: 'CTC9001', areaHa: 38.4, tch: 94, atr: 139, marginHa: 3180, status: 'ok' },
  { id: 'q12', code: 'Q12', variety: 'RB966928', areaHa: 52.6, tch: 101, atr: 141, marginHa: 3560, status: 'ok' },
  { id: 'q18', code: 'Q18', variety: 'IAC91-1099', areaHa: 45.1, tch: 76, atr: 131, marginHa: 940, status: 'risk' },
  { id: 'q31', code: 'Q31', variety: 'RB92579', areaHa: 41.7, tch: 82, atr: 134, marginHa: 1480, status: 'attention' },
];

const nav = ['Visão geral','Mapa','Talhões','Colheita','Financeiro','Operações / OS','Planejamento','CTT','Máquinas','Estoque','Solo','Pragas','Clima','Satélite','Produção','Usinas','Arrendamentos','Simulador','IA agronômica'];

function FieldMap() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-50.08, -21.42],
      zoom: 8,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return <div className="map" ref={ref} aria-label="Mapa da propriedade" />;
}

export function App() {
  const [active, setActive] = useState('Visão geral');
  const [selected, setSelected] = useState(fields[0]);
  const totals = useMemo(() => ({
    area: fields.reduce((s, f) => s + f.areaHa, 0),
    production: fields.reduce((s, f) => s + f.areaHa * f.tch, 0),
    margin: fields.reduce((s, f) => s + f.areaHa * f.marginHa, 0),
  }), []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>GC</span><div><strong>Gestor Cana 360</strong><small>Safra 2026/27</small></div></div>
        <div className="farm">Fazenda Demo<br/><small>Ambiente de desenvolvimento</small></div>
        <nav>{nav.map((item) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</nav>
      </aside>
      <main>
        <header>
          <div><small>GESTÃO AGRÍCOLA / {active.toUpperCase()}</small><h1>{active}</h1></div>
          <div className="status"><i /> Ambiente DEV</div>
        </header>
        <div className="content">
          <section className="kpis">
            <Kpi label="ÁREA MAPEADA" value={`${totals.area.toFixed(1)} ha`} note="4 quadras demo" />
            <Kpi label="PRODUÇÃO ESTIMADA" value={`${Math.round(totals.production).toLocaleString('pt-BR')} t`} note="média ponderada" />
            <Kpi label="MARGEM PROJETADA" value={`R$ ${(totals.margin/1_000_000).toFixed(2)} mi`} note="antes de custos indiretos" />
            <Kpi label="ALERTAS" value="2" note="1 risco · 1 atenção" warn />
          </section>

          <section className="grid2">
            <div className="panel mapPanel"><div className="panelTitle"><span>MAPA DA PROPRIEDADE</span><small>MapLibre + PostGIS</small></div><FieldMap /></div>
            <div className="panel details">
              <div className="panelTitle"><span>PRONTUÁRIO DO TALHÃO</span><small>{selected.code}</small></div>
              <h2>{selected.code}</h2><p className="muted">{selected.variety} · {selected.areaHa} ha</p>
              <div className="detailGrid"><Metric label="TCH" value={`${selected.tch}`} /><Metric label="ATR" value={`${selected.atr}`} /><Metric label="MARGEM/HA" value={`R$ ${selected.marginHa.toLocaleString('pt-BR')}`} /><Metric label="STATUS" value={selected.status.toUpperCase()} /></div>
              <div className="notice">No sistema real, esta ficha será alimentada pelo banco e pelo histórico georreferenciado da quadra.</div>
            </div>
          </section>

          <section className="panel tablePanel">
            <div className="panelTitle"><span>RANKING ECONÔMICO DOS TALHÕES</span><small>protótipo → produto</small></div>
            <div className="table"><div className="tr head"><span>TALHÃO</span><span>VARIEDADE</span><span>HA</span><span>TCH</span><span>ATR</span><span>MARGEM/HA</span></div>{[...fields].sort((a,b)=>b.marginHa-a.marginHa).map(f => <button key={f.id} className="tr" onClick={()=>setSelected(f)}><strong>{f.code}</strong><span>{f.variety}</span><span>{f.areaHa}</span><span>{f.tch}</span><span>{f.atr}</span><span className={f.status}>{`R$ ${f.marginHa.toLocaleString('pt-BR')}`}</span></button>)}</div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Kpi({label,value,note,warn=false}:{label:string;value:string;note:string;warn?:boolean}) { return <div className="kpi"><small>{label}</small><strong className={warn?'warning':''}>{value}</strong><span>{note}</span></div>; }
function Metric({label,value}:{label:string;value:string}) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }
