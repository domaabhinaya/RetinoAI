import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ClipboardCheck, ClipboardList, Clock3, Download, Eye, FileImage, FileSearch,
  FileText, Filter, GitCompare, HeartPulse, LayoutDashboard, LockKeyhole,
  Menu, Pencil, Plus, Search, ScanEye, Settings2,
    ShieldCheck, SlidersHorizontal, Stethoscope, Trash2, TrendingUp, Upload, UserCheck,
  Users, X
} from 'lucide-react';
import {
  Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams
} from 'wouter';

type Patient = {
  id:string; name:string; initials:string; age:string; sex:string;
  dob:string; mobile:string; address:string; village:string; district:string;
  phone:string; risk:string; lastScreening:string; status:string; createdAt:string;
};
type FundusImage = { id:string; eye:'OD'|'OS'; name:string; size:string; quality:string; caseId?:string; patientId?:string; uploadedAt?:string; };
type CaseReport = { id:string; caseId:string; patientId:string; name:string; size:string; uploadedAt:string; };
type MedicalReport = { id:string; name:string; type:string; date:string; size:string; };
type LesionFinding = { id:string; title:string; confidence:string; location:string; note:string; };
type AIResult = { summary:string; level:string; score:string; findings:LesionFinding[]; };
type DoctorReview = { decision:string; note:string; date:string; };
type FollowUp = { id:string; patient:string; reason:string; due:string; urgency:'Due today'|'This week'|'Upcoming'|'Overdue'; };
type DiabetesHistory = {
  status:''|'Yes'|'No'|'Unknown';
  type:''|'Type 1'|'Type 2'|'Other'|'Unknown';
  yearDiagnosed:string; duration:string; hba1c:string; glucose:string; treatment:string;
};
type EyeHistory = {
  previousExam:''|'Yes'|'No'|'Unknown';
  previousDR:''|'Yes'|'No'|'Unknown';
  knownCondition:string;
  previousSurgery:''|'Yes'|'No'|'Unknown';
  previousTreatment:string;
  previousScreeningDate:string;
};
type SymptomsData = { selected:string[]; other:string; };
type ClinicalInfo = { bpSystolic:string; bpDiastolic:string; familyHistory:string; previousScreeningDate:string; notes:string; };
type ConsentRecord = { photography:boolean; aiAcknowledgement:boolean; dataStorage:boolean; };
type Screening = {
  id:string; patientId:string; date:string; status:string; quality:string; result:string;
  images:FundusImage[]; ai:AIResult; review?:DoctorReview;
  diabetesHistory?:DiabetesHistory; eyeHistory?:EyeHistory; symptoms?:SymptomsData;
  clinicalInformation?:ClinicalInfo; consent?:ConsentRecord; reports?:CaseReport[];
};
type IntakeForm = {
  name:string; dob:string; age:string; sex:string; mobile:string; address:string; village:string; district:string;
  diabetes:DiabetesHistory; eye:EyeHistory; symptoms:SymptomsData; clinical:ClinicalInfo; consent:ConsentRecord;
};
const emptyIntake = ():IntakeForm => ({
  name:'', dob:'', age:'', sex:'', mobile:'', address:'', village:'', district:'',
  diabetes:{ status:'', type:'', yearDiagnosed:'', duration:'', hba1c:'', glucose:'', treatment:'' },
  eye:{ previousExam:'', previousDR:'', knownCondition:'', previousSurgery:'', previousTreatment:'', previousScreeningDate:'' },
  symptoms:{ selected:[], other:'' },
  clinical:{ bpSystolic:'', bpDiastolic:'', familyHistory:'', previousScreeningDate:'', notes:'' },
  consent:{ photography:false, aiAcknowledgement:false, dataStorage:false },
});
const SYMPTOM_OPTIONS = ['Blurred vision','Sudden vision loss','Difficulty seeing at night','Floaters','Flashes','Eye pain','Headache','Distorted vision','No symptoms','Other'];
const TRIAGE_OPTIONS = ['Yes','No','Unknown'] as const;
function generatePatientId(){ const hex = Array.from({length:6},()=>'0123456789ABCDEF'[Math.floor(Math.random()*16)]).join(''); return `P-${hex}`; }
function generateCaseId(existing:Screening[]){ const year = new Date().getFullYear(); const seq = String(existing.length + 1).padStart(4,'0'); return `SC-${year}-${seq}`; }
function ageFromDob(dob:string){ if(!dob) return ''; const d = new Date(dob); if (Number.isNaN(d.getTime())) return ''; const now = new Date(); let age = now.getFullYear() - d.getFullYear(); const m = now.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1; return age >= 0 && age < 130 ? String(age) : ''; }
function durationFromYear(year:string){ const y = parseInt(year,10); if (!year || Number.isNaN(y)) return ''; const now = new Date().getFullYear(); return y > 1900 && y <= now ? `${now - y} year${now - y === 1 ? '' : 's'}` : ''; }
type ReferredCase = {
  id:string;
  patientId:string;
  patientName:string;
  screeningId:string;
  screeningDate:string;
  priority:'High'|'Moderate'|'Pending';
  summary:string;
  reason:string;
  status:'Awaiting review'|'In review'|'Reviewed';
  decision?:'Monitor'|'Refer';
  note?:string;
};

const initialPatients: Patient[] = [];
const demoReports: MedicalReport[] = [];
const demoFollowUps: FollowUp[] = [];

const navItems = [
  { href:'/dashboard', label:'Overview', icon:LayoutDashboard },
  { href:'/patients', label:'Patients', icon:Users },
  { href:'/screening/new', label:'New screening', icon:Plus },
  { href:'/reports', label:'Reports', icon:FileText },
  { href:'/follow-ups', label:'Follow-ups', icon:CalendarDays },
];
const doctorNavItems = [
  { href:'/doctor/dashboard', label:'Doctor dashboard', icon:LayoutDashboard },
  { href:'/doctor/cases', label:'Referred cases', icon:ClipboardCheck },
  { href:'/doctor/follow-ups', label:'Follow-ups', icon:CalendarDays },
];
const utilityItems = [
  { href:'/settings', label:'Settings', icon:Settings2 },
];

const initialReferredCases: ReferredCase[] = [];

function initials(name:string) { return name.split(' ').map((x) => x[0]).slice(0,2).join(''); }
function cn(...parts:(string|false|undefined)[]) { return parts.filter(Boolean).join(' '); }

const editorialEase = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, className, style, delay = 0, amount = 0.15 }:{ children:ReactNode; className?:string; style?:CSSProperties; delay?:number; amount?:number }) {
  return <motion.div className={className} style={style} initial={{ opacity:0, y:18, clipPath:'inset(0 0 12% 0)' }} whileInView={{ opacity:1, y:0, clipPath:'inset(0 0 0% 0)' }} viewport={{ once:true, amount }} transition={{ duration:.52, delay, ease:editorialEase }}>{children}</motion.div>;
}

function DirectionalPanel({ panelKey, children, direction = 1 }:{ panelKey:string; children:ReactNode; direction?:1|-1 }) {
  return <AnimatePresence mode="wait" initial={false}>
    <motion.div key={panelKey} initial={{ opacity:0, x:direction * 26, clipPath:direction > 0 ? 'inset(0 0 0 12%)' : 'inset(0 12% 0 0)' }} animate={{ opacity:1, x:0, clipPath:'inset(0 0 0 0)' }} exit={{ opacity:0, x:direction * -22, clipPath:direction > 0 ? 'inset(0 12% 0 0)' : 'inset(0 0 0 12%)' }} transition={{ duration:.44, ease:editorialEase }}>
      {children}
    </motion.div>
  </AnimatePresence>;
}

function PageTransition({ children }:{ children:ReactNode }) {
  const [location] = useLocation();
  return <MotionConfig reducedMotion="user">
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location} className="route-stage" initial={{ opacity:0, x:28, clipPath:'inset(0 0 0 9%)' }} animate={{ opacity:1, x:0, clipPath:'inset(0 0 0 0)' }} exit={{ opacity:0, x:-28, clipPath:'inset(0 9% 0 0)' }} transition={{ duration:.42, ease:editorialEase }}>
        {children}
      </motion.div>
    </AnimatePresence>
  </MotionConfig>;
}

function AppShell({ children, title }:{ children:ReactNode; title:string }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const isDoctorPortal = location.startsWith('/doctor');
  const portalLabel = isDoctorPortal ? 'Doctor portal' : 'Clinical screening';
  const portalItems = isDoctorPortal ? doctorNavItems : navItems;
  return <div className={cn('app-shell', isDoctorPortal && 'doctor-shell')}>
    <aside className={cn('sidebar', open && 'open')}>
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className={cn('portal-identity', isDoctorPortal && 'doctor-portal-identity')}><span className="portal-kicker">Current portal</span><strong>{portalLabel}</strong><span>{isDoctorPortal ? 'Specialist review desk' : 'Frontline operator workspace'}</span></div>
      <div className="eyebrow nav-section">{isDoctorPortal ? 'Review desk' : 'Workspace'}</div>
      <nav aria-label="Primary navigation">
        {portalItems.map(({href,label,icon:Icon}) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ','-')}`} className={cn('nav-item', location === href || (href === '/patients' && location.startsWith('/patients/')) || (href === '/doctor/cases' && location.startsWith('/doctor/cases')) ? 'active' : '')}><Icon size={16}/><span>{label}</span></Link>)}
      </nav>
      <div className="eyebrow nav-section">{isDoctorPortal ? 'Clinical access' : 'Manage'}</div>
      <nav>{utilityItems.map(({href,label,icon:Icon}) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={cn('nav-item',location.startsWith(href) && 'active')}><Icon size={16}/><span>{label}</span></Link>)}</nav>
      <div className="portal-switcher">
        <span className="portal-kicker">Switch workspace</span>
        <Link href={isDoctorPortal ? '/dashboard' : '/doctor/dashboard'} className="portal-switch-link" data-testid={isDoctorPortal ? 'link-clinical-portal' : 'link-doctor-portal'}>
          {isDoctorPortal ? <ScanEye size={15}/> : <Stethoscope size={15}/>}
          <span>{isDoctorPortal ? 'Clinical screening' : 'Doctor portal'}</span><ArrowRight size={13}/>
        </Link>
      </div>
      <div className="sidebar-bottom"><div className="demo-badge"><span className="status-dot"/> Demo workspace</div><div className="tiny" style={{color:'hsl(201 14% 59%)',marginTop:7}}>No patient data is stored</div></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setOpen(!open)}><Menu size={18}/></button>
        <div className="topbar-title"><span className="topbar-portal">{portalLabel}</span><span>{title}</span></div>
        <div className="topbar-actions"><div className="notice" style={{padding:'7px 10px',gap:7}}><ShieldCheck size={14}/><span>AI assists. Doctors decide.</span></div><button className="icon-button" aria-label="Notifications" data-testid="button-notifications" onClick={()=>alert('No new notifications in this workspace.')}><Bell size={16}/></button>{isDoctorPortal ? <div className="avatar" title="Reviewing doctor">DR</div> : <div className="avatar" title="Screening operator">OP</div>}</div>
      </header>
        <main className="content"><motion.div className="content-inner" initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:.36, delay:.06, ease:editorialEase}}>{children}</motion.div></main>
    </div>
  </div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  return <div className="login-page">
    <section className="login-art">
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className="login-art-content"><div className="eyebrow" style={{color:'hsl(174 55% 65%)'}}>Retinal screening workspace</div><h1>Clarity for every clinical screening.</h1><p>Upload the images you already have. Keep context close. AI-assisted screening supports — never replaces — clinical judgement.</p></div>
      <div className="small" style={{color:'hsl(201 14% 59%)'}}>RetinoAI Screening · Prototype</div>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={(e)=>{e.preventDefault();setLocation('/dashboard')}}>
        <div className="login-crest"><HeartPulse size={20} color="hsl(var(--primary))"/><span className="eyebrow">RetinoAI</span></div>
        <h2>Welcome</h2><p className="subtitle">Sign in to the screening workspace.</p>
        <div className="field" style={{marginTop:26}}><label htmlFor="email">Work email</label><input id="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} data-testid="input-login-email"/></div>
        <div className="field" style={{marginTop:15}}><label htmlFor="password">Password</label><input id="password" type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} data-testid="input-login-password"/></div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:22}} data-testid="button-sign-in">Sign in <ArrowRight size={15}/></button>
        <button type="button" className="btn btn-secondary" style={{width:'100%',marginTop:9}} data-testid="button-demo-mode" onClick={()=>setLocation('/dashboard')}>Enter workspace</button>
        <div className="login-note"><p className="tiny muted">Prototype. Do not enter real patient information. No authentication or data storage is enabled.</p></div>
      </form>
    </section>
  </div>;
}

