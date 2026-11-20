(() => {
  function paint(ctx,areas,project,width,height,ink=false){
    const tile=document.createElement('canvas');tile.width=tile.height=ink?8:10;
    const t=tile.getContext('2d'),step=tile.width;
    t.strokeStyle=ink?'#000':'#b02020';t.lineWidth=1;
    t.beginPath();t.moveTo(-1,step+1);t.lineTo(step+1,-1);t.moveTo(-1,1);t.lineTo(1,-1);t.moveTo(step-1,step+1);t.lineTo(step+1,step-1);t.stroke();
    const pattern=ctx.createPattern(tile,'repeat');ctx.save();ctx.fillStyle=pattern;
    for(const area of areas){
      const a=project([area.bbox[0],area.bbox[1]]),b=project([area.bbox[2],area.bbox[3]]);
      if(Math.max(a[0],b[0])<0||Math.min(a[0],b[0])>width||Math.max(a[1],b[1])<0||Math.min(a[1],b[1])>height)continue;
      ctx.beginPath();
      for(const ring of area.rings){ring.forEach((c,i)=>{const [x,y]=project(c);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();}
      ctx.fill('evenodd');
    }
    ctx.restore();
  }
  function createLayer(map,getAreas,isInk){
    if(!map.getPane('hazardPane')){const p=map.createPane('hazardPane');p.style.zIndex='350';p.style.pointerEvents='none';}
    const Layer=L.Layer.extend({
      onAdd(){this.canvas=L.DomUtil.create('canvas','leaflet-zoom-hide',map.getPane('hazardPane'));this.canvas.style.pointerEvents='none';map.on('moveend zoomend resize viewreset',this.draw,this);this.draw();},
      onRemove(){map.off('moveend zoomend resize viewreset',this.draw,this);this.canvas.remove();},
      draw(){if(!this.canvas)return;const size=map.getSize(),dpr=window.devicePixelRatio||1,c=this.canvas;
        c.width=Math.round(size.x*dpr);c.height=Math.round(size.y*dpr);c.style.width=size.x+'px';c.style.height=size.y+'px';
        L.DomUtil.setPosition(c,map.containerPointToLayerPoint([0,0]));const ctx=c.getContext('2d');ctx.scale(dpr,dpr);
        paint(ctx,getAreas(),([lon,lat])=>{const p=map.latLngToContainerPoint([lat,lon]);return[p.x,p.y];},size.x,size.y,isInk());
      }
    });return new Layer().addTo(map);
  }
  globalThis.ProbeHazards={paint,createLayer};
})();
