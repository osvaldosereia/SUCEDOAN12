import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v26.json'
dst = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v27.json'
flow = json.loads(src.read_text(encoding='utf-8'))
base = {s['id']: deepcopy(s) for s in flow['screens']}

# -----------------------------------------------------------------------------
# V27 design goals
# - one tap for one-choice navigation (chips + Data Exchange)
# - multi-select + continue only when selecting several products
# - up to 20 compact image options per product page
# - quantities on a dedicated compact screen only for selected products
# - finishing the order is always the first, easiest path
# - no literal interpolation such as "Total: ${data.total}"
# - known customer data is displayed directly; new/partial data is prefilled
# - terminal success screen only receives server-built labels
# -----------------------------------------------------------------------------

# Cestas: keep the proven visual selector. Clarify that customization is optional.
cestas = base['CESTAS']
for child in cestas.get('layout', {}).get('children', []):
    if child.get('type') == 'TextBody':
        child['text'] = 'Escolha a cesta que combina com você. Depois, só altere algo se quiser.'
    if child.get('type') == 'Footer':
        child['label'] = 'Escolher cesta'

# Personalização remains one screen, but no longer feels mandatory.
personal = base['PERSONALIZAR_A']
personal['title'] = 'Sua cesta'
if 'basket_note' in personal.get('data', {}):
    personal['data']['basket_note']['__example__'] = (
        'Sua cesta já está pronta. Se estiver boa assim, não altere nada. '
        'Use os seletores somente nos itens que quiser mudar.'
    )
for child in personal.get('layout', {}).get('children', []):
    if child.get('type') == 'TextHeading':
        child['text'] = '${data.basket_name}'
    elif child.get('type') == 'TextSubheading' and child.get('text') == '${data.basket_price}':
        pass
    elif child.get('type') == 'TextBody' and child.get('text') == '${data.basket_note}':
        pass
    elif child.get('type') == 'Footer':
        child['label'] = 'Continuar com esta cesta'

# Generic schemas used by dynamic data.
choice_item_schema = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'title': {'type': 'string'},
        'enabled': {'type': 'boolean'},
    },
}
product_option_schema = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'title': {'type': 'string'},
        'description': {'type': 'string'},
        'image': {'type': 'string'},
        'alt-text': {'type': 'string'},
        'enabled': {'type': 'boolean'},
    },
}
qty_option_schema = {
    'type': 'object',
    'properties': {'id': {'type': 'string'}, 'title': {'type': 'string'}},
}


def section_screen(suffix: str):
    """Fast menu: direct chips for one-choice actions + search field/footer."""
    return {
        'id': f'SECOES_{suffix}',
        'title': 'Seu pedido',
        'data': {
            'cart_total': {'type': 'string', '__example__': 'Total atual: R$ 420,00'},
            'message': {
                'type': 'string',
                '__example__': 'Sua cesta está pronta. Finalize agora ou acrescente outros produtos.'
            },
            'quick_actions': {
                'type': 'array',
                'items': choice_item_schema,
                '__example__': [
                    {'id': 'revisar', 'title': 'Finalizar pedido', 'enabled': True},
                    {'id': 'mercearia', 'title': 'Mercearia', 'enabled': True},
                    {'id': 'limpeza', 'title': 'Limpeza', 'enabled': True},
                    {'id': 'higiene', 'title': 'Higiene e beleza', 'enabled': True},
                    {'id': 'bebidas', 'title': 'Bebidas', 'enabled': True},
                    {'id': 'casa_pet', 'title': 'Casa e pet', 'enabled': True},
                ],
            },
            'search_hint': {'type': 'string', '__example__': 'Ex.: leite, sabonete, café, detergente'},
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {'type': 'TextHeading', 'text': 'Seu pedido está pronto'},
                {'type': 'TextSubheading', 'text': '${data.cart_total}'},
                {'type': 'TextBody', 'text': '${data.message}'},
                {
                    'type': 'Form',
                    'name': f'menu_form_{suffix.lower()}',
                    'children': [
                        {
                            'type': 'ChipsSelector',
                            'name': 'quick_action',
                            'label': 'O que deseja fazer?',
                            'data-source': '${data.quick_actions}',
                            'min-selected-items': 0,
                            'max-selected-items': 1,
                            'on-select-action': {
                                'name': 'data_exchange',
                                'payload': {
                                    'trigger': 'premium_menu_action_v1',
                                    'choice': '${form.quick_action}',
                                },
                            },
                        },
                        {
                            'type': 'TextInput',
                            'name': 'direct_query',
                            'label': 'Buscar produto',
                            'helper-text': '${data.search_hint}',
                            'required': False,
                        },
                        {
                            'type': 'Footer',
                            'label': 'Buscar',
                            'on-click-action': {
                                'name': 'data_exchange',
                                'payload': {
                                    'trigger': 'premium_search_v1',
                                    'direct_query': '${form.direct_query}',
                                },
                            },
                        },
                    ],
                },
            ],
        },
    }


