import { useEffect, useMemo, useState } from 'react';
import { getApiToken } from './auth';

type Farm = { id: string; name: string };
type Season = { id: string; name: string; status: 'planned' | 'active' | 'closed' };
type Field = { id: string; code: string; area_ha: string | number | null };
type EconomicsRow = {
  field_id: string;
  code: string;
  area_ha: string | number | null;
  variety: string | null;
  cycle: string | null;
  cut_number: number | null;
  expected_tch: string | number | null;
  expected_atr: string | number | null;
  tons: string | number;
  atr_kg_t: string | number | null;
  tch: string | number | null;
  tah: string | number | null;
  revenue: string | number;
  cost: string | number;
  margin: string | number;
  cost_per_ha: string | number | null;
  margin_per_ha: string | number | null;
};

type EconomicsSummary = {
  area_ha: string | number;
  tons: string | number;
  atr_kg_t: string | number | null;
  revenue: string | number;
  field_cost: string | number;
  unallocated_cost: string | number;
  total_cost: string | number;
  margin: string | number;
  tch: number | null;
  margin_per_ha: number | null;
};

type ApiEnvelope<T> = { data: T };

const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  if (!token) throw new Error('Entre no Gestor Cana 360 para acessar a central econômica.');
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

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const money = (value: unknown) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const decimal = (value: unknown, digits = 1) => Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });

export function EconomicsConsole() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'production' | 'costs'>('dashboard');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [farmId, setFarmId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [rows, setRows] = useState<EconomicsRow[]>([]);
  const [summary, setSummary] = useState<EconomicsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadScope() {
    setLoading(true);
    setError('');
    try {
      const [farmResult, seasonResult] = await Promise.all([
        api<ApiEnvelope<Farm[]>>('/api/v1/farms'),
        api<ApiEnvelope<Season[]>>('/api/v1/seasons'),
      ]);
      setFarms(farmResult.data);
      setSeasons(seasonResult.data);
      const nextFarm = farmId || farmResult.data[0]?.id || '';
      const nextSeason = seasonId || seasonResult.data.find((item) => item.status === 'active')?.id || seasonResult.data[0]?.id || '';
      setFarmId(nextFarm);
      setSeasonId(nextSeason);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar produção e financeiro.');
    } finally {
      setLoading(false);
    }
  }

  async function loadEconomics() {
    if (!seasonId) return;
    setLoading(true);
    setError('');
    try {
      const suffix = `seasonId=${encodeURIComponent(seasonId)}${farmId ? `&farmId=${encodeURIComponent(farmId)}` : ''}`;
      const [fieldResult, economicsResult, summaryResult] = await Promise.all([
        api<ApiEnvelope<Field[]>>(`/api/v1/fields${farmId ? `?farmId=${encodeURIComponent(farmId)}` : ''}`),
        api<ApiEnvelope<EconomicsRow[]>>(`/api/v1/economics/fields?${suffix}`),
        api<ApiEnvelope<EconomicsSummary>>(`/api/v1/economics/summary?${suffix}`),
      ]);
      setFields(fieldResult.data);
      setRows(economicsResult.data);
      setSummary(summaryResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar indicadores econômicos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !farms.length && !seasons.length) void loadScope();
  }, [open]);

  useEffect(() => {
    if (open && seasonId) void loadEconomics();
  }, [open, farmId, seasonId]);

  const bestField = useMemo(() => rows.find((row) => Number(row.margin_per_ha ?? 0) > 0) ?? rows[0] ?? null, [rows]);

  return (
    <>
      <button className="economicsLauncher" type="button" onClick={() => setOpen(true)}>
        <span>R$</span> Produção & Financeiro
      </button>
      {open && (
        <div className="economicsBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="economicsDrawer" aria-label="Central de Produção e Financeiro">
            <header className="economicsHeader">
              <div><small>MVP 2 / ECONOMIA DA SAFRA</small><h2>Produção & Financeiro</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>

            <div className="economicsFilters">
              <label>Fazenda<select value={farmId} onChange={(event) => setFarmId(event.target.value)}>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
              <label>Safra<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
              <button type="button" onClick={() => void loadEconomics()} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
            </div>

            <nav className="economicsTabs">
              <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Indicadores</button>
              <button className={tab === 'production' ? 'active' : ''} onClick={() => setTab('production')}>+ Produção</button>
              <button className={tab === 'costs' ? 'active' : ''} onClick={() => setTab('costs')}>+ Custo</button>
            </nav>

            {error && <div className="economicsError">{error}</div>}

            {tab === 'dashboard' && (
              <div className="economicsBody">
                <div className="economicsKpis">
                  <EconomicKpi label="TCH" value={`${decimal(summary?.tch, 1)} t/ha`} note={`${decimal(summary?.tons, 0)} t produzidas`} />
                  <EconomicKpi label="ATR MÉDIO" value={`${decimal(summary?.atr_kg_t, 1)} kg/t`} note="ponderado por tonelada" />
                  <EconomicKpi label="RECEITA" value={money(summary?.revenue)} note="real + estimada por ATR" />
                  <EconomicKpi label="MARGEM/HA" value={money(summary?.margin_per_ha)} note={`custo total ${money(summary?.total_cost)}`} warn={Number(summary?.margin_per_ha ?? 0) < 0} />
                </div>

                <div className="economicsHighlight">
                  <div><small>MELHOR MARGEM/HA</small><strong>{bestField?.code ?? '—'}</strong></div>
                  <span>{bestField ? `${money(bestField.margin_per_ha)}/ha · TCH ${decimal(bestField.tch, 1)}` : 'Lance produção e custos para formar o ranking.'}</span>
                </div>

                <div className="economicsTableWrap">
                  <table className="economicsTable">
                    <thead><tr><th>Talhão</th><th>ha</th><th>t</th><th>TCH</th><th>ATR</th><th>TAH</th><th>Receita</th><th>Custo/ha</th><th>Margem/ha</th></tr></thead>
                    <tbody>
                      {rows.map((row) => <tr key={row.field_id}><td><strong>{row.code}</strong><small>{row.variety ?? '—'}</small></td><td>{decimal(row.area_ha, 1)}</td><td>{decimal(row.tons, 0)}</td><td>{decimal(row.tch, 1)}</td><td>{row.atr_kg_t == null ? '—' : decimal(row.atr_kg_t, 1)}</td><td>{decimal(row.tah, 2)}</td><td>{money(row.revenue)}</td><td>{money(row.cost_per_ha)}</td><td className={Number(row.margin_per_ha ?? 0) < 0 ? 'negative' : 'positive'}>{money(row.margin_per_ha)}</td></tr>)}
                      {!rows.length && <tr><td colSpan={9} className="economicsEmpty">Nenhum talhão disponível para esta seleção.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="economicsFootnote">Custos sem talhão aparecem no total da safra e não entram no ranking individual até serem alocados.</div>
              </div>
            )}

            {tab === 'production' && <ProductionForm fields={fields} seasonId={seasonId} onSaved={async () => { await loadEconomics(); setTab('dashboard'); }} />}
            {tab === 'costs' && <CostForm fields={fields} seasonId={seasonId} onSaved={async () => { await loadEconomics(); setTab('dashboard'); }} />}
          </section>
        </div>
      )}
    </>
  );
}

function ProductionForm({ fields, seasonId, onSaved }: { fields: Field[]; seasonId: string; onSaved: () => Promise<void> }) {
  const [fieldId, setFieldId] = useState('');
  const [occurredOn, setOccurredOn] = useState(localDateValue());
  const [tons, setTons] = useState('');
  const [atr, setAtr] = useState('');
  const [atrPrice, setAtrPrice] = useState('');
  const [revenue, setRevenue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!fieldId && fields[0]) setFieldId(fields[0].id); }, [fields, fieldId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/v1/production', { method: 'POST', body: JSON.stringify({
        fieldId, seasonId, occurredOn, tons: Number(tons),
        atrKgT: atr ? Number(atr) : undefined,
        atrPricePerKg: atrPrice ? Number(atrPrice) : undefined,
        revenueAmount: revenue ? Number(revenue) : undefined,
        source: 'manual',
      }) });
      setTons(''); setAtr(''); setAtrPrice(''); setRevenue('');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao lançar produção.'); }
    finally { setBusy(false); }
  }

  return <form className="economicsForm" onSubmit={submit}><h3>Lançar produção</h3><p>Informe a produção final do talhão. Se a receita real não estiver disponível, o sistema estima usando toneladas × ATR × R$/kg ATR.</p>
    <div className="economicsFormGrid"><label>Talhão<select value={fieldId} onChange={(e) => setFieldId(e.target.value)} required>{fields.map((field) => <option key={field.id} value={field.id}>{field.code} · {decimal(field.area_ha, 1)} ha</option>)}</select></label><label>Data<input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required /></label><label>Toneladas<input type="number" min="0.001" step="0.001" value={tons} onChange={(e) => setTons(e.target.value)} required /></label><label>ATR kg/t<input type="number" min="0" step="0.01" value={atr} onChange={(e) => setAtr(e.target.value)} /></label><label>R$/kg ATR<input type="number" min="0" step="0.000001" value={atrPrice} onChange={(e) => setAtrPrice(e.target.value)} /></label><label>Receita real R$<input type="number" min="0" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)} /></label></div>
    {error && <div className="economicsError">{error}</div>}<button className="economicsSubmit" disabled={busy || !fieldId || !seasonId}>{busy ? 'Salvando…' : 'Salvar produção'}</button></form>;
}

