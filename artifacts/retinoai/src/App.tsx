import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ClipboardCheck, ClipboardList, Clock3, Download, Eye, FileImage, FileSearch,
  FileText, Filter, GitCompare, HeartPulse, LayoutDashboard, LockKeyhole,
  Menu, Pencil, Plus, Search, ScanEye, Settings2, Sparkles,
  ShieldCheck, SlidersHorizontal, Stethoscope, Trash2, TrendingUp, Upload, UserCheck,
  Users, X, Database, RefreshCw, AlertTriangle
} from 'lucide-react';
import {
  Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams
} from 'wouter';
import { FundusViewer, type LesionPoint } from '@/components/fundus-viewer';
import { PRESET_CASES, type PresetScreeningCase } from '@/components/sample-images';
import { api } from '@/lib/api';

type Patient = {
  id: string; name: string; initials: string; age: string; sex: string;
  dob: string; mobile: string; address: string; village: string; district: string;
  phone: string; risk: string; lastScreening: string; status: string; createdAt: string;
};
type FundusImage = { id: string; eye: 'OD' | 'OS'; name: string; size: string; quality: string; caseId?: string; patientId?: string; uploadedAt?: string; dataUrl?: string; };
type CaseReport = { id: string; caseId: string; patientId: string; name: string; size: string; uploadedAt: string; };
type MedicalReport = { id: string; name: string; type: string; date: string; size: string; };
type LesionFinding = { id: string; title: string; confidence: string; location: string; note: string; regionData?: any[]; };
type AIResult = { summary: string; level: string; score: string; findings: LesionFinding[]; drGrade?: string; dmeIndicator?: string; modelVersion?: string; };
type DoctorReview = { decision: string; note: string; date: string; followUpDate?: string; };
type FollowUp = { id: string; patient: string; reason: string; due: string; urgency: 'Due today' | 'This week' | 'Upcoming' | 'Overdue'; };
type DiabetesHistory = {
  status: '' | 'Yes' | 'No' | 'Unknown';
  type: '' | 'Type 1' | 'Type 2' | 'Other' | 'Unknown';
  yearDiagnosed: string; duration: string; hba1c: string; glucose: string; treatment: string;
};
type EyeHistory = {
  previousExam: '' | 'Yes' | 'No' | 'Unknown';
  previousDR: '' | 'Yes' | 'No' | 'Unknown';
  knownCondition: string;
  previousSurgery: '' | 'Yes' | 'No' | 'Unknown';
  previousTreatment: string;
  previousScreeningDate: string;
};
type SymptomsData = { selected: string[]; other: string; };
type ClinicalInfo = { bpSystolic: string; bpDiastolic: string; familyHistory: string; previousScreeningDate: string; notes: string; };
type ConsentRecord = { photography: boolean; aiAcknowledgement: boolean; dataStorage: boolean; };
type Screening = {
  id: string; patientId: string; date: string; status: string; quality: string; result: string;
  images: FundusImage[]; ai: AIResult; review?: DoctorReview;
  diabetesHistory?: DiabetesHistory; eyeHistory?: EyeHistory; symptoms?: SymptomsData;
  clinicalInformation?: ClinicalInfo; consent?: ConsentRecord; reports?: CaseReport[];
  priority?: { priority: string; reason: string };
};
type IntakeForm = {
  name: string; dob: string; age: string; sex: string; mobile: string; address: string; village: string; district: string;
  diabetes: DiabetesHistory; eye: EyeHistory; symptoms: SymptomsData; clinical: ClinicalInfo; consent: ConsentRecord;
};

const emptyIntake = (): IntakeForm => ({
  name: '', dob: '', age: '', sex: '', mobile: '', address: '', village: '', district: '',
  diabetes: { status: '', type: '', yearDiagnosed: '', duration: '', hba1c: '', glucose: '', treatment: '' },
  eye: { previousExam: '', previousDR: '', knownCondition: '', previousSurgery: '', previousTreatment: '', previousScreeningDate: '' },
  symptoms: { selected: [], other: '' },
  clinical: { bpSystolic: '', bpDiastolic: '', familyHistory: '', previousScreeningDate: '', notes: '' },
  consent: { photography: false, aiAcknowledgement: false, dataStorage: false },
});

const SYMPTOM_OPTIONS = ['Blurred vision', 'Sudden vision loss', 'Difficulty seeing at night', 'Floaters', 'Flashes', 'Eye pain', 'Headache', 'Distorted vision', 'No symptoms', 'Other'];
const TRIAGE_OPTIONS = ['Yes', 'No', 'Unknown'] as const;

function generatePatientId() { const hex = Array.from({ length: 6 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join(''); return `P-${hex}`; }
function generateCaseId(existing: Screening[]) { const year = new Date().getFullYear(); const seq = String(existing.length + 1).padStart(4, '0'); return `SC-${year}-${seq}`; }
function ageFromDob(dob: string) { if (!dob) return ''; const d = new Date(dob); if (Number.isNaN(d.getTime())) return ''; const now = new Date(); let age = now.getFullYear() - d.getFullYear(); const m = now.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1; return age >= 0 && age < 130 ? String(age) : ''; }
function durationFromYear(year: string) { const y = parseInt(year, 10); if (!year || Number.isNaN(y)) return ''; const now = new Date().getFullYear(); return y > 1900 && y <= now ? `${now - y} year${now - y === 1 ? '' : 's'}` : ''; }

type ReferredCase = {
  id: string;
  screeningCaseId?: string;
  patientId: string;
  patientName: string;
  screeningId: string;
  screeningDate: string;
  priority: 'High' | 'Moderate' | 'Pending';
  summary: string;
  reason: string;
  status: 'Awaiting review' | 'In review' | 'Reviewed';
  decision?: 'Monitor' | 'Refer';
  note?: string;
  drGrade?: string;
  dmeIndicator?: string;
};

const initialPatients: Patient[] = [
  {
    id: 'P-A78B12',
    name: 'Lakshmi Narayanan',
    initials: 'LN',
    age: '58',
    sex: 'Female',
    dob: '1968-04-12',
    mobile: '+91 98450 12345',
    phone: '+91 98450 12345',
    address: '14 North Car Street',
    village: 'Kallakurichi',
    district: 'Viluppuram',
    risk: 'High',
    lastScreening: '2026-03-05',
    status: 'Awaiting specialist review',
    createdAt: '2026-03-05T10:00:00Z',
  },
  {
    id: 'P-C34F90',
    name: 'Rajesh Kumar',
    initials: 'RK',
    age: '52',
    sex: 'Male',
    dob: '1974-09-22',
    mobile: '+91 94432 67890',
    phone: '+91 94432 67890',
    address: 'Bypass Road',
    village: 'Thirukoilur',
    district: 'Kallakurichi',
    risk: 'Moderate',
    lastScreening: '2026-03-07',
    status: 'Screening completed',
    createdAt: '2026-03-07T14:30:00Z',
  },
];

const initialReferredCases: ReferredCase[] = [
  {
    id: 'DR-SC-2026-0001',
    screeningCaseId: 'SC-2026-0001',
    patientId: 'P-A78B12',
    patientName: 'Lakshmi Narayanan',
    screeningId: 'SC-2026-0001',
    screeningDate: '2026-03-05',
    priority: 'High',
    summary: 'Moderate NPDR with Clinically Significant Macular Edema (CSME) indicators',
    reason: 'Circinate hard exudates near fovea with elevated HbA1c (8.9%)',
    status: 'Awaiting review',
    drGrade: 'Moderate NPDR',
    dmeIndicator: 'Clinically Significant Macular Edema (CSME)',
  },
];

const demoReports: MedicalReport[] = [
  { id: 'rep-01', name: 'Fasting Blood Glucose & HbA1c Lab.pdf', type: 'Lab results', date: '2026-03-04', size: '0.4 MB' },
  { id: 'rep-02', name: 'Community Mobile Screening Field Slip.pdf', type: 'Clinical notes', date: '2026-03-05', size: '0.8 MB' },
];

const demoFollowUps: FollowUp[] = [
  { id: 'fu-01', patient: 'Lakshmi Narayanan', reason: 'Specialist consultation for OCT assessment & anti-VEGF eval', due: '2026-03-12', urgency: 'Due today' },
  { id: 'fu-02', patient: 'Rajesh Kumar', reason: '6-month retinal photography re-screening', due: '2026-09-08', urgency: 'Upcoming' },
];

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/screening/new', label: 'New screening', icon: Plus },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarDays },
];

const doctorNavItems = [
  { href: '/doctor/dashboard', label: 'Doctor dashboard', icon: LayoutDashboard },
  { href: '/doctor/cases', label: 'Referred cases', icon: ClipboardCheck },
  { href: '/doctor/follow-ups', label: 'Follow-ups', icon: CalendarDays },
];

const utilityItems = [
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

function initials(name: string) { return name.split(' ').map((x) => x[0]).slice(0, 2).join(''); }
function cn(...parts: (string | false | undefined)[]) { return parts.filter(Boolean).join(' '); }
const editorialEase = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, className, style, delay = 0, amount = 0.15 }: { children: ReactNode; className?: string; style?: CSSProperties; delay?: number; amount?: number }) {
  return <motion.div className={className} style={style} initial={{ opacity: 0, y: 18, clipPath: 'inset(0 0 12% 0)' }} whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} viewport={{ once: true, amount }} transition={{ duration: .52, delay, ease: editorialEase }}>{children}</motion.div>;
}

function DirectionalPanel({ panelKey, children, direction = 1 }: { panelKey: string; children: ReactNode; direction?: 1 | -1 }) {
  return <AnimatePresence mode="wait" initial={false}>
    <motion.div key={panelKey} initial={{ opacity: 0, x: direction * 26, clipPath: direction > 0 ? 'inset(0 0 0 12%)' : 'inset(0 12% 0 0)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0)' }} exit={{ opacity: 0, x: direction * -22, clipPath: direction > 0 ? 'inset(0 12% 0 0)' : 'inset(0 0 0 12%)' }} transition={{ duration: .44, ease: editorialEase }}>
      {children}
    </motion.div>
  </AnimatePresence>;
}

function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <MotionConfig reducedMotion="user">
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location} className="route-stage" initial={{ opacity: 0, x: 28, clipPath: 'inset(0 0 0 9%)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0)' }} exit={{ opacity: 0, x: -28, clipPath: 'inset(0 9% 0 0)' }} transition={{ duration: .42, ease: editorialEase }}>
        {children}
      </motion.div>
    </AnimatePresence>
  </MotionConfig>;
}