function Dashboard({patients, screenings}:{patients:Patient[]; screenings:Screening[]}) {
  const [,setLocation] = useLocation();
  const totalScreenings = screenings.length;
  const awaitingReview = screenings.filter(s=>!s.review && s.quality==='Good').length;
  const highPriority = screenings.filter(s=>s.ai.level==='High' || s.ai.level==='Severe').length;
  const escalated = screenings.filter(s=>s.review).length;
  const workflowStages = [
    {label:'Capture',detail:'Upload'},
    {label:'Check',detail:'Quality'},
    {label:'Detect',detail:'Screen'},
    {label:'Explain',detail:'Evidence'},
    {label:'Track',detail:'Compare'},
    {label:'Refer',detail:'Decide'},
  ];
  return <AppShell title="Overview"><Reveal className="page-heading-enhanced"><div><div className="eyebrow">Clinical Screening Portal</div><h1 style={{marginTop:8}}>Screening Overview</h1><p className="subtitle">Upload retinal images, check quality, and escalate cases for specialist review.</p></div><button className="btn btn-primary" data-testid="button-start-screening" onClick={()=>setLocation('/screening/new')}><Plus size={15}/> New screening</button></Reveal>
    <Reveal className="notice" delay={.04}><ShieldCheck size={16}/><div><strong>Prototype workspace</strong> · This system is awaiting AI model integration. No clinical conclusions are generated. AI assists. Doctors decide.</div></Reveal>
    <Reveal className="workflow-track" delay={.1} amount={.3}><div className="workflow-track-header"><div className="eyebrow">Clinical journey</div><span className="tiny muted">Capture → Check → Detect → Explain → Track → Refer</span></div><div className="workflow-stages">{workflowStages.map((stage,index)=><div className="workflow-stage" key={stage.label}><div className="workflow-stage-top"><span className="workflow-index">0{index+1}</span>{index<workflowStages.length-1&&<span className="workflow-connector"/>}</div><div className="workflow-label">{stage.label}</div><div className="workflow-detail">{stage.detail}</div></div>)}</div></Reveal>
    <Reveal className="operational-stats" style={{marginTop:28}}>
      <div className="operational-stat"><div className="operational-stat-label">Total screenings</div><div className="operational-stat-value">{totalScreenings || '—'}</div><div className="operational-stat-meta">Cases in workspace</div></div>
      <div className="operational-stat"><div className="operational-stat-label">Awaiting review</div><div className="operational-stat-value">{awaitingReview || '—'}</div><div className="operational-stat-meta">Quality check passed</div></div>
      <div className="operational-stat operational-stat-accent"><div className="operational-stat-label">High priority</div><div className="operational-stat-value">{highPriority || '—'}</div><div className="operational-stat-meta">Requires escalation</div></div>
      <div className="operational-stat"><div className="operational-stat-label">Escalated</div><div className="operational-stat-value">{escalated || '—'}</div><div className="operational-stat-meta">Sent to doctor portal</div></div>
    </Reveal>
    <Reveal className="grid grid-2" style={{marginTop:28}}>
      <div className="card card-pad">
        <div className="section-row" style={{marginTop:0}}><h2>Recent activity</h2></div>
        <div className="empty" style={{padding:'28px 0'}}><Clock3 size={24}/><p>No recent activity</p><p className="tiny muted">Screening activity will appear here.</p></div>
      </div>
      <div className="card card-pad">
        <div className="section-row" style={{marginTop:0}}><h2>Follow-up pulse</h2></div>
        <div className="empty" style={{padding:'28px 0'}}><CalendarDays size={24}/><p>No follow-ups</p><p className="tiny muted">Follow-up reminders will appear here.</p></div>
      </div>
    </Reveal>
  </AppShell>;
}

function Patients({patients}:{patients:Patient[]}) {
  const [query,setQuery]=useState(''); const [risk,setRisk]=useState('All risk levels');
  const filtered=patients.filter(p=>(p.name+p.village).toLowerCase().includes(query.toLowerCase())&&(risk==='All risk levels'||p.risk===risk));
  return <AppShell title="Patients"><Reveal className="page-heading"><div><div className="eyebrow">Patient registry</div><h1 style={{marginTop:8}}>Patients</h1><p className="subtitle">Context for every screening, kept in one place.</p></div><Link className="btn btn-primary" href="/patients/new" data-testid="link-register-patient"><Plus size={15}/> Register patient</Link></Reveal>
    <Reveal className="card card-pad" delay={.08}><div className="toolbar"><div className="search"><Search size={15}/><input className="input" placeholder="Search name or community" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-patients"/></div><select className="select" value={risk} onChange={e=>setRisk(e.target.value)} aria-label="Filter by risk" data-testid="select-patient-risk"><option>All risk levels</option><option>Low</option><option>Moderate</option><option>High</option></select><button className="btn btn-secondary" onClick={()=>setRisk('All risk levels')} data-testid="button-filter-patients"><SlidersHorizontal size={14}/> Reset filters</button></div>
       <div className="table-wrap"><table className="table"><thead><tr><th>Patient</th><th>Community</th><th>Last screening</th><th>Risk</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><Link className="patient-cell" href={`/patients/${p.id}`} data-testid={`link-patient-${p.id}`}><span className="initials">{p.initials}</span><span><strong>{p.name}</strong><br/><span className="tiny muted">{p.age} yrs · {p.sex}</span></span></Link></td><td>{p.village}</td><td>{p.lastScreening}</td><td><span className={cn('pill',p.risk==='High'?'pill-red':p.risk==='Moderate'?'pill-amber':'pill-teal')}>{p.risk||'Not recorded'}</span></td><td><span className="tiny">{p.status}</span></td><td><Link className="link" href={`/patients/${p.id}`} data-testid={`link-open-patient-${p.id}`}>Open</Link></td></tr>)}</tbody></table></div>{filtered.length===0&&<div className="empty"><Users size={25}/><p>{patients.length===0?'No patients registered yet.':'No patients match that search.'}</p><p className="tiny muted">{patients.length===0?'Registered patients will appear here.':'Try a different search or filter.'}</p></div>}</Reveal>
  </AppShell>;
}

function PatientNew() {
  const [,setLocation]=useLocation(); const [step,setStep]=useState(1); const [done,setDone]=useState(false);
  const [form,setForm]=useState({first:'',last:'',dob:'',sex:'Female',community:'',phone:'',consent:false});
  const update=(key:string,value:string|boolean)=>setForm({...form,[key]:value});
  if(done) return <AppShell title="Register patient"><div className="card success"><div className="success-mark"><Check size={25}/></div><div className="eyebrow">Registration complete</div><h1 style={{fontSize:28,marginTop:9}}>Patient added</h1><p className="subtitle">The patient is ready for screening.</p><div style={{display:'flex',justifyContent:'center',gap:9,marginTop:24}}><button className="btn btn-secondary" onClick={()=>setDone(false)} data-testid="button-register-another">Register another</button><button className="btn btn-primary" onClick={()=>setLocation('/patients')} data-testid="button-open-new-patient">View patients <ArrowRight size={14}/></button></div></div></AppShell>;
  const steps=['Identity','Contact','Context','Consent','Review','Complete'];
  return <AppShell title="Register patient"><div className="wizard-card"><div className="page-heading"><div><div className="eyebrow">Patient registry · New</div><h1 style={{marginTop:8}}>Register a patient</h1><p className="subtitle">A short, local-first workflow for screening teams.</p></div></div><div className="card card-pad"><div className="progress-line">{steps.map((s,i)=><div key={s} style={{display:'contents'}}><div className={cn('step',i+1===step&&'active',i+1<step&&'done')}><span className="step-dot">{i+1<step?<Check size={12}/>:i+1}</span><span className="step-label">{s}</span></div>{i<steps.length-1&&<span className="step-line"/>}</div>)}</div>
       <DirectionalPanel panelKey={String(step)}>
       {step===1&&<div><h2>Patient identity</h2><p className="subtitle">Use the name shown on the patient’s existing records.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>First name</label><input className="input" value={form.first} onChange={e=>update('first',e.target.value)} data-testid="input-patient-first-name"/></div><div className="field"><label>Last name</label><input className="input" value={form.last} onChange={e=>update('last',e.target.value)} data-testid="input-patient-last-name"/></div><div className="field"><label>Date of birth</label><input type="date" className="input" value={form.dob} onChange={e=>update('dob',e.target.value)} data-testid="input-patient-dob"/></div><div className="field"><label>Sex</label><select className="input" value={form.sex} onChange={e=>update('sex',e.target.value)} data-testid="select-patient-sex"><option>Female</option><option>Male</option><option>Not recorded</option></select></div></div></div>}
      {step===2&&<div><h2>Contact details</h2><p className="subtitle">Optional contact information helps the team complete follow-ups.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>Phone number</label><input className="input" value={form.phone} onChange={e=>update('phone',e.target.value)} data-testid="input-patient-phone"/></div><div className="field"><label>Preferred language</label><select className="input"><option>English</option><option>Kiswahili</option><option>Local language</option></select></div></div></div>}
      {step===3&&<div><h2>Care context</h2><p className="subtitle">Add the context a clinician should see before reviewing an image.</p><div className="form-grid" style={{marginTop:22}}><div className="field"><label>Community or village</label><input className="input" value={form.community} onChange={e=>update('community',e.target.value)} data-testid="input-patient-community"/></div><div className="field"><label>Known risk factors</label><select className="input"><option>Type 2 diabetes</option><option>Hypertension</option><option>None recorded</option></select></div><div className="field full"><label>Clinical note</label><textarea className="textarea" placeholder="Optional context for the care team" data-testid="textarea-patient-note"/></div></div></div>}
      {step===4&&<div><h2>Consent & safety</h2><p className="subtitle">This demo records a consent acknowledgement only. No real data is stored.</p><label className="check" style={{marginTop:24}}><input type="checkbox" checked={form.consent} onChange={e=>update('consent',e.target.checked)}/><span>I confirm the patient has provided consent for retinal screening and understands that prototype output does not constitute a diagnosis.</span></label><div className="notice" style={{marginTop:20}}><LockKeyhole size={15}/><span>Offline-first note: this prototype is designed to keep workflow usable when connectivity is limited.</span></div></div>}
      {step===5&&<div><h2>Review registration</h2><p className="subtitle">Check the details before creating the patient record.</p><div className="card" style={{marginTop:20,padding:15,background:'hsl(var(--muted)/.42)'}}>{[['Name',`${form.first} ${form.last}`],['Date of birth',form.dob],['Sex',form.sex],['Community',form.community],['Phone',form.phone]].map(([a,b])=><div className="setting-row" key={a}><span className="muted small">{a}</span><strong className="small">{b}</strong></div>)}</div></div>}
       {step===6&&<div className="empty"><CheckCircle2 size={28}/><h2>Ready to create</h2><p className="subtitle">Review the details and create the patient record.</p></div>}
       </DirectionalPanel>
       <div className="wizard-footer">{step>1?<button className="btn btn-secondary" onClick={()=>setStep(step-1)} data-testid="button-wizard-back"><ArrowLeft size={14}/> Back</button>:<span/>}{step<6?<button className="btn btn-primary" disabled={step===4&&!form.consent} onClick={()=>setStep(step+1)} data-testid="button-wizard-next">Continue <ArrowRight size={14}/></button>:<button className="btn btn-primary" onClick={()=>setDone(true)} data-testid="button-complete-registration"><Check size={14}/> Create patient</button>}</div>
     </div></div></AppShell>
}

