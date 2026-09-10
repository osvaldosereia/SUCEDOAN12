import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v6.json'
DST = ROOT / 'whatsapp' / 'flows' / 'flow-cestas-comercial-v31-stable-text-products.json'

flow = json.loads(SRC.read_text(encoding='utf-8'))


def strip_media_schema(node):
    if isinstance(node, dict):
        props = node.get('properties')
        if isinstance(props, dict):
            for key in ('image', 'image_url', 'src', 'alt-text'):
                props.pop(key, None)
        for key in ('__example__', 'example'):
            value = node.get(key)
            if isinstance(value, list):
                cleaned = []
                for item in value:
                    if isinstance(item, dict):
                        item = deepcopy(item)
                        for media_key in ('image', 'image_url', 'src', 'alt-text'):
                            item.pop(media_key, None)
                        start = item.get('start')
                        if isinstance(start, dict):
                            start = deepcopy(start)
                            for media_key in ('image', 'image_url', 'src'):
                                start.pop(media_key, None)
                            if start:
                                item['start'] = start
                            else:
                                item.pop('start', None)
                    cleaned.append(item)
                node[key] = cleaned
        for value in list(node.values()):
            strip_media_schema(value)
    elif isinstance(node, list):
        for value in node:
            strip_media_schema(value)


def strip_product_list_component_media(component):
    if not isinstance(component, dict):
        return
    ctype = component.get('type')
    if ctype in ('RadioButtonsGroup', 'CheckboxGroup'):
        component.pop('media-size', None)
    if ctype == 'NavigationList':
        raise AssertionError('NavigationList is forbidden in stable text-only product lists')
    for child_key in ('children',):
        children = component.get(child_key)
        if isinstance(children, list):
            for child in children:
                strip_product_list_component_media(child)


product_screens = 0
for screen in flow.get('screens', []):
    sid = str(screen.get('id', ''))
    if sid.startswith('PRODUTOS_'):
        product_screens += 1
        strip_media_schema(screen.get('data', {}))
        layout = screen.get('layout', {})
        for child in layout.get('children', []):
            strip_product_list_component_media(child)

        # Hard guard: product-list screens must not contain standalone Images.
        def assert_no_images(node):
            if isinstance(node, dict):
                assert node.get('type') != 'Image', f'{sid}: standalone Image forbidden'
                assert node.get('type') != 'NavigationList', f'{sid}: NavigationList forbidden'
                for value in node.values():
                    assert_no_images(value)
            elif isinstance(node, list):
                for value in node:
                    assert_no_images(value)
        assert_no_images(layout)

# Preserve basket media: this is intentionally only a product-list simplification.
cestas = next(s for s in flow['screens'] if s['id'] == 'CESTAS')
baskets = cestas.get('data', {}).get('baskets', {})
props = baskets.get('items', {}).get('properties', {})
assert 'image' in props, 'CESTAS media must remain enabled'

# Stable-base guardrails.
assert flow.get('version') == '7.3'
assert flow.get('data_api_version') == '3.0'
ids = [s['id'] for s in flow['screens']]
assert len(ids) == len(set(ids)), 'duplicate screen id'
assert product_screens >= 3, 'expected product-list screens'
for src, targets in flow.get('routing_model', {}).items():
    assert src in ids, f'missing route source {src}'
    for target in targets:
        assert target in ids, f'missing route target {target}'

flow.setdefault('_diagnostic', {})
flow['_diagnostic'] = {
    'base': 'flow-cestas-comercial-v6.json',
    'purpose': 'stable-base text-only product lists',
    'product_list_media': False,
    'basket_media': True,
    'navigation_list_in_product_screens': False,
}

DST.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'wrote {DST} with {len(flow["screens"])} screens; product_screens={product_screens}')
