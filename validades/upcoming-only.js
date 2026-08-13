(function(){
  'use strict';

  function cleanUpcomingList(){
    var list=document.getElementById('productsList');
    if(!list)return;

    Array.prototype.forEach.call(list.querySelectorAll('.product-row.expired'),function(row){
      row.remove();
    });

    var rows=list.querySelectorAll('.product-row');
    var visible=document.getElementById('visibleCount');
    if(visible)visible.textContent=rows.length;

    var today=0;
    Array.prototype.forEach.call(rows,function(row){
      var note=row.querySelector('.validity-note');
      if(note&&String(note.textContent||'').trim().toLowerCase()==='vence hoje')today++;
    });

    var firstCount=document.getElementById('expiredCount');
    if(firstCount)firstCount.textContent=today;
    var firstLabel=firstCount&&firstCount.parentElement?firstCount.parentElement.querySelector('span'):null;
    if(firstLabel)firstLabel.textContent='vence hoje';

    var legend=document.querySelector('.legend');
    if(legend)legend.innerHTML='<span class="dot urgent"></span> até 7 dias <span class="dot attention"></span> até 30 dias';
  }

  var list=document.getElementById('productsList');
  if(list&&window.MutationObserver){
    new MutationObserver(function(){window.requestAnimationFrame(cleanUpcomingList);}).observe(list,{childList:true,subtree:true});
  }

  cleanUpcomingList();
  window.addEventListener('load',cleanUpcomingList);
})();