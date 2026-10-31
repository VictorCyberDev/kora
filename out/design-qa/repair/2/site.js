(function(){
  var m=document.querySelector('meta[name="kora-events"]'),ev=m&&m.getAttribute('content');
  var q=null;try{q=new URLSearchParams(location.search).get('k')}catch(e){}
  if(q&&!/^[a-z]{8}$/.test(q))q=null;
  try{if(q)sessionStorage.setItem('kora_k',q)}catch(e){}
  var k=q;try{k=k||sessionStorage.getItem('kora_k')}catch(e){}
  function send(t){if(!ev||!k)return;try{navigator.sendBeacon(ev,JSON.stringify({k:k,t:t}))}catch(e){}}
  if(q)send('visit');
  document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(/^tel:/i.test(h))send('call');else if(/(^|\/\/)(wa\.me|api\.whatsapp\.com|wa\.link)/i.test(h))send('whatsapp')},true);
  var forms=document.querySelectorAll('form[data-kora-form]');
  Array.prototype.forEach.call(forms,function(form){
    form.addEventListener('submit',function(ev2){
      ev2.preventDefault();
      var status=form.querySelector('.form-status');
      var data={};
      new FormData(form).forEach(function(v,key){data[key]=String(v)});
      if(k)data.k=k;
      status.textContent='Sending\u2026';
      fetch(form.getAttribute('data-endpoint'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){if(!r.ok)throw new Error('failed');status.textContent=form.getAttribute('data-success');form.reset();})
        .catch(function(){status.textContent=form.getAttribute('data-failure');});
    });
  });
})();
