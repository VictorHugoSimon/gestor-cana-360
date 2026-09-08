import { useEffect, useMemo, useState } from 'react';
import { authClient, getApiToken } from './auth';
import { GeoFieldMap } from './GeoFieldMap';
import { OperationsPanel } from './OperationsPanel';
import { HarvestPanel } from './HarvestPanel';
import { AssetsPanel } from './AssetsPanel';
import { AgronomyPanel } from './AgronomyPanel';
import { ClimateSatellitePanel } from './ClimateSatellitePanel';

type Farm = {
  id: string;
  name: string;
  municipality: string | null;
  state: string | null;
  total_area_ha: string | number | null;
};

type Season = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: 'planned' | 'active' | 'closed';
};

type Field = {
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

type Workspace = {
  auth_user_id: string;
  role: string;
  organization: { id: string; name: string; slug: string } | null;
};

type DashboardSummary = {
  mapped_area_ha: string | number;
  produced_tons: string | number;
  total_cost: string | number;
  open_alerts: string | number;
};

type SessionUser = { id?: string; name?: string; email?: string };
type ApiEnvelope<T> = { data: T };

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const nav = ['Visão geral', 'Mapa', 'Talhões', 'Colheita', 'Financeiro', 'Operações / OS', 'Planejamento', 'CTT', 'Máquinas', 'Estoque', 'Solo', 'Pragas', 'Clima', 'Satélite', 'Produção', 'Usinas', 'Arrendamentos', 'Simulador', 'IA agronômica'];
const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  if (!token) throw new ApiError(401, 'Sessão expirada.');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? 'api_error');
  return body as T;
}

