'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, Send, Printer, Loader2, Eye, Info, ListChecks, DollarSign, User, FileSpreadsheet, Zap, ArrowDownCircle, ArrowUpCircle, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, get, update, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInDays } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  status?: 'present' | 'absent' | 'weekly_off' | 'on_leave';
  delayAction?: 'none' | 'forgiven';
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
}

interface FinancialTransaction {
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    date: string;
}

interface GlobalSettings {
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    workStartTime?: string;
    workEndTime?: string;
    companyName?: string;
    overtimeRate?: number;
}

interface DeductionRule {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface DailyBreakdown {
    date: string;
    status: 'present' | 'absent' | 'off' | 'leave' | 'covered';
    delayMinutes: number;
    delayDeduction: number;
    earlyLeaveMinutes: number;
    earlyLeaveDeduction: number;
    overtimeMinutes: number;
    absenceDeduction: number;
    workHours: number;
    note: string;
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number; 
    proRatedSalary: number; 
    workDaysPerMonth: number;
    presentDaysCount: number;
    absentDaysCount: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    totalEarlyLeaveMinutes: number;
    earlyLeaveDeductions: number;
    totalOvertimeMinutes: number;
    overtimeEarnings: number;
    absenceDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    paid: boolean;
    netSalary: number;
    totalDeductionsValue: number;
    dailyBreakdown: DailyBreakdown[];
    netOffsetMinutes: number; // The balance after offsetting OT vs Delay
}

// ---------------- Payslip Component ----------------

function PayslipContent({ item, fromDate, toDate, companyName, formatCurrency }: { item: PayrollItem, fromDate: string, toDate: string, companyName?: string, formatCurrency: (v: number) => string }) {
    return (
        <div className="p-8 bg-white text-black font-sans text-sm print:p-10" dir="rtl" style={{ WebkitPrintColorAdjust: 'exact' } as any}>
            <div className="flex justify-between items-center border-b-4 border-primary pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary">{companyName || "نظام إدارة الموارد البشرية"}</h1>
                    <p className="text-lg text-muted-foreground mt-1">كشف تفصيلي لمستحقات الراتب</p>
                </div>
                <div className="text-left bg-muted/30 p-3 rounded-md border">
                    <p className="font-bold">الفترة الزمنية:</p>
                    <p dir="ltr" className="font-mono text-sm">{fromDate} - {toDate}</p>
                    <p className="text-[10px] mt-2 text-muted-foreground">صدر في: {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                    <h3 className="font-bold border-b pb-2 text-primary">بيانات الموظف</h3>
                    <p className="flex justify-between"><span>الاسم:</span> <span className="font-bold">{item.employeeName}</span></p>
                    <p className="flex justify-between"><span>كود الموظف:</span> <span className="font-mono">{item.employeeCode}</span></p>
                    <p className="flex justify-between"><span>أيام الحضور الفعلي:</span> <span>{item.presentDaysCount} يوم</span></p>
                    <p className="flex justify-between"><span>أيام الغياب الصافي:</span> <span className={item.absentDaysCount > 0 ? "text-destructive font-bold" : ""}>{item.absentDaysCount} يوم</span></p>
                </div>
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                    <h3 className="font-bold border-b pb-2 text-primary">الراتب والأساسيات</h3>
                    <p className="flex justify-between"><span>الراتب الشهري الثابت:</span> <span className="font-mono">{formatCurrency(item.baseSalary)} ج.م</span></p>
                    <p className="flex justify-between"><span>قيمة اليوم الواحد:</span> <span className="font-mono">{formatCurrency(item.baseSalary / item.workDaysPerMonth)} ج.م</span></p>
                    <p className="flex justify-between"><span>أيام الشهر المحسوبة:</span> <span>{item.workDaysPerMonth} يوم</span></p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b-2 border-green-600 pb-2">
                        <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                        <h3 className="font-bold text-green-700 text-lg">الاستحقاقات والإضافات (+)</h3>
                    </div>
                    <div className="space-y-2 px-2">
                        <div className="flex justify-between border-b border-dashed pb-1"><span>راتب الفترة (المحقق):</span><span className="font-mono font-bold">{formatCurrency(item.proRatedSalary)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>المكافآت الإدارية:</span><span className="font-mono text-green-600">+{formatCurrency(item.bonus)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1">
                            <span>إضافات الوقت الإضافي (الصافي):</span>
                            <span className="font-mono text-green-600">+{formatCurrency(item.overtimeEarnings)}</span>
                        </div>
                        <div className="pt-4 flex justify-between font-black text-green-700 border-t-2 border-green-200">
                            <span>إجمالي الاستحقاق:</span>
                            <span className="font-mono">{formatCurrency(item.proRatedSalary + item.bonus + item.overtimeEarnings)} ج.م</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b-2 border-orange-600 pb-2">
                        <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                        <h3 className="font-bold text-orange-700 text-lg">الاستقطاعات والخصومات (-)</h3>
                    </div>
                    <div className="space-y-2 px-2">
                        <div className="flex justify-between border-b border-dashed pb-1">
                            <span>خصم تأخيرات (بعد موازنة الإضافي):</span>
                            <span className="font-mono">{item.delayDeductions > 0 ? `-${formatCurrency(item.delayDeductions)}` : '0.00'}</span>
                        </div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>خصم انصراف مبكر:</span><span className="font-mono">-{formatCurrency(item.earlyLeaveDeductions)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>خصم أيام الغياب:</span><span className="font-mono text-destructive">-{formatCurrency(item.absenceDeductions)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>جزاءات إدارية:</span><span className="font-mono">-{formatCurrency(item.penalty)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>سلف ومسحوبات سابقة:</span><span className="font-mono">-{formatCurrency(item.loanDeduction + item.salaryAdvanceDeductions)}</span></div>
                        <div className="pt-4 flex justify-between font-black text-orange-700 border-t-2 border-orange-200">
                            <span>إجمالي الاستقطاع:</span>
                            <span className="font-mono">{formatCurrency(item.totalDeductionsValue)} ج.م</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-12 p-6 bg-primary/5 border-4 border-double border-primary rounded-2xl flex flex-col md:flex-row justify-between items-center shadow-inner gap-4">
                <div>
                    <span className="text-xl md:text-2xl font-black text-primary text-center md:text-right">صافي الراتب المستحق للصرف:</span>
                    <p className="text-xs text-muted-foreground mt-1 text-center md:text-right">تمت مراجعة السجلات وتدقيق الأوقات وتطبيق موازنة التأخير بالوقت الإضافي المعتمد.</p>
                </div>
                <div className="text-center md:text-right">
                    <span className="text-3xl md:text-4xl font-black font-mono text-primary">{formatCurrency(item.netSalary)}</span>
                    <span className="text-xl font-bold mr-2 text-primary">ج.م</span>
                </div>
            </div>
        </div>
    );
}

// ---------------- Main Page ----------------

export default function PayrollPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const db = useDb();
  
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollItem | null>(null);
  const payslipRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ 
      content: () => payslipRef.current,
      documentTitle: `Payroll_${selectedPayslip?.employeeName}_${fromDate}`,
      removeAfterPrint: true 
  });

  useEffect(() => {
    setIsMounted(true);
    setIsClient(true);
    const now = new Date();
    setFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
    setToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
  }, []);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  

  const formatCurrency = (amount: number) => isClient ? (amount || 0).toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (amount || 0).toString();

  const handleCalculatePayroll = async () => {
    if (!db || !employeesData || !settings) {
        toast({ variant: "destructive", title: "بيانات ناقصة" });
        return;
    }
    
    setIsCalculating(true);
    try {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const periodDaysCount = differenceInDays(end, start) + 1;
        const daysInInterval = eachDayOfInterval({ start, end });

        const monthsNeeded = Array.from(new Set(daysInInterval.map(d => format(d, 'yyyy-MM'))));
        const attendanceSnapshots = await Promise.all(monthsNeeded.map(m => get(ref(db, `attendance/${m}`))));
        
        const allAttendance: AttendanceRecord[] = [];
        attendanceSnapshots.forEach(snap => {
            if (snap.exists()) {
                Object.values(snap.val() as Record<string, AttendanceRecord>).forEach(rec => {
                    if (rec.date && new Date(rec.date) >= start && new Date(rec.date) <= end) allAttendance.push(rec);
                });
            }
        });

        const [txSnap, reqSnap] = await Promise.all([get(ref(db, 'financial_transactions')), get(ref(db, 'employee_requests'))]);
        const allTransactions = txSnap.val() || {};
        const allRequests = reqSnap.val() || {};

        const results: PayrollItem[] = Object.entries(employeesData).map(([id, emp]) => {
            const dailyRate = (emp.salary || 0) / (emp.workDaysPerMonth || 30);
            const workHoursPerDay = settings.workStartTime && settings.workEndTime 
                ? (new Date(`1970-01-01T${settings.workEndTime}`).getTime() - new Date(`1970-01-01T${settings.workStartTime}`).getTime()) / (1000 * 60 * 60)
                : 8;
            const hourlyRate = dailyRate / (workHoursPerDay || 8);
            const minuteRate = hourlyRate / 60;
            const proRatedSalary = dailyRate * periodDaysCount;
            const empAtt = allAttendance.filter(a => a.employeeId === id);
            const breakdown: DailyBreakdown[] = [];
            const allowance = settings.lateAllowance || 0;
            const empDaysOff = emp.daysOff || [];

            const rulesRaw = settings.deductionRules;
            const deductionRules: DeductionRule[] = (Array.isArray(rulesRaw) ? (rulesRaw as DeductionRule[]) : (rulesRaw ? Object.values(rulesRaw as any) : []))
                .filter((r: any): r is DeductionRule => !!r && typeof (r as any).fromMinutes === 'number')
                .sort((a,b) => a.fromMinutes - b.fromMinutes);
            
            const earlyRulesRaw = settings.earlyLeaveDeductionRules;
            const earlyDeductionRules: DeductionRule[] = (Array.isArray(earlyRulesRaw) ? (earlyRulesRaw as DeductionRule[]) : (earlyRulesRaw ? Object.values(earlyRulesRaw as any) : []))
                .filter((r: any): r is DeductionRule => !!r && typeof (r as any).fromMinutes === 'number')
                .sort((a,b) => a.fromMinutes - b.fromMinutes);

            let periodDelayMinutes = 0;
            let periodOvertimeMinutes = 0;

            daysInInterval.forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const isOff = empDaysOff.includes(getDay(day).toString());
                const att = empAtt.find(a => a.date === dayStr);
                
                let dayDetail: DailyBreakdown = { date: dayStr, status: isOff ? 'off' : 'absent', delayMinutes: 0, delayDeduction: 0, earlyLeaveMinutes: 0, earlyLeaveDeduction: 0, overtimeMinutes: 0, absenceDeduction: 0, workHours: 0, note: isOff ? 'إجازة أسبوعية' : 'غياب' };

                const hasLeave = allRequests[id] && Object.values(allRequests[id]).some((r: any) => r.status === 'approved' && r.requestType.startsWith('leave') && day >= new Date(r.startDate) && day <= new Date(r.endDate));

                if (hasLeave) {
                    dayDetail.status = 'leave';
                    dayDetail.note = 'إجازة معتمدة';
                } else if (att && (att.checkIn || att.status === 'present')) {
                    dayDetail.status = 'present';
                    dayDetail.delayMinutes = att.delayMinutes || 0;
                    dayDetail.overtimeMinutes = (att.overtimeStatus === 'approved' ? (att.overtimeMinutes || 0) : 0);
                    dayDetail.note = isOff ? 'عمل في يوم إجازة' : 'حضور';

                    // Update Period Totals for Balancing
                    if (att.delayAction !== 'forgiven') {
                        periodDelayMinutes += dayDetail.delayMinutes;
                    }
                    periodOvertimeMinutes += dayDetail.overtimeMinutes;
                    
                    if (att.checkIn && att.checkOut) {
                        const actualDuration = new Date(att.checkOut).getTime() - new Date(att.checkIn).getTime();
                        dayDetail.workHours = (actualDuration / (1000 * 60 * 60)) + (dayDetail.overtimeMinutes / 60);
                    } else if (att.checkIn) {
                        dayDetail.workHours = (dayDetail.overtimeMinutes / 60);
                    }

                    if (att.checkOut) {
                        const officialOutStr = (emp.shiftConfiguration === 'custom' && emp.checkOutTime) || settings.workEndTime || '16:00';
                        const officialOutDate = new Date(`${dayStr}T${officialOutStr}:00`);
                        const actualOutDate = new Date(att.checkOut);
                        const isStrictlyNextDay = actualOutDate.getFullYear() > day.getFullYear() || actualOutDate.getMonth() > day.getMonth() || actualOutDate.getDate() > day.getDate();

                        if (actualOutDate.getTime() < officialOutDate.getTime() && !isStrictlyNextDay) {
                            const earlyMins = Math.floor((officialOutDate.getTime() - actualOutDate.getTime()) / 60000);
                            dayDetail.earlyLeaveMinutes = earlyMins;
                            let eRule = earlyDeductionRules.find(r => earlyMins >= r.fromMinutes && earlyMins <= r.toMinutes);
                            if (eRule) {
                                let eVal = 0;
                                if (eRule.deductionType === 'fixed_amount') eVal = eRule.deductionValue;
                                else if (eRule.deductionType === 'day_deduction') eVal = dailyRate * eRule.deductionValue;
                                else if (eRule.deductionType === 'hour_deduction') eVal = hourlyRate * eRule.deductionValue;
                                else if (eRule.deductionType === 'minute_deduction') eVal = minuteRate * eRule.deductionValue;
                                dayDetail.earlyLeaveDeduction = eVal;
                            }
                        }
                    }
                }
                breakdown.push(dayDetail);
            });

            // Days Off Balancing
            const extraDaysIndices = breakdown.map((d, i) => d.status === 'present' && empDaysOff.includes(getDay(new Date(d.date)).toString()) ? i : -1).filter(i => i !== -1);
            const absentDaysIndices = breakdown.map((d, i) => d.status === 'absent' ? i : -1).filter(i => i !== -1);
            let extraUsed = 0;
            while (extraUsed < extraDaysIndices.length && absentDaysIndices.length > extraUsed) {
                const absIdx = absentDaysIndices[extraUsed];
                const extraIdx = extraDaysIndices[extraUsed];
                breakdown[absIdx].status = 'covered';
                breakdown[absIdx].note = `غياب مغطى بعمل يوم ${breakdown[extraIdx].date}`;
                extraUsed++;
            }

            // --- NET OVERTIME & DELAY LOGIC (FLEXIBILITY) ---
            // Compensate Delay with OT
            const totalAllowanceMinutes = breakdown.filter(d => d.status === 'present' || d.status === 'covered').length * allowance;
            const netMinutes = periodOvertimeMinutes - Math.max(0, periodDelayMinutes - totalAllowanceMinutes);

            let delayDeductions = 0;
            let overtimeEarnings = 0;

            if (netMinutes < 0) {
                const absoluteDelayRemaining = Math.abs(netMinutes);
                let rule = deductionRules.find(r => absoluteDelayRemaining >= r.fromMinutes && absoluteDelayRemaining <= r.toMinutes);
                if (!rule && deductionRules.length > 0 && absoluteDelayRemaining > (deductionRules[deductionRules.length-1].toMinutes)) {
                    rule = deductionRules[deductionRules.length-1];
                }
                if (rule && !emp.disableDeductions) {
                    if (rule.deductionType === 'fixed_amount') delayDeductions = rule.deductionValue;
                    else if (rule.deductionType === 'day_deduction') delayDeductions = dailyRate * rule.deductionValue;
                    else if (rule.deductionType === 'hour_deduction') delayDeductions = hourlyRate * rule.deductionValue;
                    else if (rule.deductionType === 'minute_deduction') delayDeductions = minuteRate * rule.deductionValue;
                }
            } else if (netMinutes > 0) {
                overtimeEarnings = (netMinutes / 60) * hourlyRate * (settings.overtimeRate || 1.5);
            }

            const finalPresentDays = breakdown.filter(d => d.status === 'present' || d.status === 'covered').length;
            const finalAbsentDays = breakdown.filter(d => d.status === 'absent').length;
            const totalEarlyLeaveDeduction = breakdown.reduce((acc, d) => acc + d.earlyLeaveDeduction, 0);
            const totalAbsenceDeductions = finalAbsentDays * dailyRate;

            let bonus = 0, penalty = 0, loan = 0, advance = 0;
            if (allTransactions[id]) {
                Object.values(allTransactions[id]).forEach((monthTxs: any) => {
                    Object.values(monthTxs).forEach((tx: any) => {
                        const d = new Date(tx.date);
                        if (d >= start && d <= end) {
                            if (tx.type === 'bonus') bonus += tx.amount;
                            if (tx.type === 'penalty') penalty += tx.amount;
                            if (tx.type === 'loan') loan += tx.amount;
                            if (tx.type === 'salary_advance') advance += tx.amount;
                        }
                    });
                });
            }

            const totalDeductionsValue = delayDeductions + totalEarlyLeaveDeduction + penalty + loan + advance + totalAbsenceDeductions;
            const netSalary = proRatedSalary + bonus + overtimeEarnings - totalDeductionsValue;

            return { 
                employeeId: id, 
                employeeName: emp.employeeName, 
                employeeCode: emp.employeeCode, 
                baseSalary: emp.salary, 
                proRatedSalary, 
                workDaysPerMonth: emp.workDaysPerMonth || 30, 
                presentDaysCount: finalPresentDays, 
                absentDaysCount: finalAbsentDays, 
                totalDelayMinutes: periodDelayMinutes, 
                delayDeductions: delayDeductions, 
                totalEarlyLeaveMinutes: breakdown.reduce((acc,d) => acc + d.earlyLeaveMinutes, 0), 
                earlyLeaveDeductions: totalEarlyLeaveDeduction, 
                totalOvertimeMinutes: periodOvertimeMinutes, 
                overtimeEarnings: overtimeEarnings,
                absenceDeductions: totalAbsenceDeductions, 
                bonus, 
                penalty, 
                loanDeduction: loan, 
                salaryAdvanceDeductions: advance, 
                paid: false, 
                netSalary, 
                totalDeductionsValue, 
                dailyBreakdown: breakdown,
                netOffsetMinutes: netMinutes
            };
        });

        setPayrollData(results);
        toast({ title: 'تم الحساب بنجاح مع تطبيق موازنة الإضافي' });
    } catch (e) { console.error(e); toast({ variant: "destructive", title: "فشل الحساب" }); }
    finally { setIsCalculating(false); }
  };

  const handlePay = async (item: PayrollItem) => {
      if (!db) return;
      const batchId = format(new Date(), 'yyyyMMdd_HHmm');
      await set(ref(db, `payroll_history/${batchId}/${item.employeeId}`), { ...item, paid: true, fromDate, toDate });
      setPayrollData(prev => prev.map(p => p.employeeId === item.employeeId ? { ...p, paid: true } : p));
      toast({ title: `تم دفع راتب ${item.employeeName}` });
  };
  
  const handleExportToExcel = () => {
    const data = payrollData.map(item => ({ 
        'الموظف': item.employeeName, 
        'كود الموظف': item.employeeCode, 
        'الحضور': item.presentDaysCount, 
        'الغياب': item.absentDaysCount, 
        'راتب الفترة': item.proRatedSalary, 
        'مكافآت': item.bonus, 
        'إضافي مستحق': item.overtimeEarnings,
        'خصم التأخير': item.delayDeductions, 
        'خصم الغياب': item.absenceDeductions, 
        'الصافي': item.netSalary 
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الرواتب');
    XLSX.writeFile(wb, `payroll_${fromDate}_to_${toDate}.xlsx`);
  };

  const isLoading = isEmployeesLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold font-headline text-primary">الرواتب الشهرية والتعويضات</h2>
          {payrollData.length > 0 && <Button variant="outline" size="sm" onClick={handleExportToExcel} className="w-full md:w-auto"><FileSpreadsheet className="ml-2 h-4 w-4" />تصدير Excel</Button>}
      </div>

      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
                <Label className="text-xs">من تاريخ</Label>
                <Input type="date" value={isMounted ? fromDate : ''} onChange={e => setFromDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">إلى تاريخ</Label>
                <Input type="date" value={isMounted ? toDate : ''} onChange={e => setToDate(e.target.value)} className="h-10" />
            </div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="h-10">
                {isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />} 
                تحديث وحساب الرواتب
            </Button>
          </div>
          <Alert className="mt-4 bg-primary/5 border-primary/20">
              <Zap className="h-4 w-4 text-primary" />
              <AlertDescription className="text-[11px] leading-relaxed">
                  <b>نظام الموازنة الذكي فعال:</b> يتم تعويض دقائق التأخير تلقائياً من رصيد الوقت الإضافي المعتمد قبل احتساب أي خصم مالي. أي رصيد إضافي متبقي يُصرف كمستحقات مالية.
              </AlertDescription>
          </Alert>
        </CardHeader>

        <CardContent className="p-0 md:p-6">
          {/* Desktop Table View */}
          <div className="hidden md:block w-full overflow-x-auto">
            <Table className="whitespace-nowrap min-w-[1000px]">
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-right">الموظف</TableHead>
                        <TableHead className="text-right">الموازنة (د)</TableHead>
                        <TableHead className="text-left text-green-600">إضافي صافي (+)</TableHead>
                        <TableHead className="text-left text-orange-600">إجمالي الخصم (-)</TableHead>
                        <TableHead className="font-bold text-primary text-left">الصافي النهائي</TableHead>
                        <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {isCalculating ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : payrollData.map((item) => (
                        <TableRow key={item.employeeId}>
                            <TableCell className="text-right py-3">
                                <div className="font-bold text-sm">{item.employeeName}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{item.employeeCode} | {item.presentDaysCount} يوم حضور</div>
                            </TableCell>
                            <TableCell className="text-right py-3">
                                <div className="flex items-center gap-2 justify-end">
                                    <span className={cn("font-mono text-xs font-bold", item.netOffsetMinutes >= 0 ? "text-green-600" : "text-orange-600")}>
                                        {item.netOffsetMinutes > 0 ? `+${item.netOffsetMinutes}` : item.netOffsetMinutes} د
                                    </span>
                                    {item.netOffsetMinutes >= 0 ? <ArrowUpCircle className="h-3 w-3 text-green-500" /> : <ArrowDownCircle className="h-3 w-3 text-orange-500" />}
                                </div>
                            </TableCell>
                            <TableCell className="text-green-600 text-left font-mono text-xs font-bold">+{formatCurrency(item.overtimeEarnings + item.bonus)}</TableCell>
                            <TableCell className="text-orange-600 text-left font-mono text-xs">-{formatCurrency(item.totalDeductionsValue)}</TableCell>
                            <TableCell className="font-black text-primary text-left font-mono text-base">{formatCurrency(item.netSalary)}</TableCell>
                            <TableCell className="text-center py-3">
                                <div className="flex justify-center gap-1">
                                    <Button variant="outline" size="icon" onClick={() => setSelectedPayslip(item)} title="عرض التفاصيل"><Eye className="h-4 w-4 text-primary" /></Button>
                                    {item.paid ? <Badge variant="secondary">مدفوع</Badge> : <Button size="sm" onClick={() => handlePay(item)}>صرف</Button>}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 p-4">
              {isCalculating ? (
                  Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
              ) : payrollData.map((item) => (
                  <Card key={item.employeeId} className="overflow-hidden border-2">
                      <div className="bg-muted/30 p-4 border-b flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-base">{item.employeeName}</h4>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.employeeCode}</p>
                          </div>
                          <Badge variant={item.paid ? "secondary" : "outline"} className="text-[10px]">
                              {item.paid ? "تم الصرف" : "قيد الصرف"}
                          </Badge>
                      </div>
                      <CardContent className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                               <div className="p-2 bg-slate-50 rounded border text-center">
                                  <p className="text-muted-foreground mb-1">الموازنة (د)</p>
                                  <div className={cn("font-bold font-mono text-sm", item.netOffsetMinutes >= 0 ? "text-green-600" : "text-orange-600")}>
                                      {item.netOffsetMinutes > 0 ? `+${item.netOffsetMinutes}` : item.netOffsetMinutes}
                                  </div>
                              </div>
                               <div className="p-2 bg-green-50 rounded border border-green-100 text-center">
                                  <p className="text-green-700 mb-1">إضافي (+)</p>
                                  <div className="font-bold font-mono text-sm text-green-700">+{formatCurrency(item.overtimeEarnings + item.bonus)}</div>
                              </div>
                               <div className="p-2 bg-orange-50 rounded border border-orange-100 text-center">
                                  <p className="text-orange-700 mb-1">خصومات (-)</p>
                                  <div className="font-bold font-mono text-sm text-orange-700">-{formatCurrency(item.totalDeductionsValue)}</div>
                              </div>
                               <div className="p-2 bg-primary/5 rounded border border-primary/20 text-center">
                                  <p className="text-primary mb-1 font-bold">الصافي</p>
                                  <div className="font-black font-mono text-sm text-primary">{formatCurrency(item.netSalary)}</div>
                              </div>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" className="flex-1 text-xs h-9" onClick={() => setSelectedPayslip(item)}>
                                  <Eye className="ml-1 h-3 w-3" /> التفاصيل
                              </Button>
                              {!item.paid && (
                                  <Button className="flex-1 text-xs h-9" onClick={() => handlePay(item)}>
                                      <DollarSign className="ml-1 h-3 w-3" /> صرف الراتب
                                  </Button>
                              )}
                          </div>
                      </CardContent>
                  </Card>
              ))}
          </div>
        </CardContent>
      </Card>
      
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-5xl p-0 h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="p-4 border-b bg-muted/20 flex-shrink-0">
                    <DialogTitle className="text-right">تفاصيل استحقاقات {selectedPayslip?.employeeName}</DialogTitle>
                </DialogHeader>
                {selectedPayslip && (
                    <Tabs defaultValue="breakdown" className="flex-grow flex flex-col overflow-hidden">
                        <TabsList className="mx-4 mt-2 h-11">
                            <TabsTrigger value="breakdown" className="flex-1"><ListChecks className="h-4 w-4 ml-1"/> السجل اليومي</TabsTrigger>
                            <TabsTrigger value="payslip" className="flex-1"><FileText className="h-4 w-4 ml-1"/> قسيمة الراتب</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="breakdown" className="flex-grow overflow-hidden flex flex-col p-4">
                            <div className="w-full overflow-auto border rounded-lg bg-card shadow-sm">
                                <Table className="whitespace-nowrap min-w-[800px]">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">الحالة</TableHead>
                                            <TableHead className="text-left">ساعات العمل</TableHead>
                                            <TableHead className="text-left text-green-600">إضافي معتمد</TableHead>
                                            <TableHead className="text-left text-orange-600">تأخير (د)</TableHead>
                                            <TableHead className="text-right">ملاحظة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedPayslip.dailyBreakdown.map((day, idx) => (
                                            <TableRow key={idx} className={cn(day.status === 'absent' && 'bg-orange-50/50')}>
                                                <TableCell className="text-right font-mono text-xs">{day.date}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant={day.status === 'present' ? 'secondary' : day.status === 'absent' ? 'destructive' : 'default'} className="text-[10px]">
                                                        {day.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-left font-mono font-bold text-primary text-xs">{day.workHours.toFixed(2)} س</TableCell>
                                                <TableCell className="text-left text-green-600 font-bold text-xs">+{day.overtimeMinutes} د</TableCell>
                                                <TableCell className={cn("text-left font-mono text-xs", day.delayMinutes > 0 ? "text-orange-600" : "text-muted-foreground")}>{day.delayMinutes} د</TableCell>
                                                <TableCell className="text-right text-[10px] text-muted-foreground max-w-[150px] truncate">{day.note}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                        
                        <TabsContent value="payslip" className="flex-grow overflow-auto p-4 bg-slate-100/50">
                            <div className="max-w-4xl mx-auto shadow-2xl rounded-xl overflow-hidden">
                                <div ref={payslipRef} className="bg-white">
                                    <PayslipContent item={selectedPayslip} fromDate={fromDate} toDate={toDate} companyName={settings?.companyName} formatCurrency={formatCurrency} />
                                </div>
                            </div>
                            <div className="p-4 border-t flex justify-end gap-2 bg-background sticky bottom-0 z-10">
                                <Button onClick={handlePrint} className="w-full md:w-auto"><Printer className="ml-2 h-5 w-5"/>طباعة / حفظ PDF</Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    </div>
  );
}
