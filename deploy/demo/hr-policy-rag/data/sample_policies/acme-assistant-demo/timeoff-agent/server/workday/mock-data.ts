import type {
  Employee, LeaveType, LeaveBalance, TimeOffRequest, Holiday,
  TeamMemberOOO, Notification, RequestStatus, LeaveDetails,
} from '../../shared/types.js'

const MANAGER = { id: 'WD-10015', name: 'Jordan Park', email: 'jordan.park@acme.com' }
const MANAGER_IN = { id: 'WD-10020', name: 'Rohan Mehta', email: 'rohan.mehta@acme.com' }
const FIVE_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export const employees: Record<string, Employee> = {
  'WD-10015': {
    employeeId: 'WD-10015', name: 'Jordan Park', email: 'jordan.park@acme.com',
    employeeType: 'full-time', role: 'manager', department: 'Engineering',
    title: 'Engineering Manager', hireDate: '2019-06-03', location: 'US-CA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: { id: 'WD-10002', name: 'Dana Whitfield', email: 'dana.whitfield@acme.com' },
    ragUser: 'carol@corp.com',
  },
  'WD-10020': {
    employeeId: 'WD-10020', name: 'Rohan Mehta', email: 'rohan.mehta@acme.com',
    employeeType: 'full-time', role: 'manager', department: 'Engineering',
    title: 'Engineering Manager, Bengaluru', hireDate: '2020-09-14', location: 'IN-KA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: { id: 'WD-10002', name: 'Dana Whitfield', email: 'dana.whitfield@acme.com' },
    ragUser: 'rohan@corp.com',
  },
  'WD-10081': {
    employeeId: 'WD-10081', name: 'Kavya Nair', email: 'kavya.nair@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Software Engineer', hireDate: '2023-02-06', location: 'IN-KA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER_IN,
    ragUser: 'ananya@corp.com',
  },
  'WD-10082': {
    employeeId: 'WD-10082', name: 'Arjun Rao', email: 'arjun.rao@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Senior Software Engineer', hireDate: '2021-07-19', location: 'IN-KA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER_IN,
    ragUser: 'ananya@corp.com',
  },
  'WD-10007': {
    employeeId: 'WD-10007', name: 'Bob Rivera', email: 'bob.rivera@acme.com',
    employeeType: 'full-time', role: 'hr_admin', department: 'People',
    title: 'HR Business Partner', hireDate: '2018-02-12', location: 'US-CA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: { id: 'WD-10002', name: 'Dana Whitfield', email: 'dana.whitfield@acme.com' },
    ragUser: 'bob@corp.com',
  },
  'WD-10042': {
    employeeId: 'WD-10042', name: 'Alex Chen', email: 'alex.chen@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Senior Software Engineer', hireDate: '2022-03-15', location: 'US-CA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER,
    ragUser: 'alice@corp.com',
  },
  'WD-10089': {
    employeeId: 'WD-10089', name: 'Priya Sharma', email: 'priya.sharma@acme.com',
    employeeType: 'part-time', role: 'employee', department: 'Design',
    title: 'UX Designer', hireDate: '2023-09-01', location: 'US-NY',
    workSchedule: { days: ['Monday', 'Tuesday', 'Wednesday'], hoursPerDay: 6 },
    manager: MANAGER,
    ragUser: 'dave@corp.com',
  },
  'WD-10120': {
    employeeId: 'WD-10120', name: 'Marcus Johnson', email: 'marcus.johnson@acme.com',
    employeeType: 'contractor', role: 'employee', department: 'Engineering',
    title: 'Contract Developer', hireDate: '2024-01-10', location: 'US-TX',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER,
    ragUser: 'contractor@ext.com',
  },
  'WD-10051': {
    employeeId: 'WD-10051', name: 'Sarah Kim', email: 'sarah.kim@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Software Engineer II', hireDate: '2021-11-08', location: 'US-CA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER,
    ragUser: 'sarah@corp.com',
  },
  'WD-10077': {
    employeeId: 'WD-10077', name: 'Ananya Iyer', email: 'ananya.iyer@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Software Engineer II', hireDate: '2024-06-10', location: 'IN-KA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER_IN,
    ragUser: 'ananya@corp.com',
  },
  'WD-10063': {
    employeeId: 'WD-10063', name: 'David Lee', email: 'david.lee@acme.com',
    employeeType: 'full-time', role: 'employee', department: 'Engineering',
    title: 'Staff Engineer', hireDate: '2020-02-24', location: 'US-CA',
    workSchedule: { days: FIVE_DAY, hoursPerDay: 8 },
    manager: MANAGER,
    ragUser: 'alice@corp.com',
  },
}