export function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [needsClaim, setNeedsClaim] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState('Visão geral');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [showFarmForm, setShowFarmForm] = useState(false);
  const [showSeasonForm, setShowSeasonForm] = useState(false);

  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0] ?? null;
  const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) ?? farms[0] ?? null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null;

  async function loadWorkspace() {
    setError('');
    try {
      const me = await api<ApiEnvelope<Workspace>>('/api/v1/me');
      setWorkspace(me.data);
      setNeedsClaim(false);
      const [farmResult, seasonResult] = await Promise.all([
        api<ApiEnvelope<Farm[]>>('/api/v1/farms'),
        api<ApiEnvelope<Season[]>>('/api/v1/seasons'),
      ]);
      setFarms(farmResult.data);
      setSeasons(seasonResult.data);
      const farmId = selectedFarmId || farmResult.data[0]?.id || '';
      const seasonId = selectedSeasonId || seasonResult.data.find((s) => s.status === 'active')?.id || seasonResult.data[0]?.id || '';
      setSelectedFarmId(farmId);
      setSelectedSeasonId(seasonId);
      const fieldResult = await api<ApiEnvelope<Field[]>>(`/api/v1/fields${farmId ? `?farmId=${encodeURIComponent(farmId)}` : ''}`);
      setFields(fieldResult.data);
      setSelectedFieldId((current) => fieldResult.data.some((field) => field.id === current) ? current : fieldResult.data[0]?.id || '');
      if (seasonId) {
        const dashboard = await api<ApiEnvelope<DashboardSummary>>(`/api/v1/dashboard/summary?seasonId=${encodeURIComponent(seasonId)}`);
        setSummary(dashboard.data);
      } else {
        setSummary(null);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setNeedsClaim(true);
        setWorkspace(null);
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o ambiente.');
    }
  }

  useEffect(() => {
    authClient.getSession().then(async (result) => {
      const sessionUser = result.data?.user as SessionUser | undefined;
      if (result.data?.session && sessionUser) {
        setUser(sessionUser);
        await loadWorkspace();
      }
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!workspace || !selectedFarmId) return;
    api<ApiEnvelope<Field[]>>(`/api/v1/fields?farmId=${encodeURIComponent(selectedFarmId)}`)
      .then((result) => {
        setFields(result.data);
        setSelectedFieldId(result.data[0]?.id ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar talhões.'));
  }, [selectedFarmId, workspace]);

  useEffect(() => {
    if (!workspace || !selectedSeasonId) return;
    api<ApiEnvelope<DashboardSummary>>(`/api/v1/dashboard/summary?seasonId=${encodeURIComponent(selectedSeasonId)}`)
      .then((result) => setSummary(result.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar indicadores.'));
  }, [selectedSeasonId, workspace]);

  async function claimDevelopment() {
    setError('');
    try {
      await api('/api/v1/onboarding/claim', { method: 'POST' });
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ativar a organização DEV.');
    }
  }

  async function signOut() {
    await authClient.signOut();
    setUser(null);
    setWorkspace(null);
    setNeedsClaim(false);
    setFarms([]);
    setSeasons([]);
    setFields([]);
  }

  const totalMappedArea = useMemo(() => fields.reduce((sum, field) => sum + Number(field.area_ha ?? 0), 0), [fields]);

  if (authLoading) return <div className="centerScreen"><div className="loaderCard">Carregando Gestor Cana 360…</div></div>;
  if (!user) return <AuthScreen onAuthenticated={async (sessionUser) => { setUser(sessionUser); await loadWorkspace(); }} />;

  if (needsClaim) {
    return (
      <div className="centerScreen">
        <div className="authCard">
          <div className="authBrand">GC</div>
          <h1>Conta autenticada</h1>
          <p>Seu usuário ainda não possui vínculo com uma organização do Gestor Cana 360.</p>
          <button className="primaryButton" onClick={claimDevelopment}>Ativar organização de desenvolvimento</button>
          <button className="secondaryButton" onClick={signOut}>Sair</button>
          {error && <div className="formError">{error}</div>}
        </div>
      </div>
    );
  }

  const harvestSection = active === 'Colheita' || active === 'CTT' || active === 'Usinas'
    ? active as 'Colheita' | 'CTT' | 'Usinas'
    : null;
  const assetSection = active === 'Máquinas' || active === 'Estoque'
    ? active as 'Máquinas' | 'Estoque'
    : null;
  const agronomySection = active === 'Solo' || active === 'Pragas'
    ? active as 'Solo' | 'Pragas'
    : null;
  const climateSatelliteSection = active === 'Clima' || active === 'Satélite'
    ? active as 'Clima' | 'Satélite'
    : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>GC</span><div><strong>Gestor Cana 360</strong><small>{selectedSeason?.name ?? 'Sem safra ativa'}</small></div></div>
        <div className="farm">
          <strong>{selectedFarm?.name ?? 'Cadastre uma fazenda'}</strong><br />
          <small>{workspace?.organization?.name ?? 'Organização'} · {workspace?.role}</small>
        </div>
        <div className="sidebarActions">
          <button onClick={() => setShowFarmForm((value) => !value)}>+ Fazenda</button>
          <button onClick={() => setShowSeasonForm((value) => !value)}>+ Safra</button>
        </div>
        {showFarmForm && <FarmForm onCreated={async () => { setShowFarmForm(false); await loadWorkspace(); }} />}
        {showSeasonForm && <SeasonForm onCreated={async () => { setShowSeasonForm(false); await loadWorkspace(); }} />}
        <nav>{nav.map((item) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</nav>
      </aside>
      <main>
        <header>
          <div><small>GESTÃO AGRÍCOLA / {active.toUpperCase()}</small><h1>{active}</h1></div>
          <div className="headerRight">
            <select value={selectedFarmId} onChange={(event) => setSelectedFarmId(event.target.value)} aria-label="Fazenda">
              {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
            </select>
            <select value={selectedSeasonId} onChange={(event) => setSelectedSeasonId(event.target.value)} aria-label="Safra">
              {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
            </select>
            <div className="status"><i /> DEV</div>
            <button className="textButton" onClick={signOut}>Sair</button>
          </div>
        </header>
        <div className="content">
          {error && <div className="errorBanner">{error}</div>}
          {active === 'Operações / OS' ? (
            <OperationsPanel farmId={selectedFarmId} seasonId={selectedSeasonId} fields={fields} role={workspace?.role ?? 'viewer'} />
          ) : harvestSection ? (
            <HarvestPanel farmId={selectedFarmId} seasonId={selectedSeasonId} fields={fields} role={workspace?.role ?? 'viewer'} section={harvestSection} />
          ) : assetSection ? (
            <AssetsPanel farmId={selectedFarmId} seasonId={selectedSeasonId} fields={fields} role={workspace?.role ?? 'viewer'} section={assetSection} />
          ) : agronomySection ? (
            <AgronomyPanel farmId={selectedFarmId} seasonId={selectedSeasonId} fields={fields} role={workspace?.role ?? 'viewer'} section={agronomySection} />
          ) : climateSatelliteSection ? (
            <ClimateSatellitePanel farmId={selectedFarmId} seasonId={selectedSeasonId} fields={fields} role={workspace?.role ?? 'viewer'} section={climateSatelliteSection} />
          ) : (
            <>
              <section className="kpis">
                <Kpi label="ÁREA MAPEADA" value={`${Number(summary?.mapped_area_ha ?? totalMappedArea).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha`} note={`${fields.length} talhões ativos`} />
                <Kpi label="PRODUÇÃO REGISTRADA" value={`${Number(summary?.produced_tons ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} t`} note={selectedSeason?.name ?? 'sem safra'} />
                <Kpi label="CUSTOS REGISTRADOS" value={`R$ ${Number(summary?.total_cost ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} note="custos lançados na safra" />
                <Kpi label="ALERTAS / OS" value={`${Number(summary?.open_alerts ?? 0)}`} note="em andamento ou atrasadas" warn={Number(summary?.open_alerts ?? 0) > 0} />
              </section>

              <section className="grid2">
                <div className="panel mapPanel">
                  <div className="panelTitle"><span>MAPA DA PROPRIEDADE</span><small>MapLibre + Terra Draw + PostGIS</small></div>
                  <GeoFieldMap fields={fields} farmId={selectedFarmId} selectedFieldId={selectedFieldId} onSelect={setSelectedFieldId} onChanged={loadWorkspace} />
                </div>
                <div className="panel details">
                  <div className="panelTitle"><span>PRONTUÁRIO DO TALHÃO</span><small>{selectedField?.code ?? '—'}</small></div>
                  <h2>{selectedField?.code ?? 'Sem talhão'}</h2>
                  <p className="muted">{selectedField ? `${selectedField.variety ?? 'Variedade não informada'} · ${Number(selectedField.area_ha ?? 0).toLocaleString('pt-BR')} ha` : 'Cadastre ou desenhe o primeiro talhão.'}</p>
                  <div className="detailGrid"><Metric label="VARIEDADE" value={selectedField?.variety ?? '—'} /><Metric label="CICLO" value={selectedField?.cycle ?? '—'} /><Metric label="ÁREA" value={selectedField ? `${Number(selectedField.area_ha ?? 0).toLocaleString('pt-BR')} ha` : '—'} /><Metric label="STATUS" value={selectedField?.active ? 'ATIVO' : '—'} /></div>
                  <div className="notice">O mapa já permite desenhar, editar e importar polígonos. A área exibida após salvar é calculada no PostGIS, não pelo navegador.</div>
                </div>
              </section>

              <section className="panel tablePanel">
                <div className="panelTitle"><span>TALHÕES DA FAZENDA</span><small>banco real</small></div>
                <div className="table">
                  <div className="tr head"><span>TALHÃO</span><span>VARIEDADE</span><span>HA</span><span>CICLO</span><span>GEO</span><span>STATUS</span></div>
                  {fields.map((field) => <button key={field.id} className={`tr ${field.id === selectedFieldId ? 'selectedRow' : ''}`} onClick={() => setSelectedFieldId(field.id)}><strong>{field.code}</strong><span>{field.variety ?? '—'}</span><span>{Number(field.area_ha ?? 0).toLocaleString('pt-BR')}</span><span>{field.cycle ?? '—'}</span><span>{field.geometry ? 'Sim' : 'Não'}</span><span className={field.geometry ? 'ok' : 'attention'}>{field.geometry ? 'Mapeado' : 'Sem polígono'}</span></button>)}
                  {!fields.length && <div className="emptyState">Nenhum talhão cadastrado para esta fazenda.</div>}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => Promise<void> }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name: name || email.split('@')[0] || 'Usuário', email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message ?? 'Falha na autenticação.');
      const session = await authClient.getSession();
      if (!session.data?.user) throw new Error('Sessão não foi criada.');
      await onAuthenticated(session.data.user as SessionUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na autenticação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centerScreen">
      <form className="authCard" onSubmit={submit}>
        <div className="authBrand">GC</div>
        <h1>Gestor Cana 360</h1>
        <p>{isSignUp ? 'Crie o primeiro acesso do ambiente DEV.' : 'Entre para acessar a gestão agrícola.'}</p>
        {isSignUp && <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>}
        <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={isSignUp ? 'new-password' : 'current-password'} /></label>
        {error && <div className="formError">{error}</div>}
        <button className="primaryButton" type="submit" disabled={busy}>{busy ? 'Processando…' : isSignUp ? 'Criar acesso' : 'Entrar'}</button>
        <button className="secondaryButton" type="button" onClick={() => setIsSignUp((value) => !value)}>{isSignUp ? 'Já tenho acesso' : 'Criar conta DEV'}</button>
      </form>
    </div>
  );
}

function FarmForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [state, setState] = useState('SP');
  return <form className="miniForm" onSubmit={async (event) => { event.preventDefault(); await api('/api/v1/farms', { method: 'POST', body: JSON.stringify({ name, municipality: municipality || undefined, state }) }); await onCreated(); }}><strong>Nova fazenda</strong><input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} required /><input placeholder="Município" value={municipality} onChange={(event) => setMunicipality(event.target.value)} /><input placeholder="UF" value={state} onChange={(event) => setState(event.target.value.toUpperCase().slice(0, 2))} maxLength={2} /><button type="submit">Salvar</button></form>;
}

function SeasonForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  return <form className="miniForm" onSubmit={async (event) => { event.preventDefault(); await api('/api/v1/seasons', { method: 'POST', body: JSON.stringify({ name, status: 'planned' }) }); await onCreated(); }}><strong>Nova safra</strong><input placeholder="Ex.: 2027/28" value={name} onChange={(event) => setName(event.target.value)} required /><button type="submit">Salvar</button></form>;
}

function Kpi({ label, value, note, warn = false }: { label: string; value: string; note: string; warn?: boolean }) { return <div className="kpi"><small>{label}</small><strong className={warn ? 'warning' : ''}>{value}</strong><span>{note}</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }
