import assert from 'node:assert/strict';
import fs from 'node:fs';

const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');
const css=fs.readFileSync('vitrine/admin/marketing/marketing-polish.css','utf8');

assert.match(polish,/PRIMARY_MARKETING_VIEWS=\['templates','campaigns','audiences','consents'\]/,'shell responsivo deve usar somente as quatro áreas operacionais');
assert.doesNotMatch(polish,/OVERVIEW_CARDS/,'overview antigo não deve continuar no runtime');
assert.doesNotMatch(polish,/ensureOverviewDashboard/,'dashboard antigo não deve continuar no runtime');
assert.doesNotMatch(polish,/loadOverviewRecentCampaigns/,'carregamento da visão geral antiga deve ser removido');
assert.match(polish,/ensureMarketingNav/,'Marketing deve garantir uma única navegação canônica');
assert.match(polish,/openMarketingView/,'abas devem compartilhar um roteador simples');
assert.match(polish,/maybeOpenDefaultTemplates/,'entrada do Marketing deve abrir Templates sem tela intermediária');

assert.match(css,/\.marketing-pro-shell \.marketing-template-subnav\{[^}]*display:flex/,'barra de navegação deve permanecer horizontal no desktop');
assert.match(css,/\.marketing-pro-shell \.marketing-template-subnav\{[^}]*overflow:auto/,'barra deve permitir rolagem quando faltar largura');
assert.match(css,/@media\(max-width:760px\)/,'layout deve ter breakpoint mobile');
assert.match(css,/@media\(max-width:760px\)[\s\S]*\.marketing-pro-shell \.marketing-template-subnav/,'navegação deve ter tratamento mobile');
assert.match(css,/@media\(max-width:760px\)[\s\S]*\.marketing-pro-shell \.marketing-template-head-actions button\{flex:1\}/,'ações de template devem ocupar espaço útil no mobile');

console.log('marketing simple four-tab responsive contract: ok');
