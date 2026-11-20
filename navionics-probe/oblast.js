(() => {
  const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  function plan(catalog,bbox,zoom,kinds){
    const visible=catalog.tiles.filter(t=>t.format==='T08'&&kinds.includes(t.kind)&&intersects(t.bbox,bbox));
    const files=visible.filter(t=>t.file);
    return {overview:zoom<12,tooMany:zoom>=12&&files.length>16,files,empty:visible.filter(t=>!t.file).length,visible:visible.length};
  }
  function create({map,catalog,url,onState,showBounds}){
    let generation=0,controller=null,kinds=['ugd'],timer=null,cache=new Map(),state={overview:true,blockExport:true,message:'Обзор покрытия. Приблизьте карту до масштаба 12 или крупнее.'};
    const byCell=new Map();
    for(const t of catalog.tiles.filter(t=>t.format==='T08')){const k=t.name.replace(/\.(nv2|ugd)$/,'');if(!byCell.has(k))byCell.set(k,{bbox:t.bbox,rows:[]});byCell.get(k).rows.push(t);}
    const coverage=L.layerGroup();
    for(const cell of byCell.values()){
      const [w,s,e,n]=cell.bbox,has=cell.rows.some(t=>t.file);
      const rectangle=L.rectangle([[s,w],[n,e]],{color:has?'#245ac2':'#777',weight:1,fillOpacity:has?.06:0,dashArray:has?null:'3 4'});
      const content=document.createElement('div');content.textContent=has?'Есть декодированные объекты. Нажмите для приближения.':'Тайл найден, но текущий декодер не извлёк глубинные объекты. Это не означает безопасную глубину.';
      rectangle.bindTooltip(content);rectangle.on('click',()=>map.setView([(s+n)/2,(w+e)/2],12));coverage.addLayer(rectangle);
    }
    function coverageVisibility(){if(map.getZoom()<12||showBounds())coverage.addTo(map);else map.removeLayer(coverage);}
    async function refresh(){
      const own=++generation;if(controller)controller.abort();controller=new AbortController();const signal=controller.signal;
      coverageVisibility();const b=map.getBounds(),p=plan(catalog,[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],map.getZoom(),kinds);
      if(p.overview||p.tooMany||!p.files.length){
        state={overview:p.overview,blockExport:true,loading:false,failed:false,empty:p.empty,active:[],message:p.overview?'Обзор покрытия, не глубины. Приблизьте карту (масштаб ≥ 12) или нажмите рамку тайла.':p.tooMany?'Слишком много тайлов в окне. Приблизьте карту для загрузки.':'В этом окне нет декодированных данных выбранного типа. Глубина неизвестна.'};
        onState(state);return;
      }
      state={overview:false,blockExport:true,loading:true,failed:false,active:[],message:`Загрузка ${p.files.length} тайлов видимой области…`};onState(state);
      let cursor=0;const active=[],errors=[];
      async function worker(){
        while(cursor<p.files.length&&!signal.aborted){const row=p.files[cursor++];
          try{
            let value=cache.get(row.id);
            if(value){cache.delete(row.id);cache.set(row.id,value);}else{
              const response=await fetch(url(row.file),{signal,cache:'force-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
              value=await response.json();
              if(value.version!==1||value.id!==row.id||value.data?.features?.length!==row.contours||value.shallow?.areas?.length!==row.shallow)throw new Error('Tile catalog mismatch');
              if(signal.aborted||own!==generation)return;
              cache.set(row.id,value);
            }
            active.push({id:row.id,label:row.name,kind:row.kind,bbox:row.bbox,estimated:row.estimated,visible:true,data:value.data,shallow:value.shallow,tileCount:1,status:row.status});
            if(row.status==='partial')errors.push(row.name);
          }catch(e){if(!signal.aborted)errors.push(row.name);}
        }
      }
      await Promise.all(Array.from({length:Math.min(3,p.files.length)},()=>worker()));
      if(own!==generation||signal.aborted)return;
      const ids=new Set(active.map(e=>e.id));for(const id of cache.keys()){if(cache.size<=24)break;if(!ids.has(id))cache.delete(id);}
      state={overview:false,blockExport:errors.length>0,loading:false,failed:errors.length>0,active,empty:p.empty,cacheSize:cache.size,
        message:errors.length?`ОШИБКА: ${errors.length} тайлов не загружены полностью; экспорт заблокирован.`:`Загружено ${active.length} тайлов в окне. Без объектов декодера: ${p.empty}. Отсутствие данных не означает безопасность.`};onState(state);
    }
    function schedule(){
      clearTimeout(timer);++generation;controller?.abort();
      state={overview:map.getZoom()<12,blockExport:true,loading:true,failed:false,active:[],message:'Обновление тайлов видимой области…'};onState(state);
      timer=setTimeout(refresh,150);
    }
    map.on('moveend zoomend',schedule);
    return {refresh,schedule,coverageVisibility,setKinds(value){kinds=value;schedule();},get state(){return state;},get cacheSize(){return cache.size;},destroy(){++generation;controller?.abort();clearTimeout(timer);map.off('moveend zoomend',schedule);map.removeLayer(coverage);cache.clear();}};
  }
  globalThis.ProbeOblast={plan,intersects,create};
})();
