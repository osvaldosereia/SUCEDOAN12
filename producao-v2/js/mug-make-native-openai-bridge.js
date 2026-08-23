import './mug-studio-gallery.js?admin_build=20260823-mug-v7-gallery';
import './mug-personalizer-v7.js?admin_build=20260823-canecas-studio-v7-2';
import './mug-command-library-v1.js?admin_build=20260823-canecas-command-library-v1';
import './mug-command-library-compact-v2.js?admin_build=20260823-canecas-command-compact-v2';
import './mug-command-layout-v3.js?admin_build=20260823-canecas-command-layout-v3-80pct-3cols';

const BUILD = '20260823-canecas-studio-v7-2-command-library-v3';

function install() {
  window.__daMugStudioV7Loader = BUILD;
}

install();

export { install };
