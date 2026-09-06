import { useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardList, Clock3, Download, FileImage, FileText, Filter, HeartPulse,
  LayoutDashboard, Link2, ListFilter, LockKeyhole, LogOut, Menu, MoreHorizontal, PanelLeft,
  Pencil, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Stethoscope, Trash2,
  Upload, UserRound, Users, X, Zap
} from 'lucide-react';
import {
  Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams
} from 'wouter';

type Patient = { id:string; name:string; initials:string; age:number; sex:string; village:string; phone:string; risk:string; lastScreening:string; status:string; };
type FundusImage = { id:string; eye:'OD'|'OS'; name:string; size:string; quality:string; };
type MedicalReport = { id:string; name:string; type:string; date:string; size:string; };
type LesionFinding = { id:string; title:string; confidence:string; location:string; note:string; };
type AIResult = { summary:string; level:string; score:string; findings:LesionFinding[]; };
type DoctorReview = { decision:string; note:string; date:string; };
type FollowUp = { id:string; patient:string; reason:string; due:string; urgency:'Due today'|'This week'|'Upcoming'|'Overdue'; };
type Screening = { id:string; patientId:string; date:string; status:string; quality:string; result:string; images:FundusImage[]; ai:AIResult; review?:DoctorReview; };

const initialPatients: Patient[] = [
  { id:'pt-001', name:'Maya Thompson', initials:'MT', age:58, sex:'Female', village:'Kijani North', phone:'+254 712 449 208', risk:'Moderate', lastScreening:'18 Jun 2026', status:'Review pending' },
  { id:'pt-002', name:'Samuel Otieno', initials:'SO', age:64, sex:'Male', village:'Lusaka Ridge', phone:'+254 728 903 441', risk:'High', lastScreening:'17 Jun 2026', status:'Reviewed' },
  { id:'pt-003', name:'Amina Wekesa', initials:'AW', age:46, sex:'Female', village:'Kijani North', phone:'+254 701 235 776', risk:'Low', lastScreening:'15 Jun 2026', status:'Reviewed' },
  { id:'pt-004', name:'Joseph Njoroge', initials:'JN', age:71, sex:'Male', village:'Mtoni Valley', phone:'+254 740 618 009', risk:'Moderate', lastScreening:'12 Jun 2026', status:'Follow-up due' },
  { id:'pt-005', name:'Grace Atieno', initials:'GA', age:52, sex:'Female', village:'Mtoni Valley', phone:'+254 711 765 102', risk:'Low', lastScreening:'08 Jun 2026', status:'Reviewed' },
];
const demoReports: MedicalReport[] = [
  { id:'r1', name:'Maya Thompson — Referral note', type:'Referral', date:'18 Jun 2026', size:'248 KB' },
  { id:'r2', name:'Samuel Otieno — HbA1c panel', type:'Lab results', date:'17 Jun 2026', size:'182 KB' },
  { id:'r3', name:'Amina Wekesa — Clinical notes', type:'Clinical notes', date:'15 Jun 2026', size:'96 KB' },
  { id:'r4', name:'Q2 Screening protocol', type:'Protocol', date:'01 Jun 2026', size:'1.4 MB' },
];
const demoFollowUps: FollowUp[] = [
  { id:'f1', patient:'Joseph Njoroge', reason:'Repeat image after quality concern', due:'20 Jun 2026', urgency:'Due today' },
  { id:'f2', patient:'Maya Thompson', reason:'Clinician review of flagged screening', due:'21 Jun 2026', urgency:'This week' },
  { id:'f3', patient:'Samuel Otieno', reason:'Refer to ophthalmology', due:'24 Jun 2026', urgency:'This week' },
  { id:'f4', patient:'Grace Atieno', reason:'Annual screening', due:'16 Jul 2026', urgency:'Upcoming' },
  { id:'f5', patient:'Amina Wekesa', reason:'Confirm referral receipt', due:'14 Jun 2026', urgency:'Overdue' },
];
const demoScreening: Screening = {
  id:'scr-1048', patientId:'pt-001', date:'18 Jun 2026', status:'Review pending', quality:'Good',
  result:'Refer for review', images:[{id:'im1',eye:'OD',name:'right-eye.jpg',size:'2.8 MB',quality:'Good'},{id:'im2',eye:'OS',name:'left-eye.jpg',size:'2.6 MB',quality:'Good'}],
  ai:{ summary:'Prototype indicators suggest a finding that merits clinician review.', level:'Review suggested', score:'0.78', findings:[
    {id:'lf1',title:'Possible microaneurysm cluster',confidence:'78%',location:'Temporal macula · OD',note:'Small red-dot pattern detected within the macular region.'},
    {id:'lf2',title:'Image quality acceptable',confidence:'92%',location:'Both eyes',note:'Disc and macula are visible with adequate illumination.'}
  ]}
};

const navItems = [
  { href:'/dashboard', label:'Overview', icon:LayoutDashboard },
  { href:'/patients', label:'Patients', icon:Users },
  { href:'/screening/new', label:'New screening', icon:Plus },
  { href:'/reports', label:'Reports', icon:FileText },
  { href:'/follow-ups', label:'Follow-ups', icon:CalendarDays },
];
const utilityItems = [
  { href:'/settings', label:'Settings', icon:Settings2 },
];