def product_screen(suffix: str):
    """Up to 20 horizontal-ish media rows via CheckboxGroup media options."""
    return {
        'id': f'PRODUTOS_{suffix}',
        'title': 'Escolha os produtos',
        'data': {
            'query_title': {'type': 'string', '__example__': 'Bebidas'},
            'cart_total': {'type': 'string', '__example__': 'Total atual: R$ 420,00'},
            'result_note': {
                'type': 'string',
                '__example__': 'Selecione quantos quiser. As fotos são pequenas para a lista ficar rápida.'
            },
            'product_options': {
                'type': 'array',
                'items': product_option_schema,
                '__example__': [
                    {
                        'id': '00000000-0000-0000-0000-000000000000',
                        'title': 'Gatorade Tangerina 500ml',
                        'description': 'R$ 6,29 · Gatorade · 500ml',
                        'image': 'iVBORw0KGgoAAA...',
                        'alt-text': 'Gatorade Tangerina 500ml',
                        'enabled': True,
                    }
                ],
            },
        },
        'layout': {
            'type': 'SingleColumnLayout',
            'children': [
                {'type': 'TextHeading', 'text': '${data.query_title}'},
                {'type': 'TextSubheading', 'text': '${data.cart_total}'},
                {'type': 'TextCaption', 'text': '${data.result_note}'},
                {
                    'type': 'Form',
                    'name': f'products_form_{suffix.lower()}',
                    'children': [
                        {
                            'type': 'CheckboxGroup',
                            'name': 'selected_products',
                            'label': 'Selecione os produtos',
                            'description': 'Pode escolher vários de uma vez.',
                            'data-source': '${data.product_options}',
                            'required': False,
                            'min-selected-items': 0,
                            'max-selected-items': 20,
                            'media-size': 'regular',
                        },
                        {
                            'type': 'Footer',
                            'label': 'Continuar',
                            'on-click-action': {
                                'name': 'data_exchange',
                                'payload': {
                                    'trigger': 'premium_products_selected_v1',
                                    'selected_products': '${form.selected_products}',
                                },
                            },
                        },
                    ],
                },
            ],
        },
    }


def quantity_data():
    data = {
        'title': {'type': 'string', '__example__': 'Escolha as quantidades'},
        'message': {
            'type': 'string',
            '__example__': 'Já deixamos 1 unidade selecionada. Altere somente o que quiser.'
        },
        'init_values': {
            'type': 'object',
            'properties': {f'q{i:02d}': {'type': 'string'} for i in range(1, 21)},
            '__example__': {f'q{i:02d}': '1' for i in range(1, 21)},
        },
    }
    for i in range(1, 21):
        q = f'q{i:02d}'
        data[f'{q}_label'] = {'type': 'string', '__example__': f'Produto {i}'}
        data[f'{q}_visible'] = {'type': 'boolean', '__example__': i <= 3}
        data[f'{q}_options'] = {
            'type': 'array',
            'items': qty_option_schema,
            '__example__': [
                {'id': '0', 'title': '0 · Retirar'},
                {'id': '1', 'title': '1 unidade'},
                {'id': '2', 'title': '2 unidades'},
            ],
        }
    return data


