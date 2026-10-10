import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc,setDoc,onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyAeiTgv3rqhlmlQAkZbyhUm-Kl8OFAkYKM",
  authDomain:"splitsmart-390c3.firebaseapp.com",
  projectId:"splitsmart-390c3",
  storageBucket:"splitsmart-390c3.firebasestorage.app",
  messagingSenderId:"1014414136690",
  appId:"1:1014414136690:web:afa91ffcea5ce87b4ab9eb"
};

const app=initializeApp(firebaseConfig);
const db=getFirestore(app);
const groupRef=doc(db, "groups", "demo");

let people=[];
let expenses=[];

const esc=(s)=>String(s).replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

onSnapshot(
  groupRef,
  (snap) => {
    if (snap.exists()) {
      people=snap.data().people || [];
      expenses=snap.data().expenses || [];
    }
    render();
  },
  (err) => {
    console.error("Firestore listen error:",err);
    const status=document.getElementById("scanStatus");
    status.textContent="Can't reach the database: "+err.message;
  }
);

async function save() {
  try {
    await setDoc(groupRef, {people,expenses});
  } catch(err){
    console.error(err);
    alert("Couldn't save: " +err.message);
  }
}

function addPerson(){
  const input=document.getElementById("personName");
  const name=input.value.trim();
  if(name=== "")return;
  if(!people.some(p =>p.toLowerCase()===name.toLowerCase()))people.push(name);
  input.value="";
  save();
}

function addExpense(){
  const desc=document.getElementById("desc").value.trim();
  const amount=parseFloat(document.getElementById("amount").value);
  const payer=document.getElementById("payer").value;
  if (desc==="" || isNaN(amount) || amount <= 0 || payer==="") return;
  expenses.push({desc,amount,payer});
  document.getElementById("desc").value="";
  document.getElementById("amount").value="";
  save();
}

function deleteExpense(index){
  expenses.splice(index, 1);
  save();
}

function resetHistory(){
  if (!confirm("Clear all expenses? The people in the group will stay."))return;
  expenses=[];
  save();
}

function resetAll(){
  if (!confirm("Delete all people and expenses for everyone in this group?"))return;
  people=[];
  expenses=[];
  save();
}

function findTotal(text){
  const getNumbers=(s)=>
    (s.match(/\d[\d,]*\.\d{1,2}|\d[\d,]*/g) || [])
      .map(x=>parseFloat(x.replace(/,/g, "")))
      .filter(n=>!isNaN(n) && n > 0 && n < 100000);

  const lines=text.split("\n").map(l=>l.trim()).filter(l=>l);

  const skip=/sub\s*-?\s*total|total\s*(qty|quantity|items?|tax|gst|cgst|sgst|discount)|round/i;

  const keywordGroups=[
    /grand\s*total|net\s*payable|amount\s*payable|bill\s*amount|net\s*amount|total\s*amount/i,
    /total/i
  ];

  for (const pattern of keywordGroups){
    const found=[];
    lines.forEach((line, i)=>{
      if (pattern.test(line) && !skip.test(line)){
        let nums=getNumbers(line);
        if (nums.length===0 && lines[i + 1])nums=getNumbers(lines[i + 1]);
        found.push(...nums);
      }
    });
    if (found.length)return Math.max(...found);
  }

  const all=[];
  lines.forEach(line=>{
    const isDate=/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(line);
    const isNoise=/gst|phone|ph[:.]|tel|mob|invoice|bill\s*no/i.test(line);
    if (!isDate && !isNoise)all.push(...getNumbers(line));
  });
  return all.length ? Math.max(...all):null;
}


