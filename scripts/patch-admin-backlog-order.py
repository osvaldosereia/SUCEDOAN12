from pathlib import Path

path = Path('vitrine/admin/index.html')
s = path.read_text(encoding='utf-8')

if 'function isBacklogOrder(o)' in s:
    print('isBacklogOrder already present')
    raise SystemExit(0)

anchor = "  function orderIssueMatch(o,key='all'){"
if anchor not in s:
    raise SystemExit('patch anchor not found')

helper = """  function isBacklogOrder(o){
    if(!o||!['created','confirmed','processing','ready','out_for_delivery'].includes(o.status))return false;
    const orderDay=cuiabaDayKey(o.created_at);
    const today=cuiabaDayKey(new Date());
    return Boolean(orderDay&&today&&orderDay<today);
  }
"""

s = s.replace(anchor, helper + anchor, 1)
path.write_text(s, encoding='utf-8')
print('isBacklogOrder restored')
