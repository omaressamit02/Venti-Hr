'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Wallet, PlusCircle, MinusCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface Employee {
  id: string;
  employeeName: string;
}

interface FinancialTransactionBase {
    id: string;
    employeeId: string;
    amount: number;
    notes?: string;
    date: string;
}

interface Loan extends FinancialTransactionBase {
  type: 'loan';
  installments: number;
  paidAmount: number;
  status: 'active' | 'paid';
}

interface SalaryAdvance extends FinancialTransactionBase {
  type: 'salary_advance';
}

interface Bonus extends FinancialTransactionBase {
  type: 'bonus';
}

interface Penalty extends FinancialTransactionBase {
  type: 'penalty';
}

type AnyTransaction = Loan | SalaryAdvance | Bonus | Penalty;

interface LoanViewModel extends Loan {
    employeeName: string;
    remainingAmount: number;
    progress: number;
}

interface TransactionViewModel extends FinancialTransactionBase {
    employeeName: string;
    type: 'salary_advance' | 'bonus' | 'penalty';
}


export default function FinancialRecordsPage() {
  const db = useDb();
  const [isClient, setIsClient] = useState(false);
  const defaultMonth = format(new Date(), 'yyyy-MM');

  // --- Data Fetching ---
  const transactionsRef = useMemoFirebase(() => db ? ref(db, 'financial_transactions') : null, [db]);
  const [allTransactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, Record<string, AnyTransaction>>>>(transactionsRef);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  // --- State & Filters ---
  const [filters, setFilters] = useState({ 
      loan: { employee: 'all', status: 'all', month: defaultMonth },
      advance: { employee: 'all', month: defaultMonth },
      bonus: { employee: 'all', month: defaultMonth },
      penalty: { employee: 'all', month: defaultMonth },
  });
  
  useEffect(() => { setIsClient(true); }, []);

  // --- Memoized Data Processing ---
  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);
  
  const employeesList = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id }));
  }, [employeesData]);
  
  const { allLoansData, allSalaryAdvances, allBonuses, allPenalties } = useMemo(() => {
    const loans: LoanViewModel[] = [];
    const advances: TransactionViewModel[] = [];
    const bonuses: TransactionViewModel[] = [];
    const penalties: TransactionViewModel[] = [];

    if (allTransactionsData) {
        Object.entries(allTransactionsData).forEach(([employeeId, months]) => {
            if (!months) return;
            Object.values(months).forEach(txs => {
                if(!txs) return;
                Object.entries(txs).forEach(([id, tx]) => {
                    const employeeName = employeesMap.get(employeeId) || 'غير معروف';
                    const baseTx = {
                        ...tx,
                        id,
                        employeeId,
                        employeeName,
                    };

                    switch (tx.type) {
                        case 'loan':
                            const loanTx = baseTx as Loan;
                            const remaining = loanTx.amount - (loanTx.paidAmount || 0);
                            loans.push({
                                ...loanTx,
                                employeeName: employeeName,
                                remainingAmount: remaining,
                                progress: loanTx.amount > 0 ? ((loanTx.paidAmount || 0) / loanTx.amount) * 100 : 0,
                            });
                            break;
                        case 'salary_advance':
                            advances.push(baseTx as TransactionViewModel);
                            break;
                        case 'bonus':
                            bonuses.push(baseTx as TransactionViewModel);
                            break;
                        case 'penalty':
                            penalties.push(baseTx as TransactionViewModel);
                            break;
                    }
                });
            });
        });
    }
    
    const sortByDate = (a: FinancialTransactionBase, b: FinancialTransactionBase) => new Date(b.date).getTime() - new Date(a.date).getTime();

    return {
        allLoansData: loans.sort(sortByDate),
        allSalaryAdvances: advances.sort(sortByDate),
        allBonuses: bonuses.sort(sortByDate),
        allPenalties: penalties.sort(sortByDate),
    };
  }, [allTransactionsData, employeesMap]);

  const filterData = <T extends TransactionViewModel | LoanViewModel>(data: T[], filter: {employee: string, month: string, status?: string}) => {
    return data.filter(item => {
      if (filter.employee !== 'all' && item.employeeId !== filter.employee) return false;
      
      if ('status' in item && filter.status && filter.status !== 'all') {
          const loanItem = item as LoanViewModel;
          if (loanItem.status !== filter.status) return false;
      }
      
      const itemDate = new Date(item.date);
      const filterMonthDate = new Date(filter.month + '-01T00:00:00Z');
      const monthStart = startOfMonth(filterMonthDate);
      const monthEnd = endOfMonth(filterMonthDate);
      if (itemDate < monthStart || itemDate > monthEnd) return false;

      return true;
    });
  }

  const filteredLoans = useMemo(() => filterData(allLoansData, filters.loan), [allLoansData, filters.loan]);
  const filteredAdvances = useMemo(() => filterData(allSalaryAdvances, filters.advance), [allSalaryAdvances, filters.advance]);
  const filteredBonuses = useMemo(() => filterData(allBonuses, filters.bonus), [allBonuses, filters.bonus]);
  const filteredPenalties = useMemo(() => filterData(allPenalties, filters.penalty), [allPenalties, filters.penalty]);


  const totalAdvances = filteredAdvances.reduce((acc, curr) => acc + curr.amount, 0);
  const totalBonuses = filteredBonuses.reduce((acc, curr) => acc + curr.amount, 0);
  const totalPenalties = filteredPenalties.reduce((acc, curr) => acc + curr.amount, 0);
  
  const isLoading = isTransactionsLoading || isEmployeesLoading;

  const formatCurrency = (amount: number) => {
    if (!isClient) return amount;
    return (amount || 0).toLocaleString('ar', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
  };
  
  const months = Array.from({ length: 12 }, (_, i) => {
    return format(subMonths(new Date(), i), 'yyyy-MM');
  });
  
  const handleFilterChange = (tab: 'loan' | 'advance' | 'bonus' | 'penalty', key: string, value: string) => {
      setFilters(prev => ({
          ...prev,
          [tab]: {
              ...prev[tab],
              [key]: value
          }
      }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        السجلات المالية
      </h2>

      <Tabs defaultValue="loans" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="loans">السلف</TabsTrigger>
            <TabsTrigger value="salary_advances">السحب الجزئي</TabsTrigger>
            <TabsTrigger value="bonuses">المكافآت</TabsTrigger>
            <TabsTrigger value="penalties">الجزاءات</TabsTrigger>
        </TabsList>

        {/* Loans Tab */}
        <TabsContent value="loans">
            <Card>
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلترة سجلات السلف</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">الموظف</label>
                        <Select dir="rtl" onValueChange={(v) => handleFilterChange('loan', 'employee', v)} defaultValue="all">
                            <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                            <SelectContent>
                            <SelectItem value="all">كل الموظفين</SelectItem>
                            {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                                employeesList.map((emp) => (<SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>))
                            }
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">حالة السلفة</label>
                        <Select dir="rtl" onValueChange={(v) => handleFilterChange('loan', 'status', v)} defaultValue="all">
                            <SelectTrigger><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">الكل</SelectItem>
                                <SelectItem value="active">نشطة</SelectItem>
                                <SelectItem value="paid">مكتملة</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">الشهر</label>
                        <Select dir="rtl" value={filters.loan.month} onValueChange={(v) => handleFilterChange('loan', 'month', v)}>
                            <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                            <SelectContent>
                            {months.map((month) => (
                                <SelectItem key={month} value={month}>
                                {new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardHeader><CardTitle>قائمة السلف</CardTitle></CardHeader>
                <CardContent>
                    <div className="hidden md:block">
                        <Table>
                        <TableHeader><TableRow>
                            <TableHead className="text-right">اسم الموظف</TableHead>
                            <TableHead className="text-right">تاريخ السلفة</TableHead>
                            <TableHead className="text-left">مبلغ السلفة</TableHead>
                            <TableHead className="text-left">المسدد / الأقساط</TableHead>
                            <TableHead className="text-left">المبلغ المتبقي</TableHead>
                            <TableHead className="text-right w-[150px]">سير السداد</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {isLoading && Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="w-full h-8" /></TableCell></TableRow>)}
                            {!isLoading && filteredLoans.length > 0 ? (filteredLoans.map((loan) => (
                                <TableRow key={loan.id}>
                                <TableCell className="font-medium text-right">{loan.employeeName}</TableCell>
                                <TableCell className="text-right">{new Date(loan.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell className="text-left font-mono">{formatCurrency(loan.amount)} ج.م</TableCell>
                                <TableCell className="text-left font-mono">{formatCurrency(loan.paidAmount || 0)} / {loan.installments}</TableCell>
                                <TableCell className="text-left font-mono font-bold text-red-600">{formatCurrency(loan.remainingAmount)} ج.م</TableCell>
                                <TableCell className="text-right"><Progress value={loan.progress} className="h-2" /><span className="text-xs text-muted-foreground">{Math.round(loan.progress)}%</span></TableCell>
                                <TableCell className="text-right"><Badge variant={loan.status === 'paid' ? 'secondary' : 'outline'}>{loan.status === 'paid' ? 'مكتملة' : 'نشطة'}</Badge></TableCell>
                                </TableRow>
                            ))) : <TableRow><TableCell colSpan={7} className="h-24 text-center">{!isLoading && 'لا توجد بيانات سلف لعرضها.'}</TableCell></TableRow>}
                        </TableBody>
                        </Table>
                    </div>
                    <div className="space-y-4 md:hidden">
                        {isLoading && Array.from({length: 2}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
                        {!isLoading && filteredLoans.length > 0 ? (filteredLoans.map((loan) => (
                            <Card key={loan.id}>
                                <CardHeader className="p-4"><CardTitle className="text-base flex justify-between items-center"><span>{loan.employeeName}</span><Badge variant={loan.status === 'paid' ? 'secondary' : 'outline'}>{loan.status === 'paid' ? 'مكتملة' : 'نشطة'}</Badge></CardTitle></CardHeader>
                                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                                    <div className="flex justify-between items-center"><span className="text-muted-foreground">مبلغ السلفة:</span><span className="font-mono">{formatCurrency(loan.amount)} ج.م</span></div>
                                    <div className="flex justify-between items-center"><span className="text-muted-foreground">المبلغ المتبقي:</span><span className="font-mono font-bold text-red-600">{formatCurrency(loan.remainingAmount)} ج.م</span></div>
                                    <div className="pt-2"><Progress value={loan.progress} className="h-2" /><span className="text-xs text-muted-foreground">{Math.round(loan.progress)}% مكتمل</span></div>
                                </CardContent>
                            </Card>
                        ))) : <div className="h-24 text-center flex items-center justify-center">{!isLoading && 'لا توجد بيانات سلف لعرضها.'}</div>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* Salary Advances Tab */}
        <TabsContent value="salary_advances">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلترة سجلات السحب الجزئي</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">الموظف</label>
                        <Select dir="rtl" onValueChange={(v) => handleFilterChange('advance', 'employee', v)} defaultValue="all">
                            <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الموظفين</SelectItem>
                                {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                                    employeesList.map((emp) => (<SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">الشهر</label>
                         <Select dir="rtl" value={filters.advance.month} onValueChange={(v) => handleFilterChange('advance', 'month', v)}>
                            <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                            <SelectContent>
                            {months.map((month) => (
                                <SelectItem key={month} value={month}>
                                {new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                </CardContent>
            </Card>
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>قائمة السحوبات الجزئية</CardTitle>
                    <div className="pt-4"><div className="flex items-center gap-2 text-lg font-bold"><Wallet className="h-6 w-6 text-primary"/><span>إجمالي المسحوب:</span><span className="text-primary font-mono">{formatCurrency(totalAdvances)} ج.م</span></div></div>
                </CardHeader>
                <CardContent>
                    <div className="hidden md:block">
                        <Table>
                        <TableHeader><TableRow>
                            <TableHead className="text-right">اسم الموظف</TableHead>
                            <TableHead className="text-right">التاريخ والوقت</TableHead>
                            <TableHead className="text-left">المبلغ</TableHead>
                            <TableHead className="text-right">ملاحظات</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {isLoading && Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="w-full h-8" /></TableCell></TableRow>)}
                            {!isLoading && filteredAdvances.length > 0 ? (filteredAdvances.map((advance) => (
                                <TableRow key={advance.id}>
                                <TableCell className="font-medium text-right">{advance.employeeName}</TableCell>
                                <TableCell className="text-right">{new Date(advance.date).toLocaleString('ar-EG')}</TableCell>
                                <TableCell className="text-left font-mono">{formatCurrency(advance.amount)} ج.م</TableCell>
                                <TableCell className="text-right text-muted-foreground">{advance.notes || '-'}</TableCell>
                                </TableRow>
                            ))) : <TableRow><TableCell colSpan={4} className="h-24 text-center">{!isLoading && 'لا توجد بيانات سحب جزئي لعرضها.'}</TableCell></TableRow>}
                        </TableBody>
                        </Table>
                    </div>
                    <div className="space-y-4 md:hidden">
                        {isLoading && Array.from({length: 2}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
                        {!isLoading && filteredAdvances.length > 0 ? (filteredAdvances.map((advance) => (
                            <Card key={advance.id}>
                                <CardHeader className="p-4"><CardTitle className="text-base flex justify-between items-center"><span>{advance.employeeName}</span><Badge variant="secondary" className="font-mono">{formatCurrency(advance.amount)} ج.م</Badge></CardTitle></CardHeader>
                                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                                    <div className="text-xs text-muted-foreground">{new Date(advance.date).toLocaleString('ar-EG')}</div>
                                    {advance.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{advance.notes}</p>}
                                </CardContent>
                            </Card>
                        ))) : <div className="h-24 text-center flex items-center justify-center">{!isLoading && 'لا توجد بيانات سحب جزئي لعرضها.'}</div>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* Bonuses Tab */}
        <TabsContent value="bonuses">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلترة سجلات المكافآت</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">الموظف</label>
                        <Select dir="rtl" onValueChange={(v) => handleFilterChange('bonus', 'employee', v)} defaultValue="all">
                            <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الموظفين</SelectItem>
                                {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                                    employeesList.map((emp) => (<SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">الشهر</label>
                         <Select dir="rtl" value={filters.bonus.month} onValueChange={(v) => handleFilterChange('bonus', 'month', v)}>
                            <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                            <SelectContent>
                            {months.map((month) => (
                                <SelectItem key={month} value={month}>
                                {new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                </CardContent>
            </Card>
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>قائمة المكافآت</CardTitle>
                    <div className="pt-4"><div className="flex items-center gap-2 text-lg font-bold"><PlusCircle className="h-6 w-6 text-green-600"/><span>إجمالي المكافآت:</span><span className="text-green-600 font-mono">{formatCurrency(totalBonuses)} ج.م</span></div></div>
                </CardHeader>
                <CardContent>
                    <div className="hidden md:block">
                        <Table>
                        <TableHeader><TableRow>
                            <TableHead className="text-right">اسم الموظف</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-left">المبلغ</TableHead>
                            <TableHead className="text-right">ملاحظات</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {isLoading && Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="w-full h-8" /></TableCell></TableRow>)}
                            {!isLoading && filteredBonuses.length > 0 ? (filteredBonuses.map((bonus) => (
                                <TableRow key={bonus.id}>
                                <TableCell className="font-medium text-right">{bonus.employeeName}</TableCell>
                                <TableCell className="text-right">{new Date(bonus.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell className="text-left font-mono text-green-600">{formatCurrency(bonus.amount)} ج.م</TableCell>
                                <TableCell className="text-right text-muted-foreground">{bonus.notes || '-'}</TableCell>
                                </TableRow>
                            ))) : <TableRow><TableCell colSpan={4} className="h-24 text-center">{!isLoading && 'لا توجد مكافآت لعرضها.'}</TableCell></TableRow>}
                        </TableBody>
                        </Table>
                    </div>
                     <div className="space-y-4 md:hidden">
                        {isLoading && Array.from({length: 2}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
                        {!isLoading && filteredBonuses.length > 0 ? (filteredBonuses.map((bonus) => (
                            <Card key={bonus.id}>
                                <CardHeader className="p-4"><CardTitle className="text-base flex justify-between items-center"><span>{bonus.employeeName}</span><Badge variant="secondary" className="font-mono bg-green-100 text-green-800">{formatCurrency(bonus.amount)} ج.م</Badge></CardTitle></CardHeader>
                                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                                    <div className="text-xs text-muted-foreground">{new Date(bonus.date).toLocaleString('ar-EG')}</div>
                                    {bonus.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{bonus.notes}</p>}
                                </CardContent>
                            </Card>
                        ))) : <div className="h-24 text-center flex items-center justify-center">{!isLoading && 'لا توجد مكافآت لعرضها.'}</div>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* Penalties Tab */}
        <TabsContent value="penalties">
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلترة سجلات الجزاءات</CardTitle>
                </CardHeader>
                <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">الموظف</label>
                        <Select dir="rtl" onValueChange={(v) => handleFilterChange('penalty', 'employee', v)} defaultValue="all">
                            <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الموظفين</SelectItem>
                                {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                                    employeesList.map((emp) => (<SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <label className="text-sm font-medium">الشهر</label>
                         <Select dir="rtl" value={filters.penalty.month} onValueChange={(v) => handleFilterChange('penalty', 'month', v)}>
                            <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                            <SelectContent>
                            {months.map((month) => (
                                <SelectItem key={month} value={month}>
                                {new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                </CardContent>
            </Card>
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>قائمة الجزاءات</CardTitle>
                    <div className="pt-4"><div className="flex items-center gap-2 text-lg font-bold"><MinusCircle className="h-6 w-6 text-destructive"/><span>إجمالي الجزاءات:</span><span className="text-destructive font-mono">{formatCurrency(totalPenalties)} ج.م</span></div></div>
                </CardHeader>
                <CardContent>
                    <div className="hidden md:block">
                        <Table>
                        <TableHeader><TableRow>
                            <TableHead className="text-right">اسم الموظف</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-left">المبلغ</TableHead>
                            <TableHead className="text-right">ملاحظات</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {isLoading && Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="w-full h-8" /></TableCell></TableRow>)}
                            {!isLoading && filteredPenalties.length > 0 ? (filteredPenalties.map((penalty) => (
                                <TableRow key={penalty.id}>
                                <TableCell className="font-medium text-right">{penalty.employeeName}</TableCell>
                                <TableCell className="text-right">{new Date(penalty.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell className="text-left font-mono text-destructive">{formatCurrency(penalty.amount)} ج.م</TableCell>
                                <TableCell className="text-right text-muted-foreground">{penalty.notes || '-'}</TableCell>
                                </TableRow>
                            ))) : <TableRow><TableCell colSpan={4} className="h-24 text-center">{!isLoading && 'لا توجد جزاءات لعرضها.'}</TableCell></TableRow>}
                        </TableBody>
                        </Table>
                    </div>
                    <div className="space-y-4 md:hidden">
                        {isLoading && Array.from({length: 2}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
                        {!isLoading && filteredPenalties.length > 0 ? (filteredPenalties.map((penalty) => (
                            <Card key={penalty.id}>
                                <CardHeader className="p-4"><CardTitle className="text-base flex justify-between items-center"><span>{penalty.employeeName}</span><Badge variant="destructive" className="font-mono">{formatCurrency(penalty.amount)} ج.م</Badge></CardTitle></CardHeader>
                                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                                    <div className="text-xs text-muted-foreground">{new Date(penalty.date).toLocaleString('ar-EG')}</div>
                                    {penalty.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{penalty.notes}</p>}
                                </CardContent>
                            </Card>
                        ))) : <div className="h-24 text-center flex items-center justify-center">{!isLoading && 'لا توجد جزاءات لعرضها.'}</div>}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