function initials(name:string) { return name.split(' ').map((x) => x[0]).slice(0,2).join(''); }
function cn(...parts:(string|false|undefined)[]) { return parts.filter(Boolean).join(' '); }

function AppShell({ children, title }:{ children:ReactNode; title:string }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  return <div className="app-shell">
    <aside className={cn('sidebar', open && 'open')}>
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className="eyebrow nav-section">Workspace</div>
      <nav aria-label="Primary navigation">
        {navItems.map(({href,label,icon:Icon}) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ','-')}`} className={cn('nav-item', location === href || (href === '/patients' && location.startsWith('/patients/')) ? 'active' : '')}><Icon size={16}/><span>{label}</span></Link>)}
      </nav>
      <div className="eyebrow nav-section">Manage</div>
      <nav>{utilityItems.map(({href,label,icon:Icon}) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={cn('nav-item',location.startsWith(href) && 'active')}><Icon size={16}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="demo-badge"><span className="status-dot"/> Demo workspace</div><div className="tiny" style={{color:'hsl(201 14% 59%)',marginTop:7}}>No patient data is stored</div></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setOpen(!open)}><Menu size={18}/></button>
        <div className="topbar-title">{title}</div>
        <div className="topbar-actions"><div className="notice" style={{padding:'7px 10px',gap:7}}><ShieldCheck size={14}/><span>AI assists. Doctors decide.</span></div><button className="icon-button" aria-label="Notifications" data-testid="button-notifications" onClick={()=>alert('No new notifications in this demo workspace.')}><Bell size={16}/></button><div className="avatar" title="Dr. Nia Kamau">NK</div></div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const [email,setEmail] = useState('nia.kamau@kijani.health');
  const [password,setPassword] = useState('prototype');
  return <div className="login-page">
    <section className="login-art">
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className="login-art-content"><div className="eyebrow" style={{color:'hsl(174 55% 65%)'}}>Retinal screening workspace</div><h1>Clarity for every clinical decision.</h1><p>Upload the images you already have. Keep context close. Let prototype indicators support — never replace — your clinical judgement.</p></div>
      <div className="small" style={{color:'hsl(201 14% 59%)'}}>SIH 2026 prototype · fictional demo data</div>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={(e)=>{e.preventDefault();setLocation('/dashboard')}}>
        <div className="login-crest"><HeartPulse size={20} color="hsl(var(--primary))"/><span className="eyebrow">Kijani health network</span></div>
        <h2>Welcome back</h2><p className="subtitle">Sign in to your screening workspace.</p>
        <div className="field" style={{marginTop:26}}><label htmlFor="email">Work email</label><input id="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} data-testid="input-login-email"/></div>
        <div className="field" style={{marginTop:15}}><label htmlFor="password">Password</label><input id="password" type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} data-testid="input-login-password"/></div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:22}} data-testid="button-sign-in">Sign in <ArrowRight size={15}/></button>
        <button type="button" className="btn btn-secondary" style={{width:'100%',marginTop:9}} data-testid="button-demo-mode" onClick={()=>setLocation('/dashboard')}>Enter Demo Mode</button>
        <div className="login-note"><p className="tiny muted">This is a prototype. Do not enter real patient information. No authentication or data storage is enabled.</p></div>
      </form>
    </section>
  </div>;
}

function Dashboard({patients, screenings}:{patients:Patient[]; screenings:Screening[]}) {
  const [,setLocation] = useLocation();
  const reviewed = screenings.filter(s=>s.review).length;
  const activityItems:{title:string;detail:string;time:string;icon:typeof AlertCircle}[] = [
    {title:'Screening ready for review',detail:'Maya Thompson · OD / OS',time:'12 min ago',icon:AlertCircle},
    {title:'Clinical decision recorded',detail:'Samuel Otieno · Refer',time:'Yesterday',icon:CheckCircle2},
    {title:'New report added',detail:'Amina Wekesa · Clinical notes',time:'15 Jun',icon:FileText},
  ];
  return <AppShell title="Overview"><div className="page-heading"><div><div className="eyebrow">Thursday · 18 June 2026</div><h1 style={{marginTop:8}}>Good morning, Dr. Kamau</h1><p className="subtitle">A focused view of your rural screening work.</p></div><button className="btn btn-primary" data-testid="button-start-screening" onClick={()=>setLocation('/screening/new')}><Plus size={15}/> New screening</button></div>
    <div className="notice"><ShieldCheck size={16}/><div><strong>Prototype workspace</strong> · All indicators and records below are fictional demo output for SIH 2026. AI assists. Doctors decide.</div></div>
    <div className="grid grid-4" style={{marginTop:17}}>{[['Active patients',patients.length,'Across 3 communities'],['Needs review','12','4 added today'],['Follow-ups due','5','1 overdue'],['Reviewed this week',reviewed+18,'Clinical decisions saved']].map(([label,value,meta],i)=><div className="card metric" key={String(label)}><div className="eyebrow">{label}</div><div className={cn('metric-value',i===1||i===2?'metric-accent':'')}>{value}</div><div className="metric-meta">{meta}</div></div>)}</div>
    <div className="grid grid-2" style={{marginTop:28}}><div className="card card-pad"><div className="section-row" style={{marginTop:0}}><h2>Recent activity</h2><Link className="link" href="/screening/new" data-testid="link-view-all-activity">Start screening</Link></div>
      {activityItems.map(({title,detail,time,icon:Icon})=><div className="activity-row" key={title}><div className="activity-icon"><Icon size={15}/></div><div className="row-grow"><div className="row-title">{title}</div><div className="row-detail">{detail}</div></div><div className="row-end muted tiny">{time}</div></div>)}
    </div><div className="card card-pad"><div className="section-row" style={{marginTop:0}}><h2>Follow-up pulse</h2><Link className="link" href="/follow-ups" data-testid="link-view-follow-ups">View all</Link></div>
      {demoFollowUps.slice(0,4).map(f=><div className="follow-row" key={f.id}><div className={cn('activity-icon',f.urgency==='Overdue'?'':'')}><Clock3 size={15}/></div><div className="row-grow"><div className="row-title">{f.patient}</div><div className="row-detail">{f.reason}</div></div><span className={cn('pill',f.urgency==='Overdue'?'pill-red':f.urgency==='Due today'?'pill-amber':'pill-slate')}>{f.urgency}</span></div>)}
    </div></div>
  </AppShell>;
}

