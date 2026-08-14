"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Theme = "floral" | "faith" | "pet" | "music" | "love" | "teacher" | "family" | "fun";

type Creation = {
  id: number;
  title: string;
  creator: string;
  initials: string;
  category: string;
  theme: Theme;
  artTitle: string;
  artCaption: string;
  rating: number;
  reviews: number;
  favorites: number;
  badge?: string;
};

type Template = {
  id: Theme;
  title: string;
  hint: string;
  category: string;
  artTitle: string;
  artCaption: string;
};

const categories = ["Todos", "Fé", "Família", "Pets", "Música", "Amor", "Profissões", "Divertidas"];

const templates: Template[] = [
  { id: "floral", title: "Floral delicado", hint: "Nome em destaque e flores suaves", category: "Amor", artTitle: "Seu nome", artCaption: "floresce por onde passa" },
  { id: "faith", title: "Fé que acolhe", hint: "Composição leve e mensagem de fé", category: "Fé", artTitle: "Eis-me aqui", artCaption: "Senhor" },
  { id: "pet", title: "Meu melhor amigo", hint: "Foto do pet com nome decorado", category: "Pets", artTitle: "Amor de patas", artCaption: "sempre comigo" },
  { id: "music", title: "Nossa canção", hint: "Ritmo, memória e frase autoral", category: "Música", artTitle: "A vida tem som", artCaption: "e o meu é brasileiro" },
  { id: "love", title: "Nós dois", hint: "Foto especial e data marcante", category: "Amor", artTitle: "Nosso lugar", artCaption: "é onde estamos juntos" },
  { id: "teacher", title: "Quem ensina inspira", hint: "Presente elegante para professores", category: "Profissões", artTitle: "Professora Ana", artCaption: "ensinar é deixar marcas" },
];

const creations: Creation[] = [
  { id: 1, title: "Jardim da Helena", creator: "Marina Alves", initials: "MA", category: "Amor", theme: "floral", artTitle: "Helena", artCaption: "floresce por onde passa", rating: 4.9, reviews: 38, favorites: 126, badge: "Arte da semana" },
  { id: 2, title: "Eis-me aqui", creator: "Paula Mendes", initials: "PM", category: "Fé", theme: "faith", artTitle: "Eis-me aqui", artCaption: "Senhor", rating: 4.8, reviews: 27, favorites: 94 },
  { id: 3, title: "Nina, meu amor", creator: "Camila Rocha", initials: "CR", category: "Pets", theme: "pet", artTitle: "Nina", artCaption: "amor que deixa patinhas", rating: 5, reviews: 21, favorites: 88, badge: "Favorita" },
  { id: 4, title: "Som de casa", creator: "João Pedro", initials: "JP", category: "Música", theme: "music", artTitle: "Meu coração", artCaption: "tem ritmo brasileiro", rating: 4.7, reviews: 19, favorites: 71 },
  { id: 5, title: "Nossa história", creator: "Bianca Lima", initials: "BL", category: "Amor", theme: "love", artTitle: "Bia & Lucas", artCaption: "desde 2018", rating: 4.9, reviews: 31, favorites: 115 },
  { id: 6, title: "Professora que inspira", creator: "Renata Souza", initials: "RS", category: "Profissões", theme: "teacher", artTitle: "Profª Márcia", artCaption: "ensinar transforma", rating: 4.8, reviews: 24, favorites: 82 },
  { id: 7, title: "Família é abraço", creator: "Lívia Ramos", initials: "LR", category: "Família", theme: "family", artTitle: "Nossa família", artCaption: "amor que mora junto", rating: 4.6, reviews: 18, favorites: 64 },
  { id: 8, title: "Modo economia", creator: "André Costa", initials: "AC", category: "Divertidas", theme: "fun", artTitle: "Modo economia", artCaption: "de energia ativado", rating: 4.7, reviews: 22, favorites: 77 },
];

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <span aria-hidden="true" className={filled ? "heart filled" : "heart"}>{filled ? "♥" : "♡"}</span>;
}