export const emailToEmployeeId: Record<string, string> = Object.fromEntries(
  Object.values(employees).map(e => [e.email, e.employeeId]),
)

export function teamOf(managerId: string): Employee[] {
  return Object.values(employees).filter(e => e.manager.id === managerId)
}

const ftLeaveTypes: LeaveType[] = [
  { leaveTypeId: 'PTO', name: 'Paid Time Off', accrualPolicy: '6.67 hrs/semi-monthly', eligible: true, category: 'paid' },
  { leaveTypeId: 'SICK', name: 'Sick Leave', accrualPolicy: '2.67 hrs/semi-monthly', eligible: true, category: 'paid' },
  { leaveTypeId: 'FLOAT', name: 'Floating Holiday', accrualPolicy: 'Granted annually', eligible: true, category: 'paid' },
  { leaveTypeId: 'BEREAVE', name: 'Bereavement', accrualPolicy: 'As needed, up to 5 days', eligible: true, category: 'paid' },
  { leaveTypeId: 'JURY', name: 'Jury Duty', accrualPolicy: 'As needed', eligible: true, category: 'paid' },
  { leaveTypeId: 'PARENTAL', name: 'Parental Leave', accrualPolicy: '12 weeks paid', eligible: true, category: 'paid' },
]

const ptLeaveTypes: LeaveType[] = [
  { leaveTypeId: 'PTO', name: 'Paid Time Off (Prorated)', accrualPolicy: '3.33 hrs/semi-monthly', eligible: true, category: 'paid' },
  { leaveTypeId: 'SICK', name: 'Sick Leave (Prorated)', accrualPolicy: '1.33 hrs/semi-monthly', eligible: true, category: 'paid' },
  { leaveTypeId: 'BEREAVE', name: 'Bereavement', accrualPolicy: 'As needed, up to 3 days', eligible: true, category: 'paid' },
]

export function getLeaveTypes(employeeId: string): LeaveType[] {
  const emp = employees[employeeId]
  if (!emp) return []
  if (emp.employeeType === 'full-time') return ftLeaveTypes
  if (emp.employeeType === 'part-time') return ptLeaveTypes
  return [{ leaveTypeId: 'UNPAID', name: 'Unpaid Time Off', accrualPolicy: 'N/A', eligible: true, category: 'unpaid' }]
}

function bal(leaveType: string, id: string, hrs: number, pending: number, hpd: number, rate: number, next = '2026-09-16'): LeaveBalance {
  return {
    leaveType, leaveTypeId: id, balanceHours: hrs, balanceDays: hrs / hpd,
    pendingRequestsHours: pending, availableHours: hrs - pending, availableDays: (hrs - pending) / hpd,
    accrualRatePerPeriod: rate, nextAccrualDate: next,
  }
}

