(() => {
  'use strict';

  const MODOS = [
    {nome:'Aquarela delicada',style:'Ilustração delicada em aquarela',mood:'Acolhedor e inspirador',amount:'medio',extra:'Usar aquarela suave, contornos limpos, fundo branco puro e composição central com bastante respiro.'},
    {nome:'Lettering temático',style:'Lettering artesanal com flores',mood:'Acolhedor e inspirador',amount:'medio',extra:'Dar protagonismo à frase e integrar os elementos ao lettering sem prejudicar a leitura.'},
    {nome:'Minimalista elegante',style:'Minimalista elegante',mood:'Elegante e sereno',amount:'pouco',extra:'Usar poucos elementos, linhas finas, grande área branca e aparência sofisticada.'},
    {nome:'Editorial suave',style:'Ilustração editorial suave',mood:'Acolhedor e inspirador',amount:'medio',extra:'Criar ilustração editorial moderna, equilibrada e original, sem aparência fotográfica.'},
    {nome:'Vintage delicado',style:'Vintage delicado',mood:'Elegante e sereno',amount:'medio',extra:'Usar linguagem de gravura ou ilustração clássica sem envelhecer o fundo branco.'},
    {nome:'Desenho manual moderno',style:'Desenho manual moderno',mood:'Divertido e espontâneo',amount:'medio',extra:'Usar traços manuais modernos, espontâneos e bem definidos.'},
    {nome:'Emblema temático',style:'Tipografia expressiva',mood:'Forte e encorajador',amount:'medio',extra:'Organizar frase e elementos em formato de selo ou emblema central, sem encostar nas bordas.'},
    {nome:'Moldura ilustrada',style:'Colagem botânica',mood:'Delicado e feminino',amount:'muito',extra:'Criar moldura temática ao redor da frase, deixando o centro aberto e legível.'},
    {nome:'Composição premium',style:'Ilustração editorial suave',mood:'Elegante e sereno',amount:'medio',extra:'Criar aparência premium e presenteável, com hierarquia visual clara e acabamento limpo.'},
    {nome:'Ícone e frase',style:'Minimalista elegante',mood:'Alegre e otimista',amount:'pouco',extra:'Usar um ícone principal marcante acompanhado da frase, com contraste claro e grande respiro.'}
  ];

  const TEMAS = {
    'Fé católica':{p:['Azul-claro, creme e dourado','Lilás, rosa e verde','Terracota, bege e verde'],o:'Manter linguagem reverente e símbolos católicos reconhecíveis e delicados, sem misturar elementos de outras religiões.',e:['Nossa Senhora com flores brancas e luz suave','terço com rosas e pequenos brilhos dourados','Sagrado Coração de Jesus com raios delicados','hóstia, cálice e espigas de trigo','igreja católica com vitral e luz','cruz católica com ramo de oliveira','anjos delicados e estrelas','Bíblia, terço e vela acesa','medalha devocional com flores','manto azul, lírios e coroa delicada']},
    'Fé cristã':{p:['Azul-claro, creme e dourado','Terracota, bege e verde','Rosa, verde sálvia e marrom'],o:'Transmitir confiança em Deus, esperança e paz com símbolos cristãos simples e leitura muito clara.',e:['Bíblia aberta com luz suave','cruz com ramo de oliveira','céu, nuvens e raios de esperança','mãos em oração e pequenas estrelas','cordeiro e luz dourada','pomba branca com ramo','caminho iluminado e montanhas','coração com cruz delicada','flores do campo e pequenos símbolos de fé','farol, ondas suaves e luz divina']},
    'Santos':{p:['Azul-claro, creme e dourado','Terracota, bege e verde','Colorida em tons pastel'],o:'Representar o santo escolhido de forma respeitosa, devocional e original, usando símbolos ligados à sua história sem caricatura.',e:['retrato devocional do santo escolhido com auréola suave','santo escolhido com flores simbólicas','vitral inspirado no santo escolhido','medalha do santo com fita e flores','símbolos associados ao santo escolhido','santo em oração com luz suave','igreja e imagem do santo em nicho delicado','livro, lírios e atributos do santo','manto, auréola e elementos da missão do santo','silhueta reverente do santo com nome legível']},
    'Flores':{p:['Colorida em tons pastel','Rosa, verde sálvia e marrom','Lilás, rosa e verde'],o:'O tema deve ser claramente floral, com espécies reconhecíveis, composição leve e fundo branco puro.',e:['flores do campo e folhas finas','rosas em aquarela e folhas de eucalipto','margaridas e pequenas borboletas','girassóis e folhagens leves','lavanda e ramos delicados','peônias e folhas suaves','orquídeas e linhas orgânicas','tulipas em composição elegante','flores tropicais e costela-de-adão','guirlanda botânica com flores variadas']},
    'Pássaros':{p:['Colorida em tons pastel','Azul-claro, creme e dourado','Terracota, bege e verde'],o:'Criar aves delicadas e reconhecíveis, com movimento natural, sem cenário pesado e sem aparência fotográfica.',e:['dois passarinhos em um galho florido','beija-flor com flores tropicais','canário entre folhas e pequenas flores','andorinhas em voo com linhas suaves','coruja delicada com estrelas','pássaros vintage em ramos','tucano com folhagens tropicais','bem-te-vi em galho fino','casal de pássaros com coração discreto','penas, pequenos pássaros e céu suave']},
    'Gatos':{p:['Colorida em tons pastel','Terracota, bege e verde','Rosa, verde sálvia e marrom'],o:'O gato deve ser o elemento principal, com expressão simpática e desenho original, sem copiar personagens conhecidos.',e:['gatinho fofo com corações e estrelas','gato com xícara de café e flores','gato sentado entre flores e folhas','silhueta de gato em linha contínua','gato dormindo sobre livros','gato olhando a lua e estrelas','gato brincando com novelo de lã','gato com óculos e expressão divertida','gato preto elegante com flores claras','dupla de gatos com rabos formando coração']},
    'Cachorros':{p:['Colorida em tons pastel','Amarelo suave, coral e verde','Terracota, bege e verde'],o:'O cachorro deve ser o elemento principal, carinhoso e original; permitir raça genérica ou a raça informada pelo usuário.',e:['cachorrinho alegre com patinhas e corações','cachorro entre flores e folhas','cachorro com ossinho e bandana','contorno de cachorro e coração','cachorro dormindo em almofada','cachorro com bolinha e estrelas','cachorro com óculos e humor leve','cachorro e xícara de café','dois cachorros amigos com patinhas','focinho, orelhas e nome do pet em destaque']},
    'Amor':{p:['Rosa, verde sálvia e marrom','Terracota, bege e verde','Preto, branco e um tom de destaque'],o:'Transmitir afeto, cuidado e conexão de forma adulta, bonita e presenteável, evitando excesso de clichês.',e:['coração em linha contínua e flores','mãos entrelaçadas com pequenos corações','casal em abraço com luz suave','flores, fitas e corações delicados','dois corações conectados por linha fina','carta de amor com flores','pássaros formando casal em galho','constelação em formato de coração','cadeado e chave delicados','palavra amor integrada a ramos botânicos']},
    'Namorados':{p:['Rosa, verde sálvia e marrom','Azul-claro, creme e dourado','Terracota, bege e verde'],o:'Criar clima romântico de casal, íntimo e carinhoso, com possibilidade de iniciais ou data quando informadas.',e:['casal apaixonado com flores e corações','iniciais do casal com coração fino','dois personagens simples de mãos dadas','alianças e ramo botânico','linha do tempo romântica com pequenas memórias','casal sob céu estrelado','café para dois e pequenos corações','duas metades de coração que se completam','bicicleta para dois com flores','data especial, iniciais e moldura delicada']},
    'Professor':{p:['Colorida em tons pastel','Amarelo suave, coral e verde','Azul-claro, creme e dourado'],o:'Valorizar conhecimento, dedicação e gratidão ao professor, com materiais escolares organizados e leitura clara.',e:['livros, lápis, flores e estrelas','quadro, livros e pequenos rabiscos','livro aberto com luz de conhecimento','maçã, caderno e flores em aquarela','lápis formando coração','óculos, livros e xícara de café','régua, esquadro e tipografia divertida','pilha de livros com frase inspiradora','mãos ensinando e pequenas estrelas','nome do professor em emblema escolar']},
    'Mãe':{p:['Rosa, verde sálvia e marrom','Lilás, rosa e verde','Colorida em tons pastel'],o:'Transmitir carinho, gratidão, força e acolhimento materno sem infantilizar a composição.',e:['flores delicadas, coração e laço','mãe e filha em abraço com flores','mãe e filho em linha contínua','café, corações e rotina de mãe','mãos de mãe segurando mãos pequenas','coração com palavra mãe e ramos','silhueta de mãe com filhos','coroa delicada e flores','casa, coração e abraço materno','nome da mãe em moldura floral']},
    'Esposa':{p:['Rosa, verde sálvia e marrom','Terracota, bege e verde','Azul-claro, creme e dourado'],o:'Transmitir parceria, amor maduro, amizade e admiração pela esposa, com elegância e afeto.',e:['rosas, coração e aliança delicada','casal caminhando com flores e luz suave','corações, café e símbolos de casal','alianças, coração fino e ramo botânico','silhueta de casal em abraço','carta de amor com nome da esposa','flores e palavra esposa em lettering','duas xícaras e pequenos corações','casa, parceria e luz acolhedora','iniciais do casal em composição premium']},
    'Avó':{p:['Lilás, rosa e verde','Terracota, bege e verde','Colorida em tons pastel'],o:'Transmitir aconchego, memória, sabedoria e carinho de avó, com aparência afetiva e presenteável.',e:['xícara de chá, flores vintage e renda ilustrada','flores delicadas, coração e tricô','óculos, café, bolo e corações','coração, flor e palavra vó','cadeira de balanço e manta','receita de família com flores','mãos de avó e neta','casa da vó com jardim delicado','novelo de lã, agulhas e flores','nome da avó em moldura vintage']},
    'Avô':{p:['Terracota, bege e verde','Azul-claro, creme e dourado','Preto, branco e um tom de destaque'],o:'Valorizar sabedoria, histórias, presença e carinho do avô com visual respeitoso e afetivo.',e:['chapéu, relógio, café e ramos','avô e netos em abraço','óculos, ferramentas e corações','bigode estilizado, coração e ramo','poltrona, livro e café','caixa de ferramentas e frase carinhosa','pesca, lago e pôr do sol suave','rádio antigo e memória afetiva','mãos do avô e do neto','nome do avô em emblema clássico']},
    'Café':{p:['Terracota, bege e verde','Amarelo suave, coral e verde','Preto, branco e um tom de destaque'],o:'O café deve ser o centro do conceito: aconchego, aroma, pausa, energia ou humor. Não usar símbolos religiosos, salvo quando a frase pedir explicitamente.',e:['xícara de café com vapor e grãos','cafeteira italiana, xícara e ramos','café com flores delicadas','duas xícaras e conversa','grãos de café formando coração','caneca de café com frase divertida','café da manhã com pão e pequenos detalhes','coador de pano e café afetivo','xícara vista de cima com latte art','saco de café, folhas e grãos']},
    'Motivacional':{p:['Colorida em tons pastel','Amarelo suave, coral e verde','Preto, branco e um tom de destaque'],o:'Transmitir coragem, movimento, conquista e constância com frase muito legível e energia positiva.',e:['sol, estrelas e linhas ascendentes','montanha e caminho em direção ao topo','setas suaves e pequenos brilhos','flores crescendo entre pedras','degraus e luz no horizonte','asas delicadas e estrelas','bússola e caminho','fênix abstrata e luz','coração forte com raios','palavra principal em lettering de impacto']},
    'Otimismo':{p:['Colorida em tons pastel','Amarelo suave, coral e verde','Azul-claro, creme e dourado'],o:'Criar sensação clara de alegria, esperança e leveza, sem excesso de informação.',e:['arco-íris suave, sol e flores','céu azul com pequenas nuvens','sol sorridente e estrelas','flores coloridas e borboletas','janela aberta para um dia claro','balões e pequenos brilhos','passarinhos e manhã ensolarada','caminho florido e luz','coração alegre e confetes','frase em lettering colorido e leve']},
    'Humor leve':{p:['Amarelo suave, coral e verde','Colorida em tons pastel','Terracota, bege e verde'],o:'Usar humor cotidiano simpático, sem ofensa, com ilustrações simples e leitura rápida.',e:['xícara de café com expressão divertida','bateria fraca e almofada','preguiça ilustrada com nuvem e sofá','agenda, café e pequenos rabiscos','carinha cansada e estrelas','gato dormindo com frase engraçada','despertador e café','modo avião com nuvens','lanchinho, café e coração','tipografia divertida com ícones cotidianos']},
    'Autocuidado':{p:['Rosa, verde sálvia e marrom','Lilás, rosa e verde','Azul-claro, creme e dourado'],o:'Transmitir pausa, acolhimento, limites saudáveis e carinho consigo, com visual sereno.',e:['folhagens suaves, coração e linhas orgânicas','mãos segurando uma flor','banho de sol e xícara de chá','vela, livro e manta','rosto feminino em linha contínua e flores','lua, estrelas e descanso','coração protegido por folhas','respiração representada por ondas suaves','espelho com mensagem positiva','florescendo de dentro para fora']},
    'Família':{p:['Terracota, bege e verde','Colorida em tons pastel','Azul-claro, creme e dourado'],o:'Transmitir união, lar, memória e acolhimento familiar de forma inclusiva e calorosa.',e:['casa, coração e ramos acolhedores','família em abraço com luz suave','mãos de diferentes gerações','árvore genealógica delicada','mesa de família e pequenos corações','lar com flores na janela','silhuetas familiares em linha contínua','porta-retrato ilustrado e flores','chaves de casa e coração','nome da família em emblema afetivo']},
    'Amizade':{p:['Colorida em tons pastel','Rosa, verde sálvia e marrom','Amarelo suave, coral e verde'],o:'Transmitir companheirismo, confiança, risadas e apoio mútuo com clima leve e presenteável.',e:['duas xícaras, flores e pequenos corações','duas amigas rindo em ilustração suave','pulseiras da amizade e estrelas','mãos unidas com flores','telefone, café e conversa longa','duas cadeiras e pôr do sol','frase em lettering com corações','duas flores diferentes no mesmo vaso','mapa e linha conectando amigas','iniciais das amigas em moldura delicada']},
    'Profissional':{p:['Preto, branco e um tom de destaque','Azul-claro, creme e dourado','Terracota, bege e verde'],o:'Transmitir competência, foco, organização e propósito com aparência moderna e profissional.',e:['linhas geométricas, estrelas e detalhes minimalistas','checklist, alvo e seta','notebook, café e agenda','gráfico ascendente e pequenos brilhos','bússola e meta','engrenagens delicadas e lâmpada','pasta, caneta e tipografia forte','degraus e troféu minimalista','relógio, foco e organização','iniciais profissionais em emblema elegante']},
    'Gratidão':{p:['Rosa, verde sálvia e marrom','Terracota, bege e verde','Azul-claro, creme e dourado'],o:'Criar sensação de reconhecimento, paz e beleza nos pequenos detalhes, com composição delicada.',e:['ramos botânicos, flores e pequenos brilhos','mãos segurando um coração','sol nascendo entre flores','caderno de gratidão e folhas','pássaros e manhã serena','coração com palavra obrigada','flores crescendo em círculo','pequenas estrelas ao redor da frase','janela com luz suave','guirlanda de folhas e gratidão']},
    'Aniversário':{p:['Colorida em tons pastel','Lilás, rosa e verde','Azul-claro, creme e dourado'],o:'Criar clima de celebração, novo ciclo e alegria, elegante o suficiente para presente.',e:['flores, confetes e pequenas estrelas','bolo delicado com velas','balões e fitas coloridas','número da idade em composição elegante','taça festiva sem álcool, estrelas e flores','presente com laço e confetes','sol, novo ciclo e flores','coroa delicada e brilhos','calendário da data com flores','nome da pessoa em emblema de aniversário']},
    'Empoderamento feminino':{p:['Rosa, verde sálvia e marrom','Preto, branco e um tom de destaque','Lilás, rosa e verde'],o:'Transmitir força, autonomia, coragem e apoio entre mulheres sem perder delicadeza e legibilidade.',e:['flores fortes, estrelas e linhas de movimento','rosto feminino em linha contínua','punho delicado com flores','coroa, coração e raios','mulher caminhando em direção à luz','silhuetas de mulheres unidas','asas e frase de força','leoa estilizada e flores','palavra principal em lettering poderoso','espelho com mensagem de confiança']}
  };

  function $(selector,parent=document){return parent.querySelector(selector)}
  function ensureOption(select,value){if(!select||!value)return;if(![...select.options].some(option=>option.value===value))select.add(new Option(value,value))}
  function setValue(element,value){if(!element)return;if(element.tagName==='SELECT')ensureOption(element,value);element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}))}
  function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
  function findProfile(theme){const key=Object.keys(TEMAS).find(name=>normalize(name)===normalize(theme));return key?{tema:key,...TEMAS[key]}:null}

  function aiGroup(profile){
    return {
      nome:'✨ IA criar livremente',
      style:'A IA escolhe o estilo mais adequado',
      palette:'A IA escolhe a paleta mais adequada',
      mood:'A IA escolhe o clima mais adequado',
      amount:'medio',
      element:`A IA escolhe elementos totalmente coerentes com o tema ${profile.tema}`,
      extra:`Crie uma composição original e surpreendente para o tema ${profile.tema}. ${profile.o} A IA pode decidir estilo, paleta, organização e elementos, mantendo fundo branco, alta resolução e ótima leitura.`
    };
  }

  function buildGroups(profile){
    const groups=[aiGroup(profile)];
    MODOS.forEach((modo,index)=>{
      const element=profile.e[index];
      groups.push({
        nome:`${index+1}. ${modo.nome}`,
        style:modo.style,
        palette:profile.p[index%profile.p.length],
        mood:modo.mood,
        amount:modo.amount,
        element,
        extra:`${modo.extra} ${profile.o} Elemento principal obrigatório: ${element}.`
      });
    });
    return groups;
  }

  function hideAudience(slot){const field=$(`#a${slot}Audience`)?.closest('label.field');if(field){field.hidden=true;field.style.display='none'}}
  function applyPreset(slot,preset){
    setValue($(`#a${slot}Style`),preset.style);
    setValue($(`#a${slot}Palette`),preset.palette);
    setValue($(`#a${slot}Mood`),preset.mood);
    setValue($(`#a${slot}Amount`),preset.amount);
    setValue($(`#a${slot}Element`),preset.element);
    setValue($(`#a${slot}Extra`),preset.extra);
  }

  function configureSlot(slot){
    const theme=$(`#a${slot}Theme`);if(!theme)return false;
    Object.keys(TEMAS).forEach(name=>ensureOption(theme,name));
    hideAudience(slot);
    let field=$(`#a${slot}ThemeGroup`)?.closest('label.field');
    if(!field){
      const themeField=theme.closest('label.field');
      field=document.createElement('label');
      field.className='field theme-group-field';
      field.innerHTML=`Configuração do tema<select id="a${slot}ThemeGroup"></select><span class="help">A primeira opção deixa a IA criar livremente. As outras 10 foram feitas especialmente para o tema escolhido.</span>`;
      themeField.insertAdjacentElement('afterend',field);
    }
    const group=$(`#a${slot}ThemeGroup`);
    if(group.dataset.bound!=='1'){
      group.dataset.bound='1';
      group.addEventListener('change',()=>{
        const profile=findProfile(theme.value)||{tema:theme.value,p:['Colorida em tons pastel'],o:`Manter todos os elementos coerentes com o tema ${theme.value}.`,e:Array.from({length:10},(_,i)=>`${theme.value}: composição temática ${i+1}`)};
        applyPreset(slot,buildGroups(profile)[Number(group.value)]||buildGroups(profile)[0]);
      });
      theme.addEventListener('change',()=>refreshGroups(slot,true));
    }
    if(!theme.dataset.v8Initialized){
      theme.dataset.v8Initialized='1';
      refreshGroups(slot,true);
    }
    return true;
  }

  function refreshGroups(slot,applyFirst){
    const theme=$(`#a${slot}Theme`),group=$(`#a${slot}ThemeGroup`);if(!theme||!group)return;
    const profile=findProfile(theme.value)||{tema:theme.value,p:['Colorida em tons pastel'],o:`Manter todos os elementos coerentes com o tema ${theme.value}.`,e:Array.from({length:10},(_,i)=>`${theme.value}: composição temática ${i+1}`)};
    const groups=buildGroups(profile);
    group.innerHTML=groups.map((item,index)=>`<option value="${index}">${item.nome}</option>`).join('');
    group.value='0';
    if(applyFirst)applyPreset(slot,groups[0]);
  }

  const observer=new MutationObserver(()=>{configureSlot(1);configureSlot(2)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const timer=setInterval(()=>{configureSlot(1);configureSlot(2)},600);
  setTimeout(()=>clearInterval(timer),120000);
})();