function MugMockup({ theme, artTitle, artCaption, imageUrl, compact = false }: { theme: Theme; artTitle: string; artCaption: string; imageUrl?: string; compact?: boolean }) {
  return (
    <span className={`mug-scene theme-${theme}${compact ? " compact" : ""}`} aria-label={`Mockup de caneca: ${artTitle}`}>
      <span className="scene-orbit orbit-one" /><span className="scene-orbit orbit-two" /><span className="mug-shadow" /><span className="mug-handle" />
      <span className="mug-body"><span className="mug-rim" /><span className="mug-art"><span className="art-sprig sprig-left" /><span className="art-sprig sprig-right" />{imageUrl ? <img src={imageUrl} alt="Foto enviada para personalização" /> : <span className="art-emblem" />}<strong>{artTitle}</strong><small>{artCaption}</small></span></span>
    </span>
  );
}

function Stars({ value, interactive = false, onRate }: { value: number; interactive?: boolean; onRate?: (rating: number) => void }) {
  return <span className={interactive ? "stars interactive" : "stars"} aria-label={`Avaliação ${value} de 5`}>{[1, 2, 3, 4, 5].map((star) => interactive ? <button key={star} type="button" aria-label={`Avaliar com ${star} estrelas`} onClick={() => onRate?.(star)} className={star <= value ? "active" : ""}>★</button> : <span key={star} className={star <= Math.round(value) ? "active" : ""}>★</span>)}</span>;
}

function CreationCard({ creation, favorite, onFavorite, onOpen, onUse }: { creation: Creation; favorite: boolean; onFavorite: () => void; onOpen: () => void; onUse: () => void }) {
  return <article className="creation-card"><button type="button" className="creation-image" onClick={onOpen} aria-label={`Abrir ${creation.title}`}>{creation.badge && <span className="art-badge">{creation.badge}</span>}<MugMockup theme={creation.theme} artTitle={creation.artTitle} artCaption={creation.artCaption} compact /></button><div className="creation-card-body"><div className="creation-title-row"><button type="button" className="text-link" onClick={onOpen}>{creation.title}</button><button type="button" className="icon-button favorite-button" onClick={onFavorite} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}><HeartIcon filled={favorite} /></button></div><div className="creator-line"><span className="mini-avatar">{creation.initials}</span><span>{creation.creator}</span></div><div className="card-social"><span className="rating-inline"><span aria-hidden="true">★</span> {creation.rating.toFixed(1)} <small>({creation.reviews})</small></span><span><HeartIcon filled /> {creation.favorites + (favorite ? 1 : 0)}</span></div><button type="button" className="use-model-button" onClick={onUse}>Usar este modelo <span aria-hidden="true">→</span></button></div></article>;
}

