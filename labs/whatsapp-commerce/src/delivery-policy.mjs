/**
 * Pure Dona Antônia delivery-date policy simulator.
 * No clock or service calls: caller supplies the instant and closure dates.
 * Office policy: delivery in Cuiabá/Várzea Grande only; after 12:00 Cuiabá
 * local time delivers on the next available operational day.
 * Sundays and configured holidays are closed.
 *
 * NOTE: Configured holiday set must be refreshed from the real Vitrine/Admin
 * before a future production integration. Never hardcode municipal holidays.
 */
const tz='America/Cuiaba';
const dateRE=/^\d{4}-\d{2}-\d{2}$/;
const format=new Intl.DateTimeFormat('en-CA',{
  timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const validDate=s=>dateRE.test(s)&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const localParts=instant=>{
 const d=new Date(instant);
 if(!Number.isFinite(d.getTime()))throw Error('invalid_instant');
 const p=Object.fromEntries(format.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,
   hour:Number(p.hour),minute:Number(p.minute)};
};
const increment=ymd=>{
 const date=new Date(ymd+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
};
const dow=ymd=>new Date(ymd+'T12:00:00Z').getUTCDay();
const assertPlace=city=>{
 const value=String(city||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('pt-BR').trim();
 if(!['cuiaba','varzea grande'].includes(value))throw Error('delivery_outside_service_area');
};
export function estimateDelivery(instant,{
  city,closedDates=[],cutoffHour=12,closedWeekdays=[0]
}={}){
 assertPlace(city);
 if(!Array.isArray(closedDates)||!closedDates.every(validDate))throw Error('invalid_closure_dates');
 if(!Array.isArray(closedWeekdays)||!closedWeekdays.every(n=>Number.isInteger(n)&&n>=0&&n<=6))throw Error('closed_weekdays_invalid');
 if(!Number.isSafeInteger(cutoffHour)||cutoffHour<0||cutoffHour>23)throw Error('cutoff_invalid');
 const local=localParts(instant),closed=new Set(closedDates),weekdays=new Set(closedWeekdays);
 let day=local.date,postCutoff=local.hour>=cutoffHour;
 if(postCutoff)day=increment(day);
 for(let attempt=0;attempt<370;attempt++){
  if(!closed.has(day)&&!weekdays.has(dow(day)))
   return {delivery_date:day,policy_time_zone:tz,
     same_day:day===local.date,after_cutoff:postCutoff,
     service_city:String(city).trim()};
  day=increment(day);
 }
 throw Error('no_operational_delivery_day');
}
