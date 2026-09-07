import { useEffect, useMemo, useState } from 'react';
import { getApiToken } from './auth';

type FieldLite = { id: string; code: string; area_ha: string | number | null };
type Props = { farmId: string; seasonId: string; fields: FieldLite[]; role: string };
type ApiEnvelope<T> = { data: T };
type WorkOrderStatus = 'planned'|'scheduled'|'in_progress'|'overdue'|'done'|'cancelled';
type WorkOrder = {
  id: string; number: string | number; farm_id: string | null; field_id: string | null;
  operation_type: string; title: string; status: string; effective_status: WorkOrderStatus;
  priority: 'low'|'normal'|'high'|'critical'; scheduled_for: string | null; started_at: string | null; finished_at: string | null;
  assignee_name: string | null; machine_name: string | null; product_name: string | null; dose: string | number | null; dose_unit: string | null;
  target_area_ha: string | number | null; estimated_cost: string | number | null; actual_cost: string | number | null; notes: string | null;
  check_in_at: string | null; field_code: string | null; farm_name: string | null;
};
type Summary = { total: string|number; planned: string|number; scheduled: string|number; in_progress: string|number; overdue: string|number; done: string|number; cancelled: string|number; due_today: string|number; open_area_ha: string|number; estimated_cost: string|number; actual_cost: string|number };
type Event = { id: string; event_type: string; from_status: string|null; to_status: string|null; notes: string|null; latitude: string|number|null; longitude: string|number|null; created_at: string };

const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const managementRoles = new Set(['owner','admin','manager','agronomist']);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  if (!token) throw new Error('Sessão expirada.');
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'api_error');
  return body as T;
}

const operations = ['Adubação','Aplicação herbicida','Aplicação inseticida','Aplicação fungicida','Irrigação','Plantio','Preparo de solo','Tratos culturais','Vinhaça','Colheita','Manutenção','Outra'];
const statusLabel: Record<WorkOrderStatus,string> = { planned:'Planejada', scheduled:'Agendada', in_progress:'Em execução', overdue:'Atrasada', done:'Concluída', cancelled:'Cancelada' };
const priorityLabel = { low:'Baixa', normal:'Normal', high:'Alta', critical:'Crítica' } as const;
const money = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number = (v: unknown, d=1) => Number(v ?? 0).toLocaleString('pt-BR',{maximumFractionDigits:d});
const dateTime = (v: string|null) => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : 'Sem agenda';

