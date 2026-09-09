import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v27.json'
dst = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v28.json'
flow = json.loads(src.read_text(encoding='utf-8'))
base = {s['id']: deepcopy(s) for s in flow['screens']}
ROUNDS = list('ABCDEFGHIJKL')

# V28: tap product -> full product card -> choose quantity -> add -> return to list.
# NavigationList is used because it gives a true one-tap row without a checkbox.
# Copies of list/detail screens are unrolled to preserve Meta's forward-only routing.

qty_schema = {
    'type': 'object',
    'properties': {'id': {'type': 'string'}, 'title': {'type': 'string'}},
}
nav_item_schema = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'main-content': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string'},
                'description': {'type': 'string'},
                'metadata': {'type': 'string'},
            },
        },
        'start': {
            'type': 'object',
            'properties': {
                'image': {'type': 'string'},
                'alt-text': {'type': 'string'},
            },
        },
        'end': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string'},
                'description': {'type': 'string'},
                'metadata': {'type': 'string'},
            },
        },
        'on-click-action': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'payload': {
                    'type': 'object',
                    'properties': {
                        'trigger': {'type': 'string'},
                        'choice': {'type': 'string'},
                        'product_id': {'type': 'string'},
                    },
                },
            },
        },
    },
}


def menu_screen(suffix: str):
    return {
        'id': f'MENU_{suffix}',
        'title': 'Seu pedido',
        'data': {
            'menu_items': {
                'type': 'array',
                'items': nav_item_schema,
                '__example__': [
                    {
                        'id': 'revisar',
                        'main-content': {'title': 'Finalizar pedido', 'metadata': 'Total atual: R$ 420,00'},
                        'on-click-action': {'name': 'data_exchange', 'payload': {'trigger': 'nav_menu_action_v1', 'choice': 'revisar'}},
                    },
                    {
                        'id': 'mercearia',
                        'main-content': {'title': 'Mercearia', 'metadata': 'Arroz, feijão, café, massas e mais'},
                        'on-click-action': {'name': 'data_exchange', 'payload': {'trigger': 'nav_menu_action_v1', 'choice': 'mercearia'}},
                    },
                    {
                        'id': 'buscar',
                        'main-content': {'title': 'Buscar produto', 'metadata': 'Digite o nome do que procura'},
                        'on-click-action': {'name': 'data_exchange', 'payload': {'trigger': 'nav_menu_action_v1', 'choice': 'buscar'}},
                    },
                ],
            },
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {'type': 'NavigationList', 'name': f'menu_{suffix.lower()}', 'list-items': '${data.menu_items}'},
            ],
        },
    }


def search_screen(suffix: str):
    return {
        'id': f'BUSCA_{suffix}',
        'title': 'Buscar produto',
        'data': {
            'message': {'type': 'string', '__example__': 'Digite pelo menos 2 letras.'},
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {'type': 'TextHeading', 'text': 'O que você procura?'},
                {'type': 'TextBody', 'text': '${data.message}'},
                {
                    'type': 'Form',
                    'name': f'search_form_{suffix.lower()}',
                    'children': [
                        {
                            'type': 'TextInput',
                            'name': 'direct_query',
                            'label': 'Nome do produto',
                            'helper-text': 'Ex.: leite, sabonete, café, detergente',
                            'required': True,
                        },
                        {
                            'type': 'Footer',
                            'label': 'Buscar produtos',
                            'on-click-action': {
                                'name': 'data_exchange',
                                'payload': {'trigger': 'nav_search_v1', 'direct_query': '${form.direct_query}'},
                            },
                        },
                    ],
                },
            ],
        },
    }


def products_screen(suffix: str):
    return {
        'id': f'PRODUTOS_{suffix}',
        'title': 'Escolha um produto',
        'data': {
            'action_items': {
                'type': 'array',
                'items': nav_item_schema,
                '__example__': [
                    {
                        'id': 'revisar',
                        'main-content': {'title': 'Finalizar pedido', 'metadata': 'Total atual: R$ 420,00'},
                        'on-click-action': {'name': 'data_exchange', 'payload': {'trigger': 'nav_product_action_v1', 'choice': 'revisar'}},
                    }
                ],
            },
            'product_items': {
                'type': 'array',
                'items': nav_item_schema,
                '__example__': [
                    {
                        'id': '00000000-0000-0000-0000-000000000000',
                        'main-content': {'title': 'Sabonete Dove 90g', 'description': 'Dove · 90g', 'metadata': 'Toque para ver detalhes'},
                        'start': {'image': 'iVBORw0KGgoAAA...', 'alt-text': 'Sabonete Dove 90g'},
                        'end': {'title': 'R$ 4,99'},
                        'on-click-action': {'name': 'data_exchange', 'payload': {'trigger': 'nav_product_open_v1', 'product_id': '00000000-0000-0000-0000-000000000000'}},
                    }
                ],
            },
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {'type': 'NavigationList', 'name': f'actions_{suffix.lower()}', 'list-items': '${data.action_items}'},
                {'type': 'NavigationList', 'name': f'products_{suffix.lower()}', 'list-items': '${data.product_items}'},
            ],
        },
    }


