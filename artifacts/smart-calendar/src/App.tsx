import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertCircle, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  CircleHelp, CloudUpload, FileSpreadsheet, Filter, Gauge, LoaderCircle,
  LogOut, Menu, Pause, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  Video, X, CalendarCheck2, Clock3, Trash2, Globe2,
} from 'lucide-react';
import {
  useHealthCheck, getHealthCheckQueryKey,
  useGetGoogleSession, getGetGoogleSessionQueryKey, useLogoutGoogle,
  useGetDashboard, getGetDashboardQueryKey, useListCalendars,
  getListCalendarsQueryKey, useListEvents, getListEventsQueryKey,
  useCreateEvent, useGetEvent, getGetEventQueryKey, useUpdateEvent,
  useDeleteEvent, useListReminders, getListRemindersQueryKey,
  useUpdateReminder, useListJobs, getListJobsQueryKey, useRetryJob,
  useListActivity, getListActivityQueryKey, useListImports,
  getListImportsQueryKey, usePreviewImport, useExecuteImport,
} from '@workspace/api-client-react';
import { ReminderInputMethod, ReminderInputUnit } from '@workspace/api-client-react';
import type { Calendar, CalendarEvent, EventInput, EventUpdate, ImportEventRow, ImportResult, Reminder, ReminderInput } from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
const NAV = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/imports', label: 'Bulk imports', icon: FileSpreadsheet },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const dayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, s => s.toUpperCase());
const freshDate = (offsetHours = 1) => {
  const d = new Date(Date.now() + offsetHours * 3600000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
};
const localInputDate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toIso = (v: string) => new Date(v).toISOString();
const statusClass = (value: string) => value === 'failed' || value === 'warning' ? 'bg-[#fbefeb] text-[#a84b3e]' : value === 'completed' || value === 'success' || value === 'delivered' ? 'bg-[#e8f3eb] text-[#367859]' : value === 'running' ? 'bg-[#eaf0f6] text-[#42627f]' : 'bg-[#f4f0e7] text-[#8c7040]';
const TIME_ZONE_FALLBACK = ['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','America/Toronto','America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Berlin','Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland'];
const TIME_ZONE_OPTIONS = (() => {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  return [...new Set(['UTC', ...(intl.supportedValuesOf?.('timeZone') ?? TIME_ZONE_FALLBACK)])].sort((a,b)=>a.localeCompare(b));
})();

function AppFrame() {
  const [path] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const session = useGetGoogleSession();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const logout = useLogoutGoogle();
  const qc = useQueryClient();
  const [notice, setNotice] = useState('');
  const onLogout = () => logout.mutate(undefined, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetGoogleSessionQueryKey() }); setNotice('Google account disconnected.'); } });
  if (session.isLoading) return <div className="min-h-[100dvh] bg-[#f6f4ed] p-6"><div className="mx-auto max-w-5xl animate-pulse space-y-5"><div className="h-8 w-44 rounded bg-[#e7e3d8]" /><div className="h-40 rounded-2xl bg-[#ece9df]" /><div className="grid gap-4 md:grid-cols-3"><div className="h-44 rounded-2xl bg-[#ece9df]" /><div className="h-44 rounded-2xl bg-[#ece9df]" /><div className="h-44 rounded-2xl bg-[#ece9df]" /></div></div></div>;
  if (session.isError) return <div className="min-h-[100dvh] flex items-center justify-center p-6"><div className="surface max-w-md p-8 text-center"><AlertCircle className="mx-auto mb-3 text-[#a84b3e]" /><h1 className="font-display text-2xl">Couldn’t check your connection</h1><p className="mt-2 text-sm text-[#6c7580]">We couldn’t reach your Google session. Try again in a moment.</p><button onClick={() => session.refetch()} className="mt-5 rounded-lg bg-[#315d4d] px-4 py-2 text-white" data-testid="button-retry-session">Try again</button></div></div>;
  if (!session.data?.connected) return <SignIn />;
  return <div className="app-shell flex">
    <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col px-4 py-6 transition-transform md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-9 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9ed1b1] text-[#203c34]"><CalendarCheck2 size={21} /></div>
        <div><div className="font-display text-[18px] font-bold tracking-tight text-[#f4f1e8]">Smart Calendar</div><div className="text-[10px] uppercase tracking-[.18em] text-[#9ba8a5]">calendar operations</div></div>
      </div>
      <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#82908e]">Workspace</div>
      <nav className="space-y-1" aria-label="Main navigation">
        {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileMenu(false)} className={`nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium ${path === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} />{label}{href === '/activity' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e69a79]" />}</Link>)}
      </nav>
      <div className="mt-auto">
        <div className="mx-1 mb-4 rounded-xl border border-white/10 bg-white/[.045] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#e1e8e3]"><ShieldCheck size={15} className="text-[#9ed1b1]" />Safe by default</div>
          <p className="text-[11px] leading-relaxed text-[#aab5b1]">Guest invitations are always reviewed before anything is sent.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          {session.data.avatarUrl ? <img src={session.data.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#435464] text-xs font-bold">{(session.data.displayName || session.data.email || 'G').slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#f1f1e9]">{session.data.displayName || 'Google account'}</div><div className="truncate text-[10px] text-[#aab5b1]">{session.data.email}</div></div>
          <button onClick={onLogout} disabled={logout.isPending} title="Disconnect Google" className="rounded-lg p-2 text-[#b9c2bd] hover:bg-white/10 hover:text-white" data-testid="button-disconnect-google"><LogOut size={15} /></button>
        </div>
      </div>
    </aside>
    {mobileMenu && <button aria-label="Close menu" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-30 bg-[#18232e]/35 md:hidden" />}
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e8e4da] bg-[#f6f4ed]/95 px-4 backdrop-blur md:px-9">
        <button className="mr-3 rounded-lg p-2 text-[#344353] md:hidden" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="hidden text-[11px] font-semibold uppercase tracking-[.16em] text-[#8b918e] md:block">Calendar control room <span className="mx-2 text-[#c2beb3]">/</span> <span className="text-[#465462]">{NAV.find(x => x.href === path)?.label || 'Overview'}</span></div>
        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${health.isError?'border-[#ead1c8] bg-[#fcf3ef] text-[#a24f42]':health.isLoading?'border-[#e7dfc9] bg-[#f8f3e5] text-[#8c7040]':'border-[#dce8de] bg-[#eef5ed] text-[#3b7458]'}`} data-testid="status-server-health" aria-live="polite"><span className={`h-1.5 w-1.5 rounded-full ${health.isError?'bg-[#c46c59]':health.isLoading?'bg-[#c2a35e]':'bg-[#4e9a70]'}`} />{health.isError?'Service unavailable':health.isLoading?'Checking service':`Service ${health.data?.status || 'status unknown'}`}</div>
          <div className="hidden items-center gap-2 rounded-full border border-[#dce8de] bg-[#eef5ed] px-3 py-1.5 text-[11px] font-semibold text-[#3b7458] sm:flex" data-testid="status-google-connected"><span className="h-1.5 w-1.5 rounded-full bg-[#4e9a70]" />Google connected</div>
        </div>
      </header>
      {health.isError && <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-[#ead1c8] bg-[#fcf3ef] px-4 py-3 text-sm text-[#8b5148] md:mx-9" role="status"><AlertCircle size={16}/>The calendar service could not be reached. Some actions may not complete.<button onClick={()=>health.refetch()} className="ml-auto font-semibold underline">Retry</button></div>}
      {notice && <div className="mx-4 mt-4 rounded-lg bg-[#e8f3eb] px-4 py-2 text-sm text-[#367859] md:mx-9">{notice}</div>}
      <div className="mx-auto max-w-[1440px] px-4 py-7 md:px-9 md:py-9">
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/events" component={EventsPage} />
          <Route path="/imports" component={ImportsPage} />
          <Route path="/reminders" component={RemindersPage} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-[10px] text-[#929791] md:px-9">Smart Calendar Automation <span className="px-1.5">·</span> Built for careful calendar operations</footer>
    </main>
  </div>;
}

function SignIn() {
  const authState = new URLSearchParams(window.location.search).get('auth');
  const authMessage = authState === 'unconfigured'
    ? 'Google sign-in is not configured yet. The app owner must add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Replit Tools → Secrets, then register this app’s /api/auth/google/callback URL in Google Cloud Console. These are server secrets—never enter them in this app.'
    : authState === 'cancelled'
      ? 'Google sign-in was cancelled. No account was connected.'
      : authState === 'failed'
        ? 'Google could not complete sign-in. Check the OAuth setup and try again.'
        : '';
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f6f4ed]">
    <div className="mx-auto grid min-h-[100dvh] max-w-[1440px] md:grid-cols-[1.05fr_.95fr]">
      <div className="flex flex-col px-6 py-7 md:px-14 md:py-10">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315d4d] text-[#ddf1df]"><CalendarCheck2 size={20} /></div><span className="font-display text-xl font-bold text-[#293648]">Smart Calendar</span></div>
        <div className="my-auto max-w-[560px] py-14">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-[.2em] text-[#50816a]">A steadier way to run your calendar</p>
          <h1 className="font-display text-[clamp(42px,6vw,72px)] font-semibold leading-[1.02] tracking-[-.045em] text-[#263547]">More time for<br /><span className="text-[#51856d]">the meeting.</span><br />Less time managing it.</h1>
          <p className="mt-6 max-w-md text-[16px] leading-7 text-[#67716f]">Create events, coordinate guests, and automate the follow-through — with a clear review before anything goes out.</p>
          <a href="/api/auth/google" className="mt-9 inline-flex items-center gap-3 rounded-xl bg-[#315d4d] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(49,93,77,.15)] transition hover:-translate-y-0.5 hover:bg-[#274d40] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8db99b]/50" data-testid="link-google-sign-in"><GoogleMark />Continue with Google <ArrowRight size={16} /></a>
           {authMessage && <div className="mt-4 rounded-lg border border-[#ead1c8] bg-[#fcf3ef] px-4 py-3 text-sm text-[#8b5148]" role="alert">{authMessage}</div>}
          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#7f8984]"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Google handles your sign-in and consent. App-owner OAuth credentials stay in Replit Secrets and are never entered or exposed here.</span></div>
        </div>
        <div className="text-[11px] text-[#929791]">Your Google password stays with Google. Always.</div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-[#29394a] p-10 md:flex">
        <div className="absolute -right-20 -top-16 h-[470px] w-[470px] rounded-full border border-[#91b8a2]/20" /><div className="absolute -right-2 top-0 h-[310px] w-[310px] rounded-full border border-[#91b8a2]/20" />
        <div className="relative w-full max-w-[500px] rounded-[24px] border border-white/10 bg-[#f8f6ed] p-7 shadow-[0_30px_90px_rgba(7,17,27,.3)]">
          <div className="flex items-center justify-between"><div><div className="text-xs font-semibold text-[#315d4d]">TODAY, AT A GLANCE</div><div className="mt-1 font-display text-2xl text-[#293648]">A day in good order</div></div><div className="rounded-xl bg-[#e8f3eb] p-3 text-[#438668]"><CalendarDays size={21} /></div></div>
          <div className="mt-7 space-y-3">
            {[
              ['01', 'Plan the event', 'Set the calendar, time zone and repeat rules.'],
              ['02', 'Review the people', 'Check every guest before invitations go out.'],
              ['03', 'Automate with care', 'Choose exactly when and how reminders arrive.'],
            ].map(([step,title,caption])=><div key={step} className="flex gap-4 rounded-xl border border-[#e8e4da] bg-white/70 p-4"><div className="font-mono-ui pt-0.5 text-[11px] text-[#678875]">{step}</div><div className="mt-1 h-9 w-[3px] rounded-full bg-[#80b99a]" /><div><div className="text-sm font-semibold text-[#354354]">{title}</div><div className="mt-1 text-xs text-[#89918d]">{caption}</div></div><CheckCircle2 className="ml-auto mt-1 text-[#7bad8d]" size={16} /></div>)}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#eef4eb] px-4 py-3 text-xs text-[#52715d]"><ShieldCheck size={15} /> Nothing is sent until you explicitly confirm.</div>
        </div>
        <div className="absolute bottom-7 left-8 text-[10px] uppercase tracking-[.18em] text-[#9eb2b0]">Calm control, from first invite to final reminder</div>
      </div>
    </div>
  </div>;
}

function GoogleMark() { return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 32 15.1l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5Z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 32 15l5.7-5.7A20 20 0 0 0 6.3 14.7Z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.3A12 12 0 0 1 12.8 29l-6.5 5A20 20 0 0 0 24 44Z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.4l6.2 5.3C36.9 40.5 44 35 44 24c0-1.2-.1-2.4-.4-3.5Z" /></svg>; }

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#638875]">{eyebrow}</div><h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-.035em] text-[#293648] md:text-[40px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#707a78]">{subtitle}</p></div>{action}</div>;
}
function QueryError({ retry }: { retry: () => void }) { return <div className="surface flex items-center gap-3 p-5 text-sm text-[#8b5148]"><AlertCircle size={17} />This view couldn’t load right now.<button onClick={retry} className="ml-auto font-semibold underline" data-testid="button-retry-load">Retry</button></div>; }
function Empty({ icon: Icon, title, note, action }: { icon: typeof CalendarDays; title: string; note: string; action?: ReactNode }) { return <div className="surface flex flex-col items-center px-6 py-14 text-center"><div className="mb-4 rounded-2xl bg-[#eef3e9] p-4 text-[#55846e]"><Icon size={25} /></div><h3 className="font-display text-xl font-semibold text-[#354354]">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#77807c]">{note}</p>{action && <div className="mt-5">{action}</div>}</div>; }
function Button({ children, onClick, kind = 'primary', disabled, testId, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; testId?: string; type?: 'button' | 'submit'; className?: string }) {
  const colors = { primary: 'bg-[#315d4d] text-white hover:bg-[#274c40]', secondary: 'border border-[#d9ded5] bg-[#fffefa] text-[#344353] hover:bg-[#f3f4ec]', quiet: 'text-[#62706d] hover:bg-[#eeeee7]', danger: 'bg-[#a84b3e] text-white hover:bg-[#913d33]' };
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${colors[kind]} ${className}`}>{children}</button>;
}
function LoadingRows() { return <div className="surface animate-pulse space-y-4 p-6"><div className="h-5 w-40 rounded bg-[#e9e5db]" />{[1,2,3].map(i=><div key={i} className="h-14 rounded-lg bg-[#f0eee6]" />)}</div>; }

function DashboardPage() {
  const dash = useGetDashboard();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState<CalendarEvent | null | false>(false);
  const [calendarsQuery] = useState(true);
  const calendars = useListCalendars({ query: { enabled: calendarsQuery, queryKey: getListCalendarsQueryKey() } });
  if (dash.isLoading) return <><PageTitle eyebrow="Your day, in hand" title="Overview" subtitle="Your calendar operations, with the important bits up front." /><div className="grid gap-4 lg:grid-cols-3"><div className="h-36 animate-pulse rounded-2xl bg-[#e9e5db]" /><div className="h-36 animate-pulse rounded-2xl bg-[#e9e5db]" /><div className="h-36 animate-pulse rounded-2xl bg-[#e9e5db]" /></div><div className="mt-5"><LoadingRows /></div></>;
  if (dash.isError || !dash.data) return <><PageTitle eyebrow="Your day, in hand" title="Overview" subtitle="Your calendar operations, with the important bits up front." /><QueryError retry={() => dash.refetch()} /></>;
  const { upcomingEvents = [], scheduledReminders = [], recentActivity = [] } = dash.data;
  return <div className="fade-in">
    <PageTitle eyebrow="Your day, in hand" title="Overview" subtitle={`${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})} · Everything important, quietly in view.`} action={<Button onClick={() => setEditing(null)} testId="button-new-event"><Plus size={16} />New event</Button>} />
    <section className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
      <div className="relative overflow-hidden rounded-[20px] bg-[#314355] p-6 text-[#f7f5ed] md:p-8">
        <div className="absolute -right-8 -top-14 h-64 w-64 rounded-full border border-[#a9c8b5]/20" /><div className="absolute right-8 top-8 h-40 w-40 rounded-full border border-[#a9c8b5]/15" />
        <div className="relative flex items-start justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a8c6b3]">A clear view ahead</span><h2 className="mt-3 max-w-lg font-display text-[30px] font-semibold leading-tight md:text-[38px]">Your calendar is<br />in good hands.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-[#c4cecb]">Automation is on track. Review the day ahead or make a new plan.</p><Button kind="secondary" onClick={() => navigate('/events')} testId="button-view-events"><span>View events</span><ArrowRight size={15} /></Button></div><div className="hidden rounded-2xl bg-white/10 p-4 text-[#b6d5c1] sm:block"><CalendarCheck2 size={28} /></div></div>
        <div className="relative mt-7 grid grid-cols-3 gap-3 border-t border-white/15 pt-5">
          <div><div className="font-mono-ui text-[23px] text-white">{dash.data.upcomingCount}</div><div className="mt-1 text-[10px] uppercase tracking-[.13em] text-[#b7c3bf]">Upcoming events</div></div>
          <div><div className="font-mono-ui text-[23px] text-white">{dash.data.reminderCount}</div><div className="mt-1 text-[10px] uppercase tracking-[.13em] text-[#b7c3bf]">Reminders queued</div></div>
          <div><div className="font-mono-ui text-[23px] text-white">{dash.data.failedJobCount}</div><div className="mt-1 text-[10px] uppercase tracking-[.13em] text-[#b7c3bf]">Needs attention</div></div>
        </div>
      </div>
      <div className="surface p-5 md:p-6">
        <div className="flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#668977]">System pulse</div><h2 className="mt-1 font-display text-xl font-semibold">Quietly working</h2></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3eb] text-[#438668]"><Activity size={20} /></span></div>
        <div className="mt-5 space-y-4">
          {[['Google Calendar', 'Connected and syncing', true],['Event automations', `${dash.data.upcomingCount} events in view`, true],['Background jobs', dash.data.failedJobCount ? `${dash.data.failedJobCount} need a look` : 'No failed jobs', !dash.data.failedJobCount]].map(([title,detail,ok])=><div key={String(title)} className="flex items-center gap-3 border-b border-[#eeeae1] pb-3 last:border-0 last:pb-0"><span className={`h-2 w-2 rounded-full ${ok?'bg-[#63a17b]':'bg-[#d17b62]'}`} /><div className="flex-1"><div className="text-[13px] font-semibold text-[#394858]">{title}</div><div className="mt-0.5 text-xs text-[#838b87]">{detail}</div></div><Check size={15} className={ok?'text-[#63a17b]':'text-[#c3735d'} /></div>)}
        </div>
        {dash.data.failedJobCount > 0 && <Link href="/activity" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#a84b3e]">Review failed jobs <ArrowRight size={13} /></Link>}
      </div>
    </section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#ece8df] px-5 py-4"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Coming up</div><h2 className="mt-1 font-display text-xl font-semibold">Next on your calendar</h2></div><Link href="/events" className="text-xs font-semibold text-[#4c785f]">All events <ArrowRight className="ml-1 inline" size={13} /></Link></div>
        {upcomingEvents.length === 0 ? <div className="p-5"><Empty icon={CalendarDays} title="Room for something good" note="There are no upcoming events in view. Start by creating one." action={<Button onClick={() => setEditing(null)}><Plus size={15} />Create an event</Button>} /></div> : <div className="divide-y divide-[#f0ede5]">{upcomingEvents.slice(0,5).map(e=><EventRow key={e.id} event={e} onEdit={() => setEditing(e)} compact />)}</div>}
      </section>
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#ece8df] px-5 py-4"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Recent signals</div><h2 className="mt-1 font-display text-xl font-semibold">Activity</h2></div><Link href="/activity" className="text-xs font-semibold text-[#4c785f]">See all <ArrowRight className="ml-1 inline" size={13} /></Link></div>
        {recentActivity.length === 0 ? <div className="p-5 text-sm text-[#7c8581]">New activity will appear here as your calendar automation runs.</div> : <div className="divide-y divide-[#f0ede5]">{recentActivity.slice(0,5).map(a=><ActivityRow key={a.id} item={a} />)}</div>}
      </section>
    </div>
    {editing !== false && <EventModal event={editing || undefined} calendars={calendars.data || []} onClose={() => setEditing(false)} />}
  </div>;
}

function EventRow({ event, onEdit, compact = false, onPause, onDelete }: { event: CalendarEvent; onEdit?: () => void; compact?: boolean; onPause?: () => void; onDelete?: () => void }) {
  return <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center ${compact ? '' : ''}`} data-testid={`row-event-${event.id}`}>
    <div className="flex w-[70px] shrink-0 flex-row items-center gap-2 sm:block sm:text-center"><div className="font-mono-ui text-[11px] font-medium text-[#648372]">{dayDate(event.startAt)}</div><div className="text-xs text-[#8a918c]">{new Date(event.startAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</div></div>
    <div className="hidden h-10 w-[3px] rounded-full bg-[#8db99b] sm:block" />
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[14px] font-semibold text-[#354354]">{event.title}</h3>{event.automationPaused && <span className="status-pill bg-[#f4f0e7] text-[#8c7040]">Paused</span>}</div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#828b86]"><span>{dateTime(event.startAt).split('·')[1]?.trim() || dateTime(event.startAt)}</span><span>{event.guestEmails?.length || 0} guests</span>{event.meetUrl && <a href={event.meetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#47775f]"><Video size={12} /> Meet</a>}</div></div>
    {!compact && <div className="flex items-center gap-1 self-end sm:self-auto">{onPause && <button onClick={onPause} className="rounded-lg p-2 text-[#74807a] hover:bg-[#f2f0e8]" title={event.automationPaused?'Resume automation':'Pause automation'} data-testid={`button-pause-event-${event.id}`}>{event.automationPaused?<Play size={15}/>:<Pause size={15}/>}</button>}{onEdit && <button onClick={onEdit} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#527a63] hover:bg-[#eef3e9]" data-testid={`button-edit-event-${event.id}`}>Edit</button>}{onDelete && <button onClick={onDelete} className="rounded-lg p-2 text-[#a84b3e] hover:bg-[#fbefeb]" title="Cancel event" data-testid={`button-cancel-event-${event.id}`}><X size={16}/></button>}</div>}
    {compact && onEdit && <button onClick={onEdit} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#527a63] hover:bg-[#eef3e9]" data-testid={`button-open-event-${event.id}`}>Details</button>}
  </div>;
}

function EventsPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CalendarEvent | null | false>(false);
  const params = useMemo(() => search.trim() ? { search: search.trim() } : {}, [search]);
  const events = useListEvents(params);
  const calendars = useListCalendars();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const qc = useQueryClient();
  const [actionError,setActionError]=useState('');
  const refresh = () => { qc.invalidateQueries({queryKey:getListEventsQueryKey()}); qc.invalidateQueries({queryKey:getListRemindersQueryKey()}); qc.invalidateQueries({queryKey:getListJobsQueryKey()}); qc.invalidateQueries({queryKey:getGetDashboardQueryKey()}); qc.invalidateQueries({queryKey:getListActivityQueryKey()}); setActionError(''); };
  return <div className="fade-in"><PageTitle eyebrow="Plan & automate" title="Events" subtitle="Find upcoming events, adjust the details, and control automation without losing sight of guest impact." action={<Button onClick={() => setEditing(null)} testId="button-create-event"><Plus size={16} />Create event</Button>} />
    <div className="surface mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a938f]" size={16}/><input className="field pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by event title" data-testid="input-search-events" /></div><div className="flex items-center gap-2 text-xs text-[#7d8782]"><Filter size={14}/>{events.data?.length ?? '—'} events in view</div></div>
     {events.isLoading ? <LoadingRows/> : events.isError ? <QueryError retry={()=>events.refetch()}/> : !events.data?.length ? <Empty icon={CalendarDays} title={search?'No matching events':'Your calendar is clear'} note={search?'Try a different event title or clear your search.':'Create a calendar event and decide exactly when guest invitations should go out.'} action={!search?<Button onClick={()=>setEditing(null)}><Plus size={15}/>Create event</Button>:undefined}/> : <div className="surface overflow-hidden divide-y divide-[#eeeae1]">{events.data.map(ev=><EventRow key={ev.id} event={ev} onEdit={()=>setEditing(ev)} onPause={()=>update.mutate({eventId:ev.id,data:{automationPaused:!ev.automationPaused}},{onSuccess:refresh,onError:()=>setActionError('Could not change automation for this event. Try again.')})} onDelete={()=>{if(window.confirm(`Cancel “${ev.title}”? This removes the event from your calendar.`)) remove.mutate({eventId:ev.id},{onSuccess:refresh,onError:()=>setActionError('Could not cancel this event. It is still on your calendar.')});}} />)}</div>}
     {actionError&&<div className="mt-3 rounded-lg bg-[#fbefeb] px-4 py-3 text-sm text-[#a84b3e]" role="alert">{actionError}</div>}
     {(update.isPending||remove.isPending)&&<div className="mt-3 flex items-center gap-2 text-xs text-[#697771]"><LoaderCircle className="animate-spin" size={14}/>Saving your change…</div>}
    {editing!==false&&<EventModal event={editing||undefined} calendars={calendars.data||[]} onClose={()=>setEditing(false)} />}
  </div>;
}

function EventModal({ event, calendars, onClose }: { event?: CalendarEvent; calendars: Calendar[]; onClose: () => void }) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const qc = useQueryClient();
  const detailedEvent = useGetEvent(event?.id || '', { query: { enabled: !!event?.id, queryKey: getGetEventQueryKey(event?.id || '') } });
  const [review, setReview] = useState(false);
  const [title, setTitle] = useState(event?.title || '');
  const [start, setStart] = useState(event ? localInputDate(new Date(event.startAt)) : localInputDate(freshDate(1)));
  const [end, setEnd] = useState(event ? localInputDate(new Date(event.endAt)) : localInputDate(freshDate(2)));
  const [guests, setGuests] = useState(event?.guestEmails?.join(', ') || '');
  const [description, setDescription] = useState(event?.description || '');
  const [calendarId, setCalendarId] = useState(event?.calendarId || calendars.find(c=>c.primary)?.id || calendars[0]?.id || '');
  const [repeat, setRepeat] = useState<EventInput['repeat']>(event?.repeat || 'none');
  const [createMeet, setCreateMeet] = useState(!!event?.meetUrl);
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [timeZone, setTimeZone] = useState(event?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [reminders, setRemindersState] = useState<ReminderInput[]>(event ? [] : [{ enabled:true, amount:15, unit:ReminderInputUnit.minutes, localTime:'09:00', method:ReminderInputMethod.email }]);
  const [remindersDirty, setRemindersDirty] = useState(false);
  const setReminders = (next: Parameters<typeof setRemindersState>[0]) => { setRemindersDirty(true); setRemindersState(next); };
  const [error, setError] = useState('');
  const mutationPending = create.isPending || update.isPending;
  const emails = guests.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean);
  const submit = () => {
    if (!title.trim() || !start || !end || new Date(end) <= new Date(start)) { setError('Add a title and a valid end time after the start.'); return; }
    if (emails.some(x=>!/^.+@.+\..+$/.test(x))) { setError('Check the guest email addresses. Separate multiple addresses with commas.'); return; }
    if (emails.length && !review) { setReview(true); return; }
    if (!calendarId) { setError('Choose a calendar before saving.'); return; }
    setError('');
    const payload: EventInput = { title:title.trim(), startAt:toIso(start), endAt:toIso(end), allDay, timeZone, description, guestEmails:emails, calendarId, repeat, createMeet, reminders };
    const done = () => { qc.invalidateQueries({queryKey:getListEventsQueryKey()}); qc.invalidateQueries({queryKey:getListRemindersQueryKey()}); qc.invalidateQueries({queryKey:getListJobsQueryKey()}); qc.invalidateQueries({queryKey:getGetDashboardQueryKey()}); qc.invalidateQueries({queryKey:getListActivityQueryKey()}); if(event) qc.invalidateQueries({queryKey:getGetEventQueryKey(event.id)}); onClose(); };
    if(event) { const updatePayload: EventUpdate = {...payload, reminders:remindersDirty?reminders:undefined}; update.mutate({eventId:event.id,data:updatePayload},{onSuccess:done,onError:()=>setError('Could not save this event. Please try again.')}); }
    else create.mutate({data:payload},{onSuccess:done,onError:()=>setError('Could not create this event. Please try again.')});
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#1e2a36]/45 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
    <div className="my-auto w-full max-w-[660px] rounded-[20px] border border-[#e6e2d8] bg-[#fffefa] shadow-[0_24px_70px_rgba(27,40,52,.22)]">
      <div className="flex items-start justify-between border-b border-[#eeeae1] px-5 py-4 md:px-7"><div><div className="text-[10px] font-bold uppercase tracking-[.17em] text-[#628471]">{event?'Edit event':'New event'}</div><h2 id="event-dialog-title" className="mt-1 font-display text-2xl font-semibold">{review?'Review invitations':event?'Event details':'Make a plan'}</h2></div><button onClick={onClose} className="rounded-lg p-2 text-[#75807b] hover:bg-[#f2f0e8]" aria-label="Close"><X size={18}/></button></div>
      {review ? <div className="p-5 md:p-7"><div className="rounded-xl border border-[#e1e8dc] bg-[#f1f5ec] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#4d8367]" size={19}/><div><div className="font-semibold text-[#3c5948]">Before we send anything</div><p className="mt-1 text-sm leading-6 text-[#6c7b70]">You’re about to invite {emails.length} {emails.length===1?'guest':'guests'} to <strong>{title}</strong>. This will create or update the event and notify the listed addresses.</p></div></div><div className="mt-3 flex flex-wrap gap-2">{emails.map(email=><span key={email} className="rounded-full bg-white px-3 py-1 text-xs text-[#52685a]">{email}</span>)}</div></div><div className="mt-5 flex justify-between"><Button kind="secondary" onClick={()=>setReview(false)}>Back to details</Button><Button onClick={submit} disabled={mutationPending} testId="button-confirm-invitations">{mutationPending?<LoaderCircle className="animate-spin" size={16}/>:<Check size={16}/>}Confirm and {event?'update':'send invites'}</Button></div></div> : <form onSubmit={e=>{e.preventDefault();submit();}} className="max-h-[75dvh] overflow-y-auto px-5 py-5 md:px-7">
        <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-xs font-semibold text-[#56615d]">Event title<input className="field mt-1.5" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Quarterly planning" autoFocus data-testid="input-event-title"/></label>
          <label className="text-xs font-semibold text-[#56615d]">Starts<input className="field mt-1.5" type={allDay?'date':'datetime-local'} value={allDay?start.slice(0,10):start} onChange={e=>setStart(e.target.value)} data-testid="input-event-start"/></label><label className="text-xs font-semibold text-[#56615d]">Ends<input className="field mt-1.5" type={allDay?'date':'datetime-local'} value={allDay?end.slice(0,10):end} onChange={e=>setEnd(e.target.value)} data-testid="input-event-end"/></label>
          <label className="sm:col-span-2 text-xs font-semibold text-[#56615d]">Calendar<select className="field mt-1.5" value={calendarId} onChange={e=>setCalendarId(e.target.value)} data-testid="select-event-calendar"><option value="">Choose a calendar</option>{calendars.map(c=><option key={c.id} value={c.id}>{c.name}{c.primary?' · primary':''}</option>)}</select></label>
          <label className="sm:col-span-2 text-xs font-semibold text-[#56615d]"><span className="inline-flex items-center gap-1"><Globe2 size={13}/>Event time zone</span><input className="field mt-1.5" list="event-timezone-options" value={timeZone} onChange={e=>setTimeZone(e.target.value)} placeholder="Choose or type an IANA time zone" required data-testid="input-event-timezone"/><datalist id="event-timezone-options">{TIME_ZONE_OPTIONS.map(zone=><option key={zone} value={zone}/>)}</datalist></label>
          <label className="sm:col-span-2 text-xs font-semibold text-[#56615d]">Guest emails <span className="font-normal text-[#89918c]">· Separate with commas</span><textarea className="field mt-1.5 min-h-[68px] resize-y" value={guests} onChange={e=>setGuests(e.target.value)} placeholder="name@example.com, teammate@example.com" data-testid="input-event-guests"/></label>
          <label className="sm:col-span-2 text-xs font-semibold text-[#56615d]">Description<textarea className="field mt-1.5 min-h-[72px] resize-y" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add context for attendees" data-testid="input-event-description"/></label>
          <label className="text-xs font-semibold text-[#56615d]">Repeat<select className="field mt-1.5" value={repeat} onChange={e=>setRepeat(e.target.value as EventInput['repeat'])} data-testid="select-event-repeat"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          <div className="flex flex-col justify-center gap-2 pt-4"><label className="flex items-center gap-2 text-xs text-[#56615d]"><input type="checkbox" checked={createMeet} onChange={e=>setCreateMeet(e.target.checked)} className="accent-[#438668]" data-testid="checkbox-event-meet"/>Create a Google Meet link</label><label className="flex items-center gap-2 text-xs text-[#56615d]"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)} className="accent-[#438668]" data-testid="checkbox-event-allday"/>All-day event</label></div>
        </div>
        <section className="mt-5 rounded-xl border border-[#e8e4da] p-4" aria-labelledby="reminder-options-title">
          <div className="mb-3 flex items-center justify-between"><div><h3 id="reminder-options-title" className="text-sm font-semibold text-[#45534d]">Reminder schedule</h3><p className="mt-1 text-[11px] text-[#858d87]">{event?'Existing scheduled reminders are preserved.':'Choose each lead time and delivery method.'}</p></div><button type="button" onClick={()=>setReminders(items=>[...items,{enabled:true,amount:15,unit:ReminderInputUnit.minutes,localTime:'09:00',method:ReminderInputMethod.email}])} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#4b785f] hover:bg-[#eef3e9]" data-testid="button-add-reminder"><Plus size={14}/>Add</button></div>
        {reminders.length===0?<div className="rounded-lg bg-[#f6f5ef] px-3 py-2 text-xs text-[#818a84]">No new reminders configured.</div>:<div className="space-y-2">{reminders.map((reminder,index)=><div key={`reminder-${index}`} className="grid grid-cols-2 gap-2 rounded-lg bg-[#f6f5ef] p-2 sm:grid-cols-[.6fr_1fr_1fr_1fr_auto] sm:items-center"><label className="col-span-2 text-[10px] font-semibold text-[#69746e] sm:col-span-1"><span className="sr-only">Lead amount</span><input aria-label="Reminder lead amount" className="field py-2" type="number" min="0" value={reminder.amount} onChange={e=>setReminders(items=>items.map((item,i)=>i===index?{...item,amount:Number(e.target.value)}:item))} data-testid={`input-reminder-amount-${index}`}/></label><select aria-label="Lead time unit" className="field py-2 text-xs" value={reminder.unit} onChange={e=>setReminders(items=>items.map((item,i)=>i===index?{...item,unit:e.target.value as ReminderInput['unit']}:item))} data-testid={`select-reminder-unit-${index}`}>{Object.values(ReminderInputUnit).map(unit=><option key={unit} value={unit}>{unit} before</option>)}</select><label className="relative"><Clock3 size={13} className="pointer-events-none absolute left-2 top-2.5 text-[#78847d]"/><input aria-label="Reminder local time" className="field py-2 pl-7" type="time" value={reminder.localTime} onChange={e=>setReminders(items=>items.map((item,i)=>i===index?{...item,localTime:e.target.value}:item))} data-testid={`input-reminder-time-${index}`}/></label><select aria-label="Reminder delivery method" className="field py-2 text-xs" value={reminder.method} onChange={e=>setReminders(items=>items.map((item,i)=>i===index?{...item,method:e.target.value as ReminderInput['method']}:item))} data-testid={`select-reminder-method-${index}`}>{Object.values(ReminderInputMethod).map(method=><option key={method} value={method}>{pretty(method)}</option>)}</select><button type="button" onClick={()=>setReminders(items=>items.filter((_,i)=>i!==index))} aria-label="Remove reminder" className="col-span-2 justify-self-end rounded-lg p-2 text-[#a15b4c] hover:bg-[#f8e9e4] sm:col-span-1" data-testid={`button-remove-reminder-${index}`}><Trash2 size={14}/></button><label className="col-span-2 flex items-center gap-2 px-1 pb-1 text-[10px] text-[#66726b] sm:col-span-5"><input type="checkbox" checked={reminder.enabled} onChange={e=>setReminders(items=>items.map((item,i)=>i===index?{...item,enabled:e.target.checked}:item))} className="accent-[#438668]" data-testid={`checkbox-reminder-enabled-${index}`}/>Reminder enabled</label></div>)}</div>}
        </section>
        {(detailedEvent.data?.meetUrl||event?.meetUrl)&&<a className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#4e7d63]" href={detailedEvent.data?.meetUrl||event?.meetUrl||undefined} target="_blank" rel="noreferrer"><Video size={14}/>Open existing Meet link</a>}
        {error&&<div className="mt-4 rounded-lg bg-[#fbefeb] px-3 py-2 text-xs text-[#a84b3e]" role="alert">{error}</div>}
        <div className="mt-5 rounded-xl bg-[#f4f3eb] p-3 text-xs leading-5 text-[#6d7872]"><ShieldCheck className="mr-1 inline text-[#4e8065]" size={14}/> {emails.length ? 'A separate review step is required before guests are invited.' : 'No guests added. This event will be created without sending invitations.'}</div>
        <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row"><Button kind="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutationPending} testId="button-save-event">{mutationPending?<LoaderCircle size={15} className="animate-spin"/>:<Check size={15}/>} {emails.length?'Review guest invitations':event?'Save changes':'Create event'}</Button></div>
      </form>}
    </div>
  </div>;
}

function RemindersPage() {
  const q=useListReminders(); const update=useUpdateReminder(); const qc=useQueryClient();
  const toggle=(r:Reminder)=>update.mutate({reminderId:r.id,data:{enabled:!r.enabled}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListRemindersQueryKey()});qc.invalidateQueries({queryKey:getListJobsQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});}});
  return <div className="fade-in"><PageTitle eyebrow="Never miss the moment" title="Reminders" subtitle="See what’s scheduled and pause or resume individual reminders. Times are shown in your browser’s local time." />
    <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_1fr]"><div className="surface flex items-center gap-4 p-5"><div className="rounded-xl bg-[#edf2e8] p-3 text-[#4f8669]"><Bell size={20}/></div><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#7d8e80]">Scheduled</div><div className="mt-1 font-mono-ui text-2xl">{q.data?.filter(r=>r.enabled&&r.status==='scheduled').length ?? '—'}</div></div></div><div className="surface flex items-center gap-4 p-5"><div className="rounded-xl bg-[#f8efea] p-3 text-[#b16a55]"><AlertCircle size={20}/></div><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#927f73]">Needs attention</div><div className="mt-1 font-mono-ui text-2xl">{q.data?.filter(r=>r.status==='failed').length ?? '—'}</div></div></div></div>
    {q.isLoading?<LoadingRows/>:q.isError?<QueryError retry={()=>q.refetch()}/>:!q.data?.length?<Empty icon={Bell} title="No reminders yet" note="Reminders attached to calendar events will show here. You can manage them individually once scheduled."/>:<div className="surface overflow-hidden"><div className="hidden grid-cols-[1.4fr_1fr_1fr_.8fr] gap-4 border-b border-[#ece8df] px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#89918a] sm:grid"><span>Event</span><span>Scheduled for</span><span>Delivery</span><span className="text-right">State</span></div>{q.data.map(r=><div key={r.id} className="grid gap-3 border-b border-[#f0ede5] px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_.8fr] sm:items-center" data-testid={`row-reminder-${r.id}`}><div><div className="text-sm font-semibold text-[#354354]">{r.eventTitle}</div><div className="mt-1 text-[11px] text-[#88908b]">Event on {dayDate(r.scheduledAt)}</div></div><div><div className="text-sm text-[#4c5a64]">{dateTime(r.scheduledAt)}</div><div className="mt-1 text-[10px] text-[#8a918c]">Scheduled time</div></div><div className="text-sm text-[#65716c]">{pretty(r.method)}{r.attempts>0&&<span className="ml-2 text-[10px] text-[#949b95]">· {r.attempts} attempts</span>}</div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`status-pill ${statusClass(r.status)}`}>{pretty(r.status)}</span><button onClick={()=>toggle(r)} disabled={update.isPending} className={`relative h-6 w-11 rounded-full transition ${r.enabled?'bg-[#4d8a6c]':'bg-[#c9cec7]'}`} aria-label={`${r.enabled?'Pause':'Resume'} reminder`} data-testid={`toggle-reminder-${r.id}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${r.enabled?'left-6':'left-1'}`} /></button></div>{r.lastError&&<div className="rounded-lg bg-[#fbefeb] px-3 py-2 text-xs text-[#99564a] sm:col-span-4">{r.lastError}</div>}</div>)}</div>}
  </div>;
}

function ActivityRow({item}:{item:{id:string;kind:string;message:string;createdAt:string;status:string}}) {
  const Icon=item.status==='failed'?AlertCircle:item.status==='warning'?CircleHelp:CheckCircle2;
  return <div className="flex items-start gap-3 px-5 py-4" data-testid={`row-activity-${item.id}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.status==='failed'?'bg-[#fbefeb] text-[#a84b3e]':'bg-[#edf3e9] text-[#4d8063]'}`}><Icon size={15}/></span><div className="min-w-0 flex-1"><div className="text-[13px] leading-5 text-[#394858]">{item.message}</div><div className="mt-1 text-[10px] text-[#909791]">{pretty(item.kind)} · {dateTime(item.createdAt)}</div></div><span className={`status-pill ${statusClass(item.status)}`}>{pretty(item.status)}</span></div>;
}
function ActivityPage() {
  const activity=useListActivity(); const jobs=useListJobs(); const retry=useRetryJob(); const qc=useQueryClient();
  const retryJob=(id:string)=>retry.mutate({jobId:id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListJobsQueryKey()});qc.invalidateQueries({queryKey:getListActivityQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});}});
  const failed=jobs.data?.filter(j=>j.status==='failed')||[];
  return <div className="fade-in"><PageTitle eyebrow="A full audit trail" title="Activity" subtitle="See what ran, what changed, and what needs another attempt. Failed jobs stay visible until resolved." />
    {failed.length>0&&<section className="mb-6 rounded-[17px] border border-[#ead1c8] bg-[#fcf3ef] p-5"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#a24f42]"><AlertCircle size={14}/>Needs attention · {failed.length}</div><div className="space-y-2">{failed.map(job=><div key={job.id} className="flex flex-col gap-3 rounded-xl border border-[#ecd9d1] bg-[#fffaf7] p-4 sm:flex-row sm:items-center" data-testid={`row-failed-job-${job.id}`}><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#55423d]">{pretty(job.kind)}{job.eventId?` · event ${job.eventId}`:''}</div><div className="mt-1 text-xs text-[#9c756b]">{job.error||'This job did not complete.'} · {dateTime(job.createdAt)} · {job.attempts} attempts</div></div><Button kind="secondary" disabled={retry.isPending} onClick={()=>retryJob(job.id)} testId={`button-retry-job-${job.id}`}><RefreshCw size={14}/>Retry job</Button></div>)}</div></section>}
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
      <section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Recent changes</div><h2 className="mt-1 font-display text-xl font-semibold">Activity log</h2></div>{activity.isLoading?<div className="p-5"><LoadingRows/></div>:activity.isError?<div className="p-5"><QueryError retry={()=>activity.refetch()}/></div>:!activity.data?.length?<div className="p-5"><Empty icon={Activity} title="Nothing to report yet" note="Calendar updates, reminders, and automation outcomes will appear here."/></div>:<div className="divide-y divide-[#f0ede5]">{activity.data.map(a=><ActivityRow key={a.id} item={a}/>)}</div>}</section>
      <section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Background work</div><h2 className="mt-1 font-display text-xl font-semibold">Automation jobs</h2></div>{jobs.isLoading?<div className="p-5"><LoadingRows/></div>:jobs.isError?<div className="p-5"><QueryError retry={()=>jobs.refetch()}/></div>:!jobs.data?.length?<div className="p-5 text-sm text-[#7c8581]">No background jobs have been recorded.</div>:<div className="divide-y divide-[#f0ede5]">{jobs.data.map(j=><div key={j.id} className="flex items-center gap-3 px-5 py-4" data-testid={`row-job-${j.id}`}><span className={`status-pill ${statusClass(j.status)}`}>{pretty(j.status)}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#3b4854]">{pretty(j.kind)}</div><div className="mt-1 text-[10px] text-[#8c948f]">{dateTime(j.createdAt)} · {j.attempts} attempts</div>{j.error&&<div className="mt-1 truncate text-xs text-[#a75548]">{j.error}</div>}</div>{j.status==='failed'&&<button onClick={()=>retryJob(j.id)} disabled={retry.isPending} className="rounded-lg p-2 text-[#537d63] hover:bg-[#edf3e9]" title="Retry job" data-testid={`button-retry-inline-${j.id}`}><RefreshCw size={15}/></button>}</div>)}</div>}</section>
    </div>
  </div>;
}

type CsvData = { headers:string[]; rows:string[][] };
function parseCsv(text:string):CsvData {
  const lines:string[][]=[]; let row:string[]=[]; let field=''; let quoted=false;
  const input=text.replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if((c===','||c==='\t')&&!quoted){row.push(field.trim());field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))lines.push(row);row=[];field='';}else field+=c;}
  row.push(field.trim());if(row.some(Boolean))lines.push(row);
  return {headers:lines[0]||[],rows:lines.slice(1)};
}
async function parseXlsx(file:File):Promise<CsvData> {
  const bytes=new Uint8Array(await file.arrayBuffer());
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let p=Math.max(0,bytes.length-65558);p<=bytes.length-22;p++)if(view.getUint32(p,true)===0x06054b50)end=p;
  if(end<0)throw new Error('Workbook archive not found');
  const count=view.getUint16(end+10,true),directoryOffset=view.getUint32(end+16,true);
  const entries=new Map<string,Uint8Array>();let cursor=directoryOffset;
  for(let i=0;i<count&&cursor+46<bytes.length;i++){
    if(view.getUint32(cursor,true)!==0x02014b50)break;
    const method=view.getUint16(cursor+10,true),compressedSize=view.getUint32(cursor+20,true);
    const nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true);
    const localOffset=view.getUint32(cursor+42,true);
    const name=new TextDecoder().decode(bytes.slice(cursor+46,cursor+46+nameLength));
    const localNameLength=view.getUint16(localOffset+26,true),localExtraLength=view.getUint16(localOffset+28,true);
    const contentStart=localOffset+30+localNameLength+localExtraLength;
    const compressed=bytes.slice(contentStart,contentStart+compressedSize);
    if(method===0)entries.set(name,compressed);
    else if(method===8){const stream=new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));entries.set(name,new Uint8Array(await new Response(stream).arrayBuffer()));}
    cursor+=46+nameLength+extraLength+commentLength;
  }
  const sheetKey=[...entries.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const sheet=entries.get(sheetKey||'');
  if(!sheet)throw new Error('No worksheet found');
  const sharedXml=entries.get('xl/sharedStrings.xml');
  const shared=sharedXml?Array.from(new DOMParser().parseFromString(new TextDecoder().decode(sharedXml),'application/xml').getElementsByTagName('si')).map(si=>Array.from(si.getElementsByTagName('t')).map(t=>t.textContent||'').join('')):[];
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(sheet),'application/xml');
  const matrix=Array.from(doc.getElementsByTagName('row')).map(row=>{
    const cells:string[]=[];
    for(const cell of Array.from(row.getElementsByTagName('c'))){
      const ref=cell.getAttribute('r')||'A1';const letters=ref.match(/[A-Z]+/i)?.[0]?.toUpperCase()||'A';
      const column=letters.split('').reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
      const type=cell.getAttribute('t');const raw=cell.getElementsByTagName('v')[0]?.textContent||'';
      const value=type==='s'?shared[Number(raw)]||'':type==='inlineStr'?Array.from(cell.getElementsByTagName('t')).map(t=>t.textContent||'').join(''):raw;
      cells[column]=value;
    }
    return cells.map(v=>v||'');
  }).filter(row=>row.some(Boolean));
  if(matrix.length<2)throw new Error('No worksheet rows');
  return {headers:matrix[0],rows:matrix.slice(1)};
}
function guessColumn(headers:string[], candidates:string[]) { return headers.find(h=>candidates.some(c=>h.toLowerCase().replace(/[_\s-]/g,'').includes(c)))||''; }
function parseImportDate(value:string) { const numeric=value.trim()!==''&&/^\d+(\.\d+)?$/.test(value.trim());return numeric?new Date((Number(value)-25569)*86400000):new Date(value); }

