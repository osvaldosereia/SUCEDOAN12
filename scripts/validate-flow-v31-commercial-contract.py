#!/usr/bin/env python3
import json
from pathlib import Path

FLOW = Path('whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json')


def walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


def triggers(screen):
    found = []
    for node in walk(screen):
        if isinstance(node, dict):
            payload = node.get('payload')
            if isinstance(payload, dict) and isinstance(payload.get('trigger'), str):
                found.append(payload['trigger'])
    return set(found)


def raw(screen):
    return json.dumps(screen, ensure_ascii=False).lower()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


flow = json.loads(FLOW.read_text(encoding='utf-8'))
require(flow.get('version') == '7.3', 'Flow version must remain 7.3')
require(flow.get('data_api_version') == '3.0', 'Data API version must remain 3.0')
require(set(flow) <= {'version', 'data_api_version', 'routing_model', 'screens'}, 'Unsupported Meta root keys')

screens = {screen['id']: screen for screen in flow['screens']}
require(len(screens) == len(flow['screens']), 'Duplicate screen ids are forbidden')
required = {
    'CESTAS',
    'PERSONALIZAR_A', 'AJUSTAR_ITEM_A',
    'SECOES_A', 'TERMOS_A', 'PRODUTOS_A', 'PRODUTO_A',
    'SECOES_B', 'TERMOS_B', 'PRODUTOS_B', 'PRODUTO_B',
    'SECOES_C', 'TERMOS_C', 'PRODUTOS_C', 'PRODUTO_C',
    'UPSELL', 'REVISAO', 'CLIENTE_EXISTENTE', 'CLIENTE_NOVO', 'FINALIZAR'
}
require(required <= set(screens), f'Missing commercial screens: {sorted(required - set(screens))}')

# Routing integrity: every declared destination must exist.
for source, destinations in flow['routing_model'].items():
    require(source in screens, f'Routing source {source} has no screen')
    for destination in destinations:
        require(destination in screens, f'Routing target {destination} has no screen')

# Basket selection must remain visual and deterministic.
basket_props = screens['CESTAS']['data']['baskets']['items']['properties']
require('image' in basket_props, 'Basket cards must keep images')
require('basket_selected' in triggers(screens['CESTAS']), 'Basket selection must use Data Exchange')

# Basket components never expose individual commercial prices.
for screen_id in [k for k in screens if k.startswith('PERSONALIZAR_') or k.startswith('AJUSTAR_ITEM_')]:
    content = raw(screens[screen_id])
    forbidden = ['unit_price', 'item_price', 'component_price', 'preço unitário', 'preco unitario']
    for token in forbidden:
        require(token not in content, f'{screen_id}: basket component price field/text forbidden: {token}')

# Product discovery must always be segmented; full catalog UI is forbidden.
for round_id in ('A', 'B', 'C'):
    section = screens[f'SECOES_{round_id}']
    terms = screens[f'TERMOS_{round_id}']
    products = screens[f'PRODUTOS_{round_id}']
    detail = screens[f'PRODUTO_{round_id}']

    require('extras_continue_v2' in triggers(section), f'SECOES_{round_id}: segmented/direct-search trigger missing')
    section_raw = raw(section)
    require('section_keys' in section_raw, f'SECOES_{round_id}: macro section selection missing')
    require('direct_query' in section_raw, f'SECOES_{round_id}: direct query missing')

    require('term_selected_v2' in triggers(terms), f'TERMOS_{round_id}: term search trigger missing')

    for node in walk(products.get('layout', {})):
        require(node.get('type') != 'NavigationList', f'PRODUTOS_{round_id}: NavigationList forbidden')
        require(node.get('type') != 'Image', f'PRODUTOS_{round_id}: list images forbidden in stable candidate')
    product_raw = raw(products)
    require('media-size' not in product_raw, f'PRODUTOS_{round_id}: media-size forbidden')
    require('products' in screens[f'PRODUTOS_{round_id}'].get('data', {}), f'PRODUTOS_{round_id}: dynamic products array missing')
    require('quantity' in raw(detail), f'PRODUTO_{round_id}: quantity selection missing')

# Upsell must remain optional and backed by product data, never mandatory.
upsell_raw = raw(screens['UPSELL'])
require('products' in screens['UPSELL'].get('data', {}), 'UPSELL: dynamic products missing')
require('opcion' in upsell_raw or 'sem adicionar' in upsell_raw or 'seguir' in upsell_raw, 'UPSELL: optional nature must be explicit')

# Review, customer reuse and completion must remain in the commercial route.
review_routes = set(flow['routing_model'].get('REVISAO', []))
require({'CLIENTE_EXISTENTE', 'CLIENTE_NOVO'} <= review_routes, 'REVISAO must branch to existing/new customer')
require(flow['routing_model'].get('CLIENTE_EXISTENTE') == ['FINALIZAR'], 'Existing customer must reach FINALIZAR')
require(flow['routing_model'].get('CLIENTE_NOVO') == ['FINALIZAR'], 'New customer must reach FINALIZAR')
require(flow['routing_model'].get('FINALIZAR') == [], 'FINALIZAR must remain terminal')

final_raw = raw(screens['FINALIZAR'])
require('complete' in final_raw or 'flow_token' in final_raw or 'extension_message_response' in final_raw, 'FINALIZAR: completion contract missing')

# Guard against accidental giant static catalogs embedded into the Flow JSON.
for screen_id, screen in screens.items():
    for key, spec in (screen.get('data') or {}).items():
        if isinstance(spec, dict) and isinstance(spec.get('__example__'), list):
            require(len(spec['__example__']) <= 20, f'{screen_id}.{key}: static example exceeds 20 items')

print('flow_v31_commercial_contract_ok')
