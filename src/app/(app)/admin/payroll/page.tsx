

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, DollarSign, Send, FileSpreadsheet, Info, Printer, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, get, update, push } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { format, subMonths, startOfMonth, endOfMonth, setDate, addMonths, subDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { Payslip } from './payslip';
import { useReactToPrint } from 'react-to-print';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';


interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  userStatus: 'Active' | 'Inactive' | 'Pending';
  locationId?: string;
  dayOff?: string; // e.g., '5' for Friday
  disableDeductions?: boolean;
  shiftConfiguration?: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
}

interface Location {
  id: string;
  name: string;
}

interface DeductionRule {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface FixedDeduction {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    value: number;
    transactionType: 'deduction' | 'addition';
}

interface GlobalSettings {
    companyName?: string;
    locations?: Location[];
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    fixedDeductions?: FixedDeduction[];
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    deductionForAbsence?: number;
    deductionForIncompleteRecord?: number;
    workStartTime?: string;
    workEndTime?: string;
    payrollDay?: number;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  delayMinutes?: number;
  earlyLeaveMinutes?: number;
  status?: 'present' | 'absent';
  officialCheckInTime?: string;
  officialCheckOutTime?: string;
}

interface EmployeeRequest {
    id: string;
    requestType: 'leave_full_day' | 'leave_half_day' | 'mission';
    status: 'approved';
    startDate: string;
    endDate: string;
}

interface FinancialTransaction {
  id: string;
  type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
  amount: number;
  date: string;
  installments?: number;
  status?: 'active' | 'paid';
  paidAmount?: number;
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

// Function to get the number of work days in a month, excluding a specific day off
const getWorkDaysInMonth = (startDate: Date, endDate: Date, dayOff: number) => {
    let workDays = 0;
    const currentDate = new Date(startDate);

    while (currentDate < endDate) {
        const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        if (dayOfWeek !== dayOff) {
            workDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return workDays;
};


export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), 'yyyy-MM')
  );
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [disableDeductionsForMonth, setDisableDeductionsForMonth] = useState(false);
  const db = useDb();

