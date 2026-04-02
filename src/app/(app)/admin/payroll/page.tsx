'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, DollarSign, Send, FileSpreadsheet, Printer, Loader2, Info, Share2, Eye, CalendarDays } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, get, update } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInHours } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { arEG } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';


// ---------------- Interfaces ----------------

interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  workDaysPerMonth?: number;
  daysOff?: string[];
  shiftConfiguration?: "general" | "custom";
  checkInTime?: string;
  checkOutTime?: string;
  disableDeductions?: boolean;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes?: number;
  earlyLeaveMinutes?: number;
  status?: 'present' | 'absent' | 'weekly_off' | 'on_leave';
}

interface FinancialTransaction {
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    installments?: number;
}

interface EmployeeRequest {
  requestType: "leave_full_day" | "leave_half_day" | "mission" | "permission_early" | "permission_late";
  status: "approved";
  startDate: string;
  endDate: string;
  durationHours?: number;
}

interface FixedDeduction {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    value: number;
    transactionType: 'deduction' | 'addition';
}

interface DeductionRule {
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface GlobalSettings {
    deductionForAbsence?: number;
    deductionForIncompleteRecord?: number;
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    workStartTime?: string;
    workEndTime?: string;
    companyName?: string;
    fixedDeductions?: FixedDeduction[];
    holidayWorkCompensationType?: 'leave' | 'cash';
    holidayWorkCashAmount?: number;
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number;
    workDaysPerMonth: number;
    totalDelayMinutes: number;
    chargeableDelayMinutes: number;
    delayDeductions: number;
    totalEarlyLeaveMinutes: number;
    earlyLeaveDeductions: number;
    absenceDeductions: number;
    approvedLeaveDeductions: number;
    incompleteRecordDeductions: number;
    permissionDeductions: number;
    holidayWorkPay: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    paid: boolean;
    locationName: string;
    appliedDelayRule?: string;
    appliedEarlyLeaveRule?: string;
    fixedDeductions: { name: string; amount: number }[];
    fixedAdditions: { name: string; amount: number }[];
}

interface PayslipProps {
    item: PayrollItem;
    month: string;
    payable: number;
    companyName?: string;
    formatCurrency: (amount: number) => string | number;
}

// ---------------- Helper Calculation (No Recursion) ----------------

const getCalculatedPayable = (item: PayrollItem) => {
    const totalAdditions = item.bonus + item.holidayWorkPay + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductions = item.delayDeductions + item.earlyLeaveDeductions + item.absenceDeductions + item.approvedLeaveDeductions + item.incompleteRecordDeductions + item.permissionDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);
    return item.baseSalary + totalAdditions - totalDeductions;
};

// ---------------- Payslip Component ----------------