function PatientProfile({patients,screenings}:{patients:Patient[];screenings:Screening[]}) {
  const {id}=useParams(); const [,setLocation]=useLocation(); const patient=patients.find(p=>p.id===id)||patients[0]; const [tab,setTab]=useState('Overview');
  if (!patient) return <AppShell title="Patient profile"><div className="card empty"><Users size={28}/><h1 style={{fontSize:27}}>No patient found</h1><p className="subtitle">This patient record does not exist.</p><Link className="btn btn-primary" style={{marginTop:20}} href="/patients">Back to patients</Link></div></AppShell>;
  const patientScreenings=screenings.filter(s=>s.patientId===patient.id);
  return <AppShell title="Patient profile"><Reveal><Link className="link" href="/patients" data-testid="link-back-patients"><ArrowLeft size={13} style={{verticalAlign:'-2px'}}/> All patients</Link></Reveal><Reveal className="card profile-hero" style={{marginTop:14}} delay={.06}><div className="profile-id"><div className="profile-initials">{patient.initials}</div><div><div className="eyebrow">Patient profile</div><h1 style={{fontSize:27,marginTop:5}}>{patient.name}</h1><p className="subtitle">{patient.age} years · {patient.sex} · {patient.village}</p></div></div><div style={{display:'flex',gap:9}}><span className={cn('pill',patient.risk==='High'?'pill-red':patient.risk==='Moderate'?'pill-amber':'pill-teal')}>{patient.risk || 'Risk not recorded'}</span><button className="btn btn-primary" onClick={()=>setLocation('/screening/new')} data-testid="button-new-patient-screening"><Plus size={14}/> New screening</button></div></Reveal>
     <Reveal className="tabbar" delay={.12}>{['Overview','Screenings','Images','Reports','AI findings','Follow-ups'].map(t=><button key={t} className={cn('tab',tab===t&&'active')} onClick={()=>setTab(t)} data-testid={`tab-patient-${t.toLowerCase().replaceAll(' ','-')}`}>{t}</button>)}</Reveal>
     <DirectionalPanel panelKey={tab}>
     {tab==='Overview'&&<div className="grid grid-3"><div className="card card-pad"><div className="eyebrow">Patient context</div><div style={{marginTop:15}}><div className="row-detail">Phone</div><div className="row-title">{patient.phone || '—'}</div><div className="row-detail" style={{marginTop:15}}>Last screening</div><div className="row-title">{patient.lastScreening || '—'}</div></div></div><div className="card card-pad"><div className="eyebrow">Latest screening</div><div style={{marginTop:15}}><div className="row-title">No screening result available</div><p className="row-detail">Screening results will appear after analysis.</p></div></div><div className="card card-pad"><div className="eyebrow">Care team note</div><p className="row-detail" style={{marginTop:15,lineHeight:1.7}}>Keep the patient context visible while reviewing both eyes. Compare against prior images where available.</p></div></div>}
    {tab==='Screenings'&&<div className="card card-pad">{patientScreenings.length?<div>{patientScreenings.map(s=><div className="patient-row" key={s.id}><div className="activity-icon"><FileImage size={15}/></div><div className="row-grow"><div className="row-title">{s.date} · {s.images.length} images</div><div className="row-detail">{s.quality} quality · {s.result}</div></div><Link className="link" href={`/screening/${s.id}`} data-testid={`link-patient-screening-${s.id}`}>Review</Link></div>)}</div>:<div className="empty"><ClipboardList size={25}/><p>No screenings recorded yet.</p></div>}</div>}
    {tab==='Images'&&<div className="card card-pad"><div className="image-grid">{(patientScreenings[0]?.images||[]).map(im=><div key={im.id}><div className="fundus"><span className="fundus-label">{im.eye} · {im.quality}</span></div><div className="row-detail" style={{marginTop:6}}>{im.name}</div></div>)}</div>{(!patientScreenings[0]?.images||patientScreenings[0].images.length===0)&&<div className="empty"><FileImage size={25}/><p>No images uploaded yet.</p></div>}</div>}
    {tab==='Reports'&&<Reports embedded patient={patient}/>}
    {tab==='AI findings'&&<div className="card card-pad"><div className="empty"><ScanEye size={28}/><h2>AI Findings</h2><p className="subtitle">No AI findings available yet.</p><p className="tiny muted">AI findings will appear after image analysis.</p></div></div>}
     {tab==='Follow-ups'&&<FollowUps embedded patient={patient}/>}
     </DirectionalPanel>
  </AppShell>;
}