function makeInitialBalances(): Record<string, LeaveBalance[]> {
  return {
    'WD-10007': [bal('Paid Time Off', 'PTO', 96, 0, 8, 6.67), bal('Sick Leave', 'SICK', 64, 0, 8, 2.67), bal('Floating Holiday', 'FLOAT', 16, 0, 8, 0, '2027-01-01')],
    'WD-10015': [bal('Paid Time Off', 'PTO', 112, 0, 8, 6.67), bal('Sick Leave', 'SICK', 56, 0, 8, 2.67), bal('Floating Holiday', 'FLOAT', 16, 0, 8, 0, '2027-01-01')],
    'WD-10042': [bal('Paid Time Off', 'PTO', 120, 24, 8, 6.67), bal('Sick Leave', 'SICK', 64, 0, 8, 2.67), bal('Floating Holiday', 'FLOAT', 16, 0, 8, 0, '2027-01-01')],
    'WD-10089': [bal('Paid Time Off (Prorated)', 'PTO', 48, 0, 6, 3.33), bal('Sick Leave (Prorated)', 'SICK', 24, 0, 6, 1.33)],
    'WD-10120': [],
    'WD-10051': [bal('Paid Time Off', 'PTO', 72, 0, 8, 6.67), bal('Sick Leave', 'SICK', 48, 0, 8, 2.67), bal('Floating Holiday', 'FLOAT', 8, 0, 8, 0, '2027-01-01')],
    'WD-10077': [bal('Paid Time Off', 'PTO', 104, 0, 8, 6.67), bal('Sick Leave', 'SICK', 64, 0, 8, 2.67)],
    'WD-10020': [bal('Paid Time Off', 'PTO', 96, 0, 8, 6.67), bal('Sick Leave', 'SICK', 56, 0, 8, 2.67)],
    'WD-10081': [bal('Paid Time Off', 'PTO', 80, 0, 8, 6.67), bal('Sick Leave', 'SICK', 64, 0, 8, 2.67)],
    'WD-10082': [bal('Paid Time Off', 'PTO', 72, 0, 8, 6.67), bal('Sick Leave', 'SICK', 48, 0, 8, 2.67)],
    'WD-10063': [bal('Paid Time Off', 'PTO', 88, 24, 8, 6.67), bal('Sick Leave', 'SICK', 72, 0, 8, 2.67), bal('Floating Holiday', 'FLOAT', 16, 0, 8, 0, '2027-01-01')],
  }
}

function makeInitialRequests(): TimeOffRequest[] {
  return [
    { requestId: 'REQ-2026-001', employeeId: 'WD-10042', employeeName: 'Alex Chen', leaveTypeId: 'PTO', leaveTypeName: 'Paid Time Off',
      startDate: '2026-09-21', endDate: '2026-09-23', totalDays: 3, totalHours: 24, status: 'pending', comment: 'Family trip',
      managerName: 'Jordan Park', submittedAt: '2026-09-02T10:30:00Z' },
    { requestId: 'REQ-2026-002', employeeId: 'WD-10051', employeeName: 'Sarah Kim', leaveTypeId: 'PTO', leaveTypeName: 'Paid Time Off',
      startDate: '2026-10-12', endDate: '2026-10-16', totalDays: 5, totalHours: 40, status: 'approved', comment: 'Hawaii',
      managerName: 'Jordan Park', submittedAt: '2026-08-20T15:02:00Z', decidedAt: '2026-08-21T09:12:00Z', decisionNote: 'Enjoy!' },
    { requestId: 'REQ-2026-003', employeeId: 'WD-10063', employeeName: 'David Lee', leaveTypeId: 'PTO', leaveTypeName: 'Paid Time Off',
      startDate: '2026-11-23', endDate: '2026-11-25', totalDays: 3, totalHours: 24, status: 'pending', comment: 'Thanksgiving with in-laws',
      managerName: 'Jordan Park', submittedAt: '2026-09-04T18:40:00Z' },
    { requestId: 'REQ-2026-004', employeeId: 'WD-10089', employeeName: 'Priya Sharma', leaveTypeId: 'PTO', leaveTypeName: 'Paid Time Off (Prorated)',
      startDate: '2026-12-28', endDate: '2026-12-30', totalDays: 3, totalHours: 18, status: 'approved', comment: 'Year-end break',
      managerName: 'Jordan Park', submittedAt: '2026-08-30T11:00:00Z', decidedAt: '2026-08-31T08:45:00Z' },
    { requestId: 'REQ-2026-IN-001', employeeId: 'WD-10082', employeeName: 'Arjun Rao', leaveTypeId: 'PTO', leaveTypeName: 'Paid Time Off',
      startDate: '2026-11-09', endDate: '2026-11-13', totalDays: 4, totalHours: 32, status: 'approved', comment: 'Diwali week with family',
      managerName: 'Rohan Mehta', submittedAt: '2026-08-25T09:10:00Z', decidedAt: '2026-08-25T11:30:00Z' },
    { requestId: 'REQ-2026-005', employeeId: 'WD-10120', employeeName: 'Marcus Johnson', leaveTypeId: 'UNPAID', leaveTypeName: 'Unpaid Time Off',
      startDate: '2026-10-27', endDate: '2026-10-29', totalDays: 3, totalHours: 24, status: 'denied', comment: 'Conference',
      managerName: 'Jordan Park', submittedAt: '2026-08-28T13:20:00Z', decidedAt: '2026-08-28T16:05:00Z',
      decisionNote: 'Falls inside the Oct 26-30 release freeze. Happy to approve the following week.' },
  ]
}