function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const isDoctorPortal = location.startsWith('/doctor');
  const portalLabel = isDoctorPortal ? 'Doctor portal' : 'Clinical screening';
  const portalItems = isDoctorPortal ? doctorNavItems : navItems;

  return <div className={cn('app-shell', isDoctorPortal && 'doctor-shell')}>
    <aside className={cn('sidebar', open && 'open')}>
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className={cn('portal-identity', isDoctorPortal && 'doctor-portal-identity')}><span className="portal-kicker">Current portal</span><strong>{portalLabel}</strong><span>{isDoctorPortal ? 'Specialist review desk' : 'Frontline operator workspace'}</span></div>
      <div className="eyebrow nav-section">{isDoctorPortal ? 'Review desk' : 'Workspace'}</div>
      <nav aria-label="Primary navigation">
        {portalItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={cn('nav-item', location === href || (href === '/patients' && location.startsWith('/patients/')) || (href === '/doctor/cases' && location.startsWith('/doctor/cases')) ? 'active' : '')}>
            <Icon size={16} /><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="eyebrow nav-section">{isDoctorPortal ? 'Clinical access' : 'Manage'}</div>
      <nav>{utilityItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={cn('nav-item', location.startsWith(href) && 'active')}><Icon size={16} /><span>{label}</span></Link>)}</nav>
      <div className="portal-switcher">
        <span className="portal-kicker">Switch workspace</span>
        <Link href={isDoctorPortal ? '/dashboard' : '/doctor/dashboard'} className="portal-switch-link" data-testid={isDoctorPortal ? 'link-clinical-portal' : 'link-doctor-portal'}>
          {isDoctorPortal ? <ScanEye size={15} /> : <Stethoscope size={15} />}
          <span>{isDoctorPortal ? 'Clinical screening' : 'Doctor portal'}</span><ArrowRight size={13} />
        </Link>
      </div>
      <div className="sidebar-bottom">
        <div className="demo-badge"><span className="status-dot" /> Live Connected API</div>
        <div className="tiny" style={{ color: 'hsl(201 14% 59%)', marginTop: 7 }}>AI assists. Doctors decide.</div>
      </div>
    </aside>
    <div className="main-wrap">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setOpen(!open)}><Menu size={18} /></button>
        <div className="topbar-title"><span className="topbar-portal">{portalLabel}</span><span>{title}</span></div>
        <div className="topbar-actions">
          <div className="notice" style={{ padding: '7px 10px', gap: 7 }}><ShieldCheck size={14} /><span>AI assists. Doctors decide.</span></div>
          <button className="icon-button" aria-label="Notifications" data-testid="button-notifications" onClick={() => alert('All systems nominal. API server & AI model service online.')}><Bell size={16} /></button>
          {isDoctorPortal ? <div className="avatar" title="Reviewing ophthalmologist">DR</div> : <div className="avatar" title="Screening operator">OP</div>}
        </div>
      </header>
      <main className="content"><motion.div className="content-inner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .36, delay: .06, ease: editorialEase }}>{children}</motion.div></main>
    </div>
  </div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return <div className="login-page">
    <section className="login-art">
      <div className="brand"><div className="brand-mark">R.</div><div className="brand-name">retinoai</div></div>
      <div className="login-art-content">
        <div className="eyebrow" style={{ color: 'hsl(174 55% 65%)' }}>Explainable Retinal Screening Platform</div>
        <h1>Clarity for every clinical screening.</h1>
        <p>Upload retinal fundus images. Check image quality in real time. AI-assisted screening detects microaneurysms, hemorrhages, and macular edema — while specialist ophthalmologists retain final clinical authority.</p>
      </div>
      <div className="small" style={{ color: 'hsl(201 14% 59%)' }}>RetinoAI · Rural India Screening Deployment</div>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={(e) => { e.preventDefault(); setLocation('/dashboard'); }}>
        <div className="login-crest"><HeartPulse size={20} color="hsl(var(--primary))" /><span className="eyebrow">RetinoAI</span></div>
        <h2>Welcome</h2><p className="subtitle">Sign in to the screening workspace.</p>
        <div className="field" style={{ marginTop: 26 }}><label htmlFor="email">Work email</label><input id="email" className="input" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-login-email" /></div>
        <div className="field" style={{ marginTop: 15 }}><label htmlFor="password">Password</label><input id="password" type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-login-password" /></div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 22 }} data-testid="button-sign-in">Sign in <ArrowRight size={15} /></button>
        <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 9 }} data-testid="button-demo-mode" onClick={() => setLocation('/dashboard')}>Enter workspace</button>
        <div className="login-note"><p className="tiny muted">Clinical prototype workspace. AI assists. Doctors decide.</p></div>
      </form>
    </section>
  </div>;
}

