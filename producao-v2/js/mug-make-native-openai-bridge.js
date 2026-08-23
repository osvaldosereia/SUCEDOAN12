import './mug-studio-gallery.js?admin_build=20260822-mug-v6-gallery';
import './mug-personalizer-v6.js?admin_build=20260822-canecas-personalizador-v6';

const BUILD = '20260822-canecas-personalizador-v6-loader';

function install() {
  window.__daMugPersonalizerV6Loader = BUILD;
}

install();

export { install };
