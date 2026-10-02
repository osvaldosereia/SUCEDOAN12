from pathlib import Path

sqlp=Path('supabase/sql/20261001_admin_attendance_v1.sql')
sql=sqlp.read_text()
old_activity="""      greatest(
        coalesce(c.last_inbound_at,'epoch'::timestamptz),
        coalesce(c.last_outbound_at,'epoch'::timestamptz),
        coalesce(c.updated_at,'epoch'::timestamptz),
        coalesce(c.created_at,'epoch'::timestamptz)
      ) as last_activity_at,"""
new_activity="""      greatest(
        coalesce(lm.message_at,'epoch'::timestamptz),
        coalesce(c.last_inbound_at,'epoch'::timestamptz),
        coalesce(c.last_outbound_at,'epoch'::timestamptz),
        coalesce(c.created_at,'epoch'::timestamptz)
      ) as last_activity_at,"""
if old_activity not in sql:
    raise SystemExit('activity pattern not found')
sql=sql.replace(old_activity,new_activity,1)
old_order="""    order by
      (q.unread_count>0 or q.human_required or q.status='needs_human') desc,
      q.unread_count desc,
      q.last_activity_at desc,
      q.conversation_id"""
new_order="""    order by
      q.last_activity_at desc,
      q.conversation_id"""
if sql.count(old_order)!=2:
    raise SystemExit(f'expected 2 queue ordering blocks, found {sql.count(old_order)}')
sql=sql.replace(old_order,new_order)
sqlp.write_text(sql)

jsp=Path('vitrine/admin/atendimento/attendance.js')
js=jsp.read_text()
anchor="""const fmtDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});"""
helpers="""const fmtDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)};
const localDay=value=>{const d=new Date(value);return Number.isNaN(+d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate())};
const dayDiff=value=>{const d=localDay(value),today=localDay(new Date());return !d||!today?null:Math.round((today-d)/86400000)};
function fmtQueueStamp(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(+d))return '';const diff=dayDiff(value);if(diff===0)return fmtTime(value);if(diff===1)return 'Ontem';const now=new Date();return new Intl.DateTimeFormat('pt-BR',d.getFullYear()===now.getFullYear()?{day:'2-digit',month:'2-digit'}:{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)}
function fmtMessageDay(value){const d=new Date(value);if(Number.isNaN(+d))return '';const diff=dayDiff(value);if(diff===0)return 'Hoje';if(diff===1)return 'Ontem';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function messageDayKey(value){const d=localDay(value);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:''}
const fmtDateTime=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});"""
if anchor not in js:
    raise SystemExit('date helpers anchor not found')
js=js.replace(anchor,helpers,1)
old_card="time.textContent=fmtTime(item.last_activity_at);title.append(name,time);"
new_card="time.textContent=fmtQueueStamp(item.last_activity_at||item.last_message_at);time.title=fmtDateTime(item.last_activity_at||item.last_message_at);title.append(name,time);"
if old_card not in js:
    raise SystemExit('queue stamp pattern not found')
js=js.replace(old_card,new_card,1)
old_render="function renderMessages({scrollToBottom=true,preserveOffset=0}={}){const box=$('#messages');box.replaceChildren();for(const msg of state.conversation?.messages||[])box.append(renderMessage(msg));box.hidden=false;$('#conversationEmpty').hidden=true;if(scrollToBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=Math.max(0,preserveOffset);renderConversationHead();renderServiceWindow()}"
new_render="function renderMessageList(box,messages){box.replaceChildren();let lastDay='';for(const msg of messages||[]){const day=messageDayKey(msg.message_at);if(day&&day!==lastDay){const sep=document.createElement('div');sep.className='message-date-separator';sep.textContent=fmtMessageDay(msg.message_at);box.append(sep);lastDay=day}box.append(renderMessage(msg))}}\nfunction renderMessages({scrollToBottom=true,preserveOffset=0}={}){const box=$('#messages');renderMessageList(box,state.conversation?.messages||[]);box.hidden=false;$('#conversationEmpty').hidden=true;if(scrollToBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=Math.max(0,preserveOffset);renderConversationHead();renderServiceWindow()}"
if old_render not in js:
    raise SystemExit('renderMessages pattern not found')
js=js.replace(old_render,new_render,1)
old_older="box.replaceChildren();for(const msg of state.conversation.messages)box.append(renderMessage(msg));box.scrollTop=box.scrollHeight-beforeHeight+oldTop"
new_older="renderMessageList(box,state.conversation.messages);box.scrollTop=box.scrollHeight-beforeHeight+oldTop"
if old_older not in js:
    raise SystemExit('loadOlder render pattern not found')
js=js.replace(old_older,new_older,1)
jsp.write_text(js)

cssp=Path('vitrine/admin/atendimento/attendance.css')
css=cssp.read_text()
old_css=".messages{min-height:0;overflow:auto;padding:15px;background:#f7f8fa}.message-row{"
new_css=".messages{min-height:0;overflow:auto;padding:15px;background:#f7f8fa}.message-date-separator{position:sticky;top:4px;z-index:2;width:max-content;margin:8px auto;padding:4px 9px;border:1px solid #e4e7ec;border-radius:999px;background:#fff;color:#667085;font-size:10px;font-weight:650;box-shadow:0 1px 2px #1018280d}.message-row{"
if old_css not in css:
    raise SystemExit('messages css pattern not found')
css=css.replace(old_css,new_css,1)
cssp.write_text(css)