let balancesDb = makeInitialBalances()
let requestsDb = makeInitialRequests()
let notificationsDb: Notification[] = []
let requestSeq = 5
let notifSeq = 0

/** Reset all mutable state to initial values (used by eval runner) */
export function resetMockData() {
  balancesDb = makeInitialBalances()
  requestsDb = makeInitialRequests()
  notificationsDb = []
  requestSeq = 5
  notifSeq = 0
}

export function getLeaveBalances(employeeId: string): LeaveBalance[] {
  return balancesDb[employeeId] ?? []
}

export function getTimeOffRequests(employeeId: string, statusFilter?: string): TimeOffRequest[] {
  return requestsDb.filter(r =>
    r.employeeId === employeeId && (!statusFilter || r.status === statusFilter),
  )
}

export function getRequest(requestId: string): TimeOffRequest | undefined {
  return requestsDb.find(r => r.requestId === requestId)
}

export function getAllRequests(): TimeOffRequest[] {
  return requestsDb.slice()
}

export function getTeamRequests(managerId: string): TimeOffRequest[] {
  const ids = new Set(teamOf(managerId).map(e => e.employeeId))
  return requestsDb.filter(r => ids.has(r.employeeId))
}

export function submitTimeOffRequest(
  employeeId: string,
  leaveTypeId: string,
  startDate: string,
  endDate: string,
  hoursPerDay: number,
  comment?: string,
): TimeOffRequest {
  const emp = employees[employeeId]
  if (!emp) throw new Error('Employee not found')

  const workDays = countWorkDays(startDate, endDate, emp.workSchedule.days)
    - getCompanyHolidays(emp.location, Number(startDate.slice(0, 4))).filter(h => h.date >= startDate && h.date <= endDate).length
  const totalHours = workDays * hoursPerDay

  requestSeq += 1
  const req: TimeOffRequest = {
    requestId: `REQ-2026-${String(requestSeq).padStart(3, '0')}`,
    employeeId,
    employeeName: emp.name,
    leaveTypeId,
    leaveTypeName: getLeaveTypes(employeeId).find(l => l.leaveTypeId === leaveTypeId)?.name ?? leaveTypeId,
    startDate,
    endDate,
    totalDays: workDays,
    totalHours,
    status: 'pending',
    comment,
    managerName: emp.manager.name,
    submittedAt: new Date().toISOString(),
  }
  requestsDb.push(req)

  const b = balancesDb[employeeId]?.find(x => x.leaveTypeId === leaveTypeId)
  if (b) {
    b.pendingRequestsHours += totalHours
    b.availableHours -= totalHours
    b.availableDays = b.availableHours / hoursPerDay
  }

  pushNotification({
    toEmployeeId: emp.manager.id,
    kind: 'approval_request',
    subject: `${emp.name} requests ${req.leaveTypeName}: ${startDate} to ${endDate}`,
    body: `${emp.name} submitted ${req.requestId} for ${workDays} day${workDays === 1 ? '' : 's'} (${startDate} to ${endDate})${comment ? `. Note: "${comment}"` : ''}. Approve or deny in the manager view.`,
    requestId: req.requestId,
  })

  return req
}

export function hrAdmins(): Employee[] {
  return Object.values(employees).filter(e => e.role === 'hr_admin')
}