export function Payslip({ item, month, payable, companyName, formatCurrency }: PayslipProps) {
    const totalAdditions = item.bonus + item.holidayWorkPay + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductions = item.delayDeductions + item.earlyLeaveDeductions + item.absenceDeductions + item.approvedLeaveDeductions + item.incompleteRecordDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0) + item.permissionDeductions;
    
    return (
        <div className="p-8 bg-white text-black font-sans text-sm" dir="rtl">
            <style>
                {`@media print {
                    @page { size: A4; margin: 0; }
                    body { -webkit-print-color-adjust: exact; margin: 0; }
                    .payslip-container {
                        margin: 0;
                        border: none;
                        width: 100%;
                        min-height: 100vh;
                    }
                }`}
            </style>
            <div className="payslip-container">
                <header className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{companyName || "اسم الشركة"}</h1>
                        <p className="text-gray-500">كشف راتب</p>
                    </div>
                    <div className="text-left">
                        <p className="font-semibold">شهر: {format(new Date(month + '-02'), 'MMMM yyyy', { locale: arEG })}</p>
                        <p className="text-xs text-gray-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                </header>

                <section className="my-6 p-4 bg-gray-50 rounded-lg">
                    <h2 className="text-lg font-bold mb-2">بيانات الموظف</h2>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        <div><span className="font-semibold">اسم الموظف:</span> {item.employeeName}</div>
                        <div><span className="font-semibold">الكود الوظيفي:</span> {item.employeeCode}</div>
                        <div><span className="font-semibold">أيام العمل المحددة:</span> {item.workDaysPerMonth} يوم</div>
                    </div>
                </section>

                <section className="my-6 grid grid-cols-2 gap-8">
                     {/* Earnings */}
                    <div>
                        <h2 className="text-lg font-bold mb-2 pb-1 border-b">الاستحقاقات</h2>
                        <div className="space-y-2">
                            <div className="flex justify-between"><span>الراتب الأساسي</span><span className="font-mono">{formatCurrency(item.baseSalary)}</span></div>
                            <div className="flex justify-between"><span>مكافآت</span><span className="font-mono">{formatCurrency(item.bonus)}</span></div>
                            {item.holidayWorkPay > 0 && <div className="flex justify-between"><span>عمل أيام عطلة</span><span className="font-mono">{formatCurrency(item.holidayWorkPay)}</span></div>}
                            {item.fixedAdditions.map(add => (
                            <div key={add.name} className="flex justify-between"><span>{add.name}</span><span className="font-mono">{formatCurrency(add.amount)}</span></div>
                            ))}
                        </div>
                        <div className="flex justify-between font-bold text-lg mt-4 pt-2 border-t">
                            <span>إجمالي الاستحقاقات</span>
                            <span className="font-mono">{formatCurrency(item.baseSalary + totalAdditions)}</span>
                        </div>
                    </div>

                    {/* Deductions */}
                    <div>
                        <h2 className="text-lg font-bold mb-2 pb-1 border-b">الاستقطاعات</h2>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span>خصم التأخير</span>
                                <span className="font-mono">{formatCurrency(item.delayDeductions)}</span>
                            </div>
                            <div className="flex justify-between"><span>خصم انصراف مبكر</span><span className="font-mono">{formatCurrency(item.earlyLeaveDeductions)}</span></div>
                            <div className="flex justify-between"><span>خصم الغياب</span><span className="font-mono">{formatCurrency(item.absenceDeductions)}</span></div>
                            <div className="flex justify-between"><span>خصم عدم الانصراف</span><span className="font-mono">{formatCurrency(item.incompleteRecordDeductions)}</span></div>
                            <div className="flex justify-between"><span>جزاءات</span><span className="font-mono">{formatCurrency(item.penalty)}</span></div>
                            <div className="flex justify-between"><span>قسط السلفة</span><span className="font-mono">{formatCurrency(item.loanDeduction)}</span></div>
                            <div className="flex justify-between"><span>سلف جزئية</span><span className="font-mono">{formatCurrency(item.salaryAdvanceDeductions)}</span></div>
                             {item.fixedDeductions.map(ded => (
                            <div key={ded.name} className="flex justify-between"><span>{ded.name}</span><span className="font-mono">{formatCurrency(ded.amount)}</span></div>
                            ))}
                        </div>
                         <div className="flex justify-between font-bold text-lg mt-4 pt-2 border-t">
                            <span>إجمالي الاستقطاعات</span>
                            <span className="font-mono">{formatCurrency(totalDeductions)}</span>
                        </div>
                    </div>
                </section>

                <footer className="mt-8 pt-4 border-t-2 border-gray-200">
                    <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
                        <span className="text-xl font-bold">صافي الراتب المستحق</span>
                        <span className="text-2xl font-bold font-mono text-green-700">{formatCurrency(payable)} ج.م</span>
                    </div>
                </footer>
            </div>
        </div>
    );
}