function CostForm({ fields, seasonId, onSaved }: { fields: Field[]; seasonId: string; onSaved: () => Promise<void> }) {
  const [fieldId, setFieldId] = useState('');
  const [occurredOn, setOccurredOn] = useState(localDateValue());
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/v1/costs', { method: 'POST', body: JSON.stringify({ seasonId, fieldId: fieldId || undefined, occurredOn, category, amount: Number(amount), supplier: supplier || undefined }) });
      setCategory(''); setAmount(''); setSupplier('');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao lançar custo.'); }
    finally { setBusy(false); }
  }

  return <form className="economicsForm" onSubmit={submit}><h3>Lançar custo</h3><p>Associe o custo ao talhão quando possível. Custos gerais permanecem separados para não distorcer o ranking individual.</p>
    <div className="economicsFormGrid"><label>Alocação<select value={fieldId} onChange={(e) => setFieldId(e.target.value)}><option value="">Geral da safra</option>{fields.map((field) => <option key={field.id} value={field.id}>{field.code}</option>)}</select></label><label>Data<input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required /></label><label>Categoria<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: fertilizante, diesel, CTT" required /></label><label>Valor R$<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label>Fornecedor<input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" /></label></div>
    {error && <div className="economicsError">{error}</div>}<button className="economicsSubmit" disabled={busy || !seasonId}>{busy ? 'Salvando…' : 'Salvar custo'}</button></form>;
}

function EconomicKpi({ label, value, note, warn = false }: { label: string; value: string; note: string; warn?: boolean }) {
  return <div className="economicKpi"><small>{label}</small><strong className={warn ? 'negative' : ''}>{value}</strong><span>{note}</span></div>;
}