def quantity_screen(suffix: str):
    children = [
        {'type': 'TextHeading', 'text': '${data.title}'},
        {'type': 'TextBody', 'text': '${data.message}'},
        {
            'type': 'Form',
            'name': f'quantity_form_{suffix.lower()}',
            'init-values': '${data.init_values}',
            'children': [],
        },
    ]
    form = children[-1]
    for i in range(1, 21):
        q = f'q{i:02d}'
        form['children'].append({
            'type': 'Dropdown',
            'name': q,
            'label': f'${{data.{q}_label}}',
            'data-source': f'${{data.{q}_options}}',
            'visible': f'${{data.{q}_visible}}',
            'required': False,
        })
    payload = {'trigger': 'premium_quantities_continue_v1'}
    for i in range(1, 21):
        q = f'q{i:02d}'
        payload[q] = f'${{form.{q}}}'
    form['children'].append({
        'type': 'Footer',
        'label': 'Adicionar ao pedido',
        'on-click-action': {'name': 'data_exchange', 'payload': payload},
    })
    return {
        'id': f'QUANTIDADES_{suffix}',
        'title': 'Quantidades',
        'data': quantity_data(),
        'layout': {'type': 'SingleColumnLayout', 'children': children},
    }

# Review: server sends the complete label to avoid unsupported mixed interpolation.
review = base['REVISAO']
review['title'] = 'Revise seu pedido'
review['data']['total_label'] = {'type': 'string', '__example__': 'Total do pedido: R$ 433,80'}
review['layout']['children'] = [
    {'type': 'TextHeading', 'text': 'Revise seu pedido'},
    {'type': 'TextCaption', 'text': 'Confira os itens antes de confirmar a entrega.'},
    {'type': 'TextBody', 'text': '${data.summary}'},
    {'type': 'TextSubheading', 'text': '${data.total_label}'},
    {'type': 'TextCaption', 'text': '${data.pricing_note}'},
    {
        'type': 'Footer',
        'label': 'Continuar para entrega',
        'on-click-action': {
            'name': 'data_exchange',
            'payload': {'trigger': 'review_confirm'},
        },
    },
]

# Known customer: avoid mixed interpolation and ask only payment/optional note.
known = base['CLIENTE_EXISTENTE']
known['title'] = 'Confirme a entrega'
known['layout']['children'] = [
    {'type': 'TextHeading', 'text': 'Confirme a entrega'},
    {'type': 'TextSubheading', 'text': '${data.customer_name}'},
    {'type': 'TextCaption', 'text': 'Endereço de entrega'},
    {'type': 'TextBody', 'text': '${data.address_summary}'},
    {'type': 'TextCaption', 'text': 'Se estiver correto, escolha apenas como deseja pagar na entrega.'},
    {
        'type': 'Form',
        'name': 'known_customer_form',
        'children': [
            {
                'type': 'Dropdown', 'label': 'Forma de pagamento', 'name': 'payment_method',
                'data-source': '${data.payment_options}', 'required': True,
            },
            {'type': 'TextArea', 'label': 'Observação (opcional)', 'name': 'notes', 'required': False},
            {
                'type': 'Footer', 'label': 'Confirmar pedido',
                'on-click-action': {
                    'name': 'data_exchange',
                    'payload': {
                        'trigger': 'checkout_confirm',
                        'payment_method': '${form.payment_method}',
                        'notes': '${form.notes}',
                    },
                },
            },
        ],
    },
]

# New/partial customer: use backend values as init-values to avoid retyping what is known.
new_customer = base['CLIENTE_NOVO']
new_customer['title'] = 'Entrega e pagamento'
for child in new_customer.get('layout', {}).get('children', []):
    if child.get('type') == 'Form' and child.get('name') == 'new_customer_form':
        child['init-values'] = {
            'name': '${data.name_value}',
            'street': '${data.street_value}',
            'number': '${data.number_value}',
            'complement': '${data.complement_value}',
            'neighborhood': '${data.neighborhood_value}',
            'city': '${data.city_value}',
            'locator': '${data.locator_value}',
        }

# Success screen: all labels are server-built and can only be reached after server confirmation.
final = base['FINALIZAR']
final['title'] = 'Pedido confirmado'
final['data']['order_number'] = {'type': 'string', '__example__': 'Pedido #12345'}
final['data']['final_total_label'] = {'type': 'string', '__example__': 'Total: R$ 433,80'}
final['data']['payment_label'] = {'type': 'string', '__example__': 'Pagamento na entrega'}
final['layout']['children'] = [
    {'type': 'TextHeading', 'text': '${data.confirmation}'},
    {'type': 'TextSubheading', 'text': '${data.order_number}'},
    {'type': 'TextBody', 'text': '${data.final_summary}'},
    {'type': 'TextSubheading', 'text': '${data.final_total_label}'},
    {'type': 'TextCaption', 'text': '${data.payment_label}'},
    {'type': 'TextBody', 'text': '${data.next_step}'},
    {
        'type': 'Footer',
        'label': 'Voltar ao WhatsApp',
        'on-click-action': {'name': 'complete', 'payload': {'action': 'completed'}},
    },
]