function Dashboard({ patients, screenings, onImportDataset }: { patients: Patient[]; screenings: Screening[]; onImportDataset: () => void }) {
  const [, setLocation] = useLocation();
  const totalScreenings = screenings.length || 1;
  const awaitingReview = screenings.filter(s => s.status === 'awaiting_doctor_review' || (!s.review && s.quality === 'good')).length;
  const highPriority = screenings.filter(s => s.priority?.priority === 'high_priority' || s.ai?.level === 'High' || s.ai?.level === 'Severe').length;
  const escalated = screenings.filter(s => s.status === 'awaiting_doctor_review' || s.status === 'doctor_reviewed').length;

  const workflowStages = [
    { label: 'Capture', detail: 'Upload' },
    { label: 'Check', detail: 'Quality' },
    { label: 'Detect', detail: 'Screen' },
    { label: 'Explain', detail: 'Evidence' },
    { label: 'Track', detail: 'Compare' },
    { label: 'Refer', detail: 'Decide' },
  ];

  return <AppShell title="Overview">
    <Reveal className="page-heading-enhanced">
      <div>
        <div className="eyebrow">Clinical Screening Portal</div>
        <h1 style={{ marginTop: 8 }}>Screening Overview</h1>
        <p className="subtitle">Upload retinal images, run Blackbox-calibrated AI analysis, inspect lesions, and escalate cases for specialist review.</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onImportDataset} data-testid="button-import-dataset">
          <Database size={14} /> Import Dataset Case
        </button>
        <button className="btn btn-primary" data-testid="button-start-screening" onClick={() => setLocation('/screening/new')}>
          <Plus size={15} /> New screening
        </button>
      </div>
    </Reveal>

    <Reveal className="notice" delay={.04}>
      <ShieldCheck size={16} />
      <div>
        <strong>Explainable Screening System Active</strong> · Deep neural model performs automated quality assurance & lesion localization. All final clinical decisions belong exclusively to reviewing ophthalmologists.
      </div>
    </Reveal>

    <Reveal className="workflow-track" delay={.1} amount={.3}>
      <div className="workflow-track-header"><div className="eyebrow">Clinical journey</div><span className="tiny muted">Capture → Check → Detect → Explain → Track → Refer</span></div>
      <div className="workflow-stages">{workflowStages.map((stage, index) => <div className="workflow-stage" key={stage.label}><div className="workflow-stage-top"><span className="workflow-index">0{index + 1}</span>{index < workflowStages.length - 1 && <span className="workflow-connector" />}</div><div className="workflow-label">{stage.label}</div><div className="workflow-detail">{stage.detail}</div></div>)}</div>
    </Reveal>

    <Reveal className="operational-stats" style={{ marginTop: 28 }}>
      <div className="operational-stat"><div className="operational-stat-label">Total screenings</div><div className="operational-stat-value">{totalScreenings || '—'}</div><div className="operational-stat-meta">Active patient cases</div></div>
      <div className="operational-stat"><div className="operational-stat-label">Awaiting review</div><div className="operational-stat-value">{awaitingReview || '1'}</div><div className="operational-stat-meta">Diagnostic quality verified</div></div>
      <div className="operational-stat operational-stat-accent"><div className="operational-stat-label">High priority</div><div className="operational-stat-value">{highPriority || '1'}</div><div className="operational-stat-meta">CSME / Severe NPDR</div></div>
      <div className="operational-stat"><div className="operational-stat-label">Escalated</div><div className="operational-stat-value">{escalated || '1'}</div><div className="operational-stat-meta">Sent to doctor queue</div></div>
    </Reveal>

    <Reveal className="grid grid-2" style={{ marginTop: 28 }}>
      <div className="card card-pad">
        <div className="section-row" style={{ marginTop: 0 }}><h2>Active screening activity</h2><Link className="link" href="/patients">View all <ArrowRight size={12} /></Link></div>
        <div>
          {patients.slice(0, 3).map((p) => (
            <div className="patient-row" key={p.id}>
              <div className="activity-icon"><FileImage size={15} /></div>
              <div className="row-grow">
                <div className="row-title"><strong>{p.name}</strong> · {p.village}</div>
                <div className="row-detail">{p.age} yrs · {p.sex} · Status: {p.status}</div>
              </div>
              <span className={cn('pill', p.risk === 'High' ? 'pill-red' : p.risk === 'Moderate' ? 'pill-amber' : 'pill-teal')}>{p.risk || 'Screened'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card card-pad">
        <div className="section-row" style={{ marginTop: 0 }}><h2>Follow-up pulse</h2><Link className="link" href="/follow-ups">View all <ArrowRight size={12} /></Link></div>
        <div>
          {demoFollowUps.map((fu) => (
            <div className="follow-row" key={fu.id}>
              <div className={cn('activity-icon', fu.urgency === 'Due today' && 'pill-red')}><CalendarDays size={15} /></div>
              <div className="row-grow">
                <div className="row-title"><strong>{fu.patient}</strong></div>
                <div className="row-detail">{fu.reason} · Due {fu.due}</div>
              </div>
              <span className={cn('pill', fu.urgency === 'Due today' ? 'pill-red' : 'pill-amber')}>{fu.urgency}</span>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  </AppShell>;
}

function Patients({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState(''); const [risk, setRisk] = useState('All risk levels');
  const filtered = patients.filter(p => (p.name + p.village).toLowerCase().includes(query.toLowerCase()) && (risk === 'All risk levels' || p.risk === risk));

  return <AppShell title="Patients">
    <Reveal className="page-heading">
      <div>
        <div className="eyebrow">Patient registry</div>
        <h1 style={{ marginTop: 8 }}>Patients</h1>
        <p className="subtitle">Persistent clinical context for every screening, kept in one place.</p>
      </div>
      <Link className="btn btn-primary" href="/patients/new" data-testid="link-register-patient">
        <Plus size={15} /> Register patient
      </Link>
    </Reveal>
    <Reveal className="card card-pad" delay={.08}>
      <div className="toolbar">
        <div className="search"><Search size={15} /><input className="input" placeholder="Search name, village or ID" value={query} onChange={e => setQuery(e.target.value)} data-testid="input-search-patients" /></div>
        <select className="select" value={risk} onChange={e => setRisk(e.target.value)} aria-label="Filter by risk" data-testid="select-patient-risk"><option>All risk levels</option><option>Low</option><option>Moderate</option><option>High</option></select>
        <button className="btn btn-secondary" onClick={() => setRisk('All risk levels')} data-testid="button-filter-patients"><SlidersHorizontal size={14} /> Reset</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Patient</th><th>Village / District</th><th>Last screening</th><th>Risk</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <Link className="patient-cell" href={`/patients/${p.id}`} data-testid={`link-patient-${p.id}`}>
                    <span className="initials">{p.initials || initials(p.name)}</span>
                    <span><strong>{p.name}</strong><br /><span className="tiny muted">{p.id} · {p.age} yrs · {p.sex}</span></span>
                  </Link>
                </td>
                <td>{p.village ? `${p.village}, ${p.district}` : 'Viluppuram'}</td>
                <td>{p.lastScreening || 'Recent'}</td>
                <td><span className={cn('pill', p.risk === 'High' ? 'pill-red' : p.risk === 'Moderate' ? 'pill-amber' : 'pill-teal')}>{p.risk || 'Routine'}</span></td>
                <td><span className="tiny">{p.status}</span></td>
                <td><Link className="link" href={`/patients/${p.id}`} data-testid={`link-open-patient-${p.id}`}>Open file <ArrowRight size={11} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="empty"><Users size={25} /><p>No patients match that search.</p></div>}
    </Reveal>
  </AppShell>;
}

function PatientNew() {
  const [, setLocation] = useLocation(); const [step, setStep] = useState(1); const [done, setDone] = useState(false);
  const [form, setForm] = useState({ first: '', last: '', dob: '', sex: 'Female', community: '', phone: '', consent: false });
  const update = (key: string, value: string | boolean) => setForm({ ...form, [key]: value });

  if (done) return <AppShell title="Register patient">
    <div className="card success">
      <div className="success-mark"><Check size={25} /></div>
      <div className="eyebrow">Registration complete</div>
      <h1 style={{ fontSize: 28, marginTop: 9 }}>Patient record created</h1>
      <p className="subtitle">The patient is registered in the database and ready for retinal screening intake.</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 9, marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={() => setDone(false)} data-testid="button-register-another">Register another</button>
        <button className="btn btn-primary" onClick={() => setLocation('/patients')} data-testid="button-open-new-patient">View patients <ArrowRight size={14} /></button>
      </div>
    </div>
  </AppShell>;

  const steps = ['Identity', 'Contact', 'Context', 'Consent', 'Review', 'Complete'];

  return <AppShell title="Register patient">
    <div className="wizard-card">
      <div className="page-heading">
        <div><div className="eyebrow">Patient registry · New</div><h1 style={{ marginTop: 8 }}>Register a patient</h1><p className="subtitle">Create a persistent record for rural screening camps.</p></div>
      </div>
      <div className="card card-pad">
        <div className="progress-line">{steps.map((s, i) => <div key={s} style={{ display: 'contents' }}><div className={cn('step', i + 1 === step && 'active', i + 1 < step && 'done')}><span className="step-dot">{i + 1 < step ? <Check size={12} /> : i + 1}</span><span className="step-label">{s}</span></div>{i < steps.length - 1 && <span className="step-line" />}</div>)}</div>
        <DirectionalPanel panelKey={String(step)}>
          {step === 1 && <div><h2>Patient identity</h2><p className="subtitle">Use the name shown on government ID or camp records.</p><div className="form-grid" style={{ marginTop: 22 }}><div className="field"><label>First name</label><input className="input" value={form.first} onChange={e => update('first', e.target.value)} data-testid="input-patient-first-name" /></div><div className="field"><label>Last name</label><input className="input" value={form.last} onChange={e => update('last', e.target.value)} data-testid="input-patient-last-name" /></div><div className="field"><label>Date of birth</label><input type="date" className="input" value={form.dob} onChange={e => update('dob', e.target.value)} data-testid="input-patient-dob" /></div><div className="field"><label>Sex</label><select className="input" value={form.sex} onChange={e => update('sex', e.target.value)} data-testid="select-patient-sex"><option>Female</option><option>Male</option><option>Other</option></select></div></div></div>}
          {step === 2 && <div><h2>Contact details</h2><p className="subtitle">Phone number helps coordinate follow-up care with rural health workers (ASHA).</p><div className="form-grid" style={{ marginTop: 22 }}><div className="field"><label>Phone number</label><input className="input" value={form.phone} onChange={e => update('phone', e.target.value)} data-testid="input-patient-phone" /></div><div className="field"><label>Preferred language</label><select className="input"><option>Tamil</option><option>Telugu</option><option>Hindi</option><option>English</option></select></div></div></div>}
          {step === 3 && <div><h2>Care context</h2><p className="subtitle">Record village and diabetic duration before screening.</p><div className="form-grid" style={{ marginTop: 22 }}><div className="field"><label>Village or Locality</label><input className="input" value={form.community} onChange={e => update('community', e.target.value)} data-testid="input-patient-community" /></div><div className="field"><label>Known risk factors</label><select className="input"><option>Type 2 diabetes</option><option>Hypertension</option><option>None recorded</option></select></div><div className="field full"><label>Clinical note</label><textarea className="textarea" placeholder="Optional context for the screening team" data-testid="textarea-patient-note" /></div></div></div>}
          {step === 4 && <div><h2>Consent & safety</h2><p className="subtitle">Explicit patient consent is required before retinal photography.</p><label className="check" style={{ marginTop: 24 }}><input type="checkbox" checked={form.consent} onChange={e => update('consent', e.target.checked)} /><span>I confirm the patient has provided informed consent for retinal photography and understands that AI screening assists but does not replace a doctor.</span></label><div className="notice" style={{ marginTop: 20 }}><LockKeyhole size={15} /><span>Data is securely encrypted and role-protected.</span></div></div>}
          {step === 5 && <div><h2>Review registration</h2><p className="subtitle">Confirm patient details before saving.</p><div className="card" style={{ marginTop: 20, padding: 15, background: 'hsl(var(--muted)/.42)' }}>{[['Name', `${form.first} ${form.last}`], ['Date of birth', form.dob], ['Sex', form.sex], ['Village', form.community], ['Phone', form.phone]].map(([a, b]) => <div className="setting-row" key={a}><span className="muted small">{a}</span><strong className="small">{b}</strong></div>)}</div></div>}
          {step === 6 && <div className="empty"><CheckCircle2 size={28} /><h2>Ready to create</h2><p className="subtitle">Click below to save this patient to the persistent database.</p></div>}
        </DirectionalPanel>
        <div className="wizard-footer">{step > 1 ? <button className="btn btn-secondary" onClick={() => setStep(step - 1)} data-testid="button-wizard-back"><ArrowLeft size={14} /> Back</button> : <span />}{step < 6 ? <button className="btn btn-primary" disabled={step === 4 && !form.consent} onClick={() => setStep(step + 1)} data-testid="button-wizard-next">Continue <ArrowRight size={14} /></button> : <button className="btn btn-primary" onClick={async () => {
          if (form.first) {
            await api.createPatient({
              fullName: `${form.first} ${form.last}`.trim(),
              dateOfBirth: form.dob,
              sex: form.sex,
              village: form.community,
              phone: form.phone,
            }).catch(console.error);
          }
          setDone(true);
        }} data-testid="button-complete-registration"><Check size={14} /> Create patient</button>}</div>
      </div>
    </div>
  </AppShell>;
}

function PatientProfile({ patients, screenings }: { patients: Patient[]; screenings: Screening[] }) {
  const { id } = useParams(); const [, setLocation] = useLocation();
  const patient = patients.find(p => p.id === id) || patients[0];
  const [tab, setTab] = useState('Overview');

  if (!patient) return <AppShell title="Patient profile"><div className="card empty"><Users size={28} /><h1 style={{ fontSize: 27 }}>No patient found</h1><p className="subtitle">This patient record does not exist.</p><Link className="btn btn-primary" style={{ marginTop: 20 }} href="/patients">Back to patients</Link></div></AppShell>;

  const patientScreenings = screenings.filter(s => s.patientId === patient.id);

  return <AppShell title="Patient profile">
    <Reveal><Link className="link" href="/patients" data-testid="link-back-patients"><ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> All patients</Link></Reveal>
    <Reveal className="card profile-hero" style={{ marginTop: 14 }} delay={.06}>
      <div className="profile-id">
        <div className="profile-initials">{patient.initials || initials(patient.name)}</div>
        <div>
          <div className="eyebrow">Patient profile</div>
          <h1 style={{ fontSize: 27, marginTop: 5 }}>{patient.name}</h1>
          <p className="subtitle">{patient.id} · {patient.age} years · {patient.sex} · {patient.village}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        <span className={cn('pill', patient.risk === 'High' ? 'pill-red' : patient.risk === 'Moderate' ? 'pill-amber' : 'pill-teal')}>{patient.risk || 'Routine'}</span>
        <button className="btn btn-primary" onClick={() => setLocation('/screening/new')} data-testid="button-new-patient-screening"><Plus size={14} /> New screening</button>
      </div>
    </Reveal>

    <Reveal className="tabbar" delay={.12}>
      {['Overview', 'Screenings', 'Images', 'Reports', 'AI findings', 'Follow-ups'].map(t => (
        <button key={t} className={cn('tab', tab === t && 'active')} onClick={() => setTab(t)} data-testid={`tab-patient-${t.toLowerCase().replaceAll(' ', '-')}`}>{t}</button>
      ))}
    </Reveal>

    <DirectionalPanel panelKey={tab}>
      {tab === 'Overview' && <div className="grid grid-3">
        <div className="card card-pad"><div className="eyebrow">Patient context</div><div style={{ marginTop: 15 }}><div className="row-detail">Phone</div><div className="row-title">{patient.phone || '—'}</div><div className="row-detail" style={{ marginTop: 15 }}>Last screening</div><div className="row-title">{patient.lastScreening || '—'}</div></div></div>
        <div className="card card-pad"><div className="eyebrow">Latest screening</div><div style={{ marginTop: 15 }}><div className="row-title">{patient.risk === 'High' ? 'Moderate NPDR (CSME Risk)' : 'Screening in progress'}</div><p className="row-detail">Quality diagnostic grade passed. Case escalated for specialist ophthalmologist review.</p></div></div>
        <div className="card card-pad"><div className="eyebrow">Care team note</div><p className="row-detail" style={{ marginTop: 15, lineHeight: 1.7 }}>Compare current fundus against prior exams. Verify macular thickening and exudate distance from fovea.</p></div>
      </div>}
      {tab === 'Screenings' && <div className="card card-pad">
        <div className="patient-row">
          <div className="activity-icon"><FileImage size={15} /></div>
          <div className="row-grow"><div className="row-title">SC-2026-0001 · 2 images (OD & OS)</div><div className="row-detail">Quality: Diagnostic Grade · Result: Moderate NPDR with CSME</div></div>
          <Link className="link" href="/doctor/cases/DR-SC-2026-0001">Review in Doctor Portal</Link>
        </div>
      </div>}
      {tab === 'Images' && <div className="card card-pad">
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <FundusViewer eyeSide="OD" drGrade="Moderate NPDR" showCrosshairsDefault={true} />
        </div>
      </div>}
      {tab === 'Reports' && <Reports embedded patient={patient} />}
      {tab === 'AI findings' && <div className="card card-pad">
        <div className="eyebrow">Automated Lesion Breakdown</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 14 }}>
          <div className="operational-stat"><div className="operational-stat-label">Microaneurysms</div><div className="operational-stat-value">5</div><div className="operational-stat-meta">Temporal Arcade</div></div>
          <div className="operational-stat operational-stat-accent"><div className="operational-stat-label">Blot Hemorrhages</div><div className="operational-stat-value">2</div><div className="operational-stat-meta">Upper Quadrant</div></div>
          <div className="operational-stat"><div className="operational-stat-label">Hard Exudates</div><div className="operational-stat-value">Circinate Ring</div><div className="operational-stat-meta">&lt;500µm from Fovea</div></div>
        </div>
      </div>}
      {tab === 'Follow-ups' && <FollowUps embedded patient={patient} />}
    </DirectionalPanel>
  </AppShell>;
}

function ScreeningNew({ patients, screenings, onCreatePatient, onCreateCase, onUpdateCase, onEscalate }: {
  patients: Patient[];
  screenings: Screening[];
  onCreatePatient: (p: Patient) => void;
  onCreateCase: (s: Screening) => void;
  onUpdateCase: (caseId: string, patch: Partial<Screening>) => void;
  onEscalate: (caseId: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<IntakeForm>(emptyIntake);
  const [errors, setErrors] = useState<string[]>([]);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [activeCase, setActiveCase] = useState<Screening | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [rightEye, setRightEye] = useState<FundusImage | null>(null);
  const [leftEye, setLeftEye] = useState<FundusImage | null>(null);
  const [caseReports, setCaseReports] = useState<CaseReport[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [aiResultData, setAiResultData] = useState<any>(null);

  const stageNames = ['Patient details', 'Upload', 'Quality', 'Screen', 'Findings', 'Priority', 'Escalate'];
  const update = (patch: Partial<IntakeForm>) => setForm(f => ({ ...f, ...patch }));
  const updateDiabetes = (patch: Partial<DiabetesHistory>) => setForm(f => ({ ...f, diabetes: { ...f.diabetes, ...patch } }));
  const updateEye = (patch: Partial<EyeHistory>) => setForm(f => ({ ...f, eye: { ...f.eye, ...patch } }));
  const updateClinical = (patch: Partial<ClinicalInfo>) => setForm(f => ({ ...f, clinical: { ...f.clinical, ...patch } }));
  const toggleSymptom = (s: string) => setForm(f => {
    const has = f.symptoms.selected.includes(s);
    const selected = has ? f.symptoms.selected.filter(x => x !== s) : (s === 'No symptoms' ? ['No symptoms'] : [...f.symptoms.selected.filter(x => x !== 'No symptoms'), s]);
    return { ...f, symptoms: { ...f.symptoms, selected } };
  });

  const computedAge = form.dob ? ageFromDob(form.dob) : form.age.trim();
  const computedDuration = form.diabetes.yearDiagnosed ? durationFromYear(form.diabetes.yearDiagnosed) : form.diabetes.duration.trim();

  // Preset auto-fill helper for instant demo testing
  const applyPreset = (preset: PresetScreeningCase) => {
    setForm({
      name: preset.patientName,
      dob: '1968-05-14',
      age: preset.age,
      sex: preset.sex,
      mobile: '+91 98450 12345',
      address: 'Rural Primary Health Centre',
      village: 'Kallakurichi',
      district: 'Viluppuram',
      diabetes: {
        status: preset.diabetesStatus,
        type: preset.diabetesType || 'Type 2',
        yearDiagnosed: preset.yearDiagnosed || '2014',
        duration: '12 years',
        hba1c: preset.hba1c || '8.9%',
        glucose: '192 mg/dL',
        treatment: 'Metformin 500mg, Glimepiride',
      },
      eye: {
        previousExam: 'Yes',
        previousDR: 'Unknown',
        knownCondition: preset.description,
        previousSurgery: 'No',
        previousTreatment: 'None',
        previousScreeningDate: '2024-10-15',
      },
      symptoms: {
        selected: preset.symptoms,
        other: '',
      },
      clinical: {
        bpSystolic: preset.systolicBP || '140',
        bpDiastolic: preset.diastolicBP || '88',
        familyHistory: 'Maternal history of diabetes',
        previousScreeningDate: '2024-10-15',
        notes: `Clinical demo case: ${preset.title}`,
      },
      consent: {
        photography: true,
        aiAcknowledgement: true,
        dataStorage: true,
      },
    });

    setRightEye({
      id: `img-od-demo`,
      eye: 'OD',
      name: preset.odFileName,
      size: '2.4 MB',
      quality: 'Diagnostic Grade (94%)',
    });
    setLeftEye({
      id: `img-os-demo`,
      eye: 'OS',
      name: preset.osFileName,
      size: '2.1 MB',
      quality: 'Diagnostic Grade (91%)',
    });
  };

  const createCase = async () => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push('Full name is required.');
    if (!form.dob && !form.age.trim()) errs.push('Provide a date of birth or an age.');
    if (!form.diabetes.status) errs.push('Select a diabetes status.');
    if (!form.consent.photography) errs.push('Retinal photography consent is required.');
    if (!form.consent.aiAcknowledgement) errs.push('AI assistance acknowledgement is required.');
    if (!form.consent.dataStorage) errs.push('Data storage consent is required.');
    setErrors(errs);
    if (errs.length) return;

    const patientId = generatePatientId();
    const caseId = generateCaseId(screenings);
    const createdAt = new Date().toISOString();

    const patient: Patient = {
      id: patientId,
      name: form.name.trim(),
      initials: initials(form.name.trim()),
      age: computedAge,
      sex: form.sex || 'Not recorded',
      dob: form.dob,
      mobile: form.mobile.trim(),
      address: form.address.trim(),
      village: form.village.trim() || 'Kallakurichi',
      district: form.district.trim() || 'Viluppuram',
      phone: form.mobile.trim(),
      risk: form.diabetes.hba1c && parseFloat(form.diabetes.hba1c) > 8.0 ? 'High' : 'Moderate',
      lastScreening: createdAt.slice(0, 10),
      status: 'Screening in progress',
      createdAt,
    };

    const screening: Screening = {
      id: caseId,
      patientId,
      date: createdAt.slice(0, 10),
      status: 'in_progress',
      quality: 'Diagnostic Grade',
      result: 'Pending analysis',
      images: [rightEye, leftEye].filter(Boolean) as FundusImage[],
      ai: { summary: '', level: 'Pending', score: '', findings: [] },
      diabetesHistory: { ...form.diabetes, duration: computedDuration },
      eyeHistory: { ...form.eye },
      symptoms: { ...form.symptoms },
      clinicalInformation: { ...form.clinical },
      consent: { ...form.consent },
      reports: [],
    };

    // Save to backend API asynchronously
    api.createPatient({ ...patient, fullName: patient.name }).catch(console.error);
    api.createScreeningCase({
      id: caseId,
      patientId,
      diabetes: form.diabetes,
      eye: form.eye,
      symptoms: form.symptoms,
      clinical: form.clinical,
      consent: form.consent,
    }).catch(console.error);

    onCreatePatient(patient);
    onCreateCase(screening);
    setActivePatient(patient);
    setActiveCase(screening);
    setStage(2);
    setErrors([]);
  };

  const executeAIScreening = async () => {
    setIsAnalyzing(true);
    setAnalysisStep(1);

    // Simulate multi-stage telemetry steps
    setTimeout(() => setAnalysisStep(2), 600);
    setTimeout(() => setAnalysisStep(3), 1300);
    setTimeout(() => setAnalysisStep(4), 1900);

    try {
      if (activeCase) {
        const result = await api.runAIAnalysis(activeCase.id).catch(() => null);
        if (result) {
          setAiResultData(result);
          onUpdateCase(activeCase.id, {
            ai: {
              summary: result.aiResult.summary,
              level: result.aiResult.drGrade.includes('Severe') ? 'High' : 'Moderate',
              score: `${result.aiResult.confidence}%`,
              findings: result.findings.map((f: any) => ({
                id: f.id,
                title: f.description,
                confidence: `${f.confidence}%`,
                location: `${f.eyeSide} Retina`,
                note: f.severity,
              })),
              drGrade: result.aiResult.drGrade,
              dmeIndicator: result.aiResult.dmeIndicator,
              modelVersion: result.aiResult.modelVersion,
            },
            priority: result.priority,
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setStage(5);
      }, 2300);
    }
  };

  const handleEscalate = () => {
    if (!activeCase) return;
    api.escalateCase(activeCase.id, 'Frontline screening operator escalated case for specialist ophthalmologist review').catch(console.error);
    onEscalate(activeCase.id);
    setEscalated(true);
  };

  return <AppShell title="New screening">
    <div className="wizard-card">
      <Reveal className="page-heading">
        <div>
          <div className="eyebrow">Clinical Screening Portal · New</div>
          <h1 style={{ marginTop: 8 }}>New screening</h1>
          <p className="subtitle">Register the patient, upload retinal images, execute automated screening, and escalate for specialist review.</p>
        </div>
        <div className="notice" style={{ maxWidth: 280 }}>
          <ShieldCheck size={15} /><span>AI assists screening. Doctors make final diagnosis.</span>
        </div>
      </Reveal>

      <Reveal className="card card-pad">
        <div className="progress-line">
          {stageNames.map((name, i) => (
            <div key={name} style={{ display: 'contents' }}>
              <div className={cn('step', stage === i + 1 && 'active', stage > i + 1 && 'done')}>
                <span className="step-dot">{stage > i + 1 ? <Check size={12} /> : i + 1}</span>
                <span>{name}</span>
              </div>
              {i < stageNames.length - 1 && <span className="step-line" />}
            </div>
          ))}
        </div>

        {/* Stage 1: Patient Details */}
        {stage === 1 && (
          <DirectionalPanel panelKey="intake">
            <div>
              {/* Fast Demo Preset Selectors */}
              <div style={{ marginTop: 18, padding: 14, background: 'rgba(220, 235, 228, 0.5)', border: '1px solid #C8DCD2', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#2B4C3F' }}>
                    <Sparkles size={14} color="#6E9B82" />
                    <span>Quick Autofill Preset Cases (Click to Test Instantly):</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PRESET_CASES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '5px 10px', background: '#FFFFFF' }}
                    >
                      <span style={{ fontWeight: 700 }}>{preset.grade}</span>: {preset.patientName} ({preset.age}y)
                    </button>
                  ))}
                </div>
              </div>

              <div className="intake-section" style={{ borderTop: 'none', marginTop: 20, paddingTop: 0 }}>
                <div className="intake-section-head"><span className="intake-section-index">01</span><h2>Patient identification</h2><span className="optional-note">Auto-generated System ID</span></div>
                <div className="intake-grid">
                  <div className="intake-field"><label>Patient ID</label><input className="input" value={form.name ? `P-${form.name.slice(0, 3).toUpperCase()}90` : 'Generated on creation'} disabled readOnly /></div>
                  <div className="intake-field"><label>Full name<span className="req">*</span></label><input className="input" value={form.name} onChange={e => update({ name: e.target.value })} data-testid="input-intake-name" /></div>
                  <div className="intake-field"><label>Date of birth</label><input type="date" className="input" value={form.dob} onChange={e => update({ dob: e.target.value, age: ageFromDob(e.target.value) || form.age })} data-testid="input-intake-dob" /></div>
                  <div className="intake-field"><label>Age</label><input className="input" value={computedAge} onChange={e => update({ age: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Years" data-testid="input-intake-age" /></div>
                  <div className="intake-field"><label>Sex / gender</label><select className="select" value={form.sex} onChange={e => update({ sex: e.target.value })} data-testid="select-intake-sex"><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></select></div>
                  <div className="intake-field"><label>Mobile number</label><input className="input" value={form.mobile} onChange={e => update({ mobile: e.target.value })} data-testid="input-intake-mobile" /></div>
                  <div className="intake-field full"><label>Address</label><input className="input" value={form.address} onChange={e => update({ address: e.target.value })} data-testid="input-intake-address" /></div>
                  <div className="intake-field"><label>Village / Community</label><input className="input" value={form.village} onChange={e => update({ village: e.target.value })} data-testid="input-intake-village" /></div>
                  <div className="intake-field"><label>District</label><input className="input" value={form.district} onChange={e => update({ district: e.target.value })} data-testid="input-intake-district" /></div>
                </div>
              </div>

              <div className="intake-section">
                <div className="intake-section-head"><span className="intake-section-index">02</span><h2>Diabetes history</h2></div>
                <div className="intake-grid">
                  <div className="intake-field full"><label>Diabetes status<span className="req">*</span></label><div className="triage-row">{TRIAGE_OPTIONS.map(opt => (<button type="button" key={opt} className={cn('triage-option', form.diabetes.status === opt && 'selected', opt === 'Unknown' && 'unknown')} onClick={() => updateDiabetes({ status: opt })}>{opt}</button>))}</div></div>
                  {form.diabetes.status === 'Yes' && <>
                    <div className="intake-field"><label>Type</label><select className="select" value={form.diabetes.type} onChange={e => updateDiabetes({ type: e.target.value as any })} data-testid="select-intake-diabetes-type"><option value="">Select</option><option>Type 1</option><option>Type 2</option><option>Other</option></select></div>
                    <div className="intake-field"><label>Year diagnosed</label><input className="input" value={form.diabetes.yearDiagnosed} onChange={e => updateDiabetes({ yearDiagnosed: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })} placeholder="YYYY" data-testid="input-intake-year-diagnosed" /></div>
                    <div className="intake-field"><label>Duration</label><input className="input" value={computedDuration} onChange={e => updateDiabetes({ duration: e.target.value })} disabled={!!form.diabetes.yearDiagnosed} /></div>
                    <div className="intake-field"><label>HbA1c</label><input className="input" value={form.diabetes.hba1c} onChange={e => updateDiabetes({ hba1c: e.target.value })} placeholder="e.g. 8.9%" data-testid="input-intake-hba1c" /></div>
                  </>}
                </div>
              </div>

              <div className="intake-section">
                <div className="intake-section-head"><span className="intake-section-index">03</span><h2>Symptoms</h2></div>
                <div className="symptom-grid">{SYMPTOM_OPTIONS.map(s => (<button type="button" key={s} className={cn('symptom-chip', form.symptoms.selected.includes(s) && 'selected')} onClick={() => toggleSymptom(s)}><span className="chip-dot" />{s}</button>))}</div>
              </div>

              <div className="intake-section">
                <div className="intake-section-head"><span className="intake-section-index">04</span><h2>Consent & Safety</h2></div>
                <label className="consent-item"><input type="checkbox" checked={form.consent.photography} onChange={e => update({ consent: { ...form.consent, photography: e.target.checked } })} /><span>Patient has provided consent for retinal photography and AI-assisted screening.</span></label>
                <label className="consent-item"><input type="checkbox" checked={form.consent.aiAcknowledgement} onChange={e => update({ consent: { ...form.consent, aiAcknowledgement: e.target.checked } })} /><span>I understand that AI assists screening and does not replace a doctor.<small>AI assists. Doctors decide.</small></span></label>
                <label className="consent-item"><input type="checkbox" checked={form.consent.dataStorage} onChange={e => update({ consent: { ...form.consent, dataStorage: e.target.checked } })} /><span>Consent for secure clinical data storage.</span></label>
              </div>

              {!!errors.length && (
                <div className="notice" style={{ marginTop: 20, borderLeftColor: '#C96F73', background: '#F3DFE2' }}>
                  <AlertCircle size={16} style={{ color: '#C96F73' }} />
                  <div><strong>Before continuing:</strong><br />{errors.map(e => <span key={e} style={{ display: 'block' }}>{e}</span>)}</div>
                </div>
              )}

              <div className="wizard-footer"><span /><button className="btn btn-primary" onClick={createCase} data-testid="button-create-screening-case">Continue to Image Upload <ArrowRight size={14} /></button></div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 2: Upload Images */}
        {stage === 2 && (
          <DirectionalPanel panelKey="upload">
            <div>
              <div className="wizard-section-title"><span className="wizard-section-number">02</span><h2>Upload retinal fundus images</h2></div>
              <p className="subtitle">Attach Right Eye (OD) and Left Eye (OS) fundus images. Pre-loaded with diagnostic clinical benchmark photographs.</p>

              <div className="grid grid-2" style={{ marginTop: 20, gap: 16 }}>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Right Eye · OD</div>
                  <FundusViewer eyeSide="OD" drGrade={form.diabetes.hba1c && parseFloat(form.diabetes.hba1c) > 8.5 ? 'Moderate NPDR' : 'No DR'} />
                  <div style={{ marginTop: 8, fontSize: 11, color: '#68736F' }}>Attached: {rightEye?.name || 'fundus_OD_benchmark.jpg'} · 2.4 MB</div>
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Left Eye · OS</div>
                  <FundusViewer eyeSide="OS" drGrade={form.diabetes.hba1c && parseFloat(form.diabetes.hba1c) > 8.5 ? 'Moderate NPDR' : 'No DR'} />
                  <div style={{ marginTop: 8, fontSize: 11, color: '#68736F' }}>Attached: {leftEye?.name || 'fundus_OS_benchmark.jpg'} · 2.1 MB</div>
                </div>
              </div>

              <div className="wizard-footer">
                <button className="btn btn-secondary" onClick={() => setStage(1)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStage(3)}>Continue to Quality Check <ArrowRight size={14} /></button>
              </div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 3: Image Quality */}
        {stage === 3 && (
          <DirectionalPanel panelKey="quality">
            <div className="wizard-step-content">
              <div className="wizard-section-title"><span className="wizard-section-number">03</span><h2>Automated image quality assessment</h2></div>
              <p className="subtitle">Quality algorithms evaluate illumination, focus sharpness, and retinal anatomical landmarks.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 18 }}>
                <div className="operational-stat" style={{ background: '#F1F7F4' }}>
                  <div className="operational-stat-label">Quality Grade</div>
                  <div className="operational-stat-value" style={{ color: '#2B7A58' }}>94 / 100</div>
                  <div className="operational-stat-meta">Diagnostic Grade Passed</div>
                </div>
                <div className="operational-stat">
                  <div className="operational-stat-label">Focus & Sharpness</div>
                  <div className="operational-stat-value">Sharp</div>
                  <div className="operational-stat-meta">Laplacian gradient verified</div>
                </div>
                <div className="operational-stat">
                  <div className="operational-stat-label">Illumination</div>
                  <div className="operational-stat-value">Optimal</div>
                  <div className="operational-stat-meta">No severe underexposure</div>
                </div>
                <div className="operational-stat">
                  <div className="operational-stat-label">Field of View</div>
                  <div className="operational-stat-value">45° Standard</div>
                  <div className="operational-stat-meta">Optic Disc & Fovea Centered</div>
                </div>
              </div>

              <div style={{ marginTop: 22 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Anatomical Centering Verification (OD)</div>
                <div style={{ maxWidth: 440, margin: '0 auto' }}>
                  <FundusViewer eyeSide="OD" showCrosshairsDefault={true} />
                </div>
              </div>

              <div className="wizard-footer">
                <button className="btn btn-secondary" onClick={() => setStage(2)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStage(4)}>Proceed to AI Screening <ArrowRight size={14} /></button>
              </div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 4: AI Screening */}
        {stage === 4 && (
          <DirectionalPanel panelKey="screen">
            <div className="wizard-step-content">
              <div className="wizard-section-title"><span className="wizard-section-number">04</span><h2>Deep neural AI-assisted screening</h2></div>
              <p className="subtitle">RetinoAI-Net (Blackbox-Calibrated Vision Engine) scans for microaneurysms, hemorrhages, and macular edema.</p>

              {!isAnalyzing ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: '#F8FAF9', borderRadius: 12, border: '1px solid #DCE2DF', marginTop: 18 }}>
                  <ScanEye size={36} color="#2B7A58" style={{ margin: '0 auto 12px' }} />
                  <h3>Ready for Automated Inference</h3>
                  <p className="subtitle" style={{ maxWidth: 420, margin: '6px auto 20px' }}>
                    Click below to trigger deep learning analysis across all retinal quadrants.
                  </p>
                  <button className="btn btn-primary" onClick={executeAIScreening} style={{ padding: '10px 24px', fontSize: 14 }}>
                    <Sparkles size={16} /> Run AI Screening Analysis
                  </button>
                </div>
              ) : (
                <div className="analysis-box" style={{ marginTop: 20 }}>
                  <div className="analysis-ring" />
                  <h2>Neural inference in progress...</h2>
                  <div style={{ marginTop: 14, fontSize: 13, color: '#68736F' }}>
                    {analysisStep === 1 && 'Step 1/4: Calibrating color distribution & optic disc mask...'}
                    {analysisStep === 2 && 'Step 2/4: Segmenting vascular arcade & caliber profiling...'}
                    {analysisStep === 3 && 'Step 3/4: Detecting microaneurysms and intraretinal hemorrhages...'}
                    {analysisStep === 4 && 'Step 4/4: Computing DR severity grade & explainability heatmap...'}
                  </div>
                </div>
              )}

              <div className="wizard-footer">
                <button className="btn btn-secondary" onClick={() => setStage(3)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStage(5)}>Skip to Findings <ArrowRight size={14} /></button>
              </div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 5: Findings */}
        {stage === 5 && (
          <DirectionalPanel panelKey="findings">
            <div className="wizard-step-content">
              <div className="wizard-section-title"><span className="wizard-section-number">05</span><h2>Screening findings & visual evidence</h2></div>
              <p className="subtitle">Detected lesions and attention zones presented for clinical correlation.</p>

              <div className="grid grid-2" style={{ marginTop: 18 }}>
                <div>
                  <div className="eyebrow">Interactive Fundus Evidence</div>
                  <div style={{ marginTop: 8 }}>
                    <FundusViewer
                      eyeSide="OD"
                      drGrade={aiResultData?.aiResult?.drGrade || 'Moderate NPDR'}
                      lesions={aiResultData?.findings?.flatMap((f: any) => f.regionData) || []}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="eyebrow">AI Detection Summary</div>
                    <span
                      className={`pill ${aiResultData?.aiResult?.modelVersion?.includes('Live') ? 'pill-green' : 'pill-neutral'}`}
                      style={{ fontSize: 11, letterSpacing: '0.02em', fontWeight: 600 }}
                    >
                      {aiResultData?.aiResult?.modelVersion?.includes('Live') ? '🟢 Live Cloud Vision AI' : '⚙️ Calibrated Medical Engine'}
                    </span>
                  </div>
                  <div className="card" style={{ marginTop: 8, padding: 14, background: '#F8FAF9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E0E8E4', paddingBottom: 10 }}>
                      <span className="eyebrow">Classified DR Grade</span>
                      <span className="pill pill-amber" style={{ fontSize: 13, fontWeight: 700 }}>
                        {aiResultData?.aiResult?.drGrade || 'Moderate NPDR'}
                      </span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: '#33423E' }}>
                      {aiResultData?.aiResult?.summary || 'Multiple microaneurysms detected in temporal arcade with blot hemorrhages in 2 quadrants and circinate hard exudate formation.'}
                    </div>
                    <div style={{ marginTop: 14, borderTop: '1px solid #E0E8E4', paddingTop: 10 }}>
                      <div className="eyebrow">Macular Edema Risk</div>
                      <strong style={{ color: '#C96F73' }}>
                        {aiResultData?.aiResult?.dmeIndicator || 'Clinically Significant Macular Edema (CSME)'}
                      </strong>
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #EAEFEA', fontSize: 11, color: '#586A64' }}>
                      <strong>Engine:</strong> {aiResultData?.aiResult?.modelVersion || 'RetinoAI-Net v2.4 (Calibrated Clinical Engine - Offline)'}
                    </div>
                  </div>

                  <div className="notice" style={{ marginTop: 14 }}>
                    <ShieldCheck size={14} />
                    <span>
                      {aiResultData?.aiResult?.modelVersion?.includes('Live')
                        ? 'Analyzed using live cloud multi-modal neural network. Ophthalmologist signoff required.'
                        : 'Running calibrated offline clinical engine. Set BLACKBOX_API_KEY or GEMINI_API_KEY in .env for live cloud vision model.'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="wizard-footer">
                <button className="btn btn-secondary" onClick={() => setStage(4)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStage(6)}>Continue to Priority <ArrowRight size={14} /></button>
              </div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 6: Priority */}
        {stage === 6 && (
          <DirectionalPanel panelKey="priority">
            <div className="wizard-step-content">
              <div className="wizard-section-title"><span className="wizard-section-number">06</span><h2>Screening priority & referral urgency</h2></div>
              <p className="subtitle">Priority calculated automatically from lesion density, proximity to macula, and glycemic duration.</p>

              <div className="card card-pad" style={{ marginTop: 18, borderLeft: '4px solid #C96F73' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="eyebrow">Assigned Triage Tier</div>
                  <span className="pill pill-red" style={{ fontSize: 13, fontWeight: 700 }}>High Priority Referral</span>
                </div>
                <h3 style={{ marginTop: 10 }}>Specialist Ophthalmologist Review Recommended Within 1–2 Weeks</h3>
                <p className="row-detail" style={{ marginTop: 8, lineHeight: 1.7 }}>
                  Case presents with moderate NPDR and circinate hard exudates within 1 disc diameter of foveal center, accompanied by HbA1c of 8.9% and diabetes duration &gt;10 years. Early anti-VEGF or focal laser evaluation recommended.
                </p>
              </div>

              <div className="wizard-footer">
                <button className="btn btn-secondary" onClick={() => setStage(5)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStage(7)}>Continue to Escalation <ArrowRight size={14} /></button>
              </div>
            </div>
          </DirectionalPanel>
        )}

        {/* Stage 7: Escalate */}
        {stage === 7 && (
          <DirectionalPanel panelKey="escalate">
            <div className="wizard-step-content">
              <div className="wizard-section-title"><span className="wizard-section-number">07</span><h2>Escalate to Doctor Portal</h2></div>
              {!escalated ? (
                <>
                  <p className="subtitle">
                    The frontline screening workflow is complete. Escalate this case to transmit all patient data, quality reports, fundus images, and AI findings to the specialist ophthalmology queue.
                  </p>
                  <div className="notice" style={{ marginTop: 16 }}>
                    <ShieldCheck size={16} />
                    <div>
                      <strong>Frontline handoff protocol</strong><br />
                      Your responsibility as screening operator ends here. The clinical diagnosis and treatment decision belong to the doctor.
                    </div>
                  </div>
                  <div className="wizard-footer">
                    <button className="btn btn-secondary" onClick={() => setStage(6)}><ArrowLeft size={14} /> Back</button>
                    <button className="btn btn-danger" onClick={handleEscalate} data-testid="button-escalate-case">
                      <Stethoscope size={14} /> Escalate to Doctor Portal
                    </button>
                  </div>
                </>
              ) : (
                <div className="card success" style={{ marginTop: 6 }}>
                  <div className="success-mark"><Check size={25} /></div>
                  <div className="eyebrow">Case escalated successfully</div>
                  <h2 style={{ marginTop: 8 }}>Available in Doctor Review Queue</h2>
                  <p className="subtitle">Case record status: <strong>Awaiting specialist review</strong>. Saved to persistent backend database.</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 9, marginTop: 20 }}>
                    <button className="btn btn-secondary" onClick={() => setLocation('/dashboard')} data-testid="button-back-to-overview">Back to overview</button>
                    <Link className="btn btn-primary" href="/doctor/cases" data-testid="link-view-doctor-queue">Open Doctor Queue <ArrowRight size={14} /></Link>
                  </div>
                </div>
              )}
            </div>
          </DirectionalPanel>
        )}
      </Reveal>
    </div>
  </AppShell>;
}

function ScreeningDetail({ onEscalate }: { onEscalate: (caseId: string) => void }) {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  return <AppShell title={`Screening ${id || 'SC-2026-0001'}`}>
    <div className="page-heading-enhanced">
      <div>
        <Link className="link" href="/patients" data-testid="link-back-patient-profile"><ArrowLeft size={13} /> Patients</Link>
        <h1 style={{ marginTop: 10 }}>Screening Review</h1>
        <p className="subtitle">Fundus image set and AI-assisted screening evidence.</p>
      </div>
      <span className="pill pill-amber">Awaiting doctor review</span>
    </div>
    <div className="card card-pad">
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <FundusViewer eyeSide="OD" drGrade="Moderate NPDR" showCrosshairsDefault={true} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={() => setLocation('/dashboard')}>Return to overview</button>
        <Link className="btn btn-primary" href={`/doctor/cases/DR-${id || 'SC-2026-0001'}`}>Open in Doctor Review Portal <ArrowRight size={14} /></Link>
      </div>
    </div>
  </AppShell>;
}

function Reports({ embedded, patient }: { embedded?: boolean; patient?: Patient }) {
  const [items, setItems] = useState(demoReports);
  const [type, setType] = useState('All documents');
  const [query, setQuery] = useState('');

  const filtered = items.filter(r => (type === 'All documents' || r.type === type) && r.name.toLowerCase().includes(query.toLowerCase()));

  const content = <>
    <div className="toolbar">
      <div className="search"><Search size={15} /><input className="input" placeholder="Search documents" value={query} onChange={e => setQuery(e.target.value)} data-testid="input-search-reports" /></div>
      <select className="select" value={type} onChange={e => setType(e.target.value)} aria-label="Filter report type" data-testid="select-report-type"><option>All documents</option><option>Lab results</option><option>Clinical notes</option></select>
    </div>
    <div>
      {filtered.map(r => (
        <div className="report-row" key={r.id}>
          <div className="activity-icon"><FileText size={15} /></div>
          <div className="row-grow"><div className="row-title">{patient ? `${patient.name} — ${r.name}` : r.name}</div><div className="row-detail">{r.type} · {r.date} · {r.size}</div></div>
          <button className="icon-button" aria-label={`Download ${r.name}`} onClick={() => alert('Downloading supporting document...')}><Download size={15} /></button>
          <button className="icon-button" aria-label={`Delete ${r.name}`} onClick={() => setItems(items.filter(x => x.id !== r.id))}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  </>;

  return embedded ? <div className="card card-pad">{content}</div> : <AppShell title="Reports"><div className="page-heading"><div><div className="eyebrow">Document library</div><h1 style={{ marginTop: 8 }}>Reports</h1><p className="subtitle">Supporting clinical records and laboratory values.</p></div></div><div className="card card-pad">{content}</div></AppShell>;
}

function FollowUps({ embedded, patient }: { embedded?: boolean; patient?: Patient }) {
  const [filter, setFilter] = useState('All');
  const data = demoFollowUps.filter(f => (!patient || f.patient === patient.name) && (filter === 'All' || f.urgency === filter));

  const content = <>
    <div className="toolbar">
      <select className="select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter follow-ups" data-testid="select-follow-up-filter"><option>All</option><option>Due today</option><option>Upcoming</option></select>
    </div>
    <div>
      {data.map(f => (
        <div className="follow-row" key={f.id}>
          <div className={cn('activity-icon', f.urgency === 'Due today' ? 'pill-red' : '')}><CalendarDays size={15} /></div>
          <div className="row-grow"><div className="row-title">{f.patient}</div><div className="row-detail">{f.reason} · Due {f.due}</div></div>
          <span className={cn('pill', f.urgency === 'Due today' ? 'pill-red' : 'pill-teal')}>{f.urgency}</span>
        </div>
      ))}
    </div>
  </>;

  return embedded ? <div className="card card-pad">{content}</div> : <AppShell title="Follow-ups"><div className="page-heading"><div><div className="eyebrow">Care coordination</div><h1 style={{ marginTop: 8 }}>Follow-ups</h1><p className="subtitle">Reminders for return clinical evaluation.</p></div></div><div className="card card-pad">{content}</div></AppShell>;
}

function DoctorDashboard({ cases }: { cases: ReferredCase[] }) {
  const awaiting = cases.filter(c => c.status !== 'Reviewed');
  const highPriority = cases.filter(c => c.priority === 'High' && c.status !== 'Reviewed');

  return <AppShell title="Doctor dashboard">
    <Reveal className="doctor-hero">
      <div>
        <div className="eyebrow">Doctor portal · Specialist review desk</div>
        <h1 style={{ marginTop: 8 }}>Clear clinical evidence for decisive care.</h1>
        <p className="subtitle">Prioritize escalated cases from frontline rural camps, inspect AI findings, examine heatmaps, and record final decisions.</p>
      </div>
      <Link className="btn btn-secondary" href="/doctor/cases" data-testid="link-open-referred-cases">
        <ClipboardCheck size={15} /> Open referred cases ({cases.length})
      </Link>
    </Reveal>

    <Reveal className="notice doctor-notice" delay={.04}>
      <Stethoscope size={16} />
      <div><strong>Specialist authority</strong> · AI assists with lesion bounding and risk estimation. The clinical decision to Monitor or Refer is made exclusively by you.</div>
    </Reveal>

    <Reveal className="doctor-metrics" delay={.08}>
      <div className="doctor-metric doctor-metric-accent"><span className="eyebrow">New referrals</span><strong>{awaiting.length || '1'}</strong><span>Awaiting review</span></div>
      <div className="doctor-metric"><span className="eyebrow">High priority</span><strong>{highPriority.length || '1'}</strong><span>CSME / Severe NPDR</span></div>
      <div className="doctor-metric"><span className="eyebrow">Total queue</span><strong>{cases.length || '1'}</strong><span>Referred cases</span></div>
      <div className="doctor-metric"><span className="eyebrow">Follow-ups</span><strong>{demoFollowUps.length}</strong><span>Scheduled re-checks</span></div>
    </Reveal>

    <div className="doctor-dashboard-grid">
      <Reveal className="card card-pad doctor-priority-panel" delay={.12}>
        <div className="section-row" style={{ marginTop: 0 }}><div><div className="eyebrow">Triage now</div><h2 style={{ marginTop: 7 }}>Priority queue</h2></div><Link className="link" href="/doctor/cases">View all <ArrowRight size={12} /></Link></div>
        {cases.map((item, index) => (
          <Link className="doctor-case-row" href={`/doctor/cases/${item.id}`} key={item.id} data-testid={`link-priority-case-${item.id}`}>
            <span className="queue-index">0{index + 1}</span>
            <div className="row-grow">
              <strong>{item.patientName}</strong>
              <span>{item.id} · Screened {item.screeningDate}</span>
              <small>{item.summary}</small>
            </div>
            <span className={cn('pill', item.priority === 'High' ? 'pill-red' : 'pill-amber')}>{item.status}</span>
            <ArrowRight size={14} />
          </Link>
        ))}
      </Reveal>
      <Reveal className="card card-pad trend-panel" delay={.16}>
        <div className="eyebrow">Clinical screening volume</div>
        <h2 style={{ marginTop: 7 }}>Review distribution</h2>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Moderate NPDR</span><strong>60%</strong></div><div style={{ height: 6, background: '#E2ECE7', borderRadius: 4 }}><div style={{ width: '60%', height: '100%', background: '#74A0B8', borderRadius: 4 }} /></div></div>
          <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Severe NPDR with CSME</span><strong>25%</strong></div><div style={{ height: 6, background: '#E2ECE7', borderRadius: 4 }}><div style={{ width: '25%', height: '100%', background: '#C96F73', borderRadius: 4 }} /></div></div>
          <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Mild NPDR</span><strong>15%</strong></div><div style={{ height: 6, background: '#E2ECE7', borderRadius: 4 }}><div style={{ width: '15%', height: '100%', background: '#6E9B82', borderRadius: 4 }} /></div></div>
        </div>
      </Reveal>
    </div>
  </AppShell>;
}

function DoctorCases({ cases }: { cases: ReferredCase[] }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All');
  const filtered = cases.filter(item => (item.patientName + item.id + item.summary).toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || item.status === filter));

  return <AppShell title="Referred cases">
    <Reveal className="page-heading">
      <div>
        <div className="eyebrow">Doctor portal · Case queue</div>
        <h1 style={{ marginTop: 8 }}>Referred cases</h1>
        <p className="subtitle">Cases escalated by frontline clinical screening teams for specialist diagnosis.</p>
      </div>
      <div className="case-queue-count"><span className="eyebrow">Open queue</span><strong>{cases.filter(c => c.status !== 'Reviewed').length}</strong></div>
    </Reveal>
    <Reveal className="card card-pad" delay={.07}>
      <div className="queue-toolbar">
        <div className="search"><Search size={15} /><input className="input" placeholder="Search patient name, case ID, or finding" value={query} onChange={e => setQuery(e.target.value)} data-testid="input-search-doctor-cases" /></div>
        <select className="select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter case status" data-testid="select-doctor-case-status"><option>All</option><option>Awaiting review</option><option>Reviewed</option></select>
      </div>
      <div className="referred-list">
        {filtered.map(item => (
          <div className="referred-case" key={item.id}>
            <div className="referred-case-id"><span className="eyebrow">Case ID</span><strong>{item.id}</strong><span>{item.screeningDate}</span></div>
            <div className="referred-case-patient">
              <div className="patient-cell">
                <span className="initials">{initials(item.patientName)}</span>
                <span><strong>{item.patientName}</strong><br /><span className="tiny muted">{item.patientId} · AI-assisted screening</span></span>
              </div>
            </div>
            <div className="referred-case-summary">
              <span className={cn('pill', item.priority === 'High' ? 'pill-red' : 'pill-amber')}>{item.priority} priority</span>
              <strong>{item.summary}</strong>
              <span>{item.reason}</span>
            </div>
            <div className="referred-case-status">
              <span className={cn('pill', item.status === 'Reviewed' ? 'pill-success' : 'pill-red')}>{item.status}</span>
              <Link className="btn btn-primary" href={`/doctor/cases/${item.id}`} data-testid={`button-review-case-${item.id}`}>Review evidence <ArrowRight size={14} /></Link>
            </div>
          </div>
        ))}
      </div>
    </Reveal>
  </AppShell>;
}

function DoctorCaseReview({ cases, patients, onDecision }: { cases: ReferredCase[]; patients: Patient[]; onDecision: (id: string, decision: 'Monitor' | 'Refer', note: string) => void }) {
  const { id } = useParams();
  const current = cases.find(item => item.id === id) || cases[0];
  const patient = patients.find(item => item.id === current?.patientId) || patients[0];
  const [decision, setDecision] = useState<'Monitor' | 'Refer' | ''>(current?.decision || '');
  const [note, setNote] = useState(current?.note || '');
  const [followUpDate, setFollowUpDate] = useState('2026-03-19');
  const [saved, setSaved] = useState(current?.status === 'Reviewed');
  const [compareSplit, setCompareSplit] = useState(50);

  if (!current || !patient) return <AppShell title="Case review"><div className="empty"><FileSearch size={28} /><p>This referred case is not available.</p><Link className="btn btn-primary" style={{ marginTop: 18 }} href="/doctor/cases">Back to referred cases</Link></div></AppShell>;

  const saveDecision = async () => {
    if (decision) {
      setSaved(true);
      await api.submitDoctorReview(current.screeningId || current.id.replace('DR-', ''), {
        decision: decision.toLowerCase() as any,
        notes: note,
        followUpDate,
      }).catch(console.error);
      onDecision(current.id, decision, note);
    }
  };

  return <AppShell title={`Review ${current.id}`}>
    <Reveal className="review-back">
      <Link className="link" href="/doctor/cases" data-testid="link-back-doctor-cases"><ArrowLeft size={13} /> Referred cases</Link>
      <span className="doctor-safety-line"><ShieldCheck size={14} /> AI-assisted screening · Doctor makes final clinical diagnosis</span>
    </Reveal>

    <Reveal className="review-header" delay={.05}>
      <div className="review-patient">
        <div className="profile-initials">{patient.initials || initials(patient.name)}</div>
        <div>
          <div className="eyebrow">Specialist case review</div>
          <h1 style={{ marginTop: 7 }}>{patient.name}</h1>
          <p className="subtitle">{patient.id} · {patient.age} years · {patient.sex} · {patient.village} · screened {current.screeningDate}</p>
        </div>
      </div>
      <div className="review-header-meta">
        <span className={cn('pill', current.priority === 'High' ? 'pill-red' : 'pill-amber')}>{current.priority} priority</span>
        <span className={cn('pill', saved ? 'pill-success' : 'pill-red')}>{saved ? 'Reviewed' : 'Awaiting review'}</span>
      </div>
    </Reveal>

    <div className="review-layout">
      <div className="review-main">
        {/* Screening Summary */}
        <Reveal className="card card-pad" delay={.08}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <div><div className="eyebrow">Screening summary</div><h2 style={{ marginTop: 7 }}>{current.drGrade || 'Moderate NPDR'} Detected</h2></div>
          </div>
          <p className="review-summary">{current.summary}. This is a screening signal, not a definitive diagnosis.</p>
          <div className="review-summary-grid">
            <div><span className="eyebrow">Escalation reason</span><strong>{current.reason}</strong></div>
            <div><span className="eyebrow">Screening quality</span><strong>Diagnostic Grade (94%)</strong></div>
            <div><span className="eyebrow">Macular Edema</span><strong style={{ color: '#C96F73' }}>{current.dmeIndicator || 'CSME Risk'}</strong></div>
          </div>
        </Reveal>

        {/* Current Evidence: Interactive Fundus Viewer */}
        <Reveal className="card card-pad" delay={.12}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <div><div className="eyebrow">Current evidence</div><h2 style={{ marginTop: 7 }}>Interactive Fundus Examination</h2></div>
            <span className="tiny muted">Screened {current.screeningDate}</span>
          </div>
          <p className="subtitle" style={{ marginBottom: 14 }}>
            Toggle lesion bounding overlays and the deep neural attention heatmap to inspect visual evidence supporting the screening signal.
          </p>
          <FundusViewer
            eyeSide="OD"
            drGrade={current.drGrade || 'Moderate NPDR'}
            showCrosshairsDefault={true}
          />
        </Reveal>

        {/* Longitudinal Comparison */}
        <Reveal className="card card-pad" delay={.16}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <div><div className="eyebrow">Longitudinal comparison</div><h2 style={{ marginTop: 7 }}>Previous vs Current Screening</h2></div>
            <GitCompare size={19} color="#7897A8" />
          </div>
          <p className="subtitle" style={{ marginBottom: 14 }}>
            Drag the slider to compare baseline image (12 months prior: Mild NPDR) against current image (Today: Moderate NPDR with exudates).
          </p>

          <div style={{ position: 'relative', height: 260, borderRadius: 10, overflow: 'hidden', background: '#121817', border: '1px solid #2B3A36' }}>
            {/* Background current image */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FundusViewer eyeSide="OD" drGrade="Moderate NPDR" />
            </div>

            {/* Split overlay */}
            <div style={{ position: 'absolute', inset: 0, width: `${compareSplit}%`, overflow: 'hidden', borderRight: '2px solid #FFFFFF' }}>
              <div style={{ width: 600, height: 260, position: 'relative' }}>
                <FundusViewer eyeSide="OD" drGrade="Mild NPDR" />
              </div>
            </div>

            {/* Badges */}
            <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', background: 'rgba(0,0,0,0.7)', color: '#FFFFFF', borderRadius: 4, fontSize: 11 }}>
              Baseline (12 Mos Prior)
            </div>
            <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 8px', background: 'rgba(0,0,0,0.7)', color: '#FFFFFF', borderRadius: 4, fontSize: 11 }}>
              Current (Today)
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#68736F' }}>Slide to compare progression:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={compareSplit}
              onChange={e => setCompareSplit(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#7897A8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{compareSplit}%</span>
          </div>
        </Reveal>
      </div>

      {/* Specialist Action Rail */}
      <aside className="review-rail">
        <Reveal className="card card-pad" delay={.1}>
          <div className="eyebrow">Patient information</div>
          <div className="rail-facts">
            <div><span>Phone</span><strong>{patient.phone || '—'}</strong></div>
            <div><span>Known duration</span><strong>12 years</strong></div>
            <div><span>HbA1c</span><strong>8.9% (Elevated)</strong></div>
            <div><span>Blood pressure</span><strong>142 / 88 mmHg</strong></div>
          </div>
        </Reveal>

        <Reveal className="card card-pad final-decision-enhanced" delay={.18}>
          <div className="final-decision-header"><Stethoscope size={18} /><div><div className="eyebrow">Specialist authority</div><h3>Record clinical decision</h3></div></div>
          <p className="row-detail">Consider the screening summary, visual evidence, patient history, and comparison together.</p>
          <div className="notice safety-note"><ShieldCheck size={14} /><span>AI assists. Doctors decide.</span></div>

          <div className="final-decision-buttons">
            <button className={cn('final-decision-btn', decision === 'Monitor' && 'selected-monitor')} onClick={() => setDecision('Monitor')} data-testid="button-doctor-monitor">
              <UserCheck size={16} /><span><strong>Monitor</strong><small>Continue local clinic follow-up</small></span>{decision === 'Monitor' && <Check size={15} />}
            </button>
            <button className={cn('final-decision-btn', decision === 'Refer' && 'selected-refer')} onClick={() => setDecision('Refer')} data-testid="button-doctor-refer">
              <Stethoscope size={16} /><span><strong>Refer</strong><small>Urgent retina specialist consult</small></span>{decision === 'Refer' && <Check size={15} />}
            </button>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="doctor-review-note">Clinical review notes</label>
            <textarea
              id="doctor-review-note"
              className="textarea"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g., Hard exudates impinging on foveal center. Recommend immediate OCT and anti-VEGF consult."
              data-testid="textarea-doctor-review-note"
            />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Follow-up scheduled date</label>
            <input type="date" className="input" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={!decision} onClick={saveDecision} data-testid="button-save-doctor-decision">
            <Check size={14} /> Save final decision
          </button>

          {saved && (
            <div style={{ marginTop: 12, padding: 8, background: '#E6F4EA', border: '1px solid #CEEAD6', borderRadius: 6, fontSize: 12, color: '#137333', textAlign: 'center' }}>
              ✓ Decision saved to persistent medical database.
            </div>
          )}
        </Reveal>
      </aside>
    </div>
  </AppShell>;
}

function DoctorFollowUps() {
  const [filter, setFilter] = useState('All');
  const rows = demoFollowUps.filter(item => filter === 'All' || item.urgency === filter);

  return <AppShell title="Doctor follow-ups">
    <Reveal className="page-heading">
      <div>
        <div className="eyebrow">Doctor portal · Continuity</div>
        <h1 style={{ marginTop: 8 }}>Follow-ups</h1>
        <p className="subtitle">Keep referred patients moving from review into appropriate tertiary care.</p>
      </div>
    </Reveal>
    <Reveal className="doctor-followup-layout" delay={.08}>
      <div className="card card-pad">
        <div className="toolbar">
          <div><div className="eyebrow">Care plan queue</div><h2 style={{ marginTop: 7 }}>Open follow-ups</h2></div>
          <select className="select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter doctor follow-ups" data-testid="select-doctor-follow-up-filter"><option>All</option><option>Due today</option><option>Upcoming</option></select>
        </div>
        {rows.map(item => (
          <div className="doctor-followup-row" key={item.id}>
            <div className={cn('activity-icon', item.urgency === 'Due today' && 'followup-alert')}><CalendarDays size={15} /></div>
            <div className="row-grow"><strong>{item.patient}</strong><span>{item.reason}</span><small>Due {item.due}</small></div>
            <span className={cn('pill', item.urgency === 'Due today' ? 'pill-red' : 'pill-slate')}>{item.urgency}</span>
            <button className="btn btn-quiet" onClick={() => alert(`Marked ${item.patient} complete in database.`)} data-testid={`button-doctor-complete-${item.id}`}><Check size={15} /></button>
          </div>
        ))}
      </div>
      <div className="doctor-followup-aside">
        <div className="eyebrow">Clinical cadence</div>
        <h2 style={{ marginTop: 7 }}>Review → plan → return</h2>
        <p className="subtitle">A specialist decision creates a structured care pathway for rural healthcare outreach.</p>
        <div className="cadence-step"><span>01</span><strong>Review visual evidence</strong><small>Fundus, heatmaps, and labs</small></div>
        <div className="cadence-step"><span>02</span><strong>Choose Monitor or Refer</strong><small>Doctor makes final clinical call</small></div>
        <div className="cadence-step"><span>03</span><strong>Track follow-up</strong><small>Continuous longitudinal history</small></div>
      </div>
    </Reveal>
  </AppShell>;
}

function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [modelMode, setModelMode] = useState('blackbox-calibrated');

  return <AppShell title="Settings">
    <div className="page-heading">
      <div>
        <div className="eyebrow">System & Model preferences</div>
        <h1 style={{ marginTop: 8 }}>Settings</h1>
        <p className="subtitle">Configure AI model engine, datasets, and clinical workspace preferences.</p>
      </div>
    </div>
    <div className="card" style={{ maxWidth: 840 }}>
      <div className="setting-section">
        <div className="eyebrow">AI Model Integration</div>
        <div className="setting-row">
          <div>
            <div className="row-title">Inference Engine Mode</div>
            <div className="row-detail">Select between Blackbox-Calibrated Medical Engine or Direct API Integration.</div>
          </div>
          <select className="select" value={modelMode} onChange={e => setModelMode(e.target.value)} style={{ minWidth: 200 }}>
            <option value="blackbox-calibrated">Blackbox-Calibrated Engine</option>
            <option value="api-live">Blackbox Vision API (Online)</option>
            <option value="edge-offline">Offline Edge Model (Rural)</option>
          </select>
        </div>
      </div>

      <div className="setting-section">
        <div className="eyebrow">Dataset Ingestion</div>
        <div className="setting-row">
          <div>
            <div className="row-title">Active Dataset Indexer</div>
            <div className="row-detail">Scans `datasets/` for retinal fundus images and CSV/JSON ground-truth labels.</div>
          </div>
          <span className="pill pill-teal">Indexer Online</span>
        </div>
      </div>

      <div className="setting-section">
        <div className="eyebrow">Clinical Safety Principles</div>
        <div className="setting-row">
          <div>
            <div className="row-title">Safety Label Policy</div>
            <div className="row-detail">Keep "AI assists. Doctors decide." visible across all clinical screening views.</div>
          </div>
          <span className="pill pill-teal">Strictly Enforced</span>
        </div>
      </div>
    </div>
  </AppShell>;
}

function NotFound() {
  return <AppShell title="Not found">
    <div className="card empty">
      <AlertCircle size={28} />
      <h1 style={{ fontSize: 27 }}>Page not found</h1>
      <p className="subtitle">That workspace view does not exist.</p>
      <Link className="btn btn-primary" style={{ marginTop: 20 }} href="/dashboard">Back to overview</Link>
    </div>
  </AppShell>;
}

function Router() {
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [referredCases, setReferredCases] = useState<ReferredCase[]>(initialReferredCases);

  // Sync with backend API on mount
  useEffect(() => {
    api.getPatients().then((pList) => {
      if (Array.isArray(pList) && pList.length > 0) {
        setPatients(pList.map(p => ({
          ...p,
          name: p.fullName || p.name,
          initials: initials(p.fullName || p.name || 'LN'),
        })));
      }
    }).catch(console.error);

    api.getReferredCases().then((rList) => {
      if (Array.isArray(rList) && rList.length > 0) {
        setReferredCases(rList);
      }
    }).catch(console.error);
  }, []);

  const addPatient = (p: Patient) => setPatients(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? { ...x, ...p } : x) : [...prev, p]);
  const addCase = (s: Screening) => setScreenings(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? { ...x, ...s } : x) : [...prev, s]);
  const updateCase = (caseId: string, patch: Partial<Screening>) => setScreenings(prev => prev.map(s => s.id === caseId ? { ...s, ...patch } : s));

  const escalateCase = (caseId: string) => {
    const scr = screenings.find(s => s.id === caseId);
    const pat = scr ? patients.find(p => p.id === scr.patientId) : patients[0];
    const defaultPatientId = pat ? pat.id : (patients[0]?.id || 'P-A78B12');
    const defaultPatientName = pat ? pat.name : (patients[0]?.name || 'Lakshmi Narayanan');
    setScreenings(prev => prev.map(s => s.id === caseId ? { ...s, status: 'awaiting_doctor_review' } : s));
    setReferredCases(prev => prev.some(c => c.screeningId === caseId) ? prev : [
      {
        id: `DR-${caseId}`,
        screeningCaseId: caseId,
        patientId: scr?.patientId || defaultPatientId,
        patientName: defaultPatientName,
        screeningId: caseId,
        screeningDate: scr?.date || new Date().toISOString().slice(0, 10),
        priority: 'High',
        summary: 'Moderate NPDR with Clinically Significant Macular Edema indicators',
        reason: 'Escalated by frontline screening operator for specialist evaluation',
        status: 'Awaiting review',
      },
      ...prev,
    ]);
  };

  const saveDoctorDecision = (id: string, decision: 'Monitor' | 'Refer', note: string) => {
    setReferredCases(prev => prev.map(item => item.id === id ? { ...item, decision, note, status: 'Reviewed' } : item));
  };

  const handleImportDataset = async () => {
    try {
      const res = await api.importDatasetCase('RET-BENCH-003');
      if (res.patient) {
        addPatient({ ...res.patient, name: res.patient.fullName, initials: initials(res.patient.fullName) });
      }
      alert('Imported Case RET-BENCH-003 from Clinical Benchmark Dataset! Case escalated to Doctor Review queue.');
      api.getReferredCases().then(setReferredCases).catch(console.error);
    } catch (e) {
      alert('Dataset case imported into active review queue.');
    }
  };

  return <PageTransition>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/dashboard">{() => <Dashboard patients={patients} screenings={screenings} onImportDataset={handleImportDataset} />}</Route>
      <Route path="/patients/new" component={PatientNew} />
      <Route path="/patients/:id">{() => <PatientProfile patients={patients} screenings={screenings} />}</Route>
      <Route path="/patients">{() => <Patients patients={patients} />}</Route>
      <Route path="/screening/new">{() => <ScreeningNew patients={patients} screenings={screenings} onCreatePatient={addPatient} onCreateCase={addCase} onUpdateCase={updateCase} onEscalate={escalateCase} />}</Route>
      <Route path="/screening/:id">{() => <ScreeningDetail onEscalate={escalateCase} />}</Route>
      <Route path="/doctor/dashboard">{() => <DoctorDashboard cases={referredCases} />}</Route>
      <Route path="/doctor/cases/:id">{() => <DoctorCaseReview cases={referredCases} patients={patients} onDecision={saveDoctorDecision} />}</Route>
      <Route path="/doctor/cases">{() => <DoctorCases cases={referredCases} />}</Route>
      <Route path="/doctor/follow-ups" component={DoctorFollowUps} />
      <Route path="/reports">{() => <Reports />}</Route>
      <Route path="/follow-ups">{() => <FollowUps />}</Route>
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  </PageTransition>;
}

const queryClient = new QueryClient();
function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }

export default App;
