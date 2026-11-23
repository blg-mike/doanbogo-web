export function mountGaugebook(root) {
  const $ = selector=>root.querySelector(selector);
  const events = new AbortController();
  const {signal} = events;
  let ready=false, listView=false;
  const main=$("#main"), modal=$("#modal"), box=$("#dialogBody");
  let records=[],draft=null,selected=[],picking=false,filtersOpen=false,busy=false;
  let filters={q:"",needle:"",pattern:"",mode:"",stage:"",sort:"new"};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const id=()=>Array.from(crypto.getRandomValues(new Uint32Array(3)),n=>n.toString(36)).join("");
  const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const yarn=()=>({name:"",maker:"",color:"",weight:"",fiber:"",strands:1});
  const measure=()=>({id:id(),stage:"미지정",custom:"",date:today(),width:"",height:"",stitches:"",rows:"",edge:false,same:false});
  const fresh=()=>({name:"",pattern:"",note:"",mode:"단사",yarns:[yarn()],needle:{size:"",type:"",brand:"",material:""},measurements:[measure()],photos:[]});
  const patterns=["메리야스","가터뜨기","고무뜨기","씨드뜨기","케이블","레이스","기타"];
  const stages=["미지정","세탁 전","세탁 후 완전 건조","블로킹 후 완전 건조","사용자 지정"];
  const stateName=m=>m.stage==="사용자 지정"?(m.custom||m.stage):m.stage;
  const latest=r=>r.measurements[r.measurements.length-1];
  const yarns=r=>r.yarns.map(y=>[y.name,r.mode==="합사"?`${y.strands}합`:""].filter(Boolean).join(" ")).filter(Boolean).join(" + ")||"실 미입력";
  const needle=r=>r.needle.size?`${r.needle.size} mm`:"미지정";
  function gauge(m){
   const [w,h,s,r]=[m.width,m.height,m.stitches,m.rows].map(Number);
   if(![w,h,s,r].every(x=>Number.isFinite(x)&&x>0)||!Number.isInteger(s*2)||!Number.isInteger(r*2))return null;
   return {s:s/w*10,r:r/h*10,w:w/s,h:h/r,ratio:(s/w)/(r/h)};
  }
  const pair=m=>{const g=gauge(m);return g?`${g.s.toFixed(1)}코 · ${g.r.toFixed(1)}단`:"";};
  const src=p=>p.data;
  const cover=r=>r.photos.length?`<img class="cover" src="${esc(src(r.photos[0]))}" alt="${esc(r.name)} 대표 사진">`:'<div class="placeholder">등록된 사진 없음</div>';
  const opts=(arr,value)=>arr.map(v=>`<option value="${esc(v)}" ${String(v)===String(value)?"selected":""}>${esc(v||"미지정")}</option>`).join("");
  const btn=(action,label,cls="")=>`<button type="button" data-act="${esc(action)}" class="${cls}">${esc(label)}</button>`;
  let toastTimer;
  function toast(msg){$("#toast").textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").textContent="",3500);}
  const database = new Promise((resolve,reject)=>{
   const request=indexedDB.open("knitpeek-gaugebook",1);
   request.onupgradeneeded=()=>request.result.createObjectStore("swatches",{keyPath:"id"});
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(Error("이 브라우저에서 게이지 기록을 열 수 없습니다."));
  });
  async function transact(mode,operation){
   const db=await database;
   return new Promise((resolve,reject)=>{
    const transaction=db.transaction("swatches",mode);
    const request=operation(transaction.objectStore("swatches"),transaction);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(Error("기록을 저장할 수 없습니다. 저장 공간을 확인하거나 화면을 새로고침해 주세요."));
   });
  }
  async function saveRecord(draft){
   const record={...draft,id:draft.id||id(),created:draft.created||new Date().toISOString(),version:(draft.version||0)+1};
   await transact("readwrite",(store,transaction)=>{
    if(!draft.id)return store.add(record);
    const current=store.get(record.id);
    current.onsuccess=()=>{
     if(current.result?.version!==draft.version)transaction.abort();
     else store.put(record);
    };
    return current;
   });
   return record;
  }
  function show(html){box.innerHTML=html;if(!modal.open)modal.showModal();}
  const emptyFilters=()=>!Object.entries(filters).some(([k,v])=>k!=="sort"&&v);
  function filterSelect(key,title,values){return `<label class="field">${title}<select data-filter="${key}"><option value="">전체</option>${opts(values,filters[key])}</select></label>`;}
  function library(){
   main.innerHTML=`<div class="welcome-row"><div><p class="eyebrow">스와치 기록</p><h1>게이지북</h1><p class="welcome-copy">사진과 측정 기록은 이 브라우저에 저장됩니다.</p></div><div class="document-count">${records.length}개 스와치</div></div>
   <div class="collection-search-row"><label class="search-box report-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg><input data-filter="q" type="search" aria-label="스와치명 또는 실 이름 검색" placeholder="스와치명 또는 실 이름 검색" value="${esc(filters.q)}"></label></div>
   <div class="toolbar reports-toolbar gauge-toolbar">${btn("filters",filtersOpen?"필터 닫기":"필터","secondary-button")}<label class="sort-select"><select data-filter="sort" aria-label="정렬">${[["new","최신 등록순"],["name","이름순"],["gauge","코 게이지순"]].map(([v,t])=>`<option value="${v}" ${filters.sort===v?"selected":""}>${t}</option>`).join("")}</select></label>
   <div class="gauge-toolbar-actions">${btn("pick",picking?"선택 취소":"스와치 비교","secondary-button")}<a class="primary-button" href="#/gaugebook/new">＋ 새 게이지 등록</a><div class="view-toggle" aria-label="보기 방식"><button data-act="grid" aria-label="표지 보기" aria-pressed="${!listView}" class="${listView?"":"active"}">▦</button><button data-act="list" aria-label="목록 보기" aria-pressed="${listView}" class="${listView?"active":""}">☰</button></div></div></div>
   ${filtersOpen?`<div class="filterbox fields">${filterSelect("needle","바늘 크기 (mm)",[...new Set(records.map(r=>r.needle.size).filter(Boolean))].sort((a,b)=>a-b))}${filterSelect("pattern","뜨개 조직",patterns)}${filterSelect("mode","실 구성",["단사","합사"])}${filterSelect("stage","측정 상태",stages)}${btn("reset","필터 초기화")}</div>`:""}<div id="cards"></div>`;
   cards();
  }
  function cards(){
   let list=records.filter(r=>(r.name+" "+yarns(r)).toLowerCase().includes(filters.q.trim().toLowerCase())&&(!filters.needle||r.needle.size==filters.needle)&&(!filters.pattern||r.pattern===filters.pattern)&&(!filters.mode||r.mode===filters.mode)&&(!filters.stage||latest(r).stage===filters.stage));
   if(filters.sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name,"ko"));
   if(filters.sort==="gauge")list.sort((a,b)=>gauge(latest(a)).s-gauge(latest(b)).s);
   $("#cards").innerHTML=(picking?`<div class="actions"><span>비교할 스와치 2~4개 선택</span><button data-act="compare" class="primary" ${selected.length<2?"disabled":""}>${selected.length}개 비교하기</button></div>`:"")+(list.length?`<div class="${listView?"document-list":"document-grid"}">${list.map(r=>`<article class="card ${selected.includes(r.id)?"picked":""}"><a class="document-card report-document-card ${listView?"list-card":""}" href="#/gaugebook/record/${r.id}"><span class="cover-button report-cover">${cover(r)}</span><span class="document-info"><strong class="card-title">${esc(r.name)}</strong><span class="document-meta">${esc(yarns(r))} · ${esc(needle(r))}</span><strong>${pair(latest(r))} / 10cm</strong><p><small>${esc(stateName(latest(r)))} · ${new Date(r.created).toLocaleDateString("ko-KR")}</small></p></span></a>${picking?btn("select:"+r.id,selected.includes(r.id)?"선택 해제":"선택","pick"):""}</article>`).join("")}</div>`:`<div class="empty-state"><h2>${emptyFilters()?"첫 스와치를 기록해 보세요":"검색 결과가 없습니다"}</h2><p>${emptyFilters()?"측정한 코수와 단수를 입력하면 10cm 게이지를 바로 확인할 수 있어요.":"검색어나 필터를 변경해 보세요."}</p>${emptyFilters()?'<a class="button" href="#/gaugebook/new">게이지 등록</a>':btn("reset","검색·필터 초기화")}</div>`);
  }
  const head=title=>`<div class="pageHead"><a class="back" href="#/gaugebook/">← 라이브러리</a><h1>${esc(title)}</h1></div>`;
  const read=(obj,path)=>path.split(".").reduce((o,k)=>o[k],obj);
  function input(path,title,{type="text",required=false,extra=""}={}){
   return `<label class="field">${title}<input data-path="${path}" type="${type}" value="${esc(read(draft,path))}" ${required?"required":""} ${extra}></label>`;
  }
  function select(path,title,values){return `<label class="field">${title}<select data-path="${path}">${opts(values,read(draft,path))}</select></label>`;}
  function check(path,title){return `<label><input type="checkbox" data-path="${path}" ${read(draft,path)?"checked":""}> ${title}</label>`;}
  const number=(path,title,step="any",required=false,extra="")=>input(path,title,{type:"number",required,extra:`inputmode="decimal" min="${step==="1"?"1":step==="0.5"?"0.5":"0"}" step="${step}" ${extra}`});
  function result(m){
   const g=gauge(m);
   return g?`<small>10cm × 10cm 게이지</small><br><strong>${pair(m)}</strong><details><summary>세부 수치</summary>1코 너비 ${g.w.toFixed(3)}cm · 1단 높이 ${g.h.toFixed(3)}cm<br>코·단 비율 ${g.ratio.toFixed(3)} : 1</details>`:"가로·세로 길이와 코·단수를 입력해 주세요.";
  }
  function measurement(m,i){
   const p=`measurements.${i}`;
   return `<section class="panel measurement" id="measurement-${i}"><h2>측정 기록 ${i+1}</h2><p class="muted">편물 중앙의 같은 구간에서 길이와 코·단수를 측정하세요.</p><div class="fields">${select(p+".stage","측정 상태",stages)}${input(p+".date","측정일",{type:"date",required:true})}${m.stage==="사용자 지정"?input(p+".custom","사용자 지정 상태",{required:true}):""}${number(p+".width","가로 길이 (cm)","any",true)}${number(p+".height","세로 길이 (cm)","any",true)}${number(p+".stitches","측정 코수 (코)","0.5",true)}${number(p+".rows","측정 단수 (단)","0.5",true)}</div><div class="actions">${check(p+".edge","테두리 코 포함")}${i?check(p+".same","첫 측정과 동일한 구간"):""}</div><div class="result" id="result-${i}">${result(m)}</div></section>`;
  }
  function photoPanel(){
   return `<section class="panel"><h2>편물 사진 <small>${draft.photos.length}/5</small></h2>${draft.photos.length?`<div class="photoStrip">${draft.photos.map((p,i)=>`<figure><button type="button" data-act="zoom:${i}"><img src="${esc(src(p))}" alt="사진 ${i+1} 확대"></button><figcaption>${i?"":"대표 · "}측정 ${draft.measurements.findIndex(m=>m.id===p.measurement)+1}</figcaption>${i?btn("cover:"+i,"대표 지정"):""}${btn("replace:"+i,"교체")}${btn("remove:"+i,"삭제")}</figure>`).join("")}</div>`:""}<p class="muted">JPG, PNG, WebP · 장당 8MB 이하</p>${draft.measurements.length>1?`<label class="field">추가할 사진의 측정 기록<select id="photoMeasurement">${draft.measurements.map((m,i)=>`<option value="${m.id}" ${i===draft.measurements.length-1?"selected":""}>측정 ${i+1} · ${esc(stateName(m))}</option>`).join("")}</select></label>`:""}<div class="actions">${draft.photos.length<5?btn("upload","사진 추가")+btn("camera","카메라 촬영"):""}</div><input id="file" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><input id="camera" type="file" accept="image/*" capture="environment" hidden></section>`;
  }
  function form(){
   main.innerHTML=head(draft.id?"게이지 수정":"새 게이지 등록")+`<form id="editor"><div class="layout"><aside>${photoPanel()}</aside><div><section class="panel"><h2>스와치 정보</h2><div class="fields">${input("name","스와치 이름",{extra:'placeholder="예: 겨울 가디건 스와치"'})}${select("pattern","뜨개 조직",["",...patterns])}</div><div class="sep"></div>${select("mode","실 구성",["단사","합사"])}${draft.yarns.map((y,i)=>`<div class="sep"></div><h3>실 ${i+1}</h3><div class="fields">${input("yarns."+i+".name","실 이름")}${draft.mode==="합사"?number("yarns."+i+".strands","합수","1",true):""}${input("yarns."+i+".color","컬러명·색상번호")}</div><details><summary>실 세부 정보</summary><div class="fields">${[["maker","제조사"],["weight","실 굵기"],["fiber","섬유 혼용률"]].map(([k,t])=>input("yarns."+i+"."+k,t)).join("")}</div></details>${draft.mode==="합사"&&draft.yarns.length>1?btn("dropYarn:"+i,"실 삭제"):""}`).join("")}${draft.mode==="합사"?btn("addYarn","＋ 실 추가"):""}<div class="sep"></div><label class="field">메모<textarea data-path="note" rows="2">${esc(draft.note)}</textarea></label></section>
   <section class="panel"><h2>바늘 정보</h2><div class="fields">${number("needle.size","바늘 크기 (mm)","any",false,'list="sizes"')}<datalist id="sizes">${opts([2,2.5,3,3.5,4,4.5,5,5.5,6,7,8,9,10],"")}</datalist>${select("needle.type","바늘 종류",["","줄바늘","장갑바늘","기타"])}${input("needle.brand","바늘 브랜드")}${input("needle.material","바늘 재질")}</div></section>${draft.measurements.map(measurement).join("")}</div></div><div class="savebar"><button class="primary">기록 저장</button></div></form>`;
  }
  const dl=pairs=>`<dl>${pairs.map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(value||"미지정")}</dd>`).join("")}</dl>`;
  function detail(r){
   main.innerHTML=head(r.name)+`<div class="layout"><div>${cover(r)}<div class="photoStrip">${r.photos.map((p,i)=>`<button data-act="zoom:${i}"><img src="${esc(src(p))}" alt="측정 ${r.measurements.findIndex(m=>m.id===p.measurement)+1} 사진 확대"></button>`).join("")}</div></div><div><div class="panel"><h2>최근 측정 게이지</h2><div class="result">${result(latest(r))}</div><div class="actions"><a class="button" href="#/gaugebook/edit/${r.id}">수정</a><a class="button primary" href="#/gaugebook/append/${r.id}">세탁 후 측정 추가</a>${btn("pickFrom:"+r.id,"다른 스와치와 비교")}${btn("delete:"+r.id,"삭제","danger")}</div></div><div class="panel"><h2>실과 바늘</h2>${dl([["뜨개 조직",r.pattern],["실 구성",r.mode],...r.yarns.map((y,i)=>[`실 ${i+1}`,[y.name,`${y.strands}합`,y.maker,y.color,y.weight,y.fiber].filter(Boolean).join(" · ")]),["바늘",[needle(r),r.needle.type,r.needle.brand,r.needle.material].filter(Boolean).join(" · ")],["메모",r.note]])}</div>${r.measurements.map((m,i)=>`<div class="panel"><h2>측정 ${i+1} · ${esc(stateName(m))}</h2>${dl([["측정일",m.date],["실측값",`${m.width} × ${m.height} cm · ${m.stitches}코 × ${m.rows}단`],["테두리 코",m.edge?"포함":"미포함"],...(i?[["첫 측정과 동일한 구간",m.same?"확인":"미확인"]]:[])])}<div class="result">${result(m)}</div></div>`).join("")}</div></div>`;
  }
  function comparison(list){
   const base=gauge(latest(list[0]));
   const delta=x=>(x>0?"+":"")+x.toFixed(1);
   main.innerHTML=head("스와치 비교")+`<p class="muted">각 스와치의 최근 측정값을 비교합니다. 차이는 첫 번째 스와치 기준입니다.</p><div class="compare" style="--cols:${list.length}">${list.map((r,i)=>{const m=latest(r),g=gauge(m);return `<article><a href="#/gaugebook/record/${r.id}">${cover(r)}<h3>${esc(r.name)}</h3></a>${dl([["실 · 합사",yarns(r)],["바늘 크기",needle(r)],["코 게이지 / 10cm",`${g.s.toFixed(1)}코`],["단 게이지 / 10cm",`${g.r.toFixed(1)}단`],["측정 상태",stateName(m)],["기준과 차이",i?`${delta(g.s-base.s)}코 · ${delta(g.r-base.r)}단`:"기준 스와치"]])}</article>`;}).join("")}</div>`;
  }
  const route=()=>location.hash.replace(/^#\/gaugebook\/?/,"").split("/");
  function render(){
   const [page,key]=route();
   draft=null;
   if(page==="new"){draft=fresh();form();}
   else if(page==="compare"){
    const list=[...new Set((key||"").split(","))].map(k=>records.find(r=>r.id===k)).filter(Boolean);
    if(list.length>=2&&list.length<=4)comparison(list);else library();
   }else if(["record","edit","append"].includes(page)){
    const r=records.find(r=>r.id===key);
    if(!r)main.innerHTML=head("기록을 열 수 없습니다")+`<p>계정과 기록 주소를 확인해 주세요.</p>`;
    else if(page==="record")detail(r);
    else {draft=JSON.parse(JSON.stringify(r));if(page==="append"){draft.measurements.push({...measure(),stage:"세탁 후 완전 건조"});}form();if(page==="append")$(".measurement:last-child")?.scrollIntoView();}
   }else library();
  }
  async function saveDraft(){
   if(busy)return;
   if(!draft.measurements.every(gauge))throw Error("0보다 큰 측정값을 입력해 주세요.");
   if(draft.needle.size && Number(draft.needle.size)<=0)throw Error("바늘 크기는 0보다 커야 합니다.");
   if(!draft.name.trim())draft.name="스와치 "+today();
   busy=true;
   try{
    const r=await saveRecord(draft);
    records=[r,...records.filter(x=>x.id!==r.id)].sort((a,b)=>b.created.localeCompare(a.created));
    location.hash="/gaugebook/record/"+r.id;toast("기록을 저장했습니다.");
   }finally{busy=false;}
  }
  root.addEventListener("submit",async e=>{
   e.preventDefault();
   try{
    if(e.target.id==="editor"){await saveDraft();return;}

   }catch(err){if(modal.open&&box.querySelector(".error"))box.querySelector(".error").textContent=err.message;else toast(err.message);}
  },{signal});
  let replacement=null;
  async function addPhotos(inputEl){
   const files=Array.from(inputEl.files);if(!files.length)return;
   const target=draft,idx=replacement;replacement=null;
   const mid=idx!==null?draft.photos[idx].measurement:($("#photoMeasurement")?.value||latest(draft).id);
   if((idx!==null&&files.length!==1)||(idx===null&&files.length+draft.photos.length>5))throw Error("사진은 기록당 최대 5장, 교체 시 1장만 선택해 주세요.");
   const incoming=[];
   for(const file of files){
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024**2)throw Error("JPG, PNG, WebP 형식의 8MB 이하 사진을 선택해 주세요.");
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("사진을 읽지 못했습니다."));reader.readAsDataURL(file);});
    incoming.push({data,measurement:mid});
   }
   if(draft!==target)return;
   if(idx===null)draft.photos.push(...incoming);else draft.photos[idx]=incoming[0];
   form();
  }
  root.addEventListener("input",e=>{
   const el=e.target;
   if(el.dataset.filter){filters[el.dataset.filter]=el.value;cards();return;}
   if(!el.dataset.path||!draft)return;
   const path=el.dataset.path.split("."),key=path.pop(),obj=path.reduce((o,k)=>o[k],draft);
   obj[key]=el.type==="checkbox"?el.checked:el.value;
   if(path[0]==="measurements")$("#result-"+path[1]).innerHTML=result(obj);
  },{signal});
  root.addEventListener("change",async e=>{
   const el=e.target;
   if(["camera","file"].includes(el.id)){try{await addPhotos(el);}catch(err){toast(err.message);}el.value="";return;}
   if(el.dataset.path==="mode"){
    if(draft.mode==="단사"&&draft.yarns.length>1&&!confirm("첫 번째 실만 남기고 단사로 변경할까요?"))draft.mode="합사";
    if(draft.mode==="단사"){draft.yarns=draft.yarns.slice(0,1);draft.yarns[0].strands=1;}
    if(draft.mode==="합사"&&draft.yarns.length===1)draft.yarns.push(yarn());
    form();
   }else if(el.dataset.path?.endsWith(".stage"))form();
  },{signal});
  root.addEventListener("click",async e=>{
   const el=e.target.closest("[data-act]");if(!el)return;
   const [act,k]=el.dataset.act.split(":");
   try{
    switch(act){
     case "close":modal.close();break;
     case "grid":
     case "list":listView=act==="list";library();$(`[data-act="${act}"]`).focus();break;
     case "pick":picking=!picking;selected=[];library();break;
     case "pickFrom":selected=[k];picking=true;location.hash="/gaugebook/";break;
     case "select":if(selected.includes(k))selected=selected.filter(x=>x!==k);else if(selected.length<4)selected.push(k);else toast("최대 4개까지 선택할 수 있습니다.");cards();break;
     case "compare":location.hash="/gaugebook/compare/"+selected.join(",");break;
     case "filters":filtersOpen=!filtersOpen;library();break;
     case "reset":filters={q:"",needle:"",pattern:"",mode:"",stage:"",sort:"new"};library();break;
     case "addYarn":draft.yarns.push(yarn());form();break;
     case "dropYarn":draft.yarns.splice(Number(k),1);form();break;
     case "upload":replacement=null;$("#file").multiple=true;$("#file").click();break;
     case "camera":replacement=null;$("#camera").click();break;
     case "replace":replacement=Number(k);$("#file").multiple=false;$("#file").click();break;
     case "cover":draft.photos.unshift(draft.photos.splice(Number(k),1)[0]);form();break;
     case "remove":draft.photos.splice(Number(k),1);form();break;
     case "zoom":{const r=draft||records.find(x=>x.id===route()[1]);show(`<img class="lightbox" src="${esc(src(r.photos[Number(k)]))}" alt="편물 확대 사진">`);break;}
     case "delete":if(confirm("이 스와치의 측정 기록과 사진을 모두 삭제할까요?")){await transact("readwrite",store=>store.delete(k));records=records.filter(r=>r.id!==k);selected=selected.filter(x=>x!==k);location.hash="/gaugebook/";toast("기록을 삭제했습니다.");}break;
    }
   }catch(err){toast(err.message);}
  },{signal});
  window.addEventListener("hashchange",()=>{
   if(!ready||!/^#\/gaugebook(?:\/|$)/.test(location.hash))return;
   modal.close();render();window.scrollTo(0,0);
   if(route()[0]==="append")$(".measurement:last-child")?.scrollIntoView();
  },{signal});
  (async()=>{
   try{
    records=(await transact("readonly",store=>store.getAll())).sort((a,b)=>b.created.localeCompare(a.created));
    if(!signal.aborted){ready=true;render();}
   }catch(err){if(!signal.aborted)main.textContent=err.message;}
  })();
  return ()=>{events.abort();clearTimeout(toastTimer);void database.then(db=>db.close(),()=>{});};
}
