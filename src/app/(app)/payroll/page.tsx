
'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Calculator, CheckCircle, DollarSign, Send, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';


interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn: string;
  delayMinutes?: number;
}

interface FinancialTransaction {
  type: 'bonus' | 'penalty' | 'loan';
  amount: number;
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    bonus: number;
    penalty: number;
    loan: number;
    paid: boolean;
}

// Deduction rule: 1 hour pay deducted for every 60 minutes of delay
const DEDUCTION_RATE_PER_HOUR = 1;

export default function PayrollPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const db = useDb();

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => db ? ref(db, 'attendance') : null, [db]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const transactionsRef = useMemoFirebase(() => db ? ref(db, 'financial_transactions') : null, [db]);
  const [transactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, FinancialTransaction>>>(transactionsRef);


  useEffect(() => {
    setIsClient(true);
  }, []);


  const handleCalculatePayroll = () => {
    setIsCalculating(true);
    if (!employeesData || !attendanceData || !transactionsData) {
        toast({
            variant: "destructive",
            title: "بيانات غير مكتملة",
            description: "لا يمكن حساب الرواتب، بعض البيانات من قاعدة البيانات مفقودة.",
        });
        setIsCalculating(false);
        return;
    }

    const monthStart = new Date(selectedMonth + '-01T00:00:00');
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

    const newPayrollData = Object.entries(employeesData).map(([employeeId, employee]) => {
        const employeeAttendance = Object.values(attendanceData || {}).filter((att) => 
            att.employeeId === employeeId && 
            new Date(att.date) >= monthStart && 
            new Date(att.date) < nextMonthStart
        );
        
        const totalDelayMinutes = employeeAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
        const hourlyRate = employee.salary / (30 * 8); // Assuming 30 days, 8 hours/day
        const delayDeductions = (totalDelayMinutes / 60) * hourlyRate * DEDUCTION_RATE_PER_HOUR;
        
        const employeeTransactions = transactionsData[employeeId] ? Object.values(transactionsData[employeeId]) : [];

        const bonus = employeeTransactions.filter(t => t.type === 'bonus').reduce((acc, t) => acc + t.amount, 0);
        const penalty = employeeTransactions.filter(t => t.type === 'penalty').reduce((acc, t) => acc + t.amount, 0);
        const loan = employeeTransactions.filter(t => t.type === 'loan').reduce((acc, t) => acc + t.amount, 0);

        return {
            employeeId: employeeId,
            employeeName: employee.employeeName,
            employeeCode: employee.employeeCode,
            baseSalary: employee.salary,
            totalDelayMinutes,
            delayDeductions,
            bonus,
            penalty,
            loan,
            paid: false,
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
    
    const path = `payroll/${selectedMonth}/${employeeId}`;
    await set(ref(db, path), { ...payrollRecord, paid: true });

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
  
  const handlePayAll = () => {
    if (!db) return;
    payrollData.forEach(async (item) => {
        if (!item.paid) {
            const path = `payroll/${selectedMonth}/${item.employeeId}`;
            await set(ref(db, path), { ...item, paid: true });
        }
    });

    setPayrollData(prevData =>
        prevData.map(item => item.paid ? item : { ...item, paid: true })
    );
    toast({
      title: 'تم دفع جميع الرواتب',
      description: `تم دفع جميع الرواتب المستحقة بنجاح.`,
    });
  };

  const handleExportToExcel = () => {
    const dataToExport = payrollData.map(item => ({
      'اسم الموظف': item.employeeName,
      'كود الموظف': item.employeeCode,
      'الراتب الأساسي': item.baseSalary,
      'الإضافات (مكافأة)': item.bonus,
      'خصم التأخير': item.delayDeductions,
      'خصم الجزاءات': item.penalty,
      'خصم السلف': item.loan,
      'المبلغ المستحق': calculatePayable(item),
      'الحالة': item.paid ? 'مدفوع' : 'مستحق',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'رواتب الشهر');

    // Set column widths
    worksheet['!cols'] = [
        { wch: 25 }, // Employee Name
        { wch: 15 }, // Employee Code
        { wch: 15 }, // Base Salary
        { wch: 15 }, // Bonus
        { wch: 15 }, // Delay Deductions
        { wch: 15 }, // Penalty
        { wch: 15 }, // Loan
        { wch: 20 }, // Payable Amount
        { wch: 10 }, // Status
    ];

    XLSX.writeFile(workbook, `payroll_${selectedMonth}.xlsx`);
  };

  const calculatePayable = (item: PayrollItem) => {
    return item.baseSalary + item.bonus - (item.delayDeductions + item.penalty + item.loan);
  }

  const totalBaseSalary = payrollData.reduce((acc, item) => acc + item.baseSalary, 0);
  const totalDeductions = payrollData.reduce((acc, item) => acc + (item.delayDeductions + item.penalty + item.loan), 0);
  const totalAdditions = payrollData.reduce((acc, item) => acc + item.bonus, 0);
  const totalPayable = payrollData.reduce((acc, item) => acc + calculatePayable(item), 0);
  const isAllPaid = payrollData.length > 0 && payrollData.every(item => item.paid);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  const formatCurrency = (amount: number) => {
    if (!isClient) return amount;
    return amount.toLocaleString('ar', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
  };
  
  const isLoading = isEmployeesLoading || isAttendanceLoading || isTransactionsLoading;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        الرواتب الشهرية
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>حساب الرواتب</CardTitle>
          <div className="flex flex-wrap gap-4 items-end pt-4">
            <div className="space-y-2 flex-grow">
              <label className="text-sm font-medium">اختر الشهر</label>
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
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="flex-grow md:flex-grow-0">
              <Calculator className="ml-2 h-4 w-4" />
              {isCalculating ? 'جاري الحساب...' : 'حساب رواتب الشهر'}
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
                <TableHead className="font-bold text-primary text-left">
                  المبلغ المستحق
                </TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                  <TableRow><TableCell colSpan={7}><Skeleton className="h-20 w-full"/></TableCell></TableRow>
              )}
              {!isLoading && payrollData.length > 0 ? (
                payrollData.map((item) => (
                  <TableRow key={item.employeeCode}>
                    <TableCell className="text-right">
                      <div className="font-medium">{item.employeeName}</div>
                      <div className="text-sm text-muted-foreground font-mono">{item.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-left font-mono">
                      {formatCurrency(item.baseSalary)} ج.م
                    </TableCell>
                    <TableCell className="text-green-600 text-left font-mono">
                      {item.bonus > 0 ? `${formatCurrency(item.bonus)} ج.م` : '-'}
                      {item.bonus > 0 && <div className="text-xs text-muted-foreground">(مكافأة)</div>}
                    </TableCell>
                    <TableCell className="text-red-700 dark:text-red-500 text-left font-mono">
                       <div>{formatCurrency(item.delayDeductions)} ج.م <span className="text-xs text-muted-foreground">(تأخير)</span></div>
                       {item.penalty > 0 && <div>{formatCurrency(item.penalty)} ج.م <span className="text-xs text-muted-foreground">(جزاء)</span></div>}
                       {item.loan > 0 && <div>{formatCurrency(item.loan)} ج.م <span className="text-xs text-muted-foreground">(سلفة)</span></div>}
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
                        {item.paid ? (
                            <Button variant="ghost" disabled size="sm">
                                <CheckCircle className="ml-2 h-4 w-4 text-green-500" />
                                تم الدفع
                            </Button>
                        ) : (
                            <Button onClick={() => handlePay(item.employeeId)} size="sm">
                                <DollarSign className="ml-2 h-4 w-4" />
                                دفع
                            </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))
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
                <TableRow className="bg-muted/50">
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
                  <TableHead className="font-bold text-primary text-left font-mono">
                    {formatCurrency(totalPayable)}{' '}
                    ج.م
                  </TableHead>
                  <TableHead colSpan={2}></TableHead>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
        {!isLoading && payrollData.length > 0 && (
          <CardFooter className="flex justify-end">
            <Button size="lg" onClick={handlePayAll} disabled={isAllPaid}>
              {isAllPaid ? (
                <>
                  <CheckCircle className="ml-2 h-4 w-4" />
                  تم دفع كل الرواتب
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  نشر / دفع كل الرواتب
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