function fixRupeeMisread(total,text) {
  const decimals=(text.match(/\d[\d,]*\.\d{2}/g) || [])
    .map(x=>parseFloat(x.replace(/,/g, "")));
  const idx=decimals.findIndex(n=>Math.abs(n-total)<0.01);
  if(idx!==-1)decimals.splice(idx,1);

  const sumOthers=decimals.reduce((a,b)=>a+b,0);
  const maxOther=decimals.length?Math.max(...decimals):0;

  if(sumOthers>0&&total>sumOthers){
    const stripped=parseFloat(String(total).replace(/^\d/,""));
    if(!isNaN(stripped)&&stripped>=maxOther&&stripped<=sumOthers)return stripped;
  }

  const tokens=text.match(/\d[\d,]*\.\d{2}/g) || [];
  if(tokens.length>=3){
    const counts={};
    tokens.forEach(t=>{counts[t[0]]=(counts[t[0]] || 0)+1;});
    const[digit,n]= bject.entries(counts).sort((a,b)=>b[1]-a[1])[0];

    if (["2","3","7"].includes(digit)&&n/tokens.length>=0.7&&String(total)[0]===digit){
      const strippedTotal=parseFloat(String(total).slice(1));
      const others =tokens
        .map(t=>parseFloat(t.replace(/,/g,"").slice(1)))
        .filter(x=>!isNaN(x)&&Math.abs(x-strippedTotal)>0.01);
      const maxStripped=others.length?Math.max(...others):0;
      if(!isNaN(strippedTotal)&&strippedTotal>=maxStripped)return strippedTotal;
    }
  }
  return total;
}

const RUPEE_MISREADS=["2","3","7"];

const MISREAD_MODES=(()=>{
  const modes=[[]];
  for(let mask=1;mask<8;mask++){
    modes.push(RUPEE_MISREADS.filter((_,i)=>mask&(1<<i)));
  }
  return modes.sort((a,b)=>a.length-b.length);
})();

function readAmount(raw,mode){
  const clean=raw.replace(/,/g,"");
  const intDigits=clean.split(".")[0].length;
  const text=mode.includes(clean[0])&&intDigits>=2?clean.slice(1):clean;
  return parseFloat(text);
}

function canMakeSum(values,target){
  const goal=Math.round(target*100);
  let reach=new Set([0]);
  for (const v of values){
    const c=Math.round(v * 100);
    if(c<= 0 || c>goal)continue;
    const next=new Set(reach);
    for(const s of reach) if(s+c<=goal) next.add(s+c);
    reach=next;
    if (reach.has(goal))return true;
    if (reach.size>200000)return false; 
  }
  return false;
}

function detectTotal(text){
  const lines=text.split("\n").map(l=>l.trim()).filter(l=>l);
  const skip = /sub\s*-?\s*total|total\s*(qty|quantity|items?|tax|gst|cgst|sgst|discount)|round/i;
  const keywordGroups = [
    /grand\s*total|net\s*payable|amount\s*payable|bill\s*amount|net\s*amount|total\s*amount/i,
    /total/i
  ];

  const amounts=[];
  lines.forEach((line,li)=>{
    (line.match(/\d[\d,]*\.\d{2}(?!\d)/g) || []).forEach(raw=>amounts.push({raw,line:li}));
  });
  if(amounts.length<3)return null;

  const candidates=[];
  const seen=new Set();
  keywordGroups.forEach(pattern=>{
    for(let li=lines.length-1;li>=0;li--){ 
      if (!pattern.test(lines[li]) || skip.test(lines[li]))continue;
      let at=li;
      let found=lines[at].match(/\d[\d,]*\.\d{1,2}(?!\d)/g);
      if(!found && lines[li + 1]) { at = li + 1; found = lines[at].match(/\d[\d,]*\.\d{1,2}(?!\d)/g);}
      (found || []).forEach(raw=>{
        const key=at+"|"+raw;
        if(!seen.has(key)){seen.add(key);candidates.push({raw,line:at});}
      });
    }
  });

  const check=(cand,mode)=>{
    const total=readAmount(cand.raw,mode);
    if (!(total>0))return null;
    const others=amounts
      .filter(a=>a.line !== cand.line)
      .map(a=>readAmount(a.raw,mode))
      .filter(v=>v>0 && Math.abs(v-total)>0.005) 
      .slice(0,25);
    return canMakeSum(others,total)?total:null;
  };

  for(const mode of MISREAD_MODES){
    for(const cand of candidates) {
      const total=check(cand,mode);
      if(total)return{value:total,verified:true};
    }
  }

  if(candidates.length===0){
    for(const mode of MISREAD_MODES){
      const biggestFirst=[...amounts].sort((a,b)=>readAmount(b.raw,mode)-readAmount(a.raw,mode));
      for(const cand of biggestFirst){
        const total=check(cand,mode);
        if(total)return{value:total,verified:false};
      }
    }
  }
  return null;
}