export function OperationsPanel({ farmId, seasonId, fields, role }: Props) {
  const [orders,setOrders] = useState<WorkOrder[]>([]);
  const [summary,setSummary] = useState<Summary|null>(null);
  const [status,setStatus] = useState<''|WorkOrderStatus>('');
  const [showCreate,setShowCreate] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [completion,setCompletion] = useState<{id:string; cost:string; notes:string}|null>(null);
  const [history,setHistory] = useState<{order:WorkOrder; events:Event[]}|null>(null);

  const canManage = managementRoles.has(role);

  async function load() {
    if (!farmId || !seasonId) return;
    setBusy(true); setError('');
    try {
      const query = `seasonId=${encodeURIComponent(seasonId)}&farmId=${encodeURIComponent(farmId)}${status ? `&status=${status}` : ''}`;
      const [orderResult, summaryResult] = await Promise.all([
        api<ApiEnvelope<WorkOrder[]>>(`/api/v1/work-orders?${query}`),
        api<ApiEnvelope<Summary>>(`/api/v1/operations/summary?seasonId=${encodeURIComponent(seasonId)}&farmId=${encodeURIComponent(farmId)}`),
      ]);
      setOrders(orderResult.data); setSummary(summaryResult.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar operações.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [farmId, seasonId, status]);

  const nextOrders = useMemo(() => orders.filter((item) => !['done','cancelled'].includes(item.effective_status)).slice(0,10), [orders]);

  async function action(order: WorkOrder, name: 'start'|'cancel') {
    setBusy(true); setError('');
    try { await api(`/api/v1/work-orders/${order.id}/${name}`, { method:'POST', body: JSON.stringify(name === 'cancel' ? { notes:'Cancelada pelo painel operacional.' } : {}) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar OS.'); }
    finally { setBusy(false); }
  }

  async function checkIn(order: WorkOrder) {
    setError('');
    if (!navigator.geolocation) { setError('Geolocalização não é suportada neste dispositivo.'); return; }
    navigator.geolocation.getCurrentPosition(async (position) => {
      setBusy(true);
      try {
        await api(`/api/v1/work-orders/${order.id}/check-in`, { method:'POST', body: JSON.stringify({ latitude:position.coords.latitude, longitude:position.coords.longitude }) });
        await load();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no check-in.'); }
      finally { setBusy(false); }
    }, () => setError('Permissão de localização negada ou sinal indisponível.'), { enableHighAccuracy:true, timeout:12000, maximumAge:30000 });
  }

  async function complete() {
    if (!completion) return;
    setBusy(true); setError('');
    try {
      await api(`/api/v1/work-orders/${completion.id}/complete`, { method:'POST', body:JSON.stringify({ actualCost: completion.cost ? Number(completion.cost) : undefined, completionNotes: completion.notes || undefined }) });
      setCompletion(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao concluir OS.'); }
    finally { setBusy(false); }
  }

  async function openHistory(order: WorkOrder) {
    try { const result = await api<ApiEnvelope<Event[]>>(`/api/v1/work-orders/${order.id}/events`); setHistory({order,events:result.data}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar histórico.'); }
  }

  return <div className="opsPage">
    <section className="opsKpis">
      <OpsKpi label="EM EXECUÇÃO" value={String(Number(summary?.in_progress ?? 0))} note={`${number(summary?.open_area_ha)} ha em OS abertas`} />
      <OpsKpi label="ATRASADAS" value={String(Number(summary?.overdue ?? 0))} note={`${Number(summary?.due_today ?? 0)} previstas para hoje`} warn={Number(summary?.overdue ?? 0)>0} />
      <OpsKpi label="CONCLUÍDAS" value={String(Number(summary?.done ?? 0))} note="na safra selecionada" />
      <OpsKpi label="CUSTO REAL OS" value={money(summary?.actual_cost)} note={`estimado ${money(summary?.estimated_cost)}`} />
    </section>

    <section className="panel opsToolbarPanel">
      <div className="opsToolbar">
        <div><strong>Ordens de serviço</strong><span>Planejamento e execução de campo</span></div>
        <div className="opsToolbarActions">
          <select value={status} onChange={(e)=>setStatus(e.target.value as ''|WorkOrderStatus)} aria-label="Filtrar status"><option value="">Todos os status</option>{Object.entries(statusLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
          <button type="button" onClick={()=>void load()} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button>
          {canManage && <button className="opsPrimary" type="button" onClick={()=>setShowCreate(v=>!v)}>{showCreate?'Fechar formulário':'+ Nova OS'}</button>}
        </div>
      </div>
      {error && <div className="opsError">{error}</div>}
      {showCreate && <CreateOrderForm farmId={farmId} seasonId={seasonId} fields={fields} onSaved={async()=>{setShowCreate(false);await load();}} />}
    </section>

    <section className="panel opsListPanel">
      <div className="panelTitle"><span>FILA OPERACIONAL</span><small>{orders.length} OS no filtro</small></div>
      <div className="opsList">
        {orders.map(order=><article key={order.id} className={`opsCard priority-${order.priority}`}>
          <div className="opsCardTop"><div className="opsNumber">OS-{String(order.number).padStart(5,'0')}</div><span className={`opsPriority ${order.priority}`}>{priorityLabel[order.priority]}</span><span className={`opsStatus ${order.effective_status}`}>{statusLabel[order.effective_status]}</span></div>
          <div className="opsCardMain"><div><h3>{order.title}</h3><p>{order.operation_type} · {order.field_code ?? 'Fazenda'} · {number(order.target_area_ha)} ha</p></div><div className="opsSchedule"><small>AGENDA</small><strong>{dateTime(order.scheduled_for)}</strong></div></div>
          <div className="opsMeta"><span>Responsável: <strong>{order.assignee_name ?? 'não definido'}</strong></span><span>Máquina: <strong>{order.machine_name ?? '—'}</strong></span><span>Produto: <strong>{order.product_name ?? '—'}</strong></span><span>Custo: <strong>{order.actual_cost!=null?money(order.actual_cost):money(order.estimated_cost)}</strong></span></div>
          <div className="opsActions">
            {['planned','scheduled','overdue'].includes(order.effective_status) && <button onClick={()=>void action(order,'start')}>Iniciar</button>}
            {['planned','scheduled','overdue','in_progress'].includes(order.effective_status) && <button onClick={()=>void checkIn(order)}>Check-in GPS</button>}
            {order.effective_status==='in_progress' && <button className="opsDone" onClick={()=>setCompletion({id:order.id,cost:String(order.actual_cost??''),notes:''})}>Concluir</button>}
            <button onClick={()=>void openHistory(order)}>Histórico</button>
            {canManage && !['done','cancelled'].includes(order.effective_status) && <button className="opsDanger" onClick={()=>void action(order,'cancel')}>Cancelar</button>}
          </div>
        </article>)}
        {!orders.length && <div className="emptyState">Nenhuma ordem de serviço neste filtro.</div>}
      </div>
    </section>

    {nextOrders.length>0 && <section className="panel opsAgenda"><div className="panelTitle"><span>PRÓXIMAS OPERAÇÕES</span><small>prioridade + agenda</small></div><div className="opsAgendaGrid">{nextOrders.map(order=><div key={order.id}><strong>OS-{String(order.number).padStart(5,'0')}</strong><span>{order.field_code??'Fazenda'} · {order.operation_type}</span><small>{dateTime(order.scheduled_for)}</small></div>)}</div></section>}

    {completion && <div className="opsModalBackdrop"><div className="opsModal"><h3>Concluir ordem de serviço</h3><p>O custo real informado será lançado automaticamente no Financeiro da safra.</p><label>Custo real R$<input type="number" min="0" step="0.01" value={completion.cost} onChange={e=>setCompletion({...completion,cost:e.target.value})}/></label><label>Observações<textarea value={completion.notes} onChange={e=>setCompletion({...completion,notes:e.target.value})}/></label><div><button onClick={()=>setCompletion(null)}>Voltar</button><button className="opsDone" onClick={()=>void complete()} disabled={busy}>Concluir OS</button></div></div></div>}

    {history && <div className="opsModalBackdrop"><div className="opsModal opsHistory"><h3>Histórico OS-{String(history.order.number).padStart(5,'0')}</h3><div className="opsTimeline">{history.events.map(event=><div key={event.id}><i/><div><strong>{event.event_type.replaceAll('_',' ')}</strong><span>{event.notes??`${event.from_status??''}${event.to_status?` → ${event.to_status}`:''}`}</span><small>{dateTime(event.created_at)}{event.latitude!=null?` · GPS ${number(event.latitude,4)}, ${number(event.longitude,4)}`:''}</small></div></div>)}{!history.events.length&&<p>Sem eventos.</p>}</div><button onClick={()=>setHistory(null)}>Fechar</button></div></div>}
  </div>;
}

function CreateOrderForm({farmId,seasonId,fields,onSaved}:{farmId:string;seasonId:string;fields:FieldLite[];onSaved:()=>Promise<void>}) {
  const [fieldId,setFieldId]=useState(''); const [operationType,setOperationType]=useState(operations[0]); const [title,setTitle]=useState('');
  const [priority,setPriority]=useState<'low'|'normal'|'high'|'critical'>('normal'); const [scheduledFor,setScheduledFor]=useState(''); const [assignee,setAssignee]=useState('');
  const [machine,setMachine]=useState(''); const [product,setProduct]=useState(''); const [dose,setDose]=useState(''); const [doseUnit,setDoseUnit]=useState('L/ha'); const [estimatedCost,setEstimatedCost]=useState(''); const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/api/v1/work-orders',{method:'POST',body:JSON.stringify({farmId,seasonId,fieldId:fieldId||undefined,operationType,title,priority,scheduledFor:scheduledFor?new Date(scheduledFor).toISOString():undefined,assigneeName:assignee||undefined,machineName:machine||undefined,productName:product||undefined,dose:dose?Number(dose):undefined,doseUnit:dose?doseUnit:undefined,estimatedCost:estimatedCost?Number(estimatedCost):undefined,notes:notes||undefined})});await onSaved();}catch(cause){setError(cause instanceof Error?cause.message:'Falha ao criar OS.');}finally{setBusy(false)}}
  return <form className="opsCreateForm" onSubmit={submit}><div className="opsFormGrid"><label>Talhão<select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">Fazenda inteira</option>{fields.map(f=><option key={f.id} value={f.id}>{f.code} · {number(f.area_ha)} ha</option>)}</select></label><label>Operação<select value={operationType} onChange={e=>setOperationType(e.target.value)}>{operations.map(item=><option key={item}>{item}</option>)}</select></label><label>Título<input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Adubação de cobertura Q08"/></label><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}>{Object.entries(priorityLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Agendar para<input type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/></label><label>Responsável<input value={assignee} onChange={e=>setAssignee(e.target.value)} placeholder="Equipe ou colaborador"/></label><label>Máquina<input value={machine} onChange={e=>setMachine(e.target.value)} placeholder="Trator / pulverizador"/></label><label>Produto<input value={product} onChange={e=>setProduct(e.target.value)} placeholder="Insumo principal"/></label><label>Dose<div className="opsInline"><input type="number" min="0" step="0.001" value={dose} onChange={e=>setDose(e.target.value)}/><input value={doseUnit} onChange={e=>setDoseUnit(e.target.value)}/></div></label><label>Custo estimado R$<input type="number" min="0" step="0.01" value={estimatedCost} onChange={e=>setEstimatedCost(e.target.value)}/></label><label className="opsWide">Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Orientações de execução, segurança, condição de campo…"/></label></div>{error&&<div className="opsError">{error}</div>}<button className="opsPrimary" disabled={busy}>{busy?'Criando…':'Criar ordem de serviço'}</button></form>;
}

function OpsKpi({label,value,note,warn=false}:{label:string;value:string;note:string;warn?:boolean}){return <div className="opsKpi"><small>{label}</small><strong className={warn?'warning':''}>{value}</strong><span>{note}</span></div>}