function Patients({patients}:{patients:Patient[]}) {
  const [query,setQuery]=useState(''); const [risk,setRisk]=useState('All risk levels');
  const filtered=patients.filter(p=>(p.name+p.village).toLowerCase().includes(query.toLowerCase())&&(risk==='All risk levels'||p.risk===risk));
  return <AppShell title="Patients"><div className="page-heading"><div><div className="eyebrow">Patient registry</div><h1 style={{marginTop:8}}>Patients</h1><p className="subtitle">Context for every screening, kept in one place.</p></div><Link className="btn btn-primary" href="/patients/new" data-testid="link-register-patient"><Plus size={15}/> Register patient</Link></div>
    <div className="card card-pad"><div className="toolbar"><div className="search"><Search size={15}/><input className="input" placeholder="Search name or community" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-patients"/></div><select className="select" value={risk} onChange={e=>setRisk(e.target.value)} aria-label="Filter by risk" data-testid="select-patient-risk"><option>All risk levels</option><option>Low</option><option>Moderate</option><option>High</option></select><button className="btn btn-secondary" onClick={()=>setRisk('All risk levels')} data-testid="button-filter-patients"><SlidersHorizontal size={14}/> Reset filters</button></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Patient</th><th>Community</th><th>Last screening</th><th>Risk</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><Link className="patient-cell" href={`/patients/${p.id}`} data-testid={`link-patient-${p.id}`}><span className="initials">{p.initials}</span><span><strong>{p.name}</strong><br/><span className="tiny muted">{p.age} yrs · {p.sex}</span></span></Link></td><td>{p.village}</td><td>{p.lastScreening}</td><td><span className={cn('pill',p.risk==='High'?'pill-red':p.risk==='Moderate'?'pill-amber':'pill-teal')}>{p.risk}</span></td><td><span className="tiny">{p.status}</span></td><td><Link className="link" href={`/patients/${p.id}`} data-testid={`link-open-patient-${p.id}`}>Open</Link></td></tr>)}</tbody></table></div>{filtered.length===0&&<div className="empty"><Users size={25}/><p>No patients match that search.</p></div>}</div>
  </AppShell>;
}