async function scanReceipt(){
  const file=document.getElementById("receiptFile").files[0];
  const status=document.getElementById("scanStatus");
  if(!file){ status.textContent="Choose a receipt photo first.";return;}
  if(typeof Tesseract==="undefined"){
    status.textContent="The scanner didn't load. Check your internet connection and refresh.";
    return;
  }

  status.textContent="Reading receipt...(10-20 seconds)";
  try{
    const result=await Tesseract.recognize(file,"eng");
    const text=result.data.text;
    console.log("OCR text:",text);

    let found=detectTotal(text);
    if(!found){
      let guess=findTotal(text);
      if(guess)guess=fixRupeeMisread(guess,text);
      if(guess)found={value:guess,verified:false};
    }
    const total=found?found.value:null;
    const firstLine=text.split("\n").map(l=>l.trim()).find(l =>/[A-Za-z]{3,}/.test(l)) || "Receipt";

    document.getElementById("desc").value=firstLine;
    if(total)document.getElementById("amount").value=total.toFixed(2);

    if(!total){
      status.textContent="Couldn't find a total.Type the amount yourself.";
    }else if(found.verified){
      status.textContent=`Found total₹${total.toFixed(2)}(the other amounts on the bill add up to it).Choose who paid,then click Add expense.`;
    }else {
      status.textContent=`Best guess:₹${total.toFixed(2)}.I couldn't confirm it,so compare it with your receipt before clicking Add expense.`;
    }
  }catch(err){
    console.error(err);
    status.textContent="Scan failed.Try a clearer photo.";
  }
}

window.addPerson=addPerson;
window.addExpense=addExpense;
window.scanReceipt=scanReceipt;
window.deleteExpense=deleteExpense;
window.resetAll=resetAll;
window.resetHistory=resetHistory;

function calculateSettlements(){
  if(people.length===0)return[];

  const balance={};
  people.forEach(p=>balance[p]=0);

  expenses.forEach(e=>{
    if(!(e.payer in balance))return;
    const share=e.amount/people.length;
    balance[e.payer]+=e.amount;
    people.forEach(p=>balance[p]-=share);
  });

  const debtors=[];
  const creditors=[];
  for(const p of people){
    const b=Math.round(balance[p]*100)/100;
    if(b<0)debtors.push({name:p,amount:-b});
    if(b>0)creditors.push({name:p,amount:b});
  }

  const result=[];
  let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){
    const pay=Math.min(debtors[i].amount,creditors[j].amount);
    result.push({from:debtors[i].name,to:creditors[j].name,amount:pay});
    debtors[i].amount-=pay;
    creditors[j].amount-=pay;
    if(debtors[i].amount<0.01)i++;
    if(creditors[j].amount<0.01)j++;
  }
  return result;
}

function render(){
  document.getElementById("peopleList").innerHTML=
    people.map(p=>`<li>${esc(p)}</li>`).join("");

  const payerSelect=document.getElementById("payer");
  const previous=payerSelect.value;
  payerSelect.innerHTML=people.length
    ?people.map(p=>`<option value="${esc(p)}">${esc(p)}paid</option>`).join("")
    :`<option value="">Add people first</option>`;
  if(people.includes(previous))payerSelect.value=previous;

  document.getElementById("historyHead").hidden=expenses.length===0;

  document.getElementById("expenseList").innerHTML=
    expenses.map((e,i)=> `<li>{esc(e.desc)}:₹${Number(e.amount).toFixed(2)}(paid by ${esc(e.payer)})
      <button type="button"class="del-btn" onclick="deleteExpense(${i})"aria-label="Delete expense ${esc(e.desc)}">✕</button></li>`).join("");

  const settlements=calculateSettlements();
  const list=document.getElementById("settlements");

  if (people.length===0){
    list.innerHTML="<li>Add people to get started.</li>";
    return;
  }

  if(settlements.length===0){
    list.innerHTML=expenses.length
      ?"<li>All settled!</li>"
      :"<li>No expenses yet.Add one above.</li>";
    return;
  }

  list.innerHTML=settlements.map(s=>
    `<li>${esc(s.from)}pays${esc(s.to)}₹${s.amount.toFixed(2)}</li>`).join("");
}