function ScreeningNew({patients, screenings, onCreatePatient, onCreateCase, onUpdateCase, onEscalate}:{patients:Patient[]; screenings:Screening[]; onCreatePatient:(p:Patient)=>void; onCreateCase:(s:Screening)=>void; onUpdateCase:(caseId:string, patch:Partial<Screening>)=>void; onEscalate:(caseId:string)=>void}) {
  const [,setLocation]=useLocation();
  const [stage,setStage]=useState(1);
  const [form,setForm]=useState<IntakeForm>(emptyIntake);
  const [errors,setErrors]=useState<string[]>([]);
  const [activePatient,setActivePatient]=useState<Patient|null>(null);
  const [activeCase,setActiveCase]=useState<Screening|null>(null);
  const [escalated,setEscalated]=useState(false);
  const [rightEye,setRightEye]=useState<FundusImage|null>(null);
  const [leftEye,setLeftEye]=useState<FundusImage|null>(null);
  const [caseReports,setCaseReports]=useState<CaseReport[]>([]);
  const [dragEye,setDragEye]=useState<''|'OD'|'OS'>('');
  const rightRef=useRef<HTMLInputElement>(null); const leftRef=useRef<HTMLInputElement>(null); const reportRef=useRef<HTMLInputElement>(null);
  const stageNames=['Patient details','Upload','Quality','Screen','Findings','Priority','Escalate'];
  const update=(patch:Partial<IntakeForm>)=>setForm(f=>({...f,...patch}));
  const updateDiabetes=(patch:Partial<DiabetesHistory>)=>setForm(f=>({...f,diabetes:{...f.diabetes,...patch}}));
  const updateEye=(patch:Partial<EyeHistory>)=>setForm(f=>({...f,eye:{...f.eye,...patch}}));
  const updateClinical=(patch:Partial<ClinicalInfo>)=>setForm(f=>({...f,clinical:{...f.clinical,...patch}}));
  const toggleSymptom=(s:string)=>setForm(f=>{ const has=f.symptoms.selected.includes(s); const selected=has?f.symptoms.selected.filter(x=>x!==s):(s==='No symptoms'?['No symptoms']:[...f.symptoms.selected.filter(x=>x!=='No symptoms'),s]); return {...f,symptoms:{...f.symptoms,selected}}; });
  const computedAge=form.dob?ageFromDob(form.dob):form.age.trim();
  const computedDuration=form.diabetes.yearDiagnosed?durationFromYear(form.diabetes.yearDiagnosed):form.diabetes.duration.trim();
  const createCase=()=>{
    const errs:string[]=[];
    if(!form.name.trim()) errs.push('Full name is required.');
    if(!form.dob && !form.age.trim()) errs.push('Provide a date of birth or an age.');
    if(!form.diabetes.status) errs.push('Select a diabetes status.');
    if(!form.consent.photography) errs.push('Retinal photography consent is required.');
    if(!form.consent.aiAcknowledgement) errs.push('AI assistance acknowledgement is required.');
    if(!form.consent.dataStorage) errs.push('Data storage consent is required.');
    setErrors(errs); if(errs.length) return;
    const patientId=generatePatientId(); const caseId=generateCaseId(screenings); const createdAt=new Date().toISOString();
    const patient:Patient={ id:patientId, name:form.name.trim(), initials:initials(form.name.trim()), age:computedAge, sex:form.sex||'Not recorded', dob:form.dob, mobile:form.mobile.trim(), address:form.address.trim(), village:form.village.trim(), district:form.district.trim(), phone:form.mobile.trim(), risk:'', lastScreening:'', status:'Screening in progress', createdAt };
    const screening:Screening={ id:caseId, patientId, date:createdAt.slice(0,10), status:'In progress', quality:'Pending', result:'', images:[], ai:{summary:'',level:'Pending',score:'',findings:[]}, diabetesHistory:{...form.diabetes,duration:computedDuration}, eyeHistory:{...form.eye}, symptoms:{...form.symptoms}, clinicalInformation:{...form.clinical}, consent:{...form.consent}, reports:[] };
    onCreatePatient(patient); onCreateCase(screening);
    setActivePatient(patient); setActiveCase(screening); setStage(2); setErrors([]);
  };
  const attachEye=(eye:'OD'|'OS', list:FileList|null)=>{ if(!list?.[0]||!activeCase) return; const f=list[0];
    const img:FundusImage={ id:`img-${activeCase.id}-${eye}`, eye, name:f.name, size:`${(f.size/1024/1024||0.1).toFixed(1)} MB`, quality:'Pending check', caseId:activeCase.id, patientId:activeCase.patientId, uploadedAt:new Date().toISOString() };
    if(eye==='OD') setRightEye(img); else setLeftEye(img); };
  const attachReport=(list:FileList|null)=>{ if(!list?.[0]||!activeCase) return; const f=list[0];
    setCaseReports(r=>[...r,{ id:`rep-${activeCase.id}-${Date.now()}`, caseId:activeCase.id, patientId:activeCase.patientId, name:f.name, size:`${(f.size/1024/1024||0.1).toFixed(1)} MB`, uploadedAt:new Date().toISOString() }]); };
  const syncCase=()=>{ if(!activeCase) return; onUpdateCase(activeCase.id,{ images:[rightEye,leftEye].filter(Boolean) as FundusImage[], reports:caseReports }); };
  const escalate=()=>{ if(!activeCase) return; syncCase(); onEscalate(activeCase.id); setEscalated(true); };
  const phDiabetes=()=>{ const d=activeCase?.diabetesHistory; if(!d||!d.status) return '—'; const parts=[d.status]; if(d.type) parts.push(d.type); if(d.duration) parts.push(d.duration); return parts.join(' · '); };
  const TriageRow=({value,onChange,label}:{value:string;onChange:(v:'Yes'|'No'|'Unknown')=>void;label:string})=> (
    <div className="intake-field"><label>{label}</label><div className="triage-row">{TRIAGE_OPTIONS.map(opt=>(
      <button type="button" key={opt} className={cn('triage-option',value===opt&&'selected',opt==='Unknown'&&'unknown')} onClick={()=>onChange(opt)}>{opt}</button>))}</div></div>);
  const PatientHeader=()=> !activePatient||!activeCase ? null : (
    <div className="patient-header">
      <div className="patient-header-cell"><span className="ph-label">Patient</span><span className="ph-value mono">{activePatient.id}</span></div>
      <div className="patient-header-cell"><span className="ph-label">Name</span><span className="ph-value">{activePatient.name}</span></div>
      <div className="patient-header-cell"><span className="ph-label">Age</span><span className="ph-value">{activePatient.age||'—'}</span></div>
      <div className="patient-header-cell"><span className="ph-label">Diabetes</span><span className="ph-value">{phDiabetes()}</span></div>
      <div className="patient-header-cell"><span className="ph-label">Screening case</span><span className="ph-value mono">{activeCase.id}</span></div>
      <div className="patient-header-cell"><span className="ph-label">Status</span><span className="ph-value">{escalated?'Awaiting specialist review':'In progress'}</span></div>
    </div>);
  return <AppShell title="New screening"><div className="wizard-card">
    <Reveal className="page-heading"><div><div className="eyebrow">Clinical Screening Portal · New</div><h1 style={{marginTop:8}}>New screening</h1><p className="subtitle">Register the patient, upload retinal images, and escalate the case for specialist review.</p></div><div className="notice" style={{maxWidth:280}}><ShieldCheck size={15}/><span>AI assists screening. No diagnosis is made here.</span></div></Reveal>
    <Reveal className="card card-pad"><div className="progress-line">{stageNames.map((name,i)=><div key={name} style={{display:'contents'}}><div className={cn('step',stage===i+1&&'active',stage>i+1&&'done')}><span className="step-dot">{stage>i+1?<Check size={12}/>:i+1}</span><span>{name}</span></div>{i<stageNames.length-1&&<span className="step-line"/>}</div>)}</div>
    <PatientHeader/>
    {stage===1&&<DirectionalPanel panelKey="intake"><div>
      <div className="intake-section" style={{borderTop:'none',marginTop:20,paddingTop:0}}>
        <div className="intake-section-head"><span className="intake-section-index">01</span><h2>Patient identification</h2><span className="optional-note">System ID is generated automatically</span></div>
        <div className="intake-grid">
          <div className="intake-field"><label>Patient ID<span className="opt">auto-generated on create</span></label><input className="input" value="Generated when the case is created" disabled readOnly aria-label="Patient ID is generated when the case is created"/></div>
          <div className="intake-field"><label>Full name<span className="req">*</span></label><input className="input" value={form.name} onChange={e=>update({name:e.target.value})} data-testid="input-intake-name"/></div>
          <div className="intake-field"><label>Date of birth<span className="opt">optional if age provided</span></label><input type="date" className="input" value={form.dob} onChange={e=>update({dob:e.target.value, age:ageFromDob(e.target.value)||form.age})} data-testid="input-intake-dob"/></div>
          <div className="intake-field"><label>Age<span className="opt">years</span></label><input className="input" inputMode="numeric" value={computedAge} onChange={e=>update({age:e.target.value.replace(/[^0-9]/g,'')})} placeholder={form.dob?'Calculated from DOB':'Enter age'} data-testid="input-intake-age"/></div>
          <div className="intake-field"><label>Sex / gender</label><select className="select" value={form.sex} onChange={e=>update({sex:e.target.value})} data-testid="select-intake-sex"><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Not recorded</option></select></div>
          <div className="intake-field"><label>Mobile number<span className="opt">optional</span></label><input className="input" value={form.mobile} onChange={e=>update({mobile:e.target.value})} data-testid="input-intake-mobile"/></div>
          <div className="intake-field full"><label>Address<span className="opt">optional</span></label><input className="input" value={form.address} onChange={e=>update({address:e.target.value})} data-testid="input-intake-address"/></div>
          <div className="intake-field"><label>Village / locality<span className="opt">optional</span></label><input className="input" value={form.village} onChange={e=>update({village:e.target.value})} data-testid="input-intake-village"/></div>
          <div className="intake-field"><label>District<span className="opt">optional</span></label><input className="input" value={form.district} onChange={e=>update({district:e.target.value})} data-testid="input-intake-district"/></div>
        </div>
      </div>
      <div className="intake-section">
        <div className="intake-section-head"><span className="intake-section-index">02</span><h2>Diabetes history</h2></div>
        <div className="intake-grid">
          <div className="intake-field full"><label>Diabetes status<span className="req">*</span></label><div className="triage-row">{TRIAGE_OPTIONS.map(opt=>(<button type="button" key={opt} className={cn('triage-option',form.diabetes.status===opt&&'selected',opt==='Unknown'&&'unknown')} onClick={()=>updateDiabetes({status:opt})}>{opt}</button>))}</div></div>
          {form.diabetes.status==='Yes'&&<>
          <div className="intake-field"><label>Type of diabetes</label><select className="select" value={form.diabetes.type} onChange={e=>updateDiabetes({type:e.target.value as DiabetesHistory['type']})} data-testid="select-intake-diabetes-type"><option value="">Select</option><option>Type 1</option><option>Type 2</option><option>Other</option><option>Unknown</option></select></div>
          <div className="intake-field"><label>Year diagnosed</label><input className="input" inputMode="numeric" value={form.diabetes.yearDiagnosed} onChange={e=>updateDiabetes({yearDiagnosed:e.target.value.replace(/[^0-9]/g,'').slice(0,4)})} placeholder="YYYY" data-testid="input-intake-year-diagnosed"/></div>
          <div className="intake-field"><label>Duration</label><input className="input" value={computedDuration} onChange={e=>updateDiabetes({duration:e.target.value})} disabled={!!form.diabetes.yearDiagnosed} placeholder={form.diabetes.yearDiagnosed?'Calculated from year diagnosed':'e.g. 5 years'}/></div>
          <div className="intake-field"><label>HbA1c<span className="opt">optional — if available</span></label><input className="input" value={form.diabetes.hba1c} onChange={e=>updateDiabetes({hba1c:e.target.value})} data-testid="input-intake-hba1c"/></div>
          <div className="intake-field"><label>Blood glucose<span className="opt">optional — if available</span></label><input className="input" value={form.diabetes.glucose} onChange={e=>updateDiabetes({glucose:e.target.value})} data-testid="input-intake-glucose"/></div>
          <div className="intake-field full"><label>Current diabetes treatment<span className="opt">optional</span></label><input className="input" value={form.diabetes.treatment} onChange={e=>updateDiabetes({treatment:e.target.value})} data-testid="input-intake-treatment"/></div>
          </>}
        </div>
      </div>
      <div className="intake-section">
        <div className="intake-section-head"><span className="intake-section-index">03</span><h2>Eye history</h2></div>
        <div className="intake-grid">
          <TriageRow label="Previous eye examination" value={form.eye.previousExam} onChange={v=>updateEye({previousExam:v})}/>
          <TriageRow label="Previous diabetic retinopathy" value={form.eye.previousDR} onChange={v=>updateEye({previousDR:v})}/>
          <div className="intake-field full"><label>Known eye condition<span className="opt">optional</span></label><input className="input" value={form.eye.knownCondition} onChange={e=>updateEye({knownCondition:e.target.value})} data-testid="input-intake-known-condition"/></div>
          <TriageRow label="Previous eye surgery" value={form.eye.previousSurgery} onChange={v=>updateEye({previousSurgery:v})}/>
          <div className="intake-field"><label>Previous eye treatment / injections<span className="opt">optional</span></label><input className="input" value={form.eye.previousTreatment} onChange={e=>updateEye({previousTreatment:e.target.value})} data-testid="input-intake-previous-treatment"/></div>
          <div className="intake-field full"><label>Previous screening date<span className="opt">optional</span></label><input type="date" className="input" value={form.eye.previousScreeningDate} onChange={e=>updateEye({previousScreeningDate:e.target.value})} data-testid="input-intake-previous-screening"/></div>
        </div>
      </div>
      <div className="intake-section">
        <div className="intake-section-head"><span className="intake-section-index">04</span><h2>Current symptoms</h2><span className="optional-note">As reported by the patient</span></div>
        <div className="symptom-grid">{SYMPTOM_OPTIONS.map(s=>(
          <button type="button" key={s} className={cn('symptom-chip',form.symptoms.selected.includes(s)&&'selected')} onClick={()=>toggleSymptom(s)}><span className="chip-dot"/>{s}</button>))}</div>
        {form.symptoms.selected.includes('Other')&&<div className="intake-field" style={{marginTop:14}}><label>Other symptoms</label><input className="input" value={form.symptoms.other} onChange={e=>setForm(f=>({...f,symptoms:{...f.symptoms,other:e.target.value}}))} data-testid="input-intake-other-symptoms"/></div>}
      </div>
      <div className="intake-section">
        <div className="intake-section-head"><span className="intake-section-index">05</span><h2>Clinical / risk information</h2></div>
        <div className="intake-grid">
          <div className="intake-field"><label>Blood pressure — systolic<span className="opt">optional</span></label><input className="input" inputMode="numeric" value={form.clinical.bpSystolic} onChange={e=>updateClinical({bpSystolic:e.target.value.replace(/[^0-9]/g,'')})} data-testid="input-intake-bp-systolic"/></div>
          <div className="intake-field"><label>Blood pressure — diastolic<span className="opt">optional</span></label><input className="input" inputMode="numeric" value={form.clinical.bpDiastolic} onChange={e=>updateClinical({bpDiastolic:e.target.value.replace(/[^0-9]/g,'')})} data-testid="input-intake-bp-diastolic"/></div>
          <div className="intake-field full"><label>Family history<span className="opt">optional</span></label><input className="input" value={form.clinical.familyHistory} onChange={e=>updateClinical({familyHistory:e.target.value})} data-testid="input-intake-family-history"/></div>
          <div className="intake-field full"><label>Previous screening date<span className="opt">optional</span></label><input type="date" className="input" value={form.clinical.previousScreeningDate} onChange={e=>updateClinical({previousScreeningDate:e.target.value})} data-testid="input-intake-clinical-previous-screening"/></div>
          <div className="intake-field full"><label>Additional clinical notes<span className="opt">optional</span></label><textarea className="textarea" rows={3} value={form.clinical.notes} onChange={e=>updateClinical({notes:e.target.value})} data-testid="textarea-intake-notes"/></div>
        </div>
      </div>
      <div className="intake-section">
        <div className="intake-section-head"><span className="intake-section-index">06</span><h2>Consent</h2><span className="optional-note">Required before screening</span></div>
        <label className="consent-item"><input type="checkbox" checked={form.consent.photography} onChange={e=>update({consent:{...form.consent,photography:e.target.checked}})} data-testid="checkbox-consent-photography"/><span>Patient has provided consent for retinal photography and AI-assisted screening.</span></label>
        <label className="consent-item"><input type="checkbox" checked={form.consent.aiAcknowledgement} onChange={e=>update({consent:{...form.consent,aiAcknowledgement:e.target.checked}})} data-testid="checkbox-consent-ai"/><span>I understand that AI assists screening and does not replace clinical judgment.<small>AI assists. Doctors decide.</small></span></label>
        <label className="consent-item"><input type="checkbox" checked={form.consent.dataStorage} onChange={e=>update({consent:{...form.consent,dataStorage:e.target.checked}})} data-testid="checkbox-consent-storage"/><span>Patient has provided consent for storing screening information.</span></label>
      </div>
      {!!errors.length&&<div className="notice" style={{marginTop:20,borderLeftColor:'#C96F73',background:'#F3DFE2'}}><AlertCircle size={16} style={{color:'#C96F73'}}/><div><strong>Before creating the case</strong><br/>{errors.map(e=><span key={e} style={{display:'block'}}>{e}</span>)}</div></div>}
      <div className="wizard-footer"><span/><button className="btn btn-primary" onClick={createCase} data-testid="button-create-screening-case">Create screening case <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===2&&<DirectionalPanel panelKey="upload"><div>
      <div className="wizard-section-title"><span className="wizard-section-number">02</span><h2>Upload retinal images</h2></div>
      <p className="subtitle">Attach the fundus photographs for this screening case. JPG, JPEG, or PNG.</p>
      <div className="eye-upload-grid">
        <div className="eye-upload-card">
          <div className="eye-title"><strong>Right eye · OD</strong>{rightEye?<span className="eye-upload-ok"><CheckCircle2 size={13}/>Uploaded</span>:<span className="eye-upload-missing"><AlertCircle size={13}/>No right-eye image uploaded</span>}</div>
          <input ref={rightRef} type="file" accept=".jpg,.jpeg,.png" hidden onChange={e=>attachEye('OD',e.target.files)}/>
          <div className={cn('dropzone',dragEye==='OD'&&'is-dragging')} onClick={()=>rightRef.current?.click()} onDragEnter={e=>{e.preventDefault();setDragEye('OD')}} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragEye('')} onDrop={e=>{e.preventDefault();setDragEye('');attachEye('OD',e.dataTransfer.files)}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')rightRef.current?.click()}} data-testid="dropzone-right-eye"><div><Upload size={22}/><strong>{dragEye==='OD'?'Release to attach':'Upload image'}</strong><p className="row-detail">or drag and drop</p></div></div>
          {rightEye&&<div className="file-chip"><FileImage size={16}/><div className="row-grow"><div className="row-title">{rightEye.name}</div><div className="row-detail">{rightEye.size} · linked to {activeCase?.id}</div></div><button className="file-remove" aria-label="Remove right-eye image" onClick={()=>setRightEye(null)}><X size={14}/></button></div>}
        </div>
        <div className="eye-upload-card">
          <div className="eye-title"><strong>Left eye · OS</strong>{leftEye?<span className="eye-upload-ok"><CheckCircle2 size={13}/>Uploaded</span>:<span className="eye-upload-missing"><AlertCircle size={13}/>No left-eye image uploaded</span>}</div>
          <input ref={leftRef} type="file" accept=".jpg,.jpeg,.png" hidden onChange={e=>attachEye('OS',e.target.files)}/>
          <div className={cn('dropzone',dragEye==='OS'&&'is-dragging')} onClick={()=>leftRef.current?.click()} onDragEnter={e=>{e.preventDefault();setDragEye('OS')}} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragEye('')} onDrop={e=>{e.preventDefault();setDragEye('');attachEye('OS',e.dataTransfer.files)}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')leftRef.current?.click()}} data-testid="dropzone-left-eye"><div><Upload size={22}/><strong>{dragEye==='OS'?'Release to attach':'Upload image'}</strong><p className="row-detail">or drag and drop</p></div></div>
          {leftEye&&<div className="file-chip"><FileImage size={16}/><div className="row-grow"><div className="row-title">{leftEye.name}</div><div className="row-detail">{leftEye.size} · linked to {activeCase?.id}</div></div><button className="file-remove" aria-label="Remove left-eye image" onClick={()=>setLeftEye(null)}><X size={14}/></button></div>}
        </div>
      </div>
      <div className="report-upload-card">
        <div className="eye-title"><strong>Supporting report</strong>{caseReports.length?<span className="eye-upload-ok"><CheckCircle2 size={13}/>{caseReports.length} uploaded</span>:<span className="eye-upload-missing"><AlertCircle size={13}/>No supporting report</span>}</div>
        <p className="row-detail" style={{marginTop:8}}>Optional. PDF, JPG, JPEG, or PNG. Supporting clinical information only — uploading a report does not trigger retinal analysis.</p>
        <input ref={reportRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={e=>{attachReport(e.target.files); e.target.value='';}}/>
        <button type="button" className="btn btn-secondary" style={{marginTop:10}} onClick={()=>reportRef.current?.click()} data-testid="button-upload-case-report"><Plus size={14}/> Upload report</button>
        {caseReports.map(r=><div className="file-chip" key={r.id}><FileText size={16}/><div className="row-grow"><div className="row-title">{r.name}</div><div className="row-detail">{r.size} · linked to {r.caseId}</div></div><button className="file-remove" aria-label={`Remove ${r.name}`} onClick={()=>setCaseReports(rs=>rs.filter(x=>x.id!==r.id))}><X size={14}/></button></div>)}
      </div>
      <div className="wizard-footer"><span/><button className="btn btn-primary" onClick={()=>{syncCase();setStage(3);}} data-testid="button-continue-quality">Continue to quality <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===3&&<DirectionalPanel panelKey="quality"><div className="wizard-step-content">
      <div className="wizard-section-title"><span className="wizard-section-number">03</span><h2>Image quality</h2></div>
      <div className="empty" style={{padding:'26px 0'}}><ScanEye size={28}/><p>Quality analysis pending</p><p className="tiny muted">Quality assessment will appear after image processing is connected.</p></div>
      <div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage(2)} data-testid="button-back-upload"><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" onClick={()=>setStage(4)} data-testid="button-continue-screen">Continue <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===4&&<DirectionalPanel panelKey="screen"><div className="wizard-step-content">
      <div className="wizard-section-title"><span className="wizard-section-number">04</span><h2>AI-assisted screening</h2></div>
      <div className="empty" style={{padding:'26px 0'}}><ScanEye size={28}/><p>AI analysis pending</p><p className="tiny muted">No analysis has been performed on these images. Screening will run once model integration is connected.</p></div>
      <div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage(3)}><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" onClick={()=>setStage(5)} data-testid="button-continue-findings">Continue <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===5&&<DirectionalPanel panelKey="findings"><div className="wizard-step-content">
      <div className="wizard-section-title"><span className="wizard-section-number">05</span><h2>Screening findings</h2></div>
      <div className="empty" style={{padding:'26px 0'}}><FileSearch size={28}/><p>No AI findings available</p><p className="tiny muted">Findings will appear after AI-assisted screening is connected.</p></div>
      <div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage(4)}><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" onClick={()=>setStage(6)} data-testid="button-continue-priority">Continue <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===6&&<DirectionalPanel panelKey="priority"><div className="wizard-step-content">
      <div className="wizard-section-title"><span className="wizard-section-number">06</span><h2>Screening priority</h2></div>
      <div className="empty" style={{padding:'26px 0'}}><AlertCircle size={28}/><p>Priority pending</p><p className="tiny muted">Screening priority will be calculated after analysis.</p></div>
      <div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage(5)}><ArrowLeft size={14}/> Back</button><button className="btn btn-primary" onClick={()=>setStage(7)} data-testid="button-continue-escalate">Continue <ArrowRight size={14}/></button></div>
    </div></DirectionalPanel>}
    {stage===7&&<DirectionalPanel panelKey="escalate"><div className="wizard-step-content">
      <div className="wizard-section-title"><span className="wizard-section-number">07</span><h2>Escalation</h2></div>
      {!escalated?<>
      <p className="subtitle">The screening workflow is complete. Escalate this case for clinical review by a specialist. Your responsibility as the screening operator ends here — the clinical decision belongs to the reviewing doctor.</p>
      <div className="notice" style={{marginTop:16}}><ShieldCheck size={16}/><div><strong>Escalate for clinical review</strong><br/>The case will be sent to the doctor portal with the patient details, images, reports, and screening status. AI assists. Doctors decide.</div></div>
      <div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage(6)} data-testid="button-back-priority"><ArrowLeft size={14}/> Back</button><button className="btn btn-danger" onClick={escalate} data-testid="button-escalate-case"><Stethoscope size={14}/> Escalate to doctor</button></div>
      </>:<div className="card success" style={{marginTop:6}}>
        <div className="success-mark"><Check size={25}/></div>
        <div className="eyebrow">Case escalated</div>
        <h2 style={{marginTop:8}}>Case sent to doctor portal</h2>
        <p className="subtitle">The case is now available for specialist review. Status: awaiting specialist review.</p>
        <div style={{display:'flex',justifyContent:'center',gap:9,marginTop:20}}>
          <button className="btn btn-secondary" onClick={()=>setLocation('/dashboard')} data-testid="button-back-to-overview">Back to overview</button>
          <Link className="btn btn-primary" href="/doctor/cases" data-testid="link-view-doctor-queue">View doctor queue <ArrowRight size={14}/></Link>
        </div>
      </div>}
    </div></DirectionalPanel>}
  </Reveal>
  </div></AppShell>;
}
/* Superseded single-step upload panel — retained unused; replaced by the patient-specific workflow above. */
function ScreeningNewLegacy() {
  const [,setLocation]=useLocation(); const [files,setFiles]=useState<FundusImage[]>([]); const [reports,setReports]=useState<string[]>([]); const [dragOver,setDragOver]=useState(false); const inputRef=useRef<HTMLInputElement>(null);
  const addFiles=(list:FileList|null)=>{if(!list)return; const added=Array.from(list).map((f,i)=>({id:`new-${Date.now()}-${i}`,eye:(files.length%2===0?'OD':'OS') as 'OD'|'OS',name:f.name,size:`${(f.size/1024/1024||1.2).toFixed(1)} MB`,quality:'Pending check'}));setFiles([...files,...added]);};
  return <AppShell title="New screening"><div className="wizard-card"><Reveal className="page-heading"><div><div className="eyebrow">Screening workspace · New</div><h1 style={{marginTop:8}}>Start with your images</h1><p className="subtitle">Bring the fundus photographs and reports you already have.</p></div><div className="notice" style={{maxWidth:260}}><ShieldCheck size={15}/><span>Prototype output only. No diagnosis is made here.</span></div></Reveal><div className="card card-pad"><div className="progress-line"><div className="step active"><span className="step-dot">1</span><span>Upload</span></div><span className="step-line"/><div className="step"><span className="step-dot">2</span><span>Quality check</span></div><span className="step-line"/><div className="step"><span className="step-dot">3</span><span>Review</span></div></div>
       <h2>Fundus images</h2><p className="subtitle">Add one or both eyes. JPG, PNG, or TIFF · max 20 MB each.</p><input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={e=>addFiles(e.target.files)}/><div className={cn('dropzone',dragOver&&'is-dragging')} style={{marginTop:18}} onClick={()=>inputRef.current?.click()} onDragEnter={e=>{e.preventDefault();setDragOver(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);addFiles(e.dataTransfer.files)}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')inputRef.current?.click()}} data-testid="dropzone-fundus-images"><div><Upload size={25}/><strong>{dragOver?'Release to add images':'Choose fundus images'}</strong><p className="row-detail">or drag and drop them here</p></div></div><AnimatePresence initial={false}>{files.map(f=><motion.div className="file-chip file-chip-reveal" key={f.id} initial={{opacity:0,x:-16,clipPath:'inset(0 100% 0 0)'}} animate={{opacity:1,x:0,clipPath:'inset(0 0% 0 0)'}} exit={{opacity:0,x:16,clipPath:'inset(0 0 0 100%)'}} transition={{duration:.38,ease:editorialEase}}><FileImage size={18}/><div className="row-grow"><div className="row-title">{f.name}</div><div className="row-detail">{f.eye} · {f.size} · {f.quality}</div></div><button className="file-remove" aria-label={`Remove ${f.name}`} onClick={()=>setFiles(files.filter(x=>x.id!==f.id))} data-testid={`button-remove-image-${f.id}`}><X size={16}/></button></motion.div>)}</AnimatePresence><div className="section-row"><div><h2>Supporting reports</h2><p className="subtitle">Optional referral notes, labs, or clinical context.</p></div><label className="btn btn-secondary" htmlFor="report-upload" data-testid="label-upload-report"><Plus size={14}/> Add report</label><input id="report-upload" type="file" hidden accept=".pdf,.doc,.docx" onChange={e=>{if(e.target.files?.[0])setReports([...reports,e.target.files[0].name])}}/></div><AnimatePresence initial={false}>{reports.map(r=><motion.div className="file-chip file-chip-reveal" key={r} initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:16}} transition={{duration:.34,ease:editorialEase}}><FileText size={18}/><div className="row-grow"><div className="row-title">{r}</div><div className="row-detail">Supporting report</div></div><button className="file-remove" onClick={()=>setReports(reports.filter(x=>x!==r))} aria-label={`Remove ${r}`}><X size={16}/></button></motion.div>)}</AnimatePresence><div className="wizard-footer"><Link className="btn btn-secondary" href="/dashboard" data-testid="link-cancel-screening">Cancel</Link><button className="btn btn-primary" disabled={!files.length} onClick={()=>setLocation('/screening/scr-1048')} data-testid="button-continue-screening">Continue to quality check <ArrowRight size={14}/></button></div></div></div></AppShell>;
}

function ScreeningDetail({onEscalate}:{onEscalate:(caseId:string)=>void}) {
  const {id}=useParams(); const [stage,setStage]=useState<'quality'|'analysis'|'results'|'review'>('quality');
  const next=()=>setStage(stage==='quality'?'analysis':stage==='analysis'?'results':stage==='results'?'review':'review');
  return <AppShell title={`Screening ${id||'scr-1048'}`}><div className="page-heading-enhanced"><div><Link className="link" href="/patients" data-testid="link-back-patient-profile"><ArrowLeft size={13}/> Patients</Link><h1 style={{marginTop:10}}>Screening review</h1><p className="subtitle">Uploaded images are being prepared for AI-assisted screening.</p></div><span className="pill pill-slate">Screening in progress</span></div><div className="card card-pad"><div className="progress-line"><div className={cn('step',stage!=='quality'?'done':'active')}><span className="step-dot">{stage!=='quality'?<Check size={12}/>:1}</span><span>Quality check</span></div><span className="step-line"/><div className={cn('step',stage==='analysis'?'active':stage==='results'||stage==='review'?'done':'')}><span className="step-dot">{stage==='results'||stage==='review'?<Check size={12}/>:2}</span><span>Analysis</span></div><span className="step-line"/><div className={cn('step',stage==='results'?'active':stage==='review'?'done':'')}><span className="step-dot">{stage==='review'?<Check size={12}/>:3}</span><span>Results</span></div><span className="step-line"/><div className={cn('step',stage==='review'&&'active')}><span className="step-dot">4</span><span>Escalation</span></div></div>
      {stage==='quality'&&<div className="wizard-step-content"><div className="wizard-section-title"><span className="wizard-section-number">01</span><h2>Image quality check</h2></div><p className="subtitle">Upload images to begin quality assessment.</p><div className="quality-checks" style={{marginTop:18}}><div className="quality-check"><CheckCircle2 size={16}/><span>Quality analysis pending</span></div></div><div className="wizard-footer"><span/><button className="btn btn-primary" onClick={next} data-testid="button-run-analysis">Continue <ArrowRight size={14}/></button></div></div>}
      {stage==='analysis'&&<div className="analysis-box"><div><div className="analysis-ring"/><h2>Reviewing the image set</h2><p className="subtitle">Prototype indicators are being prepared locally.<br/>This usually takes a few seconds in the demo.</p><button className="btn btn-secondary" style={{marginTop:20}} onClick={next} data-testid="button-view-analysis-results">View results</button></div></div>}
      {stage==='results'&&<div className="wizard-step-content"><div className="notice"><AlertCircle size={16}/><div><strong>Screening complete</strong><br/>This system is awaiting AI model integration. No clinical conclusions are generated.</div></div><div className="card card-pad" style={{marginTop:18}}><div className="eyebrow">AI Screening</div><div className="empty" style={{padding:'20px 0'}}><ScanEye size={28}/><p>Awaiting AI analysis</p><p className="tiny muted">AI analysis will appear after model integration.</p></div></div><div className="card card-pad" style={{marginTop:18}}><div className="eyebrow">Screening Priority</div><div className="empty" style={{padding:'20px 0'}}><AlertCircle size={28}/><p>Priority pending</p><p className="tiny muted">Priority will be calculated after analysis.</p></div></div><div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage('quality')} data-testid="button-back-quality"><ArrowLeft size={14}/> Back</button><button className="btn btn-danger" onClick={()=>onEscalate(id||'')} data-testid="button-escalate-doctor"><Stethoscope size={14}/> Escalate to doctor</button><button className="btn btn-primary" onClick={next} data-testid="button-open-doctor-review">Continue <ArrowRight size={14}/></button></div></div>}
      {stage==='review'&&<div className="wizard-step-content"><div className="notice"><ShieldCheck size={16}/><div><strong>Screening workflow complete</strong><br/>This case is ready for escalation to the doctor portal for specialist review.</div></div><div className="wizard-section-title" style={{marginTop:23}}><span className="wizard-section-number">04</span><h2>Next step</h2></div><p className="subtitle">Escalate this case to the doctor portal for specialist evaluation.</p><div className="wizard-footer"><button className="btn btn-secondary" onClick={()=>setStage('results')} data-testid="button-back-results"><ArrowLeft size={14}/> Back</button><button className="btn btn-danger" onClick={()=>onEscalate(id||'')} data-testid="button-escalate-doctor-review"><Stethoscope size={14}/> Escalate to doctor</button></div></div>}
    </div></AppShell>;
}

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