/** A leave of absence: entitlement-based, no balance to deduct, routed to the manager and to HR. */
export function submitLeaveOfAbsence(employeeId: string, startDate: string, endDate: string, details: LeaveDetails, comment?: string): TimeOffRequest {
  const emp = employees[employeeId]
  if (!emp) throw new Error('Employee not found')
  const workDays = countWorkDays(startDate, endDate, emp.workSchedule.days)
  requestSeq += 1
  const req: TimeOffRequest = {
    requestId: `REQ-2026-${String(requestSeq).padStart(3, '0')}`,
    employeeId, employeeName: emp.name,
    leaveTypeId: 'PARENTAL', leaveTypeName: 'Parental Leave',
    startDate, endDate, totalDays: workDays, totalHours: workDays * emp.workSchedule.hoursPerDay,
    status: 'pending', comment, managerName: emp.manager.name,
    submittedAt: new Date().toISOString(), details,
  }
  requestsDb.push(req)
  const weeks = details.entitlementWeeks
  pushNotification({
    toEmployeeId: emp.manager.id, kind: 'approval_request',
    subject: `${emp.name} requests parental leave: ${startDate} to ${endDate}`,
    body: `${emp.name} submitted ${req.requestId}, ${weeks} weeks of parental leave (${startDate} to ${endDate}). HR is confirming eligibility; please acknowledge coverage.`,
    requestId: req.requestId,
  })
  for (const hr of hrAdmins()) {
    pushNotification({
      toEmployeeId: hr.employeeId, kind: 'approval_request',
      subject: `Eligibility check: ${emp.name}, parental leave ${startDate} to ${endDate}`,
      body: `${req.requestId}: ${weeks} weeks (${details.country}). Basis: ${details.basis.join('; ')}. Documents requested: ${details.documents.join('; ')}.`,
      requestId: req.requestId,
    })
  }
  return req
}

export function decideRequest(requestId: string, decision: 'approved' | 'denied', note?: string): TimeOffRequest {
  const req = requestsDb.find(r => r.requestId === requestId)
  if (!req) throw new Error('Request not found')
  if (req.status !== 'pending') throw new Error(`Request is already ${req.status}`)

  const emp = employees[req.employeeId]
  req.status = decision
  req.decidedAt = new Date().toISOString()
  req.decisionNote = note

  const b = req.details ? undefined : balancesDb[req.employeeId]?.find(x => x.leaveTypeId === req.leaveTypeId)
  if (b) {
    b.pendingRequestsHours -= req.totalHours
    if (decision === 'approved') {
      b.balanceHours -= req.totalHours
      b.balanceDays = b.balanceHours / emp.workSchedule.hoursPerDay
    } else {
      b.availableHours += req.totalHours
      b.availableDays = b.availableHours / emp.workSchedule.hoursPerDay
    }
  }

  pushNotification({
    toEmployeeId: req.employeeId,
    kind: 'decision',
    subject: `${req.managerName} ${decision} your request ${req.requestId}`,
    body: `${req.managerName} ${decision} ${req.leaveTypeName} for ${req.startDate} to ${req.endDate}${note ? `. Note: "${note}"` : ''}.`,
    requestId: req.requestId,
  })

  return req
}

function pushNotification(n: Omit<Notification, 'id' | 'createdAt' | 'read'>) {
  notifSeq += 1
  notificationsDb.push({ id: `NOTE-${notifSeq}`, createdAt: new Date().toISOString(), read: false, ...n })
}

export function getNotifications(employeeId: string, unreadOnly = false): Notification[] {
  return notificationsDb.filter(n => n.toEmployeeId === employeeId && (!unreadOnly || !n.read))
}

export function markNotificationsRead(employeeId: string) {
  for (const n of notificationsDb) if (n.toEmployeeId === employeeId) n.read = true
}

