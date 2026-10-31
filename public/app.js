'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const menu=document.querySelector('[data-menu]'),sidebar=document.querySelector('#sidebar'),overlay=document.querySelector('[data-overlay]');
 const toggle=()=>{sidebar?.classList.toggle('is-open');overlay?.classList.toggle('is-open');};
 menu?.addEventListener('click',toggle);overlay?.addEventListener('click',toggle);
 const role=document.querySelector('[data-role-select]');const updateRole=()=>{const student=document.querySelector('[data-student-fields]'),candidate=document.querySelector('[data-candidate-fields]');if(student)student.hidden=role.value!=='estudante';if(candidate)candidate.hidden=role.value!=='candidato';for(const el of student?.querySelectorAll('input')||[])el.required=role.value==='estudante';for(const el of candidate?.querySelectorAll('input')||[])el.required=role.value==='candidato';};
 role?.addEventListener('change',updateRole);if(role)updateRole();
 const dep=document.querySelector('[data-department]'),cat=document.querySelector('[data-category]');const updateCategories=()=>{if(!cat)return;const id=dep.value;let has=false;for(const option of cat.querySelectorAll('option[data-department-id]')){option.hidden=option.dataset.departmentId!==id;option.disabled=option.dataset.departmentId!==id;if(!option.hidden)has=true;}cat.value='';cat.querySelector('option')?.replaceChildren(document.createTextNode(has?'Seleccione a categoria':'Seleccione primeiro o departamento'));};
 dep?.addEventListener('change',updateCategories);if(dep)updateCategories();
 const template=document.querySelector('[data-template]'),textarea=document.querySelector('[data-reply-textarea]');template?.addEventListener('change',()=>{const selected=template.selectedOptions[0];if(selected?.dataset.body&&textarea){textarea.value=selected.dataset.body;textarea.focus();}});
 for(const form of document.querySelectorAll('[data-confirm]'))form.addEventListener('submit',e=>{if(!window.confirm(form.dataset.confirm||'Confirma esta operação?'))e.preventDefault();});
 document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());
});

// Menu do portal público, compatível com telemóveis e navegação por teclado.
(() => {
  const button=document.querySelector('[data-public-menu]');
  const nav=document.querySelector('#iv4-mobile-nav');
  if(!button||!nav)return;
  button.addEventListener('click',()=>{
    const expanded=button.getAttribute('aria-expanded')==='true';
    button.setAttribute('aria-expanded',String(!expanded));
    nav.hidden=expanded;
  });
  nav.addEventListener('click',event=>{
    if(event.target.closest('a')){nav.hidden=true;button.setAttribute('aria-expanded','false');}
  });
})();


// Marca na navegação pública a secção correspondente ao endereço actual.
(() => {
  const links=[...document.querySelectorAll('.m5-desktop-nav a')];
  const path=location.pathname.replace(/\/+$/,'')||'/';
  for(const link of links){
    const raw=link.getAttribute('href')||'';
    if(raw.includes('#'))continue;
    const target=raw.replace(/\/+$/,'')||'/';
    if(target===path)link.classList.add('is-current');
  }
})();

// Pré-inscrição em três passos, com validação progressiva e resumo simples.
(() => {
  const form=document.querySelector('[data-step-form]');
  if(!form)return;
  const panels=[...form.querySelectorAll('[data-step-panel]')];
  const stepItems=[...document.querySelectorAll('.admission-stepbar span')];
  let current=0;

  const reviewMap={
    full_name:'full_name',email:'email',phone:'phone',document_number:'document_number',province:'province',program_id:'program_id',study_shift:'study_shift',qualification:'qualification'
  };
  const formatValue=(name,value)=>{
    if(name==='program_id'){
      const select=form.querySelector('[name="program_id"]');
      return select?.selectedOptions?.[0]?.textContent?.trim() || '—';
    }
    if(name==='study_shift')return value==='pos_laboral'?'Pós-laboral':value==='laboral'?'Laboral':'—';
    return value?.trim()||'—';
  };
  const syncReview=()=>{
    Object.entries(reviewMap).forEach(([field,target])=>{
      const input=form.querySelector(`[name="${field}"]`);
      const holder=form.querySelector(`[data-review="${target}"]`);
      if(holder&&input)holder.textContent=formatValue(field,input.value);
    });
  };
  const showStep=(index)=>{
    current=index;
    panels.forEach((panel,pIndex)=>{panel.hidden=pIndex!==index;});
    stepItems.forEach((item,sIndex)=>{
      item.classList.toggle('is-active',sIndex===index);
      item.classList.toggle('is-done',sIndex<index);
    });
    if(index===2)syncReview();
    const heading=panels[index]?.querySelector('h2');
    if(heading)heading.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const validateStep=(index)=>{
    const fields=[...panels[index].querySelectorAll('input,select,textarea')].filter(el=>!['button','submit','hidden','file'].includes(el.type));
    for(const field of fields){
      if(!field.checkValidity()){
        field.reportValidity();
        field.focus();
        return false;
      }
    }
    return true;
  };
  form.addEventListener('click',event=>{
    const next=event.target.closest('[data-step-next]');
    const prev=event.target.closest('[data-step-prev]');
    if(next){
      event.preventDefault();
      if(validateStep(current)&&current<panels.length-1)showStep(current+1);
    }
    if(prev){
      event.preventDefault();
      if(current>0)showStep(current-1);
    }
  });
  form.addEventListener('change',syncReview);
  form.addEventListener('input',syncReview);
  syncReview();
  showStep(0);
})();