function PatientNew() {
  const [,setLocation]=useLocation(); const [step,setStep]=useState(1); const [done,setDone]=useState(false);
  const [form,setForm]=useState({first:'Lilian',last:'Mwangi',dob:'1964-09-22',sex:'Female',community:'Kijani North',phone:'+254 700 000 000',consent:true});
  const update=(key:string,value:string|boolean)=>setForm({...form,[key]:value});
  if(done) return <AppShell title="Register patient"><div className="card success"><div className="success-mark"><Check size={25}/></div><div className="eyebrow">Registration complete</div><h1 style={{fontSize:28,marginTop:9}}>Patient added safely.</h1><p className="subtitle">Lilian Mwangi is ready for her first screening in this demo workspace.</p><div style={{display:'flex',justifyContent:'center',gap:9,marginTop:24}}><button className="btn btn-secondary" onClick={()=>setDone(false)} data-testid="button-register-another">Register another</button><button className="btn btn-primary" onClick={()=>setLocation('/patients/pt-001')} data-testid="button-open-new-patient">Open patient profile <ArrowRight size={14}/></button></div></div></AppShell>;
  const steps=['Identity','Contact','Context','Consent','Review','Complete'];
  return <AppShell title="Register patient"><div className="wizard-card"><div className="page-heading"><div><div className="eyebrow">Patient registry · New</div><h1 style={{marginTop:8}}>Register a patient</h1><p className="subtitle">A short, local-first workflow for screening teams.</p></div></div><div className="card card-pad"><div className="progress-line">{steps.map((s,i)=><div key={s} style={{display:'contents'}}><div className={cn('step',i+1===step&&'active',i+1<step&&'done')}><span className="step-dot">{i+1<step?<Check size={12}/>:i+1}</span><span className="step-label">{s}</span></div>{i<steps.length-1&&<span className="step-line"/>}</div>)}</div>
      {step===1&&<div><h2>Patient identity</h2><p className="subtitle">Use the name shown on the patient’s existing records.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>First name</label><input className="input" value={form.first} onChange={e=>update('first',e.target.value)} data-testid="input-patient-first-name"/></div><div className="field"><label>Last name</label><input className="input" value={form.last} onChange={e=>update('last',e.target.value)} data-testid="input-patient-last-name"/></div><div className="field"><label>Date of birth</label><input type="date" className="input" value={form.dob} onChange={e=>update('dob',e.target.value)} data-testid="input-patient-dob"/></div><div className="field"><label>Sex</label><select className="input" value={form.sex} onChange={e=>update('sex',e.target.value)} data-testid="select-patient-sex"><option>Female</option><option>Male</option><option>Not recorded</option></select></div></div></div>}
      {step===2&&<div><h2>Contact details</h2><p className="subtitle">Optional contact information helps the team complete follow-ups.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>Phone number</label><input className="input" value={form.phone} onChange={e=>update('phone',e.target.value)} data-testid="input-patient-phone"/></div><div className="field"><label>Preferred language</label><select className="input"><option>English</option><option>Kiswahili</option><option>Local language</option></select></div></div></div>}
      {step===3&&<div><h2>Care context</h2><p className="subtitle">Add the context a clinician should see before reviewing an image.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>Community or village</label><input className="input" value={form.community} onChange={e=>update('community',e.target.value)} data-testid="input-patient-community"/></div><div className="field"><label>Known risk factors</label><select className="input"><option>Type 2 diabetes</option><option>Hypertension</option><option>None recorded</option></select></div><div className="field full"><label>Clinical note</label><textarea className="textarea" placeholder="Optional context for the care team" data-testid="textarea-patient-note"/></div></div></div>}
      {step===4&&<div><h2>Consent & safety</h2><p className="subtitle">This demo records a consent acknowledgement only. No real data is stored.</p><label className="check" style={{marginTop:24}}><input type="checkbox" checked={form.consent} onChange={e=>update('consent',e.target.checked)}/><span>I confirm the patient has provided consent for retinal screening and understands that prototype output does not constitute a diagnosis.</span></label><div className="notice" style={{marginTop:20}}><LockKeyhole size={15}/><span>Offline-first note: this prototype is designed to keep workflow usable when connectivity is limited.</span></div></div>}
      {step===5&&<div><h2>Review registration</h2><p className="subtitle">Check the details before creating the patient record.</p><div className="card" style={{marginTop:20,padding:15,background:'hsl(var(--muted)/.42)'}}>{[['Name',`${form.first} ${form.last}`],['Date of birth',form.dob],['Sex',form.sex],['Community',form.community],['Phone',form.phone]].map(([a,b])=><div className="setting-row" key={a}><span className="muted small">{a}</span><strong className="small">{b}</strong></div>)}</div></div>}
      {step===6&&<div className="empty"><CheckCircle2 size={28}/><h2>Ready to create</h2><p className="subtitle">One final click will add this fictional demo patient.</p></div>}
       <div className="wizard-footer">{step>1?<button className="btn btn-secondary" onClick={()=>setStep(step-1)} data-testid="button-wizard-back"><ArrowLeft size={14}/> Back</button>:<span/>}{step<6?<button className="btn btn-primary" disabled={step===4&&!form.consent} onClick={()=>setStep(step+1)} data-testid="button-wizard-next">Continue <ArrowRight size={14}/></button>:<button className="btn btn-primary" onClick={()=>setDone(true)} data-testid="button-complete-registration"><Check size={14}/> Create patient</button>}</div>
     </div></div></AppShell>
}