export const holidays: Holiday[] = [
  { date: '2026-01-01', name: "New Year's Day", location: 'US' },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day', location: 'US' },
  { date: '2026-02-16', name: "Presidents' Day", location: 'US' },
  { date: '2026-05-25', name: 'Memorial Day', location: 'US' },
  { date: '2026-07-03', name: 'Independence Day (Observed)', location: 'US' },
  { date: '2026-09-07', name: 'Labor Day', location: 'US' },
  { date: '2026-11-26', name: 'Thanksgiving', location: 'US' },
  { date: '2026-11-27', name: 'Day After Thanksgiving', location: 'US' },
  { date: '2026-12-24', name: 'Christmas Eve', location: 'US' },
  { date: '2026-12-25', name: 'Christmas Day', location: 'US' },
  { date: '2026-12-31', name: "New Year's Eve", location: 'US' },
  { date: '2027-01-01', name: "New Year's Day", location: 'US' },
  { date: '2027-01-18', name: 'Martin Luther King Jr. Day', location: 'US' },
  { date: '2027-02-15', name: "Presidents' Day", location: 'US' },
  { date: '2027-05-31', name: 'Memorial Day', location: 'US' },
  { date: '2027-07-05', name: 'Independence Day (Observed)', location: 'US' },
  { date: '2026-01-26', name: 'Republic Day', location: 'IN' },
  { date: '2026-08-15', name: 'Independence Day', location: 'IN' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', location: 'IN' },
  { date: '2026-11-09', name: 'Diwali (observed)', location: 'IN' },
  { date: '2026-12-25', name: 'Christmas Day', location: 'IN' },
  { date: '2027-01-01', name: "New Year's Day", location: 'IN' },
  { date: '2027-01-26', name: 'Republic Day', location: 'IN' },
]

export function getCompanyHolidays(location: string, year: number): Holiday[] {
  const locPrefix = location.split('-')[0]
  return holidays.filter(h => h.location === locPrefix && h.date.startsWith(String(year)))
}

export function isHoliday(date: string, location: string): Holiday | undefined {
  const locPrefix = location.split('-')[0]
  return holidays.find(h => h.location === locPrefix && h.date === date)
}

/** Engineering blackout windows: no discretionary PTO without director approval. */
export const blackouts = [
  { startDate: '2026-10-26', endDate: '2026-10-30', name: 'Q4 release freeze' },
  { startDate: '2027-01-04', endDate: '2027-01-08', name: 'Annual planning week' },
]

export function blackoutFor(startDate: string, endDate: string) {
  return blackouts.find(b => b.endDate >= startDate && b.startDate <= endDate)
}

/** Team members (other than excludeId) out during a range, from live requests. */
export function getTeamCalendar(managerId: string, startDate: string, endDate: string, excludeId?: string): TeamMemberOOO[] {
  const statuses: RequestStatus[] = ['pending', 'approved']
  return getTeamRequests(managerId)
    .filter(r => statuses.includes(r.status) && r.employeeId !== excludeId && r.endDate >= startDate && r.startDate <= endDate)
    .map(r => ({
      employeeId: r.employeeId, name: r.employeeName, startDate: r.startDate, endDate: r.endDate,
      leaveType: r.leaveTypeName, status: r.status, requestId: r.requestId,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function checkDateConflicts(employeeId: string, startDate: string, endDate: string) {
  const emp = employees[employeeId]
  if (!emp) return { hasConflicts: false, conflicts: [] as { type: string; description: string; date: string }[] }

  const conflicts: { type: string; description: string; date: string }[] = []

  for (const req of getTimeOffRequests(employeeId)) {
    if (req.status !== 'cancelled' && req.status !== 'denied' && req.endDate >= startDate && req.startDate <= endDate) {
      conflicts.push({
        type: 'existing_request',
        description: `You already have a ${req.leaveTypeName} request (${req.status}) from ${req.startDate} to ${req.endDate}`,
        date: req.startDate,
      })
    }
  }

  for (const h of getCompanyHolidays(emp.location, Number(startDate.slice(0, 4)))) {
    if (h.date >= startDate && h.date <= endDate) {
      conflicts.push({ type: 'holiday', description: `${h.name} is a company holiday, no PTO needed`, date: h.date })
    }
  }

  const bo = blackoutFor(startDate, endDate)
  if (bo) {
    conflicts.push({ type: 'blackout', description: `${bo.name} (${bo.startDate} to ${bo.endDate}) is a blackout period for Engineering`, date: bo.startDate })
  }

  const teamOOO = getTeamCalendar(emp.manager.id, startDate, endDate, employeeId)
  if (teamOOO.length >= 1) {
    conflicts.push({
      type: 'team_coverage',
      description: `${teamOOO.map(t => `${t.name} (${t.status}, ${t.startDate} to ${t.endDate})`).join('; ')} already out in this window`,
      date: startDate,
    })
  }

  return { hasConflicts: conflicts.length > 0, conflicts }
}

export const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
}

export function countWorkDays(start: string, end: string, workDayNames: string[]): number {
  const workDayNums = new Set(workDayNames.map(d => DAY_INDEX[d]))
  let count = 0
  const cur = new Date(start + 'T12:00:00')
  const endD = new Date(end + 'T12:00:00')
  while (cur <= endD) {
    if (workDayNums.has(cur.getDay())) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}