function DoctorDashboard({cases}:{cases:ReferredCase[]}) {
  const awaiting = cases.filter(c=>c.status !== 'Reviewed');
  const highPriority = cases.filter(c=>c.priority === 'High' && c.status !== 'Reviewed');
  const reviewed = cases.filter(c=>c.status === 'Reviewed');
  const followUps = demoFollowUps.length;
  return <AppShell title="Doctor dashboard">
    <Reveal className="doctor-hero"><div><div className="eyebrow">Doctor portal · Specialist review desk</div><h1 style={{marginTop:8}}>A clear queue for careful decisions.</h1><p className="subtitle">Prioritize referred cases, inspect evidence, and record the final clinical decision.</p></div><Link className="btn btn-secondary" href="/doctor/cases" data-testid="link-open-referred-cases"><ClipboardCheck size={15}/> Open referred cases</Link></Reveal>
    <Reveal className="notice doctor-notice" delay={.04}><Stethoscope size={16}/><div><strong>Doctor portal</strong> · This workspace receives escalated cases from the clinical screening portal. <span>AI assists. Doctors decide.</span></div></Reveal>
    <Reveal className="doctor-metrics" delay={.08}>
      <div className="doctor-metric doctor-metric-accent"><span className="eyebrow">New referrals</span><strong>{cases.filter(c=>c.status==='Awaiting review').length || '—'}</strong><span>Need first review</span></div>
      <div className="doctor-metric"><span className="eyebrow">High priority</span><strong>{highPriority.length || '—'}</strong><span>Across current queue</span></div>
      <div className="doctor-metric"><span className="eyebrow">Awaiting review</span><strong>{awaiting.length || '—'}</strong><span>Open specialist work</span></div>
      <div className="doctor-metric"><span className="eyebrow">Follow-ups</span><strong>{followUps || '—'}</strong><span>Scheduled monitoring</span></div>
    </Reveal>
    <div className="doctor-dashboard-grid">
      <Reveal className="card card-pad doctor-priority-panel" delay={.12}>
        <div className="section-row" style={{marginTop:0}}><div><div className="eyebrow">Triage now</div><h2 style={{marginTop:7}}>Priority review</h2></div><Link className="link" href="/doctor/cases">View queue <ArrowRight size={12}/></Link></div>
        {highPriority.slice(0,3).map((item,index)=><Link className="doctor-case-row" href={`/doctor/cases/${item.id}`} key={item.id} data-testid={`link-priority-case-${item.id}`}>
          <span className="queue-index">0{index+1}</span><div className="row-grow"><strong>{item.patientName}</strong><span>{item.id} · {item.screeningDate}</span><small>{item.summary}</small></div><span className={cn('pill',item.status==='Awaiting review'?'pill-red':'pill-amber')}>{item.status}</span><ArrowRight size={14}/>
        </Link>)}
        {!highPriority.length&&<div className="empty"><CheckCircle2 size={24}/><p>No high-priority cases are waiting.</p></div>}
      </Reveal>
      <Reveal className="card card-pad trend-panel" delay={.16}>
        <div className="eyebrow">Screening trend</div><div className="trend-heading"><div><h2 style={{marginTop:7}}>Review volume</h2><p className="subtitle">Referred cases by screening week</p></div><TrendingUp size={20}/></div>
        <div className="empty" style={{padding:'24px 0'}}><TrendingUp size={24}/><p>No trend data available</p><p className="tiny muted">Screening volume will appear once cases are recorded.</p></div>
      </Reveal>
    </div>
    <Reveal className="card card-pad doctor-lower-grid" delay={.2}>
      <div><div className="eyebrow">Awaiting review</div><h2 style={{marginTop:7}}>Next in line</h2>{awaiting.slice(0,3).map(item=><Link className="compact-case" href={`/doctor/cases/${item.id}`} key={item.id}><span className="initials">{initials(item.patientName)}</span><span className="row-grow"><strong>{item.patientName}</strong><small>{item.reason}</small></span><span className={cn('pill',item.priority==='High'?'pill-red':'pill-amber')}>{item.priority}</span></Link>)}</div>
      <div><div className="eyebrow">Follow-up pulse</div><h2 style={{marginTop:7}}>Care continuity</h2>{demoFollowUps.slice(0,3).map(item=><div className="compact-case" key={item.id}><span className="activity-icon"><CalendarDays size={14}/></span><span className="row-grow"><strong>{item.patient}</strong><small>{item.reason}</small></span><span className={cn('pill',item.urgency==='Overdue'?'pill-red':'pill-slate')}>{item.urgency}</span></div>)}<Link className="link" style={{display:'inline-flex',marginTop:10}} href="/doctor/follow-ups">Open follow-ups <ArrowRight size={12}/></Link></div>
    </Reveal>
  </AppShell>;
}

