
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, push, set } from 'firebase/database';
import { format, differenceInHours } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { HandCoins, Search, Wallet, History, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// --- Interfaces ---
interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  userStatus: 'Active' | 'Inactive' | 'Pending' | 'Archived';
  disableDeductions?: boolean;
}

interface Transaction {
    id: string;
    employeeId: string;
    employeeName: string;
    amount: number;
    date: string;
    type: 'salary_advance';
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  delayMinutes?: number;
}

interface DeductionRule {
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface GlobalSettings {
    deductionRules?: DeductionRule[];
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    workStartTime?: string;
    workEndTime?: string;
}

interface DailyStats {
    dailySalary: number;
    todaysDelay: number;
    todaysDeduction: number;
    netToday: number;
    status: 'present' | 'absent';
}

// --- Component ---
export default function DailyPayrollPage() {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const db = useDb();
  
  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const transactionsRef = useMemoFirebase(() => db ? ref(db, 'financial_transactions') : null, [db]);
  const [transactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, Record<string, Transaction>>>>(transactionsRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const todayMonth = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${todayMonth}`) : null, [db, todayMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  // --- Memoized Data Processing ---
  const allEmployees: Employee[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData)
        .filter(([, emp]) => emp.userStatus === 'Active')
        .map(([id, emp]) => ({ ...emp, id }));
  }, [employeesData]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return allEmployees;
    return allEmployees.filter(emp => 
        emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allEmployees, searchTerm]);
  
  const recentTransactions = useMemo(() => {
      if (!transactionsData || !employeesData) return [];
      const advances: Transaction[] = [];
      Object.entries(transactionsData).forEach(([employeeId, months]) => {
        if (!months) return;
        Object.values(months).forEach(txs => {
          if (!txs) return;
          Object.entries(txs).forEach(([id, tx]) => {
              if (tx.type === 'salary_advance') {
                  advances.push({
                      ...tx,
                      id,
                      employeeId,
                      employeeName: employeesData?.[employeeId]?.employeeName || 'غير معروف'
                  });
              }
          });
        });
      });
      return advances.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [transactionsData, employeesData]);

  const todayAttendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (!attendanceData) return map;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    Object.values(attendanceData).forEach(record => {
        if (record.date === todayStr) {
            map.set(record.employeeId, record);
        }
    });
    return map;
  }, [attendanceData]);
  
  const dailyStatsMap = useMemo(() => {
    if (!allEmployees.length || !settings) return new Map<string, DailyStats>();

    const stats = new Map<string, DailyStats>();

    const workHoursPerDay = settings.workStartTime && settings.workEndTime 
        ? differenceInHours(new Date(`1970-01-01T${settings.workEndTime}`), new Date(`1970-01-01T${settings.workStartTime}`))
        : 8;
    
    const deductionRulesRaw = settings.deductionRules || [];
    const deductionRules: DeductionRule[] = Array.isArray(deductionRulesRaw)
        ? deductionRulesRaw
        : Object.values(deductionRulesRaw);
        
    allEmployees.forEach(employee => {
        const dailySalary = (employee.salary || 0) / 30;
        const hourlyRate = dailySalary / (workHoursPerDay || 8);
        const minuteRate = hourlyRate / 60;
        
        const todaysRecord = todayAttendanceMap.get(employee.id);
        
        let todaysDelay = 0;
        let todaysDeduction = 0;
        let status: 'present' | 'absent' = 'absent';
        
        if (todaysRecord) {
            status = 'present';
            todaysDelay = todaysRecord.delayMinutes || 0;
            
            const lateAllowance = settings.lateAllowanceScope === 'daily' ? (settings.lateAllowance || 0) : 0;
            const chargeableDelay = Math.max(0, todaysDelay - lateAllowance);

            if (chargeableDelay > 0 && deductionRules.length > 0 && !employee.disableDeductions) {
                const applicableRule = [...deductionRules].sort((a,b) => a.fromMinutes - b.fromMinutes).find(rule => chargeableDelay >= rule.fromMinutes && chargeableDelay <= rule.toMinutes);
                if (applicableRule) {
                    if (applicableRule.deductionType === 'fixed_amount') todaysDeduction = applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'day_deduction') todaysDeduction = dailySalary * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'hour_deduction') todaysDeduction = hourlyRate * applicableRule.deductionValue;
                    else if (applicableRule.deductionType === 'minute_deduction') todaysDeduction = minuteRate * applicableRule.deductionValue;
                }
            }
        }
        
        const netToday = dailySalary - todaysDeduction;

        stats.set(employee.id, {
            dailySalary,
            todaysDelay,
            todaysDeduction,
            netToday: Math.max(0, netToday),
            status
        });
    });

    return stats;

  }, [allEmployees, settings, todayAttendanceMap]);

  // --- Handlers ---
  const handleAmountChange = (employeeId: string, value: string) => {
    setAmounts(prev => ({ ...prev, [employeeId]: value }));
  };
  
  const formatCurrency = (amount: number) => {
    return (amount || 0).toLocaleString('ar', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
  };

  const handlePay = async (employeeId: string) => {
    const amountStr = amounts[employeeId];
    const amount = parseFloat(amountStr);

    if (!db) {
        toast({ variant: "destructive", title: "خطأ في قاعدة البيانات" });
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        toast({ variant: "destructive", title: "مبلغ غير صالح", description: "الرجاء إدخال مبلغ صحيح أكبر من صفر." });
        return;
    }
    
    const employee = allEmployees.find(e => e.id === employeeId);
    if (!employee) return;

    try {
        const today = new Date();
        const monthKey = format(today, 'yyyy-MM');
        const transactionPath = `financial_transactions/${employeeId}/${monthKey}`;
        const newTransactionRef = push(ref(db, transactionPath));

        const transactionData = {
            type: 'salary_advance',
            amount: amount,
            notes: 'راتب يومي / سلفة سريعة',
            date: today.toISOString(),
            employeeId_date: `${employeeId}_${format(today, 'yyyy-MM-dd')}`,
        };

        await set(newTransactionRef, transactionData);

        toast({
            title: "تم الدفع بنجاح",
            description: `تم دفع ${formatCurrency(amount)} ج.م للموظف ${employee.employeeName}.`
        });
        
        handleAmountChange(employeeId, '');

    } catch (error: any) {
        toast({ variant: "destructive", title: "فشل الدفع", description: error.message });
    }
  };
  
  const isLoading = isEmployeesLoading || isTransactionsLoading || isSettingsLoading || isAttendanceLoading;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-6 w-6 text-primary" />
                    دفع الرواتب اليومية والسلف السريعة
                </CardTitle>
                <CardDescription>
                    يمكنك عرض مستحقات اليوم للموظف وصرف سلفة سريعة تخصم من الراتب الشهري.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="ابحث بالاسم أو الكود..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {isLoading ? (
                    Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)
                ) : filteredEmployees.length > 0 ? (
                    filteredEmployees.map(employee => {
                        const dailyStats = dailyStatsMap.get(employee.id);
                        return (
                        <Card key={employee.id}>
                            <CardContent className="p-4 flex flex-col gap-4">
                                <div>
                                    <h3 className="font-bold">{employee.employeeName}</h3>
                                    <p className="text-sm text-muted-foreground font-mono">{employee.employeeCode}</p>
                                </div>
                                <Separator />
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-sm flex items-center gap-2">
                                        <Sun className="h-4 w-4 text-amber-500" />
                                        مستحقات اليوم ({format(new Date(), 'd MMMM', {locale: arEG})})
                                    </h4>
                                    {dailyStats ? (
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div>
                                                <p className="text-muted-foreground">حالة الحضور</p>
                                                <Badge variant={dailyStats.status === 'present' ? 'secondary' : 'outline'}>
                                                    {dailyStats.status === 'present' ? 'حاضر' : 'غائب'}
                                                </Badge>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">تأخير اليوم</p>
                                                <p className={cn("font-mono font-bold", dailyStats.todaysDelay > 0 && "text-destructive")}>{dailyStats.todaysDelay} دقيقة</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">خصم التأخير</p>
                                                <p className="font-mono text-destructive">{formatCurrency(dailyStats.todaysDeduction)} ج.م</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">صافي اليومية</p>
                                                <p className="font-mono font-bold text-primary">{formatCurrency(dailyStats.netToday)} ج.م</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <Skeleton className="h-16 w-full" />
                                    )}
                                </div>
                                <Separator />
                                <div className="flex w-full items-center gap-2 pt-2">
                                     <Input
                                        type="number"
                                        placeholder="مبلغ السلفة"
                                        className="flex-1"
                                        value={amounts[employee.id] || ''}
                                        onChange={(e) => handleAmountChange(employee.id, e.target.value)}
                                        min="0"
                                    />
                                    <Button onClick={() => handlePay(employee.id)} disabled={!amounts[employee.id]}>
                                        <HandCoins className="ml-2 h-4 w-4" />
                                        دفع سلفة
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )})
                ) : (
                    <p className="text-center text-muted-foreground py-10">
                        {isEmployeesLoading ? 'جاري تحميل الموظفين...' : 'لم يتم العثور على موظفين.'}
                    </p>
                )}
            </div>
        </div>
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        أحدث السلف المدفوعة
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isTransactionsLoading ? (
                         Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
                    ) : recentTransactions.length > 0 ? (
                         <div className="space-y-4">
                            {recentTransactions.map(tx => (
                                <div key={tx.id} className="flex justify-between items-center text-sm">
                                    <div>
                                        <p className="font-semibold">{tx.employeeName}</p>
                                        <p className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                    <Badge variant="secondary" className="font-mono">{formatCurrency(tx.amount)} ج.م</Badge>
                                </div>
                            ))}
                         </div>
                    ): (
                        <p className="text-center text-muted-foreground py-10">لا توجد حركات حديثة.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
