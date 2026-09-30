import { buildSimplesCsv, buildSimplesHtml } from './export.ts';

export interface SimplesActor { userId:string|null; role:string }
export interface SimplesDispatchInput { action:string; method:string; query:Record<string,string|undefined>; body:any; actor:SimplesActor }
export interface SimplesDispatchResult { status:number; body:any; contentType?:string; rawBody?:string }
export interface SimplesServiceDeps {
  findPeriodByCompetence:(competence:string)=>Promise<any|null>;
  getPeriod:(periodId:string)=>Promise<any|null>;
  recalculatePeriod:(competence:string,actor:SimplesActor)=>Promise<any>;
  listIssues:(periodId:string)=>Promise<any[]>;
  resolveIssue:(issueId:string,resolution:any,actor:SimplesActor)=>Promise<any>;
  getGate:(periodId:string)=>Promise<any>;
  lockPeriod:(periodId:string,actor:SimplesActor)=>Promise<any>;
  saveHomologation:(input:any,actor:SimplesActor)=>Promise<any>;
  getExportSnapshot:(periodId:string)=>Promise<any>;
  getHistoryStatus:(competence:string)=>Promise<any>;
  collectHistoryMonth:(competence:string,actor:SimplesActor)=>Promise<any>;
}

export const isValidCompetence=(v:any)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v??''));
const isEditor=(role:string)=>['owner','admin','manager'].includes(String(role||''));
const ok=(body:any,status=200):SimplesDispatchResult=>({status,body:{ok:true,...body}});
const err=(error:string,status=400,extra:any={}):SimplesDispatchResult=>({status,body:{ok:false,error,...extra}});
const periodId=(v:any)=>String(v??'').trim();

export function createSimplesService(deps:SimplesServiceDeps){
  return {
    async dispatch(input:SimplesDispatchInput):Promise<SimplesDispatchResult>{
      const action=String(input.action||'').toLowerCase();
      const body=input.body&&typeof input.body==='object'?input.body:{};
      const q=input.query||{};

      if(action==='simples_summary'){
        const competence=String(q.competence||body.competence_month||'');
        if(!isValidCompetence(competence))return err('invalid_competence',400);
        const period=await deps.findPeriodByCompetence(competence);
        if(!period)return ok({competence,period:null,issues:[],gate:null});
        const [issues,gate]=await Promise.all([deps.listIssues(period.id),deps.getGate(period.id)]);
        return ok({competence,period,issues,gate});
      }

      if(action==='simples_history_status'){
        const competence=String(q.competence||body.competence_month||'');
        if(!isValidCompetence(competence))return err('invalid_competence',400);
        return ok({history:await deps.getHistoryStatus(competence)});
      }

      if(action==='simples_history_collect_month'){
        if(!isEditor(input.actor.role))return err('editor_required',403);
        const competence=String(body.competence_month||q.competence||'');
        if(!isValidCompetence(competence))return err('invalid_competence',400);
        return ok({history_month:await deps.collectHistoryMonth(competence,input.actor)});
      }

      if(action==='simples_recalculate'){
        if(!isEditor(input.actor.role))return err('editor_required',403);
        const competence=String(body.competence_month||q.competence||'');
        if(!isValidCompetence(competence))return err('invalid_competence',400);
        const existing=await deps.findPeriodByCompetence(competence);
        if(existing&&['locked','superseded'].includes(String(existing.status)))return err('period_locked',409,{period_id:existing.id,status:existing.status});
        const period=await deps.recalculatePeriod(competence,input.actor);
        const gate=period?.id?await deps.getGate(period.id):null;
        return ok({period,gate});
      }

      if(action==='simples_issues'){
        const id=periodId(q.period_id||body.period_id);
        if(!id)return err('period_id_required',400);
        const period=await deps.getPeriod(id);
        if(!period)return err('period_not_found',404);
        return ok({period_id:id,issues:await deps.listIssues(id)});
      }

      if(action==='simples_resolve_issue'){
        if(!isEditor(input.actor.role))return err('editor_required',403);
        const id=periodId(body.issue_id);
        const reason=String(body.reason||body.resolution?.reason||'').trim();
        if(!id)return err('issue_id_required',400);
        if(!reason)return err('resolution_reason_required',400);
        const result=await deps.resolveIssue(id,{...(body.resolution||{}),reason,status:body.status||'resolved'},input.actor);
        return ok({issue:result});
      }

      if(action==='simples_lock'){
        if(!isEditor(input.actor.role))return err('editor_required',403);
        const id=periodId(body.period_id);
        if(!id)return err('period_id_required',400);
        const period=await deps.getPeriod(id);
        if(!period)return err('period_not_found',404);
        if(['locked','superseded'].includes(String(period.status)))return err('period_locked',409,{period_id:id,status:period.status});
        const gate=await deps.getGate(id);
        if(gate?.ready!==true)return err('period_not_ready',409,{gate});
        const locked=await deps.lockPeriod(id,input.actor);
        return ok({period:locked,gate});
      }

      if(action==='simples_homologation_save'){
        if(!isEditor(input.actor.role))return err('editor_required',403);
        const id=periodId(body.period_id);
        const amount=Number(body.accountant_das_amount);
        if(!id)return err('period_id_required',400);
        if(!Number.isFinite(amount)||amount<0)return err('invalid_accountant_das_amount',400);
        const period=await deps.getPeriod(id);
        if(!period)return err('period_not_found',404);
        const check=await deps.saveHomologation({period_id:id,accountant_das_amount:amount,accountant_values:body.accountant_values||{},notes:String(body.notes||'')},input.actor);
        return ok({homologation:check});
      }

      if(action==='simples_export'){
        const id=periodId(q.period_id||body.period_id),format=String(q.format||body.format||'csv').toLowerCase();
        if(!id)return err('period_id_required',400);
        const period=await deps.getPeriod(id);
        if(!period)return err('period_not_found',404);
        if(!['csv','html'].includes(format))return err('invalid_export_format',400);
        const snapshot=await deps.getExportSnapshot(id);
        const rawBody=format==='csv'?buildSimplesCsv(snapshot):buildSimplesHtml(snapshot);
        return {status:200,body:{ok:true},rawBody,contentType:format==='csv'?'text/csv; charset=utf-8':'text/html; charset=utf-8'};
      }

      return err('unknown_action',400);
    }
  };
}