function DoctorCases({cases}:{cases:ReferredCase[]}) {
  const [query,setQuery] = useState(''); const [filter,setFilter] = useState('All');
  const filtered = cases.filter(item => (item.patientName+item.id+item.summary).toLowerCase().includes(query.toLowerCase()) && (filter==='All'||item.status===filter));
  return <AppShell title="Referred cases">
    <Reveal className="page-heading"><div><div className="eyebrow">Doctor portal · Case queue</div><h1 style={{marginTop:8}}>Referred cases</h1><p className="subtitle">Cases prioritized by frontline screening teams for specialist evaluation.</p></div><div className="case-queue-count"><span className="eyebrow">Open queue</span><strong>{cases.filter(c=>c.status!=='Reviewed').length}</strong></div></Reveal>
    <Reveal className="card card-pad" delay={.07}><div className="queue-toolbar"><div className="search"><Search size={15}/><input className="input" placeholder="Search patient, case ID, or finding" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-doctor-cases"/></div><select className="select" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter case status" data-testid="select-doctor-case-status"><option>All</option><option>Awaiting review</option><option>In review</option><option>Reviewed</option></select></div>
      <div className="referred-list">{filtered.map(item=><div className="referred-case" key={item.id}><div className="referred-case-id"><span className="eyebrow">Case ID</span><strong>{item.id}</strong><span>{item.screeningDate}</span></div><div className="referred-case-patient"><div className="patient-cell"><span className="initials">{initials(item.patientName)}</span><span><strong>{item.patientName}</strong><br/><span className="tiny muted">{item.patientId} · AI-assisted screening</span></span></div></div><div className="referred-case-summary"><span className={cn('pill',item.priority==='High'?'pill-red':'pill-amber')}>{item.priority} priority</span><strong>{item.summary}</strong><span>{item.reason}</span></div><div className="referred-case-status"><span className={cn('pill',item.status==='Reviewed'?'pill-success':item.status==='In review'?'pill-amber':'pill-red')}>{item.status}</span><Link className="btn btn-primary" href={`/doctor/cases/${item.id}`} data-testid={`button-review-case-${item.id}`}>Review case <ArrowRight size={14}/></Link></div></div>)}</div>
      {!filtered.length&&<div className="empty"><FileSearch size={25}/><p>No referred cases match this view.</p><button className="btn btn-secondary" onClick={()=>{setQuery('');setFilter('All')}}>Reset queue</button></div>}
    </Reveal>
  </AppShell>;
}