// ---------------- Payroll Page Component ----------------

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const db = useDb();
  
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharingItem, setSharingItem] = useState<PayrollItem | null>(null);
  const [ignoreDelayDeductions, setIgnoreDelayDeductions] = useState(false);

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Omit<Employee, 'id'>>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${selectedMonth}`) : null, [db, selectedMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);
  
  const transactionsRef = useMemoFirebase(() => db ? ref(db, 'financial_transactions') : null, [db]);
  const [transactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, Record<string, FinancialTransaction>>>>(transactionsRef);

  const requestsRef = useMemoFirebase(() => db ? ref(db, 'employee_requests') : null, [db]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, Record<string, EmployeeRequest>>>(requestsRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const previouslyPaidRef = useMemoFirebase(() => db ? ref(db, `payroll/${selectedMonth}`) : null, [db, selectedMonth]);
  const [previouslyPaidData, isPaidLoading] = useDbData<Record<string, PayrollItem>>(previouslyPaidRef);


  useEffect(() => { setIsClient(true); }, []);

  // --- Helper to calculate total breakdown for display ---
  const calculateDisplayValues = (item: PayrollItem) => {
    const totalAdditions = item.bonus + item.holidayWorkPay + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductions = item.delayDeductions + item.earlyLeaveDeductions + item.absenceDeductions + item.approvedLeaveDeductions + item.incompleteRecordDeductions + item.permissionDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);
    const netSalary = item.baseSalary + totalAdditions - totalDeductions;
    return { netSalary, totalAdditions, totalDeductions };
  };

  // --- Main Calculation Logic ---
  const handleCalculatePayroll = () => {
    setIsCalculating(true);
    if (!employeesData || !settings) {
        toast({ variant: "destructive", title: "بيانات غير مكتملة" });
        setIsCalculating(false);
        return;
    }
    
    const monthDate = new Date(selectedMonth + "-02T00:00:00");
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const allEmployees: Employee[] = Object.entries(employeesData).map(([id, employee]) => ({ ...employee, id }));

    const newPayrollData: PayrollItem[] = allEmployees.map(employee => {
        const workDaysConfig = employee.workDaysPerMonth || 30;
        const dailyRate = employee.salary / workDaysConfig;
        
        const workHoursPerDay = settings.workStartTime && settings.workEndTime 
            ? Math.max(1, differenceInHours(new Date(`1970-01-01T${settings.workEndTime}`), new Date(`1970-01-01T${settings.workStartTime}`)))
            : 8;
        const hourlyRate = dailyRate / workHoursPerDay;
        const minuteRate = hourlyRate / 60;

        const employeeAttendance = attendanceData ? Object.values(attendanceData).filter(a => a.employeeId === employee.id) : [];
        const presentDates = new Set(employeeAttendance.filter(a => a.status === 'present' || !a.status).map(a => a.date));
        const manualWeeklyOffDays = new Set(employeeAttendance.filter(a => a.status === 'weekly_off').map(a => a.date));
        
        const totalDelayMinutes = employee.disableDeductions ? 0 : employeeAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
        const totalEarlyLeaveMinutes = employee.disableDeductions ? 0 : employeeAttendance.reduce((acc, curr) => acc + (curr.earlyLeaveMinutes || 0), 0);

        const employeeRequests = requestsData?.[employee.id] ? Object.values(requestsData[employee.id]) : [];
        const approvedLeaveDays = new Set<string>();
        let approvedEarlyLeavePermissionHours = 0;
        let approvedLateArrivalPermissionMinutes = 0;
        
        employeeRequests.forEach(req => {
            if (req.status === 'approved') {
                const reqDate = new Date(req.startDate);
                if (reqDate.getMonth() !== monthStart.getMonth() || reqDate.getFullYear() !== monthStart.getFullYear()) return;

                if (req.requestType.startsWith('leave')) {
                    eachDayOfInterval({ start: new Date(req.startDate), end: new Date(req.endDate) }).forEach(day => approvedLeaveDays.add(format(day, 'yyyy-MM-dd')));
                }
                if (req.requestType === 'permission_early' && req.durationHours) {
                    approvedEarlyLeavePermissionHours += req.durationHours;
                }
                if (req.requestType === 'permission_late' && req.durationHours) {
                    approvedLateArrivalPermissionMinutes += req.durationHours * 60;
                }
            }
        });
        const permissionDeductions = approvedEarlyLeavePermissionHours * hourlyRate;

        const daysOff = employee.daysOff || [];
        const daysInMonthInterval = eachDayOfInterval({ start: monthStart, end: monthEnd });
        
        const workDaysInMonth = daysInMonthInterval.filter(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (manualWeeklyOffDays.has(dayStr)) return false;
            return !daysOff.includes(getDay(day).toString());
        });

        let calendarAbsenceDays = 0;
        workDaysInMonth.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (!presentDates.has(dayStr) && !approvedLeaveDays.has(dayStr)) {
                calendarAbsenceDays++;
            }
        });

        let incompleteRecords = 0;
        workDaysInMonth.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const record = employeeAttendance.find(r => r.date === dayStr);
            if (record && record.checkIn && !record.checkOut) {
                incompleteRecords++;
            }
        });

        // CRITICAL FIX: Absence deductions must NOT exceed the working days quota
        const effectiveAbsenceDays = Math.min(calendarAbsenceDays, workDaysConfig);
        const absenceDeductions = effectiveAbsenceDays * (settings.deductionForAbsence || 1) * dailyRate;
        
        const effectiveIncompleteDays = Math.min(incompleteRecords, workDaysConfig);
        const incompleteRecordDeductions = effectiveIncompleteDays * (settings.deductionForIncompleteRecord || 0.5) * dailyRate;

        let delayDeductions = 0;
        let chargeableDelayMinutes = 0;
        if (!ignoreDelayDeductions) {
            const lateAllowance = settings.lateAllowanceScope === 'monthly' ? (settings.lateAllowance || 0) : 0;
            const netDelayMinutes = Math.max(0, totalDelayMinutes - approvedLateArrivalPermissionMinutes);
            chargeableDelayMinutes = Math.max(0, netDelayMinutes - lateAllowance);

            const deductionRulesRaw = settings.deductionRules || [];
            const deductionRules: DeductionRule[] = Array.isArray(deductionRulesRaw) ? deductionRulesRaw : Object.values(deductionRulesRaw);

            if (chargeableDelayMinutes > 0 && deductionRules.length > 0) {
                const applicableRule = deductionRules.sort((a,b) => a.fromMinutes - b.fromMinutes).find(rule => chargeableDelayMinutes >= rule.fromMinutes && chargeableDelayMinutes <= rule.toMinutes);
                if (applicableRule) {
                    if (applicableRule.deductionType === 'fixed_amount') delayDeductions = applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'day_deduction') delayDeductions = dailyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'hour_deduction') delayDeductions = hourlyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'minute_deduction') delayDeductions = minuteRate * applicableRule.deductionValue;
                }
            }
        }
        
        let earlyLeaveDeductions = 0;
        const earlyLeaveRulesRaw = settings.earlyLeaveDeductionRules || [];
        const earlyLeaveRules: DeductionRule[] = Array.isArray(earlyLeaveRulesRaw) ? earlyLeaveRulesRaw : Object.values(earlyLeaveRulesRaw);

         if (totalEarlyLeaveMinutes > 0 && earlyLeaveRules.length > 0) {
            const applicableRule = earlyLeaveRules.sort((a,b) => a.fromMinutes - b.fromMinutes).find(rule => totalEarlyLeaveMinutes >= rule.fromMinutes && totalEarlyLeaveMinutes <= rule.toMinutes);
            if (applicableRule && applicableRule.deductionType === 'day_deduction') {
                earlyLeaveDeductions = dailyRate * applicableRule.deductionValue;
            }
        }

        const employeeTransactions = transactionsData?.[employee.id]?.[selectedMonth] ? Object.values(transactionsData[employee.id][selectedMonth]) : [];
        const bonus = employeeTransactions.filter(t => t.type === 'bonus').reduce((acc, t) => acc + t.amount, 0);
        const penalty = employeeTransactions.filter(t => t.type === 'penalty').reduce((acc, t) => acc + t.amount, 0);
        const loanDeduction = employeeTransactions.filter(t => t.type === 'loan').reduce((acc, t) => acc + t.amount, 0);
        const salaryAdvanceDeductions = employeeTransactions.filter(t => t.type === 'salary_advance').reduce((acc, t) => acc + t.amount, 0);

        const fixedDeductions: { name: string; amount: number }[] = [];
        const fixedAdditions: { name: string; amount: number }[] = [];
        const fixedItems: FixedDeduction[] = Array.isArray(settings?.fixedDeductions) ? settings.fixedDeductions : settings?.fixedDeductions ? Object.values(settings.fixedDeductions) : [];
        
        fixedItems.forEach(item => {
            const amount = item.type === 'fixed' ? item.value : (employee.salary / 100) * item.value;
            if (item.transactionType === 'deduction') fixedDeductions.push({ name: item.name, amount });
            else fixedAdditions.push({ name: item.name, amount });
        });

        let holidayWorkPay = 0;
        if (settings.holidayWorkCompensationType === 'cash' && settings.holidayWorkCashAmount) {
            const holidayWorkDaysCount = employeeAttendance.filter(a => {
                const isPresent = a.status === 'present' || (!a.status && a.checkIn);
                if (!isPresent) return false;
                const dayDate = new Date(a.date);
                const dayOfWeek = getDay(dayDate).toString();
                return daysOff.includes(dayOfWeek);
            }).length;
            holidayWorkPay = holidayWorkDaysCount * settings.holidayWorkCashAmount;
        }

        return {
            employeeId: employee.id,
            employeeName: employee.employeeName,
            employeeCode: employee.employeeCode,
            baseSalary: employee.salary,
            workDaysPerMonth: workDaysConfig,
            totalDelayMinutes,
            chargeableDelayMinutes,
            delayDeductions,
            totalEarlyLeaveMinutes,
            earlyLeaveDeductions,
            absenceDeductions,
            approvedLeaveDeductions: 0,
            incompleteRecordDeductions,
            permissionDeductions,
            holidayWorkPay,
            bonus,
            penalty,
            loanDeduction,
            salaryAdvanceDeductions,
            paid: previouslyPaidData?.[employee.id]?.paid || false,
            locationName: "N/A",
            fixedDeductions,
            fixedAdditions,
        };
    });
    
    setPayrollData(newPayrollData);
    setIsCalculating(false);
    toast({ title: 'تم حساب الرواتب بنجاح' });
  };
  
  const handlePayAll = async () => {
    if (!db) return;
    const updates: { [key: string]: any } = {};
    payrollData.forEach(item => {
        if (!item.paid) {
            updates[`/payroll/${selectedMonth}/${item.employeeId}`] = { ...item, paid: true };
        }
    });
    await update(ref(db), updates);
    setPayrollData(prevData => prevData.map(item => ({ ...item, paid: true })));
    toast({ title: 'تم دفع جميع الرواتب بنجاح' });
  };
  
  const handleOpenShareDialog = (item: PayrollItem) => {
    setSharingItem(item);
    setIsShareDialogOpen(true);
  };

  const generateShareMessage = (item: PayrollItem) => {
    const { netSalary, totalDeductions, totalAdditions } = calculateDisplayValues(item);
    const monthName = new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' });
    const formatValue = (value: number) => `${formatCurrency(value)} ج.م`;

    let message = `*كشف راتب شهر ${monthName}*\n\n`;
    message += `*بيانات الموظف*\n*الاسم:* ${item.employeeName}\n*الكود:* ${item.employeeCode}\n*أيام العمل:* ${item.workDaysPerMonth} يوم\n\n`;
    message += `---------------------\n\n`;
    message += `*الاستحقاقات*\nالراتب الأساسي: ${formatValue(item.baseSalary)}\n`;
    if (item.bonus > 0) message += `مكافآت: ${formatValue(item.bonus)}\n`;
    if (item.holidayWorkPay > 0) message += `عمل أيام عطلة: ${formatValue(item.holidayWorkPay)}\n`;
    item.fixedAdditions.forEach(add => add.amount > 0 && (message += `${add.name}: ${formatValue(add.amount)}\n`));
    message += `*إجمالي الاستحقاقات: ${formatValue(item.baseSalary + totalAdditions)}*\n\n`;
    message += `---------------------\n\n`;
    message += `*الاستقطاعات*\n`;
    if (item.delayDeductions > 0) message += `خصم التأخير: ${formatValue(item.delayDeductions)}\n`;
    if (item.absenceDeductions > 0) message += `خصم الغياب: ${formatValue(item.absenceDeductions)}\n`;
    if (item.salaryAdvanceDeductions > 0) message += `سلف جزئية: ${formatValue(item.salaryAdvanceDeductions)}\n`;
    item.fixedDeductions.forEach(ded => ded.amount > 0 && (message += `${ded.name}: ${formatValue(ded.amount)}\n`));
    message += `*إجمالي الاستقطاعات: ${formatValue(totalDeductions)}*\n\n`;
    message += `---------------------\n\n`;
    message += `💰 *صافي الراتب المستحق: ${formatValue(netSalary)}*\n\n`;
    message += `\n---\n_تم إنشاؤه بواسطة نظام ${settings?.companyName || 'Hضورى'}_`;
    return message;
  }

  const handleShareWhatsApp = (item: PayrollItem) => {
    const message = generateShareMessage(item);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'));
  const formatCurrency = (amount: number) => (isClient ? amount.toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount);
  const isLoading = isEmployeesLoading || isAttendanceLoading || isTransactionsLoading || isSettingsLoading || isRequestsLoading || isPaidLoading;
  
  const payslipRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => payslipRef.current });
  const [selectedPayslip, setSelectedPayslip] = useState<{item: PayrollItem, payable: number} | null>(null);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">الرواتب الشهرية</h2>
      <Card>
        <CardHeader>
          <CardTitle>حساب الرواتب</CardTitle>
           <div className="flex flex-wrap gap-4 items-end pt-4">
            <div className="space-y-2 flex-grow">
              <label className="text-sm font-medium">اختر الشهر</label>
              <Select dir="rtl" value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(month => (
                    <SelectItem key={month} value={month}>
                      {new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse mb-2">
                <Checkbox 
                    id="ignore-delay" 
                    checked={ignoreDelayDeductions} 
                    onCheckedChange={(v) => setIgnoreDelayDeductions(v as boolean)} 
                />
                <Label htmlFor="ignore-delay" className="text-sm font-medium cursor-pointer">تجاهل خصومات التأخير</Label>
            </div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="flex-grow md:flex-grow-0">
              {isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />}
              {payrollData.length > 0 ? 'إعادة حساب الرواتب' : 'حساب رواتب الشهر'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="text-right">اسم الموظف</TableHead>
                    <TableHead className="text-right">أيام العمل</TableHead>
                    <TableHead className="text-left">الراتب الأساسي</TableHead>
                    <TableHead className="text-left">الإضافات</TableHead>
                    <TableHead className="text-left">الخصومات</TableHead>
                    <TableHead className="font-bold text-primary text-left">المبلغ المستحق</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {isLoading && !isCalculating ? (
                    Array.from({length: 3}).map((_, i) => <TableRow key={`loading-row-${i}`}><TableCell colSpan={7}><Skeleton className="h-10 w-full"/></TableCell></TableRow>)
                ) : payrollData.length > 0 ? (
                    payrollData.map((item) => {
                        const { netSalary, totalAdditions, totalDeductions } = calculateDisplayValues(item);
                        return (
                            <TableRow key={item.employeeId}>
                                <TableCell className="text-right font-medium">{item.employeeName}</TableCell>
                                <TableCell className="text-right">
                                    <div className='flex items-center gap-1 justify-end'>
                                        <CalendarDays className='h-3 w-3 text-muted-foreground'/>
                                        {item.workDaysPerMonth} يوم
                                    </div>
                                </TableCell>
                                <TableCell className="text-left font-mono">{formatCurrency(item.baseSalary)} ج.م</TableCell>
                                <TableCell className="text-green-600 text-left font-mono">{formatCurrency(totalAdditions)} ج.م</TableCell>
                                <TableCell className="text-destructive text-left font-mono">{formatCurrency(totalDeductions)} ج.م</TableCell>
                                <TableCell className="font-bold text-primary text-left font-mono">{formatCurrency(netSalary)} ج.م</TableCell>
                                <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedPayslip({ item, payable: netSalary })}>
                                            <Printer className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenShareDialog(item)}>
                                            <Share2 className="h-4 w-4 text-green-600" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    })
                ) : (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center">لا توجد بيانات للعرض.</TableCell></TableRow>
                )}
                </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-4">
            {isLoading && !isCalculating ? (
                Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full"/></CardContent></Card>)
            ) : payrollData.map(item => {
                const { netSalary, totalAdditions, totalDeductions } = calculateDisplayValues(item);
                return (
                    <Card key={item.employeeId}>
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-base flex justify-between">
                                <span>{item.employeeName}</span>
                                <Badge variant={item.paid ? "secondary" : "outline"}>{item.paid ? "تم الدفع" : "مستحق"}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-2 text-sm">
                            <div className="flex justify-between"><span>أيام العمل:</span><span>{item.workDaysPerMonth} يوم</span></div>
                            <div className="flex justify-between"><span>الأساسي:</span><span className="font-mono">{formatCurrency(item.baseSalary)}</span></div>
                            <div className="flex justify-between text-green-600"><span>الإضافات:</span><span className="font-mono">+{formatCurrency(totalAdditions)}</span></div>
                            <div className="flex justify-between text-destructive"><span>الخصومات:</span><span className="font-mono">-{formatCurrency(totalDeductions)}</span></div>
                            <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>الصافي:</span><span className="text-primary font-mono">{formatCurrency(netSalary)} ج.م</span></div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="outline" size="sm" onClick={() => handleOpenShareDialog(item)}>
                                    <Share2 className="ml-2 h-4 w-4" /> مشاركة
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setSelectedPayslip({ item, payable: netSalary })}>
                                    <Eye className="ml-2 h-4 w-4" /> معاينة
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
          </div>
        </CardContent>
        {payrollData.length > 0 && (
          <CardFooter className="flex justify-end">
             <Button size="lg" onClick={handlePayAll} disabled={payrollData.every(p => p.paid)}>
               <Send className="ml-2 h-4 w-4"/>
               نشر ودفع كل الرواتب
            </Button>
          </CardFooter>
        )}
      </Card>
      
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-4xl p-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>معاينة قسيمة الراتب</DialogTitle>
                </DialogHeader>
                {selectedPayslip && (
                    <>
                        <div ref={payslipRef}>
                           <Payslip item={selectedPayslip.item} month={selectedMonth} payable={selectedPayslip.payable} companyName={settings?.companyName} formatCurrency={formatCurrency} />
                        </div>
                        <div className="p-4 border-t flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSelectedPayslip(null)}>إغلاق</Button>
                            <Button onClick={handlePrint}><Printer className="ml-2 h-4 w-4"/>طباعة</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>

       <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>مشاركة ملخص الراتب</DialogTitle></DialogHeader>
                {sharingItem && (
                    <div className="p-4 my-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap" dir="rtl">
                       {generateShareMessage(sharingItem)}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>إلغاء</Button>
                    <Button onClick={() => { if (sharingItem) handleShareWhatsApp(sharingItem); setIsShareDialogOpen(false); }}>
                        <Share2 className="ml-2 h-4 w-4"/>مشاركة الآن
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}