from pathlib import Path

admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
quote = Path('orcamento/app-original.html').read_text(encoding='utf-8')

checks = [
    ('admin api retry signature', 'async function api(action,params={},options={},retryAuth=true)' in admin),
    ('admin api retry recursion', "return await api(action,params,options,false)" in admin),
    ('product image retry signature', 'async function productImageApi(event,payload=null,retryAuth=true)' in admin),
    ('product image retry recursion', "return await productImageApi(event,payload,false)" in admin),
    ('customer retry signature', 'async function customerApi(action,payload={},retryAuth=true)' in admin),
    ('customer retry recursion', "return await customerApi(action,payload,false)" in admin),
    ('stale-token-safe session clear', 'function clearFinanceSession(expectedToken=' in admin),
    ('quote GET retry signature', 'async function adminGet(action,params={},retryAuth=true)' in quote),
    ('quote POST retry signature', 'async function adminPost(action,payload={},retryAuth=true)' in quote),
    ('quote customer retry signature', 'async function customerAdmin(action,payload={},retryAuth=true)' in quote),
    ('quote stale token clears', quote.count('sessionStorage.removeItem(ADMIN_TOKEN_KEY)') >= 3),
]

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit('auto-session retry contract missing: ' + ', '.join(failed))

print('auto-session retry contract OK')