function PatientProfile({patients,screenings}:{patients:Patient[];screenings:Screening[]}) {
  const {id}=useParams(); const [,setLocation]=useLocation(); const patient=patients.find(p=>p.id===id)||patients[0]; const [tab,setTab]=useState('Overview'); const patientScreenings=screenings.filter(s=>s.patientId===patient.id);
  return <AppShell title="Patient profile"><Link className="link" href="/patients" data-testid="link-back-patients"><ArrowLeft size={13} style={{verticalAlign:'-2px'}}/> All patients</Link><div className="card profile-hero" style={{marginTop:14}}><div className="profile-id"><div className="profile-initials">{patient.initials}</div><div><div className="eyebrow">Patient profile</div><h1 style={{fontSize:27,marginTop:5}}>{patient.name}</h1><p className="subtitle">{patient.age} years · {patient.sex} · {patient.village}</p></div></div><div style={{display:'flex',gap:9}}><span className={cn('pill',patient.risk==='High'?'pill-red':patient.risk==='Moderate'?'pill-amber':'pill-teal')}>{patient.risk} risk</span><button className="btn btn-primary" onClick={()=>setLocation('/screening/new')} data-testid="button-new-patient-screening"><Plus size={14}/> New screening</button></div></div>
    <div className="tabbar">{['Overview','Screenings','Images','Reports','AI findings','Follow-ups'].map(t=><button key={t} className={cn('tab',tab===t&&'active')} onClick={()=>setTab(t)} data-testid={`tab-patient-${t.toLowerCase().replaceAll(' ','-')}`}>{t}</button>)}</div>
    {tab==='Overview'&&<div className="grid grid-3"><div className="card card-pad"><div className="eyebrow">Patient context</div><div style={{marginTop:15}}><div className="row-detail">Phone</div><div className="row-title">{patient.phone}</div><div className="row-detail" style={{marginTop:15}}>Last screening</div><div className="row-title">{patient.lastScreening}</div></div></div><div className="card card-pad"><div className="eyebrow">Latest screening</div><div style={{marginTop:15}}><div className="row-title">Prototype indicators available</div><p className="row-detail">Review suggested · 18 Jun 2026</p><Link className="link" style={{display:'inline-block',marginTop:17}} href="/screening/scr-1048" data-testid="link-latest-screening">Open screening <ArrowRight size={12}/></Link></div></div><div className="card card-pad"><div className="eyebrow">Care team note</div><p className="row-detail" style={{marginTop:15,lineHeight:1.7}}>Keep the patient context visible while reviewing both eyes. Compare against prior images where available.</p></div></div>}
    {tab==='Screenings'&&<div className="card card-pad">{patientScreenings.length?<div>{patientScreenings.map(s=><div className="patient-row" key={s.id}><div className="activity-icon"><FileImage size={15}/></div><div className="row-grow"><div className="row-title">{s.date} · {s.images.length} images</div><div className="row-detail">{s.quality} quality · {s.result}</div></div><Link className="link" href={`/screening/${s.id}`} data-testid={`link-patient-screening-${s.id}`}>Review</Link></div>)}</div>:<div className="empty"><ClipboardList size={25}/><p>No screenings recorded yet.</p></div>}</div>}
    {tab==='Images'&&<div className="card card-pad"><div className="image-grid">{(patientScreenings[0]?.images||demoScreening.images).map(im=><div key={im.id}><div className="fundus"><span className="fundus-label">{im.eye} · {im.quality}</span></div><div className="row-detail" style={{marginTop:6}}>{im.name}</div></div>)}</div></div>}
    {tab==='Reports'&&<Reports embedded patient={patient}/>}
    {tab==='AI findings'&&<div className="card card-pad">{demoScreening.ai.findings.map(f=><div className="finding" key={f.id}><div className="finding-title">{f.title} <span className="pill pill-amber" style={{marginLeft:7}}>{f.confidence}</span></div><div className="finding-copy">{f.location} · {f.note}</div></div>)}</div>}
    {tab==='Follow-ups'&&<FollowUps embedded patient={patient}/>}
  </AppShell>;
}