function ImportsPage() {
  const [csv,setCsv]=useState<CsvData|null>(null); const [fileName,setFileName]=useState(''); const [mapping,setMapping]=useState<Record<string,string>>({}); const [localError,setLocalError]=useState(''); const [result,setResult]=useState<ImportResult|null>(null);
  const preview=usePreviewImport(); const execute=useExecuteImport(); const history=useListImports(); const calendars=useListCalendars(); const qc=useQueryClient();
  const fields=[{key:'title',label:'Event title',required:true},{key:'startAt',label:'Start date & time',required:true},{key:'endAt',label:'End date & time',required:true},{key:'description',label:'Description',required:false},{key:'guestEmails',label:'Guest emails',required:false}];
  const onFile=async(file?:File)=>{if(!file)return;setLocalError('');setResult(null);try{const lower=file.name.toLowerCase();if(lower.endsWith('.xls'))throw new Error('Legacy Excel files are not supported. Save this workbook as .xlsx or .csv.');const parsed=lower.endsWith('.xlsx')?await parseXlsx(file):parseCsv(await file.text());if(parsed.headers.length<2||!parsed.rows.length)throw new Error('This file has no header row or event rows.');setCsv(parsed);setFileName(file.name);setMapping({title:guessColumn(parsed.headers,['title','subject','summary','event']),startAt:guessColumn(parsed.headers,['start','startdate','begins']),endAt:guessColumn(parsed.headers,['end','enddate','ends']),description:guessColumn(parsed.headers,['description','details','notes']),guestEmails:guessColumn(parsed.headers,['guest','email','attendee'])});}catch(err){setCsv(null);setLocalError(err instanceof Error?err.message:'We couldn’t read this file. Check that it is a valid CSV or Excel workbook.');}};
  const normalizedRows = ():ImportEventRow[]=>{
    if(!csv)return[];
    const get=(line:string[],key:string)=>{const idx=csv.headers.indexOf(mapping[key]);return idx>=0?line[idx]||'':'';};
    return csv.rows.map((line,i)=>{
      const start=parseImportDate(get(line,'startAt'));const end=parseImportDate(get(line,'endAt'));
      return {rowNumber:i+2,idempotencyKey:crypto.randomUUID(),title:get(line,'title'),startAt:Number.isNaN(start.getTime())?'':start.toISOString(),endAt:Number.isNaN(end.getTime())?'':end.toISOString(),allDay:false,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',description:get(line,'description')||undefined,guestEmails:get(line,'guestEmails').split(/[;,]/).map(s=>s.trim()).filter(Boolean),calendarId:calendars.data?.find(c=>c.primary)?.id||calendars.data?.[0]?.id||'',repeat:'none',createMeet:false,reminders:[]};
    });
  };
  const validGuestCount=preview.data?preview.data.rows.filter(row=>row.valid).reduce((sum,row)=>sum+(normalizedRows().find(item=>item.rowNumber===row.rowNumber)?.guestEmails.length||0),0):0;
  const runPreview=()=>{const missing=fields.filter(f=>f.required&&!mapping[f.key]);if(missing.length){setLocalError(`Map the required columns: ${missing.map(f=>f.label).join(', ')}.`);return;}const rows=normalizedRows();if(!rows.length){setLocalError('There are no event rows to preview.');return;}setLocalError('');preview.mutate({data:{rows}},{onSuccess:()=>{setResult(null);},onError:()=>setLocalError('Preview could not be prepared. Check the mapped dates and try again.')});};
  const executeImport=()=>{if(!preview.data)return;execute.mutate({batchId:preview.data.batchId,data:{confirmed:true}},{onSuccess:(data)=>{qc.invalidateQueries({queryKey:getListImportsQueryKey()});qc.invalidateQueries({queryKey:getListEventsQueryKey()});qc.invalidateQueries({queryKey:getListRemindersQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});qc.invalidateQueries({queryKey:getListActivityQueryKey()});setResult(data);},onError:()=>setLocalError('Import did not complete. The preview is still available; review the status before retrying.')});};
  return <div className="fade-in"><PageTitle eyebrow="Move a batch, carefully" title="Bulk imports" subtitle="Map your file, check every row, then explicitly confirm before events are created or guests are invited." />
    <div className="mb-6 grid gap-3 sm:grid-cols-3">{[['01','Upload & map','Choose the columns'],['02','Preview','Check validation'],['03','Confirm','Execute only when ready']].map(([n,t,d],i)=><div key={n} className={`flex items-center gap-3 rounded-xl border p-3 ${i===0?'border-[#bfd4c4] bg-[#edf4eb]':'border-[#e7e3d9] bg-[#fbfaf5]'}`}><span className="font-mono-ui text-lg text-[#58836b]">{n}</span><div><div className="text-xs font-bold text-[#45564e]">{t}</div><div className="text-[10px] text-[#858d87]">{d}</div></div></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="surface p-5 md:p-6"><div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#edf2e8] p-2.5 text-[#4e8064]"><CloudUpload size={19}/></span><div><h2 className="font-display text-xl font-semibold">Upload your event file</h2><p className="text-xs text-[#828b86]">CSV with a header row · up to 500 events</p></div></div>
          <label className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#bfc9bc] bg-[#f7f7f0] px-4 text-center transition hover:border-[#6e9c7e] hover:bg-[#f0f4eb]"><FileSpreadsheet className="mb-2 text-[#58846b]" size={23}/><span className="text-sm font-semibold text-[#425449]">{fileName||'Choose a CSV or Excel file'}</span><span className="mt-1 text-[11px] text-[#859089]">CSV or .xlsx · first worksheet · up to 500 events</span><input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" onChange={e=>onFile(e.target.files?.[0])} data-testid="input-import-file"/></label>
          {localError&&<div className="mt-3 flex gap-2 rounded-lg bg-[#fbefeb] p-3 text-xs leading-5 text-[#a84b3e]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={14}/>{localError}</div>}
        </section>
        {csv&&<section className="surface p-5 md:p-6"><div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#688a77]">Column matching</div><h2 className="mt-1 font-display text-xl font-semibold">Map your fields</h2></div><span className="rounded-full bg-[#f2f0e8] px-3 py-1 text-[10px] text-[#777f79]">{csv.rows.length} rows found</span></div>
          <div className="space-y-2">{fields.map(f=><div key={f.key} className="grid items-center gap-2 rounded-lg bg-[#f7f6f0] p-3 sm:grid-cols-[1fr_1fr]"><div><div className="text-xs font-semibold text-[#485750]">{f.label}{f.required&&<span className="ml-1 text-[#bb6f58]">*</span>}</div><div className="mt-0.5 text-[10px] text-[#8c938e]">File column</div></div><select value={mapping[f.key]||''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))} className="field py-2 text-xs" data-testid={`select-import-map-${f.key}`}><option value="">Do not map</option>{csv.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)}</div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#ece8df]"><table className="w-full min-w-[500px] text-left text-xs"><thead className="bg-[#f5f3eb] text-[10px] uppercase tracking-[.12em] text-[#8a918b]"><tr><th className="px-3 py-2">Source row</th>{fields.slice(0,3).map(f=><th key={f.key} className="px-3 py-2">{f.label}</th>)}</tr></thead><tbody>{csv.rows.slice(0,3).map((r,i)=><tr key={i} className="border-t border-[#efede6]"><td className="px-3 py-2 text-[#939992]">{i+2}</td>{fields.slice(0,3).map(f=><td key={f.key} className="max-w-[150px] truncate px-3 py-2 text-[#506057]">{r[csv.headers.indexOf(mapping[f.key])]||'—'}</td>)}</tr>)}</tbody></table></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-[#898f89]">Required fields are title, start, and end.</p><Button onClick={runPreview} disabled={preview.isPending} testId="button-preview-import">{preview.isPending?<LoaderCircle size={15} className="animate-spin"/>:<CheckCircle2 size={15}/>}Validate & preview</Button></div>
        </section>}
      </div>
      <div className="space-y-5">
        {preview.data&&!result&&<section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#688a77]">Validation report</div><h2 className="mt-1 font-display text-xl font-semibold">Preview before execution</h2></div><div className="grid grid-cols-3 gap-2 p-4"><div className="rounded-lg bg-[#f2f0e8] p-3"><div className="font-mono-ui text-xl">{preview.data.totalRows}</div><div className="text-[10px] text-[#7f8781]">Rows</div></div><div className="rounded-lg bg-[#eaf3eb] p-3"><div className="font-mono-ui text-xl text-[#43805e]">{preview.data.validRows}</div><div className="text-[10px] text-[#7f8781]">Valid</div></div><div className="rounded-lg bg-[#fbefeb] p-3"><div className="font-mono-ui text-xl text-[#a84b3e]">{preview.data.invalidRows}</div><div className="text-[10px] text-[#7f8781]">Issues</div></div></div><div className="max-h-[300px] divide-y divide-[#f0ede5] overflow-y-auto">{preview.data.rows.map(row=><div key={row.rowNumber} className="px-5 py-3" data-testid={`row-preview-${row.rowNumber}`}><div className="flex items-center gap-2"><span className={`status-pill ${row.valid?'bg-[#e8f3eb] text-[#367859]':'bg-[#fbefeb] text-[#a84b3e]'}`}>{row.valid?'Ready':'Review'}</span><span className="text-[10px] text-[#969c96]">Row {row.rowNumber}</span><span className="ml-auto truncate text-xs font-semibold text-[#45534d]">{row.title||'Untitled event'}</span></div>{row.errors.length>0&&<ul className="mt-2 space-y-1 text-[11px] text-[#a25447]">{row.errors.map((err,i)=><li key={i}>• {err}</li>)}</ul>}</div>)}</div><div className="border-t border-[#ece8df] p-4"><div className="mb-3 flex gap-2 rounded-lg bg-[#f4f3eb] p-3 text-[11px] leading-5 text-[#6e7871]"><ShieldCheck className="mt-0.5 shrink-0 text-[#4e8064]" size={15}/><span>Nothing has been added to Google Calendar. Execution is separate and explicit. Only valid rows are included.{validGuestCount>0?` Google Calendar may send invitations to ${validGuestCount} guest${validGuestCount===1?'':'s'} listed in those rows.`:''}</span></div><Button onClick={executeImport} disabled={execute.isPending||preview.data.validRows===0} testId="button-confirm-import" className="w-full">{execute.isPending?<LoaderCircle size={15} className="animate-spin"/>:<Check size={15}/>}Confirm import of {preview.data.validRows} events{validGuestCount>0?` · ${validGuestCount} invitations`:''}</Button></div></section>}
        {result&&<div className="surface p-6"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f3eb] text-[#438668]"><CheckCircle2 size={24}/></div><div><h2 className="font-display text-xl font-semibold">Import processed</h2><p className="mt-1 text-xs text-[#6d7872]">Batch {result.batchId}</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[#eaf3eb] p-3"><strong className="font-mono-ui text-xl text-[#43805e]">{result.successfulRows}</strong><div className="text-[10px] text-[#7f8781]">Created</div></div><div className="rounded-lg bg-[#fbefeb] p-3"><strong className="font-mono-ui text-xl text-[#a84b3e]">{result.failedRows}</strong><div className="text-[10px] text-[#7f8781]">Failed</div></div><div className="rounded-lg bg-[#f2f0e8] p-3"><strong className="font-mono-ui text-xl">{result.skippedRows}</strong><div className="text-[10px] text-[#7f8781]">Skipped</div></div></div><div className="mt-3 max-h-48 divide-y divide-[#f0ede5] overflow-auto">{result.rows.map(row=><div key={row.rowNumber} className="flex items-start gap-2 py-2 text-xs" data-testid={`row-import-result-${row.rowNumber}`}><span className={`status-pill ${statusClass(row.status)}`}>{pretty(row.status)}</span><span className="pt-1 text-[#858d87]">Row {row.rowNumber}</span>{row.error&&<span className="ml-auto pt-1 text-right text-[#a84b3e]">{row.error}</span>}</div>)}</div><Button kind="secondary" onClick={()=>{setCsv(null);setFileName('');setResult(null);setMapping({});preview.reset();}} testId="button-import-another" className="mt-4"><Plus size={15}/>Import another file</Button></div>}
        <section className="rounded-[17px] border border-[#dce3d9] bg-[#eef3e9] p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 text-[#4d8064]" size={18}/><div><div className="text-sm font-semibold text-[#435a4a]">A deliberate two-step process</div><p className="mt-1 text-xs leading-5 text-[#708072]">A preview never creates events. After validation, you must confirm the valid row count before the import is executed.</p></div></div></section>
        <section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Recent batches</div><h2 className="mt-1 font-display text-xl font-semibold">Import history</h2></div>{history.isLoading?<div className="p-4"><LoadingRows/></div>:history.isError?<div className="p-4"><QueryError retry={()=>history.refetch()}/></div>:!history.data?.length?<div className="p-5 text-sm text-[#7c8581]">No imports yet. Confirmed batches will be listed here.</div>:history.data.map(batch=><div key={batch.id} className="flex items-center gap-3 border-b border-[#f0ede5] px-5 py-3 last:border-0" data-testid={`row-import-batch-${batch.id}`}><span className={`status-pill ${statusClass(batch.status)}`}>{pretty(batch.status)}</span><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-[#48564f]">{batch.successfulRows} of {batch.totalRows} events created</div><div className="mt-1 text-[10px] text-[#909791]">{dateTime(batch.createdAt)}</div></div>{batch.failedRows>0&&<span className="text-[10px] text-[#a84b3e]">{batch.failedRows} failed</span>}</div>)}</section>
      </div>
    </div>
  </div>;
}

function SettingsPage() {
  const session=useGetGoogleSession(); const calendars=useListCalendars(); const logout=useLogoutGoogle(); const qc=useQueryClient();
  const authState = new URLSearchParams(window.location.search).get('auth');
  const connectMessage = authState === 'unconfigured'
    ? 'Google sign-in is not configured. The app owner must add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Replit Tools → Secrets and register the /api/auth/google/callback URL in Google Cloud Console. Do not enter these server secrets in the browser.'
    : authState === 'cancelled'
      ? 'Google sign-in was cancelled. No account was connected.'
      : authState === 'failed'
        ? 'Google could not complete sign-in. Review the OAuth app configuration in Replit Secrets and try again.'
        : '';
  return <div className="fade-in"><PageTitle eyebrow="Your connection & defaults" title="Settings" subtitle="Manage the Google account connected to Smart Calendar and choose the calendar used for new events." />
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Account</div><h2 className="mt-1 font-display text-xl font-semibold">Google connection</h2></div><div className="p-5 md:p-6">{session.data?.connected?<><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#eaf0e7] text-[#527c62]">{session.data.avatarUrl?<img src={session.data.avatarUrl} alt="" className="h-full w-full object-cover"/>:<span className="text-lg font-bold">{(session.data.displayName||session.data.email||'G').slice(0,1).toUpperCase()}</span>}</div><div><div className="font-semibold text-[#354354]">{session.data.displayName||'Google account'}</div><div className="mt-1 text-sm text-[#78827d]">{session.data.email}</div></div><span className="status-pill ml-auto bg-[#e8f3eb] text-[#367859]"><CheckCircle2 size={12}/>Connected</span></div><div className="mt-5 rounded-xl bg-[#f3f4ec] p-4 text-xs leading-5 text-[#6e7872]"><ShieldCheck className="mr-1 inline text-[#4e8064]" size={14}/>Authentication and consent are handled by Google. Smart Calendar never asks you for your password or verification codes.</div><Button kind="secondary" onClick={()=>logout.mutate(undefined,{onSuccess:()=>qc.invalidateQueries({queryKey:getGetGoogleSessionQueryKey()})})} disabled={logout.isPending} testId="button-settings-disconnect" className="mt-5"><LogOut size={15}/>Disconnect Google</Button></>:<div><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[#68736e]">No Google account is connected.</p><a href="/api/auth/google" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#315d4d] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#274c40] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8db99b]/50" data-testid="link-settings-connect"><GoogleMark/>Connect Google<ArrowRight size={14}/></a></div>{connectMessage&&<div className="mt-4 rounded-lg border border-[#ead1c8] bg-[#fcf3ef] px-4 py-3 text-sm leading-5 text-[#8b5148]" role="alert" data-testid="status-google-connect-error">{connectMessage}</div>}<div className="mt-4 flex items-start gap-2 rounded-xl bg-[#f3f4ec] p-4 text-xs leading-5 text-[#6e7872]"><ShieldCheck className="mt-0.5 shrink-0 text-[#4e8064]" size={14}/><span>Google handles your sign-in and consent. App-owner GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET belong in Replit Tools → Secrets; they are server secrets and must never be entered in this browser.</span></div></div>}</div></section>
      <section className="surface overflow-hidden"><div className="border-b border-[#ece8df] px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#698b78]">Calendar selection</div><h2 className="mt-1 font-display text-xl font-semibold">Available calendars</h2></div>{calendars.isLoading?<div className="p-5"><LoadingRows/></div>:calendars.isError?<div className="p-5"><QueryError retry={()=>calendars.refetch()}/></div>:!calendars.data?.length?<div className="p-5 text-sm text-[#7c8581]">No calendars were found for this Google account.</div>:<div className="divide-y divide-[#f0ede5]">{calendars.data.map(c=><CalendarChoice key={c.id} calendar={c}/>)}</div>}<div className="border-t border-[#ece8df] p-4 text-[11px] leading-5 text-[#89918b]">New events use your primary calendar by default. Choose another calendar when creating an event.</div></section>
    </div>
    <section className="mt-5 rounded-[17px] border border-[#e5e2d8] bg-[#f1efe6] p-5"><div className="flex gap-3"><CircleHelp className="mt-0.5 shrink-0 text-[#78857b]" size={17}/><div><div className="text-sm font-semibold text-[#4b5a52]">About guest permissions</div><p className="mt-1 text-xs leading-5 text-[#77817a]">Creating an event with guests can send invitations. We’ll always show a review step with the guest list before confirming the action.</p></div></div></section>
  </div>;
}
function CalendarChoice({calendar}:{calendar:Calendar}) { return <div className="flex items-center gap-3 px-5 py-4" data-testid={`calendar-${calendar.id}`}><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef3e9] text-[#58846b]"><CalendarDays size={17}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#3d4b55]">{calendar.name}</div><div className="mt-1 text-[10px] text-[#89918c]">{calendar.timeZone}</div></div>{calendar.primary&&<span className="status-pill bg-[#e8f3eb] text-[#367859]">Primary</span>}</div>; }
function NotFound() { return <div className="mx-auto max-w-lg py-20 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9efe6] text-[#548166]"><CalendarDays size={25}/></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-[#6b8b76]">Not on this calendar</p><h1 className="mt-2 font-display text-3xl font-semibold">This page doesn’t exist</h1><p className="mt-2 text-sm text-[#7b8580]">The link may be out of date. Let’s get you back to your day.</p><Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#315d4d] px-4 py-2.5 text-sm font-semibold text-white">Back to overview <ArrowRight size={15}/></Link></div>; }

function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><AppFrame /></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><Router/><Toaster/></TooltipProvider></QueryClientProvider>; }
export default App;
