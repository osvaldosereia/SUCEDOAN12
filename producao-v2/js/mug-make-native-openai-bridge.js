import './mug-studio-gallery.js?admin_build=20260823-mug-v7-gallery';
import './mug-personalizer-v7.js?admin_build=20260823-canecas-studio-v7';

const BUILD = '20260823-canecas-studio-v7-loader';

function install() {
  window.__daMugStudioV7Loader = BUILD;
}

install();

export { install };
