
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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, DollarSign, Send, FileSpreadsheet, Printer, Loader2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInHours } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { arEG } from 'date-fns/locale';


// ---------------- Interfaces ----------------

interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  dayOff?: string;
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
  status?: 'present' | 'absent';
}

interface FinancialTransaction {
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    installments?: number;
}

interface EmployeeRequest {
  requestType: "leave_full_day" | "leave_half_day" | "mission" | "permission";
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
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    totalEarlyLeaveMinutes: number;
    earlyLeaveDeductions: number;
    absenceDeductions: number;
    approvedLeaveDeductions: number;
    incompleteRecordDeductions: number;
    permissionDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    fixedDeductions: { name: string; amount: number }[];
    fixedAdditions: { name: string; amount: number }[];
    paid: boolean;
    locationName: string;
    appliedDelayRule?: string;
    appliedEarlyLeaveRule?: string;
}

interface PayslipProps {
    item: PayrollItem;
    month: string;
    payable: number;
    companyName?: string;
    formatCurrency: (amount: number) => string | number;
}

// ---------------- Payslip Component ----------------

export function Payslip({ item, month, payable, companyName, formatCurrency }: PayslipProps) {
    const totalAdditions = item.bonus + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
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
                    </div>
                </section>

                <section className="my-6">
                    <div className="grid grid-cols-2 gap-8">
                        {/* Earnings */}
                        <div>
                            <h2 className="text-lg font-bold mb-2 pb-1 border-b">الاستحقاقات</h2>
                            <div className="space-y-2">
                                <div className="flex justify-between"><span>الراتب الأساسي</span><span className="font-mono">{formatCurrency(item.baseSalary)}</span></div>
                                <div className="flex justify-between"><span>مكافآت</span><span className="font-mono">{formatCurrency(item.bonus)}</span></div>
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
                                <div className="flex justify-between"><span>خصم التأخير</span><span className="font-mono">{formatCurrency(item.delayDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم انصراف مبكر</span><span className="font-mono">{formatCurrency(item.earlyLeaveDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم الغياب</span><span className="font-mono">{formatCurrency(item.absenceDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم عدم الانصراف</span><span className="font-mono">{formatCurrency(item.incompleteRecordDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم الإذن</span><span className="font-mono">{formatCurrency(item.permissionDeductions)}</span></div>
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
                    </div>
                </section>

                <footer className="mt-8 pt-4 border-t-2 border-gray-200">
                    <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
                        <span className="text-xl font-bold">صافي الراتب المستحق</span>
                        <span className="text-2xl font-bold font-mono text-green-700">{formatCurrency(payable)} ج.م</span>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-8 text-center">
                        <div>
                            <p className="font-semibold">استلمت أنا /</p>
                            <p className="mt-12 border-b border-gray-400 border-dashed"> </p>
                            <p className="text-xs text-gray-500">توقيع الموظف</p>
                        </div>
                         <div>
                            <p className="font-semibold">يعتمد /</p>
                            <p className="mt-12 border-b border-gray-400 border-dashed"> </p>
                             <p className="text-xs text-gray-500">ختم وتوقيع المدير المسؤول</p>
                        </div>
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

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

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

  // --- Main Calculation Logic ---
  const handleCalculatePayroll = () => {
    setIsCalculating(true);
    if (!employeesData || !settings) {
        toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "بيانات الموظفين أو الإعدادات غير متاحة." });
        setIsCalculating(false);
        return;
    }
    
    const monthDate = new Date(selectedMonth + "-02T00:00:00");
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const newPayrollData: PayrollItem[] = Object.values(employeesData).map(employee => {
        
        const dailyRate = employee.salary / 30;
        const workHoursPerDay = settings.workStartTime && settings.workEndTime 
            ? differenceInHours(new Date(`1970-01-01T${settings.workEndTime}`), new Date(`1970-01-01T${settings.workStartTime}`))
            : 8;
        const hourlyRate = dailyRate / workHoursPerDay;
        const minuteRate = hourlyRate / 60;

        // 1. Attendance Data
        const employeeAttendance = attendanceData ? Object.values(attendanceData).filter(a => a.employeeId === employee.id) : [];
        const presentDays = new Set(employeeAttendance.map(a => a.date));
        
        const totalDelayMinutes = employee.disableDeductions ? 0 : employeeAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
        const totalEarlyLeaveMinutes = employee.disableDeductions ? 0 : employeeAttendance.reduce((acc, curr) => acc + (curr.earlyLeaveMinutes || 0), 0);

        // 2. Approved Leaves & Missions
        const employeeRequests = requestsData?.[employee.id] ? Object.values(requestsData[employee.id]) : [];
        const approvedLeaveDays = new Set<string>();
        let approvedPermissionHours = 0;
        
        employeeRequests.forEach(req => {
            if (req.status === 'approved') {
                const reqStart = startOfMonth(new Date(req.startDate));
                if (reqStart.getMonth() !== monthStart.getMonth() || reqStart.getFullYear() !== monthStart.getFullYear()) return;

                if (req.requestType.startsWith('leave')) {
                    eachDayOfInterval({ start: new Date(req.startDate), end: new Date(req.endDate) }).forEach(day => approvedLeaveDays.add(format(day, 'yyyy-MM-dd')));
                }
                if (req.requestType === 'permission' && req.durationHours) {
                    approvedPermissionHours += req.durationHours;
                }
            }
        });
        const approvedLeaveDeductions = 0; // Leaves are unpaid days, handled in absence calc

        // 3. Absence Calculation
        const dayOff = employee.dayOff ? parseInt(employee.dayOff, 10) : -1;
        const workDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => d.getDay() !== dayOff);
        let absenceDays = 0;
        let incompleteRecords = 0;

        workDaysInMonth.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            if (!presentDays.has(dayStr) && !approvedLeaveDays.has(dayStr)) {
                absenceDays++;
            }
            const record = employeeAttendance.find(r => r.date === dayStr);
            if (record && record.checkIn && !record.checkOut) {
                incompleteRecords++;
            }
        });
        const absenceDeductions = absenceDays * (settings.deductionForAbsence || 0) * dailyRate;
        const incompleteRecordDeductions = incompleteRecords * (settings.deductionForIncompleteRecord || 0) * dailyRate;
        const permissionDeductions = approvedPermissionHours * hourlyRate;

        // 4. Delay & Early Leave Deductions
        let delayDeductions = 0;
        let appliedDelayRule = 'N/A';
        const lateAllowance = settings.lateAllowanceScope === 'monthly' ? (settings.lateAllowance || 0) : 0;
        const chargeableDelayMinutes = Math.max(0, totalDelayMinutes - lateAllowance);
        const deductionRules = settings.deductionRules || [];

        if (chargeableDelayMinutes > 0 && deductionRules.length > 0) {
            const applicableRule = deductionRules.sort((a,b) => a.fromMinutes - b.fromMinutes).find(rule => chargeableDelayMinutes >= rule.fromMinutes && chargeableDelayMinutes <= rule.toMinutes);
            if (applicableRule) {
                appliedDelayRule = `من ${applicableRule.fromMinutes} الى ${applicableRule.toMinutes} دقيقة`;
                if (applicableRule.deductionType === 'fixed_amount') delayDeductions = applicableRule.deductionValue;
                else if (applicableRule.deductionType === 'day_deduction') delayDeductions = dailyRate * applicableRule.deductionValue;
                else if (applicableRule.deductionType === 'hour_deduction') delayDeductions = hourlyRate * applicableRule.deductionValue;
                else if (applicableRule.deductionType === 'minute_deduction') delayDeductions = minuteRate * applicableRule.deductionValue;
            }
        }
        
        let earlyLeaveDeductions = 0;
        let appliedEarlyLeaveRule = 'N/A';
        const earlyLeaveRules = settings.earlyLeaveDeductionRules || [];

         if (totalEarlyLeaveMinutes > 0 && earlyLeaveRules.length > 0) {
            const applicableRule = earlyLeaveRules.sort((a,b) => a.fromMinutes - b.fromMinutes).find(rule => totalEarlyLeaveMinutes >= rule.fromMinutes && totalEarlyLeaveMinutes <= rule.toMinutes);
            if (applicableRule) {
                appliedEarlyLeaveRule = `من ${applicableRule.fromMinutes} الى ${applicableRule.toMinutes} دقيقة`;
                if (applicableRule.deductionType === 'day_deduction') {
                    earlyLeaveDeductions = dailyRate * applicableRule.deductionValue;
                }
            }
        }


        // 5. Financial Transactions
        const employeeTransactions = transactionsData?.[employee.id]?.[selectedMonth] ? Object.values(transactionsData[employee.id][selectedMonth]) : [];
        const bonus = employeeTransactions.filter(t => t.type === 'bonus').reduce((acc, t) => acc + t.amount, 0);
        const penalty = employeeTransactions.filter(t => t.type === 'penalty').reduce((acc, t) => acc + t.amount, 0);
        const loanDeduction = 0; // TODO: Implement loan installment logic
        const salaryAdvanceDeductions = employeeTransactions.filter(t => t.type === 'salary_advance').reduce((acc, t) => acc + t.amount, 0);

        // 6. Fixed Deductions/Additions
        const fixedDeductions: { name: string; amount: number }[] = [];
        const fixedAdditions: { name: string; amount: number }[] = [];
        const fixedItems: FixedDeduction[] = Array.isArray(settings?.fixedDeductions) 
            ? settings.fixedDeductions 
            : settings?.fixedDeductions ? Object.values(settings.fixedDeductions) : [];
        
        fixedItems.forEach(item => {
            const amount = item.type === 'fixed' ? item.value : (employee.salary / 100) * item.value;
            if (item.transactionType === 'deduction') {
                fixedDeductions.push({ name: item.name, amount });
            } else {
                fixedAdditions.push({ name: item.name, amount });
            }
        });


        return {
            employeeId: employee.id,
            employeeName: employee.employeeName,
            employeeCode: employee.employeeCode,
            baseSalary: employee.salary,
            totalDelayMinutes,
            delayDeductions,
            totalEarlyLeaveMinutes,
            earlyLeaveDeductions,
            absenceDeductions,
            approvedLeaveDeductions,
            incompleteRecordDeductions,
            permissionDeductions,
            bonus,
            penalty,
            loanDeduction,
            salaryAdvanceDeductions,
            paid: previouslyPaidData?.[employee.id]?.paid || false,
            locationName: "N/A", // Placeholder
            fixedDeductions,
            fixedAdditions,
            appliedDelayRule,
            appliedEarlyLeaveRule,
        };
    });
    
    setPayrollData(newPayrollData);
    setIsCalculating(false);
    toast({ title: 'تم حساب الرواتب', description: `تم حساب رواتب شهر ${new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })} بنجاح.` });
  };
  
  const handlePayAll = async () => {
    if (!db) return;
    const updates: { [key: string]: any } = {};
    payrollData.forEach(item => {
        if (!item.paid) {
            updates[`/payroll/${selectedMonth}/${item.employeeId}`] = { ...item, paid: true };
        }
    });
    await set(ref(db), updates);
    setPayrollData(prevData => prevData.map(item => ({ ...item, paid: true })));
    toast({ title: 'تم دفع جميع الرواتب بنجاح' });
  };
  
  const handleExportToExcel = () => {
    const dataToExport = payrollData.map(item => {
        const payable = calculatePayable(item);
        return {
          'اسم الموظف': item.employeeName,
          'كود الموظف': item.employeeCode,
          'الراتب الأساسي': item.baseSalary,
          'إجمالي الإضافات': item.bonus + item.fixedAdditions.reduce((acc, curr) => acc + curr.amount, 0),
          'إجمالي الخصومات': payable.totalDeductions,
          'صافي الراتب': payable.netSalary,
          'الحالة': item.paid ? 'مدفوع' : 'مستحق',
        };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'رواتب الشهر');
    XLSX.writeFile(workbook, `payroll_${selectedMonth}.xlsx`);
  };

  const calculatePayable = (item: PayrollItem) => {
    const totalAdditions = item.bonus + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductions = item.delayDeductions + item.earlyLeaveDeductions + item.absenceDeductions + item.approvedLeaveDeductions + item.incompleteRecordDeductions + item.permissionDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);
    const netSalary = item.baseSalary + totalAdditions - totalDeductions;
    return { netSalary, totalAdditions, totalDeductions };
  }

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
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="flex-grow md:flex-grow-0">
              {isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />}
              {payrollData.length > 0 ? 'إعادة حساب الرواتب' : 'حساب رواتب الشهر'}
            </Button>
            {payrollData.length > 0 && (
                <Button onClick={handleExportToExcel} variant="outline" className="flex-grow md:flex-grow-0">
                    <FileSpreadsheet className="ml-2 h-4 w-4" />
                    تصدير إلى Excel
                </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم الموظف</TableHead>
                <TableHead className="text-left">الراتب الأساسي</TableHead>
                <TableHead className="text-left">الإضافات</TableHead>
                <TableHead className="text-left">الخصومات</TableHead>
                <TableHead className="font-bold text-primary text-left">المبلغ المستحق</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !isCalculating ? (
                  Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-10 w-full"/></TableCell></TableRow>)
              ) : payrollData.length > 0 ? (
                payrollData.map((item) => {
                    const { netSalary, totalDeductions, totalAdditions } = calculatePayable(item);
                    return (
                        <TableRow key={item.employeeId}>
                            <TableCell className="text-right font-medium">{item.employeeName}</TableCell>
                            <TableCell className="text-left font-mono">{formatCurrency(item.baseSalary)} ج.م</TableCell>
                            <TableCell className="text-green-600 text-left font-mono">{formatCurrency(totalAdditions)} ج.م</TableCell>
                            <TableCell className="text-red-700 text-left font-mono">{formatCurrency(totalDeductions)} ج.م</TableCell>
                            <TableCell className="font-bold text-primary text-left font-mono">{formatCurrency(netSalary)} ج.م</TableCell>
                            <TableCell className="text-center">
                                <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => setSelectedPayslip({ item, payable: netSalary })}>
                                        <Printer className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                </Dialog>
                            </TableCell>
                        </TableRow>
                    )
                })
              ) : (
                <TableRow key="no-data-row">
                  <TableCell colSpan={6} className="h-24 text-center">{!isLoading && "اختر الشهر واضغط 'حساب' لعرض البيانات."}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
      
      {/* Print Dialog */}
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-4xl p-0" aria-describedby={undefined}>
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>معاينة قسيمة الراتب</DialogTitle>
                </DialogHeader>
                {selectedPayslip && (
                    <>
                        <div ref={payslipRef}>
                           <Payslip
                              item={selectedPayslip.item}
                              month={selectedMonth}
                              payable={selectedPayslip.payable}
                              companyName={settings?.companyName}
                              formatCurrency={formatCurrency}
                           />
                        </div>
                        <div className="p-4 border-t flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSelectedPayslip(null)}>إغلاق</Button>
                            <Button onClick={handlePrint}>
                                <Printer className="ml-2 h-4 w-4"/>
                                طباعة
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    </div>
  );
}
