/* Four logical ink levels; the exported bitmap is quantized after antialiasing. */
(() => {
  const levels=[0,85,170,255];
  function quantize(data){
    for(let i=0;i<data.length;i+=4){
      const alpha=data[i+3]/255;
      const luminance=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])*alpha+255*(1-alpha);
      // Same four equal input bands as the live SVG component-transfer filter.
      const v=levels[Math.min(3,Math.max(0,Math.floor(luminance/255*4)))];
      data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
    }
    return data;
  }
  function style(depth){
    if(depth<=2)return {color:'#000000',weight:2,opacity:1,dashArray:null};
    if(depth<=5)return {color:'#555555',weight:1.5,opacity:1,dashArray:null};
    if(depth<=8)return {color:'#aaaaaa',weight:1.5,opacity:1,dashArray:null};
    return {color:'#000000',weight:1.2,opacity:1,dashArray:'5 3'};
  }
  function render({canvas,map,features,base,showBase,showLabels,shallowAreas=[]}){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=400,h=300;
    canvas.width=w;canvas.height=h;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
    const zoom=map.getZoom(),center=map.project(map.getCenter(),zoom),left=center.x-w/2,top=center.y-h/2;
    let missing=0;
    if(showBase){
      const tileSize=256;
      for(let x=Math.floor(left/tileSize);x<=Math.floor((left+w-1)/tileSize);x++)for(let y=Math.floor(top/tileSize);y<=Math.floor((top+h-1)/tileSize);y++){
        const tile=base._tiles?.[`${x}:${y}:${zoom}`]?.el;
        if(tile?.complete&&tile.naturalWidth)ctx.drawImage(tile,Math.round(x*tileSize-left),Math.round(y*tileSize-top),tileSize,tileSize);else missing++;
      }
    }
    if(globalThis.ProbeHazards)ProbeHazards.paint(ctx,shallowAreas,([lon,lat])=>{const p=map.project([lat,lon],zoom);return[p.x-left,p.y-top];},w,h,true);
    const candidates=[];
    for(const f of features){
      const s=style(f.properties.depth_m),points=f.geometry.coordinates.map(([lon,lat])=>{const p=map.project([lat,lon],zoom);return[p.x-left,p.y-top];});
      if(!points.some(([x,y])=>x>-30&&x<w+30&&y>-30&&y<h+30))continue;
      ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
      ctx.strokeStyle=s.color;ctx.lineWidth=s.weight;ctx.setLineDash(s.dashArray?[5,3]:[]);ctx.stroke();
      if(showLabels&&(zoom>=15||f.properties.raw_value%20===0))candidates.push({f,points});
    }
    ctx.setLineDash([]);ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const used=[];
    candidates.sort((a,b)=>(a.f.properties.raw_value%20)-(b.f.properties.raw_value%20)||b.points.length-a.points.length);
    for(const {f,points} of candidates){
      let walked=0;
      for(let i=1;i<points.length;i++){
        const [x,y]=points[i];walked+=Math.hypot(x-points[i-1][0],y-points[i-1][1]);
        if(walked<25||x<28||x>w-28||y<12||y>h-28||used.some(p=>Math.abs(p[0]-x)<55&&Math.abs(p[1]-y)<24))continue;
        const text=(f.properties.depth_estimated?'≈':'')+f.properties.depth_m.toLocaleString('ru-RU')+' м',width=ctx.measureText(text).width+6;
        ctx.fillStyle='#fff';ctx.fillRect(Math.round(x-width/2),Math.round(y-8),Math.ceil(width),16);ctx.fillStyle='#000';ctx.fillText(text,x,y);used.push([x,y]);break;
      }
      if(used.length>=18)break;
    }
    ctx.fillStyle='#fff';ctx.fillRect(0,0,145,16);ctx.fillStyle='#000';ctx.textAlign='left';ctx.font='bold 11px sans-serif';ctx.fillText('//// ≤ 2 м: мелководье',3,8);
    // Credit and scale are part of the hardware-sized frame, not merely browser UI.
    const metres=map.distance(map.unproject([center.x,center.y],zoom),map.unproject([center.x+50,center.y],zoom));
    ctx.fillStyle='#fff';ctx.fillRect(0,h-17,w,17);ctx.fillStyle='#000';ctx.font='10px sans-serif';ctx.textAlign='left';
    ctx.fillText(showBase?'© OpenStreetMap · НЕ ДЛЯ НАВИГАЦИИ':'UGD 2022 · НЕ ДЛЯ НАВИГАЦИИ',4,h-8);
    ctx.fillText(`${Math.round(metres)} м`,w-54,h-8);ctx.fillRect(w-54,h-3,50,1);
    try{const pixels=ctx.getImageData(0,0,w,h);quantize(pixels.data);ctx.putImageData(pixels,0,0);}catch{ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);return {error:'Подложка не разрешила экспорт. Отключите OpenStreetMap для кадра.'};}
    return {missingTiles:missing,labels:used.length,width:w,height:h};
  }
  globalThis.ProbeEink={levels,quantize,style,render};
})();
