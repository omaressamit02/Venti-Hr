
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, Send, Printer, Loader2, Share2, Eye, CalendarDays, UserCheck, Wallet, FileSpreadsheet, DollarSign, MinusCircle, PlusCircle, User, Info, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, get, update, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInDays, parseISO } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
    workStartTime?: string;
    workEndTime?: string;
    companyName?: string;
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
    status: 'present' | 'absent' | 'off' | 'leave';
    delayMinutes: number;
    delayDeduction: number;
    appliedRuleInfo?: string;
    absenceDeduction: number;
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
    absenceDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    paid: boolean;
    netSalary: number;
    totalDeductionsValue: number;
    dailyBreakdown: DailyBreakdown[];
}

// ---------------- Payslip Component ----------------

function PayslipContent({ item, fromDate, toDate, companyName, formatCurrency }: { item: PayrollItem, fromDate: string, toDate: string, companyName?: string, formatCurrency: (v: number) => string }) {
    return (
        <div className="p-8 bg-white text-black font-sans text-sm" dir="rtl">
            <div className="flex justify-between items-center border-b-2 pb-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">{companyName || "نظام حضوري"}</h1>
                    <p className="text-muted-foreground">كشف راتب الفترة المخصصة</p>
                </div>
                <div className="text-left text-xs">
                    <p>الفترة: من {fromDate} إلى {toDate}</p>
                    <p>تاريخ الإصدار: {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-8 mb-8 bg-muted/20 p-4 rounded-lg">
                <div className="space-y-1">
                    <p><span className="font-bold">الموظف:</span> {item.employeeName}</p>
                    <p><span className="font-bold">الكود:</span> {item.employeeCode}</p>
                </div>
                <div className="space-y-1">
                    <p><span className="font-bold">الراتب الأساسي:</span> {formatCurrency(item.baseSalary)} ج.م</p>
                    <p><span className="font-bold">الحضور:</span> {item.presentDaysCount} يوم</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-12">
                <div className="space-y-3">
                    <h3 className="font-bold border-b pb-1 text-green-700">الاستحقاقات (+)</h3>
                    <div className="flex justify-between"><span>راتب الفترة المكتسب:</span><span>{formatCurrency(item.proRatedSalary)}</span></div>
                    <div className="flex justify-between"><span>المكافآت:</span><span>{formatCurrency(item.bonus)}</span></div>
                    <div className="border-t pt-2 flex justify-between font-bold"><span>إجمالي الاستحقاقات:</span><span>{formatCurrency(item.proRatedSalary + item.bonus)}</span></div>
                </div>
                <div className="space-y-3">
                    <h3 className="font-bold border-b pb-1 text-orange-600">الاستقطاعات (-)</h3>
                    <div className="flex justify-between"><span>خصم التأخير اليومي:</span><span>{formatCurrency(item.delayDeductions)}</span></div>
                    <div className="flex justify-between"><span>خصم الغياب:</span><span>{formatCurrency(item.absenceDeductions)}</span></div>
                    <div className="flex justify-between"><span>الجزاءات:</span><span>{formatCurrency(item.penalty)}</span></div>
                    <div className="flex justify-between"><span>سلف / سحب جزئي:</span><span>{formatCurrency(item.loanDeduction + item.salaryAdvanceDeductions)}</span></div>
                    <div className="border-t pt-2 flex justify-between font-bold text-orange-600"><span>إجمالي الاستقطاعات:</span><span>{formatCurrency(item.totalDeductionsValue)}</span></div>
                </div>
            </div>
            <div className="mt-12 p-4 bg-primary/10 border-2 border-primary rounded-xl flex justify-between items-center">
                <span className="text-xl font-bold">صافي الراتب المستحق:</span>
                <span className="text-2xl font-bold font-mono">{formatCurrency(item.netSalary)} ج.م</span>
            </div>
        </div>
    );
}

// ---------------- Main Page ----------------

export default function PayrollPage() {
  const [fromDate, setFromDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const db = useDb();
  
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollItem | null>(null);
  const payslipRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => payslipRef.current });

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  useEffect(() => { setIsClient(true); }, []);

  const formatCurrency = (amount: number) => isClient ? (amount || 0).toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount.toString();

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
        const attendancePromises = monthsNeeded.map(m => get(ref(db, `attendance/${m}`)));
        const attendanceSnapshots = await Promise.all(attendancePromises);
        
        const allAttendance: AttendanceRecord[] = [];
        attendanceSnapshots.forEach(snap => {
            if (snap.exists()) {
                Object.values(snap.val() as Record<string, AttendanceRecord>).forEach(rec => {
                    if (!rec.date) return;
                    const d = new Date(rec.date);
                    if (d >= start && d <= end) allAttendance.push(rec);
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
            const presentDates = new Set(empAtt.filter(a => a.status === 'present' || (!a.status && a.checkIn)).map(a => a.date));
            
            const breakdown: DailyBreakdown[] = [];
            let totalAbsentDays = 0;
            let totalDelayDeductionForPeriod = 0;
            let totalDelayMinutesForPeriod = 0;
            const allowance = settings.lateAllowance || 0;
            const empDaysOff = emp.daysOff || ['5'];

            const rulesRaw = settings.deductionRules;
            const deductionRules: DeductionRule[] = (Array.isArray(rulesRaw) ? rulesRaw : Object.values(rulesRaw || {}))
                .filter((r): r is DeductionRule => r && typeof r.fromMinutes === 'number')
                .sort((a,b) => a.fromMinutes - b.fromMinutes);

            daysInInterval.forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const isOff = empDaysOff.includes(getDay(day).toString());
                const att = empAtt.find(a => a.date === dayStr);
                
                let dayDetail: DailyBreakdown = {
                    date: dayStr,
                    status: isOff ? 'off' : 'absent',
                    delayMinutes: 0,
                    delayDeduction: 0,
                    absenceDeduction: 0,
                    note: isOff ? 'إجازة أسبوعية' : 'غياب'
                };

                if (isOff) {
                    if (att && att.checkIn) {
                        dayDetail.status = 'present';
                        dayDetail.note = 'عمل في يوم إجازة';
                    } else {
                        breakdown.push(dayDetail);
                        return;
                    }
                }

                const hasLeave = allRequests[id] && Object.values(allRequests[id]).some((r: any) => 
                    r.status === 'approved' && r.requestType.startsWith('leave') && 
                    day >= new Date(r.startDate) && day <= new Date(r.endDate)
                );

                if (hasLeave) {
                    dayDetail.status = 'leave';
                    dayDetail.note = 'إجازة معتمدة';
                    breakdown.push(dayDetail);
                    return;
                }

                if (att && (att.checkIn || att.status === 'present')) {
                    dayDetail.status = 'present';
                    dayDetail.delayMinutes = att.delayMinutes || 0;
                    dayDetail.note = 'حضور';
                    
                    if (!emp.disableDeductions && dayDetail.delayMinutes > allowance) {
                        const chargeableMinutes = dayDetail.delayMinutes - allowance;
                        totalDelayMinutesForPeriod += dayDetail.delayMinutes;
                        
                        let rule = deductionRules.find(r => chargeableMinutes >= r.fromMinutes && chargeableMinutes <= r.toMinutes);
                        if (!rule && deductionRules.length > 0 && chargeableMinutes > deductionRules[deductionRules.length - 1].toMinutes) {
                            rule = deductionRules[deductionRules.length - 1];
                        }

                        if (rule) {
                            let val = 0;
                            let ruleTypeLabel = "";
                            
                            // EXPLICIT CHECK: Ensure fixed_amount is direct value
                            if (rule.deductionType === 'fixed_amount') {
                                val = rule.deductionValue;
                                ruleTypeLabel = "ج.م ثابت";
                            } else if (rule.deductionType === 'day_deduction') {
                                val = dailyRate * rule.deductionValue;
                                ruleTypeLabel = "يوم";
                            } else if (rule.deductionType === 'hour_deduction') {
                                val = hourlyRate * rule.deductionValue;
                                ruleTypeLabel = "ساعة";
                            } else if (rule.deductionType === 'minute_deduction') {
                                val = minuteRate * rule.deductionValue;
                                ruleTypeLabel = "دقيقة";
                            }
                            dayDetail.delayDeduction = val;
                            dayDetail.appliedRuleInfo = `${rule.fromMinutes}-${rule.toMinutes} د (${rule.deductionValue} ${ruleTypeLabel}) = ${formatCurrency(val)}`;
                            totalDelayDeductionForPeriod += val;
                        }
                    }
                } else {
                    totalAbsentDays++;
                    dayDetail.absenceDeduction = dailyRate;
                }
                breakdown.push(dayDetail);
            });

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

            const totalAbsenceDeductions = totalAbsentDays * dailyRate;
            const totalDeductionsValue = totalDelayDeductionForPeriod + penalty + loan + advance + totalAbsenceDeductions;
            const netSalary = proRatedSalary + bonus - totalDeductionsValue;

            return {
                employeeId: id,
                employeeName: emp.employeeName,
                employeeCode: emp.employeeCode,
                baseSalary: emp.salary,
                proRatedSalary,
                workDaysPerMonth: emp.workDaysPerMonth || 30,
                presentDaysCount: presentDates.size,
                absentDaysCount: totalAbsentDays,
                totalDelayMinutes: totalDelayMinutesForPeriod,
                delayDeductions: totalDelayDeductionForPeriod,
                absenceDeductions: totalAbsenceDeductions,
                bonus,
                penalty,
                loanDeduction: loan,
                salaryAdvanceDeductions: advance,
                paid: false,
                netSalary,
                totalDeductionsValue,
                dailyBreakdown: breakdown
            };
        });

        setPayrollData(results);
        toast({ title: 'تم الحساب بنجاح' });
    } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "فشل الحساب" });
    } finally {
        setIsCalculating(false);
    }
  };

  const handlePay = async (item: PayrollItem) => {
      if (!db) return;
      const batchId = format(new Date(), 'yyyyMMdd_HHmm');
      await set(ref(db, `payroll_history/${batchId}/${item.employeeId}`), { ...item, paid: true, fromDate, toDate });
      setPayrollData(prev => prev.map(p => p.employeeId === item.employeeId ? { ...p, paid: true } : p));
      toast({ title: `تم دفع راتب ${item.employeeName}` });
  };
  
  const handlePayAll = async () => {
    if (!db || payrollData.length === 0) return;
    const batchId = format(new Date(), 'yyyyMMdd_HHmm');
    const updates: any = {};
    payrollData.forEach(item => { updates[`/payroll_history/${batchId}/${item.employeeId}`] = { ...item, paid: true, fromDate, toDate }; });
    await update(ref(db), updates);
    setPayrollData(prev => prev.map(p => ({ ...p, paid: true })));
    toast({ title: 'تم حفظ ودفع رواتب الفترة للجميع' });
  };

  const handleExportToExcel = () => {
    const data = payrollData.map(item => ({
      'الموظف': item.employeeName,
      'كود الموظف': item.employeeCode,
      'الحضور': item.presentDaysCount,
      'الغياب': item.absentDaysCount,
      'راتب الفترة': item.proRatedSalary,
      'مكافآت': item.bonus,
      'خصم التأخير': item.delayDeductions,
      'خصم الغياب': item.absenceDeductions,
      'جزاءات': item.penalty,
      'سلف': item.loanDeduction + item.salaryAdvanceDeductions,
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
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold font-headline text-primary">رواتب الفترة المخصصة</h2>
          {payrollData.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportToExcel}><FileSpreadsheet className="ml-2 h-4 w-4" />تصدير Excel</Button>
          )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تحديد فترة الحساب</CardTitle>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
            </div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating}>
              {isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />}
              حساب الرواتب
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">ح/غ</TableHead>
                    <TableHead className="text-left">استحقاق الفترة</TableHead>
                    <TableHead className="text-left">المكافآت</TableHead>
                    <TableHead className="text-left text-orange-600">خصم الغياب</TableHead>
                    <TableHead className="text-left text-orange-600">إجمالي الاستقطاعات</TableHead>
                    <TableHead className="font-bold text-primary text-left">الصافي</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {isLoading && !isCalculating ? (
                    Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-10 w-full"/></TableCell></TableRow>)
                ) : payrollData.length > 0 ? (
                    payrollData.map((item) => (
                        <TableRow key={item.employeeId}>
                            <TableCell className="text-right py-2">
                                <div className="font-medium">{item.employeeName}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{item.employeeCode}</div>
                            </TableCell>
                            <TableCell className="text-right py-2">
                                <div className="text-xs">{item.presentDaysCount} ح / <span className="text-destructive font-bold">{item.absentDaysCount} غ</span></div>
                            </TableCell>
                            <TableCell className="text-left font-mono text-xs">{formatCurrency(item.proRatedSalary)}</TableCell>
                            <TableCell className="text-green-600 text-left font-mono text-xs">+{formatCurrency(item.bonus)}</TableCell>
                            <TableCell className="text-orange-600 text-left font-mono text-xs font-bold">
                                -{formatCurrency(item.absenceDeductions)}
                            </TableCell>
                            <TableCell className="text-orange-600 dark:text-orange-400 text-left font-mono text-xs font-bold">
                                -{formatCurrency(item.totalDeductionsValue)}
                            </TableCell>
                            <TableCell className="font-bold text-primary text-left font-mono text-sm">{formatCurrency(item.netSalary)}</TableCell>
                            <TableCell className="text-center py-2">
                                <div className="flex items-center justify-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedPayslip(item)} title="معاينة التفاصيل"><Eye className="h-4 w-4 text-primary" /></Button>
                                    {item.paid ? (
                                        <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 ml-1"/> تم</Badge>
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => handlePay(item)}><DollarSign className="h-3 w-3 ml-1"/>دفع</Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))
                ) : (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">حدد الفترة واضغط حساب للبدء.</TableCell></TableRow>
                )}
                </TableBody>
            </Table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4 p-4">
            {isCalculating && Array.from({length: 2}).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-40 w-full"/></Card>)}
            {!isCalculating && payrollData.map(item => (
                <Card key={item.employeeId} className="border shadow-sm overflow-hidden">
                    <div className="bg-muted/30 p-3 border-b flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="bg-primary/10 p-2 rounded-full"><User className="h-4 w-4 text-primary" /></div>
                            <div>
                                <p className="font-bold text-sm">{item.employeeName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{item.employeeCode}</p>
                            </div>
                        </div>
                        <Badge variant={item.paid ? "secondary" : "outline"} className={item.paid ? "bg-green-100 text-green-800" : ""}>
                            {item.paid ? "مدفوع" : "مستحق"}
                        </Badge>
                    </div>
                    <CardContent className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1">
                                <p className="text-muted-foreground">استحقاق الفترة:</p>
                                <p className="font-mono font-semibold">{formatCurrency(item.proRatedSalary)} ج.م</p>
                            </div>
                            <div className="space-y-1 text-left">
                                <p className="text-muted-foreground">أيام العمل:</p>
                                <p className="font-semibold">{item.presentDaysCount} ح / <span className="text-destructive font-bold">{item.absentDaysCount} غ</span></p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-muted-foreground">خصم الغياب:</p>
                                <p className="text-orange-600 font-mono font-bold">-{formatCurrency(item.absenceDeductions)}</p>
                            </div>
                            <div className="space-y-1 text-left">
                                <p className="text-muted-foreground">إجمالي استقطاع:</p>
                                <p className="text-orange-600 font-mono font-bold">-{formatCurrency(item.totalDeductionsValue)}</p>
                            </div>
                        </div>
                        
                        <div className="pt-3 border-t flex justify-between items-center">
                            <span className="text-sm font-bold">صافي الراتب:</span>
                            <span className="text-lg font-bold text-primary font-mono">{formatCurrency(item.netSalary)} ج.م</span>
                        </div>
                        
                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setSelectedPayslip(item)}>
                                <Eye className="ml-2 h-4 w-4 text-primary"/>
                                تفاصيل
                            </Button>
                            {!item.paid ? (
                                <Button size="sm" className="flex-1 h-9" onClick={() => handlePay(item)}>
                                    <DollarSign className="ml-2 h-4 w-4"/>
                                    دفع
                                </Button>
                            ) : (
                                <Button variant="ghost" disabled size="sm" className="flex-1 h-9 text-green-600">
                                    <CheckCircle className="ml-2 h-4 w-4"/>
                                    تم
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
          </div>
        </CardContent>
        {payrollData.length > 0 && (
          <CardFooter className="flex justify-end p-4 border-t">
             <Button size="sm" onClick={handlePayAll} disabled={payrollData.every(p => p.paid)}>
               <Send className="ml-2 h-4 w-4"/>
               تثبيت ودفع رواتب الفترة للكل
            </Button>
          </CardFooter>
        )}
      </Card>
      
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden h-[90vh] flex flex-col">
                <DialogHeader className="p-4 border-b bg-muted/20 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        تفاصيل مستحقات {selectedPayslip?.employeeName}
                    </DialogTitle>
                    <DialogDescription>للفترة من {fromDate} إلى {toDate}</DialogDescription>
                </DialogHeader>
                {selectedPayslip && (
                    <Tabs defaultValue="breakdown" className="flex-grow flex flex-col overflow-hidden">
                        <TabsList className="mx-4 mt-2">
                            <TabsTrigger value="breakdown" className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4" />
                                سجل تفاصيل الفترة
                            </TabsTrigger>
                            <TabsTrigger value="payslip" className="flex items-center gap-2">
                                <Printer className="h-4 w-4" />
                                قسيمة الراتب
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="breakdown" className="flex-grow overflow-auto p-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-right">التاريخ</TableHead>
                                        <TableHead className="text-right">الحالة</TableHead>
                                        <TableHead className="text-left">تأخير (د)</TableHead>
                                        <TableHead className="text-left text-orange-600">خصم التأخير</TableHead>
                                        <TableHead className="text-right">الشريحة المطبقة</TableHead>
                                        <TableHead className="text-left text-orange-600">خصم غياب</TableHead>
                                        <TableHead className="text-right">ملاحظة</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedPayslip.dailyBreakdown.map((day, idx) => (
                                        <TableRow key={idx} className={cn(day.status === 'absent' && 'bg-orange-50 dark:bg-orange-950/20')}>
                                            <TableCell className="text-right font-mono text-xs">{day.date}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={
                                                    day.status === 'present' ? 'secondary' : 
                                                    day.status === 'absent' ? 'destructive' : 
                                                    day.status === 'leave' ? 'outline' : 'default'
                                                }>
                                                    {day.status === 'present' ? 'حاضر' : day.status === 'absent' ? 'غائب' : day.status === 'leave' ? 'إجازة' : 'عطلة'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={cn("text-left font-mono", day.delayMinutes > 0 && "text-destructive font-bold")}>
                                                {day.delayMinutes || '-'}
                                            </TableCell>
                                            <TableCell className="text-left text-orange-600 font-bold font-mono">
                                                {day.delayDeduction > 0 ? `-${formatCurrency(day.delayDeduction)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-[10px] font-medium">
                                                {day.appliedRuleInfo || '-'}
                                            </TableCell>
                                            <TableCell className="text-left text-orange-600 font-bold font-mono">
                                                {day.absenceDeduction > 0 ? `-${formatCurrency(day.absenceDeduction)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-[10px] text-muted-foreground">{day.note}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="mt-4 p-3 bg-muted rounded-lg text-xs space-y-1">
                                <p>• يتم تطبيق لوائح الخصم على تأخير كل يوم بشكل مستقل بعد خصم فترة السماح.</p>
                                <p>• يتم استخدام أيام العمل الشهرية الخاصة بالموظف (مثلاً {selectedPayslip.workDaysPerMonth} يوم) لحساب معدل الخصم اليومي.</p>
                                <p>• أيام الإجازات الأسبوعية والمعتمدة مستبعدة تماماً من حسابات الغياب والخصم.</p>
                            </div>
                        </TabsContent>

                        <TabsContent value="payslip" className="flex-grow overflow-auto">
                            <div ref={payslipRef} className="bg-white">
                               <PayslipContent item={selectedPayslip} fromDate={fromDate} toDate={toDate} companyName={settings?.companyName} formatCurrency={formatCurrency} />
                            </div>
                            <div className="p-4 border-t flex justify-end gap-2 bg-muted/10">
                                <Button size="sm" onClick={handlePrint}><Printer className="ml-2 h-4 w-4"/>طباعة القسيمة</Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    </div>
  );
}