export default function Home() {
  const [category, setCategory] = useState("Todos");
  const [feedTab, setFeedTab] = useState("Destaques");
  const [favorites, setFavorites] = useState<Set<number>>(new Set([3]));
  const [modal, setModal] = useState<"studio" | "detail" | "login" | "profile" | "order" | null>(null);
  const [selectedCreation, setSelectedCreation] = useState<Creation>(creations[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [studioStep, setStudioStep] = useState(1);
  const [personName, setPersonName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [publicArt, setPublicArt] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [credits, setCredits] = useState(2);
  const [generationStage, setGenerationStage] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const visibleCreations = useMemo(() => {
    let list = category === "Todos" ? creations : creations.filter((item) => item.category === category);
    if (feedTab === "Mais avaliadas") list = [...list].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    if (feedTab === "Recentes") list = [...list].reverse();
    return list;
  }, [category, feedTab]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(modal));
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setModal(null);
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("modal-open"); window.removeEventListener("keydown", onKey); };
  }, [modal]);

  function toggleFavorite(id: number) {
    if (!isLogged) { setModal("login"); return; }
    setFavorites((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function openStudio(template: Template = templates[0]) { setSelectedTemplate(template); setStudioStep(1); setGenerated(false); setGenerationStage(0); setModal("studio"); }
  function reuseCreation(creation: Creation) { const template = templates.find((item) => item.id === creation.theme) ?? templates[0]; setSelectedCreation(creation); setSelectedTemplate(template); setPersonName(""); setPhrase(creation.artCaption); setStudioStep(2); setGenerated(false); setModal("studio"); }
  function handlePhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) setPhotoUrl(URL.createObjectURL(file)); }
  async function generateArt() { if (!isLogged) { setModal("login"); return; } setGenerated(false); for (let stage = 1; stage <= 4; stage += 1) { setGenerationStage(stage); await new Promise((resolve) => setTimeout(resolve, 700)); } setCredits((value) => Math.max(0, value - 1)); setGenerated(true); setGenerationStage(0); }
  function completeLogin() { setIsLogged(true); setLoginName(loginName || "Você"); setModal("studio"); }

  const previewTitle = personName.trim() || selectedTemplate.artTitle;
  const previewCaption = phrase.trim() || selectedTemplate.artCaption;
  const stageMessages = ["", "Preparando sua foto", "Criando a composição", "Aplicando nome e frase", "Finalizando o mockup"];

  return <div className="site-shell">
    <header className="topbar"><a className="brand" href="#inicio" aria-label="Caneca dos Sonhos - início"><span className="brand-mark"><span /></span><span><strong>Caneca dos Sonhos</strong><small>por Dona Antônia</small></span></a><nav className="desktop-nav" aria-label="Navegação principal"><a href="#explorar">Explorar</a><a href="#como-funciona">Como funciona</a><a href="#premios">Prêmios</a></nav><div className="header-actions"><span className="credits-pill"><strong>{credits}</strong> criações hoje</span><button type="button" className="profile-button" onClick={() => setModal(isLogged ? "profile" : "login")}><span className="avatar">{isLogged ? (loginName || "VC").slice(0, 2).toUpperCase() : "DA"}</span><span>{isLogged ? loginName || "Meu perfil" : "Entrar"}</span></button></div></header>

    <main>
      <section className="hero" id="inicio"><div className="hero-copy"><span className="eyebrow"><span /> Feita por você, criada com carinho</span><h1>Uma lembrança que vira <em>caneca.</em></h1><p>Escolha um modelo, envie sua foto e conte o que deseja escrever. Sua ideia se transforma em uma arte única, pronta para presentear ou guardar.</p><div className="hero-actions"><button type="button" className="button primary" onClick={() => openStudio()}>Criar minha caneca <span aria-hidden="true">→</span></button><a className="button ghost" href="#explorar">Ver criações</a></div><div className="hero-proof"><div className="avatar-stack"><span>MA</span><span>CR</span><span>BL</span><span>+2k</span></div><p><Stars value={5} /><strong>Mais de 2 mil ideias</strong> já ganharam forma</p></div></div><div className="hero-showcase" aria-label="Exemplos de canecas personalizadas"><div className="hero-note note-one"><span>01</span><strong>Escolha</strong><small>um modelo</small></div><div className="hero-mug-main"><MugMockup theme="floral" artTitle="Helena" artCaption="floresce por onde passa" /></div><div className="hero-mug-small"><MugMockup theme="faith" artTitle="Eis-me aqui" artCaption="Senhor" compact /></div><div className="hero-note note-two"><span>02</span><strong>Personalize</strong><small>com foto e frase</small></div><span className="handwritten">do seu jeito</span></div></section>

      <section className="category-strip" aria-label="Categorias"><div className="category-strip-copy"><span className="spark-symbol">✦</span><p>Encontre uma ideia<br /><strong>para cada história</strong></p></div><div className="category-list">{categories.filter((item) => item !== "Todos").map((item, index) => <button key={item} type="button" onClick={() => { setCategory(item); document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" }); }}><span className={`category-icon category-icon-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong><small>{["mensagens que acolhem", "memórias para sempre", "amor de quatro patas", "ritmos e histórias", "para quem faz o coração sorrir", "presentes que reconhecem", "bom humor todo dia"][index]}</small></button>)}</div></section>

      <section className="gallery-section" id="explorar"><div className="section-heading"><div><span className="eyebrow dark"><span /> Galeria da comunidade</span><h2>Ideias que já ganharam vida</h2></div><p>Inspire-se nas criações da comunidade e transforme qualquer modelo em algo só seu.</p></div><div className="gallery-toolbar"><div className="feed-tabs" role="tablist" aria-label="Ordenar galeria">{["Destaques", "Recentes", "Mais avaliadas"].map((tab) => <button key={tab} type="button" role="tab" aria-selected={feedTab === tab} className={feedTab === tab ? "active" : ""} onClick={() => setFeedTab(tab)}>{tab}</button>)}</div><div className="filter-chips" aria-label="Filtrar por categoria">{categories.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div><div className="creation-grid">{visibleCreations.map((creation) => <CreationCard key={creation.id} creation={creation} favorite={favorites.has(creation.id)} onFavorite={() => toggleFavorite(creation.id)} onOpen={() => { setSelectedCreation(creation); setUserRating(0); setModal("detail"); }} onUse={() => reuseCreation(creation)} />)}</div>{visibleCreations.length === 0 && <div className="empty-state"><strong>Nenhuma criação nesta categoria ainda.</strong><span>Você pode ser a primeira pessoa a publicar uma ideia.</span><button className="button primary" type="button" onClick={() => openStudio()}>Criar agora</button></div>}</section>

      <section className="steps-section" id="como-funciona"><div className="steps-intro"><span className="eyebrow light"><span /> Simples de verdade</span><h2>Da sua ideia<br />para a sua caneca.</h2><p>Você não precisa saber criar artes. Conte a história e nós cuidamos do visual.</p><button type="button" className="button cream" onClick={() => openStudio()}>Começar agora</button></div><div className="steps-list"><article><span>01</span><div><strong>Escolha um modelo</strong><p>Encontre um estilo que combine com a pessoa, ocasião ou lembrança.</p></div></article><article><span>02</span><div><strong>Envie sua foto e frase</strong><p>Personalize com nome, foto, data ou uma mensagem especial.</p></div></article><article><span>03</span><div><strong>Veja a magia acontecer</strong><p>A arte é criada e aplicada em um mockup realista da sua caneca.</p></div></article><article><span>04</span><div><strong>Peça a sua</strong><p>Confira o resultado, escolha a quantidade e encomende pelo WhatsApp.</p></div></article></div></section>

      <section className="reward-section" id="premios"><div className="reward-seal"><span>✦</span><strong>CRIAÇÃO<br />EM DESTAQUE</strong><small>DA SEMANA</small></div><div className="reward-copy"><span className="eyebrow dark"><span /> Sua criatividade vale prêmios</span><h2>Crie, compartilhe<br />e conquiste.</h2><p>Autorize a publicação da sua arte, ganhe uma criação extra no dia e concorra a descontos quando sua ideia for bem avaliada pela comunidade.</p><div className="reward-benefits"><span><strong>+1</strong> criação ao publicar</span><span><strong>5★</strong> avaliações da comunidade</span><span><strong>%</strong> descontos e selos</span></div></div><div className="reward-art"><MugMockup theme="love" artTitle="Nossa história" artCaption="é só o começo" /></div></section>

      <section className="closing-cta"><span className="closing-flower flower-left" /><div><span className="eyebrow dark centered"><span /> Duas criações grátis por dia</span><h2>Qual história vai<br />virar caneca hoje?</h2><p>Comece com um modelo e deixe a sua ideia ganhar forma.</p><button type="button" className="button primary" onClick={() => openStudio()}>Criar minha caneca <span aria-hidden="true">→</span></button></div><span className="closing-flower flower-right" /></section>
    </main>

    <footer><a className="brand footer-brand" href="#inicio"><span className="brand-mark"><span /></span><span><strong>Caneca dos Sonhos</strong><small>por Dona Antônia</small></span></a><p>Criações personalizadas em caneca branca 11 oz, feitas com carinho em Cuiabá e Várzea Grande.</p><nav><a href="#explorar">Galeria</a><a href="#como-funciona">Como funciona</a><a href="#premios">Prêmios</a><button type="button" onClick={() => setModal("login")}>Entrar</button></nav><small>© 2026 Dona Antônia. Protótipo visual do novo projeto.</small></footer>

    <nav className="mobile-nav" aria-label="Navegação mobile"><a href="#inicio"><span>⌂</span>Início</a><a href="#explorar"><span>⌕</span>Explorar</a><button type="button" className="mobile-create" onClick={() => openStudio()}><span>＋</span>Criar</button><button type="button" onClick={() => { setCategory("Todos"); setFeedTab("Destaques"); document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" }); }}><span>♡</span>Favoritos</button><button type="button" onClick={() => setModal(isLogged ? "profile" : "login")}><span>○</span>Perfil</button></nav>

    {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
      {modal === "studio" && <section className="modal studio-modal" role="dialog" aria-modal="true" aria-label="Estúdio de criação"><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button><div className="studio-preview"><div className="studio-preview-head"><span>Seu mockup</span><small>Caneca branca 11 oz</small></div><MugMockup theme={selectedTemplate.id} artTitle={previewTitle} artCaption={previewCaption} imageUrl={photoUrl} /><div className="preview-dots"><span className="active" /><span /><span /></div></div><div className="studio-controls"><div className="studio-topline"><span className="eyebrow dark"><span /> Estúdio de criação</span><span className="credits-pill"><strong>{credits}</strong> criações disponíveis</span></div>{!generated && generationStage === 0 && <><div className="step-progress">{[1, 2, 3, 4].map((step) => <span key={step} className={step <= studioStep ? "active" : ""}><b>{step}</b><small>{["Modelo", "Foto", "Texto", "Conferir"][step - 1]}</small></span>)}</div>{studioStep === 1 && <div className="studio-panel"><span className="panel-kicker">PASSO 1 DE 4</span><h2>Escolha o ponto de partida</h2><p>Você poderá trocar sua foto e todos os textos.</p><div className="template-grid">{templates.map((template) => <button key={template.id} type="button" className={selectedTemplate.id === template.id ? "template-card active" : "template-card"} onClick={() => setSelectedTemplate(template)}><MugMockup theme={template.id} artTitle={template.artTitle} artCaption={template.artCaption} compact /><span><strong>{template.title}</strong><small>{template.hint}</small></span></button>)}</div></div>}{studioStep === 2 && <div className="studio-panel"><span className="panel-kicker">PASSO 2 DE 4</span><h2>Envie uma foto especial</h2><p>Você pode usar uma foto da galeria ou tirar uma agora pelo celular.</p><label className="photo-drop"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} /><span className="upload-symbol">↑</span><strong>{photoUrl ? "Trocar a foto" : "Escolher uma foto"}</strong><small>JPG, PNG ou WebP • até 10 MB</small></label><button type="button" className="skip-link" onClick={() => setStudioStep(3)}>Continuar sem foto</button></div>}{studioStep === 3 && <div className="studio-panel"><span className="panel-kicker">PASSO 3 DE 4</span><h2>Conte o que deseja escrever</h2><p>O nome será o destaque e a frase completará a composição.</p><label className="field"><span>Nome ou texto principal</span><input value={personName} onChange={(event) => setPersonName(event.target.value)} maxLength={34} placeholder="Ex.: Helena" /><small>{personName.length}/34</small></label><label className="field"><span>Frase ou mensagem</span><textarea value={phrase} onChange={(event) => setPhrase(event.target.value)} maxLength={90} placeholder="Ex.: floresce por onde passa" /><small>{phrase.length}/90</small></label></div>}{studioStep === 4 && <div className="studio-panel"><span className="panel-kicker">PASSO 4 DE 4</span><h2>Pronto para criar?</h2><p>Confira o modelo escolhido e como sua personalização será usada.</p><div className="summary-card"><span><small>Modelo</small><strong>{selectedTemplate.title}</strong></span><span><small>Nome</small><strong>{previewTitle}</strong></span><span><small>Frase</small><strong>{previewCaption}</strong></span></div><label className="publish-choice"><input type="checkbox" checked={publicArt} onChange={(event) => setPublicArt(event.target.checked)} /><span><strong>Quero publicar na galeria</strong><small>Após aprovação, você ganha +1 criação extra hoje. Sua foto original nunca será reutilizada.</small></span></label><div className="credit-note"><span>✦</span><p>Esta criação usará <strong>1 dos seus {credits} créditos</strong>. Em caso de falha, o crédito será devolvido.</p></div></div>}<div className="studio-footer"><button type="button" className="button ghost" disabled={studioStep === 1} onClick={() => setStudioStep((step) => Math.max(1, step - 1))}>Voltar</button>{studioStep < 4 ? <button type="button" className="button primary" onClick={() => setStudioStep((step) => Math.min(4, step + 1))}>Continuar <span aria-hidden="true">→</span></button> : <button type="button" className="button primary" disabled={credits < 1} onClick={generateArt}>Gerar minha arte <span aria-hidden="true">✦</span></button>}</div></>}{generationStage > 0 && <div className="generation-state"><div className="generation-mark"><span /><i /></div><span className="panel-kicker">CRIANDO COM CARINHO</span><h2>{stageMessages[generationStage]}</h2><p>Você pode acompanhar cada etapa. Isso leva apenas alguns instantes nesta demonstração.</p><div className="generation-steps">{[1, 2, 3, 4].map((stage) => <span key={stage} className={stage <= generationStage ? "active" : ""} />)}</div></div>}{generated && <div className="generated-state"><span className="success-mark">✓</span><span className="panel-kicker">SUA ARTE ESTÁ PRONTA</span><h2>Uma lembrança só sua.</h2><p>Este é o resultado demonstrativo. Na versão conectada, a arte plana de impressão ficará separada do mockup.</p><div className="generated-actions"><button type="button" className="button primary" onClick={() => setModal("order")}>Quero esta caneca</button><button type="button" className="button ghost" onClick={() => { setGenerated(false); setStudioStep(1); }}>Criar outra</button></div>{publicArt && <div className="publish-pending">Sua arte será enviada para análise antes de aparecer na galeria.</div>}</div>}</div></section>}

      {modal === "detail" && <section className="modal detail-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${selectedCreation.title}`}><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button><div className="detail-art"><MugMockup theme={selectedCreation.theme} artTitle={selectedCreation.artTitle} artCaption={selectedCreation.artCaption} /></div><div className="detail-copy"><span className="category-tag">{selectedCreation.category}</span><h2>{selectedCreation.title}</h2><div className="detail-creator"><span className="avatar">{selectedCreation.initials}</span><span><small>Criação de</small><strong>{selectedCreation.creator}</strong></span>{selectedCreation.badge && <b>{selectedCreation.badge}</b>}</div><div className="detail-rating"><Stars value={selectedCreation.rating} /><strong>{selectedCreation.rating.toFixed(1)}</strong><span>{selectedCreation.reviews} avaliações</span></div><p className="detail-description">Uma criação personalizada em caneca branca 11 oz, desenvolvida para sublimação com arte plana em alta resolução.</p><div className="rate-box"><span>O que você achou desta criação?</span><Stars value={userRating} interactive onRate={(rating) => { if (!isLogged) setModal("login"); else setUserRating(rating); }} /></div><div className="detail-actions"><button className="button primary" type="button" onClick={() => reuseCreation(selectedCreation)}>Usar este modelo</button><button className="button ghost" type="button" onClick={() => { setQuantity(1); setModal("order"); }}>Comprar caneca</button><button className="icon-button detail-heart" type="button" onClick={() => toggleFavorite(selectedCreation.id)} aria-label="Favoritar"><HeartIcon filled={favorites.has(selectedCreation.id)} /></button></div><small className="remix-note">Ao reutilizar, somente o estilo e a composição são copiados. Fotos e nomes do criador permanecem protegidos.</small></div></section>}

      {modal === "login" && <section className="modal login-modal" role="dialog" aria-modal="true" aria-label="Entrar ou criar conta"><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button><span className="login-mark"><span /></span><span className="eyebrow dark centered"><span /> Guarde suas criações</span><h2>Entre para continuar</h2><p>Você só precisa de uma conta para gerar, avaliar e favoritar artes.</p><button type="button" className="google-button" onClick={() => { setLoginName("Você"); setIsLogged(true); setModal("studio"); }}><b>G</b> Continuar com Google</button><div className="or"><span />ou use seu e-mail<span /></div><label className="field"><span>Seu nome</span><input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Como devemos chamar você?" /></label><label className="field"><span>Seu e-mail</span><input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="voce@email.com" /></label><button type="button" className="button primary full" disabled={!loginEmail.includes("@") || !loginName.trim()} onClick={completeLogin}>Receber link de acesso</button><small>Não pedimos senha. Na versão conectada, você receberá um link seguro no e-mail.</small></section>}

      {modal === "profile" && <section className="modal profile-modal" role="dialog" aria-modal="true" aria-label="Meu perfil"><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button><div className="profile-cover"><span className="profile-avatar">{(loginName || "VC").slice(0, 2).toUpperCase()}</span></div><div className="profile-content"><span className="eyebrow dark"><span /> Meu espaço criativo</span><h2>{loginName || "Seu perfil"}</h2><p>{loginEmail || "Conta demonstrativa"}</p><div className="profile-stats"><span><strong>{credits}</strong><small>criações hoje</small></span><span><strong>{favorites.size}</strong><small>favoritos</small></span><span><strong>0</strong><small>artes públicas</small></span></div><div className="profile-empty"><span>✦</span><strong>Sua primeira criação começa aqui</strong><p>Escolha um modelo e transforme uma lembrança em caneca.</p><button type="button" className="button primary" onClick={() => openStudio()}>Criar agora</button></div></div></section>}

      {modal === "order" && <section className="modal order-modal" role="dialog" aria-modal="true" aria-label="Encomendar caneca"><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button><span className="eyebrow dark"><span /> Sua caneca personalizada</span><h2>Quase pronta para ser sua.</h2><div className="order-product"><MugMockup theme={generated ? selectedTemplate.id : selectedCreation.theme} artTitle={generated ? previewTitle : selectedCreation.artTitle} artCaption={generated ? previewCaption : selectedCreation.artCaption} compact /><div><strong>Caneca branca personalizada 11 oz</strong><span>Sublimação • arte em alta resolução</span><b>R$ 39,90</b></div></div><div className="quantity-row"><span>Quantidade</span><div><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity((value) => value + 1)}>+</button></div></div><div className="order-total"><span>Total</span><strong>{(39.9 * quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div><button type="button" className="button whatsapp full" onClick={() => alert("Na versão conectada, o pedido será enviado ao WhatsApp com a arte anexada.")}>Continuar pelo WhatsApp</button><small>Na próxima etapa funcional, seus dados e a arte final acompanharão automaticamente o pedido.</small></section>}
    </div>}
  </div>;
}
