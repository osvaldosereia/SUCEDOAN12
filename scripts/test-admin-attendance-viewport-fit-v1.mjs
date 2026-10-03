import fs from 'node:fs';

const css = fs.readFileSync('vitrine/admin/atendimento/attendance.css', 'utf8');

function must(pattern, message) {
  if (!pattern.test(css)) throw new Error(message);
}
function mustNot(pattern, message) {
  if (pattern.test(css)) throw new Error(message);
}

mustNot(/\.attendance-workspace\{[^}]*min-height:650px/, 'workspace ainda força min-height:650px no desktop');
must(/\.attendance-shell\{[^}]*height:100dvh[^}]*min-height:0[^}]*overflow:hidden/, 'shell deve ficar limitado à viewport dinâmica');
must(/\.attendance-page\{[^}]*height:100%[^}]*min-height:0[^}]*overflow:hidden[^}]*display:flex[^}]*flex-direction:column/, 'página deve usar layout vertical contido');
must(/\.page-topbar\{[^}]*flex:0 0 58px/, 'topbar deve ter altura fixa dentro do flex');
must(/\.attendance-workspace\{[^}]*height:auto[^}]*min-height:0[^}]*flex:1 1 auto/, 'workspace deve ocupar somente o espaço restante');
must(/\.conversation-pane\{[^}]*min-height:0[^}]*overflow:hidden/, 'conversa deve permanecer confinada');
must(/\.messages\{[^}]*flex:1[^}]*min-height:0[^}]*overflow:auto/, 'histórico deve ser a área rolável');
must(/\.composer\{[^}]*flex:0 0 auto/, 'composer deve permanecer visível no rodapé');

console.log('attendance viewport-fit contract OK');