function ScreeningNew() {
  const [,setLocation]=useLocation(); const [files,setFiles]=useState<FundusImage[]>([]); const [reports,setReports]=useState<string[]>([]); const inputRef=useRef<HTMLInputElement>(null);
  const addFiles=(list:FileList|null)=>{if(!list)return; const added=Array.from(list).map((f,i)=>({id:`new-${Date.now()}-${i}`,eye:(files.length%2===0?'OD':'OS') as 'OD'|'OS',name:f.name,size:`${(f.size/1024/1024||1.2).toFixed(1)} MB`,quality:'Pending check'}));setFiles([...files,...added]);};
  return <AppShell title="New screening"><div className="wizard-card"><div className="page-heading"><div><div className="eyebrow">Screening workspace · New</div><h1 style={{marginTop:8}}>Start with your images</h1><p className="subtitle">Bring the fundus photographs and reports you already have.</p></div><div className="notice" style={{maxWidth:260}}><ShieldCheck size={15}/><span>Prototype output only. No diagnosis is made here.</span></div></div><div className="card card-pad"><div className="progress-line"><div className="step active"><span className="step-dot">1</span><span>Upload</span></div><span className="step-line"/><div className="step"><span className="step-dot">2</span><span>Quality check</span></div><span className="step-line"/><div className="step"><span className="step-dot">3</span><span>Review</span></div></div>
      <h2>Fundus images</h2><p className="subtitle">Add one or both eyes. JPG, PNG, or TIFF · max 20 MB each.</p><input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={e=>addFiles(e.target.files)}/><div className="dropzone" style={{marginTop:18}} onClick={()=>inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')inputRef.current?.click()}} data-testid="dropzone-fundus-images"><div><Upload size={25}/><strong>Choose fundus images</strong><p className="row-detail">or drag and drop them here</p></div></div>{files.map(f=><div className="file-chip" key={f.id}><FileImage size={18}/><div className="row-grow"><div className="row-title">{f.name}</div><div className="row-detail">{f.eye} · {f.size} · {f.quality}</div></div><button className="file-remove" aria-label={`Remove ${f.name}`} onClick={()=>setFiles(files.filter(x=>x.id!==f.id))} data-testid={`button-remove-image-${f.id}`}><X size={16}/></button></div>)}<div className="section-row"><div><h2>Supporting reports</h2><p className="subtitle">Optional referral notes, labs, or clinical context.</p></div><label className="btn btn-secondary" htmlFor="report-upload" data-testid="label-upload-report"><Plus size={14}/> Add report</label><input id="report-upload" type="file" hidden accept=".pdf,.doc,.docx" onChange={e=>{if(e.target.files?.[0])setReports([...reports,e.target.files[0].name])}}/></div>{reports.map(r=><div className="file-chip" key={r}><FileText size={18}/><div className="row-grow"><div className="row-title">{r}</div><div className="row-detail">Supporting report</div></div><button className="file-remove" onClick={()=>setReports(reports.filter(x=>x!==r))} aria-label={`Remove ${r}`}><X size={16}/></button></div>)}<div className="wizard-footer"><Link className="btn btn-secondary" href="/dashboard" data-testid="link-cancel-screening">Cancel</Link><button className="btn btn-primary" disabled={!files.length} onClick={()=>setLocation('/screening/scr-1048')} data-testid="button-continue-screening">Continue to quality check <ArrowRight size={14}/></button></div></div></div></AppShell>;
}

function ScreeningDetail() {
  const {id}=useParams(); const [stage,setStage]=useState<'quality'|'analysis'|'results'|'review'>('quality'); const [decision,setDecision]=useState(''); const [note,setNote]=useState('');
  const next=()=>setStage(stage==='quality'?'analysis':stage==='analysis'?'results':stage==='results'?'review':'review');
  return <AppShell title={`Screening ${id||'scr-1048'}`}><div className="page-heading"><div><Link className="link" href="/patients/pt-001" data-testid="link-back-patient-profile"><ArrowLeft size={13}/> Maya Thompson</Link><h1 style={{marginTop:10}}>Screening review</h1><p className="subtitle">18 June 2026 · Both eyes · Prototype screening output</p></div><span className="pill pill-amber">Review pending</span></div><div className="card card-pad"><div className="progress-line"><div className={cn('step',stage!=='quality'?'done':'active')}><span className="step-dot">{stage!=='quality'?<Check size={12}/>:1}</span><span>Quality check</span></div><span className="step-line"/><div className={cn('step',stage==='analysis'?'active':stage==='results'||stage==='review'?'done':'')}><span className="step-dot">{stage==='results'||stage==='review'?<Check size={12}/>:2}</span><span>Analysis</span></div><span className="step-line"/><div className={cn('step',stage==='results'?'active':stage==='review'?'done':'')}><span className="step-dot">{stage==='review'?<Check size={12}/>:3}</span><span>Results</span></div><span className="step-line"/><div className={cn('step',stage==='review'&&'active')}><span className="step-dot">4</span><span>Doctor review</span></div></div>
      {stage==='quality'&&<div><h2>Image quality check</h2><p className="subtitle">Both images pass the basic prototype checks. Confirm before analysis.</p><div className="grid grid-2" style={{marginTop:20}}>{demoScreening.images.map(im=><div className="card card-pad" key={im.id}><div className="fundus"><span className="fundus-label">{im.eye} · {im.name}</span></div><div style={{display:'flex',justifyContent:'space-between',marginTop:11}}><span className="row-title">Quality acceptable</span><span className="pill pill-teal">Pass</span></div><p className="row-detail">Disc and macula visible · adequate illumination</p></div>)}</div><div className="wizard-footer"><span/><button className="btn btn-primary" onClick={next} data-testid="button-run-analysis">Run prototype analysis <Zap size={14}/></button></div></div>}
      {stage==='analysis'&&<div className="analysis-box"><div><div className="analysis-ring"/><h2>Reviewing the image set</h2><p className="subtitle">Prototype indicators are being prepared locally.<br/>This usually takes a few seconds in the demo.</p><button className="btn btn-secondary" style={{marginTop:20}} onClick={next} data-testid="button-view-analysis-results">View results</button></div></div>}
      {stage==='results'&&<div><div className="notice"><AlertCircle size={16}/><div><strong>Prototype screening indicator</strong><br/>This signal is not a medical diagnosis. Consider the full patient context and your own examination.</div></div><div className="grid grid-2" style={{marginTop:19}}><div className="card card-pad"><div className="eyebrow">Overall indicator</div><div style={{display:'flex',alignItems:'center',gap:14,marginTop:13}}><div className="metric-value metric-accent" style={{margin:0}}>0.78</div><div><strong>Review suggested</strong><p className="row-detail">Confidence is a prototype score, not a probability of disease.</p></div></div><div style={{marginTop:22}}><div className="eyebrow">Explainability</div>{demoScreening.ai.findings.map(f=><div className="finding" key={f.id} style={{marginTop:10}}><div className="finding-title">{f.title} · {f.confidence}</div><div className="finding-copy">{f.location}</div></div>)}</div></div><div className="card card-pad"><div className="eyebrow">Compare over time</div><div className="fundus" style={{marginTop:14}}><span className="fundus-label">18 Jun 2026 · OD</span></div><p className="row-detail" style={{marginTop:10}}>No prior image available in this demo record. Comparison tools are shown for workflow illustration.</p></div></div><div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage('quality')} data-testid="button-back-quality"><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" onClick={next} data-testid="button-open-doctor-review">Record doctor review <ArrowRight size={14}/></button></div></div>}
      {stage==='review'&&<div><div className="notice"><Stethoscope size={16}/><div><strong>Doctor review</strong><br/>Your clinical decision is the source of truth. Prototype indicators are one input only.</div></div><h2 style={{marginTop:23}}>What is your decision?</h2><div className="grid grid-3" style={{marginTop:14}}>{['Clear for routine follow-up','Refer for clinical review','Repeat image'].map(d=><button key={d} className={cn('btn',decision===d?'btn-primary':'btn-secondary')} style={{minHeight:66,justifyContent:'flex-start',textAlign:'left'}} onClick={()=>setDecision(d)} data-testid={`button-decision-${d.toLowerCase().replaceAll(' ','-')}`}>{decision===d?<CheckCircle2 size={17}/>:<CircleIcon/>}<span>{d}</span></button>)}</div><div className="field" style={{marginTop:21}}><label htmlFor="decision-note">Clinical note <span className="muted">(optional)</span></label><textarea id="decision-note" className="textarea" value={note} onChange={e=>setNote(e.target.value)} placeholder="Add the context behind your decision" data-testid="textarea-doctor-note"/></div><div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage('results')} data-testid="button-back-results"><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" disabled={!decision} onClick={()=>alert('Mock clinical decision saved to this demo workspace.')} data-testid="button-save-decision"><Check size={14}/> Save clinical decision</button></div></div>}
    </div></AppShell>;
}
function CircleIcon(){return <span style={{width:17,height:17,border:'1px solid currentColor',borderRadius:'50%'}}/>}

function Reports({embedded,patient}:{embedded?:boolean;patient?:Patient}) {
  const [items,setItems]=useState(demoReports); const [type,setType]=useState('All documents'); const [query,setQuery]=useState('');
  const filtered=items.filter(r=>(type==='All documents'||r.type===type)&&r.name.toLowerCase().includes(query.toLowerCase()));
  const content=<><div className="toolbar"><div className="search"><Search size={15}/><input className="input" placeholder="Search documents" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-reports"/></div><select className="select" value={type} onChange={e=>setType(e.target.value)} aria-label="Filter report type" data-testid="select-report-type"><option>All documents</option><option>Referral</option><option>Lab results</option><option>Clinical notes</option><option>Protocol</option></select></div><div>{filtered.map(r=><div className="report-row" key={r.id}><div className="activity-icon"><FileText size={15}/></div><div className="row-grow"><div className="row-title">{patient?`${patient.name} — ${r.type}`:r.name}</div><div className="row-detail">{r.type} · {r.date} · {r.size}</div></div><button className="icon-button" aria-label={`Download ${r.name}`} data-testid={`button-download-report-${r.id}`} onClick={()=>alert('Mock download prepared for this demo document.')}><Download size={15}/></button><button className="icon-button" aria-label={`Delete ${r.name}`} data-testid={`button-delete-report-${r.id}`} onClick={()=>setItems(items.filter(x=>x.id!==r.id))}><Trash2 size={15}/></button></div>)}</div>{!filtered.length&&<div className="empty"><FileText size={24}/><p>No documents in this group.</p></div>}</>;
  return embedded?<div className="card card-pad">{content}</div>:<AppShell title="Reports"><div className="page-heading"><div><div className="eyebrow">Document library</div><h1 style={{marginTop:8}}>Reports</h1><p className="subtitle">Supporting context, grouped and easy to find.</p></div><button className="btn btn-primary" onClick={()=>alert('Mock report picker opened.')} data-testid="button-add-report"><Upload size={14}/> Add report</button></div><div className="card card-pad">{content}</div></AppShell>;
}

function FollowUps({embedded,patient}:{embedded?:boolean;patient?:Patient}) {
  const [filter,setFilter]=useState('All'); const data=demoFollowUps.filter(f=>(!patient||f.patient===patient.name)&&(filter==='All'||f.urgency===filter));
  const content=<><div className="toolbar"><select className="select" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter follow-ups" data-testid="select-follow-up-filter"><option>All</option><option>Due today</option><option>This week</option><option>Upcoming</option><option>Overdue</option></select><button className="btn btn-secondary" onClick={()=>alert('Mock follow-up creation opened.')} data-testid="button-add-follow-up"><Plus size={14}/> Add follow-up</button></div><div>{data.map(f=><div className="follow-row" key={f.id}><div className={cn('activity-icon',f.urgency==='Overdue'?'pill-red':'')}><CalendarDays size={15}/></div><div className="row-grow"><div className="row-title">{f.patient}</div><div className="row-detail">{f.reason} · Due {f.due}</div></div><span className={cn('pill',f.urgency==='Overdue'?'pill-red':f.urgency==='Due today'?'pill-amber':f.urgency==='This week'?'pill-teal':'pill-slate')}>{f.urgency}</span><button className="btn btn-quiet" onClick={()=>alert(`Marked ${f.patient} complete in demo.`)} data-testid={`button-complete-follow-up-${f.id}`}><Check size={15}/></button></div>)}</div>{!data.length&&<div className="empty"><CalendarDays size={24}/><p>Nothing in this view.</p></div>}</>;
  return embedded?<div className="card card-pad">{content}</div>:<AppShell title="Follow-ups"><div className="page-heading"><div><div className="eyebrow">Care coordination</div><h1 style={{marginTop:8}}>Follow-ups</h1><p className="subtitle">Small reminders that keep care moving.</p></div></div><div className="card card-pad">{content}</div></AppShell>;
}

function Settings() {
  const [notifications,setNotifications]=useState(true); const [digest,setDigest]=useState(true); const [offline,setOffline]=useState(true); const [density,setDensity]=useState('Comfortable');
  return <AppShell title="Settings"><div className="page-heading"><div><div className="eyebrow">Workspace preferences</div><h1 style={{marginTop:8}}>Settings</h1><p className="subtitle">Make RetinoAI fit the way your team works.</p></div></div><div className="card" style={{maxWidth:840}}><div className="setting-section"><div className="eyebrow">Profile</div><div className="setting-row"><div><div className="row-title">Dr. Nia Kamau</div><div className="row-detail">Kijani Health Network · Clinical reviewer</div></div><button className="btn btn-secondary" onClick={()=>alert('Profile editing is a mock interaction in this prototype.')} data-testid="button-edit-profile"><Pencil size={13}/> Edit profile</button></div></div><div className="setting-section"><div className="eyebrow">Notifications</div><div className="setting-row"><div><div className="row-title">Review reminders</div><div className="row-detail">Get a reminder when a screening is waiting for a decision.</div></div><button className={cn('switch',notifications&&'on')} onClick={()=>setNotifications(!notifications)} aria-label="Toggle review reminders" data-testid="switch-notifications"><span/></button></div><div className="setting-row"><div><div className="row-title">Daily follow-up digest</div><div className="row-detail">A simple summary for the start of your clinic day.</div></div><button className={cn('switch',digest&&'on')} onClick={()=>setDigest(!digest)} aria-label="Toggle daily digest" data-testid="switch-digest"><span/></button></div></div><div className="setting-section"><div className="eyebrow">Privacy & display</div><div className="setting-row"><div><div className="row-title">Workspace display</div><div className="row-detail">Choose how much information is visible in lists.</div></div><select className="select" value={density} onChange={e=>setDensity(e.target.value)} data-testid="select-display-density"><option>Comfortable</option><option>Compact</option></select></div><div className="setting-row"><div><div className="row-title">Prototype labels</div><div className="row-detail">Keep safety labels visible throughout screening review.</div></div><span className="pill pill-teal">Always on</span></div></div><div className="setting-section"><div className="eyebrow">Offline-first workspace</div><div className="setting-row"><div><div className="row-title">Keep recent work available offline</div><div className="row-detail">Demo setting only. Real sync is not connected in this prototype.</div></div><button className={cn('switch',offline&&'on')} onClick={()=>setOffline(!offline)} aria-label="Toggle offline-first" data-testid="switch-offline"><span/></button></div><div className="notice"><LockKeyhole size={15}/><span>RetinoAI is designed for imperfect connectivity. Future releases can sync local drafts when a connection returns.</span></div></div><div className="setting-section"><div className="eyebrow">Future capture device</div><div className="setting-row"><div><div className="row-title">RetinoAI Capture Kit</div><div className="row-detail">Device integration is planned, not available in this prototype.</div></div><span className="pill pill-slate">Coming later</span></div></div></div></AppShell>;
}

function NotFound(){return <AppShell title="Not found"><div className="card empty"><AlertCircle size={28}/><h1 style={{fontSize:27}}>Page not found</h1><p className="subtitle">That workspace view does not exist.</p><Link className="btn btn-primary" style={{marginTop:20}} href="/dashboard">Back to overview</Link></div></AppShell>}

function Router() {
  const [patients,setPatients]=useState(initialPatients); const [screenings]=useState([demoScreening]);
  return <Switch>
    <Route path="/login" component={Login}/><Route path="/" component={()=><Redirect to="/dashboard"/>}/>
    <Route path="/dashboard">{()=> <Dashboard patients={patients} screenings={screenings}/>}</Route>
    <Route path="/patients/new" component={PatientNew}/><Route path="/patients/:id">{()=> <PatientProfile patients={patients} screenings={screenings}/>}</Route><Route path="/patients">{()=> <Patients patients={patients}/>}</Route>
    <Route path="/screening/new" component={ScreeningNew}/><Route path="/screening/:id" component={ScreeningDetail}/>
    <Route path="/reports">{()=> <Reports/>}</Route><Route path="/follow-ups">{()=> <FollowUps/>}</Route><Route path="/settings" component={Settings}/><Route component={NotFound}/>
  </Switch>;
}

const queryClient = new QueryClient();
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><RoutedErrorBoundary><Router/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;