  const payslipRef = useRef(null);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${selectedMonth}`) : null, [db, selectedMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const transactionsRef = useMemoFirebase(() => db ? ref(db, `financial_transactions`) : null, [db]);
  const [transactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, Record<string, FinancialTransaction>>>>(transactionsRef);

  const requestsRef = useMemoFirebase(() => db ? ref(db, 'employee_requests') : null, [db]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, Record<string, EmployeeRequest>>>(requestsRef);

  const paidPayrollRef = useMemoFirebase(() => db ? ref(db, `payroll/${selectedMonth}`) : null, [db, selectedMonth]);
  const [paidPayrollData, isPaidLoading] = useDbData<Record<string, PayrollItem>>(paidPayrollRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings] = useDbData<GlobalSettings>(settingsRef);

 const locationsMap = useMemo(() => {
    if (!settings?.locations) return new Map();
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    const locationsArray: Location[] = locationsRaw.filter((loc): loc is Location => typeof loc === 'object' && loc !== null && 'id' in loc);
    return new Map(locationsArray.map((loc: Location) => [loc.id, loc.name]));
}, [settings]);


  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const calculatePayable = (item: PayrollItem) => {
    const totalFixedDeductions = item.fixedDeductions.reduce((acc, d) => acc + d.amount, 0);
    const totalFixedAdditions = item.fixedAdditions.reduce((acc, d) => acc + d.amount, 0);
    return item.baseSalary + item.bonus + totalFixedAdditions - (item.delayDeductions + item.earlyLeaveDeductions + item.penalty + item.loanDeduction + item.absenceDeductions + item.incompleteRecordDeductions + item.approvedLeaveDeductions + item.salaryAdvanceDeductions + totalFixedDeductions);
  }

  const handlePrint = useReactToPrint({
      content: () => payslipRef.current,
  });

  const handleShareWhatsApp = (item: PayrollItem) => {
    const payable = calculatePayable(item);
    const companyName = settings?.companyName || 'شركتك';
    
    let message = `*كشف راتب شهر ${format(new Date(selectedMonth + '-02'), 'MMMM yyyy')}*\n`;
    message += `*${companyName}*\n\n`;
    message += `*الموظف:* ${item.employeeName}\n`;
    message += `*الكود:* ${item.employeeCode}\n\n`;
    message += `*الراتب الأساسي:* ${formatCurrency(item.baseSalary)} ج.م\n\n`;
    message += `*الإضافات:*\n`;
    message += `  - مكافآت: ${formatCurrency(item.bonus)} ج.م\n`;
    item.fixedAdditions.forEach(add => {
        message += `  - ${add.name}: ${formatCurrency(add.amount)} ج.م\n`;
    });
    message += `\n*الخصومات:*\n`;
    message += `  - خصم التأخير: ${formatCurrency(item.delayDeductions)} ج.م\n`;
    message += `  - خصم انصراف مبكر: ${formatCurrency(item.earlyLeaveDeductions)} ج.م\n`;
    message += `  - خصم الغياب: ${formatCurrency(item.absenceDeductions)} ج.م\n`;
    message += `  - خصم عدم الانصراف: ${formatCurrency(item.incompleteRecordDeductions)} ج.م\n`;
    message += `  - جزاءات: ${formatCurrency(item.penalty)} ج.م\n`;
    message += `  - قسط السلفة: ${formatCurrency(item.loanDeduction)} ج.م\n`;
    message += `  - سلف جزئية: ${formatCurrency(item.salaryAdvanceDeductions)} ج.م\n`;
    item.fixedDeductions.forEach(ded => {
        message += `  - ${ded.name}: ${formatCurrency(ded.amount)} ج.م\n`;
    });
    message += `\n*صافي الراتب المستحق: ${formatCurrency(payable)} ج.م*`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleCalculatePayroll = () => {
    setIsCalculating(true);
    if (!employeesData) {
        toast({
            variant: "destructive",
            title: "بيانات غير مكتملة",
            description: "لا يمكن حساب الرواتب، بيانات الموظفين مفقودة.",
        });
        setIsCalculating(false);
        return;
    }
    
    // --- Payroll Cycle Calculation ---
    const payrollDay = settings?.payrollDay || 1;
    const [year, month] = selectedMonth.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, 1);

    let cycleStart: Date;
    let cycleEnd: Date;
    
    if (payrollDay === 1) {
        // Standard calendar month
        cycleStart = startOfMonth(selectedDate);
        cycleEnd = addMonths(cycleStart, 1);
    } else {
        // Cycle is from [payrollDay] of previous month to [payrollDay - 1] of current month
        const currentMonthCycleDay = setDate(selectedDate, payrollDay);
        cycleStart = subMonths(currentMonthCycleDay, 1);
        cycleEnd = currentMonthCycleDay;
    }


    const activeEmployees = Object.entries(employeesData).filter(([, emp]) => emp.userStatus === 'Active');

    const newPayrollData = activeEmployees.map(([employeeId, employee]) => {
        const isAlreadyPaid = paidPayrollData && paidPayrollData[employeeId];
        if (isAlreadyPaid) {
            return { ...paidPayrollData[employeeId], paid: true };
        }
        
        const dailyRate = (employee.salary || 0) / 30;
        const workHoursPerDay = settings?.workStartTime && settings.workEndTime 
            ? (new Date(`1970-01-01T${settings.workEndTime}`).getTime() - new Date(`1970-01-01T${settings.workStartTime}`).getTime()) / (1000 * 60 * 60)
            : 8;
        const hourlyRate = dailyRate / workHoursPerDay;
        const minuteRate = hourlyRate / 60;

        // --- Get Approved Requests (Leaves & Missions) ---
        const employeeRequests = requestsData && requestsData[employeeId] ? Object.values(requestsData[employeeId]) : [];
        const approvedLeaves = employeeRequests.filter(req => req.status === 'approved' && req.requestType.startsWith('leave'));
        const approvedMissions = employeeRequests.filter(req => req.status === 'approved' && req.requestType === 'mission');

        // --- Approved Leave Calculation ---
        let approvedLeaveDeductions = 0;
        const leaveDaysInCycle = new Set<string>();

        approvedLeaves.forEach(leave => {
            const leaveInterval = eachDayOfInterval({ start: new Date(leave.startDate), end: new Date(leave.endDate) });
            leaveInterval.forEach(day => {
                if (day >= cycleStart && day < cycleEnd) {
                    const dayString = format(day, 'yyyy-MM-dd');
                    if (leave.requestType === 'leave_full_day') {
                        approvedLeaveDeductions += dailyRate;
                        leaveDaysInCycle.add(dayString);
                    } else if (leave.requestType === 'leave_half_day') {
                        approvedLeaveDeductions += dailyRate / 2;
                    }
                }
            });
        });
        
        // --- Get Missions Days ---
        const missionDaysInCycle = new Set<string>();
        approvedMissions.forEach(mission => {
             const missionInterval = eachDayOfInterval({ start: new Date(mission.startDate), end: new Date(mission.endDate) });
             missionInterval.forEach(day => {
                if (day >= cycleStart && day < cycleEnd) {
                    missionDaysInCycle.add(format(day, 'yyyy-MM-dd'));
                }
             });
        });

        const employeeAttendance = Object.values(attendanceData || {}).filter((att) => 
            att.employeeId === employeeId
        );
        
        // --- Delay and Early Leave Deductions ---
        const presentAttendance = employeeAttendance.filter(rec => rec.status !== 'absent' && !missionDaysInCycle.has(rec.date));
        const totalDelayMinutes = presentAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
        const totalEarlyLeaveMinutes = presentAttendance.reduce((acc, curr) => acc + (curr.earlyLeaveMinutes || 0), 0);
        
        let delayDeductions = 0;
        let earlyLeaveDeductions = 0;
        let appliedDelayRule = 'لا يوجد';
        let appliedEarlyLeaveRule = 'لا يوجد';

        if (!disableDeductionsForMonth && !employee.disableDeductions) {
            const delayRulesRaw = settings?.deductionRules;
            const earlyLeaveRulesRaw = settings?.earlyLeaveDeductionRules;
            
            const delayRules: DeductionRule[] = (Array.isArray(delayRulesRaw) 
                ? delayRulesRaw 
                : (delayRulesRaw ? Object.values(delayRulesRaw).filter((r): r is DeductionRule => !!(r as any)?.id) : [])
            ).sort((a, b) => a.fromMinutes - b.fromMinutes);
            
            const earlyLeaveRules: DeductionRule[] = (Array.isArray(earlyLeaveRulesRaw)
                ? earlyLeaveRulesRaw
                : (earlyLeaveRulesRaw ? Object.values(earlyLeaveRulesRaw).filter((r): r is DeductionRule => !!(r as any)?.id) : [])
            ).sort((a, b) => a.fromMinutes - b.fromMinutes);
            
            const lateAllowance = settings?.lateAllowanceScope === 'monthly' ? (settings?.lateAllowance || 0) : 0;
            const chargeableDelayMinutes = Math.max(0, totalDelayMinutes - lateAllowance);

            // Calculate Delay Deductions
            if (chargeableDelayMinutes > 0 && delayRules.length > 0) {
                const applicableRule = delayRules.find(rule => chargeableDelayMinutes >= rule.fromMinutes && chargeableDelayMinutes <= rule.toMinutes);
                if (applicableRule) {
                    appliedDelayRule = `من ${applicableRule.fromMinutes} إلى ${applicableRule.toMinutes} دقيقة`;
                    if (applicableRule.deductionType === 'day_deduction') delayDeductions = dailyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'hour_deduction') delayDeductions = hourlyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'minute_deduction') delayDeductions = minuteRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'fixed_amount') delayDeductions = applicableRule.deductionValue;
                }
            }
            
            // Calculate Early Leave Deductions
            if (totalEarlyLeaveMinutes > 0 && earlyLeaveRules.length > 0) {
                 const applicableRule = earlyLeaveRules.find(rule => totalEarlyLeaveMinutes >= rule.fromMinutes && totalEarlyLeaveMinutes <= rule.toMinutes);
                 if(applicableRule) {
                    appliedEarlyLeaveRule = `من ${applicableRule.fromMinutes} إلى ${applicableRule.toMinutes} دقيقة`;
                    if (applicableRule.deductionType === 'day_deduction') earlyLeaveDeductions = dailyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'hour_deduction') earlyLeaveDeductions = hourlyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'minute_deduction') earlyLeaveDeductions = minuteRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'fixed_amount') earlyLeaveDeductions = applicableRule.deductionValue;
                 }
            }
        }
        
        // --- Absence & Incomplete Record Deductions ---
        const employeeDayOff = employee.dayOff ? parseInt(employee.dayOff, 10) : 5;
        const totalWorkDaysInCycle = getWorkDaysInMonth(cycleStart, cycleEnd, employeeDayOff);
        
        const attendedDays = new Set(presentAttendance.map(rec => rec.date));
        
        // Exclude approved full-day leave and mission days from absence calculation
        const effectiveWorkDays = totalWorkDaysInCycle - leaveDaysInCycle.size - missionDaysInCycle.size;
        const absentDays = effectiveWorkDays - attendedDays.size;

        const absenceDeductionRule = settings?.deductionForAbsence || 0;
        const absenceDeductions = absentDays > 0 ? absentDays * absenceDeductionRule * dailyRate : 0;
        
        let incompleteRecords = 0;
        presentAttendance.forEach(rec => {
            if (!rec.checkOut) {
                const officialCheckOutTime = rec.officialCheckOutTime || settings?.workEndTime;
                if(officialCheckOutTime) {
                    const checkInDate = new Date(rec.checkIn);
                    const [hours, minutes] = officialCheckOutTime.split(':').map(Number);
                    const officialCheckOutDate = new Date(checkInDate);
                    officialCheckOutDate.setHours(hours, minutes, 0, 0);

                    // If current time is past 4 hours from official checkout and still no checkout, it's incomplete
                    const fourHoursAfterOfficial = new Date(officialCheckOutDate.getTime() + 4 * 60 * 60 * 1000);

                    if (new Date() > fourHoursAfterOfficial) {
                        incompleteRecords++;
                    }
                }
            }
        });
        const incompleteRecordDeductionRule = settings?.deductionForIncompleteRecord || 0;
        const incompleteRecordDeductions = incompleteRecords > 0 ? incompleteRecords * incompleteRecordDeductionRule * dailyRate : 0;
        
        // --- Financial Transactions ---
        const employeeMonthTransactions = transactionsData && transactionsData[employeeId] && transactionsData[employeeId][selectedMonth] 
            ? Object.entries(transactionsData[employeeId][selectedMonth]).map(([id, data]) => ({...data, id})) 
            : [];
        
        const bonus = employeeMonthTransactions.filter(t => t.type === 'bonus').reduce((acc, t) => acc + t.amount, 0);
        const penalty = employeeMonthTransactions.filter(t => t.type === 'penalty').reduce((acc, t) => acc + t.amount, 0);
        const salaryAdvanceDeductions = employeeMonthTransactions.filter(t => t.type === 'salary_advance').reduce((acc, t) => acc + t.amount, 0);
        
        const allEmployeeTransactions = transactionsData && transactionsData[employeeId] 
            ? Object.values(transactionsData[employeeId]).flatMap(monthlyTx => Object.values(monthlyTx))
            : [];

        const activeLoan = allEmployeeTransactions.find(t => t.type === 'loan' && t.status === 'active');

        let loanDeduction = 0;
        if (activeLoan && activeLoan.amount && activeLoan.installments) {
            const remainingAmount = activeLoan.amount - (activeLoan.paidAmount || 0);
            const installmentAmount = activeLoan.amount / activeLoan.installments;
            loanDeduction = Math.min(remainingAmount, installmentAmount);
        }

        // --- Fixed Deductions & Additions ---
        const fixedDeductions: { name: string; amount: number }[] = [];
        const fixedAdditions: { name: string; amount: number }[] = [];
        const fixedDeductionsRules: FixedDeduction[] = Array.isArray(settings?.fixedDeductions)
          ? settings.fixedDeductions
          : settings?.fixedDeductions
          ? Object.values(settings.fixedDeductions)
          : [];


        if (fixedDeductionsRules.length > 0) {
            fixedDeductionsRules.forEach((rule: FixedDeduction) => {
                let amount = 0;
                if (rule.type === 'fixed') {
                    amount = rule.value;
                } else if (rule.type === 'percentage') {
                    amount = (employee.salary / 100) * rule.value;
                }

                if (rule.transactionType === 'deduction') {
                    fixedDeductions.push({ name: rule.name, amount });
                } else {
                    fixedAdditions.push({ name: rule.name, amount });
                }
            });
        }

        return {
            employeeId: employeeId,
            employeeName: employee.employeeName,
            employeeCode: employee.employeeCode,
            baseSalary: employee.salary || 0,
            totalDelayMinutes,
            delayDeductions,
            totalEarlyLeaveMinutes,
            earlyLeaveDeductions,
            absenceDeductions: Math.max(0, absenceDeductions), // Ensure not negative
            approvedLeaveDeductions,
            incompleteRecordDeductions,
            bonus,
            penalty,
            loanDeduction,
            salaryAdvanceDeductions,
            fixedDeductions,
            fixedAdditions,
            paid: false,
            locationName: locationsMap.get(employee.locationId || '') || 'غير محدد',
            appliedDelayRule,
            appliedEarlyLeaveRule,
        };
    });
    
    setPayrollData(newPayrollData);
    setIsCalculating(false);
    toast({
      title: 'تم حساب الرواتب',
      description: `تم حساب رواتب شهر ${new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })} بنجاح.`,
    });
  };
  
const handlePay = async (employeeId: string) => {
    if (!db) return;
    const payrollRecord = payrollData.find(p => p.employeeId === employeeId);
    if (!payrollRecord) return;

    if (payrollRecord.loanDeduction > 0) {
        const employeeTransactionsRef = ref(db, `financial_transactions/${employeeId}`);
        const snapshot = await get(employeeTransactionsRef);
        if (snapshot.exists()) {
            const allMonths = snapshot.val();
            let activeLoanEntry: [string, FinancialTransaction] | undefined;
            let activeLoanMonth: string | undefined;

            for (const month in allMonths) {
                const monthTxs = allMonths[month];
                const found = Object.entries(monthTxs).find(([, tx]) => (tx as FinancialTransaction).type === 'loan' && (tx as FinancialTransaction).status === 'active');
                if (found) {
                    activeLoanEntry = found as [string, FinancialTransaction];
                    activeLoanMonth = month;
                    break;
                }
            }
            
            if (activeLoanEntry && activeLoanMonth) {
                const [loanId, loanData] = activeLoanEntry;
                const loanRef = ref(db, `financial_transactions/${employeeId}/${activeLoanMonth}/${loanId}`);
                const newPaidAmount = (loanData.paidAmount || 0) + payrollRecord.loanDeduction;
                const isLoanPaid = newPaidAmount >= loanData.amount;

                await update(loanRef, {
                    paidAmount: newPaidAmount,
                    status: isLoanPaid ? 'paid' : 'active',
                });
            }
        }
    }

    const path = `payroll/${selectedMonth}/${employeeId}`;
    const finalRecord = { ...payrollRecord, paid: true, payableAmount: calculatePayable(payrollRecord) };
    
    await set(ref(db, path), finalRecord);

    setPayrollData(prevData => 
        prevData.map(item => 
            item.employeeId === employeeId ? { ...item, paid: true } : item
        )
    );
     toast({
      title: 'تم الدفع بنجاح',
      description: `تم دفع راتب الموظف ${payrollRecord.employeeName}.`,
    });
  };
  
  const handlePayAll = async () => {
    if (!db) return;
    
    const unpaidPayroll = payrollData.filter(item => !item.paid);
    if(unpaidPayroll.length === 0) {
        toast({ title: 'لا توجد رواتب لدفعها' });
        return;
    }

    for (const item of unpaidPayroll) {
       await handlePay(item.employeeId);
    }

    toast({
      title: 'تم دفع جميع الرواتب',
      description: `تم حفظ ودفع جميع الرواتب المستحقة بنجاح.`,
    });
  };

  const handleExportToExcel = () => {
    const dataToExport = payrollData.map(item => {
        const totalFixedDeductions = item.fixedDeductions.reduce((acc, d) => acc + d.amount, 0);
        const totalFixedAdditions = item.fixedAdditions.reduce((acc, d) => acc + d.amount, 0);

        let row: any = {
            'اسم الموظف': item.employeeName,
            'كود الموظف': item.employeeCode,
            'الفرع': item.locationName,
            'الراتب الأساسي': item.baseSalary,
            'الإضافات (مكافأة)': item.bonus,
        };

        item.fixedAdditions.forEach(add => {
            row[`إضافة: ${add.name}`] = add.amount;
        });

        row = { ...row,
            'خصم التأخير': item.delayDeductions,
            'خصم الانصراف المبكر': item.earlyLeaveDeductions,
            'خصم الإجازات': item.approvedLeaveDeductions,
            'خصم الغياب': item.absenceDeductions,
            'خصم عدم الانصراف': item.incompleteRecordDeductions,
            'خصم الجزاءات': item.penalty,
            'خصم السلف': item.loanDeduction,
            'سلف جزئية': item.salaryAdvanceDeductions,
        };

        item.fixedDeductions.forEach(ded => {
            row[`خصم: ${ded.name}`] = ded.amount;
        });

        row['المبلغ المستحق'] = calculatePayable(item);
        row['الحالة'] = item.paid ? 'مدفوع' : 'مستحق';
        
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'رواتب الشهر');

    // Auto-width columns
    const cols = Object.keys(dataToExport[0] || {}).map(key => ({
        wch: Math.max(...dataToExport.map(row => (row[key] || '').toString().length), key.length) + 2
    }));
    worksheet['!cols'] = cols;

    XLSX.writeFile(workbook, `payroll_${selectedMonth}.xlsx`);
  };

  const totalBaseSalary = payrollData.reduce((acc, item) => acc + item.baseSalary, 0);
  const totalDeductions = payrollData.reduce((acc, item) => {
    const fixedDeds = item.fixedDeductions.reduce((a, d) => a + d.amount, 0);
    return acc + (item.delayDeductions + item.earlyLeaveDeductions + item.penalty + item.loanDeduction + item.absenceDeductions + item.incompleteRecordDeductions + item.approvedLeaveDeductions + item.salaryAdvanceDeductions + fixedDeds);
  }, 0);
  const totalAdditions = payrollData.reduce((acc, item) => {
    const fixedAdds = item.fixedAdditions.reduce((a, d) => a + d.amount, 0);
    return acc + item.bonus + fixedAdds;
  }, 0);
  const totalPayable = payrollData.reduce((acc, item) => acc + calculatePayable(item), 0);
  const isAllPaid = payrollData.length > 0 && payrollData.every(item => item.paid);

  const months = Array.from({ length: 12 }, (_, i) => {
    return format(subMonths(new Date(), i), 'yyyy-MM');
  });

  const formatCurrency = (amount: number) => {
    if (!isClient) return amount;
    return (amount || 0).toLocaleString('ar', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
  };
  
  const isLoading = isEmployeesLoading || isAttendanceLoading || isTransactionsLoading || isPaidLoading || isRequestsLoading;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        الرواتب الشهرية
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>حساب الرواتب</CardTitle>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end pt-4">
            <div className="space-y-2 flex-grow w-full sm:w-auto">
              <Label>اختر الشهر</Label>
              <Select
                dir="rtl"
                value={selectedMonth}
                onValueChange={setSelectedMonth}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {new Date(month + '-02').toLocaleDateString('ar', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
                <Switch 
                    id="disable-deductions"
                    checked={disableDeductionsForMonth}
                    onCheckedChange={setDisableDeductionsForMonth}
                />
                <Label htmlFor="disable-deductions">تعطيل الخصومات لهذا الشهر</Label>
            </div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="flex-grow sm:flex-grow-0 w-full sm:w-auto">
              <Calculator className="ml-2 h-4 w-4" />
              {isCalculating ? 'جاري الحساب...' : 'حساب رواتب الشهر'}
            </Button>
            {payrollData.length > 0 && (
                <Button onClick={handleExportToExcel} variant="outline" className="flex-grow sm:flex-grow-0 w-full sm:w-auto">
                    <FileSpreadsheet className="ml-2 h-4 w-4" />
                    تصدير إلى Excel
                </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-left">الراتب الأساسي</TableHead>
                  <TableHead className="text-left">الإضافات</TableHead>
                  <TableHead className="text-left">الخصومات</TableHead>
                  <TableHead className="font-bold text-primary text-left">
                    المبلغ المستحق
                  </TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                     Array.from({ length: 3 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell colSpan={7}><Skeleton className="h-12 w-full"/></TableCell>
                        </TableRow>
                     ))
                )}
                {!isLoading && payrollData.length > 0 ? (
                  payrollData.map((item) => {
                    const totalDeds = item.delayDeductions + item.earlyLeaveDeductions + item.approvedLeaveDeductions + item.absenceDeductions + item.incompleteRecordDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((a,d) => a + d.amount, 0);
                    const totalAdds = item.bonus + item.fixedAdditions.reduce((a,d) => a + d.amount, 0);
                    return (
                    <TableRow key={item.employeeCode}>
                      <TableCell className="text-right">
                        <div className="font-medium truncate">{item.employeeName}</div>
                        <div className="text-sm text-muted-foreground font-mono">{item.employeeCode}</div>
                      </TableCell>
                      <TableCell className="text-left font-mono">
                        {formatCurrency(item.baseSalary)} ج.م
                      </TableCell>
                      <TableCell className="text-green-600 text-left font-mono">
                        {totalAdds > 0 ? `${formatCurrency(totalAdds)} ج.م` : '-'}
                      </TableCell>
                       <TableCell className="text-red-700 dark:text-red-500 text-left font-mono">
                         {formatCurrency(totalDeds)} ج.م
                      </TableCell>
                      <TableCell className="font-bold text-primary text-left font-mono">
                        {formatCurrency(calculatePayable(item))}{' '}
                        ج.م
                      </TableCell>
                      <TableCell className="text-center">
                          {item.paid ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                  <CheckCircle className="ml-1 h-3 w-3"/>
                                  مدفوع
                              </Badge>
                          ) : (
                               <Badge variant="outline">مستحق</Badge>
                          )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8"><Info className="h-4 w-4"/></Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <div className="hidden">
                                        <div ref={payslipRef}>
                                            <Payslip 
                                                item={item} 
                                                month={selectedMonth} 
                                                payable={calculatePayable(item)} 
                                                companyName={settings?.companyName}
                                                formatCurrency={formatCurrency}
                                            />
                                        </div>
                                    </div>
                                    <DialogHeader>
                                        <DialogTitle>تفاصيل راتب {item.employeeName}</DialogTitle>
                                        <DialogDescription>
                                            كشف حساب تفصيلي للراتب والمستقطعات للشهر المحدد.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4 text-sm max-h-[60vh] overflow-y-auto pr-6 -mr-6">
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">الراتب الأساسي</span>
                                            <span className="font-mono">{formatCurrency(item.baseSalary)} ج.م</span>
                                        </div>
                                        <hr/>
                                        <p className="font-bold">الإضافات</p>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">مكافآت</span>
                                            <span className="font-mono font-bold text-green-600">+{formatCurrency(item.bonus)} ج.م</span>
                                        </div>
                                        {item.fixedAdditions.map(add => (
                                        <div key={add.name} className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{add.name}</span>
                                            <span className="font-mono font-bold text-green-600">+{formatCurrency(add.amount)} ج.م</span>
                                        </div>
                                        ))}
                                        <hr/>
                                        <p className="font-bold">الخصومات</p>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم التأخير ({item.totalDelayMinutes} دقيقة)</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.delayDeductions)} ج.م</span>
                                        </div>
                                        {item.appliedDelayRule && <div className="text-xs text-muted-foreground pr-4">القاعدة المطبقة: {item.appliedDelayRule}</div>}
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم الانصراف المبكر ({item.totalEarlyLeaveMinutes} دقيقة)</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.earlyLeaveDeductions)} ج.م</span>
                                        </div>
                                        {item.appliedEarlyLeaveRule && <div className="text-xs text-muted-foreground pr-4">القاعدة المطبقة: {item.appliedEarlyLeaveRule}</div>}
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم الغياب</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.absenceDeductions)} ج.م</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم الإجازات المعتمدة</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.approvedLeaveDeductions)} ج.م</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم عدم الانصراف</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.incompleteRecordDeductions)} ج.م</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">خصم الجزاءات</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.penalty)} ج.م</span>
                                        </div>
                                         <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">قسط السلفة</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.loanDeduction)} ج.م</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">سلف جزئية</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.salaryAdvanceDeductions)} ج.م</span>
                                        </div>
                                        {item.fixedDeductions.map(ded => (
                                        <div key={ded.name} className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{ded.name}</span>
                                            <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(ded.amount)} ج.م</span>
                                        </div>
                                        ))}
                                        <hr/>
                                        <div className="flex justify-between items-center font-bold text-lg">
                                            <span>صافي الراتب المستحق</span>
                                            <span className="font-mono text-primary">{formatCurrency(calculatePayable(item))} ج.م</span>
                                        </div>
                                    </div>
                                    <DialogFooter className="gap-2 sm:justify-start">
                                        <Button onClick={handlePrint}><Printer className="ml-2 h-4 w-4" /> طباعة</Button>
                                        <Button onClick={() => handleShareWhatsApp(item)} variant="outline"><Share2 className="ml-2 h-4 w-4" /> مشاركة عبر واتساب</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                          {item.paid ? (
                              <Button variant="ghost" disabled size="sm" className="h-8">
                                  تم الدفع
                              </Button>
                          ) : (
                              <Button onClick={() => handlePay(item.employeeId)} size="sm" className="h-8">
                                  <DollarSign className="ml-2 h-4 w-4" />
                                  دفع
                              </Button>
                          )}
                          </div>
                      </TableCell>
                    </TableRow>
                  );
                })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {!isLoading && "قم باختيار الشهر والضغط على 'حساب الرواتب' لعرض البيانات."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {!isLoading && payrollData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/50 font-bold">
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-left font-mono">
                      {formatCurrency(totalBaseSalary)} ج.م
                    </TableHead>
                    <TableHead className="text-green-600 text-left font-mono">
                      {formatCurrency(totalAdditions)} ج.م
                    </TableHead>
                    <TableHead className="text-red-700 dark:text-red-500 text-left font-mono">
                      {formatCurrency(totalDeductions)} ج.م
                    </TableHead>
                    <TableHead className="text-primary text-left font-mono">
                      {formatCurrency(totalPayable)}{' '}
                      ج.م
                    </TableHead>
                    <TableHead colSpan={2}></TableHead>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          {/* Mobile Cards */}
          <div className="space-y-4 md:hidden">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-28 w-full"/></CardContent></Card>)}
             {!isLoading && payrollData.length > 0 ? (
                 payrollData.map((item) => {
                    const totalDeds = item.delayDeductions + item.earlyLeaveDeductions + item.penalty + item.loanDeduction + item.absenceDeductions + item.incompleteRecordDeductions + item.approvedLeaveDeductions + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((a,d) => a + d.amount, 0);
                    return (
                    <Card key={item.employeeId}>
                         <CardHeader className="p-4">
                            <CardTitle className="text-base flex justify-between items-center">
                                <div className="space-y-1">
                                    <span>{item.employeeName}</span>
                                    <div className="font-mono text-xs text-muted-foreground">{item.employeeCode}</div>
                                </div>
                                {item.paid ? (
                                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                        <CheckCircle className="ml-1 h-3 w-3"/>
                                        مدفوع
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">مستحق</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 text-sm space-y-2">
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">المبلغ المستحق:</span>
                                <span className="font-mono font-bold text-primary">{formatCurrency(calculatePayable(item))} ج.م</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">الراتب الأساسي:</span>
                                <span className="font-mono">{formatCurrency(item.baseSalary)} ج.م</span>
                            </div>
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">الخصومات:</span>
                                <span className="font-mono text-red-600">{formatCurrency(totalDeds)} ج.م</span>
                            </div>
                             <div className="pt-2 flex gap-2">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="w-full"><Info className="ml-2 h-4 w-4"/> تفاصيل</Button>
                                    </DialogTrigger>
                                     <DialogContent>
                                        <div className="hidden">
                                            <div ref={payslipRef}>
                                                <Payslip 
                                                    item={item} 
                                                    month={selectedMonth} 
                                                    payable={calculatePayable(item)} 
                                                    companyName={settings?.companyName}
                                                    formatCurrency={formatCurrency}
                                                />
                                            </div>
                                        </div>
                                        <DialogHeader>
                                            <DialogTitle>تفاصيل راتب {item.employeeName}</DialogTitle>
                                        </DialogHeader>
                                         <div className="space-y-4 py-4 text-sm max-h-[60vh] overflow-y-auto pr-6 -mr-6">
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">الراتب الأساسي</span>
                                                <span className="font-mono">{formatCurrency(item.baseSalary)} ج.م</span>
                                            </div>
                                            <hr/>
                                            <p className="font-bold">الإضافات</p>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">مكافآت</span>
                                                <span className="font-mono font-bold text-green-600">+{formatCurrency(item.bonus)} ج.م</span>
                                            </div>
                                            {item.fixedAdditions.map(add => (
                                            <div key={add.name} className="flex justify-between items-center">
                                                <span className="text-muted-foreground">{add.name}</span>
                                                <span className="font-mono font-bold text-green-600">+{formatCurrency(add.amount)} ج.م</span>
                                            </div>
                                            ))}
                                            <hr/>
                                            <p className="font-bold">الخصومات</p>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم التأخير ({item.totalDelayMinutes} دقيقة)</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.delayDeductions)} ج.م</span>
                                            </div>
                                            {item.appliedDelayRule && <div className="text-xs text-muted-foreground pr-4">القاعدة المطبقة: {item.appliedDelayRule}</div>}
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم الانصراف المبكر ({item.totalEarlyLeaveMinutes} دقيقة)</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.earlyLeaveDeductions)} ج.م</span>
                                            </div>
                                            {item.appliedEarlyLeaveRule && <div className="text-xs text-muted-foreground pr-4">القاعدة المطبقة: {item.appliedEarlyLeaveRule}</div>}
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم الغياب</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.absenceDeductions)} ج.م</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم الإجازات المعتمدة</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.approvedLeaveDeductions)} ج.م</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم عدم الانصراف</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.incompleteRecordDeductions)} ج.م</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">خصم الجزاءات</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.penalty)} ج.م</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">قسط السلفة</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.loanDeduction)} ج.م</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">سلف جزئية</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(item.salaryAdvanceDeductions)} ج.م</span>
                                            </div>
                                            {item.fixedDeductions.map(ded => (
                                            <div key={ded.name} className="flex justify-between items-center">
                                                <span className="text-muted-foreground">{ded.name}</span>
                                                <span className="font-mono text-red-700 dark:text-red-500">-{formatCurrency(ded.amount)} ج.م</span>
                                            </div>
                                            ))}
                                            <hr/>
                                            <div className="flex justify-between items-center font-bold text-lg">
                                                <span>صافي الراتب</span>
                                                <span className="font-mono text-primary">{formatCurrency(calculatePayable(item))} ج.م</span>
                                            </div>
                                        </div>
                                         <DialogFooter className="gap-2 sm:justify-start pt-4">
                                            <Button onClick={handlePrint}><Printer className="ml-2 h-4 w-4" /> طباعة</Button>
                                            <Button onClick={() => handleShareWhatsApp(item)} variant="outline"><Share2 className="ml-2 h-4 w-4" /> واتساب</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                 {!item.paid && (
                                     <Button onClick={() => handlePay(item.employeeId)} size="sm" className="w-full">
                                        <DollarSign className="ml-2 h-4 w-4" />
                                        دفع الآن
                                    </Button>
                                 )}
                            </div>
                        </CardContent>
                    </Card>
                 );
                })
             ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {!isLoading && "قم باختيار الشهر والضغط على 'حساب الرواتب' لعرض البيانات."}
                </div>
             )}
          </div>
        </CardContent>
        {!isLoading && payrollData.length > 0 && (
          <CardFooter className="flex justify-end">
            <Button size="lg" onClick={handlePayAll} disabled={isAllPaid} className="w-full md:w-auto">
              {isAllPaid ? (
                <>
                  <CheckCircle className="ml-2 h-4 w-4" />
                  تم دفع كل الرواتب
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  دفع كل الرواتب المستحقة
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
