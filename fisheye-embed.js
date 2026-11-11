(() => {
 const frame=document.getElementById('fisheyeFrame');
 let observer;
 function connect(){
  observer?.disconnect();
  const doc=frame.contentDocument;
  if(!doc?.body)return;
  const resize=()=>{
   const height=Math.ceil(doc.body.getBoundingClientRect().height);
   if(height>0&&Math.abs(frame.getBoundingClientRect().height-height)>1)frame.style.height=height+'px';
  };
  observer=new ResizeObserver(resize);observer.observe(doc.body);
  doc.fonts?.ready.then(resize);resize();
 }
 frame.addEventListener('load',connect);
 if(frame.contentDocument?.readyState==='complete')connect();
})();
