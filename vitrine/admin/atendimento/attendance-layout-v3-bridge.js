const CHANNELS=['0975','1018'];
let baseChannel='0975';
let openingUnified=false;

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitForQueueSettled(timeout=4000){
  const box=$('#queueList');
  if(!box)return false;
  const started=Date.now();
  while(Date.now()-started<timeout){
    const children=[...box.children];
    if(children.length&&children.every(child=>!child.classList.contains('queue-card-v3')))return true;
    await sleep(50);
  }
  return false;
}

async function waitForBaseCard(conversationId,timeout=4000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const card=$$('#queueList .queue-card:not(.queue-card-v3)').find(item=>item.dataset.conversationId===conversationId);
    if(card)return card;
    await sleep(50);
  }
  return null;
}

async function forceBaseChannelReload(targetChannel){
  const sameChannel=baseChannel===targetChannel;
  if(sameChannel){
    const alternate=CHANNELS.find(channel=>channel!==targetChannel);
    const alternateButton=$(`[data-channel-switch="${alternate}"]`);
    if(alternateButton&&!alternateButton.disabled){
      alternateButton.click();
      baseChannel=alternate;
      await waitForQueueSettled();
    }
  }

  const targetButton=$(`[data-channel-switch="${targetChannel}"]`);
  if(!targetButton||targetButton.disabled)return false;
  targetButton.click();
  baseChannel=targetChannel;
  await waitForQueueSettled();
  return true;
}

async function openUnifiedCard(card){
  if(openingUnified)return;
  const conversationId=String(card.dataset.conversationId||'');
  const targetChannel=String(card.dataset.unifiedChannel||card.getAttribute('data-unified-channel')||'');
  if(!conversationId||!CHANNELS.includes(targetChannel))return;

  openingUnified=true;
  try{
    const loaded=await forceBaseChannelReload(targetChannel);
    if(!loaded)return;
    const baseCard=await waitForBaseCard(conversationId);
    if(!baseCard)return;
    baseCard.click();
    await sleep(120);
    $('#allChannelsBtn')?.click();
  }finally{
    openingUnified=false;
  }
}

document.addEventListener('click',event=>{
  const unifiedCard=event.target.closest?.('.queue-card-v3[data-unified-channel]');
  if(unifiedCard){
    event.preventDefault();
    event.stopImmediatePropagation();
    openUnifiedCard(unifiedCard).catch(()=>{});
    return;
  }

  const channelButton=event.target.closest?.('[data-channel-switch]');
  if(channelButton&&!openingUnified){
    const channel=String(channelButton.dataset.channelSwitch||'');
    if(CHANNELS.includes(channel))baseChannel=channel;
  }
},true);