failure = {
    'id': 'FALHA_FINALIZACAO',
    'title': 'Precisamos concluir no WhatsApp',
    'terminal': True,
    'success': False,
    'data': {
        'message': {
            'type': 'string',
            '__example__': 'Não conseguimos confirmar o pedido com segurança. Volte ao WhatsApp para concluirmos com você.'
        }
    },
    'layout': {
        'type': 'SingleColumnLayout',
        'children': [
            {'type': 'TextHeading', 'text': 'Pedido ainda não confirmado'},
            {'type': 'TextBody', 'text': '${data.message}'},
            {
                'type': 'Footer',
                'label': 'Voltar ao WhatsApp',
                'on-click-action': {'name': 'complete', 'payload': {'action': 'needs_help'}},
            },
        ],
    },
}

screens = [
    cestas,
    personal,
    section_screen('A'),
    product_screen('A'),
    quantity_screen('A'),
    section_screen('B'),
    product_screen('B'),
    quantity_screen('B'),
    section_screen('C'),
    product_screen('C'),
    quantity_screen('C'),
    review,
    known,
    new_customer,
    final,
    failure,
]
flow['screens'] = screens
flow['routing_model'] = {
    'CESTAS': ['PERSONALIZAR_A'],
    'PERSONALIZAR_A': ['SECOES_A'],
    'SECOES_A': ['PRODUTOS_A', 'REVISAO'],
    'PRODUTOS_A': ['QUANTIDADES_A', 'SECOES_B'],
    'QUANTIDADES_A': ['SECOES_B'],
    'SECOES_B': ['PRODUTOS_B', 'REVISAO'],
    'PRODUTOS_B': ['QUANTIDADES_B', 'SECOES_C'],
    'QUANTIDADES_B': ['SECOES_C'],
    'SECOES_C': ['PRODUTOS_C', 'REVISAO'],
    'PRODUTOS_C': ['QUANTIDADES_C', 'REVISAO'],
    'QUANTIDADES_C': ['REVISAO'],
    'REVISAO': ['CLIENTE_EXISTENTE', 'CLIENTE_NOVO'],
    'CLIENTE_EXISTENTE': ['FINALIZAR', 'FALHA_FINALIZACAO'],
    'CLIENTE_NOVO': ['FINALIZAR', 'FALHA_FINALIZACAO'],
    'FINALIZAR': [],
    'FALHA_FINALIZACAO': [],
}

# Static quality gates.
assert flow['version'] == '7.3'
assert flow['data_api_version'] == '3.0'
assert len(flow['screens']) == 16
assert next(s for s in screens if s['id'] == 'REVISAO')['layout']['children'][3]['text'] == '${data.total_label}'
for suffix in 'ABC':
    sec = next(s for s in screens if s['id'] == f'SECOES_{suffix}')
    assert any(c.get('type') == 'Form' for c in sec['layout']['children'])
    prod = next(s for s in screens if s['id'] == f'PRODUTOS_{suffix}')
    group = next(c for c in prod['layout']['children'][-1]['children'] if c.get('type') == 'CheckboxGroup')
    assert group['max-selected-items'] == 20
    assert group['media-size'] == 'regular'
    qty = next(s for s in screens if s['id'] == f'QUANTIDADES_{suffix}')
    qform = next(c for c in qty['layout']['children'] if c.get('type') == 'Form')
    assert sum(c.get('type') == 'Dropdown' for c in qform['children']) == 20
    assert len(qform['children']) <= 21

assert not any('Total: ${data.' in json.dumps(s, ensure_ascii=False) for s in screens)
allowed = {'version', 'data_api_version', 'routing_model', 'screens'}
assert set(flow).issubset(allowed), set(flow) - allowed

dst.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(dst)
print('screens', len(flow['screens']))
print('V27: premium low-friction UX, <=20 media products/page, multi-select then quantities')
