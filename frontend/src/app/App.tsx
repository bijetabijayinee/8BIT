import {
  BedDouble,
  CalendarDays,
  ClipboardPlus,
  Eye,
  EyeOff,
  FileUp,
  Gauge,
  GripVertical,
  Hospital,
  Home,
  KeyRound,
  ListOrdered,
  Loader2,
  LogIn,
  LogOut,
  ContactRound,
  MessageSquareText,
  Search,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { type PointerEvent, useCallback, useEffect, useState } from 'react';
import { getDepartments } from '../api/client';
import { getSession, login, logout, type AuthSession } from '../api/auth';
import { LoginShowcase } from './LoginShowcase';
import { Toaster } from '../components/toast';
import { AiAgentChat, AiChatPage } from '../features/ai-chat';
import { ChatDock } from '../features/ai-chat/ChatDock';
import { NotificationsPanel } from '../features/notifications/NotificationsPanel';
import { AllocationDashboard } from '../features/allocation';
import { AppointmentsCalendar } from '../features/calendar/AppointmentsCalendar';
import { PatientsDirectoryPage } from '../features/patients';
import { IntakeForm } from '../features/intake';
import { KnowledgePage } from '../features/knowledge/KnowledgePage';
import { MetricsDashboard } from '../features/metrics';
import { PeopleDirectory } from '../features/people';
import { QueueTable } from '../features/queue';
import type { Appointment, StaffRole, StaffUser } from '../types/careflow';

type WorkspaceRoute = 'home' | 'queue' | 'patients' | 'intake' | 'allocation' | 'dashboard' | 'people' | 'knowledge' | 'calendar';

const navigationItems: Array<{ route: WorkspaceRoute; label: string; icon: LucideIcon }> = [
  { route: 'home', label: 'Home', icon: Home },
  { route: 'queue', label: 'Queue', icon: ListOrdered },
  { route: 'patients', label: 'Patients', icon: ContactRound },
  { route: 'intake', label: 'Intake', icon: ClipboardPlus },
  { route: 'allocation', label: 'Allocation', icon: BedDouble },
  { route: 'dashboard', label: 'Dashboard', icon: Gauge },
  { route: 'people', label: 'People', icon: UsersRound },
  { route: 'knowledge', label: 'Knowledge', icon: FileUp },
  { route: 'calendar', label: 'Calendar', icon: CalendarDays },
];

const defaultDepartments = ['Emergency', 'Pediatrics', 'Orthopedics', 'General'];

function roleLabel(role: StaffRole) {
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function routeFromHash(): WorkspaceRoute {
  const hash = window.location.hash.replace('#/', '');
  if (
    hash === 'home' ||
    hash === 'intake' ||
    hash === 'dashboard' ||
    hash === 'queue' ||
    hash === 'people' ||
    hash === 'patients' ||
    hash === 'allocation' ||
    hash === 'knowledge' ||
    hash === 'calendar'
  ) {
    return hash;
  }
  return 'home';
}

export function App() {
  if (window.location.pathname === '/ai-chat') {
    return <AiChatPage />;
  }

  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const [activeRoute, setActiveRoute] = useState<WorkspaceRoute>(() => routeFromHash());
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  const [navWidth, setNavWidth] = useState(288);
  const [searchQuery, setSearchQuery] = useState('');
  const [departments, setDepartments] = useState<string[]>(defaultDepartments);
  const [session, setSession] = useState<AuthSession | null>(() => getSession());
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    const stored = window.localStorage.getItem('careflow-appointments');
    if (!stored) {
      return [];
    }
    try {
      return JSON.parse(stored) as Appointment[];
    } catch {
      return [];
    }
  });

  const activeStaff = session?.staff ?? null;

  useEffect(() => {
    window.localStorage.setItem('careflow-appointments', JSON.stringify(appointments));
  }, [appointments]);

  useEffect(() => {
    const handleHashChange = () => setActiveRoute(routeFromHash());
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/home');
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    let isMounted = true;

    async function loadDepartments() {
      try {
        const fetchedDepartments = await getDepartments();
        if (isMounted && fetchedDepartments.length > 0) {
          setDepartments(fetchedDepartments);
        }
      } catch {
        if (isMounted) {
          setDepartments(defaultDepartments);
        }
      }
    }

    void loadDepartments();
    return () => {
      isMounted = false;
    };
  }, [session]);

  const navigate = (route: WorkspaceRoute) => {
    window.location.hash = `#/${route}`;
    setActiveRoute(route);
  };

  const handleLogout = () => {
    logout();
    setSession(null);
  };

  const saveAppointment = (appointment: Appointment) => {
    setAppointments((current) => [appointment, ...current.filter((item) => item.id !== appointment.id)]);
  };

  const refreshOperationalViews = () => {
    setQueueRefreshKey((current) => current + 1);
    setMetricsRefreshKey((current) => current + 1);
  };

  const handleNavResize = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const startX = event.clientX;
      const startWidth = navWidth;
      event.currentTarget.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        setNavWidth(Math.min(380, Math.max(236, startWidth + moveEvent.clientX - startX)));
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [navWidth],
  );

  const handleAiAction = (action: string) => {
    if (action === 'refresh_queue') {
      setQueueRefreshKey((current) => current + 1);
    } else if (action === 'refresh_dashboard') {
      setMetricsRefreshKey((current) => current + 1);
    } else if (action === 'open_intake') {
      navigate('intake');
    } else if (action === 'filter_critical_high') {
      navigate('queue');
      setSearchQuery('critical');
    }
  };

  if (!session || !activeStaff) {
    return <LoginScreen onLogin={setSession} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 font-sans text-slate-950 transition-colors">
      <div className="flex min-h-screen">
        <aside
          className="relative hidden shrink-0 border-r border-slate-200 bg-white p-4 shadow-sm lg:block"
          style={{ width: navWidth }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white">
              <Hospital size={21} aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-950">CareFlow AI</p>
              <p className="text-xs font-medium text-emerald-700">Healthcare workspace</p>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">{activeStaff.displayName}</p>
            <p className="mt-1">
              {activeStaff.staffCode} - {roleLabel(activeStaff.role)}
              {activeStaff.department ? ` - ${activeStaff.department}` : ''}
            </p>
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Queue search
            <span className="mt-1 flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
              <Search size={16} className="text-emerald-700" aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                placeholder="Patient, complaint, status"
              />
            </span>
          </label>

          <nav className="mt-6 space-y-1" aria-label="Workspace routes">
            {navigationItems.map(({ route, label, icon: Icon }) => (
              <button
                key={route}
                type="button"
                onClick={() => navigate(route)}
                className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                  activeRoute === route
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-700 hover:bg-emerald-50 hover:text-slate-950'
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          >
            <LogOut size={17} aria-hidden="true" />
            Logout
          </button>

          <button
            type="button"
            onPointerDown={handleNavResize}
            className="absolute right-0 top-0 flex h-full w-3 translate-x-1/2 cursor-col-resize items-center justify-center text-emerald-700 opacity-60 transition hover:opacity-100"
            aria-label="Resize navigation"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
                  <Hospital size={19} aria-hidden="true" />
                </div>
                <p className="font-semibold">CareFlow AI</p>
              </div>
              <p className="truncate text-xs font-medium text-slate-600">
                {activeStaff.displayName} - {activeStaff.staffCode}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {navigationItems.map(({ route, label }) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => navigate(route)}
                  className={`h-9 rounded-md text-sm font-medium ${
                    activeRoute === route
                      ? 'bg-slate-950 text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-700"
            >
              <LogOut size={16} aria-hidden="true" />
              Logout
            </button>
          </header>

          <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {activeRoute === 'home' ? (
              <HomeWorkspace activeStaff={activeStaff} onAction={handleAiAction} onNavigate={navigate} />
            ) : null}
            {activeRoute === 'queue' ? (
              <QueueTable
                refreshSignal={queueRefreshKey}
                searchQuery={searchQuery}
                activeStaff={activeStaff}
                onAppointmentSaved={saveAppointment}
                onStatusUpdated={refreshOperationalViews}
              />
            ) : null}
            {activeRoute === 'intake' ? (
              <IntakeForm departments={departments} activeStaff={activeStaff} onCreated={refreshOperationalViews} />
            ) : null}
            {activeRoute === 'patients' ? <PatientsDirectoryPage /> : null}
            {activeRoute === 'allocation' ? <AllocationDashboard /> : null}
            {activeRoute === 'dashboard' ? <MetricsDashboard refreshSignal={metricsRefreshKey} /> : null}
            {activeRoute === 'people' ? <PeopleDirectory departments={departments} /> : null}
            {activeRoute === 'knowledge' ? <KnowledgePage /> : null}
            {activeRoute === 'calendar' ? <AppointmentsCalendar appointments={appointments} /> : null}
          </div>
        </section>
      </div>

      <ChatDock activeStaff={activeStaff} onAction={handleAiAction} />
      <Toaster />
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [staffCode, setStaffCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!staffCode.trim() || !password) {
      setError('Enter your staff code and password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const session = await login(staffCode.trim(), password);
      onLogin(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
        {/* Project story + animated agent pipeline (hidden on small screens) */}
        <div className="hidden lg:block">
          <LoginShowcase />
        </div>

        {/* Login card */}
        <div className="flex items-center justify-center p-4 sm:p-8">
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white">
                <Hospital size={21} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-emerald-700">CareFlow login</p>
                <h1 className="text-xl font-semibold text-slate-950">Sign in to your workspace</h1>
              </div>
            </div>

            {/* Compact story recap for small screens where the showcase is hidden */}
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 lg:hidden">
              CareFlow AI is an agentic triage platform: three AI agents assess urgency, research the
              condition in live medical literature, and match the right doctor - on every intake.
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              Staff code
              <input
                value={staffCode}
                onChange={(event) => setStaffCode(event.target.value.toUpperCase())}
                className="input-field"
                placeholder="e.g. TRIAGE-01"
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Password
              <span className="relative mt-1 block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void submit();
                    }
                  }}
                  className="input-field mt-0 pr-11"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </span>
            </label>

            {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={pending}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
              {pending ? 'Signing in...' : 'Login'}
            </button>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="flex items-center gap-1.5 font-semibold text-slate-700">
                <KeyRound size={13} aria-hidden="true" />
                Demo accounts - password <span className="font-mono">careflow</span>
              </p>
              <table className="mt-2 w-full text-left">
                <tbody>
                  <tr>
                    <td className="py-0.5 text-slate-500">Intake staff</td>
                    <td className="py-0.5 text-right font-mono font-medium text-slate-800">INTAKE-01</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-slate-500">Triage nurse</td>
                    <td className="py-0.5 text-right font-mono font-medium text-slate-800">TRIAGE-01</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-slate-500">Charge nurse</td>
                    <td className="py-0.5 text-right font-mono font-medium text-slate-800">CHARGE-01</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-slate-500">Doctor</td>
                    <td className="py-0.5 text-right font-mono font-medium text-slate-800">DOCTOR-EM</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function HomeWorkspace({
  activeStaff,
  onAction,
  onNavigate,
}: {
  activeStaff: StaffUser;
  onAction: (action: string) => void;
  onNavigate: (route: WorkspaceRoute) => void;
}) {
  const quickLinks = [
    { label: 'Live queue', description: 'Triage priority', route: 'queue' as WorkspaceRoute },
    { label: 'LLM intake', description: 'Register arrival', route: 'intake' as WorkspaceRoute },
    { label: 'Beds & doctors', description: 'Allocation', route: 'allocation' as WorkspaceRoute },
    { label: 'Care board', description: 'Workflow', route: 'board' as WorkspaceRoute },
    { label: 'Savi knowledge', description: 'Docs & patients', route: 'knowledge' as WorkspaceRoute },
    { label: 'Dashboard', description: 'Agent analytics', route: 'dashboard' as WorkspaceRoute },
  ];

  return (
    <section aria-labelledby="home-title" className="space-y-6 py-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-white/15">
              <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-400" />
              Autonomous care operations
            </span>
            <h2 id="home-title" className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
              Welcome back, {activeStaff.displayName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              CareFlow's agents triage every arrival, sort the queue, assign the right doctor, notify the care team,
              and research the condition - so your team acts faster under pressure.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-inset ring-white/15">
                <UsersRound size={13} aria-hidden="true" />
                {activeStaff.displayName} - {activeStaff.staffCode}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-inset ring-white/15">
                {roleLabel(activeStaff.role)} dashboard
              </span>
            </div>
          </div>
          <span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/20 lg:flex">
            <MessageSquareText size={28} aria-hidden="true" />
          </span>
        </div>

        <div className="relative mt-6 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className="group rounded-xl bg-white/10 p-3 text-left ring-1 ring-inset ring-white/10 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">{item.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0">
          <AiAgentChat activeStaff={activeStaff} onAction={onAction} embedded />
        </div>
        <div className="min-h-[34rem]">
          <NotificationsPanel activeStaff={activeStaff} />
        </div>
      </div>
    </section>
  );
}