function DoctorCaseReview({cases,patients,onDecision}:{cases:ReferredCase[];patients:Patient[];onDecision:(id:string,decision:'Monitor'|'Refer',note:string)=>void}) {
  const {id} = useParams(); const current = cases.find(item=>item.id===id) || cases[0]; const patient = patients.find(item=>item.id===current.patientId) || patients[0];
  const [decision,setDecision] = useState<'Monitor'|'Refer'|''>(current.decision||''); const [note,setNote] = useState(current.note||'');
  if (!current || !patient) return <AppShell title="Case review"><div className="empty"><FileSearch size={28}/><p>This referred case is not available.</p><Link className="btn btn-primary" style={{marginTop:18}} href="/doctor/cases">Back to referred cases</Link></div></AppShell>;
  const saveDecision = () => { if(decision){ onDecision(current.id,decision,note); } };
  return <AppShell title={`Review ${current.id}`}>
    <Reveal className="review-back"><Link className="link" href="/doctor/cases" data-testid="link-back-doctor-cases"><ArrowLeft size={13}/> Referred cases</Link><span className="doctor-safety-line"><ShieldCheck size={14}/> AI-assisted screening · Requires clinical review</span></Reveal>
    <Reveal className="review-header" delay={.05}><div className="review-patient"><div className="profile-initials">{patient.initials}</div><div><div className="eyebrow">Specialist case review</div><h1 style={{marginTop:7}}>{patient.name}</h1><p className="subtitle">{patient.id} · {patient.age} years · {patient.sex} · {patient.village}{current.screeningDate ? ` · screened ${current.screeningDate}` : ''}</p></div></div><div className="review-header-meta"><span className={cn('pill',current.priority==='High'?'pill-red':'pill-amber')}>{current.priority} priority</span><span className={cn('pill',current.status==='Reviewed'?'pill-success':'pill-slate')}>{current.status}</span></div></Reveal>
    <div className="review-layout">
      <div className="review-main">
        {current.summary ? (
        <Reveal className="card card-pad" delay={.08}><div className="section-row" style={{marginTop:0}}><div><div className="eyebrow">Screening summary</div><h2 style={{marginTop:7}}>Possible finding detected</h2></div></div><p className="review-summary">{current.summary}. This is a screening signal, not a definitive diagnosis.</p><div className="review-summary-grid"><div><span className="eyebrow">Escalation reason</span><strong>{current.reason}</strong></div><div><span className="eyebrow">Screening quality</span><strong>Pending</strong></div><div><span className="eyebrow">Screening pathway</span><strong>Frontline → specialist</strong></div></div></Reveal>
      ) : (
        <Reveal className="card card-pad" delay={.08}><div className="eyebrow">Screening summary</div><div className="empty" style={{padding:'20px 0'}}><FileSearch size={24}/><p>No screening summary available</p><p className="tiny muted">Awaiting screening data.</p></div></Reveal>
      )}
        <Reveal className="card card-pad" delay={.12}><div className="section-row" style={{marginTop:0}}><div><div className="eyebrow">Current evidence</div><h2 style={{marginTop:7}}>Fundus images</h2></div><span className="tiny muted">{current.screeningDate || 'Date not available'}</span></div><div className="empty" style={{padding:'20px 0'}}><FileImage size={24}/><p>No fundus images uploaded</p><p className="tiny muted">Images will appear once uploaded at screening.</p></div></Reveal>
        <Reveal className="card card-pad" delay={.16}><div className="eyebrow">AI findings</div><h2 style={{marginTop:7}}>What did the AI detect?</h2><p className="subtitle">Possible findings are presented for clinical review and should be interpreted with patient history.</p><div className="empty" style={{padding:"20px 0"}}><ScanEye size={24}/><p>No AI findings available</p><p className="tiny muted">AI analysis has not been run for this case.</p></div><div className="confidence-indicator"><div className="confidence-indicator-inner"><span className="eyebrow">AI confidence</span><div className="confidence-value">Not available</div><div className="confidence-track"><div className="confidence-track-fill" style={{width:"0%"}}/></div></div><span className="tiny muted">Awaiting analysis</span></div><div className="explainability-enhanced"><div className="explainability-details"><div className="eyebrow">Explainability</div><h3 style={{marginTop:5}}>What visual evidence supports the finding?</h3><p className="row-detail">No explainability data is available. This will appear once AI analysis is connected.</p></div></div></Reveal>
        <Reveal className="card card-pad" delay={.2}><div className="section-row" style={{marginTop:0}}><div><div className="eyebrow">Longitudinal comparison</div><h2 style={{marginTop:7}}>Previous vs current</h2></div><GitCompare size={19} color="#7897A8"/></div><div className="empty" style={{padding:"20px 0"}}><GitCompare size={24}/><p>No longitudinal data available</p><p className="tiny muted">Comparison will appear once previous screenings exist.</p></div></Reveal>
      </div>
      <aside className="review-rail">
        <Reveal className="card card-pad" delay={.1}><div className="eyebrow">Patient information</div><div className="rail-facts"><div><span>Phone</span><strong>{patient.phone || '—'}</strong></div><div><span>Risk context</span><strong>{patient.risk || '—'}</strong></div><div><span>Last screening</span><strong>{patient.lastScreening || '—'}</strong></div></div><Link className="link" href={`/patients/${patient.id}`}>Open patient history <ArrowRight size={12}/></Link></Reveal>
        <Reveal className="card card-pad" delay={.14}><div className="section-row" style={{marginTop:0}}><div><div className="eyebrow">Available reports</div><h2 style={{marginTop:7}}>Clinical context</h2></div><FileText size={17} color="hsl(var(--scientific))"/></div>{demoReports.length ? demoReports.slice(0,3).map(report=><div className="rail-report" key={report.id}><FileText size={14}/><div className="row-grow"><strong>{report.type}</strong><span>{report.date} · {report.size}</span></div><button className="icon-button" aria-label={`Open ${report.name}`} onClick={()=>alert('Report opened for review.')}><Eye size={14}/></button></div>) : <div className="empty" style={{padding:'16px 0'}}><FileText size={20}/><p>No report uploaded</p><p className="tiny muted">Reports will appear once uploaded.</p></div>}</Reveal>
        <Reveal className="card card-pad final-decision-enhanced" delay={.18}>
          <div className="final-decision-header"><Stethoscope size={18}/><div><div className="eyebrow">Doctor review</div><h3>Make the final decision</h3></div></div>
          <p className="row-detail">Consider the screening summary, visual evidence, patient history, and comparison together.</p>
          <div className="notice safety-note"><ShieldCheck size={14}/><span>AI assists. Doctors decide.</span></div>
          <div className="final-decision-buttons">
            <button className={cn('final-decision-btn',decision==='Monitor'&&'selected-monitor')} onClick={()=>setDecision('Monitor')} data-testid="button-doctor-monitor"><UserCheck size={16}/><span><strong>Monitor</strong><small>Continue clinical follow-up</small></span>{decision==='Monitor'&&<Check size={15}/>}</button>
            <button className={cn('final-decision-btn',decision==='Refer'&&'selected-refer')} onClick={()=>setDecision('Refer')} data-testid="button-doctor-refer"><Stethoscope size={16}/><span><strong>Refer</strong><small>Specialist evaluation recommended</small></span>{decision==='Refer'&&<Check size={15}/>}</button>
          </div>
          <div className="field" style={{marginTop:16}}><label htmlFor="doctor-review-note">Doctor note</label><textarea id="doctor-review-note" className="textarea" value={note} onChange={e=>setNote(e.target.value)} placeholder="Document the context behind your decision" data-testid="textarea-doctor-review-note"/></div>
          <button className="btn btn-primary" style={{width:'100%',marginTop:13}} disabled={!decision} onClick={saveDecision} data-testid="button-save-doctor-decision"><Check size={14}/> Save final decision</button>
          {current.status==='Reviewed'&&<p className="tiny muted" style={{marginTop:10}}>Decision saved in this demo workspace. You can update it and save again.</p>}
        </Reveal>
      </aside>
    </div>
  </AppShell>;
}

