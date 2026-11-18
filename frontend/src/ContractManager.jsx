import { useEffect, useState } from 'react';

const initial = {contractId:'',supplierId:'',startDate:'',endDate:'',valueCap:'',consumedValue:'0',comment:'Entered from signed PDF'};
const inputStyle = {width:'100%',padding:'10px',border:'1px solid #cbd5e1',borderRadius:8,boxSizing:'border-box'};

export default function ContractManager() {
  const [form,setForm] = useState(initial);
  const [lines,setLines] = useState([{itemCode:'',rate:''}]);
  const [contracts,setContracts] = useState([]);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const refresh = async () => {
    const response = await fetch('/api/contracts');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load contracts');
    setContracts(data.contracts || []);
  };
  useEffect(() => {refresh().catch(e => setError(e.message));},[]);
  const change = (key,value) => setForm(old => ({...old,[key]:value}));
  const changeLine = (index,key,value) => setLines(old => old.map((line,i) => i === index ? {...line,[key]:value} : line));
  async function submit(event) {
    event.preventDefault(); setBusy(true);setError('');setNotice('');
    try {
      const response = await fetch('/api/contracts', {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...form,source:'PDF_MANUAL',valueCap:Number(form.valueCap),consumedValue:Number(form.consumedValue),lines:lines.map(line => ({...line,rate:Number(line.rate)}))})
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save contract');
      setNotice(`Contract ${data.contract.contractId} saved successfully. Reprocess your CSV to apply it.`);
      setForm(initial);setLines([{itemCode:'',rate:''}]);await refresh();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <section style={{background:'white',padding:24,borderRadius:14,margin:'20px 0',border:'1px solid #e2e8f0'}}>
    <h2 style={{marginTop:0}}>Contract management</h2>
    <p>Add contracts that appear only in signed PDFs. Check the original PDF and enter its exact values; the system validates supplier and item codes.</p>
    <form onSubmit={submit}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        {[
          ['contractId','Contract ID','text'],['supplierId','Supplier ID','text'],['startDate','Start date','date'],['endDate','End date','date'],['valueCap','Contract ceiling (INR)','number'],['consumedValue','Already consumed (INR)','number']
        ].map(([key,label,type]) => <label key={key} style={{fontSize:14,fontWeight:600}}>{label}<input required type={type} min={type==='number'?'0':undefined} step={type==='number'?'0.0001':undefined} value={form[key]} onChange={e=>change(key,e.target.value)} style={{...inputStyle,marginTop:5}}/></label>)}
      </div>
      <h3>Contract item lines</h3>
      {lines.map((line,index) => <div key={index} style={{display:'flex',gap:10,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
        <input required placeholder="Item code (e.g. ITM-1037)" value={line.itemCode} onChange={e=>changeLine(index,'itemCode',e.target.value)} style={{...inputStyle,width:240}}/>
        <input required type="number" min="0.0001" step="0.0001" placeholder="Unit rate INR" value={line.rate} onChange={e=>changeLine(index,'rate',e.target.value)} style={{...inputStyle,width:170}}/>
        {lines.length>1 && <button type="button" onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}>Remove</button>}
      </div>)}
      <button type="button" onClick={()=>setLines(old=>[...old,{itemCode:'',rate:''}])} style={{marginRight:12}}>+ Add item line</button>
      <div style={{margin:'16px 0'}}><label style={{fontSize:14,fontWeight:600}}>Audit note<input value={form.comment} onChange={e=>change('comment',e.target.value)} style={{...inputStyle,marginTop:5}}/></label></div>
      <button type="submit" disabled={busy} style={{padding:'11px 20px',background:'#0f766e',color:'white',border:0,borderRadius:8,cursor:'pointer'}}>{busy?'Saving...':'Save signed contract'}</button>
    </form>
    {error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {notice && <p role="status" style={{color:'#047857'}}>{notice}</p>}
    <h3>Contracts in database ({contracts.length})</h3>
    <div style={{maxHeight:280,overflow:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Contract','Supplier','Source','Items','Valid from','Valid to'].map(h=><th key={h} style={{textAlign:'left',padding:8,borderBottom:'1px solid #cbd5e1'}}>{h}</th>)}</tr></thead><tbody>
        {contracts.map(c=><tr key={c.contractId}><td style={{padding:8}}>{c.contractId}</td><td>{c.supplierId}</td><td>{c.source}</td><td>{c.lines?.length||0}</td><td>{String(c.startDate).slice(0,10)}</td><td>{String(c.endDate).slice(0,10)}</td></tr>)}
      </tbody></table>
    </div>
  </section>;
}
