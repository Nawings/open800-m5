(() => {
  'use strict';
  const $=id=>document.getElementById(id),status=$('status');
  if(!window.L){status.textContent='Не удалось загрузить библиотеку карты. Проверьте интернет и перезагрузите страницу.';status.className='error';$('retry').hidden=false;$('retry').onclick=()=>location.reload();return;}
  const map=L.map('map',{preferCanvas:true}).setView([56.302,43.965],14);
  const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  L.control.scale({imperial:false}).addTo(map);
  const labels=L.layerGroup().addTo(map),loaded=new Map();
  let tiles=null,manifest=null,loadFailed=false,scheduled=false;
  const fmt=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:1});
  const colour=d=>d<=2?'#a15c00':d<=5?'#087f8c':d<=8?'#245ac2':'#663b9b';
  const passes=f=>Math.abs(f.properties.depth_m/Number($('interval').value)-Math.round(f.properties.depth_m/Number($('interval').value)))<1e-8;
  function selectFeature(feature,latlng){
    const p=feature.properties;const box=$('selection');box.replaceChildren();
    const number=document.createElement('div');number.className='selected-depth';number.textContent=`${fmt(p.depth_m)} м`;
    const source=document.createElement('div');source.textContent=`${p.source_file} · запись ${p.record_offset} · ${p.point_count} вершин`;
    const note=document.createElement('div');note.textContent=`Изобата, не точечный промер. Поле файла: ${p.raw_value} / 10.`;
    box.append(number,source,note);
    L.popup().setLatLng(latlng).setContent(`Изобата <strong>${fmt(p.depth_m)} м</strong>`).openOn(map);
  }
  function redraw(){
    for(const entry of loaded.values()){
      if(entry.layer)map.removeLayer(entry.layer);
      entry.layer=L.geoJSON(entry.data,{filter:passes,style:f=>({color:colour(f.properties.depth_m),weight:f.properties.raw_value%20===0?1.6:0.9,opacity:.88}),onEachFeature:(f,line)=>line.on('click',e=>selectFeature(f,e.latlng))});
      if(entry.visible)entry.layer.addTo(map);
    }
    refreshLabels();
  }
  function refreshLabels(){
    labels.clearLayers();
    if(!$('labels').checked||map.getZoom()<12)return;
    const size=map.getSize(),cells=new Set();let count=0;
    const visible=[...loaded.values()].filter(e=>e.visible).flatMap(e=>e.data.features).filter(passes);
    visible.sort((a,b)=>(a.properties.raw_value%20)-(b.properties.raw_value%20)||b.properties.point_count-a.properties.point_count);
    for(const feature of visible){
      if(map.getZoom()<15&&feature.properties.raw_value%20!==0)continue;
      if(count>=90)break;
      const coordinates=feature.geometry.coordinates;
      let distance=0,last=null;
      for(let i=0;i<coordinates.length;i++){
        const [lon,lat]=coordinates[i],p=map.latLngToContainerPoint([lat,lon]);
        if(last)distance+=p.distanceTo(last);last=p;
        if(distance<45||p.x<25||p.x>size.x-40||p.y<20||p.y>size.y-55)continue;
        const cx=Math.floor(p.x/70),cy=Math.floor(p.y/35);
        if([[-1,0],[0,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>cells.has(`${cx+dx}:${cy+dy}`)))continue;
        cells.add(`${cx}:${cy}`);
        L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'depth-label',html:`<span>${fmt(feature.properties.depth_m)} м</span>`,iconSize:[42,20],iconAnchor:[21,10]})}).addTo(labels);
        count++;break;
      }
    }
  }
  function scheduleLabels(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshLabels();});}
  map.on('moveend zoomend resize',scheduleLabels);
  $('interval').addEventListener('change',redraw);$('labels').addEventListener('change',refreshLabels);
  $('basemap').addEventListener('change',()=>{$('basemap').checked?base.addTo(map):map.removeLayer(base);});
  $('bounds').addEventListener('change',()=>{if(tiles)$('bounds').checked?tiles.addTo(map):map.removeLayer(tiles);});
  $('retry').onclick=()=>location.reload();
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.view==='oka')map.fitBounds([[56.246,43.934],[56.327,44.004]],{padding:[20,20]});
    else if(button.dataset.view==='strelka')map.fitBounds([[56.322,43.981],[56.350,44.035]],{padding:[20,20]});
    else {const bounds=L.latLngBounds();for(const e of loaded.values())if(e.visible)bounds.extend(e.layer.getBounds());if(bounds.isValid())map.fitBounds(bounds,{padding:[25,25]});}
  }));
  const fetchJson=async url=>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();};
  async function init(){
    try {
      manifest=await fetchJson('data/manifest.json?v=projection-v4');
      if(manifest.version!==3)throw new Error('Устаревший набор данных');
      const url=file=>`data/${file}?v=${encodeURIComponent(manifest.revision)}`;
      await Promise.all(manifest.layers.map(async config=>{
        try{
          const data=await fetchJson(url(config.file));
          if(!data.features.length||data.features.some(f=>!Number.isFinite(f.properties.depth_m)))throw new Error('Некорректные глубины');
          const entry={...config,data};loaded.set(config.id,entry);
          const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=config.visible;
          input.addEventListener('change',()=>{entry.visible=input.checked;redraw();});label.append(input,document.createTextNode(`${config.label} (${config.count})`));$('layers').append(label);
        }catch(e){loadFailed=true;console.error(config.id,e);}
      }));
      redraw();
      const count=[...loaded.values()].reduce((n,e)=>n+e.data.features.length,0);
      $('summary').textContent=`${fmt(count)} фрагмента изобат · ${loaded.size} тайла · значения в метрах`;
      status.textContent=loadFailed?'Часть слоёв не загрузилась. Повторите загрузку.':`Изобаты загружены. Версия ${manifest.revision}.`;
      status.classList.toggle('error',loadFailed);$('retry').hidden=!loadFailed;
      try{tiles=L.geoJSON(await fetchJson(url('tiles.geojson')),{style:{color:'#4f6470',weight:1,fillOpacity:0,dashArray:'6 5'},interactive:false});if($('bounds').checked)tiles.addTo(map);}catch{status.textContent+=' Границы тайлов недоступны.';}
    }catch(e){status.textContent=`Не удалось загрузить данные: ${e.message}. Откройте страницу через HTTP(S), не как файл.`;status.className='error';$('retry').hidden=false;}
  }
  window.navionicsProbe={map,layers:loaded,labels,selectFeature,get manifest(){return manifest;}};
  init();
})();