def product_detail_screen(suffix: str):
    return {
        'id': f'PRODUTO_{suffix}',
        'title': 'Detalhes do produto',
        'data': {
            'product_name': {'type': 'string', '__example__': 'Dove Sabonete Líquido Baby 400ml'},
            'product_price': {'type': 'string', '__example__': 'R$ 26,90'},
            'product_meta': {'type': 'string', '__example__': 'Dove · 400ml'},
            'product_description': {'type': 'string', '__example__': 'Produto disponível para adicionar ao seu pedido.'},
            'product_image_base64': {'type': 'string', '__example__': 'iVBORw0KGgoAAA...'},
            'has_product_image': {'type': 'boolean', '__example__': True},
            'quantity_options': {
                'type': 'array',
                'items': qty_schema,
                '__example__': [
                    {'id': '1', 'title': '1 unidade'},
                    {'id': '2', 'title': '2 unidades'},
                    {'id': '3', 'title': '3 unidades'},
                ],
            },
            'init_values': {
                'type': 'object',
                'properties': {'quantity': {'type': 'string'}},
                '__example__': {'quantity': '1'},
            },
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {
                    'type': 'Image',
                    'src': '${data.product_image_base64}',
                    'alt-text': '${data.product_name}',
                    'visible': '${data.has_product_image}',
                    'height': 240,
                    'scale-type': 'contain',
                },
                {'type': 'TextHeading', 'text': '${data.product_name}'},
                {'type': 'TextSubheading', 'text': '${data.product_price}'},
                {'type': 'TextCaption', 'text': '${data.product_meta}'},
                {'type': 'TextBody', 'text': '${data.product_description}'},
                {
                    'type': 'Form',
                    'name': f'product_form_{suffix.lower()}',
                    'init-values': '${data.init_values}',
                    'children': [
                        {
                            'type': 'RadioButtonsGroup',
                            'name': 'quantity',
                            'label': 'Escolha a quantidade',
                            'data-source': '${data.quantity_options}',
                            'required': True,
                        },
                        {
                            'type': 'Footer',
                            'label': 'Adicionar ao pedido',
                            'on-click-action': {
                                'name': 'data_exchange',
                                'payload': {'trigger': 'nav_product_add_v1', 'quantity': '${form.quantity}'},
                            },
                        },
                    ],
                },
            ],
        },
    }

# Keep fixed, already-validated basket/editor/checkout screens from V27.
cestas = base['CESTAS']
personal = base['PERSONALIZAR_A']
review = base['REVISAO']
known = base['CLIENTE_EXISTENTE']
new_customer = base['CLIENTE_NOVO']
final = base['FINALIZAR']
failure = base['FALHA_FINALIZACAO']

screens = [cestas, personal]
for r in ROUNDS:
    screens.extend([menu_screen(r), search_screen(r), products_screen(r), product_detail_screen(r)])
screens.extend([review, known, new_customer, final, failure])
flow['screens'] = screens

routing = {
    'CESTAS': ['PERSONALIZAR_A'],
    'PERSONALIZAR_A': ['MENU_A'],
}
for idx, r in enumerate(ROUNDS):
    nxt = ROUNDS[idx + 1] if idx + 1 < len(ROUNDS) else None
    routing[f'MENU_{r}'] = [f'BUSCA_{r}', f'PRODUTOS_{r}', 'REVISAO']
    routing[f'BUSCA_{r}'] = [f'PRODUTOS_{r}']
    targets = [f'PRODUTO_{r}', 'REVISAO']
    if nxt:
        targets.extend([f'MENU_{nxt}', f'PRODUTOS_{nxt}'])
    routing[f'PRODUTOS_{r}'] = targets
    routing[f'PRODUTO_{r}'] = [f'PRODUTOS_{nxt}'] if nxt else ['REVISAO']
routing['REVISAO'] = ['CLIENTE_EXISTENTE', 'CLIENTE_NOVO']
routing['CLIENTE_EXISTENTE'] = ['FINALIZAR', 'FALHA_FINALIZACAO']
routing['CLIENTE_NOVO'] = ['FINALIZAR', 'FALHA_FINALIZACAO']
routing['FINALIZAR'] = []
routing['FALHA_FINALIZACAO'] = []
flow['routing_model'] = routing

dst.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'wrote {dst} with {len(flow["screens"])} screens')