function DoctorFollowUps() {
  const [filter,setFilter] = useState('All');
  const rows = demoFollowUps.filter(item=>filter==='All'||item.urgency===filter);
  return <AppShell title="Doctor follow-ups">
    <Reveal className="page-heading"><div><div className="eyebrow">Doctor portal · Continuity</div><h1 style={{marginTop:8}}>Follow-ups</h1><p className="subtitle">Keep referred patients moving from review into the next appropriate step.</p></div><div className="notice" style={{maxWidth:280}}><CalendarDays size={15}/><span>Follow-up actions are mock workflow records.</span></div></Reveal>
    <Reveal className="doctor-followup-layout" delay={.08}><div className="card card-pad"><div className="toolbar"><div><div className="eyebrow">Care plan queue</div><h2 style={{marginTop:7}}>Open follow-ups</h2></div><select className="select" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter doctor follow-ups" data-testid="select-doctor-follow-up-filter"><option>All</option><option>Due today</option><option>This week</option><option>Upcoming</option><option>Overdue</option></select></div>{rows.map(item=><div className="doctor-followup-row" key={item.id}><div className={cn('activity-icon',item.urgency==='Overdue'&&'followup-alert')}><CalendarDays size={15}/></div><div className="row-grow"><strong>{item.patient}</strong><span>{item.reason}</span><small>Due {item.due}</small></div><span className={cn('pill',item.urgency==='Overdue'?'pill-red':item.urgency==='Due today'?'pill-amber':'pill-slate')}>{item.urgency}</span><button className="btn btn-quiet" onClick={()=>alert(`Marked ${item.patient} complete in demo.`)} data-testid={`button-doctor-complete-${item.id}`}><Check size={15}/></button></div>)}{!rows.length&&<div className="empty"><CalendarDays size={24}/><p>No follow-ups in this view.</p></div>}</div><div className="doctor-followup-aside"><div className="eyebrow">Clinical cadence</div><h2 style={{marginTop:7}}>Review → plan → return</h2><p className="subtitle">A doctor decision can create a clear next step without turning a screening signal into a diagnosis.</p><div className="cadence-step"><span>01</span><strong>Review evidence</strong><small>Images, context, reports</small></div><div className="cadence-step"><span>02</span><strong>Choose Monitor or Refer</strong><small>Doctor remains final decision-maker</small></div><div className="cadence-step"><span>03</span><strong>Track follow-up</strong><small>Keep care continuity visible</small></div></div></Reveal>
  </AppShell>;
}

function Settings() {
  const [notifications,setNotifications]=useState(true); const [digest,setDigest]=useState(true); const [offline,setOffline]=useState(true); const [density,setDensity]=useState('Comfortable');
  return <AppShell title="Settings"><div className="page-heading"><div><div className="eyebrow">Workspace preferences</div><h1 style={{marginTop:8}}>Settings</h1><p className="subtitle">Make RetinoAI fit the way your team works.</p></div></div><div className="card" style={{maxWidth:840}}><div className="setting-section"><div className="eyebrow">Profile</div><div className="setting-row"><div><div className="row-title">Screening operator</div><div className="row-detail">Retinal screening workspace</div></div><button className="btn btn-secondary" onClick={()=>alert('Profile editing is not available in this prototype.')} data-testid="button-edit-profile"><Pencil size={13}/> Edit profile</button></div></div><div className="setting-section"><div className="eyebrow">Notifications</div><div className="setting-row"><div><div className="row-title">Review reminders</div><div className="row-detail">Get a reminder when a screening is waiting for a decision.</div></div><button className={cn('switch',notifications&&'on')} onClick={()=>setNotifications(!notifications)} aria-label="Toggle review reminders" data-testid="switch-notifications"><span/></button></div><div className="setting-row"><div><div className="row-title">Daily follow-up digest</div><div className="row-detail">A simple summary for the start of your clinic day.</div></div><button className={cn('switch',digest&&'on')} onClick={()=>setDigest(!digest)} aria-label="Toggle daily digest" data-testid="switch-digest"><span/></button></div></div><div className="setting-section"><div className="eyebrow">Privacy & display</div><div className="setting-row"><div><div className="row-title">Workspace display</div><div className="row-detail">Choose how much information is visible in lists.</div></div><select className="select" value={density} onChange={e=>setDensity(e.target.value)} data-testid="select-display-density"><option>Comfortable</option><option>Compact</option></select></div><div className="setting-row"><div><div className="row-title">Prototype labels</div><div className="row-detail">Keep safety labels visible throughout screening review.</div></div><span className="pill pill-teal">Always on</span></div></div><div className="setting-section"><div className="eyebrow">Offline-first workspace</div><div className="setting-row"><div><div className="row-title">Keep recent work available offline</div><div className="row-detail">Demo setting only. Real sync is not connected in this prototype.</div></div><button className={cn('switch',offline&&'on')} onClick={()=>setOffline(!offline)} aria-label="Toggle offline-first" data-testid="switch-offline"><span/></button></div><div className="notice"><LockKeyhole size={15}/><span>RetinoAI is designed for imperfect connectivity. Future releases can sync local drafts when a connection returns.</span></div></div><div className="setting-section"><div className="eyebrow">Future capture device</div><div className="setting-row"><div><div className="row-title">RetinoAI Capture Kit</div><div className="row-detail">Device integration is planned, not available in this prototype.</div></div><span className="pill pill-slate">Coming later</span></div></div></div></AppShell>;
}

function NotFound(){return <AppShell title="Not found"><div className="card empty"><AlertCircle size={28}/><h1 style={{fontSize:27}}>Page not found</h1><p className="subtitle">That workspace view does not exist.</p><Link className="btn btn-primary" style={{marginTop:20}} href="/dashboard">Back to overview</Link></div></AppShell>}

function Router() {
  const [patients,setPatients]=useState(initialPatients); const [screenings,setScreenings]=useState<Screening[]>([]); const [referredCases,setReferredCases]=useState(initialReferredCases);
  const addPatient=(p:Patient)=>setPatients(prev=>prev.some(x=>x.id===p.id)?prev.map(x=>x.id===p.id?{...x,...p}:x):[...prev,p]);
  const addCase=(s:Screening)=>setScreenings(prev=>prev.some(x=>x.id===s.id)?prev.map(x=>x.id===s.id?{...x,...s}:x):[...prev,s]);
  const updateCase=(caseId:string, patch:Partial<Screening>)=>setScreenings(prev=>prev.map(s=>s.id===caseId?{...s,...patch}:s));
  const escalateCase=(caseId:string)=>{
    const scr=screenings.find(s=>s.id===caseId); if(!scr) return;
    const pat=patients.find(p=>p.id===scr.patientId);
    setScreenings(prev=>prev.map(s=>s.id===caseId?{...s,status:'Awaiting specialist review'}:s));
    setReferredCases(prev=>prev.some(c=>c.screeningId===caseId)?prev:[
      { id:`DR-${caseId}`, patientId:scr.patientId, patientName:pat?pat.name:'Patient record not linked', screeningId:caseId, screeningDate:scr.date, priority:'Pending', summary:'Screening escalated by frontline team', reason:'Awaiting specialist evaluation', status:'Awaiting review' }
    ]);
  };
  const saveDoctorDecision = (id:string,decision:'Monitor'|'Refer',note:string) => setReferredCases(prev=>prev.map(item=>item.id===id?{...item,decision,note,status:'Reviewed'}:item));
  return <PageTransition><Switch>
    <Route path="/login" component={Login}/><Route path="/" component={()=><Redirect to="/dashboard"/>}/>
    <Route path="/dashboard">{()=> <Dashboard patients={patients} screenings={screenings}/>}</Route>
    <Route path="/patients/new" component={PatientNew}/><Route path="/patients/:id">{()=> <PatientProfile patients={patients} screenings={screenings}/>}</Route><Route path="/patients">{()=> <Patients patients={patients}/>}</Route>
    <Route path="/screening/new">{()=> <ScreeningNew patients={patients} screenings={screenings} onCreatePatient={addPatient} onCreateCase={addCase} onUpdateCase={updateCase} onEscalate={escalateCase}/>}</Route><Route path="/screening/:id">{()=> <ScreeningDetail onEscalate={escalateCase}/>}</Route>
    <Route path="/doctor/dashboard">{()=> <DoctorDashboard cases={referredCases}/>}</Route>
    <Route path="/doctor/cases/:id">{()=> <DoctorCaseReview cases={referredCases} patients={patients} onDecision={saveDoctorDecision}/>}</Route>
    <Route path="/doctor/cases">{()=> <DoctorCases cases={referredCases}/>}</Route>
    <Route path="/doctor/follow-ups" component={DoctorFollowUps}/>
    <Route path="/reports">{()=> <Reports/>}</Route><Route path="/follow-ups">{()=> <FollowUps/>}</Route><Route path="/settings" component={Settings}/><Route component={NotFound}/>
  </Switch></PageTransition>;
}

const queryClient = new QueryClient();
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><RoutedErrorBoundary><Router/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